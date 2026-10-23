import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
export default defineConfig({
  plugins: [react()], cacheDir: '/tmp/fenasoja-compact-qa',
  resolve: { alias: [{ find: '@/integrations/supabase/client', replacement: path.resolve('scripts/dashboard/compact-qa-client.ts') }, { find: '@', replacement: path.resolve('src') }] },
  server: { host: '127.0.0.1', port: 8088, strictPort: true },
  optimizeDeps: { entries: ['scripts/dashboard/compact-qa.html'] },
});
