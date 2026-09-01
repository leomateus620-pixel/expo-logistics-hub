import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import {
  PARK_ACCESS_ROAD_CURB_WIDTH_METERS,
  parkAccessMetersToLocal,
} from '../data/parkAccessSpatialPlan';
import {
  buildParkAccessArchitectureModel,
  type CosteirosBuildingPlacement,
  type ParkAccessArchitectureModel,
  type ParkAccessGatePlacement,
  type ParkAccessPoint,
} from './parkAccessArchitecture';
import {
  nearestPointOnPolygonBoundary,
  pointInPolygon,
} from './spatialSurface';

export type ParkAccessRoadMaterial = 'asphalt' | 'cobblestone' | 'gravel';
export type ParkAccessMarkingColor = 'white' | 'yellow';

export interface ParkAccessFlatSupportSurface {
  id: string;
  polygon: readonly ParkAccessPoint[];
  /** Top face rendered by the canonical flat-surface renderer. */
  topElevation: number;
}

export interface ParkAccessSurfaceVisual {
  id: string;
  polygon: readonly ParkAccessPoint[];
  centerline?: readonly ParkAccessPoint[];
  width?: number;
  elevation?: number;
  material?: ParkAccessRoadMaterial;
  supportAware?: boolean;
}

export interface ParkAccessMarkingVisual {
  id: string;
  from: ParkAccessPoint;
  to: ParkAccessPoint;
  width: number;
  style: string;
  color?: ParkAccessMarkingColor;
  /** Local-map dash and gap lengths. Null/undefined uses the renderer profile. */
  dashPattern?: readonly [number, number] | null;
  elevation?: number;
}

export interface ParkAccessParkingBayVisual {
  id: string;
  center: ParkAccessPoint;
  size: readonly [number, number];
  rotationRadians: number;
  elevation?: number;
}

export interface ParkAccessCurbVisual {
  id: string;
  from: ParkAccessPoint;
  to: ParkAccessPoint;
  elevation: number;
}

export interface ParkAccessRoundaboutVisual {
  center: ParkAccessPoint;
  outerRadius: number;
  islandRadius: number;
  curbWidth: number;
  elevation?: number;
  splitterIslands?: readonly (readonly ParkAccessPoint[])[];
}

export interface ParkAccessInfrastructureInput {
  roadSurfaces: readonly ParkAccessSurfaceVisual[];
  supportSurfaces: readonly ParkAccessFlatSupportSurface[];
  sidewalkSurfaces: readonly ParkAccessSurfaceVisual[];
  curbSegments?: readonly ParkAccessCurbVisual[];
  parkingBays: readonly ParkAccessParkingBayVisual[];
  markingSegments: readonly ParkAccessMarkingVisual[];
  roundabouts: readonly ParkAccessRoundaboutVisual[];
  gates: readonly ParkAccessGatePlacement[];
  costeiros: CosteirosBuildingPlacement | null;
}

export interface ParkAccessGeometrySet {
  asphalt: THREE.BufferGeometry | null;
  cobblestone: THREE.BufferGeometry | null;
  gravel: THREE.BufferGeometry | null;
  sidewalks: THREE.BufferGeometry | null;
  curbs: THREE.BufferGeometry | null;
  whiteMarkings: THREE.BufferGeometry | null;
  yellowMarkings: THREE.BufferGeometry | null;
  landscape: THREE.BufferGeometry | null;
  roundaboutCurb: THREE.BufferGeometry | null;
}

export interface ParkAccessRenderModel {
  geometries: ParkAccessGeometrySet;
  architecture: ParkAccessArchitectureModel;
  diagnostics: {
    roadSurfaceCount: number;
    sidewalkSurfaceCount: number;
    curbSegmentCount: number;
    parkingBayCount: number;
    markingSegmentCount: number;
    roundaboutCount: number;
    surfaceTriangleCount: number;
    instancedTriangleCount: number;
    estimatedPrimaryDrawCalls: number;
    estimatedShadowDrawCalls: number;
    withinBudget: boolean;
  };
}

export const PARK_ACCESS_INFRASTRUCTURE_REVISION = '2026.9-park-access-infrastructure.r4';

