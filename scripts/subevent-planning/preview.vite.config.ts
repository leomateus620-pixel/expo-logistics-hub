import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { entries: ['scripts/subevent-planning/preview.html'] },
  resolve: {
    alias: [
      {
        find: '@/hooks/useOrgCommissions',
        replacement: path.resolve('scripts/subevent-planning/previewHooks.ts'),
      },
      {
        find: '@/hooks/useOrgMembers',
        replacement: path.resolve('scripts/subevent-planning/previewHooks.ts'),
      },
      { find: '@', replacement: path.resolve('src') },
    ],
  },
  server: { host: '127.0.0.1', port: 5273, strictPort: true },
});
