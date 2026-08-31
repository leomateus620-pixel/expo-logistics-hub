import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if caller is admin in user_roles OR admin in any org
    const { data: roles } = await adminClient.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin");
    const { data: orgRoles } = await adminClient.from("org_members").select("role").eq("user_id", caller.id).in("role", ["admin", "gestor"]);

    if ((!roles || roles.length === 0) && (!orgRoles || orgRoles.length === 0)) {
      return new Response(JSON.stringify({ error: "Sem permissão de administrador" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { email, password, full_name, org_id, role, cargo, target_user_id, action } = await req.json();
    if (action === "update_identity") {
      if (!target_user_id || !full_name?.trim()) {
        return new Response(JSON.stringify({ error: "Usuário e nome são obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const canonicalName = full_name.trim();
      const { error: authError } = await adminClient.auth.admin.updateUserById(target_user_id, {
        user_metadata: { full_name: canonicalName, name: canonicalName },
      });
      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error: profileError } = await adminClient
        .from("profiles")
        .update({ full_name: canonicalName })
        .eq("user_id", target_user_id);
      if (profileError) {
        return new Response(JSON.stringify({ error: profileError.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "update_email") {
      const newEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
      if (!target_user_id || !newEmail) {
        return new Response(JSON.stringify({ error: "Usuário e e-mail são obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error: emailError } = await adminClient.auth.admin.updateUserById(target_user_id, {
        email: newEmail,
        email_confirm: true,
      });
      if (emailError) {
        return new Response(JSON.stringify({ error: emailError.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email e senha são obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || "" },
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Assign 'user' role in user_roles
    await adminClient.from("user_roles").insert({ user_id: data.user.id, role: "user" });

    // Update profile name
    if (full_name) {
      await adminClient.from("profiles").update({ full_name }).eq("user_id", data.user.id);
    }

    // If org_id provided, add as org_member
    if (org_id) {
      await adminClient.from("org_members").insert({
        org_id,
        user_id: data.user.id,
        role: role || "operador",
        nome_exibicao: full_name || email,
        cargo: cargo || null,
      });
    }

    return new Response(JSON.stringify({ user: data.user }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
