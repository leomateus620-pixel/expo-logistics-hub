import * as THREE from 'three';
import { clipPlanarSurfaceGeometry, type PlanarSurfaceCut } from './planarSurfaceGeometry';
import {
  GENERATED_REAR_ROAD_SEGMENTS,
  REAR_ROAD_NODES,
  rearRoadLocalPath,
  rearRoadLocalShoulderWidth,
  rearRoadLocalWidth,
  type LocalPoint,
  type RoadNodeId,
  type RoadSegment,
} from '../data/rearParkRoadNetwork';

/**
 * Construção geométrica das vias da área posterior. Superfícies reais (fitas com
 * largura, curvas suaves e acostamento), consolidadas por categoria de material
 * para manter o orçamento de draw calls do mapa.
 */

export interface RearRoadNetworkBuildOptions {
  reducedGraphics?: boolean;
}

export interface RearRoadNetworkGeometries {
  highway: THREE.BufferGeometry | null;
  parkAsphalt: THREE.BufferGeometry | null;
  shoulders: THREE.BufferGeometry | null;
  markings: THREE.BufferGeometry | null;
  diagnostics: {
    roadCount: number;
    highwayCount: number;
    accessCount: number;
    internalCount: number;
    junctionCount: number;
    sampleCount: number;
    triangleCount: number;
    estimatedBaseDrawCalls: number;
  };
}

export interface RearRoadCorridorOptions {
  /** Inclui o acostamento no volume testado. O padrão representa toda a faixa viária. */
  includeShoulders?: boolean;
  /** Densidade da aproximação da Catmull-Rom usada pelo renderer. */
  samplesPerWorldUnit?: number;
  /** Folga numérica para considerar pontos e arestas sobre a borda como interseção. */
  tolerance?: number;
}

/**
 * Representação 2D verificável da mesma faixa gerada pelo renderer. O polígono
 * é útil em overlays de inspeção; `centerline` + `halfWidth` preservam a
 * semântica de corredor e são usados nas validações sem depender da
 * triangulação da malha Three.js.
 */
export interface RearRoadCorridorFootprint {
  segmentId: string;
  roadId: RoadSegment['roadId'];
  centerline: readonly LocalPoint[];
  polygon: readonly LocalPoint[];
  pavementHalfWidth: number;
  shoulderWidth: number;
  halfWidth: number;
  includesShoulders: boolean;
}

export const REAR_ROAD_BUDGET = Object.freeze({
  maximumBaseDrawCalls: 4,
  maximumTriangles: 24_000,
});

/** Descola apenas o patch da interseção; ribbons e terreno mantêm sua cota. */
export const REAR_ROAD_JUNCTION_ELEVATION_LIFT = 0.0015;

const DEFAULT_CORRIDOR_SAMPLES_PER_WORLD_UNIT = 8;
const DEFAULT_GEOMETRY_TOLERANCE = 1e-6;

/**
 * Amostragem por comprimento acumulado. `getPointAt` usa o mapeamento de arco
 * da própria CatmullRomCurve3, evitando concentração de vértices nos spans
 * curtos e falta de detalhe nos longos.
 */
export function sampleRearRoadCenterline(
  path: readonly LocalPoint[],
  samplesPerWorldUnit = 4,
): LocalPoint[] {
  if (path.length < 2) return [...path];
  const curve = new THREE.CatmullRomCurve3(
    path.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
    0.5,
  );
  // Three.js defaults to only 200 divisions for its arc-length lookup table.
  // Long park/highway splines need a denser table or `getPointAt` still yields
  // visibly uneven chord lengths despite using normalized arc distance.
  const approximateLength = curve.getLength();
  curve.arcLengthDivisions = Math.max(
    200,
    Math.ceil(approximateLength * Math.max(4, samplesPerWorldUnit * 2)),
  );
  curve.updateArcLengths();
  const divisions = Math.max(
    path.length - 1,
    Math.ceil(curve.getLength() * Math.max(1, samplesPerWorldUnit)),
  );
  return Array.from({ length: divisions + 1 }, (_, index) => {
    const point = curve.getPointAt(index / divisions);
    return [point.x, point.z] as LocalPoint;
  });
}

