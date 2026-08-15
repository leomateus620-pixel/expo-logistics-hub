// One-off provisioning: Eduardo Kretschmer — Mapa Comercial (gestão completa).
// Temporary function; removed right after execution.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ORG_ID = "985888b8-155f-4bbe-b6b9-6bef2893d99b";
const EMAIL = "eduardokretschmer7@gmail.com";
const PASSWORD = "Fenasoja@2028";
const FULL_NAME = "Eduardo Kretschmer";
const CARGO = "Gestão do Mapa Comercial";
const CAPABILITIES = [
  "map.view",
  "map.edit",
  "map.edit_geometry",
  "map.manage_lots",
  "map.manage_sales",
  "map.manage_contracts",
  "map.manage_layers",
  "map.admin",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let userId: string | null = null;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: FULL_NAME },
  });

  if (createErr) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users.find((u) => u.email?.toLowerCase() === EMAIL);
    if (!found) {
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = found.id;
    await admin.auth.admin.updateUserById(found.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: FULL_NAME },
    });
  } else {
    userId = created.user.id;
  }

  await admin.from("profiles").upsert({ user_id: userId, full_name: FULL_NAME }, { onConflict: "user_id" });
  await admin.from("user_roles").upsert({ user_id: userId, role: "user" }, { onConflict: "user_id,role" });

  const memberPayload = {
    role: "leitura",
    nome_exibicao: FULL_NAME,
    cargo: CARGO,
    is_active: true,
  };
  const { data: existing } = await admin.from("org_members")
    .select("id").eq("org_id", ORG_ID).eq("user_id", userId).maybeSingle();
  if (existing) {
    await admin.from("org_members").update(memberPayload).eq("id", existing.id);
  } else {
    await admin.from("org_members").insert({ org_id: ORG_ID, user_id: userId, ...memberPayload });
  }

  // Remove any capability that is not part of the commercial-map grant.
  await admin.from("user_capabilities")
    .delete().eq("user_id", userId).eq("org_id", ORG_ID)
    .not("capability", "in", `(${CAPABILITIES.join(",")})`);

  for (const capability of CAPABILITIES) {
    await admin.from("user_capabilities").upsert(
      { user_id: userId, org_id: ORG_ID, capability },
      { onConflict: "user_id,org_id,capability" },
    );
  }

  const { data: caps } = await admin.from("user_capabilities")
    .select("capability").eq("user_id", userId).eq("org_id", ORG_ID);

  return new Response(JSON.stringify({ ok: true, user_id: userId, capabilities: caps }, null, 2), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
