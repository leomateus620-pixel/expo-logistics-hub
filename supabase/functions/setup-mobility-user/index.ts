import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { setup_key } = await req.json();
    // Simple guard to prevent random calls
    if (setup_key !== "fenasoja2026-setup-mobility") {
      return new Response(JSON.stringify({ error: "Invalid key" }), { 
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const email = "fenasojalog2026@hotmail.com";
    const password = "2026fenasoja";
    const orgId = "985888b8-155f-4bbe-b6b9-6bef2893d99b";

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u: any) => u.email === email);
    
    let userId: string;

    if (existing) {
      userId = existing.id;
    } else {
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Mobilidade Fenasoja" },
      });
      if (error) throw error;
      userId = data.user.id;
    }

    // Ensure user_roles entry
    await adminClient.from("user_roles").upsert(
      { user_id: userId, role: "user" },
      { onConflict: "user_id,role" }
    );

    // Ensure profile
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    
    if (profile) {
      await adminClient.from("profiles").update({ full_name: "Mobilidade Fenasoja" }).eq("user_id", userId);
    }

    // Ensure org_member with leitura role
    const { data: existingMember } = await adminClient
      .from("org_members")
      .select("id")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (!existingMember) {
      await adminClient.from("org_members").insert({
        org_id: orgId,
        user_id: userId,
        role: "leitura",
        nome_exibicao: "Mobilidade Fenasoja",
        cargo: "Mobilidade",
      });
    }

    // Insert capability
    await adminClient.from("user_capabilities").upsert(
      { user_id: userId, org_id: orgId, capability: "mobility_access" },
      { onConflict: "user_id,org_id,capability" }
    );

    return new Response(JSON.stringify({ success: true, user_id: userId }), { 
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Erro interno" }), { 
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
