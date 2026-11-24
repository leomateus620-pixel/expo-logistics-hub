import type { MapEntity } from '../../types';
import { GATE_FOUR_DISTRICT_LAYOUT, resolveCrioulosArchitectureEnvelope } from '../../data/gateFourDistrict';
import { choppTruckRoofAnchor } from '../../utils/choppTruck';
import { commercialPavilionModelBounds } from '../../utils/commercialPavilions';
import { eventCenterModelBounds } from '../../utils/eventCenter';
import { eventCenterArchitectureDimensions } from '../../utils/eventCenterArchitecture';
import { EXPORURAL_STEAKHOUSE_LAYOUT, resolveExporuralSteakhouseDimensions } from '../../utils/exporuralSteakhouse';
import { createFenasojaRestaurantLayout } from '../../utils/fenasojaRestaurant';
import { createGastronomicAlamedaLayout, fitRotatedStructureBounds } from '../../utils/fenasojaReferenceStructures';
import { gastronomyPointPosition, isGastronomyRoofPoint } from '../../utils/gastronomyPointPlacement';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkVisualHeight,
} from '../../utils/landmarks';
import { resolveMarkerPresentationLift } from '../../utils/mapPresentation';
import { createMiranteLayout } from '../../utils/mirante';
import { safeLotAnchor } from '../../utils/soldLotPresentation';
import { DEFAULT_FLAT_SURFACE_CLASSIFICATIONS, entitySurfaceHeight } from '../../utils/spatialSurface';
import { createViaExpressaLayout, viaExpressaModelBounds } from '../../utils/viaExpressa';
import { MIRANTE_SITE_PROFILE } from './MirantePavilion';

const ROOF_CLEARANCE = 0.025;

/** Use the point's position or place the structure's beam above its visible roof. */
export function resolveGastronomyMarkerAnchor(entity: MapEntity, structure?: MapEntity): [number, number, number] | null {
  if (isGastronomyRoofPoint(entity) && structure && structure.classification !== 'FOOD_POINT') {
    return resolveGastronomyMarkerAnchor(structure);
  }
  if (entity.classification === 'FOOD_POINT') return gastronomyPointPosition(entity);
  const { coordinates, elevation, extrusionHeight } = entity.geometry;
  if (!coordinates[0] || coordinates[0].length < 3 || !Number.isFinite(elevation)
    || !Number.isFinite(extrusionHeight) || coordinates.some(ring => ring.some(point => !point.every(Number.isFinite)))) return null;

  const bounds = strategicLandmarkBounds(entity);
  const yaw = strategicLandmarkFacingRadians(entity);
  const height = strategicLandmarkVisualHeight(entity);
  const onRoof = (x: number, y: number, z: number): [number, number, number] => [
    bounds.centerX + Math.cos(yaw) * x + Math.sin(yaw) * z,
    elevation + y + ROOF_CLEARANCE,
    bounds.centerZ - Math.sin(yaw) * x + Math.cos(yaw) * z,
  ];

  switch (resolveStrategicLandmarkKind(entity)) {
    case 'fenasoja-event-center': {
      const { marker } = eventCenterArchitectureDimensions(eventCenterModelBounds(bounds, yaw), height);
      return onRoof(...marker);
    }
    case 'fenasoja-restaurant': {
      // The presentation has already merged C2 and C3. Use the hall ridge
      // on that combined footprint, behind the covered frontage.
      const layout = createFenasojaRestaurantLayout(commercialPavilionModelBounds(bounds, yaw), height);
      return onRoof(0, layout.groundElevation + layout.ridgeHeight + 0.022, layout.bodyCenterZ);
    }
    case 'exporural-restaurant': {
      const { mainOffsetX, mainWallHeight, mainRoofRise } = resolveExporuralSteakhouseDimensions(bounds);
      // C4 also renders a detached turbine. The marker belongs to the main roof.
      return onRoof(mainOffsetX, EXPORURAL_STEAKHOUSE_LAYOUT.mainBuilding.foundationHeight
        + mainWallHeight + mainRoofRise + 0.028, 0);
    }
    case 'gastronomic-alameda': {
      const { building, roof } = createGastronomicAlamedaLayout(fitRotatedStructureBounds(bounds, yaw), height);
      return onRoof(0, roof.ridgeY + 0.072, building.centerZ);
    }
    case 'mirante-pavilion': {
      // The covered platform begins beyond the north landing. The lateral
      // structure and the arena terrace have independent presentation geometry.
      const { roof } = createMiranteLayout(bounds, height, MIRANTE_SITE_PROFILE);
      return onRoof(0, roof.ridgeY + 0.85 * roof.thickness, roof.centerZ);
    }
    case 'livestock-tent':
      return onRoof(0, height + 0.0225, 0);
    case 'crioulos-center': {
      const { roof } = resolveCrioulosArchitectureEnvelope();
      const [offsetX, offsetZ] = GATE_FOUR_DISTRICT_LAYOUT.crioulos.visualOffset;
      return onRoof(roof.center[0] + offsetX, roof.ridgeY, roof.center[1] + offsetZ);
    }
    case 'via-expressa': {
      const layout = createViaExpressaLayout(viaExpressaModelBounds(bounds, yaw), height, false);
      return onRoof(0, layout.height + layout.roofThickness * 0.68, layout.centerZ);
    }
    case 'chopp-truck': {
      const [x, y, z] = choppTruckRoofAnchor(entity);
      return [x, y + ROOF_CLEARANCE, z];
    }
    default: {
      const anchor = safeLotAnchor(coordinates);
      if (!anchor) return null;
      const surfaceHeight = height ?? entitySurfaceHeight(entity);
      const bevel = height === null && !DEFAULT_FLAT_SURFACE_CLASSIFICATIONS.has(entity.classification)
        && entity.classification !== 'PAVILION' && surfaceHeight >= 0.35
        ? Math.min(0.065, surfaceHeight * 0.05)
        : 0;
      return [anchor.point[0], elevation + surfaceHeight + bevel
        + resolveMarkerPresentationLift(entity.classification) + ROOF_CLEARANCE, anchor.point[1]];
    }
  }
}
