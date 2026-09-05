import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
export default defineConfig({
  plugins: [react()], resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
  build: { outDir: 'artifacts/alvorada-qa-dist', rollupOptions: { input: path.resolve(__dirname, 'alvorada-qa.html') } },
  server: { host: '127.0.0.1' }, preview: { host: '127.0.0.1' },
});
