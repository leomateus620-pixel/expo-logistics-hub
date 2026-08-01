import {
  EXPORURAL_AREA_CODE,
  EXPORURAL_PROTECTED_IDENTIFIERS,
  EXPORURAL_ROAD_IDENTIFIERS,
  EXPORURAL_SUPPORT_IDENTIFIERS,
  EXPORURAL_TOTALS,
} from '../data/exporuralReference2026';
import type { CommercialLot, CommercialMapData, MapEntity } from '../types';
import {
  COMMERCIAL_MAP_SEGMENT_IDS,
  type CommercialMapSegmentId,
} from '../data/commercialMapSegments';

export type CommercialMapAreaScope = 'park' | 'exporural';

const exporuralRoads = new Set<string>(EXPORURAL_ROAD_IDENTIFIERS);
const exporuralSupports = new Set<string>(EXPORURAL_SUPPORT_IDENTIFIERS);
const protectedNeighbors = new Set<string>(EXPORURAL_PROTECTED_IDENTIFIERS);

export const EXPORURAL_VIEW_BOUNDS = {
  minX: -2.9,
  maxX: 57.8,
  minZ: -37.6,
  maxZ: -7.7,
  centerX: 27.45,
  centerZ: -22.65,
  minDistance: 7,
  maxDistance: 118,
} as const;

export function areaScopeFromSearchParams(searchParams: URLSearchParams): CommercialMapAreaScope {
  return searchParams.get('area')?.toLocaleLowerCase('pt-BR') === 'exporural'
    ? 'exporural'
    : 'park';
}

export function isSegmentCompatibleWithAreaScope(
  segmentId: CommercialMapSegmentId | null,
  scope: CommercialMapAreaScope,
) {
  return !segmentId
    || scope === 'park'
    || segmentId === COMMERCIAL_MAP_SEGMENT_IDS.exporural;
}

export function isExporuralEntity(entity: MapEntity) {
  if (protectedNeighbors.has(entity.publicIdentifier)) return false;
  if (entity.metadata.areaCode === EXPORURAL_AREA_CODE) return true;
  if (entity.publicIdentifier === EXPORURAL_AREA_CODE) return true;
  if (entity.publicIdentifier === 'QUADRA-R' || entity.publicIdentifier === 'QUADRA-S') return true;
  if (/^Q-[RS]-\d{2}$/.test(entity.publicIdentifier)) return true;
  if (exporuralRoads.has(entity.publicIdentifier)) return true;
  return exporuralSupports.has(entity.publicIdentifier);
}

export function scopeCommercialMapData(
  data: Pick<CommercialMapData, 'entities' | 'lots'>,
  scope: CommercialMapAreaScope,
) {
  if (scope === 'park') {
    return {
      entities: data.entities,
      lots: data.lots,
      entityIds: new Set(data.entities.map((entity) => entity.id)),
    };
  }

  const entities = data.entities.filter(isExporuralEntity);
  const entityIds = new Set(entities.map((entity) => entity.id));
  return {
    entities,
    lots: data.lots.filter((lot) => entityIds.has(lot.entityId)),
    entityIds,
  };
}

export function exporuralMetrics(lots: CommercialLot[]) {
  const metrics = {
    lots: lots.length,
    available: 0,
    reserved: 0,
    inNegotiation: 0,
    sold: 0,
    blocked: 0,
    unavailable: 0,
    availableOfficialAreaSqm: 0,
    totalOfficialAreaSqm: 0,
  };

  lots.forEach((lot) => {
    const officialArea = lot.officialAreaSqm ?? 0;
    metrics.totalOfficialAreaSqm += officialArea;
    if (lot.status === 'AVAILABLE') {
      metrics.available += 1;
      metrics.availableOfficialAreaSqm += officialArea;
    } else if (lot.status === 'RESERVED') metrics.reserved += 1;
    else if (lot.status === 'IN_NEGOTIATION') metrics.inNegotiation += 1;
    else if (lot.status === 'SOLD') metrics.sold += 1;
    else if (lot.status === 'BLOCKED') metrics.blocked += 1;
    else if (lot.status === 'UNAVAILABLE') metrics.unavailable += 1;
  });

  return metrics;
}

export function exporuralReferenceSummary() {
  return EXPORURAL_TOTALS;
}
