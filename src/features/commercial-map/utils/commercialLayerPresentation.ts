import { REAR_ROAD_IDENTITIES } from '../data/rearParkRoadNetwork';
import type { MapEntity } from '../types';

const REAR_ROAD_OWNER_IDENTIFIERS = new Set(
  REAR_ROAD_IDENTITIES.map((identity) => identity.officialOwnerIdentifier),
);

/**
 * Resolves the generated ribbons from the same persisted circulation layers as
 * their three official owners. Filter fading mirrors `RoadInfrastructure`; the
 * batch deliberately stays non-raycast and does not manufacture a second
 * selected/highlightable road identity.
 */
export function rearRoadLayerPresentation(
  entities: readonly MapEntity[],
  layerVisibility: Readonly<Record<string, boolean>>,
  layerOpacity: Readonly<Record<string, number>>,
  filtersActive = false,
) {
  const owners = entities.filter((entity) => (
    entity.classification === 'ROAD'
    && REAR_ROAD_OWNER_IDENTIFIERS.has(entity.publicIdentifier)
  ));
  const presentOwnerIdentifiers = new Set(owners.map((entity) => entity.publicIdentifier));
  const layerIds = [...new Set(owners.map((entity) => entity.layerId))];
  const hasEveryOwner = REAR_ROAD_IDENTITIES.every((identity) => (
    presentOwnerIdentifiers.has(identity.officialOwnerIdentifier)
  ));
  if (
    !hasEveryOwner
    || layerIds.length === 0
    || layerIds.some((layerId) => layerVisibility[layerId] === false)
  ) return { visible: false, opacity: 0 } as const;

  const persistedOpacity = Math.min(1, ...layerIds.map((layerId) => (
    Math.max(0, Math.min(1, layerOpacity[layerId] ?? 1))
  )));
  const opacity = persistedOpacity * (filtersActive ? 0.68 : 1);
  return { visible: opacity > 0.015, opacity } as const;
}
