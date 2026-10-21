import { defineConfig } from 'vite';
import base from '../preview.vite.config';

export default defineConfig({ ...base,
  optimizeDeps: { entries: ['scripts/exporural/official-2026-10-20/review.html'] },
});
