/** The gallery clock advances only while its card is visible and released. */
export const GALLERY_REVEAL_MS = 600;
export const GALLERY_HIGHLIGHT_MS = 1_400;
export const GALLERY_CLOSING_MS = 1_600;
export const GALLERY_SESSION_KEY = 'fenasoja.portal.visual-history.v1';

export type GalleryPhase = 'waiting' | 'reveal' | 'highlight' | 'closing' | 'done';

export interface GallerySnapshot {
  phase: GalleryPhase;
  activeIndex: number;
  artIds: readonly string[];
  elapsedMs: number;
  phaseElapsedMs: number;
  durationMs: number;
  running: boolean;
}

export interface GallerySession {
  version: 1;
  artIds: string[];
  elapsedMs: number;
  status: 'playing' | 'done';
}

export type GallerySessionStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface GalleryTimelineOptions {
  /** Already decoded, valid artwork IDs; these are locked when the cycle starts. */
  artIds: readonly string[];
  onChange: (snapshot: GallerySnapshot) => void;
  storage?: GallerySessionStorage | null;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => number;
  clearTimer?: (timer: number) => void;
}

export interface GalleryTimeline {
  getSnapshot: () => GallerySnapshot;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reconfigure: (artIds: readonly string[]) => void;
  dispose: () => void;
}

// Private browsing can deny sessionStorage. Keep once-per-session behavior for
// route changes in that case without making access to the portal depend on it.
let unavailableStorageSession: GallerySession | null = null;

const browserSessionStorage = (): GallerySessionStorage | null => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

const validArtIds = (ids: readonly string[]): string[] => (
  [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))]
);

export const getGalleryDuration = (artCount: number): number => (
  artCount > 0 ? GALLERY_REVEAL_MS + artCount * GALLERY_HIGHLIGHT_MS + GALLERY_CLOSING_MS : 0
);

export function readGallerySession(
  storage: GallerySessionStorage | null = browserSessionStorage(),
): GallerySession | null {
  try {
    const raw = storage ? storage.getItem(GALLERY_SESSION_KEY) : null;
    const value: unknown = storage ? (raw ? JSON.parse(raw) : null) : unavailableStorageSession;
    if (!value || typeof value !== 'object') return null;
    const session = value as Partial<GallerySession>;
    if (session.version !== 1 || !Array.isArray(session.artIds)) return null;
    if (session.status !== 'playing' && session.status !== 'done') return null;
    if (typeof session.elapsedMs !== 'number' || !Number.isFinite(session.elapsedMs) || session.elapsedMs < 0) return null;
    const artIds = validArtIds(session.artIds);
    if ((!artIds.length && session.status !== 'done') || artIds.length !== session.artIds.length) return null;
    return {
      version: 1,
      artIds,
      elapsedMs: Math.min(session.elapsedMs, getGalleryDuration(artIds.length)),
      status: session.status,
    };
  } catch {
    return unavailableStorageSession;
  }
}

/** Remove failed assets from a restored order without replaying earlier items. */
function projectElapsed(session: GallerySession, artIds: readonly string[]): number {
  const highlightEnd = GALLERY_REVEAL_MS + session.artIds.length * GALLERY_HIGHLIGHT_MS;
  if (session.elapsedMs < GALLERY_REVEAL_MS) return session.elapsedMs;
  if (session.elapsedMs >= highlightEnd) {
    return GALLERY_REVEAL_MS + artIds.length * GALLERY_HIGHLIGHT_MS + session.elapsedMs - highlightEnd;
  }

  const highlightElapsed = session.elapsedMs - GALLERY_REVEAL_MS;
  const originalIndex = Math.floor(highlightElapsed / GALLERY_HIGHLIGHT_MS);
  const activeIndex = artIds.indexOf(session.artIds[originalIndex]);
  if (activeIndex >= 0) {
    return GALLERY_REVEAL_MS + activeIndex * GALLERY_HIGHLIGHT_MS
      + highlightElapsed % GALLERY_HIGHLIGHT_MS;
  }
  const nextId = session.artIds.slice(originalIndex + 1).find((id) => artIds.includes(id));
  const nextIndex = nextId ? artIds.indexOf(nextId) : artIds.length;
  return GALLERY_REVEAL_MS + nextIndex * GALLERY_HIGHLIGHT_MS;
}

/**
 * One boundary timer, no animation-frame state updates. The visual component
 * owns CSS/WAAPI interpolation and pauses it using phaseElapsedMs. Creating a
 * controller does not mark the session; start/resume must follow visibility and
 * Alvorada release. dispose persists the exact elapsed time before cleanup.
 */
