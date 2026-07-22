// One-shot bootstrap: create/refresh Presidente, Vice, Assessoria de Marketing
// and grant them the 'cronograma_reminder_all' capability.
// verify_jwt is false; delete this function right after execution.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ORG_ID = "985888b8-155f-4bbe-b6b9-6bef2893d99b";
const CENTRAL_COMMISSION_ID = "d85594df-142b-46f1-a5af-598b7d504efd";

const USERS = [
  { email: "soltis.fs@gmail.com", full_name: "Soltis", cargo: "Presidente FENASOJA 2028" },
  { email: "djeisondrey@gmail.com", full_name: "Djeison Drey", cargo: "Vice-presidente FENASOJA 2028" },
  { email: "zelia.savoldi@hotmail.com", full_name: "Zélia Savoldi", cargo: "Assessoria de Marketing" },
];

function randomPassword() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const base = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 12);
  return `${base}!Aa1`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "bootstrap";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  if (action === "trigger") {
    const mode = url.searchParams.get("mode") ?? "both";
    const res = await fetch(`${supabaseUrl}/functions/v1/event-reminders?mode=${mode}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}` },
    });
    const body = await res.text();
    return new Response(JSON.stringify({ status: res.status, body }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }


  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const results: any[] = [];

  for (const u of USERS) {
    const password = randomPassword();
    let userId: string | null = null;
    let created = false;

    // Try to find user by listing (paginated); acceptable since we only have a few pages.
    let page = 1;
    while (page < 50) {
      const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      const found = data.users.find((x) => (x.email ?? "").toLowerCase() === u.email.toLowerCase());
      if (found) { userId = found.id; break; }
      if (data.users.length < 200) break;
      page++;
    }

    if (userId) {
      const { error } = await supa.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { full_name: u.full_name },
      });
      if (error) { results.push({ email: u.email, error: `update:${error.message}` }); continue; }
    } else {
      const { data, error } = await supa.auth.admin.createUser({
        email: u.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: u.full_name },
      });
      if (error || !data.user) { results.push({ email: u.email, error: `create:${error?.message}` }); continue; }
      userId = data.user.id;
      created = true;
    }

    await supa.from("profiles").upsert({ user_id: userId, full_name: u.full_name }, { onConflict: "user_id" });
    await supa.from("user_roles").upsert({ user_id: userId, role: "user" }, { onConflict: "user_id,role" });

    await supa.from("org_members").upsert({
      org_id: ORG_ID,
      user_id: userId,
      role: "operador",
      nome_exibicao: u.full_name,
      cargo: u.cargo,
      commission_id: CENTRAL_COMMISSION_ID,
      is_active: true,
    }, { onConflict: "org_id,user_id" });

    await supa.from("user_capabilities").upsert({
      user_id: userId,
      org_id: ORG_ID,
      capability: "cronograma_reminder_all",
    }, { onConflict: "user_id,org_id,capability" });

    results.push({ email: u.email, user_id: userId, created, password });
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
