import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  EVENT_TIME_ZONE,
  eventDateDiagnosticShape,
  normalizeEventDateTime,
} from "../_shared/eventDateTime.ts";
import {
  buildCronogramaEventUrl,
  buildGoogleCalendarEventUrl,
} from "../_shared/eventReminderModel.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function db() {
  return createClient(supabaseUrl, service, { auth: { persistSession: false } });
}

interface EventDateFields {
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
}

interface ScheduledEventRow extends EventDateFields {
  id: string;
  org_id: string;
  title: string;
  lock_version: number | null;
  has_exact_date: boolean;
}

interface EmailEventRow extends EventDateFields {
  id: string;
  org_id: string;
  title: string;
  location: string | null;
  pending_reason: string | null;
  decision_needed: string | null;
  commission_name: string | null;
}

interface EventRelationRow {
  event_id: string;
  commission_id: string | null;
  commission_name_snapshot: string | null;
  relation_role?: string | null;
  commissions?: { nome?: string | null } | Array<{ nome?: string | null }> | null;
}

interface OrgMemberRow {
  user_id: string;
  org_id?: string;
  commission_id: string | null;
  is_active?: boolean;
}

interface ReminderDeliveryRow {
  id: string;
  user_id: string;
  org_id: string;
  event_id: string;
  event_version: number;
  offset_minutes: number;
  scheduled_for: string;
  updated_at: string;
}

interface SubeventRow {
  parent_event_id: string;
  title: string;
  start_date: string | null;
  start_time: string | null;
  status: string;
  sort_order: number;
}

