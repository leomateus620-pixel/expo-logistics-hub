export type CommercialPavilionReferenceModuleOrientation =
  | 'east-west'
  | 'north-south';

export type CommercialPavilionReferenceSequenceOrientation =
  | 'x-increasing'
  | 'x-decreasing'
  | 'z-increasing'
  | 'z-decreasing';

export type CommercialPavilionReferenceCoordinateTransform =
  | 'identity'
  | 'quarter-turn-clockwise';

export type CommercialPavilionReferenceProjectionFit =
  | 'stretch'
  | 'metric-contain';

export interface CommercialPavilionReferenceProjection {
  coordinateTransform: CommercialPavilionReferenceCoordinateTransform;
  fit: CommercialPavilionReferenceProjectionFit;
  metricWidthM?: number;
  metricDepthM?: number;
  /** Places a contained official plan inside the available pavilion frame. */
  alignX?: 'start' | 'center' | 'end';
  /** `end` anchors the source plan to the public +Z facade/entrances. */
  alignZ?: 'start' | 'center' | 'end';
}

export interface CommercialPavilionReferenceProjectionFrame {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  coordinateTransform: CommercialPavilionReferenceCoordinateTransform;
}

export const DEFAULT_COMMERCIAL_PAVILION_REFERENCE_PROJECTION = {
  coordinateTransform: 'identity',
  fit: 'stretch',
} as const satisfies CommercialPavilionReferenceProjection;

export type CommercialPavilionReferenceSourceDiscrepancy =
  | 'official-range-omission'
  | 'manual-confirmation-required'
  | null;

export interface CommercialPavilionReferenceRect {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
}

export type CommercialPavilionReferencePoint = readonly [x: number, z: number];

export interface CommercialPavilionReferenceCellShape {
  /** Closed or open pavilion-local polygon used by the persisted geometry. */
  footprint: readonly CommercialPavilionReferencePoint[];
  /** Non-overlapping rectangles used by the lightweight instanced renderer. */
  renderParts: readonly CommercialPavilionReferenceRect[];
  labelAnchor?: CommercialPavilionReferencePoint;
}

function assertProjectionDimensions(
  projection: CommercialPavilionReferenceProjection,
): asserts projection is CommercialPavilionReferenceProjection & {
  metricWidthM: number;
  metricDepthM: number;
} {
  if (
    projection.fit !== 'metric-contain'
    || !Number.isFinite(projection.metricWidthM)
    || !Number.isFinite(projection.metricDepthM)
    || (projection.metricWidthM ?? 0) <= 0
    || (projection.metricDepthM ?? 0) <= 0
  ) {
    throw new Error('A projecao metric-contain exige largura e profundidade metricas validas.');
  }
}

export function transformCommercialPavilionReferencePoint(
  point: CommercialPavilionReferencePoint,
  transform: CommercialPavilionReferenceCoordinateTransform,
): CommercialPavilionReferencePoint {
  if (transform === 'quarter-turn-clockwise') {
    return [1 - point[1], point[0]];
  }
  return point;
}

export function transformCommercialPavilionReferenceRect(
  rect: CommercialPavilionReferenceRect,
  transform: CommercialPavilionReferenceCoordinateTransform,
): CommercialPavilionReferenceRect {
  if (transform === 'quarter-turn-clockwise') {
    return {
      centerX: 1 - rect.centerZ,
      centerZ: rect.centerX,
      width: rect.depth,
      depth: rect.width,
    };
  }
  return rect;
}

export function transformCommercialPavilionReferenceSequenceOrientation(
  orientation: CommercialPavilionReferenceSequenceOrientation,
  transform: CommercialPavilionReferenceCoordinateTransform,
): CommercialPavilionReferenceSequenceOrientation {
  if (transform !== 'quarter-turn-clockwise') return orientation;
  const transformed = {
    'x-increasing': 'z-increasing',
    'x-decreasing': 'z-decreasing',
    'z-increasing': 'x-decreasing',
    'z-decreasing': 'x-increasing',
  } as const satisfies Record<
    CommercialPavilionReferenceSequenceOrientation,
    CommercialPavilionReferenceSequenceOrientation
  >;
  return transformed[orientation];
}

