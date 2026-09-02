import {
  MAP_REFERENCE_HEIGHT,
  MAP_REFERENCE_WIDTH,
  OPEN_GROUND_PRESENTATION_HEIGHT,
} from '../../constants';

/**
 * Shared exterior-highway contract — Fenasoja Mapa Comercial 2026.10.
 *
 * Integrator (this module) owns world bounds, materials, mesh language and the
 * BR-472 mainline. Agents #2–#4 add sibling `*Layer.ts` files that export
 * `REGIONAL_HIGHWAY_LAYER`; the collector batches them into one renderer.
 *
 * Coordinate frame (same as `officialPdfPointToLocal`):
 *   +X = east, +Z = south, −Z = north, Y = up.
 *   Park crop is 120 × 90.545455, centered at the origin.
 *
 * Interior A5 / Portão 5 trevo, rearParkRoadNetwork, annexSpatialCorrections,
 * Ubiretama and Rua Brasília are NOT restitched here. The exterior mainline
 * lives east of the official crop and only visually aims at that existing
 * access.
 */
export const REGIONAL_HIGHWAY_REVISION = '2026.10-regional-highways.1';

export type RegionalHighwayId = 'BR-472' | 'BR-344';
export type RegionalHighwayAgent = 'integrator' | 'br344' | 'ne-cloverleaf' | 'se-cloverleaf';
export type RegionalHighwaySegmentKind = 'mainline' | 'ramp' | 'loop' | 'connector' | 'stub';
export type LocalPoint = readonly [number, number];

export interface RegionalHighwaySegment {
  id: string;
  highwayId: RegionalHighwayId;
  kind: RegionalHighwaySegmentKind;
  /** World XZ centerline, east/south in local crop units. */
  centerline: readonly LocalPoint[];
  /** Overrides {@link REGIONAL_HIGHWAY_PROFILE.carriagewayWidth}. */
  carriagewayWidth?: number;
  /** Overrides {@link REGIONAL_HIGHWAY_PROFILE.shoulderWidth}. */
  shoulderWidth?: number;
  drawCarriageway?: boolean;
  drawShoulders?: boolean;
  drawEdgeLines?: boolean;
}

export interface RegionalHighwayLabel {
  id: string;
  text: string;
  position: LocalPoint;
  /** Radians in XZ, 0 = +Z (south), matching atan2(dx, dz). */
  headingRadians: number;
}

export interface RegionalHighwayLayer {
  id: string;
  agent: RegionalHighwayAgent;
  segments: readonly RegionalHighwaySegment[];
  labels?: readonly RegionalHighwayLabel[];
}

export interface RegionalHighwayLayerModule {
  REGIONAL_HIGHWAY_LAYER?: RegionalHighwayLayer;
}

export interface RegionalHighwayFramingBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
  maxHeight: number;
  diagonal: number;
}

export const PARK_LOCAL_BOUNDS = Object.freeze({
  minX: -MAP_REFERENCE_WIDTH / 2,
  maxX: MAP_REFERENCE_WIDTH / 2,
  minZ: -MAP_REFERENCE_HEIGHT / 2,
  maxZ: MAP_REFERENCE_HEIGHT / 2,
  width: MAP_REFERENCE_WIDTH,
  depth: MAP_REFERENCE_HEIGHT,
  centerX: 0,
  centerZ: 0,
});

/**
 * Target Image 2: BR-472 sits ~0.5 hub widths east of the park east edge,
 * with a slight westward diagonal as it runs south.
 */
export const BR472_EAST_GAP_IN_HUB_WIDTHS = 0.5;
export const BR472_DIAGONAL_RADIANS = (-3.5 * Math.PI) / 180;
export const BR472_DIAGONAL_DX_PER_DZ = Math.tan(BR472_DIAGONAL_RADIANS);

/** BR-344 (Agent #2) lives ~1.5 hub depths north of the park north edge. */
export const BR344_NORTH_GAP_IN_HUB_DEPTHS = 1.5;

export const REGIONAL_HIGHWAY_PALETTE = Object.freeze({
  carriageway: '#2f9e44',
  carriagewayGrain: '#278a3b',
  shoulder: '#d4b896',
  shoulderGrain: '#c4a57e',
  edgeLine: '#f5d031',
  labelFill: '#f7f7f4',
  labelStroke: '#d8d8d2',
  labelText: '#161616',
});

