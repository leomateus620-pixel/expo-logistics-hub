import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import { AgendaMeetingControlAction } from "./contracts.ts";
import { constantTimeEqual } from "./crypto.ts";
import { HttpError } from "./http.ts";
import type { MeetingDatabase } from "./database.ts";

export type MeetingSupabaseClient = SupabaseClient<MeetingDatabase>;

function requireEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new HttpError(503, "server_configuration_missing", true);
  return value;
}

export interface AuthenticatedMeetingUser {
  id: string;
  authHeader: string;
  client: MeetingSupabaseClient;
}

export async function authenticateMeetingUser(
  req: Request,
): Promise<AuthenticatedMeetingUser> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!bearer) throw new HttpError(401, "unauthorized");

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const client = createClient<MeetingDatabase>(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data, error } = await client.auth.getUser(bearer);
  if (error || !data.user) throw new HttpError(401, "unauthorized");
  return { id: data.user.id, authHeader: `Bearer ${bearer}`, client };
}

export function createMeetingAdminClient(): MeetingSupabaseClient {
  return createClient<MeetingDatabase>(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export async function authorizeMeetingAction(
  client: MeetingSupabaseClient,
  action: AgendaMeetingControlAction | "transcribe_segment",
  orgId: string | null,
  eventId: string | null,
  sessionId: string | null,
) {
  const { data, error } = await client.rpc("agenda_meeting_authorize", {
    p_action: action,
    p_org_id: orgId,
    p_event_id: eventId,
    p_session_id: sessionId,
  });
  if (error) throw new HttpError(503, "authorization_check_failed", true);
  if (data !== true) throw new HttpError(403, "forbidden");
}

export async function requireInternalWorker(req: Request) {
  const workerToken = Deno.env.get("AGENDA_MEETING_WORKER_TOKEN")?.trim() ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  const suppliedWorkerToken = req.headers.get("X-Worker-Token")?.trim() ?? "";
  const bearer =
    req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const workerMatch = Boolean(
    workerToken && suppliedWorkerToken &&
      constantTimeEqual(workerToken, suppliedWorkerToken),
  );
  const serviceMatch = Boolean(
    serviceKey && bearer && constantTimeEqual(serviceKey, bearer),
  );
  if (!workerMatch && !serviceMatch) throw new HttpError(401, "unauthorized");
}

export function mapDatabaseError(
  error: { message?: string; code?: string; details?: string; hint?: string }
    | null
    | undefined,
) {
  const raw = `${error?.code ?? ""} ${error?.message ?? ""} ${
    error?.details ?? ""
  }`.toLowerCase();
  // O erro bruto do banco fica apenas no log do servidor.
  logSafe("error", "agenda_meeting_db_error", {
    pgCode: error?.code ?? null,
    pgMessage: (error?.message ?? "").slice(0, 300),
    pgDetails: (error?.details ?? "").slice(0, 300),
    pgHint: (error?.hint ?? "").slice(0, 200),
  });
  if (
    raw.includes("invalid_consent_actor") || raw.includes("consent_actor")
  ) {
    return new HttpError(422, "meeting_consent_actor_invalid");
  }
  if (raw.includes("event_not_found")) {
    return new HttpError(404, "meeting_event_not_found");
  }
  if (
    raw.includes("mutation_id_required") || raw.includes("invalid_request") ||
    raw.includes("invalid_action")
  ) {
    return new HttpError(400, "invalid_request");
  }

  if (raw.includes("version_conflict")) {
    return new HttpError(409, "version_conflict");
  }
  if (raw.includes("idempotency_conflict")) {
    return new HttpError(409, "idempotency_conflict");
  }
  if (
    raw.includes("segment_conflict") ||
    raw.includes("provider_request_conflict")
  ) {
    return new HttpError(409, "segment_conflict");
  }
  if (
    raw.includes("callback_replay_conflict") ||
    raw.includes("callback_attempt_conflict")
  ) {
    return new HttpError(409, "callback_replay_conflict");
  }
  if (
    raw.includes("callback_not_found") || raw.includes("callback_expired") ||
    raw.includes("invalid_callback")
  ) {
    return new HttpError(401, "invalid_callback");
  }
  if (raw.includes("not_found")) return new HttpError(404, "meeting_not_found");
  if (raw.includes("forbidden")) return new HttpError(403, "forbidden");
  if (raw.includes("invalid_transition") || raw.includes("invalid_state")) {
    return new HttpError(422, "invalid_meeting_state");
  }
  if (raw.includes("consent_required")) {
    return new HttpError(422, "meeting_consent_required");
  }
  if (raw.includes("invalid_payload") || raw.includes("invalid_argument")) {
    return new HttpError(400, "invalid_request");
  }
  return new HttpError(503, "meeting_persistence_failed", true);
}
