import type { Coordinate } from "../types";
import {
  FENASOJA_COMPLEX as SPEC,
  complexImageToSource,
  complexSourceToWorld,
} from "../data/fenasojaComplexReconstruction";
type P = readonly [number, number];
const b = SPEC.stage,
  u = SPEC.registration.unitsPerMeter;
const sourceCenter = b.sourceOrigin;
const sourceFootprint = [
  complexImageToSource([407, 370])[0] - complexImageToSource([407, 756])[0],
  complexImageToSource([587, 563])[1] - complexImageToSource([227, 563])[1],
] as const;
const targetSourceCenter = [3897.4166666666665, 3605] as const;
const targetWorldCenter = complexSourceToWorld(targetSourceCenter);
const rect = (x0: number, z0: number, x1: number, z1: number): P[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
/** Lots 11/12 determine the audience side. Orthogonality comes from both
 * satellite views and street edges, not a ray to an arbitrary lot center. */
export function lactalisStageFacingRadians(_center: P = b.origin): number {
  return b.yaw;
}
export const LACTALIS_STAGE_LAYOUT = {
  revision: SPEC.revision,
  publicIdentifier: "B13",
  runtimeEntityId: "reference:2026:b13",
  displayName: "Palco Cultural Lactalis",
  sourceReferences: {
    currentRear: "4d5553bc-e7bb-4b7b-bea7-82b430272a8b.jpeg",
    currentFront: "19f56352-460e-4796-b9cb-a8430e2a168b.jpeg",
    satellite: "8717c208-1b44-49d3-89fa-88d5d1c635b7.jpeg",
    architecture: "4618B88E-96C4-4F78-98A2-6E21E6C254F2.jpeg",
  },
  sourceCenter,
  sourceFootprint,
  sourceFootprintPolygon: rect(
    sourceCenter[0] - sourceFootprint[0] / 2,
    sourceCenter[1] - sourceFootprint[1] / 2,
    sourceCenter[0] + sourceFootprint[0] / 2,
    sourceCenter[1] + sourceFootprint[1] / 2,
  ),
  worldCenter: b.origin,
  targetIdentifier: "Q-D-12",
  targetIdentifiers: b.audienceIdentifiers,
  targetSourceCenter,
  targetWorldCenter,
  headquartersIdentifier: "B12",
  headquartersSourceFootprint: [106, 84] as const,
  headquartersWorldCenter: SPEC.headquarters.origin,
  localFrontAxis: [0, 1] as const,
  frontVector: b.front,
  facingRadians: b.yaw,
  facingDegrees: -90,
  architecture: {
    widthRatio: 1,
    depthRatio: 1,
    eaveHeight: b.eave * u,
    ridgeHeight: b.ridge * u,
    columnThicknessRatio: 0.012,
    minimumColumnThickness: 0.18 * u,
    roofThickness: 0.1 * u,
    roofOverhangRatio: b.overhang / (b.roofWidth - b.overhang * 2),
    platformHeight: b.platformHeight * u,
    platformWidthRatio: 0.82,
    platformDepthRatio: 0.32,
    audienceApronDepth: 0.4 * u,
    audienceApronWidthRatio: 0.97,
    footprintSafetyInset: 0,
    headquartersClearance: 0.15 * u,
    floorThickness: 0.12 * u,
    sideEnclosureDepthRatio: 0.35,
    fasciaDepth: 0.52 * u,
    claddingThickness: 0.08 * u,
  },
  signage: { aspectRatio: 2.4, widthRatio: 0.26, centerAboveEave: 0.03 * u },
  camera: {
    minimumDistance: 2.4,
    focusedDistance: 5.3,
    focusMinimumDirectionY: 0.28,
    focusPortraitMinimumDirectionY: 0.42,
  },
  palette: {
    cladding: "#c8ccca",
    claddingLight: "#dadddb",
    roof: "#a9afaa",
    roofEdge: "#30383a",
    frame: "#20282b",
    interior: "#31383a",
    platform: "#24292a",
    concrete: "#a9a79e",
    sign: "#16466e",
    lactalisBlue: "#0a4381",
    light: "#8bd483",
  },
  renderBudget: {
    baseDrawCalls: 11,
    detailDrawCalls: 17,
    focusedDrawCalls: 22,
    independentCables: 0,
    textureAssets: 0,
  },
} as const;
export function lactalisStageVisualHeight() {
  return b.ridge * u;
}
export function lactalisStageFrontVector(_center: P = b.origin): P {
  return b.front;
}
export function lactalisStageHeadingToHeadquartersErrorRadians() {
  return Math.abs(b.yaw - SPEC.headquarters.yaw);
}
/** Error to the audience-facing street normal, after resolving the lot side. */
export function lactalisStageHeadingToTargetErrorRadians() {
  return targetWorldCenter[0] < b.origin[0] ? 0 : Math.PI;
}
export function lactalisStageModelDimensions(
  _footprintWidth: number,
  _footprintDepth: number,
  _center: P = b.origin,
) {
  return {
    width: (b.roofWidth - 2 * b.overhang) * u,
    depth: (b.roofDepth - 2 * b.overhang) * u,
    height: b.ridge * u,
    containmentScale: 1,
  };
}
export function lactalisStageLocalToWorld(
  [x, z]: P,
  center: P = b.origin,
): Coordinate {
  return [center[0] - z, center[1] + x];
}
export function lactalisStagePresentationFootprint(
  _width = b.roofDepth * u,
  _depth = b.roofWidth * u,
  center: P = b.origin,
): readonly Coordinate[] {
  const halfW = (b.roofWidth * u) / 2 + 0.006,
    halfD = (b.roofDepth * u) / 2 + 0.012;
  return rect(-halfW, -halfD, halfW, halfD).map((p) =>
    lactalisStageLocalToWorld(p, center),
  );
}
export function lactalisStageAudienceApronPolygon(): readonly Coordinate[] {
  const front = (b.roofDepth / 2 - b.overhang) * u,
    halfWidth = ((b.roofWidth - 2 * b.overhang) * 0.97 * u) / 2;
  return rect(-halfWidth, front, halfWidth, front + 0.4 * u).map((p) =>
    lactalisStageLocalToWorld(p),
  );
}
export function lactalisStageHeadquartersSizeClass() {
  const stage = lactalisStageModelDimensions(0, 0),
    hq = SPEC.headquarters.volumes.main;
  return {
    stageWidth: stage.width,
    stageDepth: stage.depth,
    stageHeight: stage.height,
    headquartersWidth: hq.width * u,
    headquartersDepth: hq.depth * u,
    widthRatio: stage.width / (hq.width * u),
    depthRatio: stage.depth / (hq.depth * u),
    containmentScale: 1,
  };
}
