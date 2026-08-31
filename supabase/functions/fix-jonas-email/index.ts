import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// One-shot maintenance function: corrige o e-mail de login do Jonas (Fotógrafo).
// Sem parâmetros, idempotente. Deve ser removida após a execução.
const TARGET_USER_ID = "3e7f410c-c14d-4841-8597-8a84f1b8c639";
const CORRECT_EMAIL = "jmmirsan@gmail.com";

Deno.serve(async () => {
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await adminClient.auth.admin.updateUserById(TARGET_USER_ID, {
    email: CORRECT_EMAIL,
    email_confirm: true,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, id: data.user?.id, email: data.user?.email }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
