import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método inválido' }, 405);
  try {
    const body = await req.json();
    const isPublic = typeof body?.slug === 'string' && typeof body?.token === 'string';
    if (isPublic && (!/^[a-z0-9-]{1,100}$/.test(body.slug) || body.token.length < 24 || body.token.length > 256)) return json({ error: 'Link inválido' }, 400);
    if (!isPublic && (typeof body?.projectId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.projectId))) return json({ error: 'Projeto inválido' }, 400);
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !service) return json({ error: 'Serviço indisponível' }, 503);
    const authorization = req.headers.get('Authorization') ?? '';
    if (!isPublic && !authorization.startsWith('Bearer ')) return json({ error: 'Acesso negado' }, 401);
    const reader = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    if (!isPublic) {
      const { error } = await reader.auth.getUser();
      if (error) return json({ error: 'Acesso negado' }, 401);
    }
    const { data, error } = isPublic
      ? await reader.rpc('public_map_sale_logos', { _slug: body.slug, _token: body.token })
      : await reader.rpc('commercial_sale_logos', { p_project_id: body.projectId });
    if (error) return json({ error: 'Link ou acesso indisponível' }, 403);
    const paths = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
    const uniquePaths = [...new Set(Object.values(paths).filter((path): path is string => typeof path === 'string' && /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/i.test(path)))];
    if (uniquePaths.length === 0) return json({ logos: {}, expiresIn: 900 });
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const signed = await Promise.all(uniquePaths.map(async (path) => {
      const { data: result, error: signError } = await admin.storage.from('commercial-sale-logos').createSignedUrl(path, 900);
      return [path, signError ? null : result?.signedUrl ?? null] as const;
    }));
    const urls = new Map(signed);
    return json({ logos: Object.fromEntries(Object.entries(paths).filter(([, path]) => typeof path === 'string' && Boolean(urls.get(path))).map(([id, path]) => [id, urls.get(path as string)])), expiresIn: 900 });
  } catch { return json({ error: 'Solicitação inválida' }, 400); }
});
