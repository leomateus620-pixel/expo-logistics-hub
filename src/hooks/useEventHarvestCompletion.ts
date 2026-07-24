import { useCallback, useEffect, useRef, useState } from 'react';
import type { CronogramaEvent } from '@/components/cronograma-eventos/types';

export const HARVEST_ANIMATION_DURATION_MS = 4_600;
export const HARVEST_REDUCED_MOTION_DURATION_MS = 650;

export type HarvestCompletionPhase = 'preparing' | 'harvesting';

export interface HarvestCompletionJob {
  event: CronogramaEvent;
  phase: HarvestCompletionPhase;
  reducedMotion: boolean;
  startedAt?: number;
}

export type HarvestCompletionJobs = Record<string, HarvestCompletionJob>;

export function getHarvestEventKey(event: Pick<CronogramaEvent, 'id' | 'sourceKey'>) {
  return event.sourceKey ?? event.id;
}

export function getHarvestResumeDelay(job?: HarvestCompletionJob, now = Date.now()) {
  if (job?.startedAt === undefined || job.phase !== 'harvesting') return 0;
  const duration = job.reducedMotion
    ? HARVEST_REDUCED_MOTION_DURATION_MS
    : HARVEST_ANIMATION_DURATION_MS;
  return -Math.min(Math.max(0, now - job.startedAt), duration);
}

export function mergeHarvestCompletionSnapshots(
  events: CronogramaEvent[],
  jobs: HarvestCompletionJobs,
) {
  const activeJobs = Object.entries(jobs);
  if (activeJobs.length === 0) return events;

  const snapshots = new Map(activeJobs.map(([key, job]) => [key, job.event]));
  const renderedKeys = new Set<string>();
  const projected = events.map((event) => {
    const key = getHarvestEventKey(event);
    const snapshot = snapshots.get(key);
    if (!snapshot) return event;
    renderedKeys.add(key);
    return snapshot;
  });

  activeJobs.forEach(([key, job]) => {
    if (!renderedKeys.has(key)) projected.push(job.event);
  });

  return projected;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function moveFocusBeforeCardRemoval(eventKey: string) {
  if (typeof document === 'undefined' || !(document.activeElement instanceof HTMLElement)) return;
  const activeCard = document.activeElement.closest<HTMLElement>('[data-harvest-event-key]');
  if (activeCard?.dataset.harvestEventKey !== eventKey) return;
  document.getElementById('cronograma-view-panel')?.focus({ preventScroll: true });
}

export function useEventHarvestCompletion() {
  const [jobs, setJobs] = useState<HarvestCompletionJobs>({});
  const activeKeysRef = useRef(new Set<string>());
  const timersRef = useRef(new Map<string, number>());

  const prepare = useCallback((event: CronogramaEvent) => {
    const key = getHarvestEventKey(event);
    if (activeKeysRef.current.has(key)) return false;

    activeKeysRef.current.add(key);
    setJobs((current) => ({
      ...current,
      [key]: { event, phase: 'preparing', reducedMotion: false },
    }));
    return true;
  }, []);

  const cancel = useCallback((event: Pick<CronogramaEvent, 'id' | 'sourceKey'>) => {
    const key = getHarvestEventKey(event);
    const timer = timersRef.current.get(key);
    if (timer !== undefined) window.clearTimeout(timer);
    timersRef.current.delete(key);
    activeKeysRef.current.delete(key);
    setJobs((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const play = useCallback((
    event: CronogramaEvent,
    onFinish?: (event: CronogramaEvent) => void,
  ) => {
    const key = getHarvestEventKey(event);
    if (!activeKeysRef.current.has(key)) return 0;

    const reducedMotion = prefersReducedMotion();
    const duration = reducedMotion
      ? HARVEST_REDUCED_MOTION_DURATION_MS
      : HARVEST_ANIMATION_DURATION_MS;
    const startedAt = Date.now();

    setJobs((current) => ({
      ...current,
      [key]: { event, phase: 'harvesting', reducedMotion, startedAt },
    }));

    const previousTimer = timersRef.current.get(key);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    const timer = window.setTimeout(() => {
      moveFocusBeforeCardRemoval(key);
      timersRef.current.delete(key);
      activeKeysRef.current.delete(key);
      setJobs((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
      onFinish?.(event);
    }, duration);
    timersRef.current.set(key, timer);
    return duration;
  }, []);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
    activeKeysRef.current.clear();
  }, []);

  return { jobs, prepare, play, cancel };
}
