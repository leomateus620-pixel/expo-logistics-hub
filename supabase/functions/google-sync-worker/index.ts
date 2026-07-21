import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { callGoogle, callGoogleJson } from "../_shared/googleCalendarGateway.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH = 25;

function db() {
  return createClient(supabaseUrl, service, { auth: { persistSession: false } });
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

function buildGoogleEvent(ev: CronEvent, subs: any[]) {
  if (!ev.start_date) return null; // sem data → não sincroniza
  const isAllDay = !ev.start_time && !ev.end_time;
  const tz = "America/Sao_Paulo";
  const start = isAllDay
    ? { date: ev.start_date }
    : { dateTime: `${ev.start_date}T${ev.start_time ?? "08:00"}:00`, timeZone: tz };
  const endDate = ev.end_date ?? ev.start_date;
  const end = isAllDay
    ? { date: (() => { const d = new Date(endDate); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })() }
    : { dateTime: `${endDate}T${ev.end_time ?? ev.start_time ?? "18:00"}:00`, timeZone: tz };

  let description = ev.description ?? "";
  if (subs?.length) {
    description += "\n\n— Sub-eventos —\n" + subs.map((s) =>
      `• ${s.title}${s.start_time ? ` (${s.start_time}${s.end_time ? `–${s.end_time}` : ""})` : ""}`
    ).join("\n");
  }
  description += "\n\nSincronizado por FENASOJA · Cronograma e Eventos";

  return {
    summary: ev.title,
    description,
    location: ev.location ?? undefined,
    start, end,
    reminders: { useDefault: false, overrides: [{ method: "email", minutes: 1440 }, { method: "email", minutes: 120 }] },
    extendedProperties: { private: { fenasoja_event_id: ev.id } },
  };
}

async function processTask(supa: any, task: any) {
  const { data: conn } = await supa.from("google_calendar_connections")
    .select("*").eq("user_id", task.user_id).maybeSingle();
  if (!conn || conn.status !== "connected" || !conn.secondary_calendar_id) {
    await supa.from("google_sync_outbox").update({
      status: "reconnect_required",
      last_error: "connection_missing_or_disconnected",
    }).eq("id", task.id);
    return;
  }

  const calId = conn.secondary_calendar_id;
  const key = task.user_id;

  const { data: existing } = await supa.from("google_calendar_event_map")
    .select("*").eq("user_id", task.user_id).eq("event_id", task.event_id).is("subevent_id", null).maybeSingle();

  try {
    if (task.operation === "delete") {
      if (existing?.google_event_id) {
        const res = await callGoogle(key, `/calendar/v3/calendars/${calId}/events/${existing.google_event_id}`, { method: "DELETE" });
        if (!res.ok && res.status !== 404 && res.status !== 410) {
          throw new Error(`delete_failed:${res.status}:${await res.text()}`);
        }
        await supa.from("google_calendar_event_map")
          .update({ deleted_at: new Date().toISOString() }).eq("id", existing.id);
      }
    } else {
      const { data: ev } = await supa.from("cronograma_eventos").select("*").eq("id", task.event_id).maybeSingle();
      if (!ev) throw new Error("event_not_found");
      const { data: subs } = await supa.from("cronograma_subeventos")
        .select("title, start_time, end_time").eq("parent_event_id", ev.id).order("sort_order");
      const gEvent = buildGoogleEvent(ev, subs ?? []);
      if (!gEvent) {
        // sem data → remove se existir
        if (existing?.google_event_id) {
          await callGoogle(key, `/calendar/v3/calendars/${calId}/events/${existing.google_event_id}`, { method: "DELETE" }).catch(() => {});
        }
      } else if (existing?.google_event_id && !existing.deleted_at) {
        await callGoogleJson(key, `/calendar/v3/calendars/${calId}/events/${existing.google_event_id}`, {
          method: "PATCH", body: JSON.stringify(gEvent),
        });
      } else {
        const created = await callGoogleJson<{ id: string }>(key, `/calendar/v3/calendars/${calId}/events`, {
          method: "POST", body: JSON.stringify(gEvent),
        });
        await supa.from("google_calendar_event_map").upsert({
          user_id: task.user_id, event_id: task.event_id, subevent_id: null,
          google_event_id: created.id, google_calendar_id: calId,
          content_hash: task.payload_hash, last_synced_at: new Date().toISOString(), deleted_at: null,
        }, { onConflict: "user_id,event_id,subevent_id" });
      }
    }

    await supa.from("google_sync_outbox").update({
      status: "done", updated_at: new Date().toISOString(),
    }).eq("id", task.id);

    if (task.is_initial_backfill) {
      await supa.rpc("noop", {}).catch(() => {});
      // increment backfill counter
      const { data: c } = await supa.from("google_calendar_connections").select("backfill_done").eq("user_id", task.user_id).maybeSingle();
      await supa.from("google_calendar_connections")
        .update({ backfill_done: (c?.backfill_done ?? 0) + 1, last_sync_at: new Date().toISOString() })
        .eq("user_id", task.user_id);
    } else {
      await supa.from("google_calendar_connections")
        .update({ last_sync_at: new Date().toISOString() }).eq("user_id", task.user_id);
    }
  } catch (err) {
    const msg = String((err as Error).message ?? err);
    const is401 = msg.includes(":401:") || msg.includes("unauthorized");
    const is429 = msg.includes(":429:");
    const attempts = task.attempts + 1;
    const backoffSec = is429 ? Math.min(300, 30 * Math.pow(2, attempts)) : Math.min(600, 15 * Math.pow(2, attempts));
    const nextAttempt = new Date(Date.now() + backoffSec * 1000).toISOString();

    if (is401) {
      await supa.from("google_sync_outbox").update({
        status: "reconnect_required", attempts, last_error: msg,
      }).eq("id", task.id);
      await supa.from("google_calendar_connections")
        .update({ status: "reconnect_required", last_error: msg }).eq("user_id", task.user_id);
    } else if (attempts >= 6) {
      await supa.from("google_sync_outbox").update({
        status: "dead_letter", attempts, last_error: msg,
      }).eq("id", task.id);
    } else {
      await supa.from("google_sync_outbox").update({
        status: "failed", attempts, last_error: msg, next_attempt_at: nextAttempt,
      }).eq("id", task.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supa = db();

  // Claim batch
  const { data: batch } = await supa.from("google_sync_outbox")
    .update({ status: "in_flight", updated_at: new Date().toISOString() })
    .in("id",
      (await supa.from("google_sync_outbox")
        .select("id")
        .in("status", ["queued", "failed"])
        .lte("next_attempt_at", new Date().toISOString())
        .order("next_attempt_at", { ascending: true })
        .limit(BATCH)).data?.map((r: any) => r.id) ?? []
    )
    .select();

  const tasks = batch ?? [];
  for (const t of tasks) {
    await processTask(supa, t);
  }

  return new Response(JSON.stringify({ processed: tasks.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
