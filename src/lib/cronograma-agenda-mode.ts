import { CRONOGRAMA_LOCATION_OPTIONS } from '@/lib/cronograma-location-options';

export type CronogramaAgendaMode = 'general' | 'volunteers';

export interface CronogramaLocationIdentity {
  location?: string | null;
  locationCode?: string | null;
}

function normalizeLocationName(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/** An explicit code is authoritative, including when the display label disagrees. */
export function matchesCronogramaLocation(event: CronogramaLocationIdentity, code: string) {
  if (event.locationCode !== null && event.locationCode !== undefined && event.locationCode !== '') {
    return event.locationCode === code;
  }
  const canonical = CRONOGRAMA_LOCATION_OPTIONS.find((option) => option.code === code);
  return Boolean(canonical && event.location
    && normalizeLocationName(event.location) === normalizeLocationName(canonical.label));
}

/** Apply only to the already authorized dataset, before view partitions and aggregates. */
export function filterCronogramaAgendaMode<T extends CronogramaLocationIdentity>(
  events: T[],
  mode: CronogramaAgendaMode,
): T[] {
  return mode === 'general' ? events : events.filter((event) => matchesCronogramaLocation(event, 'sala_voluntarios'));
}
