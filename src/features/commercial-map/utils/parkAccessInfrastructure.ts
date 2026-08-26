import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import {
  buildParkAccessArchitectureModel,
  type CosteirosBuildingPlacement,
  type ParkAccessArchitectureModel,
  type ParkAccessGatePlacement,
  type ParkAccessPoint,
} from './parkAccessArchitecture';

export type ParkAccessRoadMaterial = 'asphalt' | 'gravel';
export type ParkAccessMarkingColor = 'white' | 'yellow';

export interface ParkAccessSurfaceVisual {
  id: string;
  polygon: readonly ParkAccessPoint[];
  elevation?: number;
  material?: ParkAccessRoadMaterial;
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
  sidewalkSurfaces: readonly ParkAccessSurfaceVisual[];
  parkingBays: readonly ParkAccessParkingBayVisual[];
  markingSegments: readonly ParkAccessMarkingVisual[];
  roundabout: ParkAccessRoundaboutVisual | null;
  gates: readonly ParkAccessGatePlacement[];
  costeiros: CosteirosBuildingPlacement | null;
}

export interface ParkAccessGeometrySet {
  asphalt: THREE.BufferGeometry | null;
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
    parkingBayCount: number;
    markingSegmentCount: number;
    surfaceTriangleCount: number;
    instancedTriangleCount: number;
    estimatedPrimaryDrawCalls: number;
    estimatedShadowDrawCalls: number;
    withinBudget: boolean;
  };
}

export const PARK_ACCESS_INFRASTRUCTURE_REVISION = '2026.8-park-access-infrastructure.r1';

export const PARK_ACCESS_INFRASTRUCTURE_PROFILE = {
  asphaltElevation: 0.044,
  gravelElevation: 0.041,
  sidewalkElevation: 0.072,
  markingElevation: 0.082,
  parkingMarkingWidth: 0.032,
  curbWidth: 0.075,
  curbRise: 0.043,
  dashLength: 0.44,
  dashGap: 0.3,
  minimumSegmentLength: 0.012,
  detailedCircleSegments: 48,
  reducedCircleSegments: 30,
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
  const gravelParts: Array<THREE.BufferGeometry | null> = [];
  input.roadSurfaces.forEach((surface) => {
    const material = surface.material ?? 'asphalt';
    const geometry = createHorizontalPolygonGeometry(
      surface.polygon,
      surface.elevation ?? (
        material === 'gravel'
          ? PARK_ACCESS_INFRASTRUCTURE_PROFILE.gravelElevation
          : PARK_ACCESS_INFRASTRUCTURE_PROFILE.asphaltElevation
      ),
    );
    if (material === 'gravel') gravelParts.push(geometry);
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

  const whiteMarkingParts: Array<THREE.BufferGeometry | null> = [];
  const yellowMarkingParts: Array<THREE.BufferGeometry | null> = [];
  input.markingSegments.forEach((marking) => {
    const target = marking.color === 'yellow' ? yellowMarkingParts : whiteMarkingParts;
    target.push(...markingGeometries(marking));
  });
  input.parkingBays.forEach((bay) => whiteMarkingParts.push(...parkingBayGeometries(bay)));

  const landscapeParts: Array<THREE.BufferGeometry | null> = [];
  const roundaboutCurbParts: Array<THREE.BufferGeometry | null> = [];
  if (input.roundabout) {
    const roundaboutElevation = input.roundabout.elevation
      ?? PARK_ACCESS_INFRASTRUCTURE_PROFILE.asphaltElevation;
    const outerRadius = Math.max(0.2, input.roundabout.outerRadius);
    const islandRadius = Math.min(
      Math.max(0.08, input.roundabout.islandRadius),
      outerRadius * 0.78,
    );
    const curbWidth = Math.min(
      Math.max(0.035, input.roundabout.curbWidth),
      (outerRadius - islandRadius) * 0.4,
    );
    asphaltParts.push(ringGeometry(
      islandRadius + curbWidth,
      outerRadius,
      circleSegments,
      input.roundabout.center,
      roundaboutElevation + 0.003,
    ));
    landscapeParts.push(circleGeometry(
      islandRadius,
      circleSegments,
      input.roundabout.center,
      roundaboutElevation + PARK_ACCESS_INFRASTRUCTURE_PROFILE.curbRise + 0.005,
    ));
    input.roundabout.splitterIslands?.forEach((polygon) => {
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
      input.roundabout.center,
      roundaboutElevation,
    ));
    const dividerRadius = islandRadius + curbWidth + (outerRadius - islandRadius - curbWidth) * 0.5;
    whiteMarkingParts.push(ringGeometry(
      dividerRadius - 0.018,
      dividerRadius + 0.018,
      circleSegments,
      input.roundabout.center,
      roundaboutElevation + 0.008,
    ));
  }

  const geometries: ParkAccessGeometrySet = {
    asphalt: mergeAndDispose(asphaltParts),
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
      parkingBayCount: input.parkingBays.length,
      markingSegmentCount: input.markingSegments.length,
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
