import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { callGoogle, callGoogleJson } from "../_shared/googleCalendarGateway.ts";
import { eventDateDiagnosticShape, normalizeEventDateTime } from "../_shared/eventDateTime.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH = 25;

function db() {
  return createClient(supabaseUrl, service, { auth: { persistSession: false } });
}

function requireServiceRole(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  return Boolean(service && token && token === service);
}

interface CronEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  has_exact_date: boolean;
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
  event_id: string;
  operation: "upsert" | "delete";
  payload_hash: string | null;
  is_initial_backfill: boolean;
  attempts: number;
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
      reason: normalized.error,
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
  if (subevents?.length) {
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

async function findRemoteEventId(connectionKey: string, calendarId: string, eventId: string) {
  const response = await callGoogleJson<{ items?: Array<{ id?: string }> }>(
    connectionKey,
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&showDeleted=false&maxResults=2&privateExtendedProperty=${encodeURIComponent(`fenasoja_event_id=${eventId}`)}`,
  );
  return response.items?.find((item) => item.id)?.id ?? null;
}

function syncFailureCode(message: string) {
  if (/^invalid_event_datetime:[a-z0-9_-]+$/i.test(message)) return message;
  if (message === "event_not_found" || message === "task_completion_failed") return message;
  if (message.includes(":401:") || message.toLowerCase().includes("unauthorized") || message.toLowerCase().includes("revoked")) {
    return "authorization_revoked";
  }
  if (message.includes(":429:")) return "provider_rate_limited";
  if (/:5\d\d:/.test(message)) return "provider_unavailable";
  return "sync_failed";
}

async function processTask(supa: ReturnType<typeof db>, task: SyncTask) {
  const { data: connection } = await supa.from("google_calendar_connections")
    .select("*").eq("user_id", task.user_id).maybeSingle();
  if (!connection || connection.status !== "connected" || !connection.secondary_calendar_id || !connection.connection_key) {
    await supa.from("google_sync_outbox").update({
      status: "reconnect_required",
      last_error: !connection?.connection_key ? "connection_key_missing" : "connection_missing_or_disconnected",
    }).eq("id", task.id).eq("status", "in_flight");
    return;
  }

  const calendarId = connection.secondary_calendar_id;
  const connectionKey = connection.connection_key as string;
  const { data: mappingRows } = await supa.from("google_calendar_event_map")
    .select("*")
    .eq("user_id", task.user_id)
    .eq("event_id", task.event_id)
    .is("subevent_id", null)
    .order("last_synced_at", { ascending: false })
    .limit(1);
  const existing = mappingRows?.[0] ?? null;

  try {
    if (task.operation === "delete") {
      const googleEventId = existing?.google_calendar_id === calendarId && !existing.deleted_at
        ? existing.google_event_id
        : await findRemoteEventId(connectionKey, calendarId, task.event_id);
      if (googleEventId) {
        const response = await callGoogle(
          connectionKey,
          `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
          { method: "DELETE" },
        );
        if (!response.ok && response.status !== 404 && response.status !== 410) {
          await response.text();
          throw new Error(`delete_failed:${response.status}`);
        }
      }
      if (existing?.id) {
        await supa.from("google_calendar_event_map")
          .update({ deleted_at: new Date().toISOString() }).eq("id", existing.id);
      }
    } else {
      const { data: event } = await supa.from("cronograma_eventos")
        .select("*").eq("id", task.event_id).maybeSingle();
      if (!event) throw new Error("event_not_found");
      const { data: subevents } = await supa.from("cronograma_subeventos")
        .select("title, start_time, end_time")
        .eq("parent_event_id", event.id)
        .order("sort_order");
      const googleEvent = buildGoogleEvent(
        event as CronEvent,
        (subevents ?? []) as GoogleSubevent[],
      );

      if (!googleEvent) {
        const googleEventId = existing?.google_calendar_id === calendarId && !existing.deleted_at
          ? existing.google_event_id
          : await findRemoteEventId(connectionKey, calendarId, event.id);
        if (googleEventId) {
          await callGoogle(
            connectionKey,
            `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
            { method: "DELETE" },
          ).catch(() => undefined);
        }
        if (existing?.id) {
          await supa.from("google_calendar_event_map")
            .update({ deleted_at: new Date().toISOString() }).eq("id", existing.id);
        }
      } else {
        let googleEventId = existing?.google_calendar_id === calendarId && !existing.deleted_at
          ? existing.google_event_id
          : null;
        if (!googleEventId) {
          googleEventId = await findRemoteEventId(connectionKey, calendarId, event.id);
        }

        if (googleEventId) {
          await callGoogleJson(
            connectionKey,
            `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
            { method: "PATCH", body: JSON.stringify(googleEvent) },
          );
        } else {
          const created = await callGoogleJson<{ id: string }>(
            connectionKey,
            `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
            { method: "POST", body: JSON.stringify(googleEvent) },
          );
          googleEventId = created.id;
        }

        const mapping = {
          user_id: task.user_id,
          event_id: task.event_id,
          subevent_id: null,
          google_event_id: googleEventId,
          google_calendar_id: calendarId,
          content_hash: task.payload_hash,
          last_synced_at: new Date().toISOString(),
          deleted_at: null,
        };
        if (existing?.id) {
          await supa.from("google_calendar_event_map").update(mapping).eq("id", existing.id);
        } else {
          await supa.from("google_calendar_event_map").insert(mapping);
        }
      }
    }

    const { data: completed, error: completionError } = await supa.rpc("complete_google_sync_task", {
      target_task_id: task.id,
      target_user_id: task.user_id,
      target_is_initial_backfill: task.is_initial_backfill,
    });
    if (completionError || completed !== true) throw new Error("task_completion_failed");
  } catch (error) {
    const message = String((error as Error).message ?? error);
    const isAuthorizationError = message.includes(":401:") || message.toLowerCase().includes("unauthorized") || message.toLowerCase().includes("revoked");
    const isRateLimit = message.includes(":429:");
    const failureCode = syncFailureCode(message);
    const attempts = task.attempts + 1;
    const backoffSeconds = isRateLimit
      ? Math.min(300, 30 * Math.pow(2, attempts))
      : Math.min(600, 15 * Math.pow(2, attempts));
    const nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

    console.error("google_sync_task_failed", {
      taskId: task.id,
      eventId: task.event_id,
      reason: failureCode,
      attempts,
    });

    if (isAuthorizationError) {
      await supa.from("google_sync_outbox").update({
        status: "reconnect_required", attempts, last_error: failureCode,
      }).eq("id", task.id).eq("status", "in_flight");
      await supa.from("google_calendar_connections")
        .update({ status: "reconnect_required", last_error: failureCode })
        .eq("user_id", task.user_id);
    } else if (message.startsWith("invalid_event_datetime:") || attempts >= 6) {
      await supa.from("google_sync_outbox").update({
        status: "dead_letter", attempts, last_error: failureCode,
      }).eq("id", task.id).eq("status", "in_flight");
    } else {
      await supa.from("google_sync_outbox").update({
        status: "failed", attempts, last_error: failureCode, next_attempt_at: nextAttemptAt,
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
  const supa = db();

  // A runtime interruption after a task is claimed must not leave it blocked
  // forever. Recover only claims older than five minutes; normal active claims
  // remain untouched and re-enter the existing bounded retry path.
  const staleClaimCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  await supa.from("google_sync_outbox").update({
    status: "failed",
    last_error: "stale_in_flight_recovered",
    next_attempt_at: new Date().toISOString(),
  }).eq("status", "in_flight").lt("updated_at", staleClaimCutoff);

  const candidateIds = (await supa.from("google_sync_outbox")
    .select("id")
    .in("status", ["queued", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH)).data?.map((row: { id: string }) => row.id) ?? [];
  if (!candidateIds.length) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: batch } = await supa.from("google_sync_outbox")
    .update({ status: "in_flight", updated_at: new Date().toISOString() })
    .in("id", candidateIds)
    .in("status", ["queued", "failed"])
    .select();

  const tasks = (batch ?? []) as SyncTask[];
  for (const task of tasks) await processTask(supa, task);

  return new Response(JSON.stringify({ processed: tasks.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
