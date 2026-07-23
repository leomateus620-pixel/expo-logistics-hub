import {
  FENASOJA_2028_CYCLE_START_ISO,
  FENASOJA_2028_OPENING_ISO,
  FENASOJA_2028_OPENING_LABEL,
  FENASOJA_2028_SCHEDULE,
  FENASOJA_2028_TIME_ZONE_LABEL,
} from '@/config/fenasoja-2028';

const SECOND_MS = 1_000;
const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 60 * MINUTE_SECONDS;
const DAY_SECONDS = 24 * HOUR_SECONDS;
const MAX_TIMER_DELAY_MS = 2_147_000_000;

export {
  FENASOJA_2028_CYCLE_START_ISO,
  FENASOJA_2028_OPENING_ISO,
  FENASOJA_2028_OPENING_LABEL,
  FENASOJA_2028_TIME_ZONE_LABEL,
};

export const FENASOJA_2028_TIME_ZONE = FENASOJA_2028_SCHEDULE.timeZone;
export const FENASOJA_2028_OPENING_TIMESTAMP = Date.parse(FENASOJA_2028_OPENING_ISO);

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
  const openingTimestamp = FENASOJA_2028_OPENING_TIMESTAMP;
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
    // Flooring keeps the cycle below 100% until the official opening instant.
    cycleProgress: cycleDuration > 0 ? Math.floor((elapsedCycle / cycleDuration) * 100) : 100,
    phase: remainingMilliseconds > 0 ? 'countdown' : 'open',
  };
}

function pluralize(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function getFenasojaCountdownUpdateDelay(reference: Date | number = Date.now()) {
  const referenceTimestamp = toTimestamp(reference);
  const remainder = ((referenceTimestamp % SECOND_MS) + SECOND_MS) % SECOND_MS;

  // A small tolerance prevents an early timer callback from repeating a visual second.
  return SECOND_MS - remainder + 12;
}

export function getFenasojaCycleProgressUpdateDelay(
  reference: Date | number = Date.now(),
) {
  const referenceTimestamp = toTimestamp(reference);
  const openingTimestamp = FENASOJA_2028_OPENING_TIMESTAMP;
  const cycleStartTimestamp = Date.parse(FENASOJA_2028_CYCLE_START_ISO);
  const cycleDuration = openingTimestamp - cycleStartTimestamp;

  if (cycleDuration <= 0 || referenceTimestamp >= openingTimestamp) return null;

  const currentProgress = getFenasojaCountdown(referenceTimestamp).cycleProgress;
  const nextProgress = Math.min(100, currentProgress + 1);
  const nextProgressTimestamp = cycleStartTimestamp + (cycleDuration * nextProgress) / 100;
  const delay = Math.ceil(nextProgressTimestamp - referenceTimestamp) + 12;

  return Math.min(MAX_TIMER_DELAY_MS, Math.max(12, delay));
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

export function formatFenasojaCountdownSummary(snapshot: FenasojaCountdownSnapshot) {
  if (snapshot.phase === 'open') return 'A Fenasoja 2028 está oficialmente aberta.';

  return `Contagem oficial: faltam ${[
    pluralize(snapshot.days, 'dia', 'dias'),
    pluralize(snapshot.hours, 'hora', 'horas'),
    pluralize(snapshot.minutes, 'minuto', 'minutos'),
  ].join(', ')} para a abertura.`;
}
