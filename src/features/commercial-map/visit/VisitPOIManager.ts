import type { CommercialLot, Coordinate, MapClassification, MapEntity } from '../types';
import { EXPORURAL_MAP_UNITS_PER_METER } from '../data/exporuralReference2026';
import { normalizeMapEntityMetadata } from '../utils/mapMetadata';
import { resolveStrategicLandmarkKind, strategicLandmarkSupportsInterior } from '../utils/landmarks';

export interface VisitPoint { x: number; y: number; z: number }
export type VisitPOIType = 'LOT' | 'PAVILION' | 'BUILDING' | 'LANDMARK' | 'RESTAURANT' | 'ARENA' | 'STAGE' | 'ADMINISTRATIVE' | 'OTHER';

/** References the authorized map snapshot; commercial values are never copied or computed here. */
export interface VisitPOI {
  id: string;
  type: VisitPOIType;
  name: string;
  position: VisitPoint;
  interactionRadius: number;
  priority: number;
  description: string | null;
  interiorAvailable: boolean;
  entity: MapEntity;
  lot: CommercialLot | null;
  footprint: readonly Coordinate[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

const TYPES: Partial<Record<MapClassification, VisitPOIType>> = {
  PAVILION: 'PAVILION', BUILDING: 'BUILDING', RESTAURANT: 'RESTAURANT', FOOD_AREA: 'RESTAURANT',
  ADMINISTRATION: 'ADMINISTRATIVE', LANDMARK: 'LANDMARK', EVENT_VENUE: 'ARENA', ATTRACTION: 'LANDMARK',
  RESTROOM: 'BUILDING', CHEMICAL_RESTROOM: 'BUILDING', SECURITY: 'BUILDING', EMERGENCY: 'BUILDING',
  GATE: 'LANDMARK', SERVICE: 'OTHER',
};

export function buildVisitPOIs(
  entities: readonly MapEntity[],
  lots: readonly CommercialLot[],
  unitsPerMeter = EXPORURAL_MAP_UNITS_PER_METER,
): VisitPOI[] {
  const scale = Number.isFinite(unitsPerMeter) && unitsPerMeter > 0 ? unitsPerMeter : EXPORURAL_MAP_UNITS_PER_METER;
  const lotByEntity = new Map(lots.map(lot => [lot.entityId, lot]));
  const pois: VisitPOI[] = [];
  for (const entity of entities) {
    // Internal stands belong to the explicitly opened inspection scene. They
    // must never leak through the external pavilion wall as visit targets.
    if (entity.isArchived || entity.classification === 'INTERNAL_STAND') continue;
    const lot = lotByEntity.get(entity.id) ?? null;
    const kind = resolveStrategicLandmarkKind(entity);
    const type = lot ? 'LOT' : kind === 'lactalis-cultural-stage' ? 'STAGE' : TYPES[entity.classification];
    if (!type) continue;
    const footprint = entity.geometry.coordinates[0] ?? [];
    if (footprint.length < 3 || footprint.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) continue;
    const metadata = normalizeMapEntityMetadata(entity, lot ?? undefined);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of footprint) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    pois.push({
      id: entity.id, type, name: metadata.officialDisplayName,
      position: { x: metadata.labelAnchor[0], y: entity.geometry.elevation + 1.25 * scale, z: metadata.labelAnchor[1] },
      interactionRadius: (lot ? 14 : 28) * scale,
      priority: lot ? 1.05 : type === 'PAVILION' ? 1.02 : 1,
      description: entity.description, interiorAvailable: strategicLandmarkSupportsInterior(entity),
      entity, lot, footprint, bounds: { minX, maxX, minZ, maxZ },
    });
  }
  return pois;
}
