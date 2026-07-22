import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  callGoogleJson,
  ensureSecondaryCalendar,
  extractConnectionKey,
  probeConnection,
  startOAuth,
} from "../_shared/googleCalendarGateway.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_ROUTE = "/cronograma-eventos";
const CALLBACK_ROUTE = "/google-calendar/callback";
const STALE_AUTHORIZATION_MS = 4 * 60 * 1000;
const RECOVERABLE_AUTHORIZATION_ERRORS = new Set(["authorization_not_confirmed", "no_connection", "calendar_id_missing"]);

function admin() {
  return createClient(supabaseUrl, service, { auth: { persistSession: false } });
}

function json(data: Record<string, unknown>, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function configuredAppOrigin() {
  try {
    return new URL(Deno.env.get("SITE_URL") ?? "https://fenasojagestao.com").origin;
  } catch {
    return "https://fenasojagestao.com";
  }
}

function allowedReturnOrigins() {
  const origins = new Set([configuredAppOrigin()]);
  const configuredExtras = Deno.env.get("GOOGLE_CALENDAR_ALLOWED_RETURN_ORIGINS") ?? "";
  for (const value of configuredExtras.split(",")) {
    const candidate = value.trim();
    if (!candidate) continue;
    try {
      origins.add(new URL(candidate).origin);
    } catch {
      console.warn("google_calendar_ignored_invalid_return_origin");
    }
  }
  return origins;
}

function isAllowedReturnOrigin(origin: string, allowedOrigins: Set<string>) {
  if (allowedOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return false;
    if (url.hostname === "fenasojagestao.com" || url.hostname === "www.fenasojagestao.com") return true;
    return url.hostname.endsWith(".lovable.app");
  } catch {
    return false;
  }
}

export function resolveReturnUrl(req: Request, raw?: string) {
  const requestOrigin = req.headers.get("Origin");
  const allowedOrigins = allowedReturnOrigins();
  const fallbackOrigin = requestOrigin && isAllowedReturnOrigin(requestOrigin, allowedOrigins)
    ? requestOrigin
    : configuredAppOrigin();
  const fallback = new URL(CALLBACK_ROUTE, fallbackOrigin);
  fallback.searchParams.set("google", "connected");
  fallback.searchParams.set("next", APP_ROUTE);
  if (!raw) return fallback.toString();

  try {
    const parsed = new URL(raw);
    if (!isAllowedReturnOrigin(parsed.origin, allowedOrigins) || parsed.pathname !== CALLBACK_ROUTE) return fallback.toString();
    const next = parsed.searchParams.get("next") ?? APP_ROUTE;
    try {
      const parsedNext = new URL(next, parsed.origin);
      if (parsedNext.origin !== parsed.origin || parsedNext.pathname !== APP_ROUTE) {
        parsed.searchParams.set("next", APP_ROUTE);
      }
    } catch {
      parsed.searchParams.set("next", APP_ROUTE);
    }
    for (const key of ["google_error", "error", "error_description", "code", "state", "scope"]) parsed.searchParams.delete(key);
    parsed.searchParams.set("google", "connected");
    return parsed.toString();
  } catch {
    return fallback.toString();
  }
}

async function triggerGoogleSyncWorker() {
  if (!service) return;
  const response = await fetch(`${supabaseUrl}/functions/v1/google-sync-worker`, {
    method: "POST",
    headers: { Authorization: `Bearer ${service}` },
  });
  await response.text();
  if (!response.ok) console.warn("google_sync_worker_trigger_failed", { status: response.status });
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ") || authHeader.length < 16) {
    throw json({ error: "session_expired" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw json({ error: "session_expired" }, { status: 401 });
  return user;
}

async function requireActiveOrgMembership(db: ReturnType<typeof admin>, userId: string, orgId: unknown) {
  if (typeof orgId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orgId)) {
    throw json({ error: "no_active_organization" }, { status: 400 });
  }
  const { data } = await db.from("org_members")
    .select("user_id")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!data) throw json({ error: "no_active_organization" }, { status: 403 });
  return orgId;
}

function connectionErrorCode(lastError: unknown) {
  const message = String(lastError ?? "").toLowerCase();
  if (message.includes("missing_connection_key")) return "authorization_not_confirmed";
  if (message.includes(":401:") || message.includes("unauthorized") || message.includes("revoked")) {
    return "authorization_revoked";
  }
  if (message.includes("no_connection") || message.includes("authorization_not_confirmed")) return "authorization_not_confirmed";
  if (message) return "sync_failed";
  return null;
}

function safeServerError(error: unknown) {
  const message = String((error as Error)?.message ?? error);
  if (message.includes("oauth_start_failed")) return "request_failed";
  if (message.includes("Missing env")) return "request_failed";
  return "request_failed";
}

function redactConnectionSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactConnectionSecrets);
  if (!value || typeof value !== "object") return value;
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (["connection_key", "connectionKey", "connection_api_key", "connectionApiKey", "app_user_connection_key", "appUserConnectionKey"].includes(key)) continue;
    redacted[key] = redactConnectionSecrets(entry);
  }
  return redacted;
}

