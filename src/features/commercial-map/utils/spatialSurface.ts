import type { MapClassification, MapEntity } from '../types';

export type SpatialPoint = readonly [number, number];

export const SPATIAL_EPSILON = 1e-6;

/**
 * Classifications rendered as shallow map surfaces by the shared canvas.
 * Their visual height is clamped so spatial support layers sit on the visible
 * top face instead of inheriting an exaggerated cadastral extrusion.
 */
export const DEFAULT_FLAT_SURFACE_CLASSIFICATIONS: ReadonlySet<MapClassification> = new Set([
  'ROAD',
  'PEDESTRIAN_PATH',
  'GREEN_AREA',
  'PARKING',
  'WATER',
  'QUADRA',
]);

export interface EntitySurfaceElevationOptions {
  flatClassifications?: ReadonlySet<MapClassification>;
  flatMinimumHeight?: number;
  flatMaximumHeight?: number;
  solidMinimumHeight?: number;
  clearance?: number;
}

export function distanceToSegment(
  point: SpatialPoint,
  start: SpatialPoint,
  end: SpatialPoint,
) {
  const deltaX = end[0] - start[0];
  const deltaZ = end[1] - start[1];
  const squaredLength = deltaX ** 2 + deltaZ ** 2;
  if (squaredLength <= Number.EPSILON) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }
  const projection = Math.max(0, Math.min(1, (
    (point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaZ
  ) / squaredLength));
  return Math.hypot(
    point[0] - (start[0] + projection * deltaX),
    point[1] - (start[1] + projection * deltaZ),
  );
}

export function closestPointOnSegment(
  point: SpatialPoint,
  start: SpatialPoint,
  end: SpatialPoint,
): SpatialPoint {
  const deltaX = end[0] - start[0];
  const deltaZ = end[1] - start[1];
  const squaredLength = deltaX ** 2 + deltaZ ** 2;
  if (squaredLength <= Number.EPSILON) return [start[0], start[1]];
  const projection = Math.max(0, Math.min(1, (
    (point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaZ
  ) / squaredLength));
  return [start[0] + projection * deltaX, start[1] + projection * deltaZ];
}

export function nearestPointOnPolygonBoundary(
  point: SpatialPoint,
  polygon: readonly SpatialPoint[],
) {
  if (polygon.length === 0) return null;
  let nearest: { point: SpatialPoint; segmentIndex: number; distance: number } | null = null;
  polygon.forEach((start, segmentIndex) => {
    const end = polygon[(segmentIndex + 1) % polygon.length];
    const projected = closestPointOnSegment(point, start, end);
    const distance = Math.hypot(projected[0] - point[0], projected[1] - point[1]);
    if (!nearest || distance < nearest.distance - SPATIAL_EPSILON) {
      nearest = { point: projected, segmentIndex, distance };
    }
  });
  return nearest;
}

export function pointInPolygon(
  point: SpatialPoint,
  polygon: readonly SpatialPoint[],
  epsilon = SPATIAL_EPSILON,
) {
  const onBoundary = polygon.some((start, index) => (
    distanceToSegment(point, start, polygon[(index + 1) % polygon.length]) <= epsilon
  ));
  if (onBoundary) return true;

  let inside = false;
  polygon.forEach((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    if (
      (start[1] > point[1]) !== (end[1] > point[1])
      && point[0] < ((end[0] - start[0]) * (point[1] - start[1])) / (end[1] - start[1]) + start[0]
    ) inside = !inside;
  });
  return inside;
}

export function distanceToPolygon(point: SpatialPoint, polygon: readonly SpatialPoint[]) {
  if (polygon.length === 0) return Number.POSITIVE_INFINITY;
  if (pointInPolygon(point, polygon)) return 0;
  return Math.min(...polygon.map((start, index) => (
    distanceToSegment(point, start, polygon[(index + 1) % polygon.length])
  )));
}

export function distanceToEntity(point: SpatialPoint, entity: MapEntity) {
  return distanceToPolygon(point, entity.geometry.coordinates[0] ?? []);
}

export function entitySurfaceHeight(
  entity: MapEntity,
  options: EntitySurfaceElevationOptions = {},
) {
  const flatClassifications = options.flatClassifications ?? DEFAULT_FLAT_SURFACE_CLASSIFICATIONS;
  if (flatClassifications.has(entity.classification)) {
    return Math.max(
      options.flatMinimumHeight ?? 0.018,
      Math.min(entity.geometry.extrusionHeight, options.flatMaximumHeight ?? 0.08),
    );
  }
  return Math.max(options.solidMinimumHeight ?? 0.025, entity.geometry.extrusionHeight);
}

export function entitySurfaceElevation(
  entity: MapEntity,
  options: EntitySurfaceElevationOptions = {},
) {
  return entity.geometry.elevation
    + entitySurfaceHeight(entity, options)
    + (options.clearance ?? 0);
}
