// One-off admin password reset. Guarded by GOOGLE_SYNC_WORKER_TOKEN.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expected = Deno.env.get("GOOGLE_SYNC_WORKER_TOKEN") ?? "";
  const provided = req.headers.get("X-Worker-Token") ?? "";
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { email, password } = await req.json();
  if (!email || !password) {
    return new Response(JSON.stringify({ error: "email and password required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) {
    return new Response(JSON.stringify({ error: listErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const found = list?.users.find((x) => x.email?.toLowerCase() === String(email).toLowerCase());
  if (!found) {
    return new Response(JSON.stringify({ error: "user not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(found.id, {
    password,
    email_confirm: true,
  });
  if (updErr) {
    return new Response(JSON.stringify({ error: updErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, user_id: found.id }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
