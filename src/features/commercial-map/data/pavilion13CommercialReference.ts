import {
  buildCommercialPavilionReferenceCells,
  createCommercialPavilionMetricProjector,
  type CommercialPavilionReferenceCell,
  type CommercialPavilionReferenceCellShape,
  type CommercialPavilionReferenceCorridor,
  type CommercialPavilionReferenceProjection,
  type CommercialPavilionReferenceRect,
  type CommercialPavilionReferenceRun,
  type CommercialPavilionReferenceWallAccess,
} from './commercialPavilionReference';

export type Pavilion13CommercialReferenceCell =
  CommercialPavilionReferenceCell<'B5'>;

/**
 * Official internal plan: 21.00 m x 35.35 m. The origin is the north-west
 * corner of the drawing and the two public entrances remain on the south edge.
 */
const PROJECT = createCommercialPavilionMetricProjector(21, 35.35, 0);
const SOURCE_DOCUMENT = 'Croqui Pavilhão 13 - Fenasoja 2026_page-0001.jpg' as const;

/** Official cadastral divisions meet; the renderer supplies the visual joint. */
export const PAVILION13_COMMERCIAL_MODULE_GAP = 0;

export const PAVILION13_COMMERCIAL_REFERENCE_PROJECTION = {
  coordinateTransform: 'identity',
  fit: 'metric-contain',
  metricWidthM: 21,
  metricDepthM: 35.35,
  alignX: 'center',
  alignZ: 'end',
} as const satisfies CommercialPavilionReferenceProjection;

export const PAVILION13_COMMERCIAL_REFERENCE_RUNS = [
  {
    id: 'east-lower-01-15',
    label: 'Módulos 01–15',
    role: 'perimeter',
    bounds: PROJECT.rect(18, 20.35, 3, 15),
    numberRange: [1, 15],
    orientation: 'east-west',
    sequenceOrientation: 'z-decreasing',
    group: 'perimeter-east',
    cluster: 'east-01-26',
  },
  {
    id: 'east-upper-16-24',
    label: 'Módulos 16–24',
    role: 'perimeter',
    bounds: PROJECT.rect(18, 5.65, 3, 9),
    numberRange: [16, 24],
    orientation: 'east-west',
    sequenceOrientation: 'z-decreasing',
    group: 'perimeter-east',
    cluster: 'east-01-26',
  },
  {
    id: 'northeast-irregular-25',
    label: 'Módulo 25',
    role: 'perimeter',
    bounds: PROJECT.rect(18, 0, 3, 5.65),
    numberRange: [25, 25],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'perimeter-east',
    cluster: 'east-01-26',
  },
  {
    id: 'northeast-irregular-26',
    label: 'Módulo 26',
    role: 'perimeter',
    bounds: PROJECT.rect(14.6, 0, 6.4, 3),
    numberRange: [26, 26],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'perimeter-east',
    cluster: 'east-01-26',
  },
  {
    id: 'north-27-29',
    label: 'Módulos 27–29',
    role: 'perimeter',
    bounds: PROJECT.rect(9, 0, 3, 3),
    numberRange: [27, 29],
    orientation: 'north-south',
    sequenceOrientation: 'x-decreasing',
    group: 'perimeter-north',
    cluster: 'north-27-29',
  },
  {
    id: 'central-east-30-53',
    label: 'Módulos 30–53',
    role: 'island',
    bounds: PROJECT.rect(10.5, 6.8, 3, 24),
    numberRange: [30, 53],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'central-pair',
    cluster: 'central-30-77',
  },
  {
    id: 'central-west-54-77',
    label: 'Módulos 54–77',
    role: 'island',
    bounds: PROJECT.rect(7.5, 6.8, 3, 24),
    numberRange: [54, 77],
    orientation: 'east-west',
    sequenceOrientation: 'z-decreasing',
    group: 'central-pair',
    cluster: 'central-30-77',
  },
  {
    id: 'northwest-irregular-78',
    label: 'Módulo 78',
    role: 'perimeter',
    bounds: PROJECT.rect(0, 0, 6.4, 3),
    numberRange: [78, 78],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'perimeter-west',
    cluster: 'west-78-103',
  },
  {
    id: 'northwest-irregular-79',
    label: 'Módulo 79',
    role: 'perimeter',
    bounds: PROJECT.rect(0, 0, 3, 5.65),
    numberRange: [79, 79],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'perimeter-west',
    cluster: 'west-78-103',
  },
  {
    id: 'west-upper-80-88',
    label: 'Módulos 80–88',
    role: 'perimeter',
    bounds: PROJECT.rect(0, 5.65, 3, 9),
    numberRange: [80, 88],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'perimeter-west',
    cluster: 'west-78-103',
  },
  {
    id: 'west-lower-89-103',
    label: 'Módulos 89–103',
    role: 'perimeter',
    bounds: PROJECT.rect(0, 20.35, 3, 15),
    numberRange: [89, 103],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'perimeter-west',
    cluster: 'west-78-103',
  },
] as const satisfies readonly CommercialPavilionReferenceRun[];

