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
  seCloverleafEwMergeOffset,
  seCloverleafLoopCenter,
  seCloverleafNsMergeOffset,
} from '../data/seCloverleaf';
import { rearRoadTerrainElevationAt } from './rearRoadNetwork';
import {
  accumulatorToGeometry,
  createRibbonAccumulator,
  elevatePoints,
  maxHeadingJump,
  pushBox,
  pushDashedRibbon,
  pushRibbon,
  sampleArc2,
  sampleCloverleafLoopXY,
  sampleCloverleafOuterSlipXY,
  sampleLine2,
  smootherstep,
  triangleCount,
  type ElevatedSample,
  type Point2,
  type RibbonAccumulator,
} from './cloverleafRibbon';

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

const CX = SE_CLOVERLEAF_CENTER_LOCAL[0];
const CZ = SE_CLOVERLEAF_CENTER_LOCAL[1];
const EPSILON = 1e-8;

function terrainY(x: number, z: number, extra = 0) {
  return L.gradeElevation + extra + rearRoadTerrainElevationAt(x, z);
}

export function seCloverleafMainlineElevation(z: number) {
  const riseStart = CZ - L.overpassHalfSpan - L.riseLength;
  const crestStart = CZ - L.overpassHalfSpan;
  const crestEnd = CZ + L.overpassHalfSpan;
  let amount = 0;
  if (z >= crestStart && z <= crestEnd) amount = 1;
  else if (z > riseStart && z < crestStart) amount = smootherstep((z - riseStart) / L.riseLength);
  else if (z > crestEnd && z < crestEnd + L.riseLength) {
    amount = smootherstep(1 - (z - crestEnd) / L.riseLength);
  }
  return L.gradeElevation + (L.overpassHeight - L.gradeElevation) * amount;
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

function mainlinePath(spacing: number): ElevatedSample[] {
  const turnStartZ = CZ + L.westTurnStartOffset;
  const startZ = SE_CLOVERLEAF_JOIN_LOCAL[1];
  const north = sampleLine2([CX, startZ], [CX, turnStartZ], spacing);
  const turn = sampleArc2(
    [CX - L.westTurnRadius, turnStartZ],
    L.westTurnRadius,
    0,
    Math.PI / 2,
    spacing,
  );
  const westZ = turnStartZ + L.westTurnRadius;
  const westEndX = CX - L.westTurnRadius - L.westExtension;
  const west = sampleLine2(
    [CX - L.westTurnRadius, westZ],
    [westEndX, westZ],
    spacing,
  );
  const points = [...north, ...turn.slice(1), ...west.slice(1)];
  return elevatePoints(points, (x, z) => {
    if (Math.abs(x - CX) < L.highwayWidth) return seCloverleafMainlineElevation(z);
    return terrainY(x, z);
  });
}

function crossingSegments(spacing: number): ElevatedSample[][] {
  const west = SE_CLOVERLEAF_ROUNDABOUTS.west;
  const east = SE_CLOVERLEAF_ROUNDABOUTS.east;
  const outer = L.roundaboutOuterRadius;
  const westEnd = west[0] - outer - 8.2;
  const eastEnd = east[0] + outer + 8.2;
  const build = (x0: number, x1: number) => elevatePoints(
    sampleLine2([x0, CZ], [x1, CZ], spacing),
    (x, z) => terrainY(x, z),
  );
  return [
    build(westEnd, west[0] - outer + 0.03),
    build(west[0] + outer - 0.03, east[0] - outer + 0.03),
    build(east[0] + outer - 0.03, eastEnd),
  ];
}

export function sampleSeCloverleafLoop(sx: number, sz: number, spacing = 0.16) {
  return sampleCloverleafLoopXY(
    [CX, CZ],
    sx,
    sz,
    seCloverleafNsMergeOffset(),
    seCloverleafEwMergeOffset(),
    L.loopRadius,
    spacing,
    L.goreLength,
  );
}

export function sampleSeCloverleafSlip(sx: number, sz: number, spacing = 0.16) {
  return sampleCloverleafOuterSlipXY(
    [CX, CZ],
    sx,
    sz,
    seCloverleafNsMergeOffset(),
    seCloverleafEwMergeOffset(),
    L.loopRadius,
    spacing,
  );
}

function pavement(
  target: RibbonAccumulator,
  samples: readonly ElevatedSample[],
  width: number,
  shoulderTarget: RibbonAccumulator | null,
  shoulderWidth: number,
  markingTarget: RibbonAccumulator | null,
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
    pushRibbon(markingTarget, samples, -half + 0.04, -half + 0.04 + 0.055, 1, lift);
    pushRibbon(markingTarget, samples, half - 0.04 - 0.055, half - 0.04, 1, lift);
    if (style === 'highway') {
      pushDashedRibbon(markingTarget, samples, 0, 0.03, 1.55, 2.35, lift);
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
    [-0.38, -2.05],
    [0.38, -2.05],
    [-0.38, 2.05],
    [0.38, 2.05],
  ];
  const piers = pierOffsets.map(([dx, dz]) => {
    const geometry = new THREE.CylinderGeometry(pierRadius, pierRadius * 1.12, pierHeight, pierSegments);
    geometry.translate(CX + dx, L.gradeElevation + pierHeight / 2, CZ + dz);
    return geometry;
  });
  const cap = pierOffsets.map(([dx, dz]) => boxAt(
    0.4,
    0.07,
    0.4,
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
  const spacing = reducedGraphics ? 0.58 : 0.14;
  const circleSegments = reducedGraphics ? 22 : 48;
  const highway = createRibbonAccumulator();
  const ramps = createRibbonAccumulator();
  const crossing = createRibbonAccumulator();
  const shoulders = createRibbonAccumulator();
  const markings = createRibbonAccumulator();
  const grassParts: Array<THREE.BufferGeometry | null> = [];
  const roundaboutParts: Array<THREE.BufferGeometry | null> = [];
  const concreteParts: Array<THREE.BufferGeometry | null> = [];

  pavement(
    highway,
    mainlinePath(spacing),
    L.highwayWidth,
    shoulders,
    L.highwayShoulder,
    markings,
    'highway',
    reducedGraphics,
  );

  SE_CLOVERLEAF_QUADRANTS.forEach((quadrant) => {
    const loop = elevatePoints(
      sampleSeCloverleafLoop(quadrant.sx, quadrant.sz, spacing),
      (x, z) => terrainY(x, z),
    );
    const slip = elevatePoints(
      sampleSeCloverleafSlip(quadrant.sx, quadrant.sz, spacing),
      (x, z) => terrainY(x, z),
    );
    pavement(ramps, loop, L.rampWidth, shoulders, L.highwayShoulder * 0.55, markings, 'ramp', reducedGraphics);
    pavement(ramps, slip, L.rampWidth, shoulders, L.highwayShoulder * 0.45, markings, 'ramp', reducedGraphics);
    const loopCenter = seCloverleafLoopCenter(quadrant.sx, quadrant.sz);
    grassParts.push(circleGeometry(
      Math.max(0.5, L.loopRadius - L.rampWidth * 0.52),
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
  });

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
    highway: accumulatorToGeometry(highway),
    ramps: accumulatorToGeometry(ramps),
    crossing: accumulatorToGeometry(crossing),
    roundabout: mergeAndDispose(roundaboutParts),
    shoulders: accumulatorToGeometry(shoulders),
    markings: accumulatorToGeometry(markings),
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

export function seCloverleafRampSmoothness(sx: number, sz: number) {
  return Math.max(
    maxHeadingJump(sampleSeCloverleafLoop(sx, sz, 0.14)),
    maxHeadingJump(sampleSeCloverleafSlip(sx, sz, 0.14)),
  );
}

export function pointIsOnSeCloverleafHighway(point: Point2, tolerance = L.highwayWidth) {
  const [x, z] = point;
  if (Math.abs(x - CX) <= tolerance && z >= SE_CLOVERLEAF_JOIN_LOCAL[1] - 0.2 && z <= CZ + L.westTurnStartOffset + 0.4) {
    return true;
  }
  const westZ = CZ + L.westTurnStartOffset + L.westTurnRadius;
  const westX = CX - L.westTurnRadius - L.westExtension;
  return Math.abs(z - westZ) <= tolerance && x <= CX - L.westTurnRadius + 0.4 && x >= westX - 0.2;
}
