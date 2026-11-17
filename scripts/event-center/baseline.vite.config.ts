import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Reproduce the immediate main baseline without checking out over current work.
// This config is QA-only; the application build never uses its transformations.
const base = '1bc532c93e9abc397b34fe6965877a6857882de8';
const paths = [
  'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
  'src/features/commercial-map/components/canvas/CommercialTreeLayer.tsx',
  'src/features/commercial-map/components/canvas/StrategicLandmarks.tsx',
  'src/features/commercial-map/components/canvas/gastronomyMarkerAnchor.ts',
  'src/features/commercial-map/utils/eventCenter.ts',
];
const sources = new Map(
  paths.map((file) => [
    path.resolve(file),
    execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' }),
  ]),
);
export default defineConfig({
  plugins: [
    {
      name: 'event-center-immediate-main-baseline',
      enforce: 'pre',
      transform(_source, id) {
        return sources.get(id.split('?')[0]);
      },
    },
    react(),
  ],
  resolve: { alias: { '@': path.resolve('src') } },
  optimizeDeps: { entries: ['index.html'] },
  cacheDir: 'node_modules/.vite-c1-baseline',
  server: { host: '127.0.0.1', port: 8082, hmr: false },
});
