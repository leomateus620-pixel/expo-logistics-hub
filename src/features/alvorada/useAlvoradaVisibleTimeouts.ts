import { useCallback, useEffect, useRef } from 'react';

interface AlvoradaVisibleTimer {
  callback: (() => void) | null;
  remainingMs: number;
  startedAt: number | null;
  timeoutId: number | null;
}

function createVisibleTimer(): AlvoradaVisibleTimer {
  return {
    callback: null,
    remainingMs: 0,
    startedAt: null,
    timeoutId: null,
  };
}

/**
 * Timers measured in visible time: they suspend while the document is hidden
 * and resume with the remaining budget once the tab is visible again. Every
 * pending timer is cancelled when the owning component unmounts.
 */
export function useAlvoradaVisibleTimeouts<Key extends string>(keys: readonly Key[]) {
  const timers = useRef<Record<Key, AlvoradaVisibleTimer> | null>(null);
  if (timers.current === null) {
    timers.current = Object.fromEntries(
      keys.map((key) => [key, createVisibleTimer()]),
    ) as Record<Key, AlvoradaVisibleTimer>;
  }

  const scheduleTimer = useCallback((timer: AlvoradaVisibleTimer) => {
    if (timer.callback === null || timer.timeoutId !== null || document.hidden) return;

    timer.startedAt = Date.now();
    timer.timeoutId = window.setTimeout(() => {
      timer.timeoutId = null;
      timer.startedAt = null;
      timer.remainingMs = 0;
      const callback = timer.callback;
      timer.callback = null;
      callback?.();
    }, Math.max(0, timer.remainingMs));
  }, []);

  const clearTimer = useCallback((key: Key) => {
    const timer = timers.current?.[key];
    if (!timer) return;
    if (timer.timeoutId !== null) window.clearTimeout(timer.timeoutId);
    timer.callback = null;
    timer.remainingMs = 0;
    timer.startedAt = null;
    timer.timeoutId = null;
  }, []);

  const clearTimers = useCallback(() => {
    if (!timers.current) return;
    (Object.keys(timers.current) as Key[]).forEach(clearTimer);
  }, [clearTimer]);

  const armTimer = useCallback((key: Key, durationMs: number, callback: () => void) => {
    clearTimer(key);
    const timer = timers.current?.[key];
    if (!timer) return;
    timer.callback = callback;
    timer.remainingMs = Math.max(0, durationMs);
    scheduleTimer(timer);
  }, [clearTimer, scheduleTimer]);

  const isArmed = useCallback((key: Key) => timers.current?.[key]?.callback !== null, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!timers.current) return;
      const activeTimers = Object.values(timers.current) as AlvoradaVisibleTimer[];
      if (document.hidden) {
        const hiddenAt = Date.now();
        activeTimers.forEach((timer) => {
          if (timer.timeoutId === null || timer.startedAt === null) return;
          window.clearTimeout(timer.timeoutId);
          timer.timeoutId = null;
          timer.remainingMs = Math.max(0, timer.remainingMs - (hiddenAt - timer.startedAt));
          timer.startedAt = null;
        });
        return;
      }

      activeTimers.forEach(scheduleTimer);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTimers();
    };
  }, [clearTimers, scheduleTimer]);

  return { armTimer, clearTimer, clearTimers, isArmed };
}
