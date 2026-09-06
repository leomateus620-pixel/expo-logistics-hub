import {
  EXPORURAL_GATE_ACCESS_ROAD_SURFACE_IDS,
  PARK_ACCESS_SPATIAL_PLAN,
  type ParkAccessPoint,
} from '../data/parkAccessSpatialPlan';
import { OFFICIAL_REFERENCE_DATA } from '../data/officialReference2026';
import type { ParkAccessGateKey } from './parkAccessArchitecture';
import type {
  ParkAccessFlatSupportSurface,
  ParkAccessInfrastructureInput,
  ParkAccessRoadMaterial,
} from './parkAccessInfrastructure';
import { roadSurfaceHeight } from './roadInfrastructure';
import { entitySurfaceElevation } from './spatialSurface';
import { splitLateralResidentialSidewalk } from './lateralResidentialStreetIntegration';

type SpatialPlan = typeof PARK_ACCESS_SPATIAL_PLAN;

const SUPPORTED_FLAT_CLASSIFICATIONS = new Set([
  'ROAD',
  'PARKING',
  'PEDESTRIAN_PATH',
]);

export const PARK_ACCESS_OFFICIAL_FLAT_SUPPORT_SURFACES: readonly ParkAccessFlatSupportSurface[] = (
  OFFICIAL_REFERENCE_DATA.entities
    .filter((entity) => SUPPORTED_FLAT_CLASSIFICATIONS.has(entity.classification))
    .map((entity) => ({
      id: entity.publicIdentifier,
      polygon: entity.geometry.coordinates[0],
      topElevation: entity.classification === 'ROAD' || entity.classification === 'PEDESTRIAN_PATH'
        ? entity.geometry.elevation + roadSurfaceHeight(entity)
        : entitySurfaceElevation(entity),
    }))
);

function roadMaterial(kind: string): ParkAccessRoadMaterial {
  if (kind === 'COBBLESTONE_ACCESS_ROAD') return 'cobblestone';
  if (kind === 'STONE_GRAVEL_ACCESS_ROAD' || kind === 'COMPACTED_SERVICE_ROAD') return 'gravel';
  return 'asphalt';
}

function openPolygon(points: readonly ParkAccessPoint[]) {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? points.slice(0, -1) : points;
}

function costeirosPlacement(plan: SpatialPlan) {
  const polygon = openPolygon(plan.costeirosSetting.buildingPolygon);
  const first = polygon[0];
  const second = polygon[1];
  const third = polygon[2];
  if (!first || !second || !third) return null;
  const edgeX = second[0] - first[0];
  const edgeZ = second[1] - first[1];
  const depthX = third[0] - second[0];
  const depthZ = third[1] - second[1];
  const width = Math.hypot(edgeX, edgeZ);
  const depth = Math.hypot(depthX, depthZ);
  if (width <= 0 || depth <= 0) return null;
  return {
    anchor: plan.costeirosSetting.buildingAnchor,
    rotationRadians: -Math.atan2(edgeZ, edgeX),
    width,
    depth,
  } as const;
}

function gateRotationFromArrivalHeading(approachHeadingRadians: number) {
  // The architecture's local +z axis is its approach/depth axis. The GIS
  // heading uses +x as zero, so a quarter-turn aligns the two frames.
  return Math.PI / 2 - approachHeadingRadians;
}

export function adaptParkAccessSpatialPlan(
  plan: SpatialPlan = PARK_ACCESS_SPATIAL_PLAN,
): ParkAccessInfrastructureInput {
  const mapUnitsPerMeter = plan.coordinateFrame.workingMapUnitsPerMeter;
  const gateKeys = ['gate1', 'gate2', 'gate3'] as const satisfies readonly ParkAccessGateKey[];
  return {
    roadSurfaces: plan.roadSurfaces.map((surface) => ({
      id: surface.id,
      polygon: surface.polygon,
      centerline: surface.centerline,
      width: surface.widthMeters * mapUnitsPerMeter,
      elevation: surface.elevation,
      material: roadMaterial(surface.kind),
      supportAware: surface.supportAware === true,
    })),
    supportSurfaces: PARK_ACCESS_OFFICIAL_FLAT_SUPPORT_SURFACES,
    sidewalkSurfaces: plan.sidewalkSurfaces.flatMap((surface) => splitLateralResidentialSidewalk({
      id: surface.id,
      polygon: surface.polygon,
      elevation: surface.elevation,
    })),
    curbSegments: plan.roadSurfaces.flatMap((surface) => (
      (surface.curbCenterlines ?? []).flatMap((centerline, edgeIndex) => (
        centerline.slice(0, -1).map((from, segmentIndex) => ({
          id: `${surface.id}:curb-${edgeIndex + 1}-${segmentIndex + 1}`,
          from,
          to: centerline[segmentIndex + 1],
          elevation: surface.elevation,
        }))
      ))
    )),
    parkingBays: plan.parkingBays.map((bay) => ({
      id: bay.id,
      center: bay.center,
      size: bay.size,
      rotationRadians: bay.rotation,
    })),
    markingSegments: plan.markingSegments.map((marking) => ({
      id: marking.id,
      from: marking.from,
      to: marking.to,
      width: marking.width,
      style: marking.style,
      color: marking.style === 'CENTER_DOUBLE_YELLOW' ? 'yellow' : 'white',
      dashPattern: marking.dashMeters
        ? [marking.dashMeters[0] * mapUnitsPerMeter, marking.dashMeters[1] * mapUnitsPerMeter]
        : null,
    })),
    roundabouts: plan.roundabouts.map((roundabout) => ({
      center: roundabout.center,
      outerRadius: roundabout.outerRadius,
      islandRadius: roundabout.islandRadius,
      curbWidth: plan.dimensions.curbMeters * mapUnitsPerMeter,
      elevation: roundabout.elevation,
      splitterIslands: roundabout.splitterIslands.map((island) => island.polygon),
    })),
    gates: gateKeys.map((key) => {
      const gate = plan.gates[key];
      return {
        key,
        anchor: gate.anchor,
        rotationRadians: gateRotationFromArrivalHeading(gate.approachHeadingRadians),
        width: gate.width,
        depth: gate.depth,
      };
    }),
    costeiros: costeirosPlacement(plan),
  };
}

export const PARK_ACCESS_INFRASTRUCTURE_INPUT = adaptParkAccessSpatialPlan();

export function selectParkAccessRoadInfrastructure(
  input: ParkAccessInfrastructureInput,
  roadSurfaceIds: readonly string[],
): ParkAccessInfrastructureInput {
  const selectedIds = new Set(roadSurfaceIds);
  const curbPrefixes = roadSurfaceIds.map((id) => `${id}:`);

  return {
    ...input,
    roadSurfaces: input.roadSurfaces.filter((surface) => selectedIds.has(surface.id)),
    sidewalkSurfaces: [],
    curbSegments: input.curbSegments?.filter((segment) => (
      curbPrefixes.some((prefix) => segment.id.startsWith(prefix))
    )) ?? [],
    parkingBays: [],
    markingSegments: [],
    roundabouts: [],
    gates: [],
    costeiros: null,
  };
}

export const EXPORURAL_PARK_ACCESS_INFRASTRUCTURE_INPUT = selectParkAccessRoadInfrastructure(
  PARK_ACCESS_INFRASTRUCTURE_INPUT,
  EXPORURAL_GATE_ACCESS_ROAD_SURFACE_IDS,
);
