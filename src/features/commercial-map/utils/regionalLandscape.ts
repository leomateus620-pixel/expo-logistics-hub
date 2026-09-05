import * as THREE from 'three';
import { lateralDistrictContainsWorldPoint } from '../data/lateralResidentialDistrict';
import {
  PARK_LOCAL_BOUNDS,
  REGIONAL_HIGHWAY_PROFILE,
  distanceToPolyline,
  pointInInterchangeEnvelope,
  regionalHighwaySegments,
} from '../data/regional-highways';
import {
  REAR_PARK_ROAD_NETWORK,
  rearRoadLocalPath,
  rearRoadLocalShoulderWidth,
  rearRoadLocalWidth,
} from '../data/rearParkRoadNetwork';

export type RegionalLandscapeQualityTier = 'full' | 'balanced' | 'reduced';

export interface RegionalLandscapeInstance {
  id: string;
  clusterId: number;
  position: readonly [number, number];
  height: number;
  canopyRadius: number;
  canopyScaleY: number;
  scaleX: number;
  scaleZ: number;
  rotation: number;
  variant: number;
}

/**
 * Instance counts, not draw calls: every tier renders the same three
 * instanced batches, so a denser woodland costs GPU vertices only. Full and
 * balanced share one budget so an adaptive HIGH<->MEDIUM change never
 * removes or adds trees at the horizon.
 */
export const REGIONAL_LANDSCAPE_INSTANCE_BUDGET = Object.freeze({
  full: 840,
  balanced: 840,
  reduced: 220,
} satisfies Record<RegionalLandscapeQualityTier, number>);

export const REGIONAL_LANDSCAPE_DRAW_CALL_BUDGET = Object.freeze({
  full: 3,
  balanced: 3,
  reduced: 2,
} satisfies Record<RegionalLandscapeQualityTier, number>);

/**
 * Presentation-only woodland anchors outside the official park rectangle.
 * They deliberately describe no road, lot, building or surveyed land use.
 */
const CLUSTER_CENTERS = Object.freeze([
  // Inner woodland ring (original 17 anchors).
  [-106, -144], [-62, -151], [-8, -146], [45, -150],
  [-101, -91], [-52, -96], [5, -101], [58, -108],
  [-105, -31], [-99, 34], [-91, 86], [-42, 94],
  [15, 101], [67, 105], [112, 66], [115, 4], [108, -62],
  // Hedgerows hugging the park perimeter (road/park clearance still applies).
  [-82, -66], [82, -74], [-84, 8], [88, 34], [-70, 72], [60, 76], [-20, 70],
  // Outer ring: cheap depth for the pull-back overview and the highway horizon.
  [-160, -200], [-40, -212], [92, -206], [166, -152], [178, -60], [182, 44],
  [170, 122], [110, 164], [30, 168], [-62, 172], [-142, 152], [-178, 62],
  [-172, -42], [-150, -112],
] as const);

const MAX_CANDIDATES = 3_200;
const PARK_CLEARANCE = 5.5;
const ROAD_CLEARANCE = 2.6;

