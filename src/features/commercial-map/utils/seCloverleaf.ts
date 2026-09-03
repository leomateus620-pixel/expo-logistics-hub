import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import {
  SE_CLOVERLEAF_CENTER_LOCAL,
  SE_CLOVERLEAF_ELEVATION_BANDS,
  SE_CLOVERLEAF_JOIN_LOCAL,
  SE_CLOVERLEAF_LAYOUT as L,
  SE_CLOVERLEAF_QUADRANTS,
  SE_CLOVERLEAF_RENDER_BUDGET,
  SE_CLOVERLEAF_ROUNDABOUTS,
  seCloverleafLoopCenter,
} from '../data/seCloverleaf';
import { rearRoadTerrainElevationAt } from './rearRoadNetwork';

export interface SeCloverleafBuildOptions {
  reducedGraphics?: boolean;
}

export interface SeCloverleafGeometries {
  highway: THREE.BufferGeometry | null;
  ramps: THREE.BufferGeometry | null;
  crossing: THREE.BufferGeometry | null;
  roundabout: THREE.BufferGeometry | null;
  shoulders: THREE.BufferGeometry | null;
  markings: THREE.BufferGeometry | null;
  grass: THREE.BufferGeometry | null;
  concrete: THREE.BufferGeometry | null;
}

export interface SeCloverleafRenderModel {
  geometries: SeCloverleafGeometries;
  diagnostics: {
    loopCount: number;
    slipCount: number;
    roundaboutCount: number;
    pierCount: number;
    triangleCount: number;
    estimatedPrimaryDrawCalls: number;
    withinBudget: boolean;
    overpassClearance: number;
  };
}

type Point2 = readonly [number, number];

interface Sample {
  x: number;
  z: number;
  y: number;
}

