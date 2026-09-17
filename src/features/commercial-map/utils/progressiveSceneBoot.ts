/** One admitted scene commit at a time. Navigation always gets the next idle slot. */
export interface SceneHydrationTask {
  id: string;
  priority: number;
  run: (complete: () => void) => void;
}

export interface SceneHydrationHost {
  request: (callback: () => void) => () => void;
  canRun: () => boolean;
  onComplete?: () => void;
}

export function createSceneHydrationQueue(host: SceneHydrationHost) {
  const tasks = new Map<string, SceneHydrationTask>();
  let enabled = false;
  let disposed = false;
  let running: string | null = null;
  let cancelScheduled: (() => void) | null = null;
  let revision = 0;
  let completedRevision = -1;
  const schedule = () => {
    if (!enabled || disposed || running || cancelScheduled) return;
    if (!tasks.size) {
      if (completedRevision !== revision) {
        completedRevision = revision;
        host.onComplete?.();
      }
      return;
    }
    cancelScheduled = host.request(() => {
      cancelScheduled = null;
      if (disposed || !enabled) return;
      if (!host.canRun()) { schedule(); return; }
      const next = [...tasks.values()].sort((a, b) => a.priority - b.priority)[0];
      if (!next) { schedule(); return; }
      tasks.delete(next.id);
      running = next.id;
      let finished = false;
      next.run(() => {
        if (finished) return;
        finished = true;
        if (running === next.id) running = null;
        schedule();
      });
    });
  };
  return {
    add(task: SceneHydrationTask) {
      tasks.set(task.id, task);
      revision += 1;
      schedule();
      return () => {
        tasks.delete(task.id);
        if (running === task.id) running = null;
        schedule();
      };
    },
    start() { enabled = true; schedule(); },
    dispose() {
      disposed = true;
      tasks.clear();
      cancelScheduled?.();
    },
  };
}

/** Two responsive frame intervals after three successful draws qualify boot.
 * This is event-loop readiness, not a claim of measured input-to-photon latency. */
export function qualifiesInteractiveFrame(input: {
  presentedFrames: number;
  consecutiveResponsiveFrames: number;
  preparing: boolean;
  controlsInstalled: boolean;
  frameIntervalMs: number;
}) {
  return !input.preparing && input.controlsInstalled
    && input.presentedFrames >= 3 && input.consecutiveResponsiveFrames >= 2
    && input.frameIntervalMs > 0 && input.frameIntervalMs <= 100;
}

export function qualifiesCommercialMapReady(input: Parameters<typeof qualifiesInteractiveFrame>[0] & {
  essentialPrepared: boolean;
}) {
  return input.essentialPrepared && qualifiesInteractiveFrame(input);
}
