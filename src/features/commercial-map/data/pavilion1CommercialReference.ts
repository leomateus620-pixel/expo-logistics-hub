import {
  buildCommercialPavilionReferenceCells,
  createCommercialPavilionMetricProjector,
  type CommercialPavilionReferenceCell,
  type CommercialPavilionReferenceCellShape,
  type CommercialPavilionReferenceCorridor,
  type CommercialPavilionReferenceProjection,
  type CommercialPavilionReferenceRun,
} from './commercialPavilionReference';

export type Pavilion1CommercialReferenceCell =
  CommercialPavilionReferenceCell<'B1'>;

/**
 * Official plan: 52.70 m x 22.84 m. All measurements below are projected by
 * the same affine transform so repeated 1 m / 3 m divisions cannot drift.
 */
const PROJECT = createCommercialPavilionMetricProjector(52.7, 22.84);
const SOURCE_DOCUMENT = 'Croqui Pavilhão 1 - Fenasoja 2026.pdf' as const;

/** Official metric divisions are contiguous; the renderer adds its own visual joint. */
export const PAVILION1_COMMERCIAL_MODULE_GAP = 0;

export const PAVILION1_COMMERCIAL_REFERENCE_PROJECTION = {
  coordinateTransform: 'quarter-turn-clockwise',
  fit: 'metric-contain',
  metricWidthM: 52.7,
  metricDepthM: 22.84,
} as const satisfies CommercialPavilionReferenceProjection;

export const PAVILION1_COMMERCIAL_REFERENCE_RUNS = [
  {
    id: 'west-01-06',
    label: 'Módulos 01–06',
    role: 'perimeter',
    bounds: PROJECT.rect(0, 13.84, 3, 6),
    numberRange: [1, 6],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'perimeter-west',
    cluster: 'west-01-06',
  },
  {
    id: 'south-07-57',
    label: 'Módulos 07–57',
    role: 'perimeter',
    bounds: PROJECT.rect(0, 19.84, 51, 3),
    numberRange: [7, 57],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'perimeter-south',
    cluster: 'south-07-57',
  },
  {
    id: 'south-58',
    label: 'Módulo 58',
    role: 'perimeter',
    bounds: PROJECT.rect(51, 19.84, 1.5, 3),
    numberRange: [58, 58],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'perimeter-south',
    cluster: 'south-58',
  },
  {
    id: 'east-59-64',
    label: 'Módulos 59–64',
    role: 'perimeter',
    bounds: PROJECT.rect(49.2, 13.84, 3.5, 6),
    numberRange: [59, 64],
    orientation: 'east-west',
    sequenceOrientation: 'z-decreasing',
    group: 'perimeter-east',
    cluster: 'east-59-64',
  },
  {
    id: 'central-south-65-102',
    label: 'Módulos 65–102',
    role: 'island',
    bounds: PROJECT.rect(7.35, 11.42, 38, 3),
    numberRange: [65, 102],
    orientation: 'north-south',
    sequenceOrientation: 'x-decreasing',
    group: 'central-pair',
    cluster: 'central-south-65-102',
  },
  {
    id: 'central-north-103-140',
    label: 'Módulos 103–140',
    role: 'island',
    bounds: PROJECT.rect(7.35, 8.42, 38, 3),
    numberRange: [103, 140],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'central-pair',
    cluster: 'central-north-103-140',
  },
  {
    id: 'northeast-141',
    label: 'Módulo 141',
    role: 'perimeter',
    bounds: PROJECT.rect(48, 0, 4.7, 4.5),
    numberRange: [141, 141],
    orientation: 'east-west',
    sequenceOrientation: 'x-increasing',
    group: 'perimeter-north',
    cluster: 'northeast-141',
  },
  {
    id: 'north-142-189',
    label: 'Módulos 142–189',
    role: 'perimeter',
    bounds: PROJECT.rect(0, 0, 48, 3),
    numberRange: [142, 189],
    orientation: 'north-south',
    sequenceOrientation: 'x-decreasing',
    group: 'perimeter-north',
    cluster: 'north-142-189',
  },
] as const satisfies readonly CommercialPavilionReferenceRun[];

export const PAVILION1_COMMERCIAL_REFERENCE_CORRIDORS = [
  {
    id: 'north-distribution',
    label: 'Circulação norte',
    kind: 'main',
    ...PROJECT.rect(0, 3, 48, 5.42),
  },
  {
    id: 'west-access',
    label: 'Entrada e saída principal',
    kind: 'access',
    ...PROJECT.rect(0, 8.42, 7.35, 5.42),
  },
  {
    id: 'south-distribution',
    label: 'Circulação sul',
    kind: 'main',
    ...PROJECT.rect(3, 14.42, 46.2, 5.42),
  },
  {
    id: 'east-access',
    label: 'Saídas secundárias',
    kind: 'access',
    ...PROJECT.rect(45.35, 4.5, 7.35, 9.34),
  },
] as const satisfies readonly CommercialPavilionReferenceCorridor[];

const MODULE_141_SHAPE: CommercialPavilionReferenceCellShape = {
  footprint: PROJECT.polygon([
    [48, 0],
    [52.7, 0],
    [52.7, 4.5],
    [49.2, 4.5],
    [49.2, 3],
    [48, 3],
  ]),
  renderParts: [
    PROJECT.rect(48, 0, 4.7, 3),
    PROJECT.rect(49.2, 3, 3.5, 1.5),
  ],
  labelAnchor: PROJECT.point(50.35, 1.5),
};

export const PAVILION1_COMMERCIAL_REFERENCE_CELLS =
  buildCommercialPavilionReferenceCells({
    pavilionId: 'B1',
    runs: PAVILION1_COMMERCIAL_REFERENCE_RUNS,
    moduleGap: PAVILION1_COMMERCIAL_MODULE_GAP,
    sourceDocument: SOURCE_DOCUMENT,
    referenceYear: 2026,
    shapeForNumber: (number) => number === 141 ? MODULE_141_SHAPE : null,
  });

if (PAVILION1_COMMERCIAL_REFERENCE_CELLS.length !== 189) {
  throw new Error(
    `B1: a referência geométrica gerou ${PAVILION1_COMMERCIAL_REFERENCE_CELLS.length} módulos; o total oficial é 189.`,
  );
}

export const PAVILION1_COMMERCIAL_REFERENCE = {
  publicIdentifier: 'B1',
  pavilionNumber: 1,
  category: 'Indústria, Comércio e Serviços',
  moduleCount: 189,
  totalAreaM2: 1201.5,
  modularAreaM2: 587.85,
  individualAreaM2: null,
  moduleGap: PAVILION1_COMMERCIAL_MODULE_GAP,
  projection: PAVILION1_COMMERCIAL_REFERENCE_PROJECTION,
  runs: PAVILION1_COMMERCIAL_REFERENCE_RUNS,
  corridors: PAVILION1_COMMERCIAL_REFERENCE_CORRIDORS,
  supportSpaces: [],
  cells: PAVILION1_COMMERCIAL_REFERENCE_CELLS,
  source: {
    document: SOURCE_DOCUMENT,
    referenceYear: 2026,
    interpretation: 'official-reference-runs',
  },
} as const;