/** Mesma cota suave governa terreno, acostamentos e pista. */
export function rearRoadTerrainElevationAt(x: number, z: number) {
  return (
    Math.sin(x * 0.075 + z * 0.043) * 0.0018
    + Math.sin(x * 0.031 - z * 0.067) * 0.0012
  );
}

interface RibbonAccumulator {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

function createAccumulator(): RibbonAccumulator {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function pushRibbon(
  target: RibbonAccumulator,
  samples: readonly LocalPoint[],
  offsetFrom: number,
  offsetTo: number,
  elevation: number,
  uvRepeat: number,
) {
  if (samples.length < 2) return;
  const baseIndex = target.positions.length / 3;
  let distance = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    const previous = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    const dirX = next[0] - previous[0];
    const dirZ = next[1] - previous[1];
    const length = Math.hypot(dirX, dirZ) || 1;
    // Normal planar do eixo: garante largura constante mesmo nas curvas.
    const normalX = -dirZ / length;
    const normalZ = dirX / length;

    if (index > 0) distance += Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    const v = distance / Math.max(uvRepeat, 0.001);

    const surfaceElevation = elevation + rearRoadTerrainElevationAt(current[0], current[1]);
    target.positions.push(
      current[0] + normalX * offsetFrom,
      surfaceElevation,
      current[1] + normalZ * offsetFrom,
    );
    target.positions.push(
      current[0] + normalX * offsetTo,
      surfaceElevation,
      current[1] + normalZ * offsetTo,
    );
    target.normals.push(0, 1, 0, 0, 1, 0);
    target.uvs.push(0, v, 1, v);
  }

  for (let index = 0; index < samples.length - 1; index += 1) {
    const a = baseIndex + index * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    // The ribbon lives in XZ: +Z cross +X points upward. Keep the winding
    // consistent with the +Y normals; DoubleSide previously hid the reversed
    // faces while the shader flipped their normals and shadow receiver bias.
    target.indices.push(a, b, c, b, d, c);
  }
}

function pushRoundJunction(
  target: RibbonAccumulator,
  center: LocalPoint,
  radius: number,
  elevation: number,
  segments: number,
) {
  const baseIndex = target.positions.length / 3;
  const y = elevation + rearRoadTerrainElevationAt(center[0], center[1]);
  target.positions.push(center[0], y, center[1]);
  target.normals.push(0, 1, 0);
  target.uvs.push(0.5, 0.5);
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    target.positions.push(center[0] + cos * radius, y, center[1] + sin * radius);
    target.normals.push(0, 1, 0);
    target.uvs.push(0.5 + cos * 0.5, 0.5 + sin * 0.5);
    if (index > 0) target.indices.push(baseIndex, baseIndex + index + 1, baseIndex + index);
  }
}

function requiresJunctionPatch(roads: readonly RoadSegment[]) {
  if (roads.length >= 3) return true;
  if (roads.length < 2) return false;
  const owners = new Set(roads.map((road) => road.officialOwnerIdentifier ?? road.roadId));
  const materials = new Set(roads.map((road) => road.materialId));
  const widths = new Set(roads.map((road) => road.width.toFixed(6)));
  return owners.size > 1 || materials.size > 1 || widths.size > 1;
}

