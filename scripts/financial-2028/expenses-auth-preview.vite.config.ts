import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

const harness = path.resolve('scripts/financial-2028');
export default defineConfig({
  cacheDir: path.join(harness, '.cache', 'expenses-auth'),
  plugins: [{ name: 'financial-auth-local-qa', configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      if (request.url?.startsWith('/comissoes/financeiro-gerencial')) {
        request.url = request.url.replace(/^\/comissoes\/financeiro-gerencial(?:\/[^?]*)?/, '/scripts/financial-2028/preview.html');
      }
      next();
    });
  } }, react()],
  resolve: { dedupe: ['react', 'react-dom', '@tanstack/react-query', 'react-router-dom'], alias: [
    { find: '@/hooks/useAuth', replacement: path.join(harness, 'expenses-auth-hooks.ts') },
    { find: '@/hooks/useCurrentOrg', replacement: path.join(harness, 'expenses-auth-hooks.ts') },
    { find: '@/hooks/useOrgCommissions', replacement: path.join(harness, 'expenses-auth-hooks.ts') },
    { find: '@/integrations/supabase/client', replacement: path.join(harness, 'expenses-auth-client.ts') },
    { find: '@', replacement: path.resolve('src') },
  ] },
  build: { target: 'esnext', outDir: 'dist-qa/financial-expenses-auth', rollupOptions: { input: path.join(harness, 'preview.html') } },
  server: { host: '127.0.0.1', port: 5184, strictPort: true,
    proxy: { '/qa': 'http://127.0.0.1:5580', '/rest/v1': 'http://127.0.0.1:5580' },
    fs: { allow: [path.resolve('.')] } },
});
