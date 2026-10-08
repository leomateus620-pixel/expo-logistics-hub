import polygonClipping, { type Polygon } from 'polygon-clipping';
import { buildCommercialMapSegmentIndex, type CommercialMapSegmentDefinition } from '../data/commercialMapSegments';
import type { CommercialLot, MapEntity } from '../types';
import { resolveCommercialPavilionDefinition } from '../utils/commercialPavilions';
import { validDashboardRing, type MiniMapOutline } from './commercialDashboardGeometry';

const BOUNDARY_CACHE_LIMIT = 8;
const boundaryCache = new Map<string, ReturnType<typeof buildDashboardExternalBoundaries>>();
const membershipKeys = new WeakMap<readonly MapEntity[], WeakMap<readonly CommercialLot[], string>>();

/** Financial and visual snapshot changes do not change segment membership. */
function membershipKey(entities: readonly MapEntity[], lots: readonly CommercialLot[]) {
  let byLots = membershipKeys.get(entities);
  if (!byLots) {
    byLots = new WeakMap();
    membershipKeys.set(entities, byLots);
  }
  let key = byLots.get(lots);
  if (key === undefined) {
    key = JSON.stringify([entities.map((entity) => [entity.id, entity.publicIdentifier,
      entity.parentEntityId, entity.segmentId, entity.segmentSource,
      entity.metadata?.block, entity.metadata?.parentPublicIdentifier, entity.metadata?.segmentId,
      entity.metadata?.segmentCode, entity.metadata?.areaCode]), lots.map((lot) => [lot.entityId, lot.block])]);
    byLots.set(lots, key);
  }
  return key;
}

/** Bounded, pure spatial results survive overview/sales remounts. Exact member
 * coordinates and association inputs invalidate the union, never prices. */
export function getDashboardExternalBoundaries(
  entities: readonly MapEntity[],
  lots: readonly CommercialLot[],
  segments: readonly CommercialMapSegmentDefinition[],
) {
  const declared = new Set(segments.flatMap((segment) => [...segment.boundary.blockIdentifiers, ...segment.membership.entityIdentifiers]));
  const key = JSON.stringify([membershipKey(entities, lots),
    segments.map((segment) => [segment.id, segment.name, segment.palette.edge,
      segment.boundary.blockIdentifiers, segment.boundary.excludedIdentifiers, segment.membership.entityIdentifiers]),
    entities.filter((entity) => declared.has(entity.publicIdentifier)).map((entity) => [
      entity.id, entity.isArchived, entity.classification, entity.geometry?.coordinates,
    ])]);
  let result = boundaryCache.get(key);
  if (!result) {
    result = buildDashboardExternalBoundaries(entities, lots, segments);
    boundaryCache.set(key, result);
    if (boundaryCache.size > BOUNDARY_CACHE_LIMIT) boundaryCache.delete(boundaryCache.keys().next().value!);
  } else {
    boundaryCache.delete(key);
    boundaryCache.set(key, result);
  }
  return result;
}

/** Exact union of declared, active cadastral members; never a hull or bounding box. */
export function buildDashboardExternalBoundaries(
  entities: readonly MapEntity[],
  lots: readonly CommercialLot[],
  segments: readonly CommercialMapSegmentDefinition[],
) {
  const index = buildCommercialMapSegmentIndex(entities, lots);
  const outlines: MiniMapOutline[] = [];
  const pending: string[] = [];
  for (const segment of segments) {
    const declared = new Set([...segment.boundary.blockIdentifiers, ...segment.membership.entityIdentifiers]);
    const excluded = new Set(segment.boundary.excludedIdentifiers);
    const members = entities.filter((entity) => !entity.isArchived
      && declared.has(entity.publicIdentifier) && !excluded.has(entity.publicIdentifier)
      && index.get(entity.id)?.id === segment.id
      && !resolveCommercialPavilionDefinition(entity) && entity.classification !== 'INTERNAL_STAND');
    const polygons: Polygon[] = [];
    const confirmedBlocks = new Set<string>();
    for (const entity of members) {
      const outer = validDashboardRing(entity.geometry?.coordinates?.[0]);
      if (!outer) continue;
      const coordinates = [outer, ...entity.geometry.coordinates.slice(1).flatMap((ring) => {
        const valid = validDashboardRing(ring);
        return valid ? [valid] : [];
      })];
      polygons.push(coordinates.map((ring) => ring.map(([x, y]) => [x, y])));
      if (entity.classification === 'QUADRA' && segment.boundary.blockIdentifiers.includes(entity.publicIdentifier)) {
        confirmedBlocks.add(entity.publicIdentifier);
        outlines.push({
          id: entity.id, label: `Quadra ${entity.publicIdentifier.replace(/^QUADRA-/, '')}`,
          kind: 'block', color: segment.palette.edge, coordinates,
        });
      }
    }
    const missing = segment.boundary.blockIdentifiers.filter((id) => !confirmedBlocks.has(id));
    if (missing.length) pending.push(`${segment.name}: perímetro parcial; quadras sem geometria/vínculo confirmado: ${missing.map((id) => id.replace('QUADRA-', '')).join(', ')}.`);
    if (!polygons.length) {
      pending.push(`${segment.name}: perímetro cadastral não disponível neste recorte.`);
      continue;
    }
    try {
      const union = polygonClipping.union(polygons[0], ...polygons.slice(1));
      union.forEach((coordinates, part) => outlines.push({
        id: `${segment.id}:${part}`, label: segment.name, kind: 'segment', color: segment.palette.edge, coordinates,
      }));
    } catch {
      pending.push(`${segment.name}: perímetro pendente de validação geométrica.`);
    }
  }
  return { outlines, pending };
}
