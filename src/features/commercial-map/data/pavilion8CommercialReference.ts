import {
  buildCommercialPavilionReferenceCells,
  createCommercialPavilionMetricProjector,
  type CommercialPavilionReferenceCell,
  type CommercialPavilionReferenceCellShape,
  type CommercialPavilionReferenceCorridor,
  type CommercialPavilionReferenceProjection,
  type CommercialPavilionReferenceRun,
  type CommercialPavilionReferenceSupportSpace,
} from './commercialPavilionReference';

export type Pavilion8CommercialReferenceCell =
  CommercialPavilionReferenceCell<'B4'>;

/**
 * Official commercial hall: 21.70 m x 35.40 m. The support wing is traced
 * north of the measured hall because the official plan does not publish its
 * complete enclosing dimensions.
 */
const PROJECT = createCommercialPavilionMetricProjector(21.7, 35.4, 0);
const SOURCE_DOCUMENT =
  'Croqui Pavilhão 8- Fenasoja 2026 com cozinha_page-0001 (2).jpg' as const;

/** Official metric divisions are contiguous; the renderer adds visual joints. */
export const PAVILION8_COMMERCIAL_MODULE_GAP = 0;

export const PAVILION8_COMMERCIAL_REFERENCE_PROJECTION = {
  coordinateTransform: 'identity',
  fit: 'metric-contain',
  metricWidthM: 21.7,
  metricDepthM: 35.4,
  alignX: 'center',
  alignZ: 'end',
} as const satisfies CommercialPavilionReferenceProjection;

export const PAVILION8_COMMERCIAL_REFERENCE_RUNS = [
  {
    id: 'east-lower-01-20',
    label: 'Módulos 01–20',
    role: 'perimeter',
    bounds: PROJECT.rect(17.7, 14, 4, 20),
    numberRange: [1, 20],
    orientation: 'east-west',
    sequenceOrientation: 'z-decreasing',
    group: 'perimeter-east',
    cluster: 'east-lower-01-20',
  },
  {
    id: 'east-upper-21-25',
    label: 'Módulos 21–25',
    role: 'perimeter',
    bounds: PROJECT.rect(17.7, 5, 4, 5),
    numberRange: [21, 25],
    orientation: 'east-west',
    sequenceOrientation: 'z-decreasing',
    group: 'perimeter-east',
    cluster: 'east-upper-21-25',
  },
  {
    id: 'north-26-37',
    label: 'Módulos 26–37',
    role: 'perimeter',
    bounds: PROJECT.rect(5.5, 0, 12, 3),
    numberRange: [26, 37],
    orientation: 'north-south',
    sequenceOrientation: 'x-decreasing',
    group: 'perimeter-north',
    cluster: 'north-26-37',
  },
  {
    id: 'central-east-38-63',
    label: 'Módulos 38–63',
    role: 'island',
    bounds: PROJECT.rect(10.85, 5, 3.5, 26),
    numberRange: [38, 63],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'central-pair',
    cluster: 'central-east-38-63',
  },
  {
    id: 'central-west-64-89',
    label: 'Módulos 64–89',
    role: 'island',
    bounds: PROJECT.rect(7.35, 5, 3.5, 26),
    numberRange: [64, 89],
    orientation: 'east-west',
    sequenceOrientation: 'z-decreasing',
    group: 'central-pair',
    cluster: 'central-west-64-89',
  },
  {
    id: 'northwest-90',
    label: 'Módulo 90',
    role: 'perimeter',
    bounds: PROJECT.rect(0, 0, 5.5, 5),
    numberRange: [90, 90],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'perimeter-west',
    cluster: 'northwest-90',
  },
  {
    id: 'west-upper-91-100',
    label: 'Módulos 91–100',
    role: 'perimeter',
    bounds: PROJECT.rect(0, 5, 4, 10),
    numberRange: [91, 100],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'perimeter-west',
    cluster: 'west-upper-91-100',
  },
  {
    id: 'west-lower-101-114',
    label: 'Módulos 101–114',
    role: 'perimeter',
    bounds: PROJECT.rect(0, 19, 4, 14),
    numberRange: [101, 114],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'perimeter-west',
    cluster: 'west-lower-101-114',
  },
] as const satisfies readonly CommercialPavilionReferenceRun[];

