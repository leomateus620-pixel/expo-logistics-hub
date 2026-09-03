import * as THREE from 'three';
import {
  NE_CLOVERLEAF_BUDGET,
  NE_CLOVERLEAF_HALF_SEPARATION,
  NE_CLOVERLEAF_LAYOUT as L,
  NE_CLOVERLEAF_QUADRANTS,
  NE_CLOVERLEAF_REVISION,
  NE_CLOVERLEAF_ROUNDABOUT_CENTERS,
  NE_CLOVERLEAF_STUBS,
  type LocalPoint,
  type NeCloverleafQuadrantId,
} from '../data/neCloverleafBr344Br472';

/**
 * Isolated highway mesh for the NE cloverleaf. Ribbons, rings and the overpass
 * deck live on split elevations so they never share a coplanar slab. Ramps
 * stop on the roundabout circle; mainlines never enter the yellow disks.
 */

export interface NeCloverleafBuildOptions {
  reducedGraphics?: boolean;
}

export interface NeCloverleafGeometries {
  highway: THREE.BufferGeometry | null;
  shoulders: THREE.BufferGeometry | null;
  markings: THREE.BufferGeometry | null;
  roundabouts: THREE.BufferGeometry | null;
  islands: THREE.BufferGeometry | null;
  curbs: THREE.BufferGeometry | null;
  bridge: THREE.BufferGeometry | null;
  diagnostics: {
    revision: string;
    rampCount: number;
    roundaboutCount: number;
    stubCarriagewayCount: number;
    sampleCount: number;
    triangleCount: number;
    estimatedBaseDrawCalls: number;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    overpassClearance: number;
    withinBudget: boolean;
  };
}

const [CX, CZ] = L.centerLocal;
const HALF_SEP = NE_CLOVERLEAF_HALF_SEPARATION;
const TAU = Math.PI * 2;

interface RibbonAccumulator {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

interface ElevatedSample {
  point: LocalPoint;
  elevation: number;
}

function createAccumulator(): RibbonAccumulator {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function terrainAt(x: number, z: number) {
  return Math.sin(x * 0.075 + z * 0.043) * 0.0018
    + Math.sin(x * 0.031 - z * 0.067) * 0.0012;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function finite(point: LocalPoint) {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

/** Same micro-relief used by the rear highway ribbons, copied to stay isolated. */
export function neCloverleafSurfaceElevation(x: number, z: number, base: number) {
  return base + terrainAt(x, z);
}

/**
 * BR-344 flies over BR-472. Approaches ease down to at-grade at the stub ends
 * so Agents #1–#2 can land a flat mainline without a kink.
 */
export function neCloverleafBr344Elevation(x: number) {
  const along = Math.abs(x - CX);
  if (along <= L.overpassDeckHalfSpan) return L.overpassElevation;
  const run = L.stubLength - L.overpassDeckHalfSpan;
  if (along >= L.stubLength || run <= 1e-6) return L.atGradeElevation;
  return lerp(
    L.overpassElevation,
    L.atGradeElevation,
    smoothstep((along - L.overpassDeckHalfSpan) / run),
  );
}

export function neCloverleafBr472Elevation() {
  return L.atGradeElevation;
}

function sampleLine(from: LocalPoint, to: LocalPoint, spacing: number): LocalPoint[] {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const count = Math.max(2, Math.ceil(length / Math.max(spacing, 0.08)) + 1);
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    return [lerp(from[0], to[0], t), lerp(from[1], to[1], t)] as LocalPoint;
  });
}

function sampleArcSweep(
  center: LocalPoint,
  radius: number,
  startAngle: number,
  sweep: number,
  spacing: number,
): LocalPoint[] {
  const arcLength = Math.abs(sweep) * radius;
  const count = Math.max(5, Math.ceil(arcLength / Math.max(spacing, 0.08)) + 1);
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    const angle = startAngle + sweep * t;
    return [
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
    ] as LocalPoint;
  });
}

