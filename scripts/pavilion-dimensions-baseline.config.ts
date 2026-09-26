// Read-only baseline reproduction without stashing the shared working tree.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import current from '../vitest.config';

const files = [
  'src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx',
  'src/features/commercial-map/components/canvas/CommercialPavilionWayfindingLayer.tsx',
  'src/features/commercial-map/data/commercialPavilionReference.ts',
  'src/features/commercial-map/data/pavilion14CommercialReference.ts',
  'src/features/commercial-map/utils/commercialPavilionWayfinding.ts',
];
const baseline = new Map(files.map(file => [resolve(file).replaceAll('\\', '/'), execFileSync('git', ['show', `d3ec0cc2:${file}`], { encoding: 'utf8' })]));
export default mergeConfig(current, defineConfig({
  plugins: [{ name: 'pavilion-dimensions-baseline', enforce: 'pre', load: id => baseline.get(id.split('?')[0].replaceAll('\\', '/')) }],
}));
