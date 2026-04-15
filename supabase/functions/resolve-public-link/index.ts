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
    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenHash = await sha256(token);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("public_form_links")
      .select("id, committee_name_snapshot, president_name_snapshot, is_active")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: "Link não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data.is_active) {
      return new Response(
        JSON.stringify({ error: "Link desativado" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for existing submission
    const { data: existingForm } = await supabase
      .from("public_mobility_forms")
      .select("id, operational_responsible_name, operational_responsible_phone, operational_responsible_email, needs_electric_car, needs_scooter, submission_status, submitted_at")
      .eq("link_id", data.id)
      .maybeSingle();

    let existing_members: any[] = [];
    if (existingForm) {
      const { data: members } = await supabase
        .from("public_mobility_members")
        .select("member_name, member_role, member_identifier, access_electric_car, access_scooter, qr_access_free, notes")
        .eq("form_id", existingForm.id)
        .order("member_name");
      existing_members = members || [];
    }

    return new Response(
      JSON.stringify({
        committee_name: data.committee_name_snapshot,
        president_name: data.president_name_snapshot,
        has_existing_submission: !!existingForm,
        existing_form: existingForm || null,
        existing_members,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
