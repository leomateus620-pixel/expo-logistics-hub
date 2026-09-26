import type { CommercialMapData } from '../types';

/** Physical identity is UUID + revision/geometry + area, never code alone. */
export function exporuralSelectionSnapshot(data: Pick<CommercialMapData, 'entities' | 'lots'>) {
  const byId = new Map(data.entities.map(e => [e.id, e]));
  return new Map(data.lots.filter(l => l.block === 'R' || l.block === 'S').map(l => {
    const e = byId.get(l.entityId);
    return [l.id, { entityId: l.entityId, signature: JSON.stringify([
      l.entityId, l.publicIdentifier, l.officialAreaSqm,
      e?.metadata.geometryRevision, e?.geometry.geometryVersion, e?.geometry.coordinates,
    ]) }];
  }));
}

export function changedExporuralSelections(
  previous: ReturnType<typeof exporuralSelectionSnapshot>,
  current: ReturnType<typeof exporuralSelectionSnapshot>,
) {
  return [...previous].filter(([id, before]) => current.get(id)?.signature !== before.signature)
    .map(([lotId, before]) => ({ lotId, entityId: before.entityId }));
}
