import * as THREE from 'three';
import type { MapClassification, MapEntity } from '../types';
import type { ExecutiveRouteDefinition, ExecutiveRoutePoint } from '../data/executiveRoute';

export interface ExecutiveRoutePose {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  yaw: number;
}

export interface ExecutiveRouteValidationIssue {
  code: 'EMPTY_ROUTE' | 'INVALID_COORDINATE' | 'OUT_OF_BOUNDS' | 'WAYPOINT_GAP' | 'ANCHOR_MISMATCH' | 'SOLID_COLLISION' | 'SOLID_CLEARANCE';
  message: string;
  pointIndex?: number;
  entityIdentifier?: string;
  lateralOffset?: number;
}

const SOLID_CLASSIFICATIONS = new Set<MapClassification>([
  'SELLABLE_LOT',
  'INTERNAL_STAND',
  'PAVILION',
  'BUILDING',
  'RESTAURANT',
  'FOOD_AREA',
  'RESTROOM',
  'CHEMICAL_RESTROOM',
  'ADMINISTRATION',
  'SECURITY',
  'EMERGENCY',
  'SERVICE',
  'EVENT_VENUE',
  'RESTRICTED_AREA',
]);

function toVector(point: ExecutiveRoutePoint) {
  return new THREE.Vector3(point[0], point[1], point[2]);
}

export function createExecutiveRouteCurve(route: ExecutiveRouteDefinition) {
  const points = route.waypoints.map(toVector);
  const entries: THREE.Vector3[] = [];
  const exits: THREE.Vector3[] = [];
  points.forEach((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const previousDistance = point.distanceTo(previous);
    const nextDistance = point.distanceTo(next);
    // Corridors in the official map are narrow. A human-scale 0.26-unit
    // radius keeps turns fluid without cutting through the corner lots.
    const radius = Math.min(0.26, previousDistance * 0.24, nextDistance * 0.24);
    entries.push(point.clone().add(previous.clone().sub(point).normalize().multiplyScalar(radius)));
    exits.push(point.clone().add(next.clone().sub(point).normalize().multiplyScalar(radius)));
  });

  const curve = new THREE.CurvePath<THREE.Vector3>();
  points.forEach((point, index) => {
    const previousIndex = (index - 1 + points.length) % points.length;
    curve.add(new THREE.LineCurve3(exits[previousIndex], entries[index]));
    curve.add(new THREE.QuadraticBezierCurve3(entries[index], point, exits[index]));
  });
  curve.autoClose = true;
  return curve;
}

export function normalizeRouteProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return ((progress % 1) + 1) % 1;
}

export function routeProgressAtTime(
  elapsedSeconds: number,
  routeLength: number,
  speedMapUnitsPerSecond: number,
  longitudinalOffset = 0,
) {
  if (!Number.isFinite(routeLength) || routeLength <= 0) return 0;
  const distance = Math.max(0, elapsedSeconds) * Math.max(0, speedMapUnitsPerSecond) + longitudinalOffset;
  return normalizeRouteProgress(distance / routeLength);
}

export function sampleExecutiveRoutePose(
  curve: THREE.Curve<THREE.Vector3>,
  progress: number,
  lateralOffset = 0,
): ExecutiveRoutePose {
  const normalized = normalizeRouteProgress(progress);
  const position = curve.getPointAt(normalized);
  const tangent = curve.getTangentAt(normalized).setY(0);
  if (tangent.lengthSq() < 0.000001) tangent.set(0, 0, 1);
  else tangent.normalize();
  const lateral = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(lateralOffset);
  position.add(lateral);
  return {
    position,
    tangent,
    yaw: Math.atan2(tangent.x, tangent.z),
  };
}

