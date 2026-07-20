import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import type { Coordinate, MapEntity } from '../types';
import { withoutClosingPoint } from './geometry';

export const ROAD_INFRASTRUCTURE = {
  asphaltHeight: 0.032,
  pedestrianHeight: 0.026,
  intersectionLift: 0.0025,
  joinTolerance: 0.042,
  curbWidth: 0.09,
  curbRise: 0.026,
  gutterWidth: 0.16,
  detailedBoundaryStep: 0.2,
  reducedBoundaryStep: 0.36,
  maximumBaseDrawCalls: 5,
} as const;

export interface RoadConnection {
  firstId: string;
  secondId: string;
  distance: number;
  kind: 'overlap' | 'micro-gap';
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface RoadBoundaryRun {
  entityId: string;
  classification: MapEntity['classification'];
  from: Coordinate;
  to: Coordinate;
  inwardNormal: Coordinate;
  elevation: number;
  surfaceHeight: number;
}

export interface RoadNetworkDiagnostics {
  roadCount: number;
  pedestrianPathCount: number;
  connectionCount: number;
  microGapCount: number;
  curbRunCount: number;
  estimatedBaseDrawCalls: number;
}

export interface RoadNetworkGeometrySet {
  asphalt: THREE.BufferGeometry | null;
  pedestrian: THREE.BufferGeometry | null;
  intersections: THREE.BufferGeometry | null;
  gutters: THREE.BufferGeometry | null;
  curbs: THREE.BufferGeometry | null;
  diagnostics: RoadNetworkDiagnostics;
}

interface NetworkBuildOptions {
  reducedGraphics?: boolean;
}

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface MutableGeometry {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

const EPSILON = 1e-6;

export function isRoadInfrastructureEntity(entity: MapEntity) {
  return entity.classification === 'ROAD' || entity.classification === 'PEDESTRIAN_PATH';
}

export function roadSurfaceHeight(entity: MapEntity) {
  const fallback = entity.classification === 'PEDESTRIAN_PATH'
    ? ROAD_INFRASTRUCTURE.pedestrianHeight
    : ROAD_INFRASTRUCTURE.asphaltHeight;
  return THREE.MathUtils.clamp(entity.geometry.extrusionHeight || fallback, 0.018, 0.052);
}

function createEntityShape(entity: MapEntity) {
  const outer = withoutClosingPoint(entity.geometry.coordinates[0] ?? []);
  const shape = new THREE.Shape();
  outer.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  entity.geometry.coordinates.slice(1).forEach((holeRing) => {
    const hole = new THREE.Path();
    withoutClosingPoint(holeRing).forEach(([x, z], index) => {
      if (index === 0) hole.moveTo(x, -z);
      else hole.lineTo(x, -z);
    });
    shape.holes.push(hole);
  });
  return shape;
}

function createSurfaceGeometry(entity: MapEntity) {
  const geometry = new THREE.ExtrudeGeometry(createEntityShape(entity), {
    depth: roadSurfaceHeight(entity),
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, entity.geometry.elevation, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function mergeAndDispose(geometries: THREE.BufferGeometry[]) {
  if (!geometries.length) return null;
  const merged = mergeBufferGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) return null;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function createRoadSurfaceGeometry(entities: MapEntity[]) {
  return mergeAndDispose(entities.filter(isRoadInfrastructureEntity).map(createSurfaceGeometry));
}

function entityRing(entity: MapEntity) {
  return withoutClosingPoint(entity.geometry.coordinates[0] ?? []);
}

function boundsForRing(ring: Coordinate[]): Bounds {
  const xs = ring.map(([x]) => x);
  const zs = ring.map(([, z]) => z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function ringSignedArea(ring: Coordinate[]) {
  return ring.reduce((sum, [x, z], index) => {
    const [nextX, nextZ] = ring[(index + 1) % ring.length] ?? [x, z];
    return sum + x * nextZ - nextX * z;
  }, 0) / 2;
}

function pointInRing([x, z]: Coordinate, ring: Coordinate[]) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentX, currentZ] = ring[current];
    const [previousX, previousZ] = ring[previous];
    const crosses = currentZ > z !== previousZ > z
      && x < ((previousX - currentX) * (z - currentZ)) / (previousZ - currentZ + EPSILON) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function distancePointToSegment(point: Coordinate, start: Coordinate, end: Coordinate) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= EPSILON) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const projection = THREE.MathUtils.clamp(
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared,
    0,
    1,
  );
  return Math.hypot(
    point[0] - (start[0] + dx * projection),
    point[1] - (start[1] + dz * projection),
  );
}

function pointNearRing(point: Coordinate, ring: Coordinate[], tolerance: number) {
  if (pointInRing(point, ring)) return true;
  return ring.some((start, index) => (
    distancePointToSegment(point, start, ring[(index + 1) % ring.length] ?? start) <= tolerance
  ));
}

function orientation(a: Coordinate, b: Coordinate, c: Coordinate) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(point: Coordinate, start: Coordinate, end: Coordinate) {
  return point[0] >= Math.min(start[0], end[0]) - EPSILON
    && point[0] <= Math.max(start[0], end[0]) + EPSILON
    && point[1] >= Math.min(start[1], end[1]) - EPSILON
    && point[1] <= Math.max(start[1], end[1]) + EPSILON;
}

function segmentsIntersect(a1: Coordinate, a2: Coordinate, b1: Coordinate, b2: Coordinate) {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (o1 * o2 < -EPSILON && o3 * o4 < -EPSILON) return true;
  if (Math.abs(o1) <= EPSILON && pointOnSegment(b1, a1, a2)) return true;
  if (Math.abs(o2) <= EPSILON && pointOnSegment(b2, a1, a2)) return true;
  if (Math.abs(o3) <= EPSILON && pointOnSegment(a1, b1, b2)) return true;
  if (Math.abs(o4) <= EPSILON && pointOnSegment(a2, b1, b2)) return true;
  return false;
}

function ringDistance(first: Coordinate[], second: Coordinate[]) {
  if (first.some((point) => pointInRing(point, second)) || second.some((point) => pointInRing(point, first))) return 0;
  let minimum = Infinity;
  first.forEach((firstStart, firstIndex) => {
    const firstEnd = first[(firstIndex + 1) % first.length] ?? firstStart;
    second.forEach((secondStart, secondIndex) => {
      const secondEnd = second[(secondIndex + 1) % second.length] ?? secondStart;
      if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) minimum = 0;
      minimum = Math.min(
        minimum,
        distancePointToSegment(firstStart, secondStart, secondEnd),
        distancePointToSegment(firstEnd, secondStart, secondEnd),
        distancePointToSegment(secondStart, firstStart, firstEnd),
        distancePointToSegment(secondEnd, firstStart, firstEnd),
      );
    });
  });
  return minimum;
}

function bridgeBounds(first: Bounds, second: Bounds) {
  const rawMinX = Math.max(first.minX, second.minX);
  const rawMaxX = Math.min(first.maxX, second.maxX);
  const rawMinZ = Math.max(first.minZ, second.minZ);
  const rawMaxZ = Math.min(first.maxZ, second.maxZ);
  const minX = Math.min(rawMinX, rawMaxX);
  const maxX = Math.max(rawMinX, rawMaxX);
  const minZ = Math.min(rawMinZ, rawMaxZ);
  const maxZ = Math.max(rawMinZ, rawMaxZ);
  const padding = 0.055;
  const minimumSpan = 0.12;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const width = Math.max(maxX - minX + padding * 2, minimumSpan);
  const depth = Math.max(maxZ - minZ + padding * 2, minimumSpan);
  return {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minZ: centerZ - depth / 2,
    maxZ: centerZ + depth / 2,
  };
}

export function findRoadConnections(entities: MapEntity[], tolerance = ROAD_INFRASTRUCTURE.joinTolerance) {
  const roads = entities.filter((entity) => entity.classification === 'ROAD');
  const rings = new Map(roads.map((entity) => [entity.id, entityRing(entity)]));
  const bounds = new Map(roads.map((entity) => [entity.id, boundsForRing(rings.get(entity.id)!)]));
  const connections: RoadConnection[] = [];

  roads.forEach((first, firstIndex) => {
    const firstRing = rings.get(first.id)!;
    roads.slice(firstIndex + 1).forEach((second) => {
      const secondRing = rings.get(second.id)!;
      const distance = ringDistance(firstRing, secondRing);
      if (distance > tolerance) return;
      connections.push({
        firstId: first.id,
        secondId: second.id,
        distance,
        kind: distance <= EPSILON ? 'overlap' : 'micro-gap',
        bounds: bridgeBounds(bounds.get(first.id)!, bounds.get(second.id)!),
      });
    });
  });
  return connections;
}

function lerpCoordinate(start: Coordinate, end: Coordinate, amount: number): Coordinate {
  return [
    THREE.MathUtils.lerp(start[0], end[0], amount),
    THREE.MathUtils.lerp(start[1], end[1], amount),
  ];
}

export function buildRoadBoundaryRuns(
  entities: MapEntity[],
  boundaryStep: number = ROAD_INFRASTRUCTURE.detailedBoundaryStep,
) {
  const circulation = entities.filter(isRoadInfrastructureEntity);
  const rings = new Map(circulation.map((entity) => [entity.id, entityRing(entity)]));
  const runs: RoadBoundaryRun[] = [];

  circulation.forEach((entity) => {
    const ring = rings.get(entity.id)!;
    if (ring.length < 3) return;
    const winding = ringSignedArea(ring) >= 0 ? 1 : -1;
    const edgeLengths = ring.map((start, index) => {
      const end = ring[(index + 1) % ring.length] ?? start;
      return Math.hypot(end[0] - start[0], end[1] - start[1]);
    });
    const longestEdge = Math.max(...edgeLengths);

    ring.forEach((start, edgeIndex) => {
      const end = ring[(edgeIndex + 1) % ring.length] ?? start;
      const edgeLength = edgeLengths[edgeIndex];
      // Longitudinal curbs keep corridor entrances open instead of closing each
      // official road polygon with an artificial concrete end cap.
      if (edgeLength < longestEdge * 0.48) return;
      const dx = end[0] - start[0];
      const dz = end[1] - start[1];
      const inwardNormal: Coordinate = [(-dz / edgeLength) * winding, (dx / edgeLength) * winding];
      const steps = Math.max(1, Math.ceil(edgeLength / boundaryStep));
      let runStart: Coordinate | null = null;

      for (let step = 0; step < steps; step += 1) {
        const from = lerpCoordinate(start, end, step / steps);
        const to = lerpCoordinate(start, end, (step + 1) / steps);
        const midpoint = lerpCoordinate(from, to, 0.5);
        const blockedByIntersection = circulation.some((candidate) => {
          if (candidate.id === entity.id) return false;
          return pointNearRing(midpoint, rings.get(candidate.id)!, ROAD_INFRASTRUCTURE.joinTolerance);
        });

        if (!blockedByIntersection && !runStart) runStart = from;
        if ((blockedByIntersection || step === steps - 1) && runStart) {
          const runEnd = blockedByIntersection ? from : to;
          if (Math.hypot(runEnd[0] - runStart[0], runEnd[1] - runStart[1]) > 0.035) {
            runs.push({
              entityId: entity.id,
              classification: entity.classification,
              from: runStart,
              to: runEnd,
              inwardNormal,
              elevation: entity.geometry.elevation,
              surfaceHeight: roadSurfaceHeight(entity),
            });
          }
          runStart = null;
        }
      }
    });
  });

  return runs;
}

function createMutableGeometry(): MutableGeometry {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function addFace(
  target: MutableGeometry,
  corners: Array<[number, number, number]>,
  normal: [number, number, number],
) {
  const offset = target.positions.length / 3;
  corners.forEach(([x, y, z], index) => {
    target.positions.push(x, y, z);
    target.normals.push(...normal);
    target.uvs.push(index === 0 || index === 3 ? 0 : 1, index < 2 ? 0 : 1);
  });
  target.indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
}

function appendCurbPrism(target: MutableGeometry, run: RoadBoundaryRun) {
  const width = run.classification === 'PEDESTRIAN_PATH'
    ? ROAD_INFRASTRUCTURE.curbWidth * 0.72
    : ROAD_INFRASTRUCTURE.curbWidth;
  const rise = run.classification === 'PEDESTRIAN_PATH'
    ? ROAD_INFRASTRUCTURE.curbRise * 0.62
    : ROAD_INFRASTRUCTURE.curbRise;
  const inset = 0.012;
  const [nx, nz] = run.inwardNormal;
  const [x1, z1] = run.from;
  const [x2, z2] = run.to;
  const a: Coordinate = [x1 + nx * inset, z1 + nz * inset];
  const b: Coordinate = [x2 + nx * inset, z2 + nz * inset];
  const c: Coordinate = [x2 + nx * (inset + width), z2 + nz * (inset + width)];
  const d: Coordinate = [x1 + nx * (inset + width), z1 + nz * (inset + width)];
  const bottom = run.elevation + run.surfaceHeight - 0.0015;
  const top = bottom + rise;
  const length = Math.max(EPSILON, Math.hypot(x2 - x1, z2 - z1));
  const tangent: Coordinate = [(x2 - x1) / length, (z2 - z1) / length];

  addFace(target, [[a[0], top, a[1]], [b[0], top, b[1]], [c[0], top, c[1]], [d[0], top, d[1]]], [0, 1, 0]);
  addFace(target, [[d[0], bottom, d[1]], [c[0], bottom, c[1]], [b[0], bottom, b[1]], [a[0], bottom, a[1]]], [0, -1, 0]);
  addFace(target, [[a[0], bottom, a[1]], [b[0], bottom, b[1]], [b[0], top, b[1]], [a[0], top, a[1]]], [-nx, 0, -nz]);
  addFace(target, [[d[0], bottom, d[1]], [d[0], top, d[1]], [c[0], top, c[1]], [c[0], bottom, c[1]]], [nx, 0, nz]);
  addFace(target, [[a[0], bottom, a[1]], [a[0], top, a[1]], [d[0], top, d[1]], [d[0], bottom, d[1]]], [-tangent[0], 0, -tangent[1]]);
  addFace(target, [[b[0], bottom, b[1]], [c[0], bottom, c[1]], [c[0], top, c[1]], [b[0], top, b[1]]], [tangent[0], 0, tangent[1]]);
}

function appendGutter(target: MutableGeometry, run: RoadBoundaryRun) {
  if (run.classification !== 'ROAD') return;
  const [nx, nz] = run.inwardNormal;
  const startInset = ROAD_INFRASTRUCTURE.curbWidth + 0.006;
  const endInset = startInset + ROAD_INFRASTRUCTURE.gutterWidth;
  const y = run.elevation + run.surfaceHeight + 0.001;
  const a: [number, number, number] = [run.from[0] + nx * startInset, y, run.from[1] + nz * startInset];
  const b: [number, number, number] = [run.to[0] + nx * startInset, y, run.to[1] + nz * startInset];
  const c: [number, number, number] = [run.to[0] + nx * endInset, y, run.to[1] + nz * endInset];
  const d: [number, number, number] = [run.from[0] + nx * endInset, y, run.from[1] + nz * endInset];
  addFace(target, [a, b, c, d], [0, 1, 0]);
}

function geometryFromMutable(target: MutableGeometry) {
  if (!target.positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(target.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(target.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(target.uvs, 2));
  geometry.setIndex(target.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createIntersectionGeometry(connections: RoadConnection[], entities: MapEntity[]) {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const target = createMutableGeometry();
  connections.forEach((connection) => {
    const first = byId.get(connection.firstId);
    const second = byId.get(connection.secondId);
    if (!first || !second) return;
    const y = Math.max(
      first.geometry.elevation + roadSurfaceHeight(first),
      second.geometry.elevation + roadSurfaceHeight(second),
    ) + ROAD_INFRASTRUCTURE.intersectionLift;
    const { minX, maxX, minZ, maxZ } = connection.bounds;
    addFace(target, [
      [minX, y, minZ], [maxX, y, minZ], [maxX, y, maxZ], [minX, y, maxZ],
    ], [0, 1, 0]);
  });
  return geometryFromMutable(target);
}

export function buildRoadNetworkGeometries(
  entities: MapEntity[],
  options: NetworkBuildOptions = {},
): RoadNetworkGeometrySet {
  const circulation = entities.filter(isRoadInfrastructureEntity);
  const roads = circulation.filter((entity) => entity.classification === 'ROAD');
  const pedestrianPaths = circulation.filter((entity) => entity.classification === 'PEDESTRIAN_PATH');
  const connections = findRoadConnections(roads);
  const runs = buildRoadBoundaryRuns(
    circulation,
    options.reducedGraphics
      ? ROAD_INFRASTRUCTURE.reducedBoundaryStep
      : ROAD_INFRASTRUCTURE.detailedBoundaryStep,
  );
  const curbTarget = createMutableGeometry();
  const gutterTarget = createMutableGeometry();
  runs.forEach((run) => {
    appendCurbPrism(curbTarget, run);
    if (!options.reducedGraphics) appendGutter(gutterTarget, run);
  });

  return {
    asphalt: createRoadSurfaceGeometry(roads),
    pedestrian: createRoadSurfaceGeometry(pedestrianPaths),
    intersections: createIntersectionGeometry(connections, roads),
    gutters: geometryFromMutable(gutterTarget),
    curbs: geometryFromMutable(curbTarget),
    diagnostics: {
      roadCount: roads.length,
      pedestrianPathCount: pedestrianPaths.length,
      connectionCount: connections.length,
      microGapCount: connections.filter((connection) => connection.kind === 'micro-gap').length,
      curbRunCount: runs.length,
      estimatedBaseDrawCalls: [
        roads.length,
        pedestrianPaths.length,
        connections.length,
        options.reducedGraphics ? 0 : runs.length,
        runs.length,
      ]
        .filter(Boolean).length,
    },
  };
}

export function disposeRoadNetworkGeometries(geometries: RoadNetworkGeometrySet) {
  geometries.asphalt?.dispose();
  geometries.pedestrian?.dispose();
  geometries.intersections?.dispose();
  geometries.gutters?.dispose();
  geometries.curbs?.dispose();
}
