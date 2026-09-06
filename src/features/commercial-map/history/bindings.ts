import type { MapEntity } from '../types';

/** Deliberately tiny: imported by the commercial panel before the editorial chunk. */
export const PUBLISHED_HISTORY_BINDINGS: Readonly<Record<string, string>> = Object.freeze({
  'G': 'H04',
  'B20': 'H06',
  'C8': 'H08',
  'C6': 'H09',
  'C5': 'H10',
  'C7': 'H11',
  'B7': 'H14',
  'B28': 'H15',
  'D5': 'H16',
  'PISTA-CAMPEIRA': 'H18',
  'EXPORURAL': 'H19',
  'F': 'H22',
  'B13': 'H23',
  'B11': 'H24',
  'C1': 'H26',
  'C4': 'H27',
  'D3': 'H28',
  'D2': 'H29',
  'A1': 'H30',
  'B10': 'P07',
  'B2': 'P14',
});

type SelectableHistoryEntity = Pick<MapEntity, 'id' | 'publicIdentifier' | 'isArchived'>;

export function getHistoryIdForEntity(entity: SelectableHistoryEntity | null | undefined): string | null {
  if (!entity || entity.isArchived !== false) return null;
  // Never use names, fuzzy aliases, spatial proximity, parents, or mesh IDs.
  return Object.prototype.hasOwnProperty.call(PUBLISHED_HISTORY_BINDINGS, entity.publicIdentifier)
    ? PUBLISHED_HISTORY_BINDINGS[entity.publicIdentifier]
    : null;
}

export function hasPublishedHistory(entity: SelectableHistoryEntity | null | undefined): boolean {
  return getHistoryIdForEntity(entity) !== null;
}
