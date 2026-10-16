import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const harness = path.resolve('scripts/workers');
const messages: Array<Record<string, unknown>> = [];
const conversations: Array<Record<string, unknown>> = [];
const collect = async (request: IncomingMessage) => {
  let text = '';
  for await (const chunk of request) { text += String(chunk); if (text.length > 32_000) throw new Error('Local fixture input too large'); }
  return JSON.parse(text) as { orgId: string; requestId: string; conversationId?: string; worker?: string; message: string };
};
export default defineConfig({
  cacheDir: path.resolve('node_modules/.cache/workers-preview'),
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:5188'), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic-local-qa-only') },
  plugins: [{ name: 'workers-isolated-visual-qa', configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1:5188');
      if (url.pathname.startsWith('/__workers-qa/history/')) {
        const rows = url.pathname.endsWith('/ai_messages') ? messages : conversations;
        const result = rows.filter(row => ['user_id', 'org_id', 'conversation_id', 'state'].every(key => !url.searchParams.has(key) || row[key] === url.searchParams.get(key)));
        response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ data: result, error: null })); return;
      }
      if (url.pathname === '/functions/v1/workers-orchestrator' && request.method === 'POST') {
        try {
          const input = await collect(request);
          const worker = /@(agenda|arena|mapa|interesse|comissao|logistica|caixa|radar)\b/.exec(input.message)?.[1] ?? input.worker ?? 'agenda';
          const conversationId = input.conversationId ?? randomUUID();
          const createdAt = new Date().toISOString();
          const userId = '00000000-0000-4000-8000-000000000001';
          const content = /apaga|exclui|confirma|adiciona|cria|manda|envia/i.test(input.message)
            ? 'Nesta fase eu só consulto informações. Abra o módulo para realizar manualmente uma ação permitida ao seu perfil.'
            : '2 eventos encontrados na agenda de teste.\n\nEncontro de comissões · 17/10/2026, 09:00 · Auditório\nReunião de infraestrutura · 17/10/2026, 14:00 · Sala de reuniões\n\n1 conflito de horário no Restaurante. Confira os registros antes de decidir.';
          const citations = [{ label: '2 eventos · Agenda de teste', url: '/cronograma-eventos', source: 'app' }, { label: '1 conflito · Restaurante de teste', url: '/eventos-restaurante-arena', source: 'app' }];
          if (!conversations.some(row => row.id === conversationId)) conversations.unshift({ id: conversationId, title: input.message.slice(0, 80), user_id: userId, org_id: input.orgId, worker_id: worker, updated_at: createdAt });
          messages.push({ id: randomUUID(), role: 'user', content: input.message, user_id: userId, org_id: input.orgId, conversation_id: conversationId, state: 'complete', worker_id: worker, citations: [], created_at: createdAt }, { id: randomUUID(), role: 'assistant', content, user_id: userId, org_id: input.orgId, conversation_id: conversationId, state: 'complete', worker_id: worker, citations, created_at: createdAt });
          response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
          const emit = (event: string, data: unknown) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          emit('conversation', { conversationId }); emit('worker', { workerId: worker });
          emit('progress', { label: 'Consultando agenda de teste…', status: 'running' });
          await new Promise(resolve => setTimeout(resolve, 180));
          emit('progress', { label: 'Consultando agenda de teste…', status: 'complete' });
          emit('citations', { citations });
          for (let start = 0; start < content.length; start += 32) { emit('delta', { text: content.slice(start, start + 32) }); await new Promise(resolve => setTimeout(resolve, 12)); }
          emit('done', {}); response.end();
        } catch { response.writeHead(400); response.end(); }
        return;
      }
      if (url.pathname.startsWith('/equipe-ia') || url.pathname.startsWith('/admin/workers/design') || url.pathname.startsWith('/cronograma-eventos')) {
        request.url = '/scripts/workers/preview.html' + url.search;
      }
      next();
    });
  } }, react()],
  resolve: { alias: [
    { find: '@/hooks/useAuth', replacement: path.join(harness, 'preview-hooks.ts') },
    { find: '@/hooks/useCurrentOrg', replacement: path.join(harness, 'preview-hooks.ts') },
    { find: '@/hooks/useCapabilities', replacement: path.join(harness, 'preview-hooks.ts') },
    { find: '@/integrations/supabase/client', replacement: path.join(harness, 'preview-client.ts') },
    { find: '@', replacement: path.resolve('src') },
  ] },
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  build: { outDir: 'dist-qa/workers', rollupOptions: { input: path.join(harness, 'preview.html') } },
});
