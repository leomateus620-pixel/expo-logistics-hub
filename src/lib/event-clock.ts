import { useSyncExternalStore } from 'react';

export interface EventCountdown {
  days: number; hours: number; minutes: number; seconds: number;
  phase: 'countdown' | 'started' | 'invalid';
}

export function calculateEventCountdown(startsAt: string, now: number): EventCountdown {
  const difference = Date.parse(startsAt) - now;
  if (!Number.isFinite(difference)) return { days: 0, hours: 0, minutes: 0, seconds: 0, phase: 'invalid' };
  const seconds = Math.ceil(Math.max(0, difference) / 1000);
  return {
    days: Math.floor(seconds / 86400), hours: Math.floor(seconds / 3600) % 24,
    minutes: Math.floor(seconds / 60) % 60, seconds: seconds % 60,
    phase: difference > 0 ? 'countdown' : 'started',
  };
}

export function formatEventCountdown(value: EventCountdown) {
  return `${value.days} dias, ${value.hours} horas, ${value.minutes} minutos e ${value.seconds} segundos`;
}

/** One timer and one sparse HTTP time sample shared by DOM and the stage surface. */
export function createEventClock() {
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let lastSync = -Infinity;
  let offset = 0;
  let source: 'device' | 'http-date' = 'device';
  const now = () => Date.now() + offset;
  const getSnapshot = () => Math.floor(now() / 1000) * 1000;
  const emit = () => listeners.forEach(listener => listener());
  const stop = () => { clearTimeout(timer); timer = undefined; };

  async function synchronize() {
    if (controller || Date.now() - lastSync < 15 * 60 * 1000 || typeof fetch === 'undefined') return;
    lastSync = Date.now();
    const request = new AbortController();
    controller = request;
    const timeout = setTimeout(() => request.abort(), 2500);
    const start = performance.now();
    try {
      // Existing same-origin HTTP response, not a new API or commercial-map RPC.
      const response = await fetch('/', { method: 'HEAD', cache: 'no-store', signal: request.signal });
      const rtt = performance.now() - start;
      const server = Date.parse(response.headers.get('Date') ?? '');
      const age = Number(response.headers.get('Age') ?? 0);
      if (!request.signal.aborted && listeners.size && response.ok && Number.isFinite(server) && age === 0 && rtt < 2000) {
        // HTTP Date has one-second precision. Account for quantization and return latency.
        offset = server + 500 + rtt / 2 - Date.now();
        source = 'http-date';
        emit();
      }
    } catch { /* Offline/missing header: the device clock remains usable. */ }
    finally { clearTimeout(timeout); if (controller === request) controller = undefined; }
  }

  function tick() {
    stop();
    if (!listeners.size || document.visibilityState === 'hidden') return;
    emit();
    void synchronize();
    timer = setTimeout(tick, 1000 - ((now() % 1000 + 1000) % 1000) + 8);
  }
  const hide = () => { stop(); controller?.abort(); };
  const visibility = () => document.visibilityState === 'hidden' ? hide() : tick();
  function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) {
      document.addEventListener('visibilitychange', visibility);
      window.addEventListener('focus', tick);
      window.addEventListener('pageshow', tick);
      window.addEventListener('pagehide', hide);
      tick();
    }
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        hide();
        document.removeEventListener('visibilitychange', visibility);
        window.removeEventListener('focus', tick);
        window.removeEventListener('pageshow', tick);
        window.removeEventListener('pagehide', hide);
      }
    };
  }
  return { now, getSnapshot, subscribe, diagnostics: () => ({ source, offset, subscribers: listeners.size }) };
}

export const eventClock = createEventClock();
export function useEventCountdown(startsAt: string) {
  const reference = useSyncExternalStore(eventClock.subscribe, eventClock.getSnapshot, () => 0);
  return calculateEventCountdown(startsAt, reference);
}
