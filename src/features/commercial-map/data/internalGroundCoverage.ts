import { QUADRAS_AB_SPATIAL_REFERENCE } from './quadrasABEnvironment';
import { ARENA_FRONT_LAYOUT, sourceBoundsToLocal } from './parkEnvironment';
import { NATIONS_DISTRICT_LAYOUT } from './nationsDistrict';
import { PARK_ACCESS_SPATIAL_PLAN } from './parkAccessSpatialPlan';
import { OFFICIAL_REFERENCE_DATA } from './officialReference2026';
import { parkingConvexHull, parkingContainsPoint } from '../utils/parkingGeometry';

/** Explicit positive ownership: never treat CORE/camera bounds as the park perimeter. */
export const INTERNAL_NATURAL_PARKING_RINGS = ['EST-EXP-VIS', 'EST-VIS'].map(id =>
  OFFICIAL_REFERENCE_DATA.entities.find(entity => entity.publicIdentifier === id)!.geometry.coordinates[0]);
/** The intervening land is an environmental owner, not a third selectable
 * parking area. Its corners come exclusively from the two existing polygons.
 * Keeping cadastral rings separate here was the gap reported during visual QA.
 */
export const INTERNAL_PARKING_GROUND_ENVELOPE = parkingConvexHull(INTERNAL_NATURAL_PARKING_RINGS.flat());
const arena = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.terrain.sourceBounds);
// Positive ownership only. The generic camera/crop/CORE envelope is NOT an
// internal park boundary and must never recolour the external landscape.
export const INTERNAL_GROUND_OWNERSHIP_RINGS = [
  INTERNAL_PARKING_GROUND_ENVELOPE,
  QUADRAS_AB_SPATIAL_REFERENCE.quadraA.polygon,
  QUADRAS_AB_SPATIAL_REFERENCE.quadraB.polygon,
  NATIONS_DISTRICT_LAYOUT.grassBoundary,
  PARK_ACCESS_SPATIAL_PLAN.woodlandMass.polygon,
  [[arena.minX,arena.minZ],[arena.maxX,arena.minZ],[arena.maxX,arena.maxZ],[arena.minX,arena.maxZ]],
] as readonly (readonly (readonly [number,number])[])[];

export const isInternalGroundPoint = (point: readonly [number, number]) => INTERNAL_GROUND_OWNERSHIP_RINGS.some(ring => parkingContainsPoint(point, ring));
