import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

// Local-only fixture; no application route or production access is added.
export default defineConfig({
  cacheDir: '.qa-vite-cache',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve('src') } },
  server: { host: '127.0.0.1', port: 4201, fs: { allow: ['..'] } },
});