export function createGalleryTimeline(options: GalleryTimelineOptions): GalleryTimeline {
  const storage = options.storage === undefined ? browserSessionStorage() : options.storage;
  const now = options.now ?? (() => performance.now());
  const setTimer = options.setTimer ?? ((callback, delay) => window.setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((timer) => window.clearTimeout(timer));
  const restored = readGallerySession(storage);
  const available = validArtIds(options.artIds);
  let artIds = restored
    ? restored.artIds.filter((id) => available.includes(id))
    : available;
  let durationMs = getGalleryDuration(artIds.length);
  let elapsedMs = restored ? Math.min(projectElapsed(restored, artIds), durationMs) : 0;
  if (restored?.status === 'done') elapsedMs = durationMs;
  let started = restored !== null;
  let running = false;
  let disposed = false;
  let resumedAt = 0;
  let timer: number | null = null;

  const currentElapsed = () => Math.min(
    durationMs,
    elapsedMs + (running ? Math.max(0, now() - resumedAt) : 0),
  );

  const getSnapshot = (): GallerySnapshot => {
    const elapsed = currentElapsed();
    let phase: GalleryPhase = 'done';
    let activeIndex = -1;
    let phaseElapsedMs = 0;
    if (durationMs > 0 && elapsed < durationMs) {
      if (!started) phase = 'waiting';
      else if (elapsed < GALLERY_REVEAL_MS) {
        phase = 'reveal';
        phaseElapsedMs = elapsed;
      } else if (elapsed < GALLERY_REVEAL_MS + artIds.length * GALLERY_HIGHLIGHT_MS) {
        phase = 'highlight';
        const highlightElapsed = elapsed - GALLERY_REVEAL_MS;
        activeIndex = Math.floor(highlightElapsed / GALLERY_HIGHLIGHT_MS);
        phaseElapsedMs = highlightElapsed % GALLERY_HIGHLIGHT_MS;
      } else {
        phase = 'closing';
        phaseElapsedMs = elapsed - GALLERY_REVEAL_MS - artIds.length * GALLERY_HIGHLIGHT_MS;
      }
    }
    return { phase, activeIndex, artIds, elapsedMs: elapsed, phaseElapsedMs, durationMs, running };
  };

  const persist = () => {
    if (!started) return;
    const session: GallerySession = {
      version: 1,
      artIds: [...artIds],
      elapsedMs,
      status: elapsedMs >= durationMs ? 'done' : 'playing',
    };
    try {
      if (storage) storage.setItem(GALLERY_SESSION_KEY, JSON.stringify(session));
      else unavailableStorageSession = session;
    } catch {
      unavailableStorageSession = session;
    }
  };

  const clearBoundary = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const captureElapsed = () => {
    elapsedMs = currentElapsed();
    resumedAt = now();
  };

  const scheduleBoundary = () => {
    clearBoundary();
    if (!running || disposed) return;
    const snapshot = getSnapshot();
    const boundary = snapshot.phase === 'reveal'
      ? GALLERY_REVEAL_MS
      : snapshot.phase === 'highlight'
        ? GALLERY_REVEAL_MS + (snapshot.activeIndex + 1) * GALLERY_HIGHLIGHT_MS
        : durationMs;
    timer = setTimer(() => {
      timer = null;
      if (!running || disposed) return;
      captureElapsed();
      if (elapsedMs >= durationMs) running = false;
      persist();
      options.onChange(getSnapshot());
      scheduleBoundary();
    }, Math.max(0, boundary - snapshot.elapsedMs));
  };

  const resume = () => {
    if (disposed || running || !artIds.length || elapsedMs >= durationMs) return;
    started = true;
    running = true;
    resumedAt = now();
    persist();
    options.onChange(getSnapshot());
    scheduleBoundary();
  };

  const pause = () => {
    if (disposed || !running) return;
    captureElapsed();
    running = false;
    clearBoundary();
    persist();
    options.onChange(getSnapshot());
  };

  const dispose = () => {
    if (disposed) return;
    if (running) captureElapsed();
    running = false;
    disposed = true;
    clearBoundary();
    persist();
  };

  const reconfigure = (nextIds: readonly string[]) => {
    if (disposed) return;
    const nextArtIds = validArtIds(nextIds);
    if (nextArtIds.length === artIds.length && nextArtIds.every((id, index) => id === artIds[index])) return;
    captureElapsed();
    clearBoundary();
    const wasDone = elapsedMs >= durationMs && started;
    const previous: GallerySession = {
      version: 1,
      artIds: [...artIds],
      elapsedMs,
      status: wasDone ? 'done' : 'playing',
    };
    artIds = nextArtIds;
    durationMs = getGalleryDuration(artIds.length);
    elapsedMs = !started ? 0 : wasDone ? durationMs : Math.min(projectElapsed(previous, artIds), durationMs);
    if (elapsedMs >= durationMs) running = false;
    persist();
    options.onChange(getSnapshot());
    scheduleBoundary();
  };

  return { getSnapshot, start: resume, pause, resume, reconfigure, dispose };
}