export const PAVILION8_COMMERCIAL_REFERENCE_CORRIDORS = [
  {
    id: 'west-commercial-aisle',
    label: 'Corredor comercial esquerdo',
    kind: 'main',
    ...PROJECT.rect(4, 5, 3.35, 29),
  },
  {
    id: 'east-commercial-aisle',
    label: 'Corredor comercial direito',
    kind: 'main',
    ...PROJECT.rect(14.35, 5, 3.35, 30),
  },
  {
    id: 'north-distribution',
    label: 'Acesso à porta de emergência',
    kind: 'access',
    ...PROJECT.rect(5.5, 3, 12.2, 2),
  },
  {
    id: 'west-cross-access',
    label: 'Acesso lateral ao Pavilhão 13',
    kind: 'cross',
    ...PROJECT.rect(0, 15, 7.35, 4),
  },
  {
    id: 'east-cross-access',
    label: 'Acesso lateral ao Pavilhão 12',
    kind: 'cross',
    ...PROJECT.rect(14.35, 10, 7.35, 4),
  },
  {
    id: 'south-entrance',
    label: 'Entradas e saídas principais',
    kind: 'access',
    ...PROJECT.rect(4, 31, 13.7, 4.4),
  },
] as const satisfies readonly CommercialPavilionReferenceCorridor[];

export const PAVILION8_COMMERCIAL_SUPPORT_SPACES = [
  {
    id: 'sanitarios',
    label: 'Sanitários',
    kind: 'sanitary',
    type: 'permanent-non-commercial',
    sourcePrecision: 'plan-traced',
    ...PROJECT.rect(0, -7.4, 7.1, 7.4),
  },
  {
    id: 'cozinha',
    label: 'Cozinha',
    kind: 'kitchen',
    type: 'permanent-non-commercial',
    sourcePrecision: 'plan-traced',
    ...PROJECT.rect(7.1, -7.4, 11.9, 7.4),
  },
  {
    id: 'apoio-cozinha',
    label: 'Apoio de serviço',
    kind: 'service',
    type: 'permanent-non-commercial',
    sourcePrecision: 'plan-traced',
    ...PROJECT.rect(19, -6.4, 2.7, 6.4),
  },
] as const satisfies readonly CommercialPavilionReferenceSupportSpace[];

const MODULE_90_SHAPE: CommercialPavilionReferenceCellShape = {
  footprint: PROJECT.polygon([
    [0, 0],
    [5.5, 0],
    [5.5, 3],
    [4, 3],
    [4, 5],
    [0, 5],
  ]),
  renderParts: [
    PROJECT.rect(0, 0, 4, 5),
    PROJECT.rect(4, 0, 1.5, 3),
  ],
  labelAnchor: PROJECT.point(2, 2.5),
};

export const PAVILION8_COMMERCIAL_REFERENCE_CELLS =
  buildCommercialPavilionReferenceCells({
    pavilionId: 'B4',
    runs: PAVILION8_COMMERCIAL_REFERENCE_RUNS,
    moduleGap: PAVILION8_COMMERCIAL_MODULE_GAP,
    sourceDocument: SOURCE_DOCUMENT,
    referenceYear: 2026,
    shapeForNumber: (number) => number === 90 ? MODULE_90_SHAPE : null,
  });

if (PAVILION8_COMMERCIAL_REFERENCE_CELLS.length !== 114) {
  throw new Error(
    `B4: a referência geométrica gerou ${PAVILION8_COMMERCIAL_REFERENCE_CELLS.length} módulos; o total oficial é 114.`,
  );
}

export const PAVILION8_COMMERCIAL_GEOMETRIC_AREA_M2 =
  25 * 4 + 12 * 3 + 52 * 3.5 + 24 * 4 + 24.5;

if (Math.abs(PAVILION8_COMMERCIAL_GEOMETRIC_AREA_M2 - 438.5) > 1e-9) {
  throw new Error('B4: a soma geométrica oficial deve ser 438,50 m².');
}

export const PAVILION8_COMMERCIAL_REFERENCE = {
  publicIdentifier: 'B4',
  pavilionNumber: 8,
  category: 'Indústria e Comércio',
  moduleCount: 114,
  totalAreaM2: 760.2,
  modularAreaM2: 438.5,
  individualAreaM2: null,
  moduleGap: PAVILION8_COMMERCIAL_MODULE_GAP,
  boundary: { centerX: 0.5, centerZ: 0.5, width: 1, depth: 1 },
  projection: PAVILION8_COMMERCIAL_REFERENCE_PROJECTION,
  interiorPresentation: { fit: 'official-content' },
  legendNumberRanges: [[1, 20], [21, 37], [38, 89], [90, 114]],
  runs: PAVILION8_COMMERCIAL_REFERENCE_RUNS,
  corridors: PAVILION8_COMMERCIAL_REFERENCE_CORRIDORS,
  supportSpaces: PAVILION8_COMMERCIAL_SUPPORT_SPACES,
  cells: PAVILION8_COMMERCIAL_REFERENCE_CELLS,
  source: {
    document: SOURCE_DOCUMENT,
    referenceYear: 2026,
    interpretation: 'official-reference-runs',
  },
} as const;
