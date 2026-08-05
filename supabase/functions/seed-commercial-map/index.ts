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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  async function clientForActor(actorUserId: string) {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(actorUserId);
    if (userError) throw userError;
    const email = userData.user?.email;
    if (!email) throw new Error("ACTOR_WITHOUT_EMAIL");

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError) throw linkError;
    const tokenHash = linkData.properties?.hashed_token;
    if (!tokenHash) throw new Error("ACTOR_TOKEN_UNAVAILABLE");

    const actor = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: sessionData, error: sessionError } = await actor.auth.verifyOtp({
      type: "email",
      token_hash: tokenHash,
    });
    if (sessionError) throw sessionError;
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("ACTOR_SESSION_UNAVAILABLE");

    return createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }

  try {
    const body = await req.json();
    const action = String(body.action ?? "sync_reference");

    if (action === "sync_reference") {
      const actorClient = await clientForActor(body.actorUserId);
      const { data, error } = await actorClient.rpc("sync_commercial_map_reference_2026", body.payload);
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
      const actorClient = await clientForActor(body.actorUserId);
      const { data, error } = await actorClient.rpc("publish_commercial_map", {
        p_project_id: body.projectId,
        p_reason: body.reason ?? "Publicação da referência oficial 2026",
      });
      if (error) throw error;
      return json({ result: data });
    }

    if (action === "validate") {
      const client = body.actorUserId ? await clientForActor(body.actorUserId) : admin;
      const { data, error } = await client.rpc("validate_commercial_map_segments", {
        _project_id: body.projectId,
      });
      if (error) throw error;
      return json({ report: data });
    }

    if (action === "inventory") {
      const client = body.actorUserId ? await clientForActor(body.actorUserId) : admin;
      const { data, error } = await client.rpc("get_commission_map_segment_inventory", {
        p_segment_id: body.segmentId,
      });
      if (error) throw error;

      return json({ inventory: data });
    }

    if (action === "probe") {
      const client = await clientForActor(body.actorUserId);
      const { data: segments } = await admin
        .from("map_segments")
        .select("id, slug")
        .eq("project_id", body.projectId);

      const result: Record<string, unknown> = {};
      for (const segment of segments ?? []) {
        const { count: entityCount } = await client
          .from("map_entities")
          .select("id", { count: "exact", head: true })
          .eq("segment_id", segment.id);
        const { data: segmentEntities } = await admin
          .from("map_entities")
          .select("id")
          .eq("segment_id", segment.id);
        const entityIds = (segmentEntities ?? []).map((row) => row.id);
        let lotCount = 0;
        for (let index = 0; index < entityIds.length; index += 50) {
          const { count } = await client
            .from("commercial_lots")
            .select("id", { count: "exact", head: true })
            .in("entity_id", entityIds.slice(index, index + 50));
          lotCount += count ?? 0;
        }
        const inventory = await client.rpc("get_commission_map_segment_inventory", {
          p_segment_id: segment.id,
        });
        result[segment.slug] = {
          entities: entityCount ?? 0,
          lots: lotCount ?? 0,
          inventory: inventory.error ? `ERROR: ${inventory.error.message}` : inventory.data,
        };
      }

      const { count: calibrations } = await client
        .from("map_calibrations")
        .select("id", { count: "exact", head: true });
      const { count: visibleSegments } = await client
        .from("map_segments")
        .select("id", { count: "exact", head: true });

      return json({ segments: result, calibrations: calibrations ?? 0, visibleSegments: visibleSegments ?? 0 });
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