export const PAVILION13_COMMERCIAL_REFERENCE_CORRIDORS = [
  {
    id: 'northwest-entry',
    label: 'Acesso norte',
    kind: 'access',
    ...PROJECT.rect(6.4, 0, 2.6, 3),
  },
  {
    id: 'northeast-entry',
    label: 'Acesso norte',
    kind: 'access',
    ...PROJECT.rect(12, 0, 2.6, 3),
  },
  {
    id: 'north-distribution',
    label: 'Circulação norte',
    kind: 'cross',
    ...PROJECT.rect(3, 3, 15, 3.8),
  },
  {
    id: 'west-main-aisle',
    label: 'Corredor principal oeste',
    kind: 'main',
    ...PROJECT.rect(3, 6.8, 4.5, 24),
  },
  {
    id: 'east-main-aisle',
    label: 'Corredor principal leste',
    kind: 'main',
    ...PROJECT.rect(13.5, 6.8, 4.5, 24),
  },
  {
    id: 'west-cross-access',
    label: 'Acesso lateral oeste',
    kind: 'access',
    ...PROJECT.rect(0, 15.5, 7.5, 4),
  },
  {
    id: 'east-cross-access',
    label: 'Acesso lateral leste',
    kind: 'access',
    ...PROJECT.rect(13.5, 15.5, 7.5, 4),
  },
  {
    id: 'south-distribution',
    label: 'Circulação e acessos sul',
    kind: 'main',
    ...PROJECT.rect(3, 30.8, 15, 4.55),
  },
] as const satisfies readonly CommercialPavilionReferenceCorridor[];

export const PAVILION13_COMMERCIAL_WALL_ACCESSES = [
  {
    id: 'pavilion-3-connection',
    label: 'Acesso para o Pavilhão 3',
    corridorId: 'east-cross-access',
    edges: ['right'],
    kind: 'gate',
    sourcePrecision: 'official-metric',
    connectsTo: 'B6',
    structuralOpening: false,
  },
] as const satisfies readonly CommercialPavilionReferenceWallAccess[];

const DIAGONAL_RENDER_SLICES = 12;

const MODULE_METRIC_FOOTPRINTS = {
  25: [
    [21, 0],
    [21, 5.65],
    [18, 5.65],
    [18, 3],
  ],
  26: [
    [14.6, 0],
    [21, 0],
    [18, 3],
    [14.6, 3],
  ],
  78: [
    [0, 0],
    [6.4, 0],
    [6.4, 3],
    [3, 3],
  ],
  79: [
    [0, 0],
    [3, 3],
    [3, 5.65],
    [0, 5.65],
  ],
} as const;

function diagonalPartitionParts(
  side: 'west-upper' | 'west-lower' | 'east-upper' | 'east-lower',
): CommercialPavilionReferenceRect[] {
  const sliceDepth = 3 / DIAGONAL_RENDER_SLICES;
  const diagonalParts = Array.from(
    { length: DIAGONAL_RENDER_SLICES },
    (_, index) => {
      const top = index * sliceDepth;
      const midpointZ = top + sliceDepth / 2;
      if (side === 'west-upper') {
        return PROJECT.rect(midpointZ, top, 6.4 - midpointZ, sliceDepth);
      }
      if (side === 'west-lower') {
        return PROJECT.rect(0, top, midpointZ, sliceDepth);
      }
      if (side === 'east-upper') {
        return PROJECT.rect(14.6, top, 6.4 - midpointZ, sliceDepth);
      }
      return PROJECT.rect(21 - midpointZ, top, midpointZ, sliceDepth);
    },
  );

  if (side === 'west-lower') {
    diagonalParts.push(PROJECT.rect(0, 3, 3, 2.65));
  } else if (side === 'east-lower') {
    diagonalParts.push(PROJECT.rect(18, 3, 3, 2.65));
  }
  return diagonalParts;
}

