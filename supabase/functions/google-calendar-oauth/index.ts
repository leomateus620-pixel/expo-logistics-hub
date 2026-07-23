import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  GOOGLE_SCOPES,
  asFinalizedConnectionKey,
  asOAuthExchangeCode,
  callGoogleJson,
  disconnectGoogleConnection,
  ensureSecondaryCalendar,
  exchangeOAuthCode,
  probeConnection,
  startOAuth,
  type FinalizedConnectionKey,
} from "../_shared/googleCalendarGateway.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_ROUTE = "/cronograma-eventos";
const CALLBACK_ROUTE = "/google-calendar/callback";
const ATTEMPT_TTL_MS = 10 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTRACT_VERSION = "2026-07-23.observe";

type AdminClient = ReturnType<typeof admin>;

interface OAuthAttempt {
  id: string;
  user_id: string;
  org_id: string;
  status: string;
  return_origin: string;
  callback_path: string;
  next_path: string;
  provider_state_hash: string | null;
  expires_at: string;
  prior_connection_status: string | null;
  prior_error_code: string | null;
}

interface ConnectionRow {
  user_id: string;
  org_id: string;
  google_email: string | null;
  connection_key: string | null;
  secondary_calendar_id: string | null;
  status: string;
  last_sync_at: string | null;
  error_code: string | null;
  backfill_total: number;
  backfill_done: number;
  connected_at: string | null;
  verified_at: string | null;
  connection_generation: string | null;
  active_oauth_attempt_id: string | null;
  updated_at: string;
}

function admin() {
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

function json(data: Record<string, unknown>, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function shortUserId(userId: string) {
  return userId.replace(/-/g, "").slice(0, 10);
}

function diagnostic(event: string, fields: Record<string, unknown> = {}) {
  console.info(event, fields);
}

function assertDb(error: unknown, code: string) {
  if (error) throw new Error(code);
}

function assertDbRow<T>(data: T | null, error: unknown, code: string): asserts data is T {
  assertDb(error, code);
  if (!data) throw new Error(code);
}

function requireUuid(value: unknown, code: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error(code);
  return value;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function configuredAppOrigin() {
  try {
    return new URL(Deno.env.get("SITE_URL") ?? "https://www.fenasojagestao.com").origin;
  } catch {
    return "https://www.fenasojagestao.com";
  }
}

function allowedReturnOrigins() {
  const origins = new Set([
    configuredAppOrigin(),
    "https://www.fenasojagestao.com",
    "https://fenasojagestao.com",
    "https://id-preview--756eeb64-0d44-4171-b445-f8a60f0492c0.lovable.app",
  ]);
  for (const value of (Deno.env.get("GOOGLE_CALENDAR_ALLOWED_RETURN_ORIGINS") ?? "").split(",")) {
    const candidate = value.trim();
    if (!candidate) continue;
    try {
      origins.add(new URL(candidate).origin);
    } catch {
      console.warn("google_calendar_invalid_configured_return_origin");
    }
  }
  return origins;
}

function isAllowedReturnOrigin(origin: string, allowedOrigins = allowedReturnOrigins()) {
  return allowedOrigins.has(origin);
}

function safeNextPath(raw: string | null | undefined, origin: string) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return APP_ROUTE;
  try {
    const parsed = new URL(raw, origin);
    if (parsed.origin !== origin || parsed.pathname !== APP_ROUTE) return APP_ROUTE;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return APP_ROUTE;
  }
}

export function resolveReturnUrl(req: Request, raw: unknown, attemptId: string) {
  const allowedOrigins = allowedReturnOrigins();
  const requestOrigin = req.headers.get("Origin") ?? "";
  const fallbackOrigin = isAllowedReturnOrigin(requestOrigin, allowedOrigins)
    ? requestOrigin
    : configuredAppOrigin();
  let candidate = new URL(CALLBACK_ROUTE, fallbackOrigin);

  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = new URL(raw);
      if (isAllowedReturnOrigin(parsed.origin, allowedOrigins) && parsed.pathname === CALLBACK_ROUTE) {
        candidate = parsed;
      }
    } catch {
      // The exact allowlisted fallback remains authoritative.
    }
  }

  const nextPath = safeNextPath(candidate.searchParams.get("next"), candidate.origin);
  candidate.search = "";
  candidate.hash = "";
  candidate.searchParams.set("attempt", attemptId);
  candidate.searchParams.set("next", nextPath);
  return {
    url: candidate.toString(),
    origin: candidate.origin,
    callbackPath: CALLBACK_ROUTE,
    nextPath,
  };
}

