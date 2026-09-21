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
 * Official internal plan: 19.80 m x 37.80 m. The origin is the north-west
 * corner of the drawing and the two public entrances remain on the south edge.
 */
const PROJECT = createCommercialPavilionMetricProjector(19.8, 37.8, 0);
const SOURCE_DOCUMENT = 'Planta Pavilhão 13 — Fenasoja 2028 (desenho set/2026).pdf' as const;

/** Official cadastral divisions meet; the renderer supplies the visual joint. */
export const PAVILION13_COMMERCIAL_MODULE_GAP = 0;

export const PAVILION13_COMMERCIAL_REFERENCE_PROJECTION = {
  coordinateTransform: 'identity',
  fit: 'metric-contain',
  metricWidthM: 19.8,
  metricDepthM: 37.8,
  alignX: 'center',
  alignZ: 'end',
} as const satisfies CommercialPavilionReferenceProjection;

export const PAVILION13_COMMERCIAL_REFERENCE_RUNS = [
  {
    id: 'east-lower-01-15',
    label: 'Módulos 01–15',
    role: 'perimeter',
    bounds: PROJECT.rect(16.8, 22.8, 3, 15),
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
    bounds: PROJECT.rect(16.8, 6, 3, 9),
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
    bounds: PROJECT.rect(16.8, 0, 3, 6),
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
    bounds: PROJECT.rect(13.8, 0, 6, 3),
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
    bounds: PROJECT.rect(8.4, 0, 3, 3),
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
    bounds: PROJECT.rect(9.9, 9.25, 3, 24),
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
    bounds: PROJECT.rect(6.9, 9.25, 3, 24),
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
    bounds: PROJECT.rect(0, 0, 6, 3),
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
    bounds: PROJECT.rect(0, 0, 3, 6),
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
    bounds: PROJECT.rect(0, 6, 3, 9),
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
    bounds: PROJECT.rect(0, 22.8, 3, 15),
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
    ...PROJECT.rect(6, 0, 2.4, 3),
  },
  {
    id: 'northeast-entry',
    label: 'Acesso norte',
    kind: 'access',
    ...PROJECT.rect(11.4, 0, 2.4, 3),
  },
  {
    id: 'north-distribution',
    label: 'Circulação norte',
    kind: 'cross',
    ...PROJECT.rect(3, 6, 13.8, 3.25),
  },
  {
    id: 'west-main-aisle',
    label: 'Corredor principal oeste',
    kind: 'main',
    ...PROJECT.rect(3, 9.25, 3.9, 24),
  },
  {
    id: 'east-main-aisle',
    label: 'Corredor principal leste',
    kind: 'main',
    ...PROJECT.rect(12.9, 9.25, 3.9, 24),
  },
  {
    id: 'west-cross-access',
    label: 'Acesso lateral oeste',
    kind: 'access',
    ...PROJECT.rect(0, 15, 6.9, 7.8),
  },
  {
    id: 'east-cross-access',
    label: 'Acesso lateral leste',
    kind: 'access',
    ...PROJECT.rect(12.9, 15, 6.9, 7.8),
  },
  {
    id: 'south-distribution',
    label: 'Circulação e acessos sul',
    kind: 'main',
    ...PROJECT.rect(3, 33.25, 13.8, 4.55),
  },
] as const satisfies readonly CommercialPavilionReferenceCorridor[];

export const PAVILION13_COMMERCIAL_WALL_ACCESSES = [
  {
    id: 'northwest-exit',
    label: 'Saída',
    corridorId: 'northwest-entry',
    edges: ['rear'],
    kind: 'exit',
    sourcePrecision: 'official-metric',
    structuralOpening: false,
  },
  {
    id: 'northeast-exit',
    label: 'Saída',
    corridorId: 'northeast-entry',
    edges: ['rear'],
    kind: 'exit',
    sourcePrecision: 'official-metric',
    structuralOpening: false,
  },
  {
    id: 'southwest-entrance',
    label: 'Entrada',
    wall: 'front',
    centerAlongWallM: 6.3,
    openingWidthM: 3,
    kind: 'entrance',
    sourcePrecision: 'plan-traced',
    structuralOpening: false,
  },
  {
    id: 'southeast-entrance',
    label: 'Entrada',
    wall: 'front',
    centerAlongWallM: 13.5,
    openingWidthM: 3,
    kind: 'entrance',
    sourcePrecision: 'plan-traced',
    structuralOpening: false,
  },
  {
    id: 'pavilion-3-connection',
    label: 'Acesso para o Pavilhão 3',
    corridorId: 'west-cross-access',
    edges: ['left'],
    kind: 'gate',
    sourcePrecision: 'official-metric',
    connectsTo: 'B6',
    structuralOpening: false,
  },
  {
    id: 'pavilion-8-connection',
    label: 'Acesso para o Pavilhão 8',
    corridorId: 'east-cross-access',
    edges: ['right'],
    kind: 'gate',
    sourcePrecision: 'official-metric',
    connectsTo: 'B4',
    structuralOpening: false,
  },
] as const satisfies readonly CommercialPavilionReferenceWallAccess[];

const DIAGONAL_RENDER_SLICES = 12;

