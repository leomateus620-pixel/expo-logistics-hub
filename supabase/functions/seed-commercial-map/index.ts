import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-seed-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const expected = Deno.env.get("MAP_SEED_ADMIN_TOKEN");
  const provided = req.headers.get("x-seed-token");
  if (!expected || !provided || provided !== expected) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json();
    const action = String(body.action ?? "sync_reference");

    if (action === "sync_reference") {
      const { data, error } = await admin.rpc("sync_commercial_map_reference_2026", body.payload);
      if (error) throw error;
      return json({ projectId: data });
    }

    if (action === "ensure_segments") {
      const { error } = await admin.rpc("ensure_commission_map_segments", {
        _project_id: body.projectId,
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "publish") {
      const { data, error } = await admin.rpc("publish_commercial_map", {
        p_project_id: body.projectId,
        p_reason: body.reason ?? "Publicação da referência oficial 2026",
      });
      if (error) throw error;
      return json({ result: data });
    }

    if (action === "validate") {
      const { data, error } = await admin.rpc("validate_commercial_map_segments", {
        _project_id: body.projectId,
      });
      if (error) throw error;
      return json({ report: data });
    }

    if (action === "inventory") {
      const { data, error } = await admin.rpc("get_commission_map_segment_inventory", {
        p_segment_id: body.segmentId,
      });
      if (error) throw error;
      return json({ inventory: data });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    return json({ error: (error as Error).message, details: error }, 400);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
