import { defineConfig, type ConfigEnv, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import applicationConfig from '../../vite.config';

// Explicit local QA build. No production imports and no backend requests.
const root = realpathSync(process.env.MAP_QA_ROOT || process.cwd());
const inventoryPath = path.resolve(process.cwd(), 'src/test/fixtures/ruralCoverageAuthorized.json');
const inventory = readFileSync(inventoryPath, 'utf8');
const fixture = `
if (new URLSearchParams(location.search).has('externalLotsQa')) {
  const snapshot = ${inventory};
  const rows = snapshot.rows;
  DIAGNOSTICS_MAP_DATA.project = { ...DIAGNOSTICS_MAP_DATA.project, id: rows[0].project_id };
  const byIdentifier = new Map(DIAGNOSTICS_MAP_DATA.entities.map(entity => [entity.publicIdentifier, entity]));
  const oldLotByIdentifier = new Map(DIAGNOSTICS_MAP_DATA.lots.map(lot => [lot.publicIdentifier, lot]));
  const ruralEntity = DIAGNOSTICS_MAP_DATA.entities.find(entity => entity.segmentId === 'exporural' && entity.classification === 'SELLABLE_LOT');
  const ruralLot = DIAGNOSTICS_MAP_DATA.lots.find(lot => lot.entityId === ruralEntity.id);
  const replaced = new Set(rows.map(row => row.public_identifier));
  const oldRuralIds = new Set(DIAGNOSTICS_MAP_DATA.entities.filter(entity => entity.segmentId === 'exporural').map(entity => entity.id));
  const entities = rows.map(row => {
    const previous = byIdentifier.get(row.public_identifier) || ruralEntity;
    return { ...previous, id: row.entity_id, projectId: row.project_id, parentEntityId: row.parent_entity_id,
      publicIdentifier: row.public_identifier, name: byIdentifier.get(row.public_identifier)?.name || row.public_identifier,
      segmentId: row.segment_slug, segmentSource: 'database', classification: row.classification,
      isSellable: row.is_sellable, isArchived: row.is_archived,
      geometry: { ...previous.geometry, id: row.geometry_id, coordinates: row.geometry.coordinates,
        elevation: Number(row.elevation), extrusionHeight: Number(row.extrusion_height), rotation: Number(row.rotation),
        geometryVersion: row.geometry_version, calibrationVersion: row.calibration_version },
      metadata: { ...previous.metadata, areaCode: row.area_code, entityType: row.entity_type,
        geometryRevision: row.geometry_revision, labelAnchor: row.label_anchor,
        pavilionPublicIdentifier: row.pavilion_public_identifier, pavilionModuleKey: row.pavilion_module_key,
        moduleNumber: row.module_number, interiorOnly: row.interior_only },
    };
  });
  const lots = rows.filter(row => row.lot_id).map(row => ({
    ...(oldLotByIdentifier.get(row.public_identifier) || ruralLot), id: row.lot_id, entityId: row.entity_id,
    publicIdentifier: row.public_identifier, block: row.block, lotNumber: row.lot_number,
    displayName: row.public_identifier, status: row.status, officialAreaSqm: Number(row.official_area_sqm),
    isCovered: row.is_covered, archivedAt: row.archived_at, currentBuyer: null, currentBuyerLegalName: null,
    currentBuyerTradeName: null, currentSaleId: null, currentSaleStatus: null, saleLogoUrl: null,
    activeContractNumber: null, salespersonName: null, saleDate: null,
  }));
  DIAGNOSTICS_MAP_DATA.entities = DIAGNOSTICS_MAP_DATA.entities.filter(entity => !oldRuralIds.has(entity.id) && !replaced.has(entity.publicIdentifier)).concat(entities);
  DIAGNOSTICS_MAP_DATA.lots = DIAGNOSTICS_MAP_DATA.lots.filter(lot => !oldRuralIds.has(lot.entityId) && !replaced.has(lot.publicIdentifier)).concat(lots);
  // Non-rural reference controls exercise the approved three visual states.
  // The authorized rural snapshot above is never modified for these captures.
  const controls = new Set(DIAGNOSTICS_MAP_DATA.entities.filter(entity => entity.classification === 'SELLABLE_LOT' && ['industria-comercio-servicos', 'espaco-automovel'].includes(entity.segmentId)).map(entity => entity.id));
  let controlIndex = 0;
  DIAGNOSTICS_MAP_DATA.lots = DIAGNOSTICS_MAP_DATA.lots.map(lot => controls.has(lot.entityId)
    ? { ...lot, status: ['AVAILABLE', 'SALE_OPEN', 'SOLD'][controlIndex++ % 3] } : lot);
  if (new URLSearchParams(location.search).has('externalPublicQa')) {
    const rawRuralIds = new Map(rows.map(row => [row.entity_id, row.segment_id]));
    const rawRuralEntities = DIAGNOSTICS_MAP_DATA.entities.filter(entity => rawRuralIds.has(entity.id)).map(entity => ({
      ...entity, segmentId: rawRuralIds.get(entity.id), segmentSource: undefined,
    }));
    const normalized = normalizePublicRuralPresentationInventory({
      scope: { kind: 'SEGMENT_EXTERNAL', segmentSlug: 'exporural' },
      project: { ...DIAGNOSTICS_MAP_DATA.project, id: rows[0].project_id },
      entities: rawRuralEntities, lots: DIAGNOSTICS_MAP_DATA.lots.filter(lot => rawRuralIds.has(lot.entityId)),
      layers: DIAGNOSTICS_MAP_DATA.layers,
    });
    const normalizedById = new Map(normalized.entities.map(entity => [entity.id, entity]));
    DIAGNOSTICS_MAP_DATA.entities = DIAGNOSTICS_MAP_DATA.entities.map(entity => normalizedById.get(entity.id) || entity);
    DIAGNOSTICS_MAP_DATA.lots = DIAGNOSTICS_MAP_DATA.lots.map(lot => ({
      ...toCanvasLot({ ...lot, availability: lot.status === 'BLOCKED' ? 'UNAVAILABLE' : lot.status,
        buyerName: null, pricing: { resolutionStatus: 'OK', renovacaoPricePerSqm: null,
          renovacaoTotal: null, renovacaoRuleLabel: null, segundaPricePerSqm: null, segundaTotal: null, segundaRuleLabel: null } }),
      saleLogoUrl: null,
    }));
  }
}
`;

export default defineConfig(async (env: ConfigEnv) => {
  const application = await applicationConfig(env) as UserConfig;
  const inputs = ['utils/externalLotPresentation.ts', 'components/canvas/CommercialMapCanvas.tsx',
    'components/canvas/SoldLotLocks.tsx', 'components/canvas/ExternalLotFrames.tsx',
    'components/canvas/exporuralTurfMaterial.ts', 'utils/externalLotFrameGeometry.ts', 'public/publicMapService.ts'];
  const hashes = Object.fromEntries(inputs.map(file => {
    const input = path.join(root, 'src/features/commercial-map', file);
    return [file, existsSync(input) ? createHash('sha256').update(readFileSync(input)).digest('hex') : null];
  }));
  return { ...application, root, envDir: path.join(root, 'scripts/rural-coverage/no-env-files'),
    plugins: [{ name: 'rural-coverage-read-only-fixture', enforce: 'pre',
      transform(source, id) {
        const filename = id.replaceAll('\\', '/');
        if (filename.endsWith('/diagnostics/commercialMapDiagnosticsData.ts')) {
          const service = readFileSync(path.join(root, 'src/features/commercial-map/public/publicMapService.ts'), 'utf8');
          const normalization = service.includes('export function normalizePublicRuralPresentationInventory')
            ? "import { normalizePublicRuralPresentationInventory } from '../public/publicMapService';\n"
            : 'const normalizePublicRuralPresentationInventory = inventory => inventory;\n';
          // The app persists query data. Give the two fixture paths different
          // identities so a public mount cannot restore a private QA snapshot.
          const isolated = source.replace("['commercial-map-qa-fixture', 'persisted-stage',",
            "['rural-coverage-qa-v1', diagnosticsParams.has('externalPublicQa') ? 'public' : 'private', 'persisted-stage',");
          return "import { toCanvasLot } from '../public/publicMapService';\n" + normalization + isolated + fixture;
        }
        if (filename.endsWith('/diagnostics/CommercialMapRenderingDiagnosticsPage.tsx')) return source
          .replace('const { status, entityId } = (event as CustomEvent<{ status: CommercialStatus; entityId?: string }>).detail;',
            'const { status, entityId, logo } = (event as CustomEvent<{ status: CommercialStatus; entityId?: string; logo?: string }>).detail;')
          .replace("['AVAILABLE', 'SOLD', 'RESERVED', 'BLOCKED'].includes(status)", "['AVAILABLE', 'SALE_OPEN', 'SOLD', 'RESERVED', 'BLOCKED'].includes(status)")
          .replace('useState({ public: false, filters: false })', "useState({ public: new URLSearchParams(location.search).has('externalPublicQa'), filters: false })")
          .replace('{ ...lot, status } : lot)', "{ ...lot, status: new URLSearchParams(location.search).has('externalPublicQa') && status === 'SALE_OPEN' ? 'SOLD' : status, ...(logo === undefined ? {} : { saleLogoUrl: logo }) } : lot)");
        return null;
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'qa-build-manifest.json', source: JSON.stringify({
          revision: process.env.MAP_QA_REVISION || 'working-tree', hashes,
          fixtureHash: createHash('sha256').update(fixture).digest('hex'),
          inventoryHash: createHash('sha256').update(inventory).digest('hex'),
          mode: 'production', backend: 'qa.invalid', fixture: 'authorized sanitized rural inventory and current geometry; reference non-rural controls',
        }, null, 2) });
      },
    }, react()],
    define: { ...application.define,
      'import.meta.env.VITE_COMMERCIAL_MAP_DIAGNOSTICS': JSON.stringify('true'),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://qa.invalid'),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('qa-fixture-no-backend'),
    },
    resolve: { alias: { '@': path.join(root, 'src') } },
    build: { ...application.build, outDir: process.env.MAP_QA_OUT || '/tmp/rural-coverage-candidate-dist', manifest: true },
  };
});