export const PAVILION13_MODULE_METRIC_FOOTPRINTS = {
  25: [
    [19.8, 0],
    [19.8, 6],
    [16.8, 6],
    [16.8, 3],
  ],
  26: [
    [13.8, 0],
    [19.8, 0],
    [16.8, 3],
    [13.8, 3],
  ],
  78: [
    [0, 0],
    [6, 0],
    [6, 3],
    [3, 3],
  ],
  79: [
    [0, 0],
    [3, 3],
    [3, 6],
    [0, 6],
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
        return PROJECT.rect(midpointZ, top, 6 - midpointZ, sliceDepth);
      }
      if (side === 'west-lower') {
        return PROJECT.rect(0, top, midpointZ, sliceDepth);
      }
      if (side === 'east-upper') {
        return PROJECT.rect(13.8, top, 6 - midpointZ, sliceDepth);
      }
      return PROJECT.rect(19.8 - midpointZ, top, midpointZ, sliceDepth);
    },
  );

  if (side === 'west-lower') {
    diagonalParts.push(PROJECT.rect(0, 3, 3, 3));
  } else if (side === 'east-lower') {
    diagonalParts.push(PROJECT.rect(16.8, 3, 3, 3));
  }
  return diagonalParts;
}

const MODULE_SHAPES = {
  25: {
    footprint: PROJECT.polygon(PAVILION13_MODULE_METRIC_FOOTPRINTS[25]),
    renderParts: diagonalPartitionParts('east-lower'),
    labelAnchor: PROJECT.point(18.3, 4.5),
  },
  26: {
    footprint: PROJECT.polygon(PAVILION13_MODULE_METRIC_FOOTPRINTS[26]),
    renderParts: diagonalPartitionParts('east-upper'),
    labelAnchor: PROJECT.point(16.2, 1.35),
  },
  78: {
    footprint: PROJECT.polygon(PAVILION13_MODULE_METRIC_FOOTPRINTS[78]),
    renderParts: diagonalPartitionParts('west-upper'),
    labelAnchor: PROJECT.point(3.6, 1.35),
  },
  79: {
    footprint: PROJECT.polygon(PAVILION13_MODULE_METRIC_FOOTPRINTS[79]),
    renderParts: diagonalPartitionParts('west-lower'),
    labelAnchor: PROJECT.point(1.5, 4.5),
  },
} as const satisfies Record<25 | 26 | 78 | 79, CommercialPavilionReferenceCellShape>;

export const PAVILION13_COMMERCIAL_REFERENCE_CELLS =
  buildCommercialPavilionReferenceCells({
    pavilionId: 'B5',
    runs: PAVILION13_COMMERCIAL_REFERENCE_RUNS,
    moduleGap: PAVILION13_COMMERCIAL_MODULE_GAP,
    sourceDocument: SOURCE_DOCUMENT,
    referenceYear: 2028,
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
const IRREGULAR_MODULE_AREA_M2 = Object.values(PAVILION13_MODULE_METRIC_FOOTPRINTS)
  .reduce((area, footprint) => area + metricPolygonArea(footprint), 0);
export const PAVILION13_COMMERCIAL_GEOMETRIC_AREA_M2 =
  REGULAR_MODULE_AREA_M2 + IRREGULAR_MODULE_AREA_M2;

if (Math.abs(PAVILION13_COMMERCIAL_GEOMETRIC_AREA_M2 - 351) > 1e-9) {
  throw new Error('B5: a geometria modular não fecha a área oficial de 351,00 m².');
}

export const PAVILION13_COMMERCIAL_REFERENCE = {
  publicIdentifier: 'B5',
  pavilionNumber: 13,
  category: 'Indústria e Comércio',
  moduleCount: 103,
  totalAreaM2: 709,
  modularAreaM2: 351,
  individualAreaM2: null,
  moduleGap: PAVILION13_COMMERCIAL_MODULE_GAP,
  boundary: { centerX: 0.5, centerZ: 0.5, width: 1, depth: 1 },
  projection: PAVILION13_COMMERCIAL_REFERENCE_PROJECTION,
  interiorPresentation: {
    fit: 'official-content',
    mode: 'plan',
    navigationMode: 'locked-plan',
    enableRotate: false,
    enablePan: true,
    mouseNavigation: 'pan',
    touchNavigation: 'pan-dolly',
    preserveCanonicalOrientation: true,
    includeWayfindingInFit: true,
    flatModules: true,
    numberPriority: 'maximum',
    showAreaInsideModule: false,
    boundedPan: true,
    boundedZoom: true,
  },
  legendNumberRanges: [[1, 26], [27, 29], [30, 77], [78, 103]],
  runs: PAVILION13_COMMERCIAL_REFERENCE_RUNS,
  corridors: PAVILION13_COMMERCIAL_REFERENCE_CORRIDORS,
  supportSpaces: [],
  wallAccesses: PAVILION13_COMMERCIAL_WALL_ACCESSES,
  cells: PAVILION13_COMMERCIAL_REFERENCE_CELLS,
  source: {
    document: SOURCE_DOCUMENT,
    referenceYear: 2028,
    interpretation: 'official-metric-polygons',
    metricDimensions: {
      widthM: 19.8,
      depthM: 37.8,
    },
    geometricModuleAreaM2: PAVILION13_COMMERCIAL_GEOMETRIC_AREA_M2,
  },
} as const;