async function prepareInitialBackfill(
  db: ReturnType<typeof admin>,
  userId: string,
  orgId: string,
  generation: string,
  completedCount: number,
) {
  const { data: memberships, error: membershipsError } = await db.from("org_members")
    .select("commission_id")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .not("commission_id", "is", null);
  if (membershipsError) throw new Error("backfill_memberships_query_failed");

  const commissionIds = [...new Set(
    ((memberships ?? []) as Array<{ commission_id: string | null }>)
      .map((row) => row.commission_id)
      .filter((id): id is string => Boolean(id)),
  )];
  const { data: eventLinks, error: eventLinksError } = commissionIds.length
    ? await db.from("cronograma_evento_comissoes")
      .select("event_id")
      .eq("org_id", orgId)
      .in("commission_id", commissionIds)
    : { data: [], error: null };
  if (eventLinksError) throw new Error("backfill_events_query_failed");

  const eventIds = [...new Set(
    ((eventLinks ?? []) as Array<{ event_id: string | null }>)
      .map((row) => row.event_id)
      .filter((id): id is string => Boolean(id)),
  )];
  const generationKey = generation.replace(/[^0-9]/g, "").slice(0, 20) || "0";
  const rows = eventIds.map((eventId) => ({
    user_id: userId,
    org_id: orgId,
    event_id: eventId,
    operation: "upsert",
    dedupe_key: `${userId}|${eventId}|upsert|backfill|${generationKey}`,
    is_initial_backfill: true,
  }));

  // Publica o total antes da fila, evitando que um worker rápido perca o
  // primeiro incremento. Em uma retomada, o progresso já concluído é mantido.
  const { error: progressError } = await db.from("google_calendar_connections").update({
    backfill_total: rows.length,
    backfill_done: Math.min(Math.max(completedCount, 0), rows.length),
  }).eq("user_id", userId);
  if (progressError) throw new Error("backfill_progress_update_failed");

  if (rows.length) {
    const { error: outboxError } = await db.from("google_sync_outbox").upsert(rows, {
      onConflict: "dedupe_key",
      ignoreDuplicates: true,
    });
    if (outboxError) throw new Error("backfill_enqueue_failed");
  }
  return rows.length;
}

