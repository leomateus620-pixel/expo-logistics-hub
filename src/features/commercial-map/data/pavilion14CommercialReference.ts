import {
  buildCommercialPavilionReferenceCells,
  createCommercialPavilionMetricProjector,
  type CommercialPavilionReferenceCorridor,
  type CommercialPavilionReferenceProjection,
  type CommercialPavilionReferenceRun,
  type CommercialPavilionReferenceWallAccess,
} from './commercialPavilionReference';

const SOURCE_DOCUMENT = 'WhatsApp Image 2026-08-25 at 03.11.58.jpeg' as const;
const PROJECT = createCommercialPavilionMetricProjector(35, 33, 0);

/** Official metric divisions are contiguous; the renderer adds visual joints. */
export const PAVILION14_COMMERCIAL_MODULE_GAP = 0;

/**
 * B2 is physically authored with its public facade on local +Z and then
 * rotated 90 degrees on the park map. The official plan therefore needs the
 * same quarter-turn projection used by every runtime and persisted geometry.
 */
export const PAVILION14_COMMERCIAL_REFERENCE_PROJECTION = {
  coordinateTransform: 'quarter-turn-clockwise',
  fit: 'metric-contain',
  metricWidthM: 35,
  metricDepthM: 33,
  alignX: 'center',
  alignZ: 'center',
} as const satisfies CommercialPavilionReferenceProjection;

export const PAVILION14_COMMERCIAL_REFERENCE_RUNS = [
  {
    id: 'south-perimeter-01-35',
    label: 'Faixa sul · 01–35',
    role: 'perimeter',
    bounds: PROJECT.rect(0, 30, 35, 3),
    numberRange: [1, 35],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'south-perimeter',
    cluster: 'south-perimeter-01-35',
  },
  {
    id: 'lower-island-south-36-64',
    label: 'Ilha inferior · 36–64',
    role: 'island',
    bounds: PROJECT.rect(3, 22.5, 29, 3.5),
    numberRange: [36, 64],
    orientation: 'north-south',
    sequenceOrientation: 'x-decreasing',
    group: 'lower-island',
    cluster: 'lower-island-south-36-64',
  },
  {
    id: 'lower-island-north-65-93',
    label: 'Ilha inferior · 65–93',
    role: 'island',
    bounds: PROJECT.rect(3, 19, 29, 3.5),
    numberRange: [65, 93],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'lower-island',
    cluster: 'lower-island-north-65-93',
  },
  {
    id: 'central-island-south-94-122',
    label: 'Ilha central · 94–122',
    role: 'island',
    bounds: PROJECT.rect(3, 10.5, 29, 3.5),
    numberRange: [94, 122],
    orientation: 'north-south',
    sequenceOrientation: 'x-decreasing',
    group: 'central-island',
    cluster: 'central-island-south-94-122',
  },
  {
    id: 'central-island-north-123-151',
    label: 'Ilha central · 123–151',
    role: 'island',
    bounds: PROJECT.rect(3, 7, 29, 3.5),
    numberRange: [123, 151],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'central-island',
    cluster: 'central-island-north-123-151',
  },
  {
    id: 'north-perimeter-152-186',
    label: 'Faixa norte · 152–186',
    role: 'perimeter',
    bounds: PROJECT.rect(0, 0, 35, 3),
    numberRange: [152, 186],
    orientation: 'north-south',
    sequenceOrientation: 'x-decreasing',
    group: 'north-perimeter',
    cluster: 'north-perimeter-152-186',
  },
] as const satisfies readonly CommercialPavilionReferenceRun[];