export function transformCommercialPavilionReferenceShape(
  shape: CommercialPavilionReferenceCellShape,
  transform: CommercialPavilionReferenceCoordinateTransform,
): CommercialPavilionReferenceCellShape {
  if (transform === 'identity') return shape;
  return {
    footprint: shape.footprint.map((point) => (
      transformCommercialPavilionReferencePoint(point, transform)
    )),
    renderParts: shape.renderParts.map((part) => (
      transformCommercialPavilionReferenceRect(part, transform)
    )),
    ...(shape.labelAnchor ? {
      labelAnchor: transformCommercialPavilionReferencePoint(shape.labelAnchor, transform),
    } : {}),
  };
}

export function createCommercialPavilionReferenceProjectionFrame(
  projection: CommercialPavilionReferenceProjection,
  available: {
    centerX?: number;
    centerZ?: number;
    width: number;
    depth: number;
  },
): CommercialPavilionReferenceProjectionFrame {
  if (
    !Number.isFinite(available.width)
    || !Number.isFinite(available.depth)
    || available.width <= 0
    || available.depth <= 0
  ) {
    throw new Error('A area disponivel da projecao do pavilhao e invalida.');
  }

  let width = available.width;
  let depth = available.depth;
  if (projection.fit === 'metric-contain') {
    assertProjectionDimensions(projection);
    const rotated = projection.coordinateTransform === 'quarter-turn-clockwise';
    const orientedMetricWidth = rotated
      ? projection.metricDepthM
      : projection.metricWidthM;
    const orientedMetricDepth = rotated
      ? projection.metricWidthM
      : projection.metricDepthM;
    const scale = Math.min(
      available.width / orientedMetricWidth,
      available.depth / orientedMetricDepth,
    );
    width = orientedMetricWidth * scale;
    depth = orientedMetricDepth * scale;
  }

  const availableCenterX = available.centerX ?? 0;
  const availableCenterZ = available.centerZ ?? 0;
  const horizontalSlack = available.width - width;
  const depthSlack = available.depth - depth;
  const alignmentOffset = (
    alignment: 'start' | 'center' | 'end' | undefined,
    slack: number,
  ) => alignment === 'start' ? -slack / 2 : alignment === 'end' ? slack / 2 : 0;

  return {
    centerX: availableCenterX + alignmentOffset(projection.alignX, horizontalSlack),
    centerZ: availableCenterZ + alignmentOffset(projection.alignZ, depthSlack),
    width,
    depth,
    coordinateTransform: projection.coordinateTransform,
  };
}

export function projectCommercialPavilionReferencePoint(
  point: CommercialPavilionReferencePoint,
  frame: CommercialPavilionReferenceProjectionFrame,
): CommercialPavilionReferencePoint {
  const [normalizedX, normalizedZ] = transformCommercialPavilionReferencePoint(
    point,
    frame.coordinateTransform,
  );
  return [
    frame.centerX + (normalizedX - 0.5) * frame.width,
    frame.centerZ + (normalizedZ - 0.5) * frame.depth,
  ];
}

export function projectCommercialPavilionReferenceRect(
  rect: CommercialPavilionReferenceRect,
  frame: CommercialPavilionReferenceProjectionFrame,
): CommercialPavilionReferenceRect {
  const transformed = transformCommercialPavilionReferenceRect(
    rect,
    frame.coordinateTransform,
  );
  return {
    centerX: frame.centerX + (transformed.centerX - 0.5) * frame.width,
    centerZ: frame.centerZ + (transformed.centerZ - 0.5) * frame.depth,
    width: transformed.width * frame.width,
    depth: transformed.depth * frame.depth,
  };
}

export interface CommercialPavilionReferenceCluster {
  id: string;
  numberRanges: readonly (readonly [start: number, end: number])[];
}

export interface CommercialPavilionReferenceRun {
  id: string;
  label: string;
  role: 'perimeter' | 'island' | 'gallery' | 'market-run';
  bounds: CommercialPavilionReferenceRect;
  numberRange: readonly [start: number, end: number];
  orientation: CommercialPavilionReferenceModuleOrientation;
  sequenceOrientation: CommercialPavilionReferenceSequenceOrientation;
  group: string;
  cluster: string;
  clusters?: readonly CommercialPavilionReferenceCluster[];
}

export interface CommercialPavilionReferenceCorridor
  extends CommercialPavilionReferenceRect {
  id: string;
  kind: 'main' | 'cross' | 'perimeter' | 'atrium' | 'access';
  label: string;
}

export interface CommercialPavilionReferenceSupportSpace
  extends CommercialPavilionReferenceRect {
  id: string;
  label: string;
  kind: 'storage' | 'accommodation' | 'service' | 'kitchen' | 'sanitary';
  type: 'permanent-non-commercial';
  sourcePrecision?: 'official-metric' | 'plan-traced';
}

