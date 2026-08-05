// One-off provisioning for FENASOJA operator accounts.
// Protected by GOOGLE_SYNC_WORKER_TOKEN (X-Worker-Token header).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};

const ORG_ID = "985888b8-155f-4bbe-b6b9-6bef2893d99b";

interface ProvisionUser {
  email: string;
  full_name: string;
  password: string;
  role: "admin" | "gestor" | "operador" | "leitura";
  cargo?: string | null;
  is_core_team?: boolean;
  capabilities: string[];
  /** Legacy volunteer rows (other user ids) with these names get deactivated. */
  deactivate_duplicates?: string[];
}

const USERS: ProvisionUser[] = [
  {
    email: "rvlugoch@gmail.com",
    full_name: "Roque Vanderlei Lugoch",
    password: "Fenasoja@2028",
    role: "gestor",
    cargo: "Coordenador Financeiro",
    is_core_team: true,
    capabilities: [
      "full_access",
      "mobility_access",
      "cronograma_eventos_access",
      "cronograma_reminder_all",
      "venue_events_access",
      "venue_events_full_access",
      "logistica_access",
      "gastronomia_access",
      "infraestrutura_access",
      "servicos_access",
      "arte_cultura_access",
      "novas_geracoes_access",
      "seguranca_access",
      "limpeza_access",
      "exporural_access",
      "industria_comercio_servicos_access",
      "map.view",
    ],
    deactivate_duplicates: ["ROQUE VANDERLEI LUGOCH"],
  },
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
      password: u.password,
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
          password: u.password,
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

    const memberPayload = {
      role: u.role,
      nome_exibicao: u.full_name,
      cargo: u.cargo ?? null,
      is_active: true,
      is_core_team: u.is_core_team ?? false,
    };

    const { data: existingMember } = await admin.from("org_members")
      .select("id")
      .eq("org_id", ORG_ID).eq("user_id", userId).maybeSingle();

    if (existingMember) {
      await admin.from("org_members").update(memberPayload).eq("id", existingMember.id);
    } else {
      await admin.from("org_members").insert({ org_id: ORG_ID, user_id: userId, ...memberPayload });
    }

    // Deactivate legacy duplicated volunteer rows for the same person.
    for (const name of u.deactivate_duplicates ?? []) {
      await admin.from("org_members")
        .update({ is_active: false })
        .eq("org_id", ORG_ID)
        .eq("nome_exibicao", name)
        .neq("user_id", userId);
    }

    for (const capability of u.capabilities) {
      await admin.from("user_capabilities").upsert(
        { user_id: userId, org_id: ORG_ID, capability },
        { onConflict: "user_id,org_id,capability" },
      );
    }

    results.push({ email: u.email, user_id: userId, ok: true });
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