export const PAVILION14_COMMERCIAL_REFERENCE_CORRIDORS = [
  { id: 'north-distribution', label: 'Circulação norte', kind: 'main', ...PROJECT.rect(0, 3, 35, 4) },
  { id: 'central-distribution', label: 'Circulação central', kind: 'main', ...PROJECT.rect(0, 14, 35, 5) },
  { id: 'south-distribution', label: 'Circulação sul', kind: 'main', ...PROJECT.rect(0, 26, 35, 4) },
  { id: 'west-upper-access', label: 'Afastamento lateral oeste superior', kind: 'perimeter', ...PROJECT.rect(0, 7, 3, 7) },
  { id: 'east-upper-access', label: 'Afastamento lateral leste superior', kind: 'perimeter', ...PROJECT.rect(32, 7, 3, 7) },
  { id: 'west-lower-access', label: 'Afastamento lateral oeste inferior', kind: 'perimeter', ...PROJECT.rect(0, 19, 3, 7) },
  { id: 'east-lower-access', label: 'Afastamento lateral leste inferior', kind: 'perimeter', ...PROJECT.rect(32, 19, 3, 7) },
] as const satisfies readonly CommercialPavilionReferenceCorridor[];

/**
 * Plain reference contract until the shared plan type owns official wall
 * accesses. Each transverse corridor opens on both sides of the source plan;
 * after projection they become the front and rear pavilion accesses.
 */
export const PAVILION14_COMMERCIAL_WALL_ACCESSES = [
  {
    id: 'north-transverse-access',
    corridorId: 'north-distribution',
    edges: ['front', 'rear'],
    sourcePrecision: 'official-metric',
  },
  {
    id: 'central-transverse-access',
    corridorId: 'central-distribution',
    edges: ['front', 'rear'],
    sourcePrecision: 'official-metric',
  },
  {
    id: 'south-transverse-access',
    corridorId: 'south-distribution',
    edges: ['front', 'rear'],
    sourcePrecision: 'official-metric',
  },
] as const satisfies readonly CommercialPavilionReferenceWallAccess[];

export const PAVILION14_COMMERCIAL_REFERENCE_CELLS =
  buildCommercialPavilionReferenceCells({
    pavilionId: 'B2',
    runs: PAVILION14_COMMERCIAL_REFERENCE_RUNS,
    moduleGap: PAVILION14_COMMERCIAL_MODULE_GAP,
    sourceDocument: SOURCE_DOCUMENT,
    referenceYear: 2026,
  });

if (PAVILION14_COMMERCIAL_REFERENCE_CELLS.length !== 186) {
  throw new Error(
    `B2: a referência geométrica gerou ${PAVILION14_COMMERCIAL_REFERENCE_CELLS.length} módulos; o total oficial é 186.`,
  );
}

/** Nominal module geometry: 70 × 3 m² + 116 × 3.5 m². */
export const PAVILION14_COMMERCIAL_GEOMETRIC_AREA_M2 = 70 * 3 + 116 * 3.5;

if (Math.abs(PAVILION14_COMMERCIAL_GEOMETRIC_AREA_M2 - 616) > 1e-9) {
  throw new Error('B2: a soma geométrica nominal deve ser 616,00 m².');
}

export const PAVILION14_COMMERCIAL_REFERENCE = {
  publicIdentifier: 'B2',
  pavilionNumber: 14,
  category: 'Artesanato e Comércio',
  moduleCount: 186,
  totalAreaM2: 1155,
  modularAreaM2: 616.16,
  nominalGeometricAreaM2: PAVILION14_COMMERCIAL_GEOMETRIC_AREA_M2,
  individualAreaM2: null,
  moduleGap: PAVILION14_COMMERCIAL_MODULE_GAP,
  boundary: { centerX: 0.5, centerZ: 0.5, width: 1, depth: 1 },
  projection: PAVILION14_COMMERCIAL_REFERENCE_PROJECTION,
  legendNumberRanges: [[1, 35], [36, 64], [65, 93], [94, 122], [123, 151], [152, 186]],
  runs: PAVILION14_COMMERCIAL_REFERENCE_RUNS,
  corridors: PAVILION14_COMMERCIAL_REFERENCE_CORRIDORS,
  wallAccesses: PAVILION14_COMMERCIAL_WALL_ACCESSES,
  cells: PAVILION14_COMMERCIAL_REFERENCE_CELLS,
  source: {
    document: SOURCE_DOCUMENT,
    referenceYear: 2026,
    interpretation: 'official-reference-runs',
  },
} as const;