interface GoogleEventMapRow {
  user_id: string;
  event_id: string;
  google_event_id: string | null;
  google_calendar_id: string | null;
  deleted_at: string | null;
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireServiceRole(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  return Boolean(service && token && token === service);
}

function saoPauloDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addUtcDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function relationName(link: EventRelationRow) {
  const joined = Array.isArray(link.commissions) ? link.commissions[0] : link.commissions;
  return String(joined?.nome ?? link.commission_name_snapshot ?? "").trim() || null;
}

/** Materializa entregas de lembrete para eventos futuros com data definida. */
async function scheduleReminders(supa: ReturnType<typeof db>) {
  const now = new Date();
  const today = saoPauloDateString(now);
  const horizon = addUtcDays(today, 30);

  const { data: events, error: eventsError } = await supa.from("cronograma_eventos")
    .select("id, org_id, title, start_date, end_date, start_time, end_time, lock_version, has_exact_date, event_type")
    .eq("has_exact_date", true)
    .neq("event_type", "feriado")
    .gte("start_date", today)
    .lte("start_date", horizon);
  if (eventsError) throw new Error("reminder_events_query_failed");

  // Global recipients: users with capability 'cronograma_reminder_all' receive reminders for every non-holiday event of their org.
  const { data: globalCaps } = await supa
    .from("user_capabilities")
    .select("user_id, org_id")
    .eq("capability", "cronograma_reminder_all");
  const globalByOrg = new Map<string, Array<{ user_id: string; org_id: string }>>();
  for (const cap of (globalCaps ?? []) as Array<{ user_id: string; org_id: string }>) {
    const list = globalByOrg.get(cap.org_id) ?? [];
    list.push({ user_id: cap.user_id, org_id: cap.org_id });
    globalByOrg.set(cap.org_id, list);
  }

  for (const event of (events ?? []) as ScheduledEventRow[]) {
    const normalized = normalizeEventDateTime({
      date: event.start_date,
      startTime: event.start_time,
      endDate: event.end_date,
      endTime: event.end_time,
    });
    if (!normalized.ok) {
      console.error("event_reminder_invalid_datetime", {
        eventId: event.id,
        reason: normalized.error,
        ...eventDateDiagnosticShape({
          date: event.start_date,
          startTime: event.start_time,
          endDate: event.end_date,
          endTime: event.end_time,
        }),
      });
      continue;
    }

    const recipients = new Map<string, { user_id: string; org_id: string }>();

    const { data: links, error: linksError } = await supa
      .from("cronograma_evento_comissoes")
      .select("commission_id, org_id")
      .eq("event_id", event.id)
      .not("commission_id", "is", null);
    if (linksError) {
      console.error("event_reminder_relations_query_failed", { eventId: event.id });
    }
    const commissionIds = [...new Set(
      ((links ?? []) as Array<{ commission_id: string | null }>)
        .map((link) => link.commission_id)
        .filter((id): id is string => Boolean(id)),
    )];

    if (commissionIds.length) {
      const { data: members, error: membersError } = await supa
        .from("org_members")
        .select("user_id, org_id, commission_id, is_active")
        .eq("org_id", event.org_id)
        .eq("is_active", true)
        .in("commission_id", commissionIds);
      if (membersError) {
        console.error("event_reminder_members_query_failed", { eventId: event.id });
      }
      for (const member of (members ?? []) as OrgMemberRow[]) {
        if (member.user_id && member.org_id) {
          recipients.set(member.user_id, { user_id: member.user_id, org_id: member.org_id });
        }
      }
    }

    for (const globalRecipient of globalByOrg.get(event.org_id) ?? []) {
      recipients.set(globalRecipient.user_id, globalRecipient);
    }

    if (!recipients.size) continue;

    for (const offsetMinutes of [1440, 120]) {
      const scheduledFor = new Date(normalized.value.scheduleAt.getTime() - offsetMinutes * 60_000);
      if (scheduledFor <= now) continue;
      for (const recipient of recipients.values()) {
        const eventVersion = event.lock_version ?? 0;
        const idempotencyKey = `${recipient.user_id}|${event.id}|${eventVersion}|${offsetMinutes}`;
        const { error } = await supa.from("event_reminder_deliveries").upsert({
          user_id: recipient.user_id,
          org_id: recipient.org_id,
          event_id: event.id,
          event_version: eventVersion,
          offset_minutes: offsetMinutes,
          scheduled_for: scheduledFor.toISOString(),
          idempotency_key: idempotencyKey,
          status: "pending",
          last_error: null,
        }, { onConflict: "idempotency_key", ignoreDuplicates: true });
        if (error) console.error("event_reminder_schedule_failed", { eventId: event.id, offsetMinutes });
      }
    }
  }
}

async function sendPending(supa: ReturnType<typeof db>) {
  const { data: batch, error: batchError } = await supa.from("event_reminder_deliveries")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(50);
  if (batchError) throw new Error("reminder_batch_query_failed");
  const deliveries = (batch ?? []) as ReminderDeliveryRow[];
  if (!deliveries.length) return;

  const eventIds = [...new Set(deliveries.map((delivery) => delivery.event_id))];
  const userIds = [...new Set(deliveries.map((delivery) => delivery.user_id))];
  const { data: events } = await supa.from("cronograma_eventos")
    .select("id, org_id, title, start_date, end_date, start_time, end_time, location, pending_reason, decision_needed, commission_name")
    .in("id", eventIds);
  const { data: links } = await supa.from("cronograma_evento_comissoes")
    .select("event_id, commission_id, commission_name_snapshot, relation_role, commissions(nome)")
    .in("event_id", eventIds);
  const { data: subevents } = await supa.from("cronograma_subeventos")
    .select("parent_event_id, title, start_date, start_time, status, sort_order")
    .in("parent_event_id", eventIds)
    .order("sort_order", { ascending: true });
  const relationRows = (links ?? []) as EventRelationRow[];
  const commissionIds = [...new Set(
    relationRows.map((link) => link.commission_id).filter((id): id is string => Boolean(id)),
  )];
  const { data: memberships } = commissionIds.length
    ? await supa.from("org_members")
      .select("user_id, commission_id, is_active")
      .eq("is_active", true)
      .in("user_id", userIds)
      .in("commission_id", commissionIds)
    : { data: [] };
  const { data: googleMaps } = await supa.from("google_calendar_event_map")
    .select("user_id, event_id, google_event_id, google_calendar_id, deleted_at")
    .in("user_id", userIds)
    .in("event_id", eventIds)
    .is("subevent_id", null)
    .is("deleted_at", null);

  const eventById = new Map(
    ((events ?? []) as EmailEventRow[]).map((event) => [event.id, event]),
  );
  const linksByEvent = new Map<string, EventRelationRow[]>();
  for (const link of relationRows) {
    const collection = linksByEvent.get(link.event_id) ?? [];
    collection.push(link);
    linksByEvent.set(link.event_id, collection);
  }
  const subeventsByEvent = new Map<string, SubeventRow[]>();
  for (const subevent of (subevents ?? []) as SubeventRow[]) {
    if (subevent.status === "cancelado") continue;
    const collection = subeventsByEvent.get(subevent.parent_event_id) ?? [];
    collection.push(subevent);
    subeventsByEvent.set(subevent.parent_event_id, collection);
  }
  const membershipKeys = new Set(
    ((memberships ?? []) as OrgMemberRow[]).map((member) => `${member.user_id}|${member.commission_id}`),
  );
  const googleMapByRecipientEvent = new Map(
    ((googleMaps ?? []) as GoogleEventMapRow[])
      .map((map) => [`${map.user_id}|${map.event_id}`, map] as const),
  );

  for (const delivery of deliveries) {
    // Optimistic claim: concurrent scheduler invocations may read the same pending
    // row, but only one can advance its updated_at version and send the message.
    const { data: deliveryClaim, error: claimError } = await supa
      .from("event_reminder_deliveries")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", delivery.id)
      .eq("status", "pending")
      .eq("updated_at", delivery.updated_at)
      .select("id")
      .maybeSingle();
    if (claimError) {
      console.error("event_reminder_claim_failed", {
        deliveryId: delivery.id,
        reason: "optimistic_claim_failed",
      });
      continue;
    }
    if (!deliveryClaim) continue;

    const event = eventById.get(delivery.event_id);
    if (!event) {
      await supa.from("event_reminder_deliveries").update({
        status: "failed", last_error: "event_not_found",
      }).eq("id", delivery.id);
      continue;
    }

    const normalized = normalizeEventDateTime({
      date: event.start_date,
      startTime: event.start_time,
      endDate: event.end_date,
      endTime: event.end_time,
    });
    if (!normalized.ok) {
      console.error("event_reminder_send_blocked_invalid_datetime", {
        deliveryId: delivery.id,
        eventId: delivery.event_id,
        reason: normalized.error,
        ...eventDateDiagnosticShape({
          date: event.start_date,
          startTime: event.start_time,
          endDate: event.end_date,
          endTime: event.end_time,
        }),
      });
      await supa.from("event_reminder_deliveries").update({
        status: "failed",
        last_error: `invalid_event_datetime:${normalized.error}`,
      }).eq("id", delivery.id);
      continue;
    }

    const { data: authUser } = await supa.auth.admin.getUserById(delivery.user_id);
    const email = authUser?.user?.email;
    if (!email) {
      await supa.from("event_reminder_deliveries").update({
        status: "skipped", last_error: "recipient_email_missing",
      }).eq("id", delivery.id);
      continue;
    }

    const eventLinks = linksByEvent.get(delivery.event_id) ?? [];
    const recipientLinks = eventLinks.filter((link) =>
      !link.commission_id || membershipKeys.has(`${delivery.user_id}|${link.commission_id}`));
    const commissionNames = [...new Set(
      recipientLinks.map(relationName).filter((name): name is string => Boolean(name)),
    )];
    if (!commissionNames.length && event.commission_name) commissionNames.push(String(event.commission_name));

    const relatedSubevents = (subeventsByEvent.get(delivery.event_id) ?? []).slice(0, 6).map((subevent) => {
      const subeventDate = subevent.start_date
        ? normalizeEventDateTime({ date: subevent.start_date, startTime: subevent.start_time })
        : null;
      const detail = subeventDate?.ok
        ? `${subeventDate.value.dateCompact} · ${subeventDate.value.timeLabel}`
        : null;
      return { title: subevent.title, detail };
    });
    const pendingItems = [event.pending_reason, event.decision_needed].filter(Boolean);
    const googleMap = googleMapByRecipientEvent.get(`${delivery.user_id}|${delivery.event_id}`);

    try {
      const { data, error } = await supa.functions.invoke("send-transactional-email", {
        body: {
          templateName: "event-reminder",
          recipientEmail: email,
          idempotencyKey: `reminder-${delivery.event_id}-${delivery.event_version}-${delivery.offset_minutes}-${delivery.user_id}`,
          templateData: {
            eventTitle: event.title,
            reminderType: delivery.offset_minutes >= 1440 ? "24h" : "2h",
            dateLabel: normalized.value.dateLong,
            timeLabel: normalized.value.timeLabel,
            location: event.location ?? null,
            commissionNames,
            subevents: relatedSubevents,
            pendingItems,
            ctaUrl: buildCronogramaEventUrl(delivery.event_id),
            googleCalendarUrl: buildGoogleCalendarEventUrl(
              googleMap?.google_event_id,
              googleMap?.google_calendar_id,
            ),
          },
        },
      });
      if (error) throw new Error("transactional_email_request_failed");
      if (data?.success === false) {
        await supa.from("event_reminder_deliveries").update({
          status: "skipped", last_error: String(data.reason ?? "email_not_sent"),
        }).eq("id", delivery.id);
        continue;
      }
      await supa.from("event_reminder_deliveries").update({
        status: "sent", sent_at: new Date().toISOString(), last_error: null,
      }).eq("id", delivery.id);
    } catch (error) {
      console.error("event_reminder_delivery_failed", {
        deliveryId: delivery.id,
        eventId: delivery.event_id,
        reason: String((error as Error).message ?? "send_failed").slice(0, 120),
      });
      await supa.from("event_reminder_deliveries").update({
        status: "failed", last_error: "transactional_email_failed",
      }).eq("id", delivery.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!requireServiceRole(req)) return json({ error: "unauthorized" }, 401);
  const mode = new URL(req.url).searchParams.get("mode") ?? "both";
  if (!["schedule", "send", "both"].includes(mode)) return json({ error: "invalid_mode" }, 400);

  try {
    const supa = db();
    if (mode === "schedule" || mode === "both") await scheduleReminders(supa);
    if (mode === "send" || mode === "both") await sendPending(supa);
    return json({ ok: true, mode });
  } catch (error) {
    console.error("event_reminders_job_failed", {
      mode,
      reason: String((error as Error).message ?? "job_failed").slice(0, 120),
    });
    return json({ error: "job_failed" }, 500);
  }
});
