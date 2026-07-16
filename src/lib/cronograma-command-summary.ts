import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import { getCountdownLabel, getTimelineSnapshot, getTodayKey } from '@/lib/cronograma-timeline';

export function getCronogramaCommandReference(reference: Date | string = new Date()) {
  return typeof reference === 'string' ? reference : getTodayKey(reference);
}

/**
 * Keeps the command header's date helpers behind one typed module boundary.
 * A missing import now fails type-checking here instead of becoming a free
 * browser global inside the lazy route chunk.
 */
export function buildCronogramaCommandSummary(events: CronogramaEvent[], reference: Date | string = new Date()) {
  const todayKey = getCronogramaCommandReference(reference);
  const snapshot = getTimelineSnapshot(events, todayKey);

  return {
    snapshot,
    nextCountdown: snapshot.nextOfficialAction
      ? getCountdownLabel(snapshot.nextOfficialAction.date, todayKey)
      : null,
    editionCountdown: snapshot.edition
      ? getCountdownLabel(snapshot.edition.date, todayKey)
      : null,
  };
}
