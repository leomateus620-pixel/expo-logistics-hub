import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anon, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });

    const admin = createClient(supabaseUrl, service, { auth: { persistSession: false } });

    // Comissões do usuário
    const { data: memberships } = await admin
      .from("org_members")
      .select("commission_id, org_id")
      .eq("user_id", user.id).eq("is_active", true);

    const commissionIds = (memberships ?? []).map((m: any) => m.commission_id).filter(Boolean);
    if (commissionIds.length === 0) {
      return new Response(JSON.stringify({ events: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: eventLinks } = await admin
      .from("cronograma_evento_comissoes")
      .select("event_id")
      .in("commission_id", commissionIds);
    const eventIds = Array.from(new Set((eventLinks ?? []).map((r: any) => r.event_id)));
    if (eventIds.length === 0) {
      return new Response(JSON.stringify({ events: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: events } = await admin
      .from("cronograma_eventos")
      .select("id, title, start_date, start_time, end_date, location, category")
      .in("id", eventIds)
      .eq("has_exact_date", true)
      .gte("start_date", today)
      .order("start_date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: false })
      .limit(3);

    return new Response(JSON.stringify({ events: events ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
