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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { 
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { 
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Check caller is admin
    const { data: orgRoles } = await adminClient
      .from("org_members")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin");
    
    if (!orgRoles || orgRoles.length === 0) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), { 
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const { email, password, full_name, org_id, capabilities } = await req.json();

    // Create user
    const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || "" },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), { 
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const userId = userData.user.id;

    // Add to user_roles
    await adminClient.from("user_roles").insert({ user_id: userId, role: "user" });

    // Update profile
    if (full_name) {
      await adminClient.from("profiles").update({ full_name }).eq("user_id", userId);
    }

    // Add as org_member with 'leitura' role
    if (org_id) {
      await adminClient.from("org_members").insert({
        org_id,
        user_id: userId,
        role: "leitura",
        nome_exibicao: full_name || email,
        cargo: "Mobilidade",
      });
    }

    // Insert capabilities
    if (capabilities && Array.isArray(capabilities) && org_id) {
      const capRows = capabilities.map((cap: string) => ({
        user_id: userId,
        org_id,
        capability: cap,
      }));
      await adminClient.from("user_capabilities").insert(capRows);
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), { 
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Erro interno" }), { 
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
