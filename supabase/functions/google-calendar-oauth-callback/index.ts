// Public GET-only server-side callback for the direct Google OAuth 2.0 flow.
// Google redirects the user's browser here with ?code&state. We validate state,
// exchange the code for tokens, encrypt and persist them, probe Google, ensure
// the secondary calendar, enqueue backfill, then 303 redirect the user back to
// /google-calendar/callback?attempt=<id>&status=ok|error with no secrets in URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ensureSecondaryCalendar,
  exchangeAuthorizationCode,
  fetchGoogleUserinfo,
  GOOGLE_SCOPES,
  missingRequiredScopes,
  probeConnection,
  revokeToken,
} from "../_shared/googleCalendarClient.ts";
import { buildEncryptedTokenColumns } from "../_shared/googleTokenService.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

type AdminClient = ReturnType<typeof admin>;

const SAFE_CODES = new Set([
  "oauth_code_invalid",
  "oauth_code_expired",
  "oauth_state_invalid",
  "oauth_state_expired",
  "oauth_callback_replayed",
  "oauth_client_mismatch",
  "refresh_token_missing",
  "google_unauthorized",
  "google_insufficient_scope",
  "google_api_disabled",
  "google_rate_limited",
  "google_unavailable",
  "calendar_preparation_failed",
  "backfill_failed",
  "request_failed",
]);

// Codes that mean "reconnecting won't help until the user fixes something at Google"
const NON_RECONNECTABLE_CODES = new Set(["google_api_disabled"]);

function safeCallbackCode(error: unknown): string {
  const message = String((error as Error)?.message ?? error);
  if (SAFE_CODES.has(message)) return message;
  if (message === "authorization_expired") return "oauth_state_expired";
  if (message.startsWith("oauth_exchange_failed")) return "oauth_code_invalid";
  if (message === "refresh_token_missing") return "refresh_token_missing";
  if (message.startsWith("google_api:401") || message.startsWith("google_api:403")) return "google_unauthorized";
  if (message.startsWith("google_api:429")) return "google_rate_limited";
  if (/google_api:5\d\d/.test(message)) return "google_unavailable";
  if (message.includes("calendar")) return "calendar_preparation_failed";
  if (message.includes("backfill")) return "backfill_failed";
  return "request_failed";
}

function siteOrigin(): string {
  try {
    return new URL(Deno.env.get("SITE_URL") ?? "https://fenasojagestao.com").origin;
  } catch {
    return "https://fenasojagestao.com";
  }
}

function frontendCallbackUrl(attemptId: string | null, status: "ok" | "error", code?: string): string {
  const url = new URL("/google-calendar/callback", siteOrigin());
  if (attemptId) url.searchParams.set("attempt", attemptId);
  url.searchParams.set("status", status);
  if (code) url.searchParams.set("code", code);
  return url.toString();
}

