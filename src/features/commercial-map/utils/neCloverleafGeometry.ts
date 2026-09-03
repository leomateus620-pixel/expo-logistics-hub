import * as THREE from 'three';
import {
  NE_CLOVERLEAF_BUDGET,
  NE_CLOVERLEAF_HALF_SEPARATION,
  NE_CLOVERLEAF_LAYOUT as L,
  NE_CLOVERLEAF_QUADRANTS,
  NE_CLOVERLEAF_REVISION,
  NE_CLOVERLEAF_ROUNDABOUT_CENTERS,
  NE_CLOVERLEAF_STUBS,
  neCloverleafLoopCenter,
  neCloverleafMergeOffset,
  type LocalPoint,
  type NeCloverleafQuadrantId,
} from '../data/neCloverleafBr344Br472';
import {
  accumulatorToGeometry,
  createRibbonAccumulator,
  elevatePoints,
  geometryBounds,
  lerp,
  maxHeadingJump,
  pushBox,
  pushDashedRibbon,
  pushDisk,
  pushRibbon,
  pushRing,
  sampleCloverleafLoop,
  sampleCloverleafOuterSlip,
  sampleLine2,
  smoothstep,
  triangleCount,
  type RibbonAccumulator,
} from './cloverleafRibbon';

/**
 * Anexo 2 NE cloverleaf mesh. One 270° leaf + one outer right-turn slip per
 * quadrant. Small yellow roundabouts sit in the inner corners. BR-344 flies
 * over at-grade BR-472 with a deck, barriers and piers (no coplanar slabs).
 */

export interface NeCloverleafBuildOptions {
  reducedGraphics?: boolean;
}

