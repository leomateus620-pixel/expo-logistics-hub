import type { MapEntity } from '../../types';
import { commercialPavilionModelBounds } from '../../utils/commercialPavilions';
import { eventCenterEnvelope, eventCenterModelBounds } from '../../utils/eventCenter';
import { EXPORURAL_STEAKHOUSE_LAYOUT, resolveExporuralSteakhouseDimensions } from '../../utils/exporuralSteakhouse';
import { createFenasojaRestaurantLayout } from '../../utils/fenasojaRestaurant';
import { createGastronomicAlamedaLayout, fitRotatedStructureBounds } from '../../utils/fenasojaReferenceStructures';
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
import { MIRANTE_SITE_PROFILE } from './MirantePavilion';

const ROOF_CLEARANCE = 0.025;

/** Place the foot of the beam above the visible roof in the exterior scene. */
export function resolveGastronomyMarkerAnchor(entity: MapEntity): [number, number, number] | null {
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
      const envelope = eventCenterEnvelope(eventCenterModelBounds(bounds));
      // The entrance cross gable passes over the centre of the main hall.
      const crossGableRidge = 0.085 + height * (0.48 * 0.95 + 0.43 * 1.02);
      return onRoof(0, crossGableRidge, envelope.hallRearOffset);
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
