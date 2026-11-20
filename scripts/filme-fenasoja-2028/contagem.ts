// Offline end-card cues use the same clock and timezone as the interactive player.
import {
  FENASOJA_2028_TIME_ZONE, getFenasojaCountdown, formatFenasojaCountdownLabel,
} from '../../src/lib/fenasoja-countdown';

const origin = new Date(process.argv[2]);
const stamp = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FENASOJA_2028_TIME_ZONE, dateStyle: 'short', timeStyle: 'short',
}).format(origin);
const ticks = Array.from({ length: 6 }, (_, second) => {
  const snapshot = getFenasojaCountdown(origin.getTime() + second * 1000);
  return snapshot.phase === 'countdown'
    ? [snapshot.days, snapshot.hours, snapshot.minutes, snapshot.seconds]
    : formatFenasojaCountdownLabel(snapshot);
});
process.stdout.write(JSON.stringify({ stamp, ticks }));
