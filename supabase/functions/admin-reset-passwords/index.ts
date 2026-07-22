import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const emails = ['soltis.fs@gmail.com', 'djeisondrey@gmail.com', 'zelia.savoldi@hotmail.com'];
  const password = 'Fenasoja@2028';
  const results: Array<{ email: string; ok: boolean; error?: string }> = [];

  for (const email of emails) {
    try {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) throw error;
      const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (!user) {
        results.push({ email, ok: false, error: 'not_found' });
        continue;
      }
      const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password });
      if (updErr) throw updErr;
      results.push({ email, ok: true });
    } catch (e) {
      results.push({ email, ok: false, error: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