async function triggerGoogleSyncWorker() {
  const response = await fetch(`${supabaseUrl}/functions/v1/google-sync-worker`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceRoleKey}` },
  });
  await response.text();
  if (!response.ok) console.warn("google_sync_worker_trigger_failed", { status: response.status });
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ") || authHeader.length < 16) {
    throw json({ error: "session_expired" }, { status: 401 });
  }
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw json({ error: "session_expired" }, { status: 401 });
  return user;
}

async function requireActiveOrgMembership(db: AdminClient, userId: string, rawOrgId: unknown) {
  const orgId = requireUuid(rawOrgId, "no_active_organization");
  const { data, error } = await db.from("org_members")
    .select("user_id")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  assertDb(error, "membership_lookup_failed");
  if (!data) throw json({ error: "no_active_organization" }, { status: 403 });
  return orgId;
}

async function hasFullAccess(db: AdminClient, userId: string, orgId: string) {
  const { data, error } = await db.rpc("has_capability", {
    _user_id: userId,
    _org_id: orgId,
    _capability: "full_access",
  });
  assertDb(error, "capability_lookup_failed");
  return data === true;
}

function safeServerError(error: unknown) {
  const message = String((error as Error)?.message ?? error);
  if (message === "callback_replayed") return "callback_replayed";
  if (/^(invalid_callback|oauth_state_mismatch|missing_exchange_code|connector_mismatch)/.test(message)) {
    return "invalid_callback";
  }
  if (message.startsWith("oauth_exchange_failed")) return "authorization_failed";
  if (message === "google_probe_failed") return "authorization_not_confirmed";
  if (message.includes("calendar") || message.includes("google_api")) return "calendar_preparation_failed";
  if (message.includes("backfill")) return "backfill_failed";
  if (message.startsWith("disconnect_failed")) return "provider_unavailable";
  if (message === "authorization_expired") return "authorization_expired";
  return "request_failed";
}

function errorHttpStatus(code: string) {
  if (code === "callback_replayed") return 409;
  if (code === "invalid_callback") return 400;
  if (code === "authorization_expired") return 410;
  if (["authorization_failed", "authorization_not_confirmed"].includes(code)) return 422;
  return 503;
}

async function prepareInitialBackfill(
  db: AdminClient,
  userId: string,
  orgId: string,
  generation: string,
) {
  const fullAccess = await hasFullAccess(db, userId, orgId);
  let candidateEventIds: string[] = [];

  if (fullAccess) {
    const { data, error } = await db.from("cronograma_eventos")
      .select("id")
      .eq("org_id", orgId)
      .not("start_date", "is", null);
    assertDb(error, "backfill_events_query_failed");
    candidateEventIds = (data ?? []).map((row: { id: string }) => row.id);
  } else {
    const { data: memberships, error: membershipError } = await db.from("org_members")
      .select("commission_id")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq("is_active", true)
      .not("commission_id", "is", null);
    assertDb(membershipError, "backfill_memberships_query_failed");
    const commissionIds = [...new Set(
      (memberships ?? [])
        .map((row: { commission_id: string | null }) => row.commission_id)
        .filter((id: string | null): id is string => Boolean(id)),
    )];
    if (commissionIds.length) {
      const { data: links, error: linkError } = await db.from("cronograma_evento_comissoes")
        .select("event_id")
        .eq("org_id", orgId)
        .in("commission_id", commissionIds);
      assertDb(linkError, "backfill_event_links_query_failed");
      const linkedIds = [...new Set((links ?? []).map((row: { event_id: string }) => row.event_id))];
      if (linkedIds.length) {
        const { data: events, error: eventError } = await db.from("cronograma_eventos")
          .select("id")
          .eq("org_id", orgId)
          .not("start_date", "is", null)
          .in("id", linkedIds);
        assertDb(eventError, "backfill_events_query_failed");
        candidateEventIds = (events ?? []).map((row: { id: string }) => row.id);
      }
    }
  }

  const eventIds = [...new Set(candidateEventIds)];
  const { error: cancelError } = await db.from("google_sync_outbox").update({ status: "cancelled" })
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .in("status", ["queued", "failed", "in_flight", "dead_letter", "reconnect_required"]);
  assertDb(cancelError, "backfill_previous_generation_cancel_failed");

  const { data: progress, error: progressError } = await db.from("google_calendar_connections").update({
    backfill_total: eventIds.length,
    backfill_done: 0,
    status: eventIds.length ? "synchronizing" : "connected",
  }).eq("user_id", userId).eq("org_id", orgId).eq("connection_generation", generation)
    .select("user_id").maybeSingle();
  assertDbRow(progress, progressError, "backfill_progress_update_failed");

  for (const eventId of eventIds) {
    const { error: outboxError } = await db.rpc("queue_google_sync_for_user", {
      _user_id: userId,
      _org_id: orgId,
      _event_id: eventId,
      _operation: "upsert",
      _payload_hash: null,
      _initial_backfill: true,
    });
    assertDb(outboxError, "backfill_enqueue_failed");
  }

  diagnostic("backfill_queued", {
    user: shortUserId(userId),
    orgId,
    total: eventIds.length,
    access: fullAccess ? "full" : "commission",
  });
  return eventIds.length;
}

async function finalizeAuthorizedConnection(
  db: AdminClient,
  userId: string,
  orgId: string,
  attemptId: string,
  connectionKey: FinalizedConnectionKey,
  existingCalendarId: string | null,
) {
  if (!await probeConnection(connectionKey)) throw new Error("google_probe_failed");
  diagnostic("google_probe_succeeded", { user: shortUserId(userId), orgId, httpStatus: 200 });

  const { data: preparing, error: preparingError } = await db.from("google_calendar_connections").update({
    status: "preparing_calendar",
    connection_key: connectionKey,
    error_code: null,
    last_error: null,
  }).eq("user_id", userId).eq("org_id", orgId).eq("active_oauth_attempt_id", attemptId)
    .select("user_id").maybeSingle();
  assertDbRow(preparing, preparingError, "connection_preparing_update_failed");

  const calendar = await ensureSecondaryCalendar(connectionKey, existingCalendarId);
  diagnostic("secondary_calendar_ready", {
    user: shortUserId(userId),
    orgId,
    disposition: calendar.disposition,
  });

  let email: string | null = null;
  try {
    const profile = await callGoogleJson<{ email?: string }>(connectionKey, "/oauth2/v2/userinfo");
    email = typeof profile.email === "string" ? profile.email : null;
  } catch {
    // Profile metadata is optional; Calendar verification remains authoritative.
  }

  const now = new Date().toISOString();
  const generation = crypto.randomUUID();
  const { data: connected, error: connectedError } = await db.from("google_calendar_connections").update({
    google_email: email,
    connection_key: connectionKey,
    secondary_calendar_id: calendar.calendarId,
    status: "synchronizing",
    scopes_granted: [...GOOGLE_SCOPES],
    connected_at: now,
    verified_at: now,
    connection_generation: generation,
    error_code: null,
    last_error: null,
  }).eq("user_id", userId).eq("org_id", orgId).eq("active_oauth_attempt_id", attemptId)
    .select("user_id").maybeSingle();
  assertDbRow(connected, connectedError, "connection_verified_update_failed");

  const backfill = await prepareInitialBackfill(db, userId, orgId, generation);
  const { data: completedAttempt, error: attemptError } = await db.from("google_calendar_oauth_attempts").update({
    status: "completed",
    consumed_at: now,
    error_code: null,
  }).eq("id", attemptId).eq("user_id", userId).eq("status", "completing")
    .select("id").maybeSingle();
  assertDbRow(completedAttempt, attemptError, "attempt_completion_update_failed");

  const { data: clearedConnection, error: clearAttemptError } = await db.from("google_calendar_connections").update({
    active_oauth_attempt_id: null,
  }).eq("user_id", userId).eq("org_id", orgId).eq("active_oauth_attempt_id", attemptId)
    .select("user_id").maybeSingle();
  assertDbRow(clearedConnection, clearAttemptError, "connection_attempt_clear_failed");

  if (backfill > 0) await triggerGoogleSyncWorker().catch(() => undefined);
  return { calendarId: calendar.calendarId, backfill, generation };
}

async function readAttempt(db: AdminClient, attemptId: string, userId: string) {
  const { data, error } = await db.from("google_calendar_oauth_attempts")
    .select("id, user_id, org_id, status, return_origin, callback_path, next_path, provider_state_hash, expires_at, prior_connection_status, prior_error_code")
    .eq("id", attemptId)
    .eq("user_id", userId)
    .maybeSingle();
  assertDb(error, "attempt_lookup_failed");
  if (!data) throw new Error("invalid_callback");
  return data as OAuthAttempt;
}

async function cancelAttempt(db: AdminClient, userId: string, attemptId: string) {
  const attempt = await readAttempt(db, attemptId, userId);
  if (!["starting", "waiting_authorization"].includes(attempt.status)) return false;
  const now = new Date().toISOString();
  const { error: attemptError } = await db.from("google_calendar_oauth_attempts").update({
    status: "cancelled",
    consumed_at: now,
    error_code: "authorization_cancelled",
  }).eq("id", attempt.id).eq("user_id", userId).in("status", ["starting", "waiting_authorization"]);
  assertDb(attemptError, "attempt_cancel_failed");

  const restoredStatus = attempt.prior_connection_status && attempt.prior_connection_status !== "starting"
    ? attempt.prior_connection_status
    : "disconnected";
  const { error: connectionError } = await db.from("google_calendar_connections").update({
    status: restoredStatus,
    error_code: attempt.prior_error_code,
    last_error: attempt.prior_error_code,
    active_oauth_attempt_id: null,
  }).eq("user_id", userId).eq("org_id", attempt.org_id).eq("active_oauth_attempt_id", attempt.id);
  assertDb(connectionError, "connection_cancel_restore_failed");
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "request_failed" }, { status: 405 });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const user = await requireUser(req);
    const db = admin();

    if (action === "start") {
      const orgId = await requireActiveOrgMembership(db, user.id, body.orgId);
      const attemptId = crypto.randomUUID();
      const returnTarget = resolveReturnUrl(req, body.returnUrl, attemptId);
      const { data: existing, error: existingError } = await db.from("google_calendar_connections")
        .select("status, error_code")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .maybeSingle();
      assertDb(existingError, "connection_lookup_failed");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ATTEMPT_TTL_MS).toISOString();

      const { error: oldAttemptError } = await db.from("google_calendar_oauth_attempts").update({
        status: "expired",
        consumed_at: now.toISOString(),
        error_code: "authorization_superseded",
      }).eq("user_id", user.id).eq("org_id", orgId).in("status", ["starting", "waiting_authorization"]);
      assertDb(oldAttemptError, "previous_attempt_expire_failed");

      const { error: attemptInsertError } = await db.from("google_calendar_oauth_attempts").insert({
        id: attemptId,
        user_id: user.id,
        org_id: orgId,
        status: "starting",
        return_origin: returnTarget.origin,
        callback_path: returnTarget.callbackPath,
        next_path: returnTarget.nextPath,
        expires_at: expiresAt,
        prior_connection_status: existing?.status ?? null,
        prior_error_code: existing?.error_code ?? null,
      });
      assertDb(attemptInsertError, "attempt_insert_failed");

      const { error: startingError } = await db.from("google_calendar_connections").upsert({
        user_id: user.id,
        org_id: orgId,
        status: "starting",
        error_code: null,
        last_error: null,
        active_oauth_attempt_id: attemptId,
      }, { onConflict: "user_id" });
      assertDb(startingError, "connection_start_update_failed");
      diagnostic("oauth_start_started", { user: shortUserId(user.id), orgId, attemptId });

      try {
        const oauth = await startOAuth(returnTarget.url, user.id);
        const { error: attemptUpdateError } = await db.from("google_calendar_oauth_attempts").update({
          status: "waiting_authorization",
          oauth_session_id_hash: await sha256(oauth.sessionId),
          provider_state_hash: await sha256(oauth.state),
        }).eq("id", attemptId).eq("user_id", user.id).eq("status", "starting");
        assertDb(attemptUpdateError, "attempt_waiting_update_failed");
        const { error: waitingError } = await db.from("google_calendar_connections").update({
          status: "waiting_authorization",
        }).eq("user_id", user.id).eq("org_id", orgId).eq("active_oauth_attempt_id", attemptId);
        assertDb(waitingError, "connection_waiting_update_failed");
        diagnostic("oauth_start_succeeded", {
          user: shortUserId(user.id),
          orgId,
          attemptId,
          httpStatus: 200,
          responseFields: oauth.responseFields,
        });
        return json({ authorization_url: oauth.authorizationUrl, attempt_id: attemptId, expires_at: expiresAt, contract_version: CONTRACT_VERSION });
      } catch (error) {
        const code = safeServerError(error);
        await db.from("google_calendar_oauth_attempts").update({ status: "error", error_code: code })
          .eq("id", attemptId).eq("user_id", user.id);
        await db.from("google_calendar_connections").update({
          status: "error",
          error_code: code,
          last_error: code,
          active_oauth_attempt_id: null,
        }).eq("user_id", user.id).eq("org_id", orgId).eq("active_oauth_attempt_id", attemptId);
        throw error;
      }
    }

    if (action === "observe_callback") {
      // Evidence gate: record sanitized metadata about what the connector
      // gateway actually returned to the callback. Never accept raw values.
      const rawObs = (body.observation && typeof body.observation === "object")
        ? body.observation as Record<string, unknown>
        : {};
      const paramNamesInput = Array.isArray(rawObs.params) ? rawObs.params : [];
      const params = paramNamesInput.slice(0, 32).map((entry) => {
        const item = (entry && typeof entry === "object") ? entry as Record<string, unknown> : {};
        const name = typeof item.name === "string" ? item.name.slice(0, 64) : "";
        const length = typeof item.length === "number" && Number.isFinite(item.length)
          ? Math.max(0, Math.min(4096, Math.floor(item.length)))
          : 0;
        return { name, length };
      }).filter((p) => p.name);
      const observation = {
        contract_version: CONTRACT_VERSION,
        client_contract_version: typeof rawObs.contract_version === "string" ? String(rawObs.contract_version).slice(0, 64) : null,
        transport: typeof rawObs.transport === "string" ? String(rawObs.transport).slice(0, 16) : "query",
        route: typeof rawObs.route === "string" ? String(rawObs.route).slice(0, 128) : null,
        has_code: Boolean(rawObs.hasCode),
        has_state: Boolean(rawObs.hasState),
        has_attempt: Boolean(rawObs.hasAttempt),
        has_error: Boolean(rawObs.hasError),
        params,
        observed_at: new Date().toISOString(),
      };
      const { data: activeAttempt, error: activeError } = await db.from("google_calendar_oauth_attempts")
        .select("id, user_id, callback_observation")
        .eq("user_id", user.id)
        .in("status", ["waiting_authorization", "starting", "completing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      assertDb(activeError, "observation_lookup_failed");
      if (activeAttempt) {
        const prior = Array.isArray((activeAttempt.callback_observation as { history?: unknown } | null)?.history)
          ? ((activeAttempt.callback_observation as { history: unknown[] }).history)
          : [];
        const merged = { latest: observation, history: [...prior, observation].slice(-10) };
        await db.from("google_calendar_oauth_attempts")
          .update({ callback_observation: merged })
          .eq("id", activeAttempt.id)
          .eq("user_id", user.id);
      }
      diagnostic("oauth_callback_observed", {
        user: shortUserId(user.id),
        attemptId: activeAttempt?.id ?? null,
        transport: observation.transport,
        hasCode: observation.has_code,
        hasState: observation.has_state,
        hasAttempt: observation.has_attempt,
        hasError: observation.has_error,
        paramCount: params.length,
        paramNames: params.map((p) => p.name),
      });
      return json({ ok: true, contract_version: CONTRACT_VERSION });
    }

    if (action === "complete") {
      const rawAttemptId = typeof body.attemptId === "string" && UUID_PATTERN.test(body.attemptId)
        ? body.attemptId
        : null;
      const rawCallbackPath = typeof body.callbackPath === "string" ? body.callbackPath : "";
      const callbackPath = rawCallbackPath === CALLBACK_ROUTE || rawCallbackPath === ""
        ? CALLBACK_ROUTE
        : "";
      const state = typeof body.state === "string" ? body.state.trim() : "";
      if (!state) throw new Error("invalid_callback");
      const exchangeCode = asOAuthExchangeCode(body.code);
      const stateHash = await sha256(state);

      // Resolve the attempt. Prefer the explicit attemptId when the callback
      // preserved it, but fall back to a lookup by provider_state_hash when the
      // Lovable connector gateway stripped our custom query params from the
      // return_url.
      let attempt: OAuthAttempt;
      if (rawAttemptId) {
        attempt = await readAttempt(db, rawAttemptId, user.id);
      } else {
        const { data, error } = await db.from("google_calendar_oauth_attempts")
          .select("id, user_id, org_id, status, return_origin, callback_path, next_path, provider_state_hash, expires_at, prior_connection_status, prior_error_code")
          .eq("user_id", user.id)
          .eq("provider_state_hash", stateHash)
          .eq("status", "waiting_authorization")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        assertDb(error, "attempt_lookup_failed");
        if (!data) throw new Error("invalid_callback");
        attempt = data as OAuthAttempt;
      }
      const attemptId = attempt.id;

      diagnostic("oauth_callback_received", {
        user: shortUserId(user.id),
        attemptId,
        viaState: !rawAttemptId,
      });

      await requireActiveOrgMembership(db, user.id, attempt.org_id);

      // The Lovable connector gateway may perform a top-level navigation whose
      // Origin header is not sent by the browser; only enforce the origin when
      // it is present. The callback path we validated against is authoritative.
      const requestOrigin = req.headers.get("Origin");
      if (requestOrigin && requestOrigin !== attempt.return_origin) {
        throw new Error("invalid_callback");
      }
      if (callbackPath !== attempt.callback_path) {
        throw new Error("invalid_callback");
      }
      if (Date.parse(attempt.expires_at) <= Date.now()) throw new Error("authorization_expired");
      if (!attempt.provider_state_hash || stateHash !== attempt.provider_state_hash) {
        throw new Error("oauth_state_mismatch");
      }
      if (attempt.status !== "waiting_authorization") {
        throw new Error(attempt.status === "completed" || attempt.status === "completing"
          ? "callback_replayed"
          : "invalid_callback");
      }


      const codeHash = await sha256(exchangeCode);
      const { data: claimed, error: claimError } = await db.from("google_calendar_oauth_attempts").update({
        status: "completing",
        exchange_code_hash: codeHash,
      }).eq("id", attemptId)
        .eq("user_id", user.id)
        .eq("status", "waiting_authorization")
        .eq("provider_state_hash", attempt.provider_state_hash)
        .select("id")
        .maybeSingle();
      assertDb(claimError, "attempt_claim_failed");
      if (!claimed) throw new Error("callback_replayed");
      diagnostic("oauth_completion_pending", { user: shortUserId(user.id), orgId: attempt.org_id, attemptId });

      const { data: connection, error: connectionError } = await db.from("google_calendar_connections").update({
        status: "completing",
        error_code: null,
        last_error: null,
      }).eq("user_id", user.id)
        .eq("org_id", attempt.org_id)
        .eq("active_oauth_attempt_id", attemptId)
        .select("secondary_calendar_id")
        .maybeSingle();
      assertDb(connectionError, "connection_completion_claim_failed");
      if (!connection) throw new Error("invalid_callback");

      try {
        const exchanged = await exchangeOAuthCode(exchangeCode);
        diagnostic("connection_key_retrieved", {
          user: shortUserId(user.id),
          orgId: attempt.org_id,
          attemptId,
          httpStatus: 200,
          responseFields: exchanged.responseFields,
        });
        const { data: keyStored, error: keyStoreError } = await db.from("google_calendar_connections").update({
          connection_key: exchanged.connectionKey,
        }).eq("user_id", user.id).eq("org_id", attempt.org_id).eq("active_oauth_attempt_id", attemptId)
          .select("user_id").maybeSingle();
        assertDbRow(keyStored, keyStoreError, "connection_key_store_failed");

        const finalized = await finalizeAuthorizedConnection(
          db,
          user.id,
          attempt.org_id,
          attemptId,
          exchanged.connectionKey,
          connection.secondary_calendar_id,
        );
        return json({ ok: true, calendarId: finalized.calendarId, backfill: finalized.backfill });
      } catch (error) {
        const code = safeServerError(error);
        await db.from("google_calendar_oauth_attempts").update({ status: "error", error_code: code })
          .eq("id", attemptId).eq("user_id", user.id).eq("status", "completing");
        await db.from("google_calendar_connections").update({
          status: "error",
          error_code: code,
          last_error: code,
          active_oauth_attempt_id: null,
        }).eq("user_id", user.id).eq("org_id", attempt.org_id).eq("active_oauth_attempt_id", attemptId);
        diagnostic("oauth_completion_failed", {
          user: shortUserId(user.id),
          orgId: attempt.org_id,
          attemptId,
          errorCode: code,
        });
        throw error;
      }
    }

    if (action === "cancel" || action === "reset") {
      const attemptId = typeof body.attemptId === "string" && UUID_PATTERN.test(body.attemptId)
        ? body.attemptId
        : null;
      if (attemptId) await cancelAttempt(db, user.id, attemptId);
      return json({ ok: true });
    }

    if (action === "retry") {
      const orgId = await requireActiveOrgMembership(db, user.id, body.orgId);
      const { data: connection, error: connectionError } = await db.from("google_calendar_connections")
        .select("status, connection_generation")
        .eq("user_id", user.id).eq("org_id", orgId).maybeSingle();
      assertDb(connectionError, "connection_lookup_failed");
      if (!connection || !["connected", "synchronizing"].includes(connection.status) || !connection.connection_generation) {
        return json({ error: "authorization_failed" }, { status: 409 });
      }
      const { data: retried, error: retryError } = await db.from("google_sync_outbox").update({
        status: "queued",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
        last_error: null,
      }).eq("user_id", user.id)
        .eq("org_id", orgId)
        .eq("connection_generation", connection.connection_generation)
        .in("status", ["failed", "dead_letter"])
        .select("id");
      assertDb(retryError, "retry_update_failed");
      if (retried?.length) await triggerGoogleSyncWorker().catch(() => undefined);
      return json({ ok: true, retried: retried?.length ?? 0 });
    }

    if (action === "disconnect") {
      const orgId = await requireActiveOrgMembership(db, user.id, body.orgId);
      const { data: connection, error: connectionError } = await db.from("google_calendar_connections")
        .select("connection_key, status")
        .eq("user_id", user.id).eq("org_id", orgId).maybeSingle();
      assertDb(connectionError, "connection_lookup_failed");
      if (!connection) return json({ ok: true, idempotent: true });
      const previousStatus = connection.status;
      await db.from("google_calendar_connections").update({ status: "disconnecting" })
        .eq("user_id", user.id).eq("org_id", orgId);
      try {
        if (connection.connection_key) {
          const key = asFinalizedConnectionKey(connection.connection_key);
          if (await probeConnection(key)) await disconnectGoogleConnection(key);
        }
      } catch (error) {
        await db.from("google_calendar_connections").update({
          status: previousStatus,
          error_code: "provider_unavailable",
          last_error: "provider_unavailable",
        }).eq("user_id", user.id).eq("org_id", orgId);
        throw error;
      }
      await db.from("google_sync_outbox").update({ status: "cancelled" })
        .eq("user_id", user.id).eq("org_id", orgId)
        .in("status", ["queued", "failed", "in_flight", "dead_letter", "reconnect_required"]);
      await db.from("google_calendar_oauth_attempts").update({
        status: "cancelled",
        consumed_at: new Date().toISOString(),
        error_code: "connection_disconnected",
      }).eq("user_id", user.id).eq("org_id", orgId).in("status", ["starting", "waiting_authorization"]);
      const { error: deleteError } = await db.from("google_calendar_connections")
        .delete().eq("user_id", user.id).eq("org_id", orgId);
      assertDb(deleteError, "connection_delete_failed");
      return json({ ok: true });
    }

    if (action === "status") {
      const orgId = await requireActiveOrgMembership(db, user.id, body.orgId);
      const { data: connectionData, error: connectionError } = await db.from("google_calendar_connections")
        .select("user_id, org_id, google_email, secondary_calendar_id, status, last_sync_at, error_code, backfill_total, backfill_done, connected_at, verified_at, connection_generation, active_oauth_attempt_id, updated_at")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .maybeSingle();
      assertDb(connectionError, "connection_lookup_failed");
      const connection = connectionData as ConnectionRow | null;

      if (connection?.active_oauth_attempt_id && ["starting", "waiting_authorization"].includes(connection.status)) {
        const { data: activeAttempt } = await db.from("google_calendar_oauth_attempts")
          .select("expires_at")
          .eq("id", connection.active_oauth_attempt_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (activeAttempt && Date.parse(activeAttempt.expires_at) <= Date.now()) {
          await db.from("google_calendar_oauth_attempts").update({
            status: "expired",
            consumed_at: new Date().toISOString(),
            error_code: "authorization_expired",
          }).eq("id", connection.active_oauth_attempt_id).in("status", ["starting", "waiting_authorization"]);
          await db.from("google_calendar_connections").update({
            status: "error",
            error_code: "authorization_expired",
            last_error: "authorization_expired",
            active_oauth_attempt_id: null,
          }).eq("user_id", user.id).eq("org_id", orgId).eq("active_oauth_attempt_id", connection.active_oauth_attempt_id);
          connection.status = "error";
          connection.error_code = "authorization_expired";
          connection.active_oauth_attempt_id = null;
        }
      }

      if (connection?.status === "connected" && (!connection.secondary_calendar_id || !connection.verified_at)) {
        await db.from("google_calendar_connections").update({
          status: "error",
          error_code: "calendar_not_verified",
          last_error: "calendar_not_verified",
        }).eq("user_id", user.id).eq("org_id", orgId).eq("status", "connected");
        connection.status = "error";
        connection.error_code = "calendar_not_verified";
      }

      const { data: outboxRows, error: outboxError } = await db.from("google_sync_outbox")
        .select("status")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .in("status", ["queued", "failed", "in_flight", "dead_letter", "reconnect_required"]);
      assertDb(outboxError, "outbox_status_lookup_failed");
      const counts = { queued: 0, inFlight: 0, failed: 0, deadLetter: 0, reconnectRequired: 0 };
      for (const row of outboxRows ?? []) {
        if (row.status === "queued") counts.queued += 1;
        else if (row.status === "in_flight") counts.inFlight += 1;
        else if (row.status === "failed") counts.failed += 1;
        else if (row.status === "dead_letter") counts.deadLetter += 1;
        else if (row.status === "reconnect_required") counts.reconnectRequired += 1;
      }
      const safeConnection = connection ? {
        user_id: connection.user_id,
        org_id: connection.org_id,
        google_email: connection.google_email,
        secondary_calendar_id: connection.secondary_calendar_id,
        status: connection.status,
        last_sync_at: connection.last_sync_at,
        error_code: connection.error_code,
        backfill_total: connection.backfill_total,
        backfill_done: connection.backfill_done,
        connected_at: connection.connected_at,
        verified_at: connection.verified_at,
      } : null;
      return json({
        connection: safeConnection,
        pending: counts.queued + counts.inFlight + counts.failed,
        outbox: counts,
      });
    }

    return json({ error: "request_failed" }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    const code = safeServerError(error);
    console.error("google_calendar_oauth_failed", { errorCode: code });
    return json({ error: code }, { status: errorHttpStatus(code) });
  }
});
