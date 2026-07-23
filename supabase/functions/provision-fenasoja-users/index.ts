// One-off provisioning for FENASOJA operator accounts.
// Protected by GOOGLE_SYNC_WORKER_TOKEN (X-Worker-Token header).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};

const ORG_ID = "985888b8-155f-4bbe-b6b9-6bef2893d99b";
const PASSWORD = "Fenaosja@2028";

const USERS = [
  { email: "fer.secklereich@gmail.com", full_name: "Fernanda Secklereich" },
  { email: "fenasojafeira@gmail.com", full_name: "Cléo — FENASOJA Feira" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expected = Deno.env.get("GOOGLE_SYNC_WORKER_TOKEN") ?? "";
  const provided = req.headers.get("X-Worker-Token") ?? "";
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const results: unknown[] = [];

  for (const u of USERS) {
    let userId: string | null = null;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.full_name },
    });

    if (createErr) {
      // Already exists? Look up by listing users.
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list?.users.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());
      if (found) {
        userId = found.id;
        await admin.auth.admin.updateUserById(found.id, {
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: u.full_name },
        });
      } else {
        results.push({ email: u.email, error: createErr.message });
        continue;
      }
    } else {
      userId = created.user.id;
    }

    if (!userId) continue;

    await admin.from("profiles").upsert(
      { user_id: userId, full_name: u.full_name },
      { onConflict: "user_id" },
    );

    await admin.from("user_roles").upsert(
      { user_id: userId, role: "user" },
      { onConflict: "user_id,role" },
    );

    // org_members: insert if missing, else ensure active + operador
    const { data: existingMember } = await admin.from("org_members")
      .select("user_id, role, is_active")
      .eq("org_id", ORG_ID).eq("user_id", userId).maybeSingle();

    if (!existingMember) {
      await admin.from("org_members").insert({
        org_id: ORG_ID,
        user_id: userId,
        role: "operador",
        nome_exibicao: u.full_name,
        is_active: true,
      });
    } else if (!existingMember.is_active) {
      await admin.from("org_members").update({ is_active: true, role: "operador" })
        .eq("org_id", ORG_ID).eq("user_id", userId);
    }

    // Grant full_access capability so Google Calendar backfill includes ALL org events.
    await admin.from("user_capabilities").upsert(
      { user_id: userId, org_id: ORG_ID, capability: "full_access" },
      { onConflict: "user_id,org_id,capability" },
    );

    results.push({ email: u.email, user_id: userId, ok: true });
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
