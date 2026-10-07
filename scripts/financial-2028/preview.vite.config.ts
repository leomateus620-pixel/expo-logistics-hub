import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Local QA only. Source override permits comparable captures of a frozen baseline.
const source = path.resolve(process.env.FINANCIAL_QA_SOURCE ?? '.');
const harness = path.resolve('scripts/financial-2028');
export default defineConfig({
  cacheDir: path.join(harness, '.cache', createHash('sha256').update(source).digest('hex').slice(0, 8)),
  optimizeDeps: { noDiscovery: true, include: [
    'react', 'react-dom/client', 'react/jsx-dev-runtime', 'react-router-dom', '@tanstack/react-query',
    'lucide-react', 'recharts', 'clsx', 'tailwind-merge', 'class-variance-authority',
    '@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-toast', '@radix-ui/react-slot',
    '@radix-ui/react-label', '@radix-ui/react-tooltip',
  ] },
  plugins: [{
    name: 'financial-local-qa',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url?.startsWith('/comissoes/financeiro-gerencial')) {
          request.url = request.url.replace(/^\/comissoes\/financeiro-gerencial(?:\/[^?]*)?/, '/scripts/financial-2028/preview.html');
        }
        next();
      });
    },
  }, react()],
  resolve: { dedupe: ['react', 'react-dom', '@tanstack/react-query', 'react-router-dom'], alias: [
    { find: '@/hooks/useAuth', replacement: path.join(harness, 'previewHooks.ts') },
    { find: '@/hooks/useCurrentOrg', replacement: path.join(harness, 'previewHooks.ts') },
    { find: '@/hooks/useOrgCommissions', replacement: path.join(harness, 'previewHooks.ts') },
    { find: /.*\/financialOperationalApi(?:\.ts)?$/, replacement: path.join(harness, 'previewApi.ts') },
    { find: '@', replacement: path.join(source, 'src') },
  ] },
  build: { outDir: process.env.FINANCIAL_QA_BUILD ?? 'dist-qa/financial-2028', rollupOptions: { input: path.join(harness, 'preview.html') } },
  server: { host: '127.0.0.1', strictPort: true, fs: { allow: [source, path.resolve('.')] } },
});
