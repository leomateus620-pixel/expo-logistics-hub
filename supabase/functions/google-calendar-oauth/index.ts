// google-calendar-oauth: authenticated actions for the direct Google OAuth 2.0 flow.
// Actions: start, status, disconnect, retry, cancel. The public `code` exchange
// happens in the separate google-calendar-oauth-callback function (GET only).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  buildAuthorizationUrl,
  GOOGLE_SCOPES,
  revokeToken,
} from "../_shared/googleCalendarClient.ts";
import { bytesFromDb, decryptToken } from "../_shared/googleTokenCrypto.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_ROUTE = "/cronograma-eventos";
const CALLBACK_ROUTE = "/google-calendar/callback";
const ATTEMPT_TTL_MS = 10 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTRACT_VERSION = "2026-07-23.direct-google-oauth";

type AdminClient = ReturnType<typeof admin>;

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

function requireUuid(value: unknown, code: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error(code);
  return value;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlRandom(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function configuredAppOrigin() {
  try {
    return new URL(Deno.env.get("SITE_URL") ?? "https://fenasojagestao.com").origin;
  } catch {
    return "https://fenasojagestao.com";
  }
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

async function triggerGoogleSyncWorker() {
  const workerToken = Deno.env.get("GOOGLE_SYNC_WORKER_TOKEN") ?? "";
  const headers: Record<string, string> = { Authorization: `Bearer ${serviceRoleKey}` };
  if (workerToken) headers["X-Worker-Token"] = workerToken;
  const response = await fetch(`${supabaseUrl}/functions/v1/google-sync-worker`, {
    method: "POST",
    headers,
  });
  await response.text();
  if (!response.ok) console.warn("google_sync_worker_trigger_failed", { status: response.status });
}

function safeServerError(error: unknown) {
  const message = String((error as Error)?.message ?? error);
  if (message === "authorization_expired") return "authorization_expired";
  if (message === "authorization_revoked") return "authorization_revoked";
  if (message === "no_active_organization") return "no_active_organization";
  if (message.startsWith("provider_")) return message;
  if (message.startsWith("refresh_token_")) return "authorization_revoked";
  return "request_failed";
}

function errorHttpStatus(code: string) {
  if (code === "authorization_expired") return 410;
  if (code === "no_active_organization") return 403;
  if (code === "provider_rate_limited") return 429;
  if (["provider_unauthorized", "provider_bad_request", "provider_not_found", "provider_conflict", "provider_rejected"].includes(code)) return 422;
  return 503;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "request_failed" }, { status: 405 });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const db = admin();

    if (action === "start") {
      const user = await requireUser(req);
      const orgId = await requireActiveOrgMembership(db, user.id, body.orgId);
      const attemptId = crypto.randomUUID();
      const state = base64UrlRandom(32);
      const stateHash = await sha256(state);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ATTEMPT_TTL_MS).toISOString();

      // Expire prior conflicting attempts to avoid duplicate active flows.
      const { error: oldAttemptError } = await db.from("google_calendar_oauth_attempts").update({
        status: "expired",
        consumed_at: now.toISOString(),
        error_code: "authorization_superseded",
      }).eq("user_id", user.id).eq("org_id", orgId).in("status", ["starting", "waiting_authorization"]);
      assertDb(oldAttemptError, "previous_attempt_expire_failed");

      const { data: existing } = await db.from("google_calendar_connections")
        .select("status, error_code, secondary_calendar_id")
        .eq("user_id", user.id).eq("org_id", orgId)
        .maybeSingle();

      const { error: attemptInsertError } = await db.from("google_calendar_oauth_attempts").insert({
        id: attemptId,
        user_id: user.id,
        org_id: orgId,
        status: "waiting_authorization",
        return_origin: configuredAppOrigin(),
        callback_path: CALLBACK_ROUTE,
        next_path: APP_ROUTE,
        provider_state_hash: stateHash,
        expires_at: expiresAt,
        prior_connection_status: existing?.status ?? null,
        prior_error_code: existing?.error_code ?? null,
      });
      assertDb(attemptInsertError, "attempt_insert_failed");

      const { error: startingError } = await db.from("google_calendar_connections").upsert({
        user_id: user.id,
        org_id: orgId,
        status: "waiting_authorization",
        oauth_provider: "google_direct",
        error_code: null,
        last_error: null,
        active_oauth_attempt_id: attemptId,
        secondary_calendar_id: existing?.secondary_calendar_id ?? null,
        scopes_granted: [...GOOGLE_SCOPES],
      }, { onConflict: "user_id" });
      assertDb(startingError, "connection_start_update_failed");

      const authorizationUrl = buildAuthorizationUrl(state);
      diagnostic("oauth_start_succeeded", {
        user: shortUserId(user.id),
        orgId,
        attemptId,
      });
      return json({
        authorization_url: authorizationUrl,
        attempt_id: attemptId,
        expires_at: expiresAt,
        contract_version: CONTRACT_VERSION,
      });
    }

    if (action === "cancel" || action === "reset") {
      const user = await requireUser(req);
      const attemptId = typeof body.attemptId === "string" && UUID_PATTERN.test(body.attemptId)
        ? body.attemptId
        : null;
      if (!attemptId) return json({ ok: true });
      const now = new Date().toISOString();
      const { data: attempt } = await db.from("google_calendar_oauth_attempts")
        .select("id, org_id, status, prior_connection_status, prior_error_code")
        .eq("id", attemptId).eq("user_id", user.id).maybeSingle();
      if (!attempt) return json({ ok: true });
      if (!["waiting_authorization", "starting"].includes(attempt.status)) return json({ ok: true });
      await db.from("google_calendar_oauth_attempts").update({
        status: "cancelled",
        consumed_at: now,
        error_code: "authorization_cancelled",
      }).eq("id", attempt.id).eq("user_id", user.id);
      const restoredStatus = attempt.prior_connection_status && attempt.prior_connection_status !== "waiting_authorization"
        ? attempt.prior_connection_status
        : "disconnected";
      await db.from("google_calendar_connections").update({
        status: restoredStatus,
        error_code: attempt.prior_error_code,
        last_error: attempt.prior_error_code,
        active_oauth_attempt_id: null,
      }).eq("user_id", user.id).eq("org_id", attempt.org_id).eq("active_oauth_attempt_id", attempt.id);
      return json({ ok: true });
    }

    if (action === "retry") {
      const user = await requireUser(req);
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
      const user = await requireUser(req);
      const orgId = await requireActiveOrgMembership(db, user.id, body.orgId);
      const { data: connection, error: connectionError } = await db.from("google_calendar_connections")
        .select("refresh_token_ciphertext, refresh_token_iv, refresh_token_tag, connection_generation")
        .eq("user_id", user.id).eq("org_id", orgId).maybeSingle();
      assertDb(connectionError, "connection_lookup_failed");
      if (!connection) return json({ ok: true, idempotent: true });

      await db.from("google_calendar_connections").update({ status: "disconnecting" })
        .eq("user_id", user.id).eq("org_id", orgId);

      // Best-effort token revocation at Google.
      if (connection.refresh_token_ciphertext && connection.refresh_token_iv && connection.refresh_token_tag) {
        try {
          const refresh = await decryptToken({
            ciphertext: bytesFromDb(connection.refresh_token_ciphertext),
            iv: bytesFromDb(connection.refresh_token_iv),
            tag: bytesFromDb(connection.refresh_token_tag),
          });
          await revokeToken(refresh);
        } catch (error) {
          console.warn("google_revoke_failed", { message: String((error as Error).message ?? error).slice(0, 120) });
        }
      }

      // Cancel outbox from the previous generation.
      await db.from("google_sync_outbox").update({ status: "cancelled" })
        .eq("user_id", user.id).eq("org_id", orgId)
        .in("status", ["queued", "failed", "in_flight", "dead_letter", "reconnect_required"]);
      await db.from("google_calendar_oauth_attempts").update({
        status: "cancelled",
        consumed_at: new Date().toISOString(),
        error_code: "connection_disconnected",
      }).eq("user_id", user.id).eq("org_id", orgId)
        .in("status", ["starting", "waiting_authorization"]);
      const { error: deleteError } = await db.from("google_calendar_connections")
        .delete().eq("user_id", user.id).eq("org_id", orgId);
      assertDb(deleteError, "connection_delete_failed");
      return json({ ok: true });
    }

    if (action === "status") {
      const user = await requireUser(req);
      const orgId = await requireActiveOrgMembership(db, user.id, body.orgId);
      const { data: connection, error: connectionError } = await db.from("google_calendar_connections")
        .select("user_id, org_id, google_email, secondary_calendar_id, status, last_sync_at, error_code, backfill_total, backfill_done, connected_at, verified_at, connection_generation, active_oauth_attempt_id, updated_at, oauth_provider")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .maybeSingle();
      assertDb(connectionError, "connection_lookup_failed");

      // Auto-expire stale waiting_authorization
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
        }
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
        contract_version: CONTRACT_VERSION,
      });
    }

    return json({ error: "request_failed" }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    const code = safeServerError(error);
    console.error("google_calendar_oauth_failed", {
      errorCode: code,
      errorMessage: String((error as Error)?.message ?? error).slice(0, 160),
    });
    return json({ error: code }, { status: errorHttpStatus(code) });
  }
});
