/**
 * Authoritative temporal configuration for the Fenasoja 2028 planning cycle.
 *
 * The event dates mirror the official cronograma seed. The opening hour is the
 * existing countdown configuration and remains explicit so it cannot drift with
 * the viewer's locale or device time zone.
 */
export const FENASOJA_2028_SCHEDULE = {
  cycleStartDate: '2026-06-04',
  openingDate: '2028-05-01',
  openingLocalTime: '10:00:00',
  openingUtcOffset: '-03:00',
  timeZone: 'America/Sao_Paulo',
  mainEventEndDate: '2028-05-07',
  cycleEndDate: '2028-06-20',
} as const;

export const FENASOJA_2028_OPENING_ISO =
  `${FENASOJA_2028_SCHEDULE.openingDate}T${FENASOJA_2028_SCHEDULE.openingLocalTime}${FENASOJA_2028_SCHEDULE.openingUtcOffset}`;

export const FENASOJA_2028_CYCLE_START_ISO =
  `${FENASOJA_2028_SCHEDULE.cycleStartDate}T00:00:00${FENASOJA_2028_SCHEDULE.openingUtcOffset}`;

export const FENASOJA_2028_OPENING_LABEL = '1º de maio de 2028, às 10h';
export const FENASOJA_2028_TIME_ZONE_LABEL = 'Horário de Brasília';