export type CommercialPavilionReferenceSourcePrecision =
  | 'official-metric'
  | 'plan-traced';

export type CommercialPavilionReferenceWallEdge =
  | 'front'
  | 'rear'
  | 'left'
  | 'right';

/**
 * An opening dimensioned directly on the official plan. `centerAlongWallM`
 * follows the source-plan axis: X on front/rear walls and Z on side walls.
 */
export interface CommercialPavilionReferenceMetricWallAccess {
  id: string;
  label: string;
  wall: CommercialPavilionReferenceWallEdge;
  centerAlongWallM: number;
  openingWidthM: number;
  openingHeightM?: number;
  kind?: 'entrance' | 'exit' | 'gate' | 'emergency' | 'service';
  sourcePrecision: CommercialPavilionReferenceSourcePrecision;
  connectsTo?: string;
}

/**
 * An opening whose position and span are already represented by a corridor.
 * Edges refer to the final projected pavilion frame.
 */
export interface CommercialPavilionReferenceCorridorWallAccess {
  id: string;
  label?: string;
  corridorId: string;
  edges: readonly CommercialPavilionReferenceWallEdge[];
  kind?: 'entrance' | 'exit' | 'gate' | 'emergency' | 'service';
  sourcePrecision: CommercialPavilionReferenceSourcePrecision;
  connectsTo?: string;
}

export type CommercialPavilionReferenceWallAccess =
  | CommercialPavilionReferenceMetricWallAccess
  | CommercialPavilionReferenceCorridorWallAccess;

export function transformCommercialPavilionReferenceWallEdge(
  edge: CommercialPavilionReferenceWallEdge,
  transform: CommercialPavilionReferenceCoordinateTransform,
): CommercialPavilionReferenceWallEdge {
  if (transform !== 'quarter-turn-clockwise') return edge;
  return ({
    front: 'left',
    rear: 'right',
    left: 'rear',
    right: 'front',
  } as const)[edge];
}

export interface CommercialPavilionModuleSource {
  document: string;
  referenceYear: number;
  discrepancy: CommercialPavilionReferenceSourceDiscrepancy;
}

export interface CommercialPavilionReferenceCell<PavilionId extends string = string>
  extends CommercialPavilionReferenceRect {
  id: string;
  number: number;
  label: string;
  zoneId: string;
  pavilionId: PavilionId;
  lotNumber: string;
  orientation: CommercialPavilionReferenceModuleOrientation;
  sequenceOrientation: CommercialPavilionReferenceSequenceOrientation;
  labelAnchor: readonly [x: number, z: number];
  type: 'commercial-lot';
  areaM2: null;
  sortOrder: number;
  group: string;
  cluster: string;
  shape?: CommercialPavilionReferenceCellShape;
  source: CommercialPavilionModuleSource;
}

export interface BuildCommercialPavilionReferenceCellsInput<
  PavilionId extends string,
> {
  pavilionId: PavilionId;
  runs: readonly CommercialPavilionReferenceRun[];
  moduleGap: number;
  sourceDocument: string;
  referenceYear: number;
  discrepancyForNumber?: (
    moduleNumber: number,
  ) => CommercialPavilionReferenceSourceDiscrepancy;
  shapeForNumber?: (
    moduleNumber: number,
  ) => CommercialPavilionReferenceCellShape | null;
}

export interface CommercialPavilionMetricProjector {
  readonly widthMeters: number;
  readonly depthMeters: number;
  readonly inset: number;
  point(xMeters: number, zMeters: number): CommercialPavilionReferencePoint;
  rect(
    leftMeters: number,
    topMeters: number,
    widthMeters: number,
    depthMeters: number,
  ): CommercialPavilionReferenceRect;
  polygon(
    points: readonly CommercialPavilionReferencePoint[],
  ): readonly CommercialPavilionReferencePoint[];
}

export function commercialPavilionReferenceRect(
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
): CommercialPavilionReferenceRect {
  return { centerX, centerZ, width, depth };
}

/**
 * Projects measurements from an official metric plan into the normalized
 * pavilion footprint. One deterministic transform keeps every repeated
 * 1 m / 3 m division aligned without accumulating per-cell rounding drift.
 */