function trimEnds(samples: readonly LocalPoint[], startSkip: number, endSkip: number) {
  if (samples.length < 3) return [...samples];
  let start = 0;
  let travelled = 0;
  while (start < samples.length - 2 && travelled < startSkip) {
    travelled += Math.hypot(
      samples[start + 1][0] - samples[start][0],
      samples[start + 1][1] - samples[start][1],
    );
    start += 1;
  }
  let end = samples.length - 1;
  travelled = 0;
  while (end > start + 1 && travelled < endSkip) {
    travelled += Math.hypot(
      samples[end][0] - samples[end - 1][0],
      samples[end][1] - samples[end - 1][1],
    );
    end -= 1;
  }
  return samples.slice(start, end + 1);
}

function pushUpwardTriangle(
  target: RibbonAccumulator,
  i0: number,
  i1: number,
  i2: number,
) {
  const x0 = target.positions[i0 * 3];
  const z0 = target.positions[i0 * 3 + 2];
  const x1 = target.positions[i1 * 3];
  const z1 = target.positions[i1 * 3 + 2];
  const x2 = target.positions[i2 * 3];
  const z2 = target.positions[i2 * 3 + 2];
  const cross = (z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0);
  if (Math.abs(cross) < 1e-12) return;
  if (cross >= 0) target.indices.push(i0, i1, i2);
  else target.indices.push(i0, i2, i1);
}

function pushRibbon(
  target: RibbonAccumulator,
  samples: readonly ElevatedSample[],
  offsetFrom: number,
  offsetTo: number,
  uvRepeat: number,
) {
  const compact: ElevatedSample[] = [];
  samples.forEach((sample) => {
    const previous = compact[compact.length - 1];
    if (
      previous
      && Math.hypot(
        sample.point[0] - previous.point[0],
        sample.point[1] - previous.point[1],
      ) < 1e-5
    ) return;
    compact.push(sample);
  });
  if (compact.length < 2) return;
  const path = compact;
  const baseIndex = target.positions.length / 3;
  let distance = 0;

  for (let index = 0; index < path.length; index += 1) {
    const current = path[index].point;
    const previous = path[Math.max(0, index - 1)].point;
    const next = path[Math.min(path.length - 1, index + 1)].point;
    const dirX = next[0] - previous[0];
    const dirZ = next[1] - previous[1];
    const length = Math.hypot(dirX, dirZ) || 1;
    const normalX = -dirZ / length;
    const normalZ = dirX / length;
    if (index > 0) {
      distance += Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    }
    const v = distance / Math.max(uvRepeat, 0.001);
    const y = neCloverleafSurfaceElevation(current[0], current[1], path[index].elevation);
    target.positions.push(
      current[0] + normalX * offsetFrom,
      y,
      current[1] + normalZ * offsetFrom,
    );
    target.positions.push(
      current[0] + normalX * offsetTo,
      y,
      current[1] + normalZ * offsetTo,
    );
    target.normals.push(0, 1, 0, 0, 1, 0);
    target.uvs.push(0, v, 1, v);
  }

  for (let index = 0; index < path.length - 1; index += 1) {
    const a = baseIndex + index * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    pushUpwardTriangle(target, a, b, c);
    pushUpwardTriangle(target, b, d, c);
  }
}

function pushDashedRibbon(
  target: RibbonAccumulator,
  samples: readonly ElevatedSample[],
  halfThickness: number,
  dashLength: number,
  gapLength: number,
) {
  let cursor = 0;
  let run: ElevatedSample[] = [];
  const flush = () => {
    if (run.length >= 2) pushRibbon(target, run, -halfThickness, halfThickness, 1);
    run = [];
  };
  for (let index = 0; index < samples.length; index += 1) {
    if (index > 0) {
      cursor += Math.hypot(
        samples[index].point[0] - samples[index - 1].point[0],
        samples[index].point[1] - samples[index - 1].point[1],
      );
    }
    const phase = cursor % (dashLength + gapLength);
    if (phase <= dashLength) run.push(samples[index]);
    else flush();
  }
  flush();
}

