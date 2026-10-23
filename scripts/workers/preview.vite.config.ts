import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { handleWorkspacePreview } from './preview-workspace';
import { responseFixture } from './preview-responses';
import { publicWorkerError } from '../../supabase/functions/_shared/workers/failures';
import { WorkerError } from '../../supabase/functions/_shared/workers/contracts';
import { commercialResponseFixture, handleCommercialPreview } from './preview-commercial';

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
  optimizeDeps: { entries: [path.join(harness, 'preview.html')] },
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:5188'), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('synthetic-local-qa-only') },
  plugins: [{ name: 'workers-isolated-visual-qa', configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1:5188');
      if (await handleCommercialPreview(request, response, url)) return;
      if (await handleWorkspacePreview(request, response, url)) return;
      if (url.pathname.startsWith('/__workers-qa/history/')) {
        const rows = url.pathname.endsWith('/ai_messages') ? messages : conversations;
        const result = rows.filter(row => ['user_id', 'org_id', 'conversation_id', 'state'].every(key => !url.searchParams.has(key) || row[key] === url.searchParams.get(key)));
        response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ data: result, error: null })); return;
      }
      if (url.pathname === '/functions/v1/workers-orchestrator' && request.method === 'POST') {
        try {
          const input = await collect(request);
          // Explicitly synthetic error scenarios; this entrypoint only binds loopback.
          const failureCode = input.message === 'Falha de consulta · teste local' ? 'rpc_incompatible'
            : input.message === 'Falha de conexão · teste local' && !messages.some(row => row.content === input.message) ? 'network_error' : null;
          let worker = /@(agenda|arena|mapa|interesse|comissao|logistica|caixa|radar)\b/.exec(input.message)?.[1] ?? input.worker ?? 'agenda';
          const conversationId = input.conversationId ?? randomUUID();
          const createdAt = new Date().toISOString();
          const userId = '00000000-0000-4000-8000-000000000001';
          const fixtureHistory = messages.filter(row => row.conversation_id === conversationId).map(row => ({ role: String(row.role), content: String(row.content) }));
          const fixture = commercialResponseFixture(input, fixtureHistory) ?? responseFixture(input, fixtureHistory);
          if (fixture) worker = fixture.worker;
          const content = fixture?.content ?? (/apaga|exclui|confirma|adiciona|cria|manda|envia/i.test(input.message)
            ? 'Nesta fase eu só consulto informações. Abra o módulo para realizar manualmente uma ação permitida ao seu perfil.'
            : '2 eventos encontrados na agenda de teste.\n\nEncontro de comissões · 17/10/2026, 09:00 · Auditório\nReunião de infraestrutura · 17/10/2026, 14:00 · Sala de reuniões\n\n1 conflito de horário no Restaurante. Confira os registros antes de decidir.');
          const citations = fixture?.citations ?? [{ label: '2 eventos · Agenda de teste', url: '/cronograma-eventos', source: 'app' }, { label: '1 conflito · Restaurante de teste', url: '/eventos-restaurante-arena', source: 'app' }];
          if (!conversations.some(row => row.id === conversationId)) conversations.unshift({ id: conversationId, title: input.message.slice(0, 80), user_id: userId, org_id: input.orgId, worker_id: worker, updated_at: createdAt });
          messages.push({ id: randomUUID(), role: 'user', content: input.message, user_id: userId, org_id: input.orgId, conversation_id: conversationId, state: 'complete', worker_id: worker, citations: [], created_at: createdAt, request_id: input.requestId, message_seq: messages.length + 1 }, { id: randomUUID(), role: 'assistant', content, user_id: userId, org_id: input.orgId, conversation_id: conversationId, state: 'complete', worker_id: worker, citations, created_at: createdAt, request_id: input.requestId, message_seq: messages.length + 2 });
          if (failureCode) Object.assign(messages[messages.length - 1], { content: '', citations: [], state: 'failed' });
          response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
          const emit = (event: string, data: unknown) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          emit('conversation', { conversationId }); emit('worker', { workerId: worker });
          const progressLabel = fixture?.content.includes('"intent":"knowledge_base"') ? 'Consultando a base de conhecimento…'
            : `Consultando ${worker === 'mapa' ? 'o Mapa Comercial' : worker === 'radar' ? 'a fonte institucional' : 'a Agenda'} · dados de teste…`;
          emit('progress', { label: progressLabel, status: 'running' });
          // Local fixture delay makes the pending mascot/dots observable during visual QA.
          await new Promise(resolve => setTimeout(resolve, 1800));
          if (failureCode) { emit('error', { ...publicWorkerError(new WorkerError(failureCode)), requestId: input.requestId }); response.end(); return; }
          emit('progress', { label: progressLabel, status: 'complete' });
          emit('citations', { citations });
          for (let start = 0; start < content.length; start += fixture ? content.length : 32) { emit('delta', { text: content.slice(start, start + (fixture ? content.length : 32)) }); await new Promise(resolve => setTimeout(resolve, 12)); }
          emit('done', {}); response.end();
        } catch { response.writeHead(400); response.end(); }
        return;
      }
      if (url.pathname.startsWith('/equipe-ia') || url.pathname.startsWith('/admin/workers/') || url.pathname.startsWith('/cronograma-eventos')) {
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
  server: { host: '127.0.0.1', port: 5188, strictPort: true, watch: { ignored: ['**/.worktrees/**', '**/dist/**', '**/dist-qa/**', '**/docs/**'] } },
  build: { outDir: 'dist-qa/workers', rollupOptions: { input: path.join(harness, 'preview.html') } },
});
