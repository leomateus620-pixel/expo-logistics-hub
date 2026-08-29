import * as THREE from 'three';
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

export const REAR_ROAD_BUDGET = Object.freeze({
  maximumBaseDrawCalls: 4,
  maximumTriangles: 24_000,
});

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
    target.indices.push(a, c, b, b, c, d);
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
    if (index > 0) target.indices.push(baseIndex, baseIndex + index, baseIndex + index + 1);
  }
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
    if (roads.length < 2) return;
    const node = REAR_ROAD_NODES[nodeId];
    const center: LocalPoint = [node.position[0], node.position[2]];
    const parkRoad = roads.find((road) => road.materialId === 'park-asphalt');
    const radius = Math.max(...roads.map((road) => road.width / 2));
    const elevation = Math.max(...roads.map((road) => road.elevationOffset));
    pushRoundJunction(parkRoad ? parkAsphalt : highway, center, radius, elevation, reducedGraphics ? 8 : 16);
    junctionCount += 1;
  });

  const geometries = {
    highway: toGeometry(highway),
    parkAsphalt: toGeometry(parkAsphalt),
    shoulders: toGeometry(shoulders),
    markings: toGeometry(markings),
  };

  const triangleCount = [highway, parkAsphalt, shoulders, markings]
    .reduce((total, accumulator) => total + accumulator.indices.length / 3, 0);

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
