import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

// Dedicated local server. This config/HTML is never an input of the public build.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [
    { find: '@/integrations/supabase/client', replacement: path.resolve('scripts/exporural/previewSupabase.ts') },
    { find: '@', replacement: path.resolve('src') },
  ] },
  server: { host: '127.0.0.1', port: 5198, strictPort: true,
    headers: { 'Content-Security-Policy': "connect-src 'self' ws://127.0.0.1:5198; form-action 'none'" },
  },
});
