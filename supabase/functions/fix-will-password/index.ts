// Temporary one-off: reset the password for will@filmesdowill.com. Deleted right after use.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TARGET_ID = "f1f95541-1384-4f6a-804a-4d40c7f70f81";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { error } = await admin.auth.admin.updateUserById(TARGET_ID, {
    password: "Fenasoja@2028",
    email_confirm: true,
  });

  return new Response(JSON.stringify({ ok: !error, error: error?.message ?? null }), {
    status: error ? 400 : 200,
    headers: { "Content-Type": "application/json" },
  });
});
