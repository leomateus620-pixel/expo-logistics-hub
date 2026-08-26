import {
  PARK_ACCESS_SPATIAL_PLAN,
  type ParkAccessPoint,
} from '../data/parkAccessSpatialPlan';
import type { ParkAccessGateKey } from './parkAccessArchitecture';
import type { ParkAccessInfrastructureInput } from './parkAccessInfrastructure';

type SpatialPlan = typeof PARK_ACCESS_SPATIAL_PLAN;

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
      elevation: surface.elevation,
      material: surface.kind === 'COMPACTED_SERVICE_ROAD' ? 'gravel' : 'asphalt',
    })),
    sidewalkSurfaces: plan.sidewalkSurfaces.map((surface) => ({
      id: surface.id,
      polygon: surface.polygon,
      elevation: surface.elevation,
    })),
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
    roundabout: {
      center: plan.roundabout.center,
      outerRadius: plan.roundabout.outerRadius,
      islandRadius: plan.roundabout.islandRadius,
      curbWidth: plan.dimensions.curbMeters * mapUnitsPerMeter,
      elevation: plan.roundabout.elevation,
      splitterIslands: plan.roundabout.splitterIslands.map((island) => island.polygon),
    },
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
