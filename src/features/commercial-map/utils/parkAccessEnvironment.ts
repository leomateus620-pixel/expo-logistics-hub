import {
  distanceToPolygon,
  pointInPolygon,
  type SpatialPoint,
} from './spatialSurface';

export type ParkAccessEnvironmentPoint = SpatialPoint;
export type ParkAccessEnvironmentPolygon = readonly ParkAccessEnvironmentPoint[];

export interface ParkAccessEnvironmentPlacement {
  sourceZoneId: string;
  position: ParkAccessEnvironmentPoint;
  rotation: number;
  scale: readonly [number, number, number];
}

export interface PolygonPlacementOptions {
  sourceZoneId: string;
  spacing: number;
  jitter: number;
  seed: number;
  maximumCount: number;
  minimumScale: number;
  maximumScale: number;
  verticalScale?: number;
  exclusions?: readonly ParkAccessEnvironmentPolygon[];
  exclusionClearance?: number;
}

export interface PolylinePlacementOptions {
  sourceZoneId: string;
  spacing: number;
  seed: number;
  maximumCount: number;
  minimumScale: number;
  maximumScale: number;
  verticalScale?: number;
  endpointInset?: number;
  lateralOffset?: number;
  exclusions?: readonly ParkAccessEnvironmentPolygon[];
  exclusionClearance?: number;
}

export const PARK_ACCESS_ENVIRONMENT_PRIMARY_DRAW_CALL_BUDGET = 4;
export const PARK_ACCESS_ENVIRONMENT_SHADOW_DRAW_CALL_BUDGET = 0;

const EPSILON = 1e-6;

