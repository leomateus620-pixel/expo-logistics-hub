// Isolated visual runner: same source components, no app routes or MCP generation.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const packages = JSON.parse(readFileSync(path.resolve(process.cwd(),'package.json'),'utf8')).dependencies;
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(process.cwd(),'src') }, dedupe: ['react','react-dom'] },
  optimizeDeps: { noDiscovery:true, include: ['react','react-dom/client','react-router-dom','@tanstack/react-query','recharts',
    ...Object.keys(packages).filter(name=>name.startsWith('@radix-ui/')),
    'lucide-react','date-fns','zod','class-variance-authority','clsx','tailwind-merge','sonner','react-day-picker','vaul','cmdk'] },
  server: { host:'127.0.0.1',port:5197,hmr:false },
});
