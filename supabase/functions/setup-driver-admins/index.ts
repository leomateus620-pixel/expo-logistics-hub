// Edge function ONE-SHOT: promove motoristas da LOGÍSTICA a admin e define
// senha inicial padrão para cada um. Usa service role (Auth Admin API).
// Segurança: só roda se quem chamar for admin da org Fenasoja.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ORG_ID = "985888b8-155f-4bbe-b6b9-6bef2893d99b";
const DEFAULT_PASSWORD = "Fenasoja@2026";

const DRIVERS = [
  { user_id: "b664fc22-69d3-40f1-8370-16b8a07ec402", nome: "LEONARDO MATEUS STROSCHEIN" },
  { user_id: "40381ce4-d516-4e54-82be-13f28c46b5f7", nome: "LUCAS FRANKEN" },
  { user_id: "fdd6e075-2b8e-419c-a077-ad819fa81ffa", nome: "LUIS FERNANDO FURLANETTO" },
  { user_id: "a5b84900-52f9-4515-9a88-666890626dc8", nome: "MARCELO DE BAIRROS" },
  { user_id: "7b34af85-5465-48d6-af26-147b85669464", nome: "MICAEL ARCANJO BÖCK" },
  { user_id: "9adb622d-3458-4552-b12f-0ab1f6af1599", nome: "RICARDO CARPENEDO CAETANO" },
  { user_id: "71f1ce16-297a-40b6-aa4f-5e26a8b9e6bb", nome: "RICARDO EMILIO ZIMMERMANN" },
  { user_id: "007f3fa7-30b9-4b09-9e47-74bc1744e0ee", nome: "VLADIMIR ANTÔNIO MADALOSSO DA ROSA" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- AuthN/AuthZ: caller deve ser admin da org ---
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "missing auth" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: callerMember } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", ORG_ID)
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!callerMember || callerMember.role !== "admin") {
    return new Response(JSON.stringify({ error: "forbidden — admin only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Execução ---
  const results: Array<{
    nome: string;
    email?: string;
    role_ok: boolean;
    password_ok: boolean;
    error?: string;
  }> = [];

  for (const d of DRIVERS) {
    const entry: any = { nome: d.nome, role_ok: false, password_ok: false };
    try {
      const { error: updErr } = await admin
        .from("org_members")
        .update({ role: "admin", updated_at: new Date().toISOString() })
        .eq("org_id", ORG_ID)
        .eq("user_id", d.user_id);
      entry.role_ok = !updErr;
      if (updErr) entry.error = `role: ${updErr.message}`;

      const { data: u, error: pwErr } = await admin.auth.admin.updateUserById(
        d.user_id,
        { password: DEFAULT_PASSWORD },
      );
      entry.password_ok = !pwErr;
      entry.email = u?.user?.email ?? undefined;
      if (pwErr) {
        entry.error = `${entry.error ? entry.error + " | " : ""}pw: ${pwErr.message}`;
      }
    } catch (e: any) {
      entry.error = String(e?.message || e);
    }
    results.push(entry);
  }

  return new Response(
    JSON.stringify(
      { ok: true, password_used: DEFAULT_PASSWORD, results },
      null,
      2,
    ),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
