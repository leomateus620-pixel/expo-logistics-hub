import {
  buildCommercialPavilionReferenceCells,
  createCommercialPavilionMetricProjector,
  type CommercialPavilionReferenceCell,
  type CommercialPavilionReferenceCorridor,
  type CommercialPavilionReferenceProjection,
  type CommercialPavilionReferenceRun,
  type CommercialPavilionReferenceSupportSpace,
  type CommercialPavilionReferenceWallAccess,
} from './commercialPavilionReference';

export type Pavilion7CommercialReferenceCell =
  CommercialPavilionReferenceCell<'B10'>;

/**
 * Official commercial hall: 49.90 m x 18.30 m. The source drawing places the
 * public entrance on its south edge. September 2026 CROQUI HORTI 2025:
 * 57 independent 3.00 x 2.50 m boxes, 427.50 m² commercial / 917.00 m² total.
 */
const PROJECT = createCommercialPavilionMetricProjector(49.9, 18.3, 0);
const SOURCE_DOCUMENT =
  'Ajuste_Pav07.pdf (setembro/2026)' as const;

/** The official metric divisions are contiguous. */
export const PAVILION7_COMMERCIAL_MODULE_GAP = 0;

export const PAVILION7_COMMERCIAL_REFERENCE_PROJECTION = {
  coordinateTransform: 'identity',
  fit: 'metric-contain',
  metricWidthM: 49.9,
  metricDepthM: 18.3,
  alignX: 'center',
  alignZ: 'end',
} as const satisfies CommercialPavilionReferenceProjection;

export const PAVILION7_COMMERCIAL_REFERENCE_RUNS = [
  {
    id: 'north-west-01-04',
    label: 'Boxes 01–04',
    role: 'perimeter',
    bounds: PROJECT.rect(3.7, 0.2, 12, 2.5),
    numberRange: [1, 4],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'perimeter-north',
    cluster: 'north-01-15',
  },
  {
    id: 'north-east-05-15',
    label: 'Boxes 05–15',
    role: 'perimeter',
    bounds: PROJECT.rect(16.4, 0.2, 33, 2.5),
    numberRange: [5, 15],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'perimeter-north',
    cluster: 'north-01-15',
  },
  {
    id: 'central-north-16-29',
    label: 'Boxes 16–29',
    role: 'island',
    bounds: PROJECT.rect(3.95, 6.65, 42, 2.5),
    numberRange: [16, 29],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'central-pair',
    cluster: 'central-16-43',
  },
  {
    id: 'central-south-30-43',
    label: 'Boxes 43–30',
    role: 'island',
    bounds: PROJECT.rect(3.95, 9.15, 42, 2.5),
    numberRange: [30, 43],
    orientation: 'north-south',
    sequenceOrientation: 'x-decreasing',
    group: 'central-pair',
    cluster: 'central-16-43',
  },
  {
    id: 'south-west-44-49',
    label: 'Boxes 44–49',
    role: 'perimeter',
    bounds: PROJECT.rect(0.2, 15.6, 18, 2.5),
    numberRange: [44, 49],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'perimeter-south',
    cluster: 'south-44-57',
  },
  {
    id: 'south-east-50-57',
    label: 'Boxes 50–57',
    role: 'perimeter',
    bounds: PROJECT.rect(25.7, 15.6, 24, 2.5),
    numberRange: [50, 57],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'perimeter-south',
    cluster: 'south-44-57',
  },
] as const satisfies readonly CommercialPavilionReferenceRun[];

export const PAVILION7_COMMERCIAL_REFERENCE_CORRIDORS = [
  {
    id: 'north-main-aisle',
    label: 'Corredor principal norte',
    kind: 'main',
    ...PROJECT.rect(0.2, 2.7, 49.5, 3.95),
  },
  {
    id: 'south-main-aisle',
    label: 'Corredor principal sul',
    kind: 'main',
    ...PROJECT.rect(0.2, 11.65, 49.5, 3.95),
  },
  {
    id: 'west-island-circulation',
    label: 'Circulação lateral oeste',
    kind: 'perimeter',
    ...PROJECT.rect(0.2, 6.65, 3.75, 5),
  },
  {
    id: 'east-island-circulation',
    label: 'Circulação lateral leste',
    kind: 'perimeter',
    ...PROJECT.rect(45.95, 6.65, 3.75, 5),
  },
  {
    id: 'south-central-entrance',
    label: 'Acesso principal',
    kind: 'access',
    ...PROJECT.rect(18.2, 15.6, 7.5, 2.5),
  },
  {
    id: 'northwest-access',
    label: 'Entrada e saída norte',
    kind: 'access',
    ...PROJECT.rect(0.2, 0.2, 4.5, 2.5),
  },
] as const satisfies readonly CommercialPavilionReferenceCorridor[];

