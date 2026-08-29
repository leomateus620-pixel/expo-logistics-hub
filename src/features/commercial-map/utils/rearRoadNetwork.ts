import * as THREE from 'three';
import {
  REAR_PARK_ROAD_NETWORK,
  rearRoadLocalPath,
  rearRoadLocalShoulderWidth,
  rearRoadLocalWidth,
  type LocalPoint,
  type RearRoadDefinition,
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
    sampleCount: number;
    triangleCount: number;
    estimatedBaseDrawCalls: number;
  };
}

export const REAR_ROAD_BUDGET = Object.freeze({
  maximumBaseDrawCalls: 4,
  maximumTriangles: 24_000,
});

function catmullRom(
  p0: LocalPoint,
  p1: LocalPoint,
  p2: LocalPoint,
  p3: LocalPoint,
  t: number,
): LocalPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  const compute = (a: number, b: number, c: number, d: number) => 0.5 * (
    2 * b
    + (-a + c) * t
    + (2 * a - 5 * b + 4 * c - d) * t2
    + (-a + 3 * b - 3 * c + d) * t3
  );
  return [compute(p0[0], p1[0], p2[0], p3[0]), compute(p0[1], p1[1], p2[1], p3[1])];
}

/** Amostra contínua do eixo: curvas suaves, sem quinas nas junções. */
export function sampleRearRoadCenterline(
  path: readonly LocalPoint[],
  segmentsPerSpan: number,
): LocalPoint[] {
  if (path.length < 2) return [...path];
  const spans = Math.max(1, Math.round(segmentsPerSpan));
  const samples: LocalPoint[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const p0 = path[Math.max(0, index - 1)];
    const p1 = path[index];
    const p2 = path[index + 1];
    const p3 = path[Math.min(path.length - 1, index + 2)];
    const last = index === path.length - 2;
    const steps = last ? spans : spans - 1;
    for (let step = 0; step <= steps; step += 1) {
      samples.push(catmullRom(p0, p1, p2, p3, step / spans));
    }
  }
  return samples;
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

    target.positions.push(
      current[0] + normalX * offsetFrom,
      elevation,
      current[1] + normalZ * offsetFrom,
    );
    target.positions.push(
      current[0] + normalX * offsetTo,
      elevation,
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
  definitions: readonly RearRoadDefinition[] = REAR_PARK_ROAD_NETWORK,
  { reducedGraphics = false }: RearRoadNetworkBuildOptions = {},
): RearRoadNetworkGeometries {
  const highway = createAccumulator();
  const parkAsphalt = createAccumulator();
  const shoulders = createAccumulator();
  const markings = createAccumulator();
  const segmentsPerSpan = reducedGraphics ? 5 : 12;

  let sampleCount = 0;
  let highwayCount = 0;
  let accessCount = 0;
  let internalCount = 0;

  definitions.forEach((definition) => {
    const samples = sampleRearRoadCenterline(rearRoadLocalPath(definition), segmentsPerSpan);
    sampleCount += samples.length;
    if (definition.category === 'HIGHWAY') highwayCount += 1;
    else if (definition.category === 'PARK_ACCESS') accessCount += 1;
    else internalCount += 1;

    const halfWidth = rearRoadLocalWidth(definition) / 2;
    const shoulderWidth = rearRoadLocalShoulderWidth(definition);
    const pavement = definition.surface === 'HIGHWAY_ASPHALT' ? highway : parkAsphalt;

    pushRibbon(pavement, samples, -halfWidth, halfWidth, definition.elevation, halfWidth * 2);

    if (shoulderWidth > 0 && !reducedGraphics) {
      const shoulderElevation = definition.elevation - 0.006;
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

    if (definition.marking !== 'NONE' && !reducedGraphics) {
      const markingElevation = definition.elevation + 0.004;
      if (definition.marking === 'HIGHWAY') {
        pushDashedLine(markings, samples, 0, 0.035, markingElevation, 1.6, 2.4);
        pushRibbon(markings, samples, -halfWidth + 0.08, -halfWidth + 0.15, markingElevation, 1);
        pushRibbon(markings, samples, halfWidth - 0.15, halfWidth - 0.08, markingElevation, 1);
      } else {
        pushDashedLine(markings, samples, 0, 0.028, markingElevation, 1.1, 1.9);
      }
    }
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
      roadCount: definitions.length,
      highwayCount,
      accessCount,
      internalCount,
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
