// Reuse the production Vite configuration and real dependencies; only replace
// the HTML entry and output directory. No mocked scene, GPU or animation clock.
import { build } from 'vite';
await build({ mode: 'qa', build: {
  outDir: 'dist-alvorada-motion',
  rollupOptions: { input: 'scripts/alvorada-motion-qa.html' },
} });