export const PARK_ACCESS_INFRASTRUCTURE_PROFILE = {
  asphaltElevation: 0.044,
  cobblestoneElevation: 0.039,
  gravelElevation: 0.041,
  sidewalkElevation: 0.072,
  markingElevation: 0.082,
  parkingMarkingWidth: 0.032,
  curbWidth: parkAccessMetersToLocal(PARK_ACCESS_ROAD_CURB_WIDTH_METERS),
  curbRise: 0.043,
  dashLength: 0.44,
  dashGap: 0.3,
  minimumSegmentLength: 0.012,
  detailedCircleSegments: 48,
  reducedCircleSegments: 30,
  supportClearance: 0.009,
  detailedRibbonSampleSpacing: 0.42,
  reducedRibbonSampleSpacing: 0.62,
  maximumRibbonTransitionSlope: 0.04,
  minimumRibbonSkirtDepth: 0.006,
  defaultRibbonSkirtDepth: 0.018,
} as const;

export const PARK_ACCESS_RENDER_BUDGET = {
  maximumPrimaryDrawCalls: 12,
  maximumShadowDrawCalls: 3,
  maximumRenderedTriangles: 6_000,
} as const;

const EPSILON = 1e-6;

function openPolygon(points: readonly ParkAccessPoint[]) {
  if (points.length < 2) return [...points];
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= EPSILON) return points.slice(0, -1);
  return [...points];
}

function createHorizontalPolygonGeometry(points: readonly ParkAccessPoint[], elevation: number) {
  const ring = openPolygon(points);
  if (ring.length < 3) return null;
  const shape = new THREE.Shape();
  ring.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, elevation, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

interface RibbonStation {
  point: ParkAccessPoint;
  distance: number;
  normal: ParkAccessPoint;
  left: ParkAccessPoint;
  right: ParkAccessPoint;
  requiredElevation: number;
  elevation: number;
  supportTop: number | null;
}

function densifyCenterline(
  centerline: readonly ParkAccessPoint[],
  maximumSpacing: number,
) {
  if (centerline.length < 2) return [];
  const result: Array<{ point: ParkAccessPoint; distance: number }> = [{
    point: centerline[0],
    distance: 0,
  }];
  let accumulatedDistance = 0;
  centerline.slice(0, -1).forEach((from, index) => {
    const to = centerline[index + 1];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (length <= EPSILON) return;
    const subdivisions = Math.max(1, Math.ceil(length / maximumSpacing));
    for (let subdivision = 1; subdivision <= subdivisions; subdivision += 1) {
      const amount = subdivision / subdivisions;
      result.push({
        point: [
          THREE.MathUtils.lerp(from[0], to[0], amount),
          THREE.MathUtils.lerp(from[1], to[1], amount),
        ],
        distance: accumulatedDistance + length * amount,
      });
    }
    accumulatedDistance += length;
  });
  return result;
}

function stationNormal(
  samples: readonly { point: ParkAccessPoint }[],
  index: number,
): ParkAccessPoint {
  const previous = samples[Math.max(0, index - 1)]?.point ?? samples[index].point;
  const next = samples[Math.min(samples.length - 1, index + 1)]?.point ?? samples[index].point;
  const deltaX = next[0] - previous[0];
  const deltaZ = next[1] - previous[1];
  const length = Math.hypot(deltaX, deltaZ);
  return length <= EPSILON ? [0, 1] : [-deltaZ / length, deltaX / length];
}

function constrainPointToPolygon(
  point: ParkAccessPoint,
  polygon: readonly ParkAccessPoint[],
): ParkAccessPoint {
  if (pointInPolygon(point, polygon)) return point;
  return nearestPointOnPolygonBoundary(point, polygon)?.point ?? point;
}

function flatSupportTopAtCrossSection(
  left: ParkAccessPoint,
  right: ParkAccessPoint,
  supportSurfaces: readonly ParkAccessFlatSupportSurface[],
) {
  let supportTop: number | null = null;
  for (const amount of [0, 0.25, 0.5, 0.75, 1]) {
    const point = [
      THREE.MathUtils.lerp(left[0], right[0], amount),
      THREE.MathUtils.lerp(left[1], right[1], amount),
    ] as const;
    supportSurfaces.forEach((surface) => {
      if (!pointInPolygon(point, surface.polygon)) return;
      supportTop = Math.max(supportTop ?? Number.NEGATIVE_INFINITY, surface.topElevation);
    });
  }
  return supportTop;
}

function smoothRibbonElevations(stations: RibbonStation[]) {
  const maximumSlope = PARK_ACCESS_INFRASTRUCTURE_PROFILE.maximumRibbonTransitionSlope;
  for (let index = 1; index < stations.length; index += 1) {
    const distance = stations[index].distance - stations[index - 1].distance;
    stations[index].elevation = Math.max(
      stations[index].elevation,
      stations[index - 1].elevation - distance * maximumSlope,
    );
  }
  for (let index = stations.length - 2; index >= 0; index -= 1) {
    const distance = stations[index + 1].distance - stations[index].distance;
    stations[index].elevation = Math.max(
      stations[index].elevation,
      stations[index + 1].elevation - distance * maximumSlope,
    );
  }
}

function appendRibbonQuad(
  positions: number[],
  uvs: number[],
  indices: number[],
  corners: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ],
  faceUvs: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ],
) {
  const offset = positions.length / 3;
  corners.forEach((corner) => positions.push(...corner));
  faceUvs.forEach((uv) => uvs.push(...uv));
  indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
}

