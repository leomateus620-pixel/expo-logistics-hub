const SECOND_MS = 1_000;
const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 60 * MINUTE_SECONDS;
const DAY_SECONDS = 24 * HOUR_SECONDS;

export const FENASOJA_2028_TIME_ZONE = 'America/Sao_Paulo';
export const FENASOJA_2028_OPENING_ISO = '2028-05-01T10:00:00-03:00';
export const FENASOJA_2028_CYCLE_START_ISO = '2026-06-04T00:00:00-03:00';
export const FENASOJA_2028_OPENING_LABEL = '1º de maio de 2028, às 10h';

export type FenasojaCountdownPhase = 'countdown' | 'open';

export interface FenasojaCountdownSnapshot {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  remainingMilliseconds: number;
  cycleProgress: number;
  phase: FenasojaCountdownPhase;
}

function toTimestamp(reference: Date | number) {
  return reference instanceof Date ? reference.getTime() : reference;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function getFenasojaCountdown(
  reference: Date | number = Date.now(),
): FenasojaCountdownSnapshot {
  const referenceTimestamp = toTimestamp(reference);
  const openingTimestamp = Date.parse(FENASOJA_2028_OPENING_ISO);
  const cycleStartTimestamp = Date.parse(FENASOJA_2028_CYCLE_START_ISO);
  const remainingMilliseconds = Math.max(0, openingTimestamp - referenceTimestamp);
  const remainingSeconds = Math.ceil(remainingMilliseconds / SECOND_MS);
  const cycleDuration = openingTimestamp - cycleStartTimestamp;
  const elapsedCycle = clamp(referenceTimestamp - cycleStartTimestamp, 0, cycleDuration);

  return {
    days: Math.floor(remainingSeconds / DAY_SECONDS),
    hours: Math.floor((remainingSeconds % DAY_SECONDS) / HOUR_SECONDS),
    minutes: Math.floor((remainingSeconds % HOUR_SECONDS) / MINUTE_SECONDS),
    seconds: remainingSeconds % MINUTE_SECONDS,
    remainingMilliseconds,
    cycleProgress: cycleDuration > 0 ? Math.round((elapsedCycle / cycleDuration) * 100) : 100,
    phase: remainingMilliseconds > 0 ? 'countdown' : 'open',
  };
}

function pluralize(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function formatFenasojaCountdownLabel(snapshot: FenasojaCountdownSnapshot) {
  if (snapshot.phase === 'open') return 'A Fenasoja 2028 está oficialmente aberta.';

  return `Faltam ${[
    pluralize(snapshot.days, 'dia', 'dias'),
    pluralize(snapshot.hours, 'hora', 'horas'),
    pluralize(snapshot.minutes, 'minuto', 'minutos'),
    pluralize(snapshot.seconds, 'segundo', 'segundos'),
  ].join(', ')} para a abertura oficial da Fenasoja 2028.`;
}
