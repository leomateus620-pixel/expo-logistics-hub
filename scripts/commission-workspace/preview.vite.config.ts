import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { createHash } from 'node:crypto';

// QA only: renders the existing development preview and real workspace UI.
// The source override lets the same harness capture the unchanged baseline.
const source = path.resolve(process.env.COMMISSION_QA_SOURCE ?? '.');
const harness = path.resolve('scripts/commission-workspace');
export default defineConfig({
  cacheDir: path.join(harness, '.cache', createHash('sha256').update(source).digest('hex').slice(0, 8)),
  optimizeDeps: { entries: ['scripts/commission-workspace/preview.html'] },
  plugins: [
    {
      name: 'commission-workspace-qa-instrumentation',
      enforce: 'pre',
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url?.startsWith('/__dev/comissao-agenda')) {
            request.url = request.url.replace(/\/__dev\/comissao-agenda(?:\/[^?]*)?/, '/scripts/commission-workspace/preview.html');
          }
          next();
        });
      },
      transform(code, id) {
        if (!id.endsWith('/CommissionAgendaPreviewPage.tsx')) return;
        return code
          .replace('`${unit.basePath}?${new URLSearchParams', '`${unit.basePath}/${WORKSPACE_SECTION_PATHS[item.id]}?${new URLSearchParams')
          .replace('path: WORKSPACE_SECTION_PATHS[item.id]', 'path: item.path')
          .replace('onSubmitEvent={(draft) => record(`onSubmitEvent(${draft.title || \'sem título\'})`)}',
            'onSubmitEvent={(draft, editing) => { (window as any).__commissionQaSubmission = { draft, editingId: editing?.id ?? null }; record(`onSubmitEvent(${draft.title || \'sem título\'})`); }}');
      },
    },
    react(),
  ],
  resolve: { alias: [
    { find: '@/hooks/useAuth', replacement: path.join(harness, 'previewAuth.ts') },
    { find: '@', replacement: path.join(source, 'src') },
  ] },
  server: { host: '127.0.0.1', strictPort: true, fs: { allow: [source, path.resolve('.')] } },
});