export interface NeCloverleafGeometries {
  highway: THREE.BufferGeometry | null;
  shoulders: THREE.BufferGeometry | null;
  markings: THREE.BufferGeometry | null;
  edges: THREE.BufferGeometry | null;
  roundabouts: THREE.BufferGeometry | null;
  islands: THREE.BufferGeometry | null;
  curbs: THREE.BufferGeometry | null;
  bridge: THREE.BufferGeometry | null;
  diagnostics: {
    revision: string;
    rampCount: number;
    loopCount: number;
    slipCount: number;
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

function terrainAt(x: number, z: number) {
  return Math.sin(x * 0.075 + z * 0.043) * 0.0018
    + Math.sin(x * 0.031 - z * 0.067) * 0.0012;
}

export function neCloverleafSurfaceElevation(x: number, z: number, base: number) {
  return base + terrainAt(x, z);
}

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

function elevate(
  points: readonly LocalPoint[],
  elevationAt: (point: LocalPoint) => number,
) {
  return elevatePoints(points, (x, z) => elevationAt([x, z]));
}

function pushCorridor(
  pavement: RibbonAccumulator,
  shoulders: RibbonAccumulator,
  markings: RibbonAccumulator,
  edges: RibbonAccumulator,
  samples: ReturnType<typeof elevate>,
  width: number,
  shoulderWidth: number,
  withMarkings: boolean,
  reduced: boolean,
) {
  if (samples.length < 2) return;
  const half = width / 2;
  const lifted = samples.map((sample) => ({
    ...sample,
    y: neCloverleafSurfaceElevation(sample.x, sample.z, sample.y),
  }));
  pushRibbon(pavement, lifted, -half, half, width);
  if (shoulderWidth > 0 && !reduced) {
    const shoulderSamples = lifted.map((sample) => ({
      ...sample,
      y: sample.y - L.shoulderDrop,
    }));
    pushRibbon(shoulders, shoulderSamples, -half - shoulderWidth, -half + 0.01, shoulderWidth * 2);
    pushRibbon(shoulders, shoulderSamples, half - 0.01, half + shoulderWidth, shoulderWidth * 2);
  }
  const edge = L.edgeLineWidth;
  const edgeSamples = lifted.map((sample) => ({
    ...sample,
    y: sample.y + L.markingLift,
  }));
  pushRibbon(edges, edgeSamples, -half + 0.01, -half + 0.01 + edge, 1);
  pushRibbon(edges, edgeSamples, half - 0.01 - edge, half - 0.01, 1);
  if (withMarkings && !reduced) {
    pushDashedRibbon(markings, edgeSamples, 0, 0.028, 1.35, 1.85);
  }
}

function rampElevation(point: LocalPoint) {
  const towardBr344 = Math.abs(point[1] - CZ);
  const towardBr472 = Math.abs(point[0] - CX);
  const mix = towardBr344 / Math.max(towardBr344 + towardBr472, 1e-4);
  const br344 = neCloverleafBr344Elevation(point[0]);
  return lerp(L.atGradeElevation, br344, smoothstep(1 - mix) * 0.42) + L.junctionLift;
}

function pushCarriagewayPair(
  pavement: RibbonAccumulator,
  shoulders: RibbonAccumulator,
  markings: RibbonAccumulator,
  edges: RibbonAccumulator,
  axisFrom: LocalPoint,
  axisTo: LocalPoint,
  lateral: LocalPoint,
  elevationAt: (point: LocalPoint) => number,
  spacing: number,
  reduced: boolean,
) {
  [-HALF_SEP, HALF_SEP].forEach((offset) => {
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
      edges,
      elevate(sampleLine2(from, to, spacing), elevationAt),
      L.carriagewayWidth,
      L.shoulderWidth,
      true,
      reduced,
    );
  });
}

function pushOverpass(bridge: RibbonAccumulator, reduced: boolean) {
  const deckHeight = L.overpassElevation - L.atGradeElevation - L.soffitThickness * 2.2;
  if (deckHeight <= 0.04) return;
  const slabWidth = L.carriagewayWidth + L.shoulderWidth * 2 + 0.08;
  const slabLength = L.overpassDeckHalfSpan * 2 + HALF_SEP * 2 + 0.35;
  const slabY = L.atGradeElevation + L.soffitThickness + deckHeight / 2;
  pushBox(bridge, CX, slabY, CZ - HALF_SEP, slabLength, deckHeight, slabWidth);
  pushBox(bridge, CX, slabY, CZ + HALF_SEP, slabLength, deckHeight, slabWidth);
  const barrierH = 0.1;
  const barrierW = 0.04;
  const barrierY = L.overpassElevation + barrierH / 2;
  const barrierZ = HALF_SEP + L.carriagewayWidth / 2 + L.shoulderWidth + 0.02;
  pushBox(bridge, CX, barrierY, CZ - barrierZ, slabLength - 0.2, barrierH, barrierW);
  pushBox(bridge, CX, barrierY, CZ + barrierZ, slabLength - 0.2, barrierH, barrierW);
  const pierH = L.overpassElevation - L.soffitThickness - 0.04 - L.atGradeElevation;
  if (pierH <= 0.05) return;
  const pierW = reduced ? 0.16 : 0.14;
  const pierD = 0.16;
  const pierY = L.atGradeElevation + pierH / 2;
  const pierX = 1.55;
  [-1, 1].forEach((sx) => {
    [-1, 1].forEach((sz) => {
      pushBox(
        bridge,
        CX + sx * pierX,
        pierY,
        CZ + sz * (HALF_SEP + 0.55),
        pierW,
        pierH,
        pierD,
      );
    });
  });
}

export function buildNeCloverleafGeometries(
  { reducedGraphics = false }: NeCloverleafBuildOptions = {},
): NeCloverleafGeometries {
  const highway = createRibbonAccumulator();
  const shoulders = createRibbonAccumulator();
  const markings = createRibbonAccumulator();
  const edges = createRibbonAccumulator();
  const roundabouts = createRibbonAccumulator();
  const islands = createRibbonAccumulator();
  const curbs = createRibbonAccumulator();
  const bridge = createRibbonAccumulator();
  const spacing = reducedGraphics ? 0.38 : 0.12;
  const circleSegments = reducedGraphics ? 28 : 56;
  let sampleCount = 0;
  let rampCount = 0;

  pushCarriagewayPair(
    highway,
    shoulders,
    markings,
    edges,
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
    edges,
    NE_CLOVERLEAF_STUBS.br344West.axis,
    NE_CLOVERLEAF_STUBS.br344East.axis,
    [0, 1],
    (point) => neCloverleafBr344Elevation(point[0]),
    spacing,
    reducedGraphics,
  );

  const merge = neCloverleafMergeOffset();
  NE_CLOVERLEAF_QUADRANTS.forEach((quadrant) => {
    const loop = sampleNeCloverleafInnerRamp(quadrant.id, spacing);
    const slip = sampleNeCloverleafOuterRamp(quadrant.id, spacing);
    sampleCount += loop.length + slip.length;
    rampCount += 2;
    pushCorridor(
      highway,
      shoulders,
      markings,
      edges,
      elevate(loop, (point) => rampElevation(point)),
      L.innerRampWidth,
      L.innerRampShoulder,
      true,
      reducedGraphics,
    );
    pushCorridor(
      highway,
      shoulders,
      markings,
      edges,
      elevate(slip, () => L.atGradeElevation + L.junctionLift * 0.4),
      L.outerRampWidth,
      L.outerRampShoulder,
      true,
      reducedGraphics,
    );

    const loopCenter = neCloverleafLoopCenter(quadrant.id);
    const grassRadius = Math.max(0.55, L.loopRadius - L.innerRampWidth * 0.52);
    pushDisk(
      islands,
      loopCenter,
      grassRadius,
      neCloverleafSurfaceElevation(loopCenter[0], loopCenter[1], L.atGradeElevation - 0.012),
      circleSegments,
    );

    const center = NE_CLOVERLEAF_ROUNDABOUT_CENTERS[quadrant.id];
    const ringElevation = L.roundaboutElevation + L.junctionLift;
    pushRing(
      roundabouts,
      center,
      L.roundaboutIslandRadius + L.roundaboutCurbWidth,
      L.roundaboutOuterRadius,
      neCloverleafSurfaceElevation(center[0], center[1], ringElevation),
      circleSegments,
    );
    pushDisk(
      islands,
      center,
      L.roundaboutIslandRadius,
      neCloverleafSurfaceElevation(center[0], center[1], ringElevation - 0.003),
      circleSegments,
    );
    pushRing(
      curbs,
      center,
      L.roundaboutIslandRadius,
      L.roundaboutIslandRadius + L.roundaboutCurbWidth,
      neCloverleafSurfaceElevation(center[0], center[1], ringElevation + 0.012),
      circleSegments,
    );
    void merge;
  });

  pushOverpass(bridge, reducedGraphics);

  const geometries = {
    highway: accumulatorToGeometry(highway),
    shoulders: accumulatorToGeometry(shoulders),
    markings: accumulatorToGeometry(markings),
    edges: accumulatorToGeometry(edges),
    roundabouts: accumulatorToGeometry(roundabouts),
    islands: accumulatorToGeometry(islands),
    curbs: accumulatorToGeometry(curbs),
    bridge: accumulatorToGeometry(bridge),
  };
  const triangles = Object.values(geometries).reduce(
    (total, geometry) => total + triangleCount(geometry),
    0,
  );
  const drawCalls = Object.values(geometries).filter(Boolean).length;
  const bounds = geometryBounds([
    geometries.highway,
    geometries.shoulders,
    geometries.roundabouts,
    geometries.islands,
  ]);

  return {
    ...geometries,
    diagnostics: {
      revision: NE_CLOVERLEAF_REVISION,
      rampCount,
      loopCount: 4,
      slipCount: 4,
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
  network.edges?.dispose();
  network.roundabouts?.dispose();
  network.islands?.dispose();
  network.curbs?.dispose();
  network.bridge?.dispose();
}

export function sampleNeCloverleafInnerRamp(
  id: NeCloverleafQuadrantId,
  spacing = 0.16,
): LocalPoint[] {
  const { signX, signZ } = NE_CLOVERLEAF_QUADRANTS.find((entry) => entry.id === id)!;
  return sampleCloverleafLoop(
    [CX, CZ],
    signX,
    signZ,
    neCloverleafMergeOffset(),
    L.loopRadius,
    spacing,
    L.goreLength,
  );
}

export function sampleNeCloverleafOuterRamp(
  id: NeCloverleafQuadrantId,
  spacing = 0.16,
): LocalPoint[] {
  const { signX, signZ } = NE_CLOVERLEAF_QUADRANTS.find((entry) => entry.id === id)!;
  return sampleCloverleafOuterSlip(
    [CX, CZ],
    signX,
    signZ,
    neCloverleafMergeOffset(),
    L.loopRadius,
    spacing,
  );
}

export function neCloverleafInnerRampRadius() {
  return L.loopRadius;
}

export function neCloverleafRampSmoothness(id: NeCloverleafQuadrantId) {
  return Math.max(
    maxHeadingJump(sampleNeCloverleafInnerRamp(id, 0.14)),
    maxHeadingJump(sampleNeCloverleafOuterRamp(id, 0.14)),
  );
}
