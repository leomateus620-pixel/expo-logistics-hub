import type { MapEntity } from '../types';

/** Stable technical identities, independent of the neutral display label. */
export function isExporuralLongitudinalPassage(entity: Pick<MapEntity, 'classification' | 'publicIdentifier'>) {
  return entity.classification === 'ROAD' && (
    /^EXPORURAL-PASSAGEM-LESTE-0[12]$/.test(entity.publicIdentifier)
    || entity.publicIdentifier === 'EXPORURAL-PASSAGEM-INTERNA-01'
  );
}
