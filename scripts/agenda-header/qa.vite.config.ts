// Local QA server only: separate cache for each source tree, real Agenda source.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const sourceRoot = path.resolve(process.env.AGENDA_QA_SOURCE_ROOT || process.cwd());
const packages = JSON.parse(readFileSync(path.join(sourceRoot, 'package.json'), 'utf8')).dependencies;
export default defineConfig({
  root: sourceRoot,
  cacheDir: path.join(sourceRoot, 'node_modules', `.vite-agenda-header-${createHash('sha256').update(sourceRoot + (process.env.AGENDA_QA_CACHE_KEY || '')).digest('hex').slice(0, 12)}`),
  plugins: [react()],
  resolve: { alias: { '@': path.join(sourceRoot, 'src') }, dedupe: ['react', 'react-dom'] },
  optimizeDeps: {
    entries: [],
    noDiscovery: true,
    include: ['react', 'react-dom', 'react-dom/client', 'react-router-dom', '@tanstack/react-query', 'recharts',
      ...Object.keys(packages).filter(name => name.startsWith('@radix-ui/')),
      '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities',
      'lucide-react', 'date-fns', 'zod', 'class-variance-authority', 'clsx', 'tailwind-merge', 'sonner', 'react-day-picker', 'vaul', 'cmdk'],
  },
  server: {
    host: '127.0.0.1', port: Number(process.env.AGENDA_QA_PORT || 5200), hmr: false,
    fs: { allow: [sourceRoot, path.resolve(__dirname, '../..')] },
  },
});