function deterministicNoise(seed: number, salt: number) {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

function normalizedDirection(
  start: ParkAccessEnvironmentPoint,
  end: ParkAccessEnvironmentPoint,
): ParkAccessEnvironmentPoint {
  const deltaX = end[0] - start[0];
  const deltaZ = end[1] - start[1];
  const length = Math.hypot(deltaX, deltaZ);
  if (length <= EPSILON) return [1, 0];
  return [deltaX / length, deltaZ / length];
}

function perpendicular(direction: ParkAccessEnvironmentPoint): ParkAccessEnvironmentPoint {
  return [-direction[1], direction[0]];
}

function placementIsClear(
  point: ParkAccessEnvironmentPoint,
  exclusions: readonly ParkAccessEnvironmentPolygon[],
  clearance: number,
) {
  return exclusions.every((polygon) => (
    polygon.length < 3
    || (!pointInPolygon(point, polygon) && distanceToPolygon(point, polygon) >= clearance)
  ));
}

/**
 * Creates a deterministic, mitered ribbon around a GIS centerline. The axis is
 * never moved: only a symmetric visual band is derived from the shared source.
 */
export function createParkAccessPolylineRibbon(
  centerline: readonly ParkAccessEnvironmentPoint[],
  width: number,
): ParkAccessEnvironmentPolygon {
  if (centerline.length < 2 || width <= 0) return [];
  const halfWidth = width / 2;
  const segmentNormals = centerline.slice(0, -1).map((point, index) => (
    perpendicular(normalizedDirection(point, centerline[index + 1]))
  ));
  const left: ParkAccessEnvironmentPoint[] = [];
  const right: ParkAccessEnvironmentPoint[] = [];

  centerline.forEach((point, index) => {
    const previous = segmentNormals[Math.max(0, index - 1)];
    const next = segmentNormals[Math.min(segmentNormals.length - 1, index)];
    let normalX = previous[0] + next[0];
    let normalZ = previous[1] + next[1];
    const normalLength = Math.hypot(normalX, normalZ);
    if (normalLength <= EPSILON) {
      normalX = next[0];
      normalZ = next[1];
    } else {
      normalX /= normalLength;
      normalZ /= normalLength;
    }
    const projectedWidth = Math.abs(normalX * next[0] + normalZ * next[1]);
    const miterLength = Math.min(halfWidth * 2, halfWidth / Math.max(0.5, projectedWidth));
    left.push([point[0] + normalX * miterLength, point[1] + normalZ * miterLength]);
    right.push([point[0] - normalX * miterLength, point[1] - normalZ * miterLength]);
  });

  return [...left, ...right.reverse()];
}

function scaleForIndex(
  index: number,
  seed: number,
  minimumScale: number,
  maximumScale: number,
  verticalScale: number,
) {
  const normalized = deterministicNoise(seed, index * 5.13 + 2.7);
  const scale = minimumScale + normalized * (maximumScale - minimumScale);
  const widthJitter = 0.88 + deterministicNoise(seed, index * 2.31 + 8.1) * 0.2;
  const depthJitter = 0.88 + deterministicNoise(seed, index * 7.17 + 4.4) * 0.2;
  return [
    scale * widthJitter,
    scale * verticalScale,
    scale * depthJitter,
  ] as const;
}

/** Hex-grid sampling keeps large vegetation bands sparse and reproducible. */
export function sampleParkAccessPolygonPlacements(
  polygon: ParkAccessEnvironmentPolygon,
  options: PolygonPlacementOptions,
): readonly ParkAccessEnvironmentPlacement[] {
  if (polygon.length < 3 || options.spacing <= 0 || options.maximumCount <= 0) return [];
  const minX = Math.min(...polygon.map(([x]) => x));
  const maxX = Math.max(...polygon.map(([x]) => x));
  const minZ = Math.min(...polygon.map(([, z]) => z));
  const maxZ = Math.max(...polygon.map(([, z]) => z));
  const rowStep = options.spacing * Math.sqrt(3) / 2;
  const exclusions = options.exclusions ?? [];
  const exclusionClearance = Math.max(0, options.exclusionClearance ?? 0);
  const placements: ParkAccessEnvironmentPlacement[] = [];
  let candidateIndex = 0;

  for (let row = 0, z = minZ + rowStep * 0.5; z <= maxZ + EPSILON; row += 1, z += rowStep) {
    const stagger = row % 2 === 0 ? 0.5 : 1;
    for (let x = minX + options.spacing * stagger; x <= maxX + EPSILON; x += options.spacing) {
      const noiseX = (deterministicNoise(options.seed, candidateIndex * 3.7 + 1.2) - 0.5) * options.jitter;
      const noiseZ = (deterministicNoise(options.seed, candidateIndex * 6.1 + 4.8) - 0.5) * options.jitter;
      const point = [x + noiseX, z + noiseZ] as const;
      candidateIndex += 1;
      if (!pointInPolygon(point, polygon)) continue;
      if (!placementIsClear(point, exclusions, exclusionClearance)) continue;
      placements.push({
        sourceZoneId: options.sourceZoneId,
        position: point,
        rotation: deterministicNoise(options.seed, candidateIndex * 9.3 + 6.2) * Math.PI * 2,
        scale: scaleForIndex(
          candidateIndex,
          options.seed,
          options.minimumScale,
          options.maximumScale,
          options.verticalScale ?? 1,
        ),
      });
      if (placements.length >= options.maximumCount) return placements;
    }
  }
  return placements;
}

/** Samples the original GIS line by accumulated distance without changing it. */
export function sampleParkAccessPolylinePlacements(
  centerline: readonly ParkAccessEnvironmentPoint[],
  options: PolylinePlacementOptions,
): readonly ParkAccessEnvironmentPlacement[] {
  if (centerline.length < 2 || options.spacing <= 0 || options.maximumCount <= 0) return [];
  const segments = centerline.slice(0, -1).map((start, index) => {
    const end = centerline[index + 1];
    return { start, end, length: Math.hypot(end[0] - start[0], end[1] - start[1]) };
  }).filter((segment) => segment.length > EPSILON);
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  const endpointInset = Math.max(0, options.endpointInset ?? options.spacing * 0.5);
  // Equality is the valid one-instance case: both insets meet at the center.
  if (totalLength + EPSILON < endpointInset * 2) return [];
  const exclusions = options.exclusions ?? [];
  const exclusionClearance = Math.max(0, options.exclusionClearance ?? 0);
  const placements: ParkAccessEnvironmentPlacement[] = [];
  let segmentIndex = 0;
  let segmentStartDistance = 0;

  for (
    let distance = endpointInset, placementIndex = 0;
    distance <= totalLength - endpointInset + EPSILON && placements.length < options.maximumCount;
    distance += options.spacing, placementIndex += 1
  ) {
    while (
      segmentIndex < segments.length - 1
      && distance > segmentStartDistance + segments[segmentIndex].length
    ) {
      segmentStartDistance += segments[segmentIndex].length;
      segmentIndex += 1;
    }
    const segment = segments[segmentIndex];
    const progress = Math.min(1, Math.max(0, (
      distance - segmentStartDistance
    ) / segment.length));
    const direction = normalizedDirection(segment.start, segment.end);
    const normal = perpendicular(direction);
    const alternatingOffset = (options.lateralOffset ?? 0) * (placementIndex % 2 === 0 ? 1 : -1);
    const point = [
      segment.start[0] + (segment.end[0] - segment.start[0]) * progress + normal[0] * alternatingOffset,
      segment.start[1] + (segment.end[1] - segment.start[1]) * progress + normal[1] * alternatingOffset,
    ] as const;
    if (!placementIsClear(point, exclusions, exclusionClearance)) continue;
    placements.push({
      sourceZoneId: options.sourceZoneId,
      position: point,
      rotation: Math.atan2(direction[0], direction[1])
        + (deterministicNoise(options.seed, placementIndex * 4.7 + 1.9) - 0.5) * 0.22,
      scale: scaleForIndex(
        placementIndex,
        options.seed,
        options.minimumScale,
        options.maximumScale,
        options.verticalScale ?? 1,
      ),
    });
  }
  return placements;
}

export function parkAccessEnvironmentBudget(input: {
  environmentalSurfaceCount: number;
  trailSurfaceCount: number;
  ambientTreeCount: number;
  understoryCount: number;
}) {
  const environmentalSurfaceDrawCalls = input.environmentalSurfaceCount > 0 ? 1 : 0;
  const trailSurfaceDrawCalls = input.trailSurfaceCount > 0 ? 1 : 0;
  const ambientTreeDrawCalls = input.ambientTreeCount > 0 ? 1 : 0;
  const understoryDrawCalls = input.understoryCount > 0 ? 1 : 0;
  const primaryDrawCalls = environmentalSurfaceDrawCalls
    + trailSurfaceDrawCalls
    + ambientTreeDrawCalls
    + understoryDrawCalls;
  return {
    primaryDrawCalls,
    shadowDrawCalls: PARK_ACCESS_ENVIRONMENT_SHADOW_DRAW_CALL_BUDGET,
    maximumPassDrawCalls: primaryDrawCalls,
    environmentalSurfaceDrawCalls,
    trailSurfaceDrawCalls,
    ambientTreeDrawCalls,
    understoryDrawCalls,
    ambientTreeInstances: Math.max(0, Math.floor(input.ambientTreeCount)),
    understoryInstances: Math.max(0, Math.floor(input.understoryCount)),
    withinBudget: primaryDrawCalls <= PARK_ACCESS_ENVIRONMENT_PRIMARY_DRAW_CALL_BUDGET,
  };
}