function pushRing(
  target: RibbonAccumulator,
  center: LocalPoint,
  innerRadius: number,
  outerRadius: number,
  elevation: number,
  segments: number,
) {
  if (outerRadius <= innerRadius + 1e-5) return;
  const baseIndex = target.positions.length / 3;
  const y = neCloverleafSurfaceElevation(center[0], center[1], elevation);
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * TAU;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    target.positions.push(
      center[0] + cos * innerRadius,
      y,
      center[1] + sin * innerRadius,
    );
    target.positions.push(
      center[0] + cos * outerRadius,
      y,
      center[1] + sin * outerRadius,
    );
    target.normals.push(0, 1, 0, 0, 1, 0);
    target.uvs.push(index / segments, 0, index / segments, 1);
  }
  for (let index = 0; index < segments; index += 1) {
    const a = baseIndex + index * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    pushUpwardTriangle(target, a, c, b);
    pushUpwardTriangle(target, c, d, b);
  }
}

function pushDisk(
  target: RibbonAccumulator,
  center: LocalPoint,
  radius: number,
  elevation: number,
  segments: number,
) {
  const baseIndex = target.positions.length / 3;
  const y = neCloverleafSurfaceElevation(center[0], center[1], elevation);
  target.positions.push(center[0], y, center[1]);
  target.normals.push(0, 1, 0);
  target.uvs.push(0.5, 0.5);
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * TAU;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    target.positions.push(center[0] + cos * radius, y, center[1] + sin * radius);
    target.normals.push(0, 1, 0);
    target.uvs.push(0.5 + cos * 0.5, 0.5 + sin * 0.5);
    if (index > 0) target.indices.push(baseIndex, baseIndex + index + 1, baseIndex + index);
  }
}