function pointInRing(x: number, z: number, ring: readonly (readonly [number, number])[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, zi] = ring[index];
    const [xj, zj] = ring[previous];
    const intersects = ((zi > z) !== (zj > z))
      && x < ((xj - xi) * (z - zi)) / ((zj - zi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function squaredDistanceToSegment(
  x: number,
  z: number,
  start: readonly [number, number],
  end: readonly [number, number],
) {
  const deltaX = end[0] - start[0];
  const deltaZ = end[1] - start[1];
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared <= Number.EPSILON) {
    const offsetX = x - start[0];
    const offsetZ = z - start[1];
    return offsetX * offsetX + offsetZ * offsetZ;
  }
  const projection = THREE.MathUtils.clamp(
    ((x - start[0]) * deltaX + (z - start[1]) * deltaZ) / lengthSquared,
    0,
    1,
  );
  const closestX = start[0] + deltaX * projection;
  const closestZ = start[1] + deltaZ * projection;
  const offsetX = x - closestX;
  const offsetZ = z - closestZ;
  return offsetX * offsetX + offsetZ * offsetZ;
}

function pointDistanceToRing(
  x: number,
  z: number,
  ring: readonly (readonly [number, number])[],
) {
  let minimumSquaredDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ring.length; index += 1) {
    const nextIndex = (index + 1) % ring.length;
    minimumSquaredDistance = Math.min(
      minimumSquaredDistance,
      squaredDistanceToSegment(x, z, ring[index], ring[nextIndex]),
    );
  }
  return Math.sqrt(minimumSquaredDistance);
}

export function entityRoutePointClearance(entity: MapEntity, point: THREE.Vector3) {
  return Math.min(
    ...entity.geometry.coordinates.map((ring) => pointDistanceToRing(point.x, point.z, ring)),
  );
}

export function entityContainsRoutePoint(entity: MapEntity, point: THREE.Vector3) {
  const [outer, ...holes] = entity.geometry.coordinates;
  if (!outer || !pointInRing(point.x, point.z, outer)) return false;
  return !holes.some((hole) => pointInRing(point.x, point.z, hole));
}

export function validateExecutiveRoute(
  route: ExecutiveRouteDefinition,
  entities: readonly MapEntity[],
  lateralOffsets: readonly number[] = [0],
) {
  const issues: ExecutiveRouteValidationIssue[] = [];
  if (route.waypoints.length < 4) {
    issues.push({ code: 'EMPTY_ROUTE', message: 'O circuito precisa de ao menos quatro pontos.' });
    return issues;
  }

  const [minX, maxX, minZ, maxZ] = route.validation.mapBounds;
  route.waypoints.forEach((point, index) => {
    if (!point.every(Number.isFinite)) {
      issues.push({ code: 'INVALID_COORDINATE', pointIndex: index, message: `Ponto ${index} contém coordenada inválida.` });
      return;
    }
    if (point[0] < minX || point[0] > maxX || point[2] < minZ || point[2] > maxZ) {
      issues.push({ code: 'OUT_OF_BOUNDS', pointIndex: index, message: `Ponto ${index} está fora do parque.` });
    }
    const next = route.waypoints[(index + 1) % route.waypoints.length];
    if (toVector(point).distanceTo(toVector(next)) > route.validation.maxWaypointDistance) {
      issues.push({ code: 'WAYPOINT_GAP', pointIndex: index, message: `Trecho após o ponto ${index} excede o limite de continuidade.` });
    }
  });

  if (toVector(route.anchor.start).distanceTo(toVector(route.waypoints[0])) > 0.001) {
    issues.push({ code: 'ANCHOR_MISMATCH', message: 'O primeiro ponto não coincide com a âncora Casa da Soja.' });
  }

  const blocking = entities.filter((entity) => SOLID_CLASSIFICATIONS.has(entity.classification));
  const curve = createExecutiveRouteCurve(route);
  const collisionKeys = new Set<string>();
  for (const lateralOffset of lateralOffsets) {
    for (let index = 0; index <= route.validation.sampleCount; index += 1) {
      const point = sampleExecutiveRoutePose(
        curve,
        index / route.validation.sampleCount,
        lateralOffset,
      ).position;
      const collision = blocking.find((entity) => entityContainsRoutePoint(entity, point));
      const clearanceViolation = collision ? undefined : blocking.find((entity) => (
        entityRoutePointClearance(entity, point) < route.validation.collisionClearance
      ));
      const blockingEntity = collision ?? clearanceViolation;
      if (!blockingEntity) continue;
      const key = `${lateralOffset}:${blockingEntity.publicIdentifier}:${Math.round(index / 4)}`;
      if (collisionKeys.has(key)) continue;
      collisionKeys.add(key);
      issues.push({
        code: collision ? 'SOLID_COLLISION' : 'SOLID_CLEARANCE',
        pointIndex: index,
        entityIdentifier: blockingEntity.publicIdentifier,
        lateralOffset,
        message: collision
          ? `A trajetória lateral ${lateralOffset} intercepta ${blockingEntity.publicIdentifier} (${blockingEntity.name}).`
          : `A trajetória lateral ${lateralOffset} não preserva a folga de ${route.validation.collisionClearance} unidade de ${blockingEntity.publicIdentifier} (${blockingEntity.name}).`,
      });
    }
  }
  return issues;
}
