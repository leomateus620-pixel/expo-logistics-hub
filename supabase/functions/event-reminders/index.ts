import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("REMINDER_FROM_EMAIL") ?? "cronograma@fenasojagestao.com";

function db() {
  return createClient(supabaseUrl, service, { auth: { persistSession: false } });
}

/** Materializa entregas de lembrete para eventos futuros com data definida. */
async function scheduleReminders(supa: any) {
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 86400_000);

  // Eventos futuros com data
  const { data: events } = await supa.from("cronograma_eventos")
    .select("id, org_id, title, start_date, start_time, lock_version, has_exact_date")
    .eq("has_exact_date", true)
    .gte("start_date", now.toISOString().slice(0, 10))
    .lte("start_date", horizon.toISOString().slice(0, 10));

  for (const ev of events ?? []) {
    const startStr = `${ev.start_date}T${ev.start_time ?? "08:00"}:00-03:00`;
    const startAt = new Date(startStr);
    if (isNaN(startAt.getTime())) continue;

    // Usuários vinculados
    const { data: members } = await supa
      .from("cronograma_evento_comissoes")
      .select("commission_id, org_id, org_members!inner(user_id, email, is_active)")
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

async function sendPending(supa: any) {
  const now = new Date().toISOString();
  const { data: batch } = await supa.from("event_reminder_deliveries")
    .select("*, cronograma_eventos(title, start_date, start_time, location)")
    .eq("status", "pending").lte("scheduled_for", now).limit(50);

  for (const d of batch ?? []) {
    // Busca email do usuário
    const { data: authUser } = await supa.auth.admin.getUserById(d.user_id);
    const email = authUser?.user?.email;
    if (!email) {
      await supa.from("event_reminder_deliveries").update({
        status: "skipped", last_error: "no_email",
      }).eq("id", d.id);
      continue;
    }

    const ev = (d as any).cronograma_eventos;
    const when = d.offset_minutes >= 1440 ? "amanhã" : "em 2 horas";
    const subject = `Lembrete: ${ev?.title ?? "Evento"} — ${when}`;
    const html = `
      <div style="font-family:system-ui,-apple-system,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#faf7ef;border-radius:12px;border:1px solid #e5dfc7">
        <h2 style="color:#0a2540;margin:0 0 12px">📅 ${ev?.title ?? "Evento"}</h2>
        <p style="color:#3b4a63">Este é o lembrete automático — o evento começa <strong>${when}</strong>.</p>
        <ul style="color:#0a2540;line-height:1.8">
          <li><strong>Data:</strong> ${ev?.start_date ?? "—"}${ev?.start_time ? ` às ${ev.start_time}` : ""}</li>
          ${ev?.location ? `<li><strong>Local:</strong> ${ev.location}</li>` : ""}
        </ul>
        <p style="color:#6b7a99;font-size:12px;margin-top:20px">FENASOJA · Cronograma e Eventos</p>
      </div>`;

    try {
      if (!RESEND_API_KEY) throw new Error("no_resend_key");
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: FROM_EMAIL, to: [email], subject, html }),
      });
      if (!res.ok) throw new Error(`resend:${res.status}:${await res.text()}`);
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