function pushBox(
  target: RibbonAccumulator,
  cx: number,
  y: number,
  cz: number,
  width: number,
  height: number,
  depth: number,
) {
  const hx = width / 2;
  const hy = height / 2;
  const hz = depth / 2;
  const faces: number[][] = [
    [-hx, hy, -hz, hx, hy, -hz, hx, hy, hz, -hx, hy, hz],
    [-hx, -hy, -hz, -hx, -hy, hz, hx, -hy, hz, hx, -hy, -hz],
    [-hx, -hy, hz, -hx, hy, hz, hx, hy, hz, hx, -hy, hz],
    [-hx, -hy, -hz, hx, -hy, -hz, hx, hy, -hz, -hx, hy, -hz],
    [hx, -hy, -hz, hx, -hy, hz, hx, hy, hz, hx, hy, -hz],
    [-hx, -hy, -hz, -hx, hy, -hz, -hx, hy, hz, -hx, -hy, hz],
  ];
  const normals: Array<[number, number, number]> = [
    [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0],
  ];
  faces.forEach((face, faceIndex) => {
    const base = target.positions.length / 3;
    const n = normals[faceIndex];
    for (let corner = 0; corner < 4; corner += 1) {
      target.positions.push(
        cx + face[corner * 3],
        y + face[corner * 3 + 1],
        cz + face[corner * 3 + 2],
      );
      target.normals.push(...n);
      target.uvs.push(corner === 1 || corner === 2 ? 1 : 0, corner >= 2 ? 1 : 0);
    }
    // Keep the top face in the same XZ winding as the highway ribbons.
    if (faceIndex === 0) target.indices.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
    else target.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
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

function elevate(
  samples: readonly LocalPoint[],
  elevationAt: (point: LocalPoint) => number,
): ElevatedSample[] {
  return samples.filter(finite).map((point) => ({
    point,
    elevation: elevationAt(point),
  }));
}

function distanceToRoundabout(point: LocalPoint, id: NeCloverleafQuadrantId) {
  const center = NE_CLOVERLEAF_ROUNDABOUT_CENTERS[id];
  return Math.hypot(point[0] - center[0], point[1] - center[1]);
}

function clipToRoundaboutMouth(
  samples: readonly LocalPoint[],
  id: NeCloverleafQuadrantId,
  mouthRadius: number,
) {
  const clipped: LocalPoint[] = [];
  for (let index = 0; index < samples.length; index += 1) {
    const point = samples[index];
    const distance = distanceToRoundabout(point, id);
    if (distance <= mouthRadius) {
      if (clipped.length === 0) continue;
      const previous = clipped[clipped.length - 1];
      const prevDistance = distanceToRoundabout(previous, id);
      if (prevDistance > mouthRadius && Math.abs(prevDistance - distance) > 1e-8) {
        const t = (prevDistance - mouthRadius) / (prevDistance - distance);
        clipped.push([
          lerp(previous[0], point[0], t),
          lerp(previous[1], point[1], t),
        ]);
      }
      break;
    }
    clipped.push(point);
  }
  return clipped;
}

function pushCorridor(
  pavement: RibbonAccumulator,
  shoulders: RibbonAccumulator,
  markings: RibbonAccumulator,
  samples: readonly ElevatedSample[],
  width: number,
  shoulderWidth: number,
  withMarkings: boolean,
  reduced: boolean,
) {
  if (samples.length < 2) return;
  const half = width / 2;
  pushRibbon(pavement, samples, -half, half, width);
  if (shoulderWidth > 0 && !reduced) {
    const shoulderSamples = samples.map((sample) => ({
      ...sample,
      elevation: sample.elevation - L.shoulderDrop,
    }));
    pushRibbon(shoulders, shoulderSamples, -half - shoulderWidth, -half + 0.012, shoulderWidth * 2);
    pushRibbon(shoulders, shoulderSamples, half - 0.012, half + shoulderWidth, shoulderWidth * 2);
  }
  if (withMarkings && !reduced) {
    const marked = samples.map((sample) => ({
      ...sample,
      elevation: sample.elevation + L.markingLift,
    }));
    pushRibbon(markings, marked, -half + 0.07, -half + 0.135, 1);
    pushRibbon(markings, marked, half - 0.135, half - 0.07, 1);
    pushDashedRibbon(markings, marked, 0.032, 1.35, 1.85);
  }
}

function innerRampRadius() {
  return L.quadrantOffset - HALF_SEP - L.roundaboutOuterRadius;
}

function innerRamps(id: NeCloverleafQuadrantId, spacing: number) {
  const { signX, signZ } = NE_CLOVERLEAF_QUADRANTS.find((entry) => entry.id === id)!;
  const rab = NE_CLOVERLEAF_ROUNDABOUT_CENTERS[id];
  const radius = innerRampRadius();
  const mouth = L.roundaboutOuterRadius + 0.012;
  const from344 = clipToRoundaboutMouth(
    trimEnds(
      sampleArcSweep(
        [rab[0], CZ + signZ * HALF_SEP],
        radius,
        signX < 0 ? Math.PI : 0,
        (signX !== signZ ? -1 : 1) * (Math.PI / 2),
        spacing,
      ),
      L.carriagewayWidth * 0.42,
      0,
    ),
    id,
    mouth,
  );
  const from472 = clipToRoundaboutMouth(
    trimEnds(
      sampleArcSweep(
        [CX + signX * HALF_SEP, rab[1]],
        radius,
        signZ < 0 ? Math.PI * 1.5 : Math.PI / 2,
        (signX === signZ ? -1 : 1) * (Math.PI / 2),
        spacing,
      ),
      L.carriagewayWidth * 0.42,
      0,
    ),
    id,
    mouth,
  );
  return [from344, from472] as const;
}

const OUTER_LOOP = {
  nw: { start: Math.PI / 2, sweep: -Math.PI * 1.5 },
  ne: { start: Math.PI / 2, sweep: -Math.PI * 1.5 },
  se: { start: Math.PI * 1.5, sweep: Math.PI * 1.5 },
  sw: { start: Math.PI * 1.5, sweep: -Math.PI * 1.5 },
} as const;

function outerLoopCenter(id: NeCloverleafQuadrantId): LocalPoint {
  const { signX, signZ } = NE_CLOVERLEAF_QUADRANTS.find((entry) => entry.id === id)!;
  return [
    CX + signX * (HALF_SEP + L.outerLoopRadius),
    CZ + signZ * (HALF_SEP + L.outerLoopRadius),
  ];
}

function outerRamp(id: NeCloverleafQuadrantId, spacing: number) {
  const spec = OUTER_LOOP[id];
  const samples = trimEnds(
    sampleArcSweep(
      outerLoopCenter(id),
      L.outerLoopRadius,
      spec.start,
      spec.sweep,
      spacing,
    ),
    L.carriagewayWidth * 0.48,
    L.carriagewayWidth * 0.48,
  );
  return samples;
}

function rampElevation(point: LocalPoint) {
  const towardBr344 = Math.abs(point[1] - CZ);
  const towardBr472 = Math.abs(point[0] - CX);
  const mix = towardBr344 / Math.max(towardBr344 + towardBr472, 1e-4);
  const br344 = neCloverleafBr344Elevation(point[0]);
  const grade = lerp(L.atGradeElevation, br344, smoothstep(1 - mix) * 0.55);
  return grade + L.junctionLift;
}

function pushCarriagewayPair(
  pavement: RibbonAccumulator,
  shoulders: RibbonAccumulator,
  markings: RibbonAccumulator,
  axisFrom: LocalPoint,
  axisTo: LocalPoint,
  lateral: LocalPoint,
  elevationAt: (point: LocalPoint) => number,
  spacing: number,
  reduced: boolean,
) {
  const offsets = [-HALF_SEP, HALF_SEP];
  offsets.forEach((offset) => {
    const from: LocalPoint = [
      axisFrom[0] + lateral[0] * offset,
      axisFrom[1] + lateral[1] * offset,
    ];
    const to: LocalPoint = [
      axisTo[0] + lateral[0] * offset,
      axisTo[1] + lateral[1] * offset,
    ];
    pushCorridor(
      pavement,
      shoulders,
      markings,
      elevate(sampleLine(from, to, spacing), elevationAt),
      L.carriagewayWidth,
      L.shoulderWidth,
      true,
      reduced,
    );
  });
}

function triangleCount(geometry: THREE.BufferGeometry | null) {
  if (!geometry) return 0;
  return (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3;
}

function boundsOf(accumulators: readonly RibbonAccumulator[]) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  accumulators.forEach((accumulator) => {
    for (let index = 0; index < accumulator.positions.length; index += 3) {
      const x = accumulator.positions[index];
      const z = accumulator.positions[index + 2];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  });
  return { minX, maxX, minZ, maxZ };
}

export function buildNeCloverleafGeometries(
  { reducedGraphics = false }: NeCloverleafBuildOptions = {},
): NeCloverleafGeometries {
  const highway = createAccumulator();
  const shoulders = createAccumulator();
  const markings = createAccumulator();
  const roundabouts = createAccumulator();
  const islands = createAccumulator();
  const curbs = createAccumulator();
  const bridge = createAccumulator();
  const spacing = reducedGraphics ? 0.42 : 0.18;
  const circleSegments = reducedGraphics ? 28 : 48;
  let sampleCount = 0;
  let rampCount = 0;

  pushCarriagewayPair(
    highway,
    shoulders,
    markings,
    NE_CLOVERLEAF_STUBS.br472North.axis,
    NE_CLOVERLEAF_STUBS.br472South.axis,
    [1, 0],
    () => neCloverleafBr472Elevation(),
    spacing,
    reducedGraphics,
  );
  pushCarriagewayPair(
    highway,
    shoulders,
    markings,
    NE_CLOVERLEAF_STUBS.br344West.axis,
    NE_CLOVERLEAF_STUBS.br344East.axis,
    [0, 1],
    (point) => neCloverleafBr344Elevation(point[0]),
    spacing,
    reducedGraphics,
  );

  NE_CLOVERLEAF_QUADRANTS.forEach((quadrant) => {
    const [from344, from472] = innerRamps(quadrant.id, spacing);
    [from344, from472].forEach((path) => {
      sampleCount += path.length;
      rampCount += 1;
      pushCorridor(
        highway,
        shoulders,
        markings,
        elevate(path, rampElevation),
        L.innerRampWidth,
        L.innerRampShoulder,
        true,
        reducedGraphics,
      );
    });
    const loop = outerRamp(quadrant.id, spacing);
    sampleCount += loop.length;
    rampCount += 1;
    pushCorridor(
      highway,
      shoulders,
      markings,
      elevate(loop, () => L.atGradeElevation + L.junctionLift * 0.35),
      L.outerRampWidth,
      L.outerRampShoulder,
      true,
      reducedGraphics,
    );
    const center = NE_CLOVERLEAF_ROUNDABOUT_CENTERS[quadrant.id];
    const ringElevation = L.roundaboutElevation + L.junctionLift;
    pushRing(
      roundabouts,
      center,
      L.roundaboutIslandRadius + L.roundaboutCurbWidth,
      L.roundaboutOuterRadius,
      ringElevation,
      circleSegments,
    );
    pushDisk(
      islands,
      center,
      L.roundaboutIslandRadius,
      ringElevation - 0.003,
      circleSegments,
    );
    pushRing(
      curbs,
      center,
      L.roundaboutIslandRadius,
      L.roundaboutIslandRadius + L.roundaboutCurbWidth,
      ringElevation + 0.012,
      circleSegments,
    );
    if (!reducedGraphics) {
      const yieldRing = elevate(
        sampleArcSweep(
          center,
          (L.roundaboutIslandRadius + L.roundaboutOuterRadius) * 0.5,
          0,
          TAU,
          spacing * 1.4,
        ),
        () => ringElevation + L.markingLift,
      );
      pushDashedRibbon(markings, yieldRing, 0.028, 0.42, 0.3);
    }
  });

  const deckHeight = L.overpassElevation - L.atGradeElevation - L.soffitThickness * 2.4;
  if (deckHeight > 0.04) {
    const slabWidth = L.carriagewayWidth + L.shoulderWidth * 2;
    const slabLength = L.overpassDeckHalfSpan * 2 + HALF_SEP * 2;
    const slabY = L.atGradeElevation + L.soffitThickness + deckHeight / 2;
    pushBox(bridge, CX, slabY, CZ - HALF_SEP, slabLength, deckHeight, slabWidth);
    pushBox(bridge, CX, slabY, CZ + HALF_SEP, slabLength, deckHeight, slabWidth);
  }

  const geometries = {
    highway: toGeometry(highway),
    shoulders: toGeometry(shoulders),
    markings: toGeometry(markings),
    roundabouts: toGeometry(roundabouts),
    islands: toGeometry(islands),
    curbs: toGeometry(curbs),
    bridge: toGeometry(bridge),
  };
  const triangles = Object.values(geometries).reduce(
    (total, geometry) => total + triangleCount(geometry),
    0,
  );
  const drawCalls = Object.values(geometries).filter(Boolean).length;
  const bounds = boundsOf([highway, shoulders, roundabouts, islands]);

  return {
    ...geometries,
    diagnostics: {
      revision: NE_CLOVERLEAF_REVISION,
      rampCount,
      roundaboutCount: NE_CLOVERLEAF_QUADRANTS.length,
      stubCarriagewayCount: 4,
      sampleCount,
      triangleCount: triangles,
      estimatedBaseDrawCalls: drawCalls,
      bounds,
      overpassClearance: L.overpassElevation - L.atGradeElevation,
      withinBudget: triangles <= NE_CLOVERLEAF_BUDGET.maximumTriangles
        && drawCalls <= NE_CLOVERLEAF_BUDGET.maximumBaseDrawCalls,
    },
  };
}

export function disposeNeCloverleafGeometries(network: NeCloverleafGeometries | null) {
  if (!network) return;
  network.highway?.dispose();
  network.shoulders?.dispose();
  network.markings?.dispose();
  network.roundabouts?.dispose();
  network.islands?.dispose();
  network.curbs?.dispose();
  network.bridge?.dispose();
}

export function neCloverleafInnerRampRadius() {
  return innerRampRadius();
}

export function sampleNeCloverleafInnerRamp(
  id: NeCloverleafQuadrantId,
  spacing = 0.2,
) {
  return innerRamps(id, spacing);
}

export function sampleNeCloverleafOuterRamp(
  id: NeCloverleafQuadrantId,
  spacing = 0.2,
) {
  return outerRamp(id, spacing);
}
