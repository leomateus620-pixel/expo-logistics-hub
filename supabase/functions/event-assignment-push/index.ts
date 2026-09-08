import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { normalizeEventDateTime } from "../_shared/eventDateTime.ts";
import { buildAssignmentPushMessage } from "../_shared/pushMessage.ts";

// Avisa no celular quem acabou de ser vinculado a um evento (pessoa ou comissão).
// Mesma infraestrutura do lembrete de 1 hora: só muda o gatilho.
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const workerToken = Deno.env.get("EVENT_REMINDERS_WORKER_TOKEN") ?? "";

const BATCH_SIZE = 100;

interface PendingRow {
  id: string;
  event_id: string;
  user_id: string;
  org_id: string;
  source: "responsible" | "commission";
}

interface EventRow {
  id: string;
  title: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function authorized(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (service && token && token === service) return true;
  const wt = req.headers.get("X-Worker-Token") ?? "";
  return Boolean(workerToken && wt && wt === workerToken);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401);

  const supa = createClient(supabaseUrl, service, { auth: { persistSession: false } });

  const { data: pending, error: pendingError } = await supa
    .from("event_assignment_notifications")
    .select("id, event_id, user_id, org_id, source")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (pendingError) {
    console.error("assignment_push_pending_query_failed", pendingError);
    return json({ error: "pending_query_failed" }, 500);
  }

  const rows = (pending ?? []) as PendingRow[];
  if (!rows.length) return json({ processed: 0, sent: 0, skipped: 0 });

  // Só envia para quem registrou aparelho ativo; os demais são marcados como ignorados.
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data: devices } = await supa
    .from("push_devices")
    .select("user_id")
    .is("revoked_at", null)
    .in("user_id", userIds);
  const withDevice = new Set(((devices ?? []) as Array<{ user_id: string }>).map((d) => d.user_id));

  const eventIds = [...new Set(rows.map((row) => row.event_id))];
  const { data: events } = await supa
    .from("cronograma_eventos")
    .select("id, title, location, start_date, end_date, start_time, end_time, status")
    .in("id", eventIds);
  const eventById = new Map(((events ?? []) as EventRow[]).map((event) => [event.id, event]));

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const event = eventById.get(row.event_id);
    const nowIso = new Date().toISOString();

    if (!event || (event.status ?? "") === "cancelled") {
      await supa.from("event_assignment_notifications")
        .update({ status: "skipped", error_message: "event_unavailable" })
        .eq("id", row.id);
      skipped += 1;
      continue;
    }

    if (!withDevice.has(row.user_id)) {
      await supa.from("event_assignment_notifications")
        .update({ status: "skipped", error_message: "no_active_device" })
        .eq("id", row.id);
      skipped += 1;
      continue;
    }

    const normalized = normalizeEventDateTime({
      date: event.start_date,
      startTime: event.start_time,
      endDate: event.end_date,
      endTime: event.end_time,
    });

    const message = buildAssignmentPushMessage({
      eventTitle: event.title,
      dateLabel: normalized.ok ? normalized.value.dateLong : null,
      timeLabel: normalized.ok ? normalized.value.timeLabel : null,
      location: event.location,
      eventId: event.id,
      source: row.source,
    });

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${service}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: row.user_id,
          eventId: row.event_id,
          title: message.title,
          body: message.body,
          path: message.path,
        }),
      });
      const raw = await res.text();
      let payload: Record<string, unknown> | null = null;
      try { payload = JSON.parse(raw); } catch { /* keep raw */ }

      if (!res.ok) {
        console.error("assignment_push_http_failed", { id: row.id, status: res.status, body: raw.slice(0, 200) });
        await supa.from("event_assignment_notifications")
          .update({ status: "failed", error_message: `push_http_${res.status}` })
          .eq("id", row.id);
        failed += 1;
        continue;
      }

      if (payload && payload.success === false) {
        await supa.from("event_assignment_notifications")
          .update({ status: "skipped", error_message: String(payload.reason ?? "push_not_sent") })
          .eq("id", row.id);
        skipped += 1;
        continue;
      }

      await supa.from("event_assignment_notifications")
        .update({ status: "sent", sent_at: nowIso, error_message: null })
        .eq("id", row.id);
      sent += 1;
    } catch (error) {
      console.error("assignment_push_send_failed", { id: row.id, error: String(error) });
      await supa.from("event_assignment_notifications")
        .update({ status: "failed", error_message: String(error).slice(0, 200) })
        .eq("id", row.id);
      failed += 1;
    }
  }

  return json({ processed: rows.length, sent, skipped, failed });
});
