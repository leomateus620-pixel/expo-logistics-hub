import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { token, operational_responsible_name, operational_responsible_phone, operational_responsible_email, needs_electric_car, needs_scooter, members } = body;

    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(members) || members.length === 0) {
      return new Response(
        JSON.stringify({ error: "Adicione ao menos um integrante" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenHash = await sha256(token);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase.rpc("submit_public_mobility_form", {
      _token_hash: tokenHash,
      _operational_responsible_name: operational_responsible_name || null,
      _operational_responsible_phone: operational_responsible_phone || null,
      _operational_responsible_email: operational_responsible_email || null,
      _needs_electric_car: needs_electric_car ?? false,
      _needs_scooter: needs_scooter ?? false,
      _members: members,
    });

    if (error) {
      const msg = error.message || "Erro ao enviar formulário";
      const status = msg.includes("desativado") ? 403 : msg.includes("não encontrado") ? 404 : 422;
      return new Response(
        JSON.stringify({ error: msg }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, form_id: data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