/**
 * The 14.80 x 3.70 m rear annex is dimensioned by the official plan, while
 * its horizontal tie to the main hall is only graphically traceable.
 */
export const PAVILION7_COMMERCIAL_SUPPORT_SPACES = [
  {
    id: 'cozinha-pavilhao-7',
    label: 'Cozinha do Pavilhão 7',
    kind: 'kitchen',
    type: 'permanent-non-commercial',
    sourcePrecision: 'plan-traced',
    ...PROJECT.rect(17, -3.7, 4.5, 3.7),
  },
  {
    id: 'banheiros-pavilhao-7',
    label: 'Banheiros do Pavilhão 7',
    kind: 'sanitary',
    type: 'permanent-non-commercial',
    sourcePrecision: 'plan-traced',
    ...PROJECT.rect(21.5, -3.7, 10.3, 3.7),
  },
] as const satisfies readonly CommercialPavilionReferenceSupportSpace[];

export const PAVILION7_WALL_ACCESSES = [
  {
    id: 'front-central-door',
    label: 'Entrada principal',
    wall: 'front',
    centerAlongWallM: 24.95,
    openingWidthM: 3,
    openingHeightM: 3.5,
    kind: 'entrance',
    sourcePrecision: 'official-metric',
  },
  {
    id: 'rear-west-door',
    label: 'Entrada e saída norte',
    wall: 'rear',
    centerAlongWallM: 2.45,
    openingWidthM: 2.4,
    openingHeightM: 2.1,
    kind: 'entrance',
    sourcePrecision: 'plan-traced',
  },
  {
    id: 'right-north-isolated-gate',
    label: 'Portão isolado norte',
    wall: 'right',
    centerAlongWallM: 4.675,
    openingWidthM: 3.5,
    openingHeightM: 3.3,
    kind: 'gate',
    sourcePrecision: 'plan-traced',
    connectsTo: 'PAVILION_11_SHEET_02',
  },
  {
    id: 'right-south-isolated-gate',
    label: 'Portão isolado sul',
    wall: 'right',
    centerAlongWallM: 13.625,
    openingWidthM: 3.5,
    openingHeightM: 3.3,
    kind: 'gate',
    sourcePrecision: 'plan-traced',
    connectsTo: 'PAVILION_11_SHEET_02',
  },
] as const satisfies readonly CommercialPavilionReferenceWallAccess[];

export const PAVILION7_COMMERCIAL_REFERENCE_CELLS =
  buildCommercialPavilionReferenceCells({
    pavilionId: 'B10',
    runs: PAVILION7_COMMERCIAL_REFERENCE_RUNS,
    moduleGap: PAVILION7_COMMERCIAL_MODULE_GAP,
    sourceDocument: SOURCE_DOCUMENT,
    referenceYear: 2026,
  });

if (PAVILION7_COMMERCIAL_REFERENCE_CELLS.length !== 57) {
  throw new Error(
    `B10: a referência geométrica gerou ${PAVILION7_COMMERCIAL_REFERENCE_CELLS.length} boxes; o croqui oficial contém 57.`,
  );
}

export const PAVILION7_COMMERCIAL_GEOMETRIC_AREA_M2 =
  PAVILION7_COMMERCIAL_REFERENCE_CELLS.length * 3 * 2.5;

if (Math.abs(PAVILION7_COMMERCIAL_GEOMETRIC_AREA_M2 - 427.5) > 1e-9) {
  throw new Error('B10: a soma geométrica oficial deve ser 427,50 m².');
}

export const PAVILION7_COMMERCIAL_REFERENCE = {
  publicIdentifier: 'B10',
  pavilionNumber: 7,
  category: 'Agricultura Familiar / Agroindústrias',
  moduleCount: 57,
  sourceDeclaredModuleCount: 57,
  totalAreaM2: 917,
  modularAreaM2: 427.5,
  individualAreaM2: 7.5,
  moduleGap: PAVILION7_COMMERCIAL_MODULE_GAP,
  boundary: { centerX: 0.5, centerZ: 0.5, width: 1, depth: 1 },
  projection: PAVILION7_COMMERCIAL_REFERENCE_PROJECTION,
  legendNumberRanges: [[1, 15], [16, 29], [30, 43], [44, 49], [50, 57]],
  runs: PAVILION7_COMMERCIAL_REFERENCE_RUNS,
  corridors: PAVILION7_COMMERCIAL_REFERENCE_CORRIDORS,
  supportSpaces: PAVILION7_COMMERCIAL_SUPPORT_SPACES,
  wallAccesses: PAVILION7_WALL_ACCESSES,
  cells: PAVILION7_COMMERCIAL_REFERENCE_CELLS,
  source: {
    document: SOURCE_DOCUMENT,
    referenceYear: 2026,
    interpretation: 'official-reference-runs',
    discrepancy: null,
  },
} as const;
