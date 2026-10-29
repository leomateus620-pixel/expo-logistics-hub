import { defineConfig, type ConfigEnv, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import applicationConfig from '../../vite.config';

// Local fixture build only. The regular app build never imports this config.
const root = realpathSync(process.env.MAP_QA_ROOT || process.cwd());
const fixture = `
if (new URLSearchParams(location.search).has('externalLotsQa')) {
  // The opt-in 2028 preview predates commercial release and marks its rural
  // entities unsellable. Only this synthetic presentation fixture enables them.
  DIAGNOSTICS_MAP_DATA.entities = DIAGNOSTICS_MAP_DATA.entities.map(entity =>
    entity.classification === 'SELLABLE_LOT' ? { ...entity, isSellable: true } : entity);
  const byId = new Map(DIAGNOSTICS_MAP_DATA.entities.map(entity => [entity.id, entity]));
  let index = 0;
  DIAGNOSTICS_MAP_DATA.lots = DIAGNOSTICS_MAP_DATA.lots.map(lot => {
    const entity = byId.get(lot.entityId);
    if (entity?.classification !== 'SELLABLE_LOT') return lot;
    const i = index++;
    return { ...lot, status: ['AVAILABLE', 'SALE_OPEN', 'SOLD', 'SOLD', 'BLOCKED'][i % 5],
      saleLogoUrl: i % 10 === 2 ? '/external-lot-qa-logo.svg' : null };
  });
  if (new URLSearchParams(location.search).has('externalPublicQa')) {
    DIAGNOSTICS_MAP_DATA.lots = DIAGNOSTICS_MAP_DATA.lots.map(lot => ({
      ...toCanvasLot({ ...lot, availability: lot.status === 'BLOCKED' ? 'UNAVAILABLE' : lot.status,
        buyerName: null, pricing: { resolutionStatus: 'OK', renovacaoPricePerSqm: null,
          renovacaoTotal: null, renovacaoRuleLabel: null, segundaPricePerSqm: null, segundaTotal: null, segundaRuleLabel: null } }),
      saleLogoUrl: lot.status === 'SOLD' ? lot.saleLogoUrl : null,
    }));
  }
}
`;
export default defineConfig(async (env: ConfigEnv) => {
  const application = await applicationConfig(env) as UserConfig;
  const inputs = ['components/canvas/CommercialMapCanvas.tsx', 'components/canvas/SoldLotLocks.tsx',
    'components/canvas/exporuralTurfMaterial.ts', 'components/canvas/ExternalLotFrames.tsx',
    'components/canvas/TerritorialOrientation.tsx', 'components/panels/ContextualMapLegend.tsx',
    'components/panels/contextual-map-legend.css', 'utils/externalLotPresentation.ts',
    'utils/externalLotFrameGeometry.ts', 'utils/soldCheckGeometry.ts', 'utils/soldLotPresentation.ts',
    'utils/territorialOrientation.ts', 'utils/territorialOrientationInputs.ts',
    'public/PublicMapLegend.tsx', 'public/public-map.css', 'public/publicMapService.ts', 'public/publicMapTypes.ts'];
  const hashes = Object.fromEntries(inputs.map(file => { const input = path.join(root, 'src/features/commercial-map', file);
    return [file, existsSync(input) ? createHash('sha256').update(readFileSync(input)).digest('hex') : null]; }));
  return { ...application, root, envDir: path.join(root, 'scripts/external-lots/no-env-files'),
    plugins: [{ name: 'external-lots-read-only-fixture', enforce: 'pre',
      transform(source, id) {
        const filename = id.replaceAll('\\', '/');
        if (filename.endsWith('/diagnostics/commercialMapDiagnosticsData.ts')) return (
          "import { toCanvasLot } from '../public/publicMapService';\n" + source + fixture);
        if (filename.endsWith('/diagnostics/benvenutoSurfaceQa.ts')) return (
          "import { useSalesStore } from '../sales/useSalesSelection';\nimport { useSaleInspectionStore } from '../state/useSaleInspectionStore';\n" +
          source.replace('root, map: useCommercialMapStore, visit: useVisitStore,',
            'root, map: useCommercialMapStore, visit: useVisitStore, sales: useSalesStore, inspection: useSaleInspectionStore,'));
        if (filename.endsWith('/diagnostics/CommercialMapRenderingDiagnosticsPage.tsx')) {
          return source.replace("['AVAILABLE', 'SOLD', 'RESERVED', 'BLOCKED'].includes(status)",
            "['AVAILABLE', 'SALE_OPEN', 'SOLD', 'RESERVED', 'BLOCKED'].includes(status)")
            .replace('useState({ public: false, filters: false })',
              "useState({ public: new URLSearchParams(location.search).has('externalPublicQa'), filters: false })")
            .replace('{ ...lot, status } : lot)', "{ ...lot, status: new URLSearchParams(location.search).has('externalPublicQa') && status === 'SALE_OPEN' ? 'SOLD' : status } : lot)");
        }
        return null;
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'qa-build-manifest.json', source: JSON.stringify({
          revision: process.env.MAP_QA_REVISION || 'working-tree', hashes, fixtureHash: createHash('sha256').update(fixture).digest('hex'),
          mode: 'production', backend: 'qa.invalid', fixture: 'official reference geometry + local sellability/status/logo presentation only',
        }, null, 2) });
        this.emitFile({ type: 'asset', fileName: 'external-lot-qa-logo.svg', source:
          '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="128"><rect width="256" height="128" rx="12" fill="#f8f2db"/><circle cx="52" cy="64" r="32" fill="#4f7391"/><path d="M35 64l12 12 24-29" fill="none" stroke="#fff" stroke-width="9"/><text x="97" y="74" font-family="sans-serif" font-weight="bold" font-size="32" fill="#254330">DEMO</text></svg>' });
      },
    }, react()],
    define: { ...application.define,
      'import.meta.env.VITE_COMMERCIAL_MAP_DIAGNOSTICS': JSON.stringify('true'),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://qa.invalid'),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('qa-fixture-no-backend'),
    },
    resolve: { alias: { '@': path.join(root, 'src') } },
    build: { ...application.build, outDir: process.env.MAP_QA_OUT || '/tmp/external-lot-candidate-dist', manifest: true },
  };
});