interface Accumulator {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

const CX = SE_CLOVERLEAF_CENTER_LOCAL[0];
const CZ = SE_CLOVERLEAF_CENTER_LOCAL[1];
const EPSILON = 1e-8;

function createAccumulator(): Accumulator {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function smootherstep(value: number) {
  const x = THREE.MathUtils.clamp(value, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function longestDelta(from: number, to: number) {
  const shortest = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (Math.abs(shortest) < Math.PI - 1e-6) {
    return shortest > 0 ? shortest - Math.PI * 2 : shortest + Math.PI * 2;
  }
  return shortest;
}

function terrainY(x: number, z: number, extra = 0) {
  return L.gradeElevation + extra + rearRoadTerrainElevationAt(x, z);
}

/**
 * Perfil da BR-472 no trevo: pista ao nível até a rampa, tabuleiro sobre a
 * transversal, descida e curva larga para oeste. Nunca compartilha a cota
 * da via inferior.
 */
export function seCloverleafMainlineElevation(z: number) {
  const riseStart = CZ - L.overpassHalfSpan - L.riseLength;
  const crestStart = CZ - L.overpassHalfSpan;
  const crestEnd = CZ + L.overpassHalfSpan;
  const riseEnd = CZ + L.overpassHalfSpan + L.riseLength;
  let amount = 0;
  if (z >= crestStart && z <= crestEnd) amount = 1;
  else if (z > riseStart && z < crestStart) amount = smootherstep((z - riseStart) / L.riseLength);
  else if (z > crestEnd && z < riseEnd) amount = smootherstep(1 - (z - crestEnd) / L.riseLength);
  return L.gradeElevation + (L.overpassHeight - L.gradeElevation) * amount;
}

function sampleArc(
  center: Point2,
  radius: number,
  fromAngle: number,
  delta: number,
  steps: number,
  elevation: (x: number, z: number) => number,
): Sample[] {
  const count = Math.max(3, steps);
  return Array.from({ length: count + 1 }, (_, index) => {
    const t = index / count;
    const angle = fromAngle + delta * t;
    const x = center[0] + Math.cos(angle) * radius;
    const z = center[1] + Math.sin(angle) * radius;
    return { x, z, y: elevation(x, z) };
  });
}

function densify(points: Sample[], spacing: number): Sample[] {
  if (points.length < 2) return [...points];
  const result: Sample[] = [{ ...points[0] }];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const span = Math.hypot(current.x - previous.x, current.z - previous.z);
    const divisions = Math.max(1, Math.ceil(span / Math.max(spacing, 0.08)));
    for (let step = 1; step <= divisions; step += 1) {
      const t = step / divisions;
      result.push({
        x: previous.x + (current.x - previous.x) * t,
        z: previous.z + (current.z - previous.z) * t,
        y: previous.y + (current.y - previous.y) * t,
      });
    }
  }
  return result;
}

function pushRibbon(
  target: Accumulator,
  samples: readonly Sample[],
  offsetFrom: number,
  offsetTo: number,
  uvRepeat: number,
  yBias = 0,
) {
  if (samples.length < 2) return;
  const baseIndex = target.positions.length / 3;
  let distance = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    const previous = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    const dirX = next.x - previous.x;
    const dirZ = next.z - previous.z;
    const length = Math.hypot(dirX, dirZ) || 1;
    const normalX = -dirZ / length;
    const normalZ = dirX / length;
    if (index > 0) distance += Math.hypot(current.x - previous.x, current.z - previous.z);
    const v = distance / Math.max(uvRepeat, 0.001);
    const y = current.y + yBias;
    target.positions.push(
      current.x + normalX * offsetFrom, y, current.z + normalZ * offsetFrom,
      current.x + normalX * offsetTo, y, current.z + normalZ * offsetTo,
    );
    target.normals.push(0, 1, 0, 0, 1, 0);
    target.uvs.push(0, v, 1, v);
  }
  for (let index = 0; index < samples.length - 1; index += 1) {
    const a = baseIndex + index * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    target.indices.push(a, b, c, b, d, c);
  }
}

function pushDashed(
  target: Accumulator,
  samples: readonly Sample[],
  offset: number,
  halfThickness: number,
  dash: number,
  gap: number,
  yBias: number,
) {
  let cursor = 0;
  let run: Sample[] = [];
  const flush = () => {
    if (run.length >= 2) pushRibbon(target, run, -halfThickness + offset, halfThickness + offset, 1, yBias);
    run = [];
  };
  for (let index = 0; index < samples.length; index += 1) {
    if (index > 0) {
      cursor += Math.hypot(
        samples[index].x - samples[index - 1].x,
        samples[index].z - samples[index - 1].z,
      );
    }
    const phase = cursor % (dash + gap);
    if (phase <= dash) run.push(samples[index]);
    else flush();
  }
  flush();
}

function toGeometry(accumulator: Accumulator) {
  if (accumulator.indices.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(accumulator.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(accumulator.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(accumulator.uvs, 2));
  geometry.setIndex(accumulator.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function mergeAndDispose(geometries: Array<THREE.BufferGeometry | null>) {
  const valid = geometries.filter((geometry): geometry is THREE.BufferGeometry => Boolean(geometry));
  if (!valid.length) return null;
  const indexedCount = valid.filter((geometry) => geometry.index !== null).length;
  const normalized = indexedCount > 0 && indexedCount < valid.length
    ? valid.map((geometry) => (geometry.index ? geometry.toNonIndexed() : geometry))
    : valid;
  const merged = mergeBufferGeometries(normalized, false);
  normalized.forEach((geometry) => {
    if (!valid.includes(geometry)) geometry.dispose();
  });
  valid.forEach((geometry) => geometry.dispose());
  if (!merged) return null;
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function triangleCount(geometry: THREE.BufferGeometry | null) {
  if (!geometry) return 0;
  return (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3;
}

function ringGeometry(
  innerRadius: number,
  outerRadius: number,
  segments: number,
  center: Point2,
  elevation: number,
) {
  if (outerRadius <= innerRadius + EPSILON) return null;
  const geometry = new THREE.RingGeometry(innerRadius, outerRadius, segments, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(center[0], elevation, center[1]);
  return geometry;
}

function circleGeometry(radius: number, segments: number, center: Point2, elevation: number) {
  if (radius <= EPSILON) return null;
  const geometry = new THREE.CircleGeometry(radius, segments, 0, Math.PI * 2);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(center[0], elevation, center[1]);
  return geometry;
}

function raisedRing(
  innerRadius: number,
  outerRadius: number,
  height: number,
  segments: number,
  center: Point2,
  baseElevation: number,
) {
  if (outerRadius <= innerRadius + EPSILON || height <= 0) return null;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: segments,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(center[0], baseElevation, center[1]);
  return geometry;
}

function boxAt(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  rotationY = 0,
) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  if (rotationY) geometry.rotateY(rotationY);
  geometry.translate(x, y, z);
  return geometry;
}

function mainlinePath(spacing: number): Sample[] {
  const riseEnd = CZ + L.overpassHalfSpan + L.riseLength;
  const turnStartZ = Math.max(riseEnd + 0.35, CZ + L.westTurnStartOffset);
  const southZ = Math.max(turnStartZ, CZ + L.slipRadius * 0.42);
  const straight: Sample[] = [];
  const startZ = SE_CLOVERLEAF_JOIN_LOCAL[1];
  const northCount = Math.max(8, Math.ceil((southZ - startZ) / spacing));
  for (let index = 0; index <= northCount; index += 1) {
    const z = startZ + (southZ - startZ) * (index / northCount);
    straight.push({ x: CX, z, y: seCloverleafMainlineElevation(z) });
  }
  const turn = sampleArc(
    [CX - L.westTurnRadius, southZ],
    L.westTurnRadius,
    0,
    Math.PI / 2,
    Math.max(10, Math.ceil((L.westTurnRadius * Math.PI) / 2 / spacing)),
    (x, z) => terrainY(x, z),
  );
  const westZ = southZ + L.westTurnRadius;
  const westEndX = CX - L.westTurnRadius - L.westExtension;
  const west: Sample[] = [];
  const westCount = Math.max(6, Math.ceil(L.westExtension / spacing));
  for (let index = 1; index <= westCount; index += 1) {
    const x = CX - L.westTurnRadius - L.westExtension * (index / westCount);
    west.push({ x, z: westZ, y: terrainY(x, westZ) });
  }
  return densify([...straight, ...turn.slice(1), ...west], spacing);
}

function crossingSegments(spacing: number): Sample[][] {
  const west = SE_CLOVERLEAF_ROUNDABOUTS.west;
  const east = SE_CLOVERLEAF_ROUNDABOUTS.east;
  const outer = L.roundaboutOuterRadius;
  const westEnd = west[0] - outer - 7.4;
  const eastEnd = east[0] + outer + 7.4;
  const build = (x0: number, x1: number) => {
    const count = Math.max(4, Math.ceil(Math.abs(x1 - x0) / spacing));
    return Array.from({ length: count + 1 }, (_, index) => {
      const x = x0 + (x1 - x0) * (index / count);
      return { x, z: CZ, y: terrainY(x, CZ) };
    });
  };
  return [
    build(westEnd, west[0] - outer + 0.04),
    build(west[0] + outer - 0.04, east[0] - outer + 0.04),
    build(east[0] + outer - 0.04, eastEnd),
  ];
}

function loopPath(sx: number, sz: number, steps: number): Sample[] {
  const loopCenter = seCloverleafLoopCenter(sx, sz);
  const rab = sx > 0 ? SE_CLOVERLEAF_ROUNDABOUTS.east : SE_CLOVERLEAF_ROUNDABOUTS.west;
  const from = Math.atan2(0, CX - loopCenter[0]);
  const to = Math.atan2(rab[1] - loopCenter[1], rab[0] - loopCenter[0]);
  const delta = longestDelta(from, to);
  const samples = sampleArc(
    loopCenter,
    L.loopRadius,
    from,
    delta,
    steps,
    (x, z) => terrainY(x, z),
  );
  const rabKeep = L.roundaboutOuterRadius - 0.02;
  const highwayKeep = L.highwayWidth / 2 + 0.12;
  const petal = samples.filter((sample) => (
    Math.hypot(sample.x - rab[0], sample.z - rab[1]) > rabKeep
    && Math.abs(sample.x - CX) > highwayKeep
  ));
  const mergeZ = CZ + sz * (L.overpassHalfSpan + L.riseLength * 0.42);
  const mergeX = CX + sx * (L.highwayWidth / 2 + L.rampWidth * 0.52);
  const merge: Sample = { x: mergeX, z: mergeZ, y: seCloverleafMainlineElevation(mergeZ) };
  const tip = petal[petal.length - 1] ?? merge;
  const towardX = tip.x - rab[0];
  const towardZ = tip.z - rab[1];
  const toward = Math.hypot(towardX, towardZ) || 1;
  const rabJoin: Sample = {
    x: rab[0] + (towardX / toward) * (L.roundaboutOuterRadius - 0.04),
    z: rab[1] + (towardZ / toward) * (L.roundaboutOuterRadius - 0.04),
    y: terrainY(
      rab[0] + (towardX / toward) * (L.roundaboutOuterRadius - 0.04),
      rab[1] + (towardZ / toward) * (L.roundaboutOuterRadius - 0.04),
    ),
  };
  return densify([merge, ...petal, rabJoin], 0.38);
}

function quadraticBezier(start: Sample, control: Sample, end: Sample, steps: number): Sample[] {
  return Array.from({ length: Math.max(4, steps) + 1 }, (_, index) => {
    const t = index / Math.max(4, steps);
    const u = 1 - t;
    const x = u * u * start.x + 2 * u * t * control.x + t * t * end.x;
    const z = u * u * start.z + 2 * u * t * control.z + t * t * end.z;
    return { x, z, y: start.y * u * u + control.y * 2 * u * t + end.y * t * t };
  });
}

function slipPath(sx: number, sz: number, steps: number): Sample[] {
  const start: Sample = {
    x: CX + sx * (L.highwayWidth / 2 + L.rampWidth * 0.52),
    z: CZ + sz * (L.loopOffset + L.loopRadius + 1.85),
    y: 0,
  };
  start.y = seCloverleafMainlineElevation(start.z);
  const control: Sample = {
    x: CX + sx * (L.loopOffset + L.loopRadius + 2.85),
    z: CZ + sz * (L.loopOffset + L.loopRadius + 2.85),
    y: 0,
  };
  control.y = terrainY(control.x, control.z);
  const end: Sample = {
    x: CX + sx * (L.roundaboutOffset + L.roundaboutOuterRadius + 1.15),
    z: CZ + sz * (L.crossingWidth / 2 + L.rampWidth * 0.55),
    y: 0,
  };
  end.y = terrainY(end.x, end.z);
  const rab = sx > 0 ? SE_CLOVERLEAF_ROUNDABOUTS.east : SE_CLOVERLEAF_ROUNDABOUTS.west;
  return quadraticBezier(start, control, end, steps).filter((sample) => (
    Math.hypot(sample.x - rab[0], sample.z - rab[1]) > L.roundaboutOuterRadius - 0.05
  ));
}

function circleSamples(center: Point2, radius: number, segments: number, y: number): Sample[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return {
      x: center[0] + Math.cos(angle) * radius,
      z: center[1] + Math.sin(angle) * radius,
      y,
    };
  });
}

function pavement(
  target: Accumulator,
  samples: readonly Sample[],
  width: number,
  shoulderTarget: Accumulator | null,
  shoulderWidth: number,
  markingTarget: Accumulator | null,
  style: 'highway' | 'ramp' | 'none',
  reduced: boolean,
) {
  if (samples.length < 2) return;
  const half = width / 2;
  pushRibbon(target, samples, -half, half, Math.max(0.8, width));
  if (shoulderTarget && shoulderWidth > 0 && !reduced) {
    pushRibbon(shoulderTarget, samples, -half - shoulderWidth, -half + 0.012, shoulderWidth * 2, -L.shoulderDrop);
    pushRibbon(shoulderTarget, samples, half - 0.012, half + shoulderWidth, shoulderWidth * 2, -L.shoulderDrop);
  }
  if (markingTarget && style !== 'none' && !reduced) {
    const lift = L.markingLift;
    if (style === 'highway') {
      pushDashed(markingTarget, samples, 0, 0.032, 1.55, 2.35, lift);
      pushRibbon(markingTarget, samples, -half + 0.07, -half + 0.135, 1, lift);
      pushRibbon(markingTarget, samples, half - 0.135, half - 0.07, 1, lift);
    } else {
      pushRibbon(markingTarget, samples, -half + 0.05, -half + 0.1, 1, lift);
      pushRibbon(markingTarget, samples, half - 0.1, half - 0.05, 1, lift);
    }
  }
}

function buildOverpassStructure(reduced: boolean) {
  const span = L.overpassHalfSpan * 2 + 0.55;
  const deckWidth = L.highwayWidth + L.highwayShoulder * 2 + 0.22;
  const soffit = SE_CLOVERLEAF_ELEVATION_BANDS.deckSoffit;
  const deck = boxAt(
    deckWidth,
    L.deckThickness,
    span,
    CX,
    soffit + L.deckThickness / 2 - 0.012,
    CZ,
  );
  const barrierHeight = 0.11;
  const barrierWidth = 0.045;
  const left = boxAt(
    barrierWidth,
    barrierHeight,
    span - 0.2,
    CX - deckWidth / 2 + barrierWidth * 0.4,
    L.overpassHeight + barrierHeight / 2,
    CZ,
  );
  const right = boxAt(
    barrierWidth,
    barrierHeight,
    span - 0.2,
    CX + deckWidth / 2 - barrierWidth * 0.4,
    L.overpassHeight + barrierHeight / 2,
    CZ,
  );
  const abutmentDepth = 0.55;
  const northAbutment = boxAt(
    deckWidth + 0.18,
    L.overpassHeight * 0.42,
    abutmentDepth,
    CX,
    L.gradeElevation + L.overpassHeight * 0.21,
    CZ - L.overpassHalfSpan - 0.08,
  );
  const southAbutment = boxAt(
    deckWidth + 0.18,
    L.overpassHeight * 0.42,
    abutmentDepth,
    CX,
    L.gradeElevation + L.overpassHeight * 0.21,
    CZ + L.overpassHalfSpan + 0.08,
  );
  const pierRadius = 0.13;
  const pierHeight = soffit - 0.02 - L.gradeElevation;
  const pierSegments = reduced ? 6 : 10;
  const pierOffsets: Array<readonly [number, number]> = [
    [-0.42, -2.35],
    [0.42, -2.35],
    [-0.42, 2.35],
    [0.42, 2.35],
  ];
  const piers = pierOffsets.map(([dx, dz]) => {
    const geometry = new THREE.CylinderGeometry(pierRadius, pierRadius * 1.12, pierHeight, pierSegments);
    geometry.translate(CX + dx, L.gradeElevation + pierHeight / 2, CZ + dz);
    return geometry;
  });
  const cap = pierOffsets.map(([dx, dz]) => boxAt(
    0.42,
    0.07,
    0.42,
    CX + dx,
    soffit - 0.04,
    CZ + dz,
  ));
  return {
    geometries: [deck, left, right, northAbutment, southAbutment, ...piers, ...cap],
    pierCount: piers.length,
  };
}

export function buildSeCloverleafRenderModel(
  { reducedGraphics = false }: SeCloverleafBuildOptions = {},
): SeCloverleafRenderModel {
  const spacing = reducedGraphics ? 0.72 : 0.34;
  const arcSteps = reducedGraphics ? 18 : 36;
  const circleSegments = reducedGraphics ? 20 : 40;
  const highway = createAccumulator();
  const ramps = createAccumulator();
  const crossing = createAccumulator();
  const shoulders = createAccumulator();
  const markings = createAccumulator();
  const grassParts: Array<THREE.BufferGeometry | null> = [];
  const roundaboutParts: Array<THREE.BufferGeometry | null> = [];
  const concreteParts: Array<THREE.BufferGeometry | null> = [];

  const mainline = mainlinePath(spacing);
  pavement(
    highway,
    mainline,
    L.highwayWidth,
    shoulders,
    L.highwayShoulder,
    markings,
    'highway',
    reducedGraphics,
  );

  SE_CLOVERLEAF_QUADRANTS.forEach((quadrant) => {
    const loop = loopPath(quadrant.sx, quadrant.sz, arcSteps);
    pavement(ramps, loop, L.rampWidth, shoulders, L.highwayShoulder * 0.55, markings, 'ramp', reducedGraphics);
    const slip = slipPath(quadrant.sx, quadrant.sz, Math.max(10, Math.ceil(arcSteps * 0.7)));
    pavement(ramps, slip, L.rampWidth, shoulders, L.highwayShoulder * 0.45, markings, 'ramp', reducedGraphics);
    const loopCenter = seCloverleafLoopCenter(quadrant.sx, quadrant.sz);
    grassParts.push(circleGeometry(
      Math.max(0.45, L.loopRadius - L.rampWidth * 0.52),
      circleSegments,
      loopCenter,
      SE_CLOVERLEAF_ELEVATION_BANDS.grass + 0.004,
    ));
  });

  crossingSegments(spacing).forEach((segment) => {
    pavement(
      crossing,
      segment,
      L.crossingWidth,
      shoulders,
      L.highwayShoulder * 0.4,
      markings,
      'ramp',
      reducedGraphics,
    );
  });

  const rabYellowY = SE_CLOVERLEAF_ELEVATION_BANDS.roundabout;
  const rabIslandY = SE_CLOVERLEAF_ELEVATION_BANDS.island;
  ([SE_CLOVERLEAF_ROUNDABOUTS.west, SE_CLOVERLEAF_ROUNDABOUTS.east] as const).forEach((center) => {
    roundaboutParts.push(ringGeometry(
      L.roundaboutIslandRadius + L.roundaboutCurbWidth,
      L.roundaboutOuterRadius,
      circleSegments,
      center,
      rabYellowY,
    ));
    grassParts.push(circleGeometry(
      L.roundaboutIslandRadius,
      circleSegments,
      center,
      rabIslandY + 0.003,
    ));
    concreteParts.push(raisedRing(
      L.roundaboutIslandRadius,
      L.roundaboutIslandRadius + L.roundaboutCurbWidth,
      0.045,
      circleSegments,
      center,
      rabYellowY,
    ));
    if (!reducedGraphics) {
      const divider = L.roundaboutIslandRadius + L.roundaboutCurbWidth
        + (L.roundaboutOuterRadius - L.roundaboutIslandRadius - L.roundaboutCurbWidth) * 0.52;
      pushRibbon(
        markings,
        circleSamples(center, divider, circleSegments, rabYellowY + 0.004),
        -0.028,
        0.028,
        1,
      );
    }
  });

  const padRadius = L.slipRadius - 0.38;
  grassParts.push(circleGeometry(padRadius, reducedGraphics ? 24 : 48, [CX, CZ], SE_CLOVERLEAF_ELEVATION_BANDS.grass));
  const westZ = CZ + L.westTurnStartOffset + L.westTurnRadius;
  const westLength = L.westTurnRadius + L.westExtension;
  grassParts.push(boxAt(
    westLength + 3.2,
    0.008,
    L.highwayWidth + L.highwayShoulder * 2 + 3.4,
    CX - L.westTurnRadius - L.westExtension / 2,
    SE_CLOVERLEAF_ELEVATION_BANDS.grass + 0.004,
    westZ,
  ));

  const overpass = buildOverpassStructure(reducedGraphics);
  concreteParts.push(...overpass.geometries);

  const geometries: SeCloverleafGeometries = {
    highway: toGeometry(highway),
    ramps: toGeometry(ramps),
    crossing: toGeometry(crossing),
    roundabout: mergeAndDispose(roundaboutParts),
    shoulders: toGeometry(shoulders),
    markings: toGeometry(markings),
    grass: mergeAndDispose(grassParts),
    concrete: mergeAndDispose(concreteParts),
  };

  const triangles = Object.values(geometries).reduce((total, geometry) => total + triangleCount(geometry), 0);
  const drawCalls = Object.values(geometries).filter(Boolean).length;
  const budget = reducedGraphics
    ? SE_CLOVERLEAF_RENDER_BUDGET.maximumReducedTriangles
    : SE_CLOVERLEAF_RENDER_BUDGET.maximumTriangles;

  return {
    geometries,
    diagnostics: {
      loopCount: SE_CLOVERLEAF_QUADRANTS.length,
      slipCount: SE_CLOVERLEAF_QUADRANTS.length,
      roundaboutCount: 2,
      pierCount: overpass.pierCount,
      triangleCount: triangles,
      estimatedPrimaryDrawCalls: drawCalls,
      withinBudget: triangles <= budget && drawCalls <= SE_CLOVERLEAF_RENDER_BUDGET.maximumPrimaryDrawCalls,
      overpassClearance: SE_CLOVERLEAF_ELEVATION_BANDS.deckSoffit - L.gradeElevation,
    },
  };
}

export function disposeSeCloverleafRenderModel(model: SeCloverleafRenderModel) {
  Object.values(model.geometries).forEach((geometry) => geometry?.dispose());
}

export function seCloverleafLoopCenters() {
  return SE_CLOVERLEAF_QUADRANTS.map((quadrant) => seCloverleafLoopCenter(quadrant.sx, quadrant.sz));
}

export function seCloverleafWestTerminus(): Point2 {
  return [
    CX - L.westTurnRadius - L.westExtension,
    CZ + L.westTurnStartOffset + L.westTurnRadius,
  ];
}

export function pointIsOnSeCloverleafHighway(point: Point2, tolerance = L.highwayWidth) {
  const [x, z] = point;
  if (Math.abs(x - CX) <= tolerance && z >= SE_CLOVERLEAF_JOIN_LOCAL[1] - 0.2 && z <= CZ + L.slipRadius + 1) {
    return true;
  }
  const westZ = CZ + L.westTurnStartOffset + L.westTurnRadius;
  const westX = CX - L.westTurnRadius - L.westExtension;
  return Math.abs(z - westZ) <= tolerance && x <= CX - L.westTurnRadius + 0.4 && x >= westX - 0.2;
}
