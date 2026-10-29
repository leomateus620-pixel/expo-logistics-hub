import type { CommercialLot, Coordinate, MapEntity } from '../types';
import type { PublicExternalScenePolicy } from '../public/publicScenePolicy';
import type { TerritorialObstacle } from './territorialOrientation';

type Inputs = {
  entities: readonly MapEntity[];
  roads: readonly MapEntity[];
  lots: readonly CommercialLot[];
  policy?: PublicExternalScenePolicy | null;
  obstacles: readonly TerritorialObstacle[];
  exteriorBlockObstacles: readonly TerritorialObstacle[];
};

const sameArray = <T>(a: readonly T[], b: readonly T[], same: (a: T, b: T) => boolean) =>
  a === b || a.length === b.length && a.every((value, index) => same(value, b[index]));
const samePoint = (a: Coordinate, b: Coordinate) => a === b || a[0] === b[0] && a[1] === b[1];
const sameRings = (a: TerritorialObstacle, b: TerritorialObstacle) => sameArray(a, b, (a, b) => sameArray(a, b, samePoint));
const LABEL_METADATA = ['officialDisplayName', 'block', 'parentPublicIdentifier', 'segmentId', 'segmentCode',
  'areaCode', 'renderMode', 'suppressTerritorialLabel', 'nameConfirmed', 'canonicalRoadIdentifier'] as const;

function sameEntity(a: MapEntity, b: MapEntity) {
  if (a === b) return true;
  const aa = a.metadata.labelAnchor, ba = b.metadata.labelAnchor;
  const sameAnchor = aa === ba || Array.isArray(aa) && Array.isArray(ba)
    && aa.length === 2 && ba.length === 2 && aa[0] === ba[0] && aa[1] === ba[1];
  return a.id === b.id && a.publicIdentifier === b.publicIdentifier && a.name === b.name
    && a.classification === b.classification && a.isArchived === b.isArchived && a.parentEntityId === b.parentEntityId
    && a.segmentId === b.segmentId && a.segmentSource === b.segmentSource && sameAnchor
    && LABEL_METADATA.every(key => a.metadata[key] === b.metadata[key])
    && (a.geometry === b.geometry || a.geometry.elevation === b.geometry.elevation
      && a.geometry.extrusionHeight === b.geometry.extrusionHeight && sameRings(a.geometry.coordinates, b.geometry.coordinates));
}

function samePolicy(a: Inputs['policy'], b: Inputs['policy']) {
  if (a === b) return true;
  if (!a || !b) return false;
  // Only the label scope and focus are consumed here. Never retain an old
  // authorized label if its entity disappears from the refreshed scope.
  return a.activeScope.size === b.activeScope.size && [...a.activeScope].every(id => b.activeScope.has(id))
    && (Object.keys(a.focusBounds) as (keyof typeof a.focusBounds)[]).every(key => a.focusBounds[key] === b.focusBounds[key]);
}

/** The atlas depends on geometry, names and membership. A sale/status refresh
 * must not rerasterize text or repeat the geometric layout. Comparisons take
 * the reference fast path on navigation and inspect coordinates only when an
 * immutable inventory changes; no JSON serialization or per-frame search. */
export function createTerritorialOrientationInputResolver() {
  let previous: Inputs | undefined;
  return (next: Inputs): Inputs => {
    if (!previous) return (previous = next);
    const stable: Inputs = {
      entities: sameArray(previous.entities, next.entities, sameEntity) ? previous.entities : next.entities,
      roads: sameArray(previous.roads, next.roads, sameEntity) ? previous.roads : next.roads,
      lots: sameArray(previous.lots, next.lots, (a, b) => a.entityId === b.entityId && a.block === b.block) ? previous.lots : next.lots,
      policy: samePolicy(previous.policy, next.policy) ? previous.policy : next.policy,
      obstacles: sameArray(previous.obstacles, next.obstacles, sameRings) ? previous.obstacles : next.obstacles,
      exteriorBlockObstacles: sameArray(previous.exteriorBlockObstacles, next.exteriorBlockObstacles, sameRings)
        ? previous.exteriorBlockObstacles : next.exteriorBlockObstacles,
    };
    previous = stable;
    return stable;
  };
}
