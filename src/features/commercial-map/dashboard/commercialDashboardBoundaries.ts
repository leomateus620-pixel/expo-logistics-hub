import polygonClipping, { type Polygon } from 'polygon-clipping';
import { buildCommercialMapSegmentIndex, type CommercialMapSegmentDefinition } from '../data/commercialMapSegments';
import type { CommercialLot, MapEntity } from '../types';
import { resolveCommercialPavilionDefinition } from '../utils/commercialPavilions';
import { validDashboardRing, type MiniMapOutline } from './commercialDashboardGeometry';

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
