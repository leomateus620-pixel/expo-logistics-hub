import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

// The existing full-map diagnostic route, with one explicit synthetic food point.
// Never used by the application build; no new route, backend, or persisted row.
export default defineConfig({
  plugins: [
    {
      name: 'event-center-food-point-fixture',
      enforce: 'pre',
      transform(source, id) {
        if (!id.endsWith('/diagnostics/commercialMapDiagnosticsData.ts')) return;
        return (
          source.replace('export const DIAGNOSTICS_MAP_DATA =', 'const canonicalData =') +
          `
        const parent = canonicalData.entities.find(e => e.publicIdentifier === 'C1');
        const point = { ...parent, id: 'qa:c1:food', publicIdentifier: 'QA-C1-FOOD', name: 'Gastronomia C1 — fixture local',
          parentEntityId: parent.id, classification: 'FOOD_POINT', isSellable: true, segmentId: 'gastronomia', segmentSource: 'database',
          geometry: { ...parent.geometry, coordinates: [] } };
        const lot = { ...canonicalData.lots[0], id: 'qa:c1:food-lot', entityId: point.id, publicIdentifier: point.publicIdentifier,
          displayName: point.name, status: 'AVAILABLE', officialAreaSqm: null, calculatedAreaSqm: null, commercialUnit: 'FOOD_POINT', unitQuantity: 1,
          pricingMode: 'FIXED_TOTAL', currentBuyer: null, currentBuyerLegalName: null };
        export const DIAGNOSTICS_MAP_DATA = { ...canonicalData, entities: [...canonicalData.entities, point], lots: [...canonicalData.lots, lot] };
      `
        );
      },
    },
    react(),
  ],
  resolve: { alias: { '@': path.resolve('src') } },
  optimizeDeps: { entries: ['index.html'] },
  cacheDir: 'node_modules/.vite-c1-qa',
  server: { host: '127.0.0.1', port: 8081, hmr: false },
});