/**
 * Builds the access from its canonical GIS axis while following the rendered
 * top of official flat supports. The side skirt grounds raised stretches and
 * the two slope passes make elevation changes read as short ramps, never as a
 * detached plate. Lateral points are constrained to the registered polygon,
 * including the threshold clip beside B22.
 */
function createSupportAwareRibbonGeometry(
  surface: ParkAccessSurfaceVisual,
  supportSurfaces: readonly ParkAccessFlatSupportSurface[],
  reducedGraphics: boolean,
) {
  const centerline = surface.centerline ?? [];
  const width = surface.width ?? 0;
  if (centerline.length < 2 || width <= EPSILON) return null;
  const canonicalElevation = surface.elevation
    ?? (surface.material === 'gravel'
      ? PARK_ACCESS_INFRASTRUCTURE_PROFILE.gravelElevation
      : surface.material === 'cobblestone'
        ? PARK_ACCESS_INFRASTRUCTURE_PROFILE.cobblestoneElevation
        : PARK_ACCESS_INFRASTRUCTURE_PROFILE.asphaltElevation);
  const samples = densifyCenterline(
    centerline,
    reducedGraphics
      ? PARK_ACCESS_INFRASTRUCTURE_PROFILE.reducedRibbonSampleSpacing
      : PARK_ACCESS_INFRASTRUCTURE_PROFILE.detailedRibbonSampleSpacing,
  );
  if (samples.length < 2) return null;
  const halfWidth = width * 0.5;
  const stations = samples.map((sample, index): RibbonStation => {
    const normal = stationNormal(samples, index);
    const left = constrainPointToPolygon([
      sample.point[0] + normal[0] * halfWidth,
      sample.point[1] + normal[1] * halfWidth,
    ], surface.polygon);
    const right = constrainPointToPolygon([
      sample.point[0] - normal[0] * halfWidth,
      sample.point[1] - normal[1] * halfWidth,
    ], surface.polygon);
    const supportTop = flatSupportTopAtCrossSection(left, right, supportSurfaces);
    const requiredElevation = Math.max(
      canonicalElevation,
      supportTop === null
        ? canonicalElevation
        : supportTop + PARK_ACCESS_INFRASTRUCTURE_PROFILE.supportClearance,
    );
    return {
      ...sample,
      normal,
      left,
      right,
      supportTop,
      requiredElevation,
      elevation: requiredElevation,
    };
  });
  smoothRibbonElevations(stations);

  const skirtBase = (station: RibbonStation) => Math.min(
    station.elevation - PARK_ACCESS_INFRASTRUCTURE_PROFILE.minimumRibbonSkirtDepth,
    Math.max(
      canonicalElevation - PARK_ACCESS_INFRASTRUCTURE_PROFILE.defaultRibbonSkirtDepth,
      station.supportTop ?? Number.NEGATIVE_INFINITY,
    ),
  );
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  stations.slice(0, -1).forEach((station, index) => {
    const next = stations[index + 1];
    const leftBottom = skirtBase(station);
    const nextLeftBottom = skirtBase(next);
    appendRibbonQuad(positions, uvs, indices, [
      [station.left[0], station.elevation, station.left[1]],
      [next.left[0], next.elevation, next.left[1]],
      [next.right[0], next.elevation, next.right[1]],
      [station.right[0], station.elevation, station.right[1]],
    ], [
      [station.distance, 0],
      [next.distance, 0],
      [next.distance, 1],
      [station.distance, 1],
    ]);
    appendRibbonQuad(positions, uvs, indices, [
      [station.left[0], leftBottom, station.left[1]],
      [next.left[0], nextLeftBottom, next.left[1]],
      [next.left[0], next.elevation, next.left[1]],
      [station.left[0], station.elevation, station.left[1]],
    ], [[station.distance, 0], [next.distance, 0], [next.distance, 1], [station.distance, 1]]);
    appendRibbonQuad(positions, uvs, indices, [
      [station.right[0], station.elevation, station.right[1]],
      [next.right[0], next.elevation, next.right[1]],
      [next.right[0], nextLeftBottom, next.right[1]],
      [station.right[0], leftBottom, station.right[1]],
    ], [[station.distance, 1], [next.distance, 1], [next.distance, 0], [station.distance, 0]]);
  });
  const first = stations[0];
  const last = stations[stations.length - 1];
  appendRibbonQuad(positions, uvs, indices, [
    [first.right[0], skirtBase(first), first.right[1]],
    [first.left[0], skirtBase(first), first.left[1]],
    [first.left[0], first.elevation, first.left[1]],
    [first.right[0], first.elevation, first.right[1]],
  ], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  appendRibbonQuad(positions, uvs, indices, [
    [last.left[0], skirtBase(last), last.left[1]],
    [last.right[0], skirtBase(last), last.right[1]],
    [last.right[0], last.elevation, last.right[1]],
    [last.left[0], last.elevation, last.left[1]],
  ], [[0, 0], [1, 0], [1, 1], [0, 1]]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createHorizontalStripGeometry(
  from: ParkAccessPoint,
  to: ParkAccessPoint,
  width: number,
  elevation: number,
) {
  const deltaX = to[0] - from[0];
  const deltaZ = to[1] - from[1];
  const length = Math.hypot(deltaX, deltaZ);
  if (length < PARK_ACCESS_INFRASTRUCTURE_PROFILE.minimumSegmentLength || width <= 0) return null;
  const normalX = (-deltaZ / length) * width * 0.5;
  const normalZ = (deltaX / length) * width * 0.5;
  const positions = new Float32Array([
    from[0] + normalX, elevation, from[1] + normalZ,
    to[0] + normalX, elevation, to[1] + normalZ,
    to[0] - normalX, elevation, to[1] - normalZ,
    from[0] - normalX, elevation, from[1] - normalZ,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    length, 0,
    length, 1,
    0, 1,
  ], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createCurbSegmentGeometry(
  from: ParkAccessPoint,
  to: ParkAccessPoint,
  baseElevation: number,
) {
  const deltaX = to[0] - from[0];
  const deltaZ = to[1] - from[1];
  const length = Math.hypot(deltaX, deltaZ);
  if (length < PARK_ACCESS_INFRASTRUCTURE_PROFILE.minimumSegmentLength) return null;
  const geometry = new THREE.BoxGeometry(
    length,
    PARK_ACCESS_INFRASTRUCTURE_PROFILE.curbRise,
    PARK_ACCESS_INFRASTRUCTURE_PROFILE.curbWidth,
  );
  geometry.rotateY(-Math.atan2(deltaZ, deltaX));
  geometry.translate(
    (from[0] + to[0]) * 0.5,
    baseElevation + PARK_ACCESS_INFRASTRUCTURE_PROFILE.curbRise * 0.5,
    (from[1] + to[1]) * 0.5,
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function mergeAndDispose(geometries: Array<THREE.BufferGeometry | null>) {
  const valid = geometries.filter((geometry): geometry is THREE.BufferGeometry => Boolean(geometry));
  if (!valid.length) return null;
  const indexedCount = valid.filter((geometry) => geometry.index !== null).length;
  const normalized = indexedCount > 0 && indexedCount < valid.length
    ? valid.map((geometry) => geometry.index ? geometry.toNonIndexed() : geometry)
    : valid;
  const merged = mergeBufferGeometries(normalized, false);
  normalized.forEach((geometry) => {
    if (!valid.includes(geometry)) geometry.dispose();
  });
  valid.forEach((geometry) => geometry.dispose());
  if (!merged) return null;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function pointAlong(
  from: ParkAccessPoint,
  to: ParkAccessPoint,
  distance: number,
  totalLength: number,
): ParkAccessPoint {
  const amount = totalLength <= EPSILON ? 0 : THREE.MathUtils.clamp(distance / totalLength, 0, 1);
  return [
    THREE.MathUtils.lerp(from[0], to[0], amount),
    THREE.MathUtils.lerp(from[1], to[1], amount),
  ];
}

function markingGeometries(marking: ParkAccessMarkingVisual) {
  const elevation = marking.elevation ?? PARK_ACCESS_INFRASTRUCTURE_PROFILE.markingElevation;
  const style = marking.style.toLocaleLowerCase('en-US');
  const length = Math.hypot(
    marking.to[0] - marking.from[0],
    marking.to[1] - marking.from[1],
  );
  if (style.includes('double') && length > EPSILON) {
    const normalX = (-(marking.to[1] - marking.from[1]) / length) * marking.width * 1.15;
    const normalZ = ((marking.to[0] - marking.from[0]) / length) * marking.width * 1.15;
    return [-1, 1].map((direction) => createHorizontalStripGeometry(
      [marking.from[0] + normalX * direction, marking.from[1] + normalZ * direction],
      [marking.to[0] + normalX * direction, marking.to[1] + normalZ * direction],
      marking.width,
      elevation,
    ));
  }
  if (!style.includes('dash')) {
    return [createHorizontalStripGeometry(marking.from, marking.to, marking.width, elevation)];
  }
  const result: Array<THREE.BufferGeometry | null> = [];
  const dashLength = Math.max(
    marking.dashPattern?.[0] ?? PARK_ACCESS_INFRASTRUCTURE_PROFILE.dashLength,
    marking.width * 5,
  );
  const gap = Math.max(
    marking.dashPattern?.[1] ?? PARK_ACCESS_INFRASTRUCTURE_PROFILE.dashGap,
    marking.width * 3,
  );
  for (let cursor = 0; cursor < length - EPSILON; cursor += dashLength + gap) {
    const end = Math.min(length, cursor + dashLength);
    result.push(createHorizontalStripGeometry(
      pointAlong(marking.from, marking.to, cursor, length),
      pointAlong(marking.from, marking.to, end, length),
      marking.width,
      elevation,
    ));
  }
  return result;
}

function rotateLocalPoint(
  center: ParkAccessPoint,
  local: ParkAccessPoint,
  rotationRadians: number,
): ParkAccessPoint {
  const cosine = Math.cos(rotationRadians);
  const sine = Math.sin(rotationRadians);
  return [
    center[0] + local[0] * cosine + local[1] * sine,
    center[1] - local[0] * sine + local[1] * cosine,
  ];
}

function parkingBayGeometries(bay: ParkAccessParkingBayVisual) {
  const width = Math.max(0.12, bay.size[0]);
  const depth = Math.max(0.2, bay.size[1]);
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const elevation = bay.elevation ?? PARK_ACCESS_INFRASTRUCTURE_PROFILE.markingElevation;
  const lineWidth = Math.min(
    PARK_ACCESS_INFRASTRUCTURE_PROFILE.parkingMarkingWidth,
    width * 0.13,
  );
  const segments = [
    [[-halfWidth, -halfDepth], [-halfWidth, halfDepth]],
    [[halfWidth, -halfDepth], [halfWidth, halfDepth]],
    [[-halfWidth, -halfDepth], [halfWidth, -halfDepth]],
  ] as const;
  return segments.map(([localFrom, localTo]) => createHorizontalStripGeometry(
    rotateLocalPoint(bay.center, localFrom, bay.rotationRadians),
    rotateLocalPoint(bay.center, localTo, bay.rotationRadians),
    lineWidth,
    elevation,
  ));
}

function circleGeometry(radius: number, segments: number, center: ParkAccessPoint, elevation: number) {
  if (radius <= EPSILON) return null;
  const geometry = new THREE.CircleGeometry(radius, segments);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(center[0], elevation, center[1]);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function ringGeometry(
  innerRadius: number,
  outerRadius: number,
  segments: number,
  center: ParkAccessPoint,
  elevation: number,
) {
  if (innerRadius < 0 || outerRadius <= innerRadius + EPSILON) return null;
  const geometry = new THREE.RingGeometry(innerRadius, outerRadius, segments, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(center[0], elevation, center[1]);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function raisedRingGeometry(
  innerRadius: number,
  outerRadius: number,
  height: number,
  segments: number,
  center: ParkAccessPoint,
  baseElevation: number,
) {
  if (innerRadius < 0 || outerRadius <= innerRadius + EPSILON || height <= 0) return null;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: segments,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(center[0], baseElevation, center[1]);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function triangleCount(geometry: THREE.BufferGeometry | null) {
  if (!geometry) return 0;
  return geometry.index
    ? geometry.index.count / 3
    : geometry.getAttribute('position').count / 3;
}

function countGeometryDrawCalls(geometries: ParkAccessGeometrySet) {
  return Object.values(geometries).filter(Boolean).length;
}

export function buildParkAccessRenderModel(
  input: ParkAccessInfrastructureInput,
  options: { reducedGraphics?: boolean } = {},
): ParkAccessRenderModel {
  const reducedGraphics = options.reducedGraphics ?? false;
  const circleSegments = reducedGraphics
    ? PARK_ACCESS_INFRASTRUCTURE_PROFILE.reducedCircleSegments
    : PARK_ACCESS_INFRASTRUCTURE_PROFILE.detailedCircleSegments;
  const asphaltParts: Array<THREE.BufferGeometry | null> = [];
  const cobblestoneParts: Array<THREE.BufferGeometry | null> = [];
  const gravelParts: Array<THREE.BufferGeometry | null> = [];
  input.roadSurfaces.forEach((surface) => {
    const material = surface.material ?? 'asphalt';
    const defaultElevation = material === 'gravel'
      ? PARK_ACCESS_INFRASTRUCTURE_PROFILE.gravelElevation
      : material === 'cobblestone'
        ? PARK_ACCESS_INFRASTRUCTURE_PROFILE.cobblestoneElevation
        : PARK_ACCESS_INFRASTRUCTURE_PROFILE.asphaltElevation;
    const geometry = surface.supportAware
      ? createSupportAwareRibbonGeometry(surface, input.supportSurfaces, reducedGraphics)
      : createHorizontalPolygonGeometry(
        surface.polygon,
        surface.elevation ?? defaultElevation,
      );
    if (material === 'gravel') gravelParts.push(geometry);
    else if (material === 'cobblestone') cobblestoneParts.push(geometry);
    else asphaltParts.push(geometry);
  });

  const sidewalkParts = input.sidewalkSurfaces.map((surface) => createHorizontalPolygonGeometry(
    surface.polygon,
    surface.elevation ?? PARK_ACCESS_INFRASTRUCTURE_PROFILE.sidewalkElevation,
  ));
  const curbParts: Array<THREE.BufferGeometry | null> = [];
  input.sidewalkSurfaces.forEach((surface) => {
    const polygon = openPolygon(surface.polygon);
    polygon.forEach((from, index) => {
      const to = polygon[(index + 1) % polygon.length];
      curbParts.push(createCurbSegmentGeometry(
        from,
        to,
        surface.elevation ?? PARK_ACCESS_INFRASTRUCTURE_PROFILE.sidewalkElevation,
      ));
    });
  });
  input.curbSegments?.forEach((segment) => {
    curbParts.push(createCurbSegmentGeometry(
      segment.from,
      segment.to,
      segment.elevation,
    ));
  });

  const whiteMarkingParts: Array<THREE.BufferGeometry | null> = [];
  const yellowMarkingParts: Array<THREE.BufferGeometry | null> = [];
  input.markingSegments.forEach((marking) => {
    const target = marking.color === 'yellow' ? yellowMarkingParts : whiteMarkingParts;
    target.push(...markingGeometries(marking));
  });
  input.parkingBays.forEach((bay) => whiteMarkingParts.push(...parkingBayGeometries(bay)));

  const landscapeParts: Array<THREE.BufferGeometry | null> = [];
  const roundaboutCurbParts: Array<THREE.BufferGeometry | null> = [];
  input.roundabouts.forEach((roundabout) => {
    const roundaboutElevation = roundabout.elevation
      ?? PARK_ACCESS_INFRASTRUCTURE_PROFILE.asphaltElevation;
    const outerRadius = Math.max(0.2, roundabout.outerRadius);
    const islandRadius = Math.min(
      Math.max(0.08, roundabout.islandRadius),
      outerRadius * 0.78,
    );
    const curbWidth = Math.min(
      Math.max(0.035, roundabout.curbWidth),
      (outerRadius - islandRadius) * 0.4,
    );
    asphaltParts.push(ringGeometry(
      islandRadius + curbWidth,
      outerRadius,
      circleSegments,
      roundabout.center,
      roundaboutElevation + 0.003,
    ));
    landscapeParts.push(circleGeometry(
      islandRadius,
      circleSegments,
      roundabout.center,
      roundaboutElevation + PARK_ACCESS_INFRASTRUCTURE_PROFILE.curbRise + 0.005,
    ));
    roundabout.splitterIslands?.forEach((polygon) => {
      landscapeParts.push(createHorizontalPolygonGeometry(
        polygon,
        roundaboutElevation + PARK_ACCESS_INFRASTRUCTURE_PROFILE.curbRise + 0.005,
      ));
      const open = openPolygon(polygon);
      open.forEach((from, index) => roundaboutCurbParts.push(createCurbSegmentGeometry(
        from,
        open[(index + 1) % open.length],
        roundaboutElevation,
      )));
    });
    roundaboutCurbParts.push(raisedRingGeometry(
      islandRadius,
      islandRadius + curbWidth,
      PARK_ACCESS_INFRASTRUCTURE_PROFILE.curbRise,
      circleSegments,
      roundabout.center,
      roundaboutElevation,
    ));
    const dividerRadius = islandRadius + curbWidth + (outerRadius - islandRadius - curbWidth) * 0.5;
    whiteMarkingParts.push(ringGeometry(
      dividerRadius - 0.018,
      dividerRadius + 0.018,
      circleSegments,
      roundabout.center,
      roundaboutElevation + 0.008,
    ));
  });

  const geometries: ParkAccessGeometrySet = {
    asphalt: mergeAndDispose(asphaltParts),
    cobblestone: mergeAndDispose(cobblestoneParts),
    gravel: mergeAndDispose(gravelParts),
    sidewalks: mergeAndDispose(sidewalkParts),
    curbs: mergeAndDispose(curbParts),
    whiteMarkings: mergeAndDispose(whiteMarkingParts),
    yellowMarkings: mergeAndDispose(yellowMarkingParts),
    landscape: mergeAndDispose(landscapeParts),
    roundaboutCurb: mergeAndDispose(roundaboutCurbParts),
  };
  const architecture = buildParkAccessArchitectureModel(
    input.gates,
    input.costeiros,
    { reducedGraphics },
  );
  const surfaceTriangleCount = Object.values(geometries)
    .reduce((total, geometry) => total + triangleCount(geometry), 0);
  const instancedTriangleCount = (
    architecture.diagnostics.opaqueInstanceCount
    + architecture.diagnostics.glassInstanceCount
    + architecture.diagnostics.metalInstanceCount
  ) * 12;
  const estimatedPrimaryDrawCalls = countGeometryDrawCalls(geometries)
    + architecture.diagnostics.estimatedDrawCalls;
  const estimatedShadowDrawCalls = [
    architecture.diagnostics.opaqueInstanceCount,
    architecture.diagnostics.metalInstanceCount,
  ].filter((count) => count > 0).length;

  return {
    geometries,
    architecture,
    diagnostics: {
      roadSurfaceCount: input.roadSurfaces.length,
      sidewalkSurfaceCount: input.sidewalkSurfaces.length,
      curbSegmentCount: input.curbSegments?.length ?? 0,
      parkingBayCount: input.parkingBays.length,
      markingSegmentCount: input.markingSegments.length,
      roundaboutCount: input.roundabouts.length,
      surfaceTriangleCount,
      instancedTriangleCount,
      estimatedPrimaryDrawCalls,
      estimatedShadowDrawCalls,
      withinBudget: estimatedPrimaryDrawCalls <= PARK_ACCESS_RENDER_BUDGET.maximumPrimaryDrawCalls
        && estimatedShadowDrawCalls <= PARK_ACCESS_RENDER_BUDGET.maximumShadowDrawCalls
        && surfaceTriangleCount + instancedTriangleCount <= PARK_ACCESS_RENDER_BUDGET.maximumRenderedTriangles,
    },
  };
}

export function disposeParkAccessRenderModel(model: ParkAccessRenderModel) {
  Object.values(model.geometries).forEach((geometry) => geometry?.dispose());
}