async function finalizeAuthorizedConnection(
  db: ReturnType<typeof admin>,
  userId: string,
  orgId: string,
  connectionKey: string | null,
  existingCalendarId?: string | null,
  completedCount = 0,
) {
  const authorized = await probeConnection(connectionKey);
  if (!authorized) return null;

  const calendarId = await ensureSecondaryCalendar(connectionKey!, existingCalendarId);
  let email: string | null = null;
  try {
    const profile = await callGoogleJson<{ email?: string }>(connectionKey!, "/oauth2/v2/userinfo");
    email = profile.email ?? null;
  } catch {
    // O e-mail é metadado opcional e não bloqueia a conexão.
  }

  const connectedAt = new Date().toISOString();
  await db.from("google_calendar_connections").upsert({
    user_id: userId,
    org_id: orgId,
    google_email: email,
    connection_key: connectionKey,
    secondary_calendar_id: calendarId,
    status: "connected",
    scopes_granted: ["calendar", "calendar.events", "userinfo.email", "userinfo.profile"],
    connected_at: connectedAt,
    last_error: null,
    updated_at: connectedAt,
  }, { onConflict: "user_id" });

  const backfill = await prepareInitialBackfill(db, userId, orgId, connectedAt, completedCount);
  if (backfill > 0) await triggerGoogleSyncWorker().catch(() => undefined);
  return { calendarId, backfill, connectedAt };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "request_failed" }, { status: 405 });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = (body as { action?: string }).action;
    const user = await requireUser(req);
    const db = admin();

    if (action === "start") {
      const orgId = await requireActiveOrgMembership(db, user.id, (body as { orgId?: string }).orgId);
      const returnUrl = resolveReturnUrl(req, (body as { returnUrl?: string }).returnUrl);
      const oauth = await startOAuth(returnUrl, user.id);
      const connectionKey = extractConnectionKey(oauth);
      const now = new Date().toISOString();
      await db.from("google_calendar_connections").upsert({
        user_id: user.id,
        org_id: orgId,
        connection_key: connectionKey,
        status: "connecting",
        last_error: null,
        updated_at: now,
        connected_at: now,
      }, { onConflict: "user_id" });
      return json(redactConnectionSecrets(oauth) as Record<string, unknown>);
    }

    if (action === "reset") {
      await db.from("google_calendar_connections")
        .update({ status: "disconnected", last_error: null, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .in("status", ["connecting", "error", "reconnect_required", "disconnected"]);
      return json({ ok: true });
    }

    if (action === "complete") {
      const orgId = await requireActiveOrgMembership(db, user.id, (body as { orgId?: string }).orgId);
      const { data: existing } = await db.from("google_calendar_connections")
        .select("status, connection_key, secondary_calendar_id, backfill_total, backfill_done, updated_at, connected_at, org_id, last_error")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing?.status === "connected" && existing.secondary_calendar_id) {
        if (existing.org_id !== orgId) {
          return json({ error: "invalid_callback" }, { status: 409 });
        }
        const backfill = await prepareInitialBackfill(
          db,
          user.id,
          orgId,
          String(existing.connected_at ?? existing.updated_at ?? "0"),
          existing.backfill_done ?? 0,
        );
        if (backfill > 0) await triggerGoogleSyncWorker().catch(() => undefined);
        return json({
          ok: true,
          calendarId: existing.secondary_calendar_id,
          backfill,
          idempotent: true,
        });
      }
      if (existing?.status === "connected" && !existing.secondary_calendar_id) {
        await db.from("google_calendar_connections")
          .update({ status: "connecting", last_error: "calendar_id_missing" })
          .eq("user_id", user.id)
          .eq("status", "connected")
          .is("secondary_calendar_id", null);
      }
      if (existing?.status === "completing") {
        const updatedAt = Date.parse(String(existing.updated_at ?? ""));
        const claimIsStale = !Number.isFinite(updatedAt) || Date.now() - updatedAt > 120_000;
        if (!claimIsStale) return json({ ok: false, pending: true });

        // Permite retomar com segurança um callback interrompido depois do prazo da trava.
        await db.from("google_calendar_connections")
          .update({ status: "connecting", last_error: "stale_completion_claim" })
          .eq("user_id", user.id)
          .eq("status", "completing");
      }

      const callbackConnectionKey = extractConnectionKey(body);
      if (callbackConnectionKey && callbackConnectionKey !== existing?.connection_key) {
        await db.from("google_calendar_connections")
          .update({ connection_key: callbackConnectionKey, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
      }
      const effectiveConnectionKey = callbackConnectionKey ?? existing?.connection_key ?? null;

      const { data: claim } = await db.from("google_calendar_connections")
        .update({ status: "completing", last_error: null, connection_key: effectiveConnectionKey })
        .eq("user_id", user.id)
        .in("status", ["connecting", "error", "reconnect_required", "disconnected"])
        .select("connection_key, secondary_calendar_id, updated_at")
        .maybeSingle();
      if (!claim) return json({ ok: false, pending: true });

      const finalized = await finalizeAuthorizedConnection(
        db,
        user.id,
        orgId,
        claim.connection_key ?? effectiveConnectionKey,
        claim.secondary_calendar_id,
        existing?.backfill_done ?? 0,
      );
      if (!finalized) {
        await db.from("google_calendar_connections")
          .update({ status: "connecting", last_error: "no_connection" })
          .eq("user_id", user.id)
          .eq("status", "completing");
        return json({ ok: false, pending: true });
      }

      return json({ ok: true, calendarId: finalized.calendarId, backfill: finalized.backfill });
    }

    if (action === "retry") {
      const { data: connection } = await db.from("google_calendar_connections")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (connection?.status !== "connected") {
        return json({ error: "authorization_failed" }, { status: 409 });
      }
      const { data: retried } = await db.from("google_sync_outbox")
        .update({
          status: "queued",
          attempts: 0,
          next_attempt_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("user_id", user.id)
        .in("status", ["failed", "dead_letter"])
        .select("id");
      return json({ ok: true, retried: retried?.length ?? 0 });
    }

    if (action === "disconnect") {
      await db.from("google_sync_outbox").update({ status: "cancelled" })
        .eq("user_id", user.id).in("status", ["queued", "failed", "in_flight", "dead_letter"]);
      await db.from("google_calendar_connections").delete().eq("user_id", user.id);
      return json({ ok: true });
    }

    if (action === "status") {
      const { data: connection } = await db.from("google_calendar_connections")
        .select("user_id, org_id, google_email, connection_key, secondary_calendar_id, status, last_sync_at, last_error, backfill_total, backfill_done, connected_at, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (
        connection
        && connection.org_id
        && (
          ["connecting", "completing"].includes(connection.status)
          || (connection.status === "error" && RECOVERABLE_AUTHORIZATION_ERRORS.has(String(connection.last_error ?? "")))
        )
      ) {
        const member = await db.from("org_members")
          .select("user_id")
          .eq("user_id", user.id)
          .eq("org_id", connection.org_id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (member.data) {
          const recovered = await finalizeAuthorizedConnection(
            db,
            user.id,
            connection.org_id,
            connection.connection_key,
            connection.secondary_calendar_id,
            connection.backfill_done ?? 0,
          ).catch(() => null);
          if (recovered) {
            connection.status = "connected";
            connection.last_error = null;
            connection.secondary_calendar_id = recovered.calendarId;
            connection.connected_at = recovered.connectedAt;
          }
        }
      }

      const authorizationUpdatedAtMs = Date.parse(String(connection?.updated_at ?? connection?.connected_at ?? ""));
      if (
        connection
        && ["connecting", "completing"].includes(connection.status)
        && !connection.last_error
        && (!Number.isFinite(authorizationUpdatedAtMs) || Date.now() - authorizationUpdatedAtMs > STALE_AUTHORIZATION_MS)
      ) {
        await db.from("google_calendar_connections")
          .update({ status: "error", last_error: "authorization_not_confirmed" })
          .eq("user_id", user.id)
          .in("status", ["connecting", "completing"])
          .is("last_error", null);
        connection.status = "error";
        connection.last_error = "authorization_not_confirmed";
      }
      const { data: outboxRows } = await db.from("google_sync_outbox")
        .select("status")
        .eq("user_id", user.id)
        .in("status", ["queued", "failed", "in_flight", "dead_letter", "reconnect_required"]);
      const counts = {
        queued: 0,
        inFlight: 0,
        failed: 0,
        deadLetter: 0,
        reconnectRequired: 0,
      };
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
        error_code: connectionErrorCode(connection.last_error),
        backfill_total: connection.backfill_total,
        backfill_done: connection.backfill_done,
        connected_at: connection.connected_at,
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
    console.error("google_calendar_oauth_failed", {
      reason: safeServerError(error),
    });
    return json({ error: safeServerError(error) }, { status: 500 });
  }
});
