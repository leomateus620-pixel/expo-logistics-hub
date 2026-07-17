import { useEffect, useMemo, useState } from 'react';
import {
  formatFenasojaCountdownLabel,
  formatFenasojaCountdownSummary,
  getFenasojaCountdown,
  getFenasojaCountdownUpdateDelay,
} from '@/lib/fenasoja-countdown';

const lifecycleEvents = ['focus', 'pageshow'] as const;

/**
 * Keeps the visual clock aligned to real second boundaries without treating a
 * previous React state value as the source of truth. Timers are suspended while
 * the document is hidden and are reconciled immediately on wake/focus.
 */
export function useFenasojaCountdown(timerEnabled = true) {
  const [referenceTime, setReferenceTime] = useState(() => Date.now());

  useEffect(() => {
    let timeoutId: number | undefined;
    let mounted = true;

    const clearScheduledTick = () => {
      if (timeoutId === undefined) return;
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    };

    const schedule = () => {
      clearScheduledTick();
      if (!mounted || !timerEnabled || document.visibilityState === 'hidden') return;

      const now = Date.now();
      setReferenceTime((current) => (current === now ? current : now));

      if (getFenasojaCountdown(now).phase === 'open') return;
      timeoutId = window.setTimeout(schedule, getFenasojaCountdownUpdateDelay(now));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearScheduledTick();
        return;
      }
      schedule();
    };

    const handlePageHide = () => clearScheduledTick();

    schedule();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    lifecycleEvents.forEach((eventName) => window.addEventListener(eventName, schedule));

    return () => {
      mounted = false;
      clearScheduledTick();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      lifecycleEvents.forEach((eventName) => window.removeEventListener(eventName, schedule));
    };
  }, [timerEnabled]);

  const snapshot = useMemo(() => getFenasojaCountdown(referenceTime), [referenceTime]);
  const accessibleLabel = useMemo(() => formatFenasojaCountdownLabel(snapshot), [snapshot]);
  const announcementKey = `${snapshot.phase}:${snapshot.days}:${snapshot.hours}:${snapshot.minutes}`;
  const announcement = useMemo(
    () => formatFenasojaCountdownSummary(snapshot),
    // Intentionally omit seconds so assistive technology is updated at most once per minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [announcementKey],
  );

  return {
    snapshot,
    accessibleLabel,
    announcement,
  };
}
