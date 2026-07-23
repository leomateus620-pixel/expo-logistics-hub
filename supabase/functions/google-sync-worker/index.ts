import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  asFinalizedConnectionKey,
  callGoogle,
  callGoogleJson,
  type FinalizedConnectionKey,
} from "../_shared/googleCalendarGateway.ts";
import { eventDateDiagnosticShape, normalizeEventDateTime } from "../_shared/eventDateTime.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 6;

function db() {
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

function requireServiceRole(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  return Boolean(serviceRoleKey && token && token === serviceRoleKey);
}

function shortUserId(userId: string) {
  return userId.replace(/-/g, "").slice(0, 10);
}

interface CronEvent {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
}

interface GoogleSubevent {
  title: string;
  start_time: string | null;
  end_time: string | null;
}

interface SyncTask {
  id: string;
  user_id: string;
  org_id: string;
  event_id: string;
  operation: "upsert" | "delete";
  payload_hash: string | null;
  is_initial_backfill: boolean;
  attempts: number;
  connection_generation: string | null;
}

interface EventMapping {
  id: string;
  google_event_id: string | null;
  google_calendar_id: string | null;
  deleted_at: string | null;
}

function buildGoogleEvent(event: CronEvent, subevents: GoogleSubevent[]) {
  if (!event.start_date) return null;
  const normalized = normalizeEventDateTime({
    date: event.start_date,
    startTime: event.start_time,
    endDate: event.end_date,
    endTime: event.end_time,
  });
  if (!normalized.ok) {
    console.error("google_sync_invalid_event_datetime", {
      eventId: event.id,
      errorCode: normalized.error,
      ...eventDateDiagnosticShape({
        date: event.start_date,
        startTime: event.start_time,
        endDate: event.end_date,
        endTime: event.end_time,
      }),
    });
    throw new Error(`invalid_event_datetime:${normalized.error}`);
  }

  let description = event.description ?? "";
  if (subevents.length) {
    description += "\n\n— Subeventos —\n" + subevents.map((subevent) =>
      `• ${subevent.title}${subevent.start_time
        ? ` (${String(subevent.start_time).slice(0, 5)}${subevent.end_time ? `–${String(subevent.end_time).slice(0, 5)}` : ""})`
        : ""}`
    ).join("\n");
  }
  description += "\n\nSincronizado por FENASOJA · Cronograma e Eventos";

  return {
    summary: event.title,
    description,
    location: event.location ?? undefined,
    start: normalized.value.googleStart,
    end: normalized.value.googleEnd,
    reminders: {
      useDefault: false,
      overrides: [{ method: "email", minutes: 1440 }, { method: "email", minutes: 120 }],
    },
    extendedProperties: { private: { fenasoja_event_id: event.id } },
  };
}

async function findRemoteEventIds(
  connectionKey: FinalizedConnectionKey,
  calendarId: string,
  eventId: string,
) {
  const response = await callGoogleJson<{ items?: Array<{ id?: string }> }>(
    connectionKey,
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&showDeleted=false&maxResults=250&privateExtendedProperty=${encodeURIComponent(`fenasoja_event_id=${eventId}`)}`,
  );
  return [...new Set((response.items ?? [])
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id)))];
}

async function deleteGoogleEvent(
  connectionKey: FinalizedConnectionKey,
  calendarId: string,
  googleEventId: string,
) {
  const response = await callGoogle(
    connectionKey,
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    { method: "DELETE" },
  );
  await response.text();
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new Error(`google_api:${response.status}:delete_failed`);
  }
}

async function deleteAllRemoteCopies(
  connectionKey: FinalizedConnectionKey,
  calendarId: string,
  eventId: string,
  mappedEventId?: string | null,
) {
  const remoteIds = await findRemoteEventIds(connectionKey, calendarId, eventId);
  if (mappedEventId) remoteIds.unshift(mappedEventId);
  for (const googleEventId of [...new Set(remoteIds)]) {
    await deleteGoogleEvent(connectionKey, calendarId, googleEventId);
  }
}

function syncFailureCode(message: string) {
  if (/^invalid_event_datetime:[a-z0-9_-]+$/i.test(message)) return message;
  if (["task_completion_failed", "mapping_write_failed", "remote_event_verification_failed"].includes(message)) {
    return message;
  }
  if (message.includes("google_api:401:") || message.includes("google_api:403:")) return "authorization_revoked";
  if (message.includes("google_api:429:")) return "provider_rate_limited";
  if (/google_api:5\d\d:/.test(message)) return "provider_unavailable";
  if (message.includes("connection_generation_superseded")) return "connection_generation_superseded";
  return "sync_failed";
}

async function markMappingDeleted(
  supabase: ReturnType<typeof db>,
  mapping: EventMapping | null,
) {
  if (!mapping?.id) return;
  const { error } = await supabase.from("google_calendar_event_map")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", mapping.id);
  if (error) throw new Error("mapping_write_failed");
}

async function completeTask(supabase: ReturnType<typeof db>, task: SyncTask) {
  const { data, error } = await supabase.rpc("complete_google_sync_task", {
    target_task_id: task.id,
    target_user_id: task.user_id,
    target_is_initial_backfill: task.is_initial_backfill,
  });
  if (error || data !== true) throw new Error("task_completion_failed");
  console.info("event_sync_succeeded", {
    user: shortUserId(task.user_id),
    orgId: task.org_id,
    taskId: task.id,
    eventId: task.event_id,
    operation: task.operation,
  });
}

async function processTask(supabase: ReturnType<typeof db>, task: SyncTask) {
  const { data: connection, error: connectionError } = await supabase.from("google_calendar_connections")
    .select("user_id, org_id, status, secondary_calendar_id, connection_key, connection_generation")
    .eq("user_id", task.user_id)
    .eq("org_id", task.org_id)
    .maybeSingle();
  if (connectionError) throw new Error("connection_lookup_failed");

  if (
    !connection
    || !["connected", "synchronizing"].includes(connection.status)
    || !connection.secondary_calendar_id
    || !connection.connection_key
  ) {
    await supabase.from("google_sync_outbox").update({
      status: "reconnect_required",
      last_error: "connection_missing_or_disconnected",
    }).eq("id", task.id).eq("status", "in_flight");
    return;
  }
  if (!task.connection_generation || task.connection_generation !== connection.connection_generation) {
    await supabase.from("google_sync_outbox").update({
      status: "cancelled",
      last_error: "connection_generation_superseded",
    }).eq("id", task.id).eq("status", "in_flight");
    return;
  }

  const calendarId = connection.secondary_calendar_id as string;
  const connectionKey = asFinalizedConnectionKey(connection.connection_key);
  const { data: mapping, error: mappingError } = await supabase.from("google_calendar_event_map")
    .select("id, google_event_id, google_calendar_id, deleted_at")
    .eq("user_id", task.user_id)
    .eq("event_id", task.event_id)
    .is("subevent_id", null)
    .maybeSingle();
  if (mappingError) throw new Error("mapping_lookup_failed");
  const existing = mapping as EventMapping | null;

  try {
    if (task.operation === "delete") {
      const mappedId = existing?.google_calendar_id === calendarId && !existing.deleted_at
        ? existing.google_event_id
        : null;
      await deleteAllRemoteCopies(connectionKey, calendarId, task.event_id, mappedId);
      await markMappingDeleted(supabase, existing);
      await completeTask(supabase, task);
      return;
    }

    const { data: event, error: eventError } = await supabase.from("cronograma_eventos")
      .select("id, org_id, title, description, location, start_date, end_date, start_time, end_time, status")
      .eq("id", task.event_id)
      .eq("org_id", task.org_id)
      .maybeSingle();
    if (eventError) throw new Error("event_lookup_failed");

    // The event may have been deleted after this upsert was claimed. Treat that
    // race as a delete so a stale Google event cannot survive.
    if (!event) {
      await deleteAllRemoteCopies(connectionKey, calendarId, task.event_id, existing?.google_event_id);
      await markMappingDeleted(supabase, existing);
      await completeTask(supabase, { ...task, operation: "delete" });
      return;
    }

    const { data: subevents, error: subeventError } = await supabase.from("cronograma_subeventos")
      .select("title, start_time, end_time")
      .eq("parent_event_id", event.id)
      .order("sort_order");
    if (subeventError) throw new Error("subevent_lookup_failed");
    const googleEvent = buildGoogleEvent(event as CronEvent, (subevents ?? []) as GoogleSubevent[]);

    if (!googleEvent) {
      await deleteAllRemoteCopies(connectionKey, calendarId, event.id, existing?.google_event_id);
      await markMappingDeleted(supabase, existing);
      await completeTask(supabase, task);
      return;
    }

    const remoteIds = await findRemoteEventIds(connectionKey, calendarId, event.id);
    const mappedRemoteId = existing?.google_calendar_id === calendarId
      && !existing.deleted_at
      && existing.google_event_id
      && remoteIds.includes(existing.google_event_id)
      ? existing.google_event_id
      : null;
    let googleEventId = mappedRemoteId ?? remoteIds[0] ?? null;

    if (googleEventId) {
      const updated = await callGoogleJson<{ id?: string }>(
        connectionKey,
        `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
        { method: "PATCH", body: JSON.stringify(googleEvent) },
      );
      googleEventId = updated.id ?? googleEventId;
    } else {
      const created = await callGoogleJson<{ id?: string }>(
        connectionKey,
        `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        { method: "POST", body: JSON.stringify(googleEvent) },
      );
      if (!created.id) throw new Error("remote_event_verification_failed");
      googleEventId = created.id;
    }

    const verified = await callGoogleJson<{
      id?: string;
      extendedProperties?: { private?: { fenasoja_event_id?: string } };
    }>(
      connectionKey,
      `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}?fields=id,extendedProperties`,
    );
    if (
      verified.id !== googleEventId
      || verified.extendedProperties?.private?.fenasoja_event_id !== event.id
    ) {
      throw new Error("remote_event_verification_failed");
    }

    for (const duplicateId of remoteIds.filter((id) => id !== googleEventId)) {
      await deleteGoogleEvent(connectionKey, calendarId, duplicateId);
    }

    const mappingPayload = {
      user_id: task.user_id,
      event_id: task.event_id,
      subevent_id: null,
      google_event_id: googleEventId,
      google_calendar_id: calendarId,
      content_hash: task.payload_hash,
      last_synced_at: new Date().toISOString(),
      deleted_at: null,
    };
    const mappingWrite = existing?.id
      ? await supabase.from("google_calendar_event_map").update(mappingPayload).eq("id", existing.id)
      : await supabase.from("google_calendar_event_map").insert(mappingPayload);
    if (mappingWrite.error) throw new Error("mapping_write_failed");
    await completeTask(supabase, task);
  } catch (error) {
    const message = String((error as Error).message ?? error);
    const failureCode = syncFailureCode(message);
    const authorizationError = failureCode === "authorization_revoked";
    const rateLimited = failureCode === "provider_rate_limited";
    const attempts = task.attempts + 1;
    const backoffSeconds = rateLimited
      ? Math.min(600, 30 * Math.pow(2, attempts))
      : Math.min(900, 15 * Math.pow(2, attempts));
    const nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

    console.error("event_sync_failed", {
      user: shortUserId(task.user_id),
      orgId: task.org_id,
      taskId: task.id,
      eventId: task.event_id,
      errorCode: failureCode,
      attempts,
    });

    if (authorizationError) {
      await supabase.from("google_sync_outbox").update({
        status: "reconnect_required",
        attempts,
        last_error: failureCode,
      }).eq("id", task.id).eq("status", "in_flight");
      await supabase.from("google_calendar_connections").update({
        status: "reconnect_required",
        error_code: failureCode,
        last_error: failureCode,
      }).eq("user_id", task.user_id).eq("org_id", task.org_id);
    } else if (message.startsWith("invalid_event_datetime:") || attempts >= MAX_ATTEMPTS) {
      await supabase.from("google_sync_outbox").update({
        status: "dead_letter",
        attempts,
        last_error: failureCode,
      }).eq("id", task.id).eq("status", "in_flight");
    } else {
      await supabase.from("google_sync_outbox").update({
        status: "failed",
        attempts,
        last_error: failureCode,
        next_attempt_at: nextAttemptAt,
      }).eq("id", task.id).eq("status", "in_flight");
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!requireServiceRole(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = db();
  console.info("worker_started", { batchSize: BATCH_SIZE });
  const { data: batch, error } = await supabase.rpc("claim_google_sync_batch", {
    batch_size: BATCH_SIZE,
  });
  if (error) {
    console.error("google_sync_worker_claim_failed", { errorCode: "claim_failed" });
    return new Response(JSON.stringify({ error: "claim_failed" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const tasks = (batch ?? []) as SyncTask[];
  for (const task of tasks) {
    try {
      await processTask(supabase, task);
    } catch {
      const attempts = task.attempts + 1;
      const terminal = attempts >= MAX_ATTEMPTS;
      await supabase.from("google_sync_outbox").update({
        status: terminal ? "dead_letter" : "failed",
        attempts,
        last_error: "sync_failed",
        next_attempt_at: new Date(Date.now() + Math.min(900, 15 * Math.pow(2, attempts)) * 1000).toISOString(),
      }).eq("id", task.id).eq("status", "in_flight");
      console.error("event_sync_failed", {
        user: shortUserId(task.user_id),
        orgId: task.org_id,
        taskId: task.id,
        eventId: task.event_id,
        errorCode: "sync_failed",
        attempts,
      });
    }
  }
  return new Response(JSON.stringify({ processed: tasks.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