function redirect303(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function diagnostic(event: string, fields: Record<string, unknown> = {}) {
  console.info(event, fields);
}

function shortUserId(userId: string) {
  return userId.replace(/-/g, "").slice(0, 10);
}

interface OAuthAttempt {
  id: string;
  user_id: string;
  org_id: string;
  status: string;
  provider_state_hash: string | null;
  expires_at: string;
}

async function claimAttemptByState(db: AdminClient, stateHash: string): Promise<OAuthAttempt> {
  const { data, error } = await db.from("google_calendar_oauth_attempts")
    .select("id, user_id, org_id, status, provider_state_hash, expires_at")
    .eq("provider_state_hash", stateHash)
    .eq("status", "waiting_authorization")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("request_failed");
  if (!data) throw new Error("oauth_state_invalid");
  if (Date.parse(data.expires_at) <= Date.now()) throw new Error("oauth_state_expired");

  // Atomic claim to prevent replay.
  const { data: claimed, error: claimError } = await db.from("google_calendar_oauth_attempts").update({
    status: "completing",
  }).eq("id", data.id).eq("status", "waiting_authorization").select("id").maybeSingle();
  if (claimError) throw new Error("request_failed");
  if (!claimed) throw new Error("oauth_callback_replayed");
  return data as OAuthAttempt;
}

async function requireActiveMembership(db: AdminClient, userId: string, orgId: string): Promise<void> {
  const { data, error } = await db.from("org_members")
    .select("user_id")
    .eq("user_id", userId).eq("org_id", orgId).eq("is_active", true)
    .limit(1).maybeSingle();
  if (error) throw new Error("request_failed");
  if (!data) throw new Error("google_unauthorized");
}

async function hasFullAccess(db: AdminClient, userId: string, orgId: string): Promise<boolean> {
  const { data, error } = await db.rpc("has_capability", {
    _user_id: userId, _org_id: orgId, _capability: "full_access",
  });
  if (error) return false;
  return data === true;
}

async function prepareInitialBackfill(
  db: AdminClient,
  userId: string,
  orgId: string,
  generation: string,
): Promise<number> {
  const fullAccess = await hasFullAccess(db, userId, orgId);
  let candidateEventIds: string[] = [];
  if (fullAccess) {
    const { data, error } = await db.from("cronograma_eventos")
      .select("id").eq("org_id", orgId).not("start_date", "is", null);
    if (error) throw new Error("backfill_events_query_failed");
    candidateEventIds = (data ?? []).map((row: { id: string }) => row.id);
  } else {
    const { data: memberships } = await db.from("org_members")
      .select("commission_id")
      .eq("user_id", userId).eq("org_id", orgId).eq("is_active", true)
      .not("commission_id", "is", null);
    const commissionIds = [...new Set(
      (memberships ?? []).map((r: { commission_id: string | null }) => r.commission_id)
        .filter((id): id is string => Boolean(id)),
    )];
    if (commissionIds.length) {
      const { data: links } = await db.from("cronograma_evento_comissoes")
        .select("event_id").eq("org_id", orgId).in("commission_id", commissionIds);
      const linkedIds = [...new Set((links ?? []).map((r: { event_id: string }) => r.event_id))];
      if (linkedIds.length) {
        const { data: events } = await db.from("cronograma_eventos")
          .select("id").eq("org_id", orgId).not("start_date", "is", null).in("id", linkedIds);
        candidateEventIds = (events ?? []).map((row: { id: string }) => row.id);
      }
    }
  }
  const eventIds = [...new Set(candidateEventIds)];

  await db.from("google_sync_outbox").update({ status: "cancelled" })
    .eq("user_id", userId).eq("org_id", orgId)
    .in("status", ["queued", "failed", "in_flight", "dead_letter", "reconnect_required"]);

  await db.from("google_calendar_connections").update({
    backfill_total: eventIds.length,
    backfill_done: 0,
    status: eventIds.length ? "synchronizing" : "connected",
  }).eq("user_id", userId).eq("org_id", orgId).eq("connection_generation", generation);

  for (const eventId of eventIds) {
    await db.rpc("queue_google_sync_for_user", {
      _user_id: userId,
      _org_id: orgId,
      _event_id: eventId,
      _operation: "upsert",
      _payload_hash: null,
      _initial_backfill: true,
    });
  }
  diagnostic("backfill_queued", { user: shortUserId(userId), orgId, total: eventIds.length, access: fullAccess ? "full" : "commission" });
  return eventIds.length;
}

async function triggerGoogleSyncWorker() {
  const workerToken = Deno.env.get("GOOGLE_SYNC_WORKER_TOKEN") ?? "";
  const headers: Record<string, string> = { Authorization: `Bearer ${serviceRoleKey}` };
  if (workerToken) headers["X-Worker-Token"] = workerToken;
  const response = await fetch(`${supabaseUrl}/functions/v1/google-sync-worker`, { method: "POST", headers });
  await response.text().catch(() => undefined);
}

async function markAttemptError(db: AdminClient, attemptId: string, code: string) {
  await db.from("google_calendar_oauth_attempts").update({
    status: "error", error_code: code, consumed_at: new Date().toISOString(),
  }).eq("id", attemptId);
}

async function markConnectionError(db: AdminClient, userId: string, orgId: string, code: string) {
  await db.from("google_calendar_connections").update({
    status: "error", error_code: code, last_error: code, active_oauth_attempt_id: null,
  }).eq("user_id", userId).eq("org_id", orgId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  const url = new URL(req.url);
  const providerError = (url.searchParams.get("error") ?? "").toLowerCase();
  const code = url.searchParams.get("code")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  const db = admin();

  // If Google reported user-facing error/cancel, redirect the SPA callback with a safe code.
  if (providerError) {
    diagnostic("oauth_callback_provider_error", { providerError: providerError.slice(0, 80) });
    const safe = providerError === "access_denied" || providerError === "cancelled"
      ? "authorization_cancelled"
      : "oauth_code_invalid";
    // Try to also cancel the attempt if we can identify it by state.
    if (state) {
      try {
        const stateHash = await sha256(state);
        const { data: attempt } = await db.from("google_calendar_oauth_attempts")
          .select("id, user_id, org_id, status")
          .eq("provider_state_hash", stateHash)
          .in("status", ["waiting_authorization", "completing"])
          .maybeSingle();
        if (attempt) {
          await db.from("google_calendar_oauth_attempts").update({
            status: "cancelled", error_code: safe, consumed_at: new Date().toISOString(),
          }).eq("id", attempt.id);
          await db.from("google_calendar_connections").update({
            status: "disconnected", error_code: safe, last_error: safe, active_oauth_attempt_id: null,
          }).eq("user_id", attempt.user_id).eq("org_id", attempt.org_id).eq("active_oauth_attempt_id", attempt.id);
          return redirect303(frontendCallbackUrl(attempt.id, "error", safe));
        }
      } catch {
        // fall through
      }
    }
    return redirect303(frontendCallbackUrl(null, "error", safe));
  }

  if (!code || !state) {
    return redirect303(frontendCallbackUrl(null, "error", "oauth_state_invalid"));
  }

  let attempt: OAuthAttempt | null = null;
  try {
    const stateHash = await sha256(state);
    attempt = await claimAttemptByState(db, stateHash);
    await requireActiveMembership(db, attempt.user_id, attempt.org_id);

    // Exchange code for tokens (server-side, direct to Google).
    const tokens = await exchangeAuthorizationCode(code);

    // Validate granted scopes BEFORE persisting anything. If the user did not
    // tick the Calendar checkboxes on Google's consent screen, revoke the fresh
    // token and force reconnect with a clear, actionable code.
    const missing = missingRequiredScopes(tokens.scope);
    if (missing.length > 0) {
      diagnostic("google_scopes_insufficient", {
        user: shortUserId(attempt.user_id),
        granted: tokens.scope ?? "",
        missing,
      });
      await revokeToken(tokens.access_token);
      await markAttemptError(db, attempt.id, "google_insufficient_scope");
      await db.from("google_calendar_connections").update({
        status: "reconnect_required",
        error_code: "google_insufficient_scope",
        last_error: "google_insufficient_scope",
        active_oauth_attempt_id: null,
        scopes_granted: (tokens.scope ?? "").split(/\s+/).filter(Boolean),
      }).eq("user_id", attempt.user_id).eq("org_id", attempt.org_id);
      return redirect303(frontendCallbackUrl(attempt.id, "error", "google_insufficient_scope"));
    }

    // Encrypt and persist tokens.
    const columns = await buildEncryptedTokenColumns(
      tokens.access_token,
      tokens.expires_in,
      tokens.refresh_token,
    );

    await db.from("google_calendar_connections").update({
      ...columns,
      status: "preparing_calendar",
      oauth_provider: "google_direct",
      scopes_granted: tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : [...GOOGLE_SCOPES],
      active_oauth_attempt_id: attempt.id,
      error_code: null,
      last_error: null,
    }).eq("user_id", attempt.user_id).eq("org_id", attempt.org_id);

    // Probe Google Calendar API (2xx required).
    const probe = await probeConnection(tokens.access_token);
    if (!probe.ok) {
      diagnostic("google_probe_failed", {
        user: shortUserId(attempt.user_id),
        stage: probe.stage,
        httpStatus: probe.status,
        safeCode: probe.safeCode,
        detail: probe.detail?.slice(0, 200),
      });
      // Roll back the transient "preparing_calendar" status so the UI does not
      // show fake progress; the catch block will mark the final error state.
      await db.from("google_calendar_connections").update({
        status: "error",
      }).eq("user_id", attempt.user_id).eq("org_id", attempt.org_id);
      // Prefer the classified code from the probe body over a raw status map.
      const providerCode = SAFE_CODES.has(probe.safeCode)
        ? probe.safeCode
        : probe.status === 403 ? "google_unauthorized"
        : probe.status === 401 ? "google_unauthorized"
        : probe.status === 429 ? "google_rate_limited"
        : "google_unavailable";
      throw new Error(providerCode);
    }
    diagnostic("google_probe_succeeded", { user: shortUserId(attempt.user_id), attempts: probe.attempts });

    // Read existing secondary_calendar_id (for reuse on reconnect).
    const { data: existingCal } = await db.from("google_calendar_connections")
      .select("secondary_calendar_id")
      .eq("user_id", attempt.user_id).eq("org_id", attempt.org_id).maybeSingle();

    const calendar = await ensureSecondaryCalendar(tokens.access_token, existingCal?.secondary_calendar_id ?? null);
    diagnostic("secondary_calendar_ready", { user: shortUserId(attempt.user_id), disposition: calendar.disposition });

    // Fetch email + sub (best effort).
    const profile = await fetchGoogleUserinfo(tokens.access_token);

    const now = new Date().toISOString();
    const generation = crypto.randomUUID();
    await db.from("google_calendar_connections").update({
      google_email: profile?.email ?? null,
      google_subject: profile?.sub ?? null,
      secondary_calendar_id: calendar.calendarId,
      status: "synchronizing",
      connected_at: now,
      verified_at: now,
      connection_generation: generation,
      error_code: null,
      last_error: null,
    }).eq("user_id", attempt.user_id).eq("org_id", attempt.org_id);

    // Enqueue backfill.
    const backfill = await prepareInitialBackfill(db, attempt.user_id, attempt.org_id, generation);

    // Complete the attempt.
    await db.from("google_calendar_oauth_attempts").update({
      status: "completed",
      consumed_at: now,
      error_code: null,
    }).eq("id", attempt.id);
    await db.from("google_calendar_connections").update({ active_oauth_attempt_id: null })
      .eq("user_id", attempt.user_id).eq("org_id", attempt.org_id);

    if (backfill > 0) triggerGoogleSyncWorker().catch(() => undefined);

    diagnostic("oauth_callback_completed", { user: shortUserId(attempt.user_id), attemptId: attempt.id, backfill });
    return redirect303(frontendCallbackUrl(attempt.id, "ok"));
  } catch (error) {
    const safe = safeCallbackCode(error);
    diagnostic("oauth_callback_failed", {
      attemptId: attempt?.id ?? null,
      errorCode: safe,
      errorMessage: String((error as Error)?.message ?? error).slice(0, 200),
    });
    if (attempt) {
      await markAttemptError(db, attempt.id, safe).catch(() => undefined);
      await markConnectionError(db, attempt.user_id, attempt.org_id, safe).catch(() => undefined);
    }
    return redirect303(frontendCallbackUrl(attempt?.id ?? null, "error", safe));
  }
});
