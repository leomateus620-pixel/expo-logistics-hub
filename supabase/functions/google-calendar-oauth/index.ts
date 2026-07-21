import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  startOAuth,
  probeConnection,
  ensureSecondaryCalendar,
  callGoogleJson,
} from "../_shared/googleCalendarGateway.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(supabaseUrl, service, { auth: { persistSession: false } });
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const supa = createClient(supabaseUrl, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) throw new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
  return user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = (url.searchParams.get("action") ?? (body as { action?: string }).action) as string | undefined;
    const user = await requireUser(req);
    const db = admin();

    if (action === "start") {
      const returnUrl = (body as { returnUrl?: string }).returnUrl || `${url.origin}/settings?google=connected`;
      const orgId = (body as { orgId?: string }).orgId;
      const oauth = await startOAuth(returnUrl, user.id);
      await db.from("google_calendar_connections").upsert({
        user_id: user.id,
        org_id: orgId,
        status: "connecting",
      }, { onConflict: "user_id" });
      return new Response(JSON.stringify(oauth), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset") {
      // Remove qualquer registro não conectado do usuário para permitir recomeçar o fluxo.
      await db.from("google_calendar_connections")
        .delete()
        .eq("user_id", user.id)
        .neq("status", "connected");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "complete") {
      const orgId = (body as { orgId?: string }).orgId;

      const ok = await probeConnection(user.id);
      if (!ok) {
        await db.from("google_calendar_connections")
          .update({ status: "error", last_error: "no_connection" })
          .eq("user_id", user.id);
        return new Response(JSON.stringify({ error: "no_connection" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Cria calendário secundário
      const calId = await ensureSecondaryCalendar(user.id);

      // Busca email do usuário no Google
      let email: string | null = null;
      try {
        const profile = await callGoogleJson<{ email?: string }>(user.id, "/oauth2/v2/userinfo");
        email = profile.email ?? null;
      } catch { /* ignore */ }

      await db.from("google_calendar_connections").upsert({
        user_id: user.id,
        org_id: orgId,
        google_email: email,
        secondary_calendar_id: calId,
        status: "connected",
        scopes_granted: ["calendar", "calendar.events", "userinfo.email", "userinfo.profile"],
        connected_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      // Enfileira backfill: todos os eventos das comissões do usuário
      const { data: events } = await db
        .from("cronograma_evento_comissoes")
        .select("event_id, org_id, commission_id, org_members!inner(user_id)")
        .eq("org_members.user_id", user.id)
        .eq("org_id", orgId);

      const rows = (events ?? []).map((e: any) => ({
        user_id: user.id,
        org_id: e.org_id,
        event_id: e.event_id,
        operation: "upsert",
        dedupe_key: `${user.id}|${e.event_id}|upsert|backfill`,
        is_initial_backfill: true,
      }));
      if (rows.length > 0) {
        await db.from("google_sync_outbox").upsert(rows, { onConflict: "dedupe_key" });
        await db.from("google_calendar_connections")
          .update({ backfill_total: rows.length, backfill_done: 0 })
          .eq("user_id", user.id);
      }

      return new Response(JSON.stringify({ ok: true, calendarId: calId, backfill: rows.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      // Cancela outbox pendente e apaga conexão. Não apaga eventos já criados no Google (usuário controla).
      await db.from("google_sync_outbox").update({ status: "cancelled" })
        .eq("user_id", user.id).in("status", ["queued", "failed"]);
      await db.from("google_calendar_connections").delete().eq("user_id", user.id);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "status") {
      const { data: conn } = await db.from("google_calendar_connections")
        .select("*").eq("user_id", user.id).maybeSingle();
      const { data: pending } = await db.from("google_sync_outbox")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id).in("status", ["queued", "failed", "in_flight"]);
      return new Response(JSON.stringify({ connection: conn, pending: pending?.length ?? 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown_action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("google-calendar-oauth error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