export const REGIONAL_HIGHWAY_PROFILE = Object.freeze({
  carriagewayWidth: 6.4,
  shoulderWidth: 1.55,
  edgeLineWidth: 0.14,
  connectorWidth: 2.8,
  connectorShoulderWidth: 0.7,
  elevation: OPEN_GROUND_PRESENTATION_HEIGHT + 0.006,
  shoulderElevation: OPEN_GROUND_PRESENTATION_HEIGHT + 0.001,
  edgeLineElevation: OPEN_GROUND_PRESENTATION_HEIGHT + 0.01,
  labelElevation: OPEN_GROUND_PRESENTATION_HEIGHT + 0.05,
  labelWidth: 7.6,
  labelDepth: 2.05,
  /** Keep exterior ribbons east of the inherited A5 trevo. */
  interiorClearanceX: 61.7,
});

export function br472MainlineXAt(z: number) {
  return PARK_LOCAL_BOUNDS.maxX
    + PARK_LOCAL_BOUNDS.width * BR472_EAST_GAP_IN_HUB_WIDTHS
    + z * BR472_DIAGONAL_DX_PER_DZ;
}

export function br344ReservedZ() {
  return PARK_LOCAL_BOUNDS.minZ - PARK_LOCAL_BOUNDS.depth * BR344_NORTH_GAP_IN_HUB_DEPTHS;
}

export const BR344_RESERVED_ALIGNMENT = Object.freeze({
  highwayId: 'BR-344' as const,
  z: br344ReservedZ(),
  westX: PARK_LOCAL_BOUNDS.minX - PARK_LOCAL_BOUNDS.width * 0.35,
  eastX: br472MainlineXAt(br344ReservedZ()) + 38,
  headingRadians: Math.PI / 2,
  notes: 'Agent #2 owns the BR-344 mesh. Keep this E–W latitude so the NE cloverleaf (Agent #3) meets BR-472.',
});

export const INTERCHANGE_ENVELOPES = Object.freeze({
  neCloverleaf: Object.freeze({
    id: 'ne-br344-br472' as const,
    agent: 'ne-cloverleaf' as const,
    center: Object.freeze([
      br472MainlineXAt(br344ReservedZ()),
      br344ReservedZ(),
    ] as const),
    radius: 32,
    notes: 'Agent #3: full cloverleaf. Mainlines continue through; add loops in isolated files.',
  }),
  seCloverleaf: Object.freeze({
    id: 'se-br472' as const,
    agent: 'se-cloverleaf' as const,
    center: Object.freeze([
      br472MainlineXAt(PARK_LOCAL_BOUNDS.maxZ + PARK_LOCAL_BOUNDS.depth * 0.58),
      PARK_LOCAL_BOUNDS.maxZ + PARK_LOCAL_BOUNDS.depth * 0.58,
    ] as const),
    radius: 36,
    notes: 'Agent #4: SE cloverleaf where BR-472 continues south and turns west. Integrator already draws the through arms.',
  }),
});

export const REGIONAL_HIGHWAY_WORLD_BOUNDS = Object.freeze({
  minX: -96,
  maxX: br472MainlineXAt(br344ReservedZ()) + 42,
  minZ: br344ReservedZ() - 48,
  maxZ: INTERCHANGE_ENVELOPES.seCloverleaf.center[1] + 78,
  maxHeight: 1.2,
});

export function regionalHighwayHeading(dx: number, dz: number) {
  return Math.atan2(dx, dz);
}

export function pointInDisk(
  point: LocalPoint,
  center: readonly [number, number],
  radius: number,
) {
  return Math.hypot(point[0] - center[0], point[1] - center[1]) <= radius;
}

export function pointInInterchangeEnvelope(
  point: LocalPoint,
  envelope: keyof typeof INTERCHANGE_ENVELOPES,
) {
  const { center, radius } = INTERCHANGE_ENVELOPES[envelope];
  return pointInDisk(point, center, radius);
}

export function polylineLength(points: readonly LocalPoint[]) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(
      points[index][0] - points[index - 1][0],
      points[index][1] - points[index - 1][1],
    );
  }
  return length;
}

