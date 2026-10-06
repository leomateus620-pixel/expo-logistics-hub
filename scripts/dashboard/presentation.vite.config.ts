import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

// Frontend QA server: no MCP generator, storage, backend setup or production routes.
const root = path.resolve(process.env.DASHBOARD_QA_ROOT || process.cwd());
export default defineConfig({
  root,
  cacheDir: path.join(os.tmpdir(), `fenasoja-dashboard-qa-${createHash('sha256').update(root).digest('hex').slice(0, 12)}`),
  plugins: [{
    name: 'baseline-windows-component-resolution',
    enforce: 'pre',
    transform(code, id) {
      return id.replaceAll('\\', '/').endsWith('/dashboard/CommercialDashboard.tsx')
        ? code.replace("'./CommercialSalesProgress'", "'./CommercialSalesProgress.tsx'") : null;
    },
  }, react()],
  resolve: { alias: { '@': path.join(root, 'src') } },
  server: { host: '127.0.0.1', hmr: { overlay: false }, fs: { allow: [root, path.resolve(__dirname)] } },
  optimizeDeps: {
    entries: [path.join(root, 'src/features/commercial-map/dashboard/CommercialDashboard.tsx')],
    include: ['react', 'react-dom/client', '@tanstack/react-query', 'lucide-react'],
  },
});
