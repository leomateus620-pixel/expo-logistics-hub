import type { MapEntity, Coordinate } from '../types';
import { polygonInteriorsOverlap } from './geometry';
import { pointInPolygon } from './spatialSurface';

/** Only the existing narrow seam between C1 and Rua Brasília is paved.
 * The user explicitly confirmed that this forecourt has no lawn. This does
 * not enlarge C1, move a road, or change any cadastral/sales geometry.
 */
export function eventCenterForecourt(entities: readonly MapEntity[]) {
  const building = entities.find((e) => !e.isArchived && e.publicIdentifier === 'C1');
  const road = entities.find(
    (e) => !e.isArchived && e.publicIdentifier === 'RUA-BRASILIA' && e.classification === 'ROAD',
  );
  if (!building || !road) return null;
  const bounds = (e: MapEntity) => {
    const points = e.geometry.coordinates.flat();
    return {
      minX: Math.min(...points.map((p) => p[0])),
      maxX: Math.max(...points.map((p) => p[0])),
      minZ: Math.min(...points.map((p) => p[1])),
      maxZ: Math.max(...points.map((p) => p[1])),
    };
  };
  const b = bounds(building),
    r = bounds(road),
    gap = b.minX - r.maxX;
  // Fail closed if a future survey changes the alignment or the seam's scale.
  if (!(gap > 0 && gap < 1.25) || r.minZ > b.minZ || r.maxZ < b.maxZ) return null;
  const minX = r.maxX + 0.008,
    maxX = b.minX + 0.045,
    minZ = b.minZ + 0.07,
    maxZ = b.maxZ - 0.07;
  const coordinates: Coordinate[][] = [
    [
      [minX, minZ],
      [maxX, minZ],
      [maxX, maxZ],
      [minX, maxZ],
      [minX, minZ],
    ],
  ];
  if (
    entities.some(
      (e) =>
        e !== building &&
        e !== road &&
        !e.isArchived &&
        (e.isSellable || ['ROAD', 'PAVILION', 'BUILDING', 'EVENT_VENUE'].includes(e.classification)) &&
        (polygonInteriorsOverlap({ coordinates }, e.geometry) ||
          pointInPolygon([(minX + maxX) / 2, (minZ + maxZ) / 2], e.geometry.coordinates[0] ?? [])),
    )
  )
    return null;
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    elevation: building.geometry.elevation,
    coordinates,
    ownerId: building.id,
  };
}