function hashUnit(index: number, salt: number) {
  let value = Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(salt + 17, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

function insideExpandedPark(x: number, z: number) {
  return x >= PARK_LOCAL_BOUNDS.minX - PARK_CLEARANCE
    && x <= PARK_LOCAL_BOUNDS.maxX + PARK_CLEARANCE
    && z >= PARK_LOCAL_BOUNDS.minZ - PARK_CLEARANCE
    && z <= PARK_LOCAL_BOUNDS.maxZ + PARK_CLEARANCE;
}

/** Public QA guard used by generation and regression tests. */
export function regionalLandscapePointIsClear(position: readonly [number, number]) {
  const [x, z] = position;
  if (!Number.isFinite(x) || !Number.isFinite(z) || insideExpandedPark(x, z)) return false;
  // Maximum regional canopy is 1.9 map units: leave a 13 m crown clearance.
  if (lateralDistrictContainsWorldPoint(position, 13)) return false;
  if (pointInInterchangeEnvelope(position, 'neCloverleaf')) return false;
  if (pointInInterchangeEnvelope(position, 'seCloverleaf')) return false;

  const blocksRegionalRoad = regionalHighwaySegments().some((segment) => {
    const width = segment.carriagewayWidth ?? REGIONAL_HIGHWAY_PROFILE.carriagewayWidth;
    const shoulder = segment.shoulderWidth ?? REGIONAL_HIGHWAY_PROFILE.shoulderWidth;
    return distanceToPolyline(position, segment.centerline) <= width / 2 + shoulder + ROAD_CLEARANCE;
  });
  if (blocksRegionalRoad) return false;

  return !REAR_PARK_ROAD_NETWORK.some((road) => (
    distanceToPolyline(position, rearRoadLocalPath(road))
      <= rearRoadLocalWidth(road) / 2 + rearRoadLocalShoulderWidth(road) + ROAD_CLEARANCE
  ));
}

function candidateAt(index: number): RegionalLandscapeInstance | null {
  const clusterId = index % CLUSTER_CENTERS.length;
  const center = CLUSTER_CENTERS[clusterId];
  const ring = Math.floor(index / CLUSTER_CENTERS.length);
  const angle = hashUnit(index, 11) * Math.PI * 2 + ring * 0.37;
  // sqrt produces an even area distribution; a second noise stretches every
  // cluster differently so they do not read as identical circular stamps.
  // Bias towards the cluster core so woodlands read as dense copses with a
  // ragged fringe instead of an even scatter.
  const radial = Math.pow(hashUnit(index, 29), 0.62);
  const radiusX = 13 + hashUnit(clusterId, 41) * 22;
  const radiusZ = 10 + hashUnit(clusterId, 53) * 20;
  const position = Object.freeze([
    center[0] + Math.cos(angle) * radial * radiusX,
    center[1] + Math.sin(angle) * radial * radiusZ,
  ] as const);
  if (!regionalLandscapePointIsClear(position)) return null;

  const variant = Math.floor(hashUnit(index, 71) * 8) % 8;
  const height = 2.25 + hashUnit(index, 83) * 3.55;
  return Object.freeze({
    id: `regional-woodland-${index}`,
    clusterId,
    position,
    height,
    canopyRadius: 0.72 + hashUnit(index, 97) * 1.18,
    canopyScaleY: 0.7 + hashUnit(index, 109) * 0.46,
    scaleX: 0.82 + hashUnit(index, 127) * 0.38,
    scaleZ: 0.82 + hashUnit(index, 139) * 0.38,
    rotation: hashUnit(index, 151) * Math.PI * 2,
    variant,
  });
}

const MAXIMUM_PLAN = Object.freeze(
  Array.from({ length: MAX_CANDIDATES }, (_, index) => candidateAt(index))
    .filter((instance): instance is RegionalLandscapeInstance => instance !== null)
    // A stable rank makes every lower tier a spatially representative prefix
    // instead of removing complete clusters from the end of the source list.
    .sort((left, right) => {
      const leftRank = hashUnit(Number(left.id.replace(/\D/g, '')), 193);
      const rightRank = hashUnit(Number(right.id.replace(/\D/g, '')), 193);
      return leftRank - rightRank || left.id.localeCompare(right.id, 'en');
    }),
);

export function buildRegionalLandscapePlan(
  qualityTier: RegionalLandscapeQualityTier,
): readonly RegionalLandscapeInstance[] {
  const count = Math.min(
    REGIONAL_LANDSCAPE_INSTANCE_BUDGET[qualityTier],
    MAXIMUM_PLAN.length,
  );
  return Object.freeze(MAXIMUM_PLAN.slice(0, count));
}

export function regionalLandscapeDiagnostics(qualityTier: RegionalLandscapeQualityTier) {
  const instances = buildRegionalLandscapePlan(qualityTier);
  return Object.freeze({
    qualityTier,
    instanceCount: instances.length,
    clusterCount: new Set(instances.map((instance) => instance.clusterId)).size,
    variantCount: new Set(instances.map((instance) => instance.variant)).size,
    drawCalls: REGIONAL_LANDSCAPE_DRAW_CALL_BUDGET[qualityTier],
    maximumRadius: instances.reduce(
      (maximum, instance) => Math.max(maximum, Math.hypot(...instance.position)),
      0,
    ),
  });
}

export const REGIONAL_LANDSCAPE_GROUND_HEIGHT = -0.075;
export const REGIONAL_LANDSCAPE_UP = Object.freeze(new THREE.Vector3(0, 1, 0));
