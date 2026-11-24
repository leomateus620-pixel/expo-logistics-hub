import type { MapEntity } from '../types';

/** World position of the emblem's base. Food points keep their commercial parent and no lot geometry. */
export function gastronomyPointPosition(entity: MapEntity): [number, number, number] | null {
  const position = entity.metadata.gastronomyMarkerPosition;
  if (entity.classification !== 'FOOD_POINT' || !Array.isArray(position) || position.length !== 3) return null;
  const [x, y, z] = position;
  return [x, y, z].every(Number.isFinite) ? [x, y, z] : null;
}

export function isGastronomyRoofPoint(entity: MapEntity) {
  return entity.classification === 'FOOD_POINT' && entity.metadata.gastronomyMarkerPosition === 'structure-roof';
}

export function hasIndividualGastronomyMarker(entity: MapEntity) {
  return isGastronomyRoofPoint(entity) || Boolean(gastronomyPointPosition(entity));
}

export function gastronomyStructureSelectionId(structureId: string, points: readonly { entity: MapEntity }[]) {
  return points.some(({ entity }) => !hasIndividualGastronomyMarker(entity)) ? structureId : points[0]?.entity.id ?? structureId;
}
