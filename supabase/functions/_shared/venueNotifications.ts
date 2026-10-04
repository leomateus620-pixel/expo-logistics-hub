// Avisos no celular da Agenda Restaurante e Arena.
// Reaproveita send-push-notification; a fila é venue_notification_deliveries.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const INACTIVE = new Set(["cancelado", "recusado"]);
const BATCH = 100;

interface DeliveryRow {
  id: string;
  venue_event_id: string;
  user_id: string;
  kind: "created" | "changed" | "cancelled" | "reminder_60";
  event_version: number;
}

interface VenueRow {
  id: string;
  title: string;
  status: string;
  start_at: string | null;
  version: number;
}

const KIND_TITLE: Record<DeliveryRow["kind"], string> = {
  created: "Novo evento",
  changed: "Evento alterado",
  cancelled: "Evento cancelado",
  reminder_60: "Evento em 1 hora",
};

export function venuePushPath(eventId: string) {
  return `/eventos-restaurante-arena?evento=${eventId}`;
}

export function formatSaoPaulo(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export async function processVenueDeliveries(
  supa: SupabaseClient,
  supabaseUrl: string,
  serviceKey: string,
) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supa.from("venue_notification_deliveries")
    .select("id, venue_event_id, user_id, kind, event_version")
    .eq("status", "pending").lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true }).limit(BATCH);
  if (error) {
    console.error("venue_push_pending_query_failed", error);
    return { processed: 0, sent: 0, skipped: 0, failed: 0 };
  }
  const rows = (data ?? []) as DeliveryRow[];
  if (!rows.length) return { processed: 0, sent: 0, skipped: 0, failed: 0 };

  const eventIds = [...new Set(rows.map((r) => r.venue_event_id))];
  const { data: events } = await supa.from("venue_events")
    .select("id, title, status, start_at, version").in("id", eventIds);
  const byId = new Map(((events ?? []) as VenueRow[]).map((e) => [e.id, e]));

  const spaceNames = new Map<string, string>();
  const { data: spaces } = await supa.from("venue_event_spaces")
    .select("event_id, venue_spaces(name)").in("event_id", eventIds);
  for (const s of (spaces ?? []) as Array<{ event_id: string; venue_spaces: { name?: string } | null }>) {
    const name = s.venue_spaces?.name;
    if (!name) continue;
    spaceNames.set(s.event_id, [spaceNames.get(s.event_id), name].filter(Boolean).join(", "));
  }

  const recipientCache = new Map<string, Set<string>>();
  const pushRecipients = async (eventId: string) => {
    if (!recipientCache.has(eventId)) {
      const { data: rec } = await supa.rpc("venue_notification_recipients", { _event_id: eventId });
      recipientCache.set(eventId, new Set(
        ((rec ?? []) as Array<{ user_id: string; push_enabled: boolean }>).filter((r) => r.push_enabled).map((r) => r.user_id),
      ));
    }
    return recipientCache.get(eventId)!;
  };

  let sent = 0, skipped = 0, failed = 0;
  const mark = (id: string, patch: Record<string, unknown>) =>
    supa.from("venue_notification_deliveries").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");

  for (const row of rows) {
    const event = byId.get(row.venue_event_id);
    if (!event) { await mark(row.id, { status: "skipped", error_message: "event_unavailable" }); skipped++; continue; }
    if (row.kind === "reminder_60" && (INACTIVE.has(event.status) || event.version !== row.event_version)) {
      await mark(row.id, { status: "cancelled", error_message: "event_changed" }); skipped++; continue;
    }
    // Revalida o acesso no envio (quem perdeu acesso não recebe detalhes).
    if (!(await pushRecipients(row.venue_event_id)).has(row.user_id)) {
      await mark(row.id, { status: "skipped", error_message: "not_eligible" }); skipped++; continue;
    }

    const parts = [formatSaoPaulo(event.start_at), spaceNames.get(event.id)].filter(Boolean);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: row.user_id,
          title: `${KIND_TITLE[row.kind]}: ${event.title}`,
          body: parts.join(" · "),
          path: venuePushPath(event.id),
          templateName: `venue-${row.kind}`,
        }),
      });
      const raw = await res.text();
      let payload: Record<string, unknown> | null = null;
      try { payload = JSON.parse(raw); } catch { /* raw */ }
      if (!res.ok) {
        await mark(row.id, { status: "failed", error_message: `push_http_${res.status}` }); failed++; continue;
      }
      if (payload && payload.success === false) {
        await mark(row.id, { status: "skipped", error_message: String(payload.reason ?? "push_not_sent") }); skipped++; continue;
      }
      await mark(row.id, { status: "sent", sent_at: new Date().toISOString(), error_message: null }); sent++;
    } catch (err) {
      await mark(row.id, { status: "failed", error_message: String(err).slice(0, 200) }); failed++;
    }
  }
  return { processed: rows.length, sent, skipped, failed };
}