function pushDashedLine(
  target: RibbonAccumulator,
  samples: readonly LocalPoint[],
  offset: number,
  halfThickness: number,
  elevation: number,
  dashLength: number,
  gapLength: number,
) {
  let cursor = 0;
  let run: LocalPoint[] = [];
  const flush = () => {
    if (run.length >= 2) pushRibbon(target, run, -halfThickness + offset, halfThickness + offset, elevation, 1);
    run = [];
  };
  for (let index = 0; index < samples.length; index += 1) {
    if (index > 0) {
      cursor += Math.hypot(
        samples[index][0] - samples[index - 1][0],
        samples[index][1] - samples[index - 1][1],
      );
    }
    const phase = cursor % (dashLength + gapLength);
    if (phase <= dashLength) run.push(samples[index]);
    else flush();
  }
  flush();
}

function toGeometry(accumulator: RibbonAccumulator) {
  if (accumulator.indices.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(accumulator.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(accumulator.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(accumulator.uvs, 2));
  geometry.setIndex(accumulator.indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildRearRoadNetworkGeometries(
  definitions: readonly RoadSegment[] = GENERATED_REAR_ROAD_SEGMENTS,
  { reducedGraphics = false }: RearRoadNetworkBuildOptions = {},
): RearRoadNetworkGeometries {
  const highway = createAccumulator();
  const parkAsphalt = createAccumulator();
  const shoulders = createAccumulator();
  const markings = createAccumulator();
  const samplesPerWorldUnit = reducedGraphics ? 2.2 : 5;

  let sampleCount = 0;
  let highwayCount = 0;
  let accessCount = 0;
  let internalCount = 0;

  definitions.forEach((definition) => {
    if (definition.presentation !== 'generated-surface') return;
    const samples = sampleRearRoadCenterline(rearRoadLocalPath(definition), samplesPerWorldUnit);
    sampleCount += samples.length;
    if (definition.category === 'federal-highway') highwayCount += 1;
    else if (definition.category === 'internal-access') accessCount += 1;
    else internalCount += 1;

    const halfWidth = rearRoadLocalWidth(definition) / 2;
    const shoulderWidth = rearRoadLocalShoulderWidth(definition);
    const pavement = definition.materialId === 'highway-asphalt' ? highway : parkAsphalt;

    pushRibbon(pavement, samples, -halfWidth, halfWidth, definition.elevationOffset, halfWidth * 2);

    if (shoulderWidth > 0 && !reducedGraphics) {
      const shoulderElevation = definition.elevationOffset - 0.006;
      pushRibbon(
        shoulders,
        samples,
        -halfWidth - shoulderWidth,
        -halfWidth + 0.01,
        shoulderElevation,
        shoulderWidth * 2,
      );
      pushRibbon(
        shoulders,
        samples,
        halfWidth - 0.01,
        halfWidth + shoulderWidth,
        shoulderElevation,
        shoulderWidth * 2,
      );
    }

    if (definition.markings !== 'none' && !reducedGraphics) {
      const markingElevation = definition.elevationOffset + 0.004;
      if (definition.markings === 'highway') {
        pushDashedLine(markings, samples, 0, 0.035, markingElevation, 1.6, 2.4);
        pushRibbon(markings, samples, -halfWidth + 0.08, -halfWidth + 0.15, markingElevation, 1);
        pushRibbon(markings, samples, halfWidth - 0.15, halfWidth - 0.08, markingElevation, 1);
      } else {
        pushDashedLine(markings, samples, 0, 0.028, markingElevation, 1.1, 1.9);
      }
    }
  });

  const incident = new Map<RoadNodeId, RoadSegment[]>();
  definitions.filter((road) => road.presentation === 'generated-surface').forEach((road) => {
    incident.set(road.from, [...(incident.get(road.from) ?? []), road]);
    incident.set(road.to, [...(incident.get(road.to) ?? []), road]);
  });
  let junctionCount = 0;
  incident.forEach((roads, nodeId) => {
    if (!requiresJunctionPatch(roads)) return;
    const node = REAR_ROAD_NODES[nodeId];
    const center: LocalPoint = [node.position[0], node.position[2]];
    const hasHighway = roads.some((road) => road.materialId === 'highway-asphalt');
    const radius = Math.max(...roads.map((road) => road.width / 2));
    const elevation = Math.max(...roads.map((road) => road.elevationOffset));
    pushRoundJunction(
      hasHighway ? highway : parkAsphalt,
      center,
      radius,
      elevation + REAR_ROAD_JUNCTION_ELEVATION_LIFT,
      reducedGraphics ? 8 : 16,
    );
    junctionCount += 1;
  });

  const geometries = {
    highway: toGeometry(highway),
    parkAsphalt: toGeometry(parkAsphalt),
    shoulders: toGeometry(shoulders),
    markings: toGeometry(markings),
  };

  // The highway owns the junction surface. Trim the access and shoulders at
  // its actual triangles instead of stacking coplanar asphalt under a decal.
  // Independent meshes/materials and canonical hit-test ownership remain intact.
  if (geometries.highway) {
    const cuts: PlanarSurfaceCut[] = [];
    for (let index = 0; index < highway.indices.length; index += 3) {
      const polygon = highway.indices.slice(index, index + 3).map((vertex) => (
        [highway.positions[vertex * 3], highway.positions[vertex * 3 + 2]] as LocalPoint
      ));
      cuts.push({
        polygon,
        minX: Math.min(...polygon.map(([x]) => x)), maxX: Math.max(...polygon.map(([x]) => x)),
        minZ: Math.min(...polygon.map(([, z]) => z)), maxZ: Math.max(...polygon.map(([, z]) => z)),
      });
    }
    if (geometries.parkAsphalt) clipPlanarSurfaceGeometry(geometries.parkAsphalt, cuts);
    if (geometries.shoulders) clipPlanarSurfaceGeometry(geometries.shoulders, cuts);
  }

  const triangleCount = Object.values(geometries).reduce((total, geometry) => total + (geometry
    ? (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3 : 0), 0);

  return {
    ...geometries,
    diagnostics: {
      roadCount: definitions.filter((road) => road.presentation === 'generated-surface').length,
      highwayCount,
      accessCount,
      internalCount,
      junctionCount,
      sampleCount,
      triangleCount,
      estimatedBaseDrawCalls: Object.values(geometries).filter(Boolean).length,
    },
  };
}

export function disposeRearRoadNetworkGeometries(network: RearRoadNetworkGeometries | null) {
  if (!network) return;
  network.highway?.dispose();
  network.parkAsphalt?.dispose();
  network.shoulders?.dispose();
  network.markings?.dispose();
}

/** Distância planar de um ponto ao eixo amostrado — usado nas exclusões. */
export function distanceToPath(point: LocalPoint, path: readonly LocalPoint[]) {
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

export type RearRoadHitSurface = 'highway' | 'park';

const rearRoadHitCenterlineCache = new WeakMap<RoadSegment, readonly LocalPoint[]>();

function rearRoadHitCenterline(definition: RoadSegment) {
  const cached = rearRoadHitCenterlineCache.get(definition);
  if (cached) return cached;
  const sampled = Object.freeze(sampleRearRoadCenterline(
    rearRoadLocalPath(definition),
    DEFAULT_CORRIDOR_SAMPLES_PER_WORLD_UNIT,
  ));
  rearRoadHitCenterlineCache.set(definition, sampled);
  return sampled;
}

/**
 * Resolve a entidade oficial mais próxima sob o ponto da malha consolidada.
 * A seleção continua apontando para o cadastro existente; nenhuma ribbon vira
 * uma entidade paralela ou mantém metadados próprios.
 */
export function resolveRearRoadOwnerAtLocalPoint(
  point: LocalPoint,
  surface: RearRoadHitSurface,
  definitions: readonly RoadSegment[] = GENERATED_REAR_ROAD_SEGMENTS,
) {
  let match: { owner: string; normalizedDistance: number } | null = null;
  definitions.forEach((definition) => {
    const isHighway = definition.materialId === 'highway-asphalt';
    if ((surface === 'highway') !== isHighway) return;
    if (!definition.officialOwnerIdentifier) return;
    const halfWidth = rearRoadLocalWidth(definition) / 2;
    const distance = distanceToPath(point, rearRoadHitCenterline(definition));
    if (distance > halfWidth + 0.16) return;
    const normalizedDistance = distance / Math.max(halfWidth, 0.01);
    if (!match || normalizedDistance < match.normalizedDistance) {
      match = { owner: definition.officialOwnerIdentifier, normalizedDistance };
    }
  });
  return match?.owner ?? null;
}

function pointToSegmentDistance(point: LocalPoint, start: LocalPoint, end: LocalPoint) {
  const deltaX = end[0] - start[0];
  const deltaZ = end[1] - start[1];
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const projection = Math.min(1, Math.max(
    0,
    ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaZ) / lengthSquared,
  ));
  return Math.hypot(
    point[0] - (start[0] + deltaX * projection),
    point[1] - (start[1] + deltaZ * projection),
  );
}

function polygonRing(polygon: readonly LocalPoint[], tolerance: number): readonly LocalPoint[] {
  if (polygon.length < 2) return polygon;
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  return Math.hypot(first[0] - last[0], first[1] - last[1]) <= tolerance
    ? polygon.slice(0, -1)
    : polygon;
}

/** Teste inclusivo: um ponto sobre a borda pertence ao polígono. */
export function pointIsInsidePolygon(
  point: LocalPoint,
  polygon: readonly LocalPoint[],
  tolerance = DEFAULT_GEOMETRY_TOLERANCE,
) {
  const ring = polygonRing(polygon, tolerance);
  if (ring.length < 3) return false;

  for (let index = 0; index < ring.length; index += 1) {
    const nextIndex = (index + 1) % ring.length;
    if (pointToSegmentDistance(point, ring[index], ring[nextIndex]) <= tolerance) return true;
  }

  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const [currentX, currentZ] = ring[index];
    const [previousX, previousZ] = ring[previousIndex];
    const crossesRay = (currentZ > point[1]) !== (previousZ > point[1]);
    if (!crossesRay) continue;
    const crossingX = ((previousX - currentX) * (point[1] - currentZ))
      / (previousZ - currentZ) + currentX;
    if (point[0] < crossingX) inside = !inside;
  }
  return inside;
}

function crossProduct(origin: LocalPoint, first: LocalPoint, second: LocalPoint) {
  return (first[0] - origin[0]) * (second[1] - origin[1])
    - (first[1] - origin[1]) * (second[0] - origin[0]);
}

function segmentsIntersect(
  aStart: LocalPoint,
  aEnd: LocalPoint,
  bStart: LocalPoint,
  bEnd: LocalPoint,
  tolerance: number,
) {
  const aSideStart = crossProduct(aStart, aEnd, bStart);
  const aSideEnd = crossProduct(aStart, aEnd, bEnd);
  const bSideStart = crossProduct(bStart, bEnd, aStart);
  const bSideEnd = crossProduct(bStart, bEnd, aEnd);
  const crossesA = (aSideStart > tolerance && aSideEnd < -tolerance)
    || (aSideStart < -tolerance && aSideEnd > tolerance);
  const crossesB = (bSideStart > tolerance && bSideEnd < -tolerance)
    || (bSideStart < -tolerance && bSideEnd > tolerance);
  if (crossesA && crossesB) return true;

  return (
    (Math.abs(aSideStart) <= tolerance && pointToSegmentDistance(bStart, aStart, aEnd) <= tolerance)
    || (Math.abs(aSideEnd) <= tolerance && pointToSegmentDistance(bEnd, aStart, aEnd) <= tolerance)
    || (Math.abs(bSideStart) <= tolerance && pointToSegmentDistance(aStart, bStart, bEnd) <= tolerance)
    || (Math.abs(bSideEnd) <= tolerance && pointToSegmentDistance(aEnd, bStart, bEnd) <= tolerance)
  );
}

function segmentToSegmentDistance(
  aStart: LocalPoint,
  aEnd: LocalPoint,
  bStart: LocalPoint,
  bEnd: LocalPoint,
  tolerance: number,
) {
  if (segmentsIntersect(aStart, aEnd, bStart, bEnd, tolerance)) return 0;
  return Math.min(
    pointToSegmentDistance(aStart, bStart, bEnd),
    pointToSegmentDistance(aEnd, bStart, bEnd),
    pointToSegmentDistance(bStart, aStart, aEnd),
    pointToSegmentDistance(bEnd, aStart, aEnd),
  );
}

function centerlineNormal(samples: readonly LocalPoint[], index: number): LocalPoint {
  const current = samples[index];
  let previousIndex = index;
  while (previousIndex > 0) {
    previousIndex -= 1;
    if (samples[previousIndex][0] !== current[0] || samples[previousIndex][1] !== current[1]) break;
  }
  let nextIndex = index;
  while (nextIndex < samples.length - 1) {
    nextIndex += 1;
    if (samples[nextIndex][0] !== current[0] || samples[nextIndex][1] !== current[1]) break;
  }
  const directionX = samples[nextIndex][0] - samples[previousIndex][0];
  const directionZ = samples[nextIndex][1] - samples[previousIndex][1];
  const length = Math.hypot(directionX, directionZ);
  return length === 0 ? [0, 1] : [-directionZ / length, directionX / length];
}

function footprintPolygon(centerline: readonly LocalPoint[], halfWidth: number): LocalPoint[] {
  if (centerline.length === 0) return [];
  if (centerline.length === 1) {
    const segments = 16;
    const circle = Array.from({ length: segments }, (_, index) => {
      const angle = (index / segments) * Math.PI * 2;
      return [
        centerline[0][0] + Math.cos(angle) * halfWidth,
        centerline[0][1] + Math.sin(angle) * halfWidth,
      ] as LocalPoint;
    });
    return [...circle, circle[0]];
  }

  const left: LocalPoint[] = [];
  const right: LocalPoint[] = [];
  centerline.forEach((point, index) => {
    const normal = centerlineNormal(centerline, index);
    left.push([point[0] + normal[0] * halfWidth, point[1] + normal[1] * halfWidth]);
    right.push([point[0] - normal[0] * halfWidth, point[1] - normal[1] * halfWidth]);
  });
  const polygon = [...left, ...right.reverse()];
  return polygon.length > 0 ? [...polygon, polygon[0]] : polygon;
}

/**
 * Constrói o footprint 2D da pista ou da faixa completa (pista + acostamento)
 * com a mesma curva e as mesmas larguras usadas na malha renderizada.
 */
export function buildRearRoadCorridorFootprint(
  definition: RoadSegment,
  {
    includeShoulders = true,
    samplesPerWorldUnit = DEFAULT_CORRIDOR_SAMPLES_PER_WORLD_UNIT,
  }: RearRoadCorridorOptions = {},
): RearRoadCorridorFootprint {
  const pavementHalfWidth = rearRoadLocalWidth(definition) / 2;
  const shoulderWidth = includeShoulders ? rearRoadLocalShoulderWidth(definition) : 0;
  const halfWidth = pavementHalfWidth + shoulderWidth;
  const centerline = sampleRearRoadCenterline(
    rearRoadLocalPath(definition),
    Math.max(1, samplesPerWorldUnit),
  );
  return {
    segmentId: definition.id,
    roadId: definition.roadId,
    centerline,
    polygon: footprintPolygon(centerline, halfWidth),
    pavementHalfWidth,
    shoulderWidth,
    halfWidth,
    includesShoulders: includeShoulders,
  };
}

export function buildRearRoadCorridorFootprints(
  definitions: readonly RoadSegment[] = GENERATED_REAR_ROAD_SEGMENTS,
  options: RearRoadCorridorOptions = {},
) {
  return definitions.map((definition) => buildRearRoadCorridorFootprint(definition, options));
}

export function pointIsInsideRearRoadCorridor(
  point: LocalPoint,
  definition: RoadSegment,
  options: RearRoadCorridorOptions = {},
) {
  const footprint = buildRearRoadCorridorFootprint(definition, options);
  return pointIsInsideRearRoadFootprint(
    point,
    footprint,
    options.tolerance ?? DEFAULT_GEOMETRY_TOLERANCE,
  );
}

export function pointIsInsideRearRoadFootprint(
  point: LocalPoint,
  footprint: RearRoadCorridorFootprint,
  tolerance = DEFAULT_GEOMETRY_TOLERANCE,
) {
  return distanceToPath(point, footprint.centerline) <= footprint.halfWidth + tolerance;
}

export function pointIsInsideAnyRearRoadCorridor(
  point: LocalPoint,
  definitions: readonly RoadSegment[] = GENERATED_REAR_ROAD_SEGMENTS,
  options: RearRoadCorridorOptions = {},
) {
  return definitions.some((definition) => pointIsInsideRearRoadCorridor(point, definition, options));
}

export function pointIsInsideAnyRearRoadFootprint(
  point: LocalPoint,
  footprints: readonly RearRoadCorridorFootprint[],
  tolerance = DEFAULT_GEOMETRY_TOLERANCE,
) {
  return footprints.some((footprint) => pointIsInsideRearRoadFootprint(point, footprint, tolerance));
}

/**
 * Interseção do corredor com um polígono oficial. A verificação trabalha com o
 * eixo suavizado e a largura física real: cobre eixo dentro do polígono,
 * vértices do polígono dentro da faixa e aproximação entre todas as arestas.
 * Assim ela detecta cruzamentos mesmo quando nenhuma amostra cai exatamente
 * dentro do polígono e evita depender de bounding boxes ou da triangulação.
 */
export function rearRoadFootprintIntersectsPolygon(
  footprint: RearRoadCorridorFootprint,
  polygon: readonly LocalPoint[],
  tolerance = DEFAULT_GEOMETRY_TOLERANCE,
) {
  const ring = polygonRing(polygon, tolerance);
  if (ring.length < 3 || footprint.centerline.length === 0) return false;

  if (footprint.centerline.some((point) => pointIsInsidePolygon(point, ring, tolerance))) return true;
  if (ring.some((point) => distanceToPath(point, footprint.centerline) <= footprint.halfWidth + tolerance)) {
    return true;
  }

  for (let centerlineIndex = 0; centerlineIndex < footprint.centerline.length - 1; centerlineIndex += 1) {
    const centerlineStart = footprint.centerline[centerlineIndex];
    const centerlineEnd = footprint.centerline[centerlineIndex + 1];
    for (let polygonIndex = 0; polygonIndex < ring.length; polygonIndex += 1) {
      const polygonStart = ring[polygonIndex];
      const polygonEnd = ring[(polygonIndex + 1) % ring.length];
      if (segmentToSegmentDistance(
        centerlineStart,
        centerlineEnd,
        polygonStart,
        polygonEnd,
        tolerance,
      ) <= footprint.halfWidth + tolerance) return true;
    }
  }
  return false;
}

export function rearRoadCorridorIntersectsPolygon(
  definition: RoadSegment,
  polygon: readonly LocalPoint[],
  options: RearRoadCorridorOptions = {},
) {
  const footprint = buildRearRoadCorridorFootprint(definition, options);
  return rearRoadFootprintIntersectsPolygon(
    footprint,
    polygon,
    options.tolerance ?? DEFAULT_GEOMETRY_TOLERANCE,
  );
}