const MODULE_SHAPES = {
  25: {
    footprint: PROJECT.polygon(MODULE_METRIC_FOOTPRINTS[25]),
    renderParts: diagonalPartitionParts('east-lower'),
    labelAnchor: PROJECT.point(19.5, 3.75),
  },
  26: {
    footprint: PROJECT.polygon(MODULE_METRIC_FOOTPRINTS[26]),
    renderParts: diagonalPartitionParts('east-upper'),
    labelAnchor: PROJECT.point(17.5, 1.45),
  },
  78: {
    footprint: PROJECT.polygon(MODULE_METRIC_FOOTPRINTS[78]),
    renderParts: diagonalPartitionParts('west-upper'),
    labelAnchor: PROJECT.point(3.5, 1.45),
  },
  79: {
    footprint: PROJECT.polygon(MODULE_METRIC_FOOTPRINTS[79]),
    renderParts: diagonalPartitionParts('west-lower'),
    labelAnchor: PROJECT.point(1.5, 3.75),
  },
} as const satisfies Record<25 | 26 | 78 | 79, CommercialPavilionReferenceCellShape>;

export const PAVILION13_COMMERCIAL_REFERENCE_CELLS =
  buildCommercialPavilionReferenceCells({
    pavilionId: 'B5',
    runs: PAVILION13_COMMERCIAL_REFERENCE_RUNS,
    moduleGap: PAVILION13_COMMERCIAL_MODULE_GAP,
    sourceDocument: SOURCE_DOCUMENT,
    referenceYear: 2026,
    shapeForNumber: (number) => (
      number === 25 || number === 26 || number === 78 || number === 79
        ? MODULE_SHAPES[number]
        : null
    ),
  });

if (PAVILION13_COMMERCIAL_REFERENCE_CELLS.length !== 103) {
  throw new Error(
    `B5: a referência geométrica gerou ${PAVILION13_COMMERCIAL_REFERENCE_CELLS.length} módulos; o total oficial é 103.`,
  );
}

function metricPolygonArea(
  points: readonly (readonly [x: number, z: number])[],
): number {
  return Math.abs(points.reduce((area, [x, z], index) => {
    const [nextX, nextZ] = points[(index + 1) % points.length];
    return area + x * nextZ - nextX * z;
  }, 0)) / 2;
}

const NORMALIZED_METRIC_SPAN = 1 - PROJECT.inset * 2;
const REGULAR_MODULE_AREA_M2 = PAVILION13_COMMERCIAL_REFERENCE_CELLS
  .filter((cell) => !cell.shape)
  .reduce((area, cell) => (
    area
    + (cell.width * PROJECT.widthMeters / NORMALIZED_METRIC_SPAN)
      * (cell.depth * PROJECT.depthMeters / NORMALIZED_METRIC_SPAN)
  ), 0);
const IRREGULAR_MODULE_AREA_M2 = Object.values(MODULE_METRIC_FOOTPRINTS)
  .reduce((area, footprint) => area + metricPolygonArea(footprint), 0);
export const PAVILION13_COMMERCIAL_GEOMETRIC_AREA_M2 =
  REGULAR_MODULE_AREA_M2 + IRREGULAR_MODULE_AREA_M2;

if (Math.abs(PAVILION13_COMMERCIAL_GEOMETRIC_AREA_M2 - 351.3) > 1e-9) {
  throw new Error('B5: a geometria modular não fecha a área oficial de 351,30 m².');
}

export const PAVILION13_COMMERCIAL_REFERENCE = {
  publicIdentifier: 'B5',
  pavilionNumber: 13,
  category: 'Indústria e Comércio',
  moduleCount: 103,
  totalAreaM2: 709.05,
  modularAreaM2: 351.3,
  individualAreaM2: null,
  moduleGap: PAVILION13_COMMERCIAL_MODULE_GAP,
  boundary: { centerX: 0.5, centerZ: 0.5, width: 1, depth: 1 },
  projection: PAVILION13_COMMERCIAL_REFERENCE_PROJECTION,
  interiorPresentation: { fit: 'official-content' },
  legendNumberRanges: [[1, 26], [27, 29], [30, 77], [78, 103]],
  runs: PAVILION13_COMMERCIAL_REFERENCE_RUNS,
  corridors: PAVILION13_COMMERCIAL_REFERENCE_CORRIDORS,
  supportSpaces: [],
  wallAccesses: PAVILION13_COMMERCIAL_WALL_ACCESSES,
  cells: PAVILION13_COMMERCIAL_REFERENCE_CELLS,
  source: {
    document: SOURCE_DOCUMENT,
    referenceYear: 2026,
    interpretation: 'official-metric-polygons',
    metricDimensions: {
      widthM: 21,
      depthM: 35.35,
    },
    geometricModuleAreaM2: PAVILION13_COMMERCIAL_GEOMETRIC_AREA_M2,
  },
} as const;