export function createCommercialPavilionMetricProjector(
  widthMeters: number,
  depthMeters: number,
  inset = 0.02,
): CommercialPavilionMetricProjector {
  if (widthMeters <= 0 || depthMeters <= 0 || inset < 0 || inset >= 0.5) {
    throw new Error('Dimensoes metricas invalidas para a referencia do pavilhao.');
  }
  const usable = 1 - inset * 2;
  const point = (xMeters: number, zMeters: number) => [
    inset + (xMeters / widthMeters) * usable,
    inset + (zMeters / depthMeters) * usable,
  ] as const;

  return {
    widthMeters,
    depthMeters,
    inset,
    point,
    rect: (leftMeters, topMeters, rectWidthMeters, rectDepthMeters) => {
      const [left, top] = point(leftMeters, topMeters);
      const [right, bottom] = point(
        leftMeters + rectWidthMeters,
        topMeters + rectDepthMeters,
      );
      return commercialPavilionReferenceRect(
        (left + right) / 2,
        (top + bottom) / 2,
        right - left,
        bottom - top,
      );
    },
    polygon: (points) => points.map(([x, z]) => point(x, z)),
  };
}

export function formatCommercialPavilionModuleNumber(number: number): string {
  return String(number).padStart(2, '0');
}

function clusterForNumber(
  run: CommercialPavilionReferenceRun,
  number: number,
): string {
  const matchingCluster = run.clusters?.find((cluster) => (
    cluster.numberRanges.some(([start, end]) => number >= start && number <= end)
  ));
  return matchingCluster?.id ?? run.cluster;
}

function expandRun<PavilionId extends string>(
  run: CommercialPavilionReferenceRun,
  input: BuildCommercialPavilionReferenceCellsInput<PavilionId>,
): CommercialPavilionReferenceCell<PavilionId>[] {
  const [start, end] = run.numberRange;
  const moduleCount = end - start + 1;
  const horizontalSequence = run.sequenceOrientation === 'x-increasing'
    || run.sequenceOrientation === 'x-decreasing';
  const decreasingSequence = run.sequenceOrientation === 'x-decreasing'
    || run.sequenceOrientation === 'z-decreasing';
  const sequenceLength = horizontalSequence ? run.bounds.width : run.bounds.depth;
  const cellLength = (
    sequenceLength - input.moduleGap * (moduleCount - 1)
  ) / moduleCount;
  const left = run.bounds.centerX - run.bounds.width / 2;
  const top = run.bounds.centerZ - run.bounds.depth / 2;

  if (moduleCount <= 0 || cellLength <= 0) {
    throw new Error(`${input.pavilionId}: sequencia ${run.id} possui geometria invalida.`);
  }

  return Array.from({ length: moduleCount }, (_, index) => {
    const number = start + index;
    const spatialIndex = decreasingSequence ? moduleCount - index - 1 : index;
    const centerX = horizontalSequence
      ? left + spatialIndex * (cellLength + input.moduleGap) + cellLength / 2
      : run.bounds.centerX;
    const centerZ = horizontalSequence
      ? run.bounds.centerZ
      : top + spatialIndex * (cellLength + input.moduleGap) + cellLength / 2;
    const label = formatCommercialPavilionModuleNumber(number);
    const shape = input.shapeForNumber?.(number) ?? null;
    const labelAnchor = shape?.labelAnchor ?? [centerX, centerZ] as const;

    return {
      id: `${input.pavilionId}:module:${String(number).padStart(3, '0')}`,
      number,
      label,
      zoneId: run.id,
      centerX,
      centerZ,
      width: horizontalSequence ? cellLength : run.bounds.width,
      depth: horizontalSequence ? run.bounds.depth : cellLength,
      pavilionId: input.pavilionId,
      lotNumber: label,
      orientation: run.orientation,
      sequenceOrientation: run.sequenceOrientation,
      labelAnchor,
      type: 'commercial-lot',
      areaM2: null,
      sortOrder: number,
      group: run.group,
      cluster: clusterForNumber(run, number),
      ...(shape ? { shape } : {}),
      source: {
        document: input.sourceDocument,
        referenceYear: input.referenceYear,
        discrepancy: input.discrepancyForNumber?.(number) ?? null,
      },
    };
  });
}

export function buildCommercialPavilionReferenceCells<PavilionId extends string>(
  input: BuildCommercialPavilionReferenceCellsInput<PavilionId>,
): CommercialPavilionReferenceCell<PavilionId>[] {
  const cells = input.runs.flatMap((run) => expandRun(run, input));
  const numbers = cells.map((cell) => cell.number);
  if (new Set(numbers).size !== numbers.length) {
    throw new Error(`${input.pavilionId}: a referencia possui numeros de modulo duplicados.`);
  }
  return cells;
}
