import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import { getCountdownLabel, getTimelineSnapshot, getTodayKey } from '@/lib/cronograma-timeline';

/**
 * Keeps the command header's date helpers behind one typed module boundary.
 * A missing import now fails type-checking here instead of becoming a free
 * browser global inside the lazy route chunk.
 */
export function buildCronogramaCommandSummary(events: CronogramaEvent[], reference = new Date()) {
  const todayKey = getTodayKey(reference);
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