export function pointAlongPolyline(points: readonly LocalPoint[], distance: number): LocalPoint {
  if (points.length === 0) return [0, 0];
  if (points.length === 1 || distance <= 0) return points[0];
  let remaining = distance;
  for (let index = 1; index < points.length; index += 1) {
    const span = Math.hypot(
      points[index][0] - points[index - 1][0],
      points[index][1] - points[index - 1][1],
    );
    if (span >= remaining) {
      const t = span === 0 ? 0 : remaining / span;
      return [
        points[index - 1][0] + (points[index][0] - points[index - 1][0]) * t,
        points[index - 1][1] + (points[index][1] - points[index - 1][1]) * t,
      ];
    }
    remaining -= span;
  }
  return points[points.length - 1];
}

export function headingAlongPolyline(points: readonly LocalPoint[], distance: number) {
  if (points.length < 2) return 0;
  let remaining = Math.max(0, distance);
  for (let index = 1; index < points.length; index += 1) {
    const dx = points[index][0] - points[index - 1][0];
    const dz = points[index][1] - points[index - 1][1];
    const span = Math.hypot(dx, dz);
    if (span >= remaining || index === points.length - 1) {
      return regionalHighwayHeading(dx, dz);
    }
    remaining -= span;
  }
  return 0;
}

export function distanceToPolyline(point: LocalPoint, path: readonly LocalPoint[]) {
  if (path.length === 0) return Number.POSITIVE_INFINITY;
  if (path.length === 1) return Math.hypot(point[0] - path[0][0], point[1] - path[0][1]);
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < path.length - 1; index += 1) {
    const [ax, az] = path[index];
    const [bx, bz] = path[index + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((point[0] - ax) * dx + (point[1] - az) * dz) / lengthSquared));
    best = Math.min(best, Math.hypot(point[0] - (ax + dx * t), point[1] - (az + dz * t)));
  }
  return best;
}

export function expandFramingBoundsWithRegionalHighways(
  park: Pick<RegionalHighwayFramingBounds, 'minX' | 'maxX' | 'minZ' | 'maxZ' | 'maxHeight'>,
): RegionalHighwayFramingBounds {
  const minX = Math.min(park.minX, REGIONAL_HIGHWAY_WORLD_BOUNDS.minX);
  const maxX = Math.max(park.maxX, REGIONAL_HIGHWAY_WORLD_BOUNDS.maxX);
  const minZ = Math.min(park.minZ, REGIONAL_HIGHWAY_WORLD_BOUNDS.minZ);
  const maxZ = Math.max(park.maxZ, REGIONAL_HIGHWAY_WORLD_BOUNDS.maxZ);
  const width = Math.max(4, maxX - minX);
  const depth = Math.max(4, maxZ - minZ);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width,
    depth,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    maxHeight: Math.max(park.maxHeight, REGIONAL_HIGHWAY_WORLD_BOUNDS.maxHeight),
    diagonal: Math.hypot(width, depth),
  };
}

export const REGIONAL_HIGHWAY_SCENE_SUPPORT_POINTS = Object.freeze([
  Object.freeze({
    position: Object.freeze([
      REGIONAL_HIGHWAY_WORLD_BOUNDS.minX,
      REGIONAL_HIGHWAY_WORLD_BOUNDS.minZ,
    ] as const),
    height: REGIONAL_HIGHWAY_WORLD_BOUNDS.maxHeight,
  }),
  Object.freeze({
    position: Object.freeze([
      REGIONAL_HIGHWAY_WORLD_BOUNDS.maxX,
      REGIONAL_HIGHWAY_WORLD_BOUNDS.minZ,
    ] as const),
    height: REGIONAL_HIGHWAY_WORLD_BOUNDS.maxHeight,
  }),
  Object.freeze({
    position: Object.freeze([
      REGIONAL_HIGHWAY_WORLD_BOUNDS.maxX,
      REGIONAL_HIGHWAY_WORLD_BOUNDS.maxZ,
    ] as const),
    height: REGIONAL_HIGHWAY_WORLD_BOUNDS.maxHeight,
  }),
  Object.freeze({
    position: Object.freeze([
      REGIONAL_HIGHWAY_WORLD_BOUNDS.minX,
      REGIONAL_HIGHWAY_WORLD_BOUNDS.maxZ,
    ] as const),
    height: REGIONAL_HIGHWAY_WORLD_BOUNDS.maxHeight,
  }),
]);
