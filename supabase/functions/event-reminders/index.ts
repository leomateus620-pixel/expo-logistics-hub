import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function db() {
  return createClient(supabaseUrl, service, { auth: { persistSession: false } });
}

/** Materializa entregas de lembrete para eventos futuros com data definida. */
async function scheduleReminders(supa: any) {
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 86400_000);

  const { data: events } = await supa.from("cronograma_eventos")
    .select("id, org_id, title, start_date, start_time, lock_version, has_exact_date")
    .eq("has_exact_date", true)
    .gte("start_date", now.toISOString().slice(0, 10))
    .lte("start_date", horizon.toISOString().slice(0, 10));

  for (const ev of events ?? []) {
    const startStr = `${ev.start_date}T${ev.start_time ?? "08:00"}:00-03:00`;
    const startAt = new Date(startStr);
    if (isNaN(startAt.getTime())) continue;

    const { data: members } = await supa
      .from("cronograma_evento_comissoes")
      .select("commission_id, org_id, org_members!inner(user_id, is_active)")
      .eq("event_id", ev.id);

    const userSet = new Map<string, { user_id: string; org_id: string }>();
    for (const m of members ?? []) {
      const om = (m as any).org_members;
      if (om?.is_active && om.user_id) {
        userSet.set(om.user_id, { user_id: om.user_id, org_id: (m as any).org_id });
      }
    }

    for (const offset of [1440, 120]) {
      const scheduledFor = new Date(startAt.getTime() - offset * 60_000);
      if (scheduledFor <= now) continue;
      for (const u of userSet.values()) {
        const idem = `${u.user_id}|${ev.id}|${ev.lock_version ?? 0}|${offset}`;
        await supa.from("event_reminder_deliveries").upsert({
          user_id: u.user_id, org_id: u.org_id, event_id: ev.id,
          event_version: ev.lock_version ?? 0, offset_minutes: offset,
          scheduled_for: scheduledFor.toISOString(),
          idempotency_key: idem,
          status: "pending",
        }, { onConflict: "idempotency_key" });
      }
    }
  }
}

function formatWhen(date: string, time: string | null) {
  const [y, m, d] = date.split("-");
  const dt = new Date(`${date}T${time ?? "08:00"}:00-03:00`);
  const weekday = dt.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" });
  const label = `${d}/${m}/${y}${time ? ` às ${time.slice(0, 5)}` : ""}`;
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${label}`;
}

async function sendPending(supa: any) {
  const now = new Date().toISOString();
  const { data: batch } = await supa.from("event_reminder_deliveries")
    .select("*, cronograma_eventos(title, start_date, start_time, location)")
    .eq("status", "pending").lte("scheduled_for", now).limit(50);

  for (const d of batch ?? []) {
    const { data: authUser } = await supa.auth.admin.getUserById(d.user_id);
    const email = authUser?.user?.email;
    if (!email) {
      await supa.from("event_reminder_deliveries").update({
        status: "skipped", last_error: "no_email",
      }).eq("id", d.id);
      continue;
    }

    const ev = (d as any).cronograma_eventos;
    const whenRelative = d.offset_minutes >= 1440 ? "amanhã" : "em 2 horas";
    const whenAbsolute = ev ? formatWhen(ev.start_date, ev.start_time) : "";

    try {
      const { error } = await supa.functions.invoke("send-transactional-email", {
        body: {
          templateName: "event-reminder",
          recipientEmail: email,
          idempotencyKey: `reminder-${d.event_id}-${d.offset_minutes}-${d.user_id}`,
          templateData: {
            eventTitle: ev?.title ?? "Evento",
            whenRelative,
            whenAbsolute,
            location: ev?.location ?? null,
            ctaUrl: `https://fenasojagestao.com/cronograma-eventos?eventId=${d.event_id}`,
          },
        },
      });
      if (error) throw new Error(error.message);
      await supa.from("event_reminder_deliveries").update({
        status: "sent", sent_at: new Date().toISOString(),
      }).eq("id", d.id);
    } catch (err) {
      await supa.from("event_reminder_deliveries").update({
        status: "failed", last_error: String((err as Error).message ?? err),
      }).eq("id", d.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "both";
  const supa = db();
  if (mode === "schedule" || mode === "both") await scheduleReminders(supa);
  if (mode === "send" || mode === "both") await sendPending(supa);
  return new Response(JSON.stringify({ ok: true, mode }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
