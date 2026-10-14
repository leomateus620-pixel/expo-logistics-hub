/** A single track moves rightward at a measured, constant pixel speed. */
export const GALLERY_SESSION_KEY = 'fenasoja.portal.visual-history.v2';

export type GalleryPhase = 'waiting' | 'running' | 'paused' | 'empty';

export interface GallerySnapshot {
  phase: GalleryPhase;
  artIds: readonly string[];
  anchorId: string | null;
  anchorIndex: number;
  /** Fractional strides into the chronological cycle, normalized to [0, N). */
  positionUnits: number;
  anchorLeftPx: number;
  offsetPx: number;
  durationMs: number;
  currentTimeMs: number;
  stepPx: number;
  groupLengthPx: number;
  running: boolean;
  userPaused: boolean;
}

export interface GallerySession {
  version: 2;
  artIds: string[];
  positionUnits: number;
  anchorId: string;
  userPaused: boolean;
}

export type GallerySessionStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface GalleryConfiguration {
  artIds: readonly string[];
  stepPx: number;
  speedPxPerSecond: number;
}

export interface GalleryTimelineOptions extends GalleryConfiguration {
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
  setUserPaused: (paused: boolean) => void;
  reconfigure: (configuration: GalleryConfiguration) => void;
  attachAnimation: (animation: Animation | null) => void;
  dispose: () => void;
}

let unavailableStorageSession: GallerySession | null = null;

const browserSessionStorage = (): GallerySessionStorage | null => {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; }
  catch { return null; }
};

const validArtIds = (ids: readonly string[]) => [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
const positive = (value: number, fallback: number) => Number.isFinite(value) && value > 0 ? value : fallback;

function normalizeUnits(units: number, count: number): number {
  if (!count) return units;
  let result = ((units % count) + count) % count;
  // Floating-point arithmetic at a scheduled stride boundary must not produce
  // an almost-zero timer or report the previous artwork for one extra tick.
  if (Math.abs(result - Math.round(result)) < 1e-8) result = Math.round(result) % count;
  return result;
}

export const getGalleryDuration = (count: number, stepPx: number, speedPxPerSecond: number) => (
  count > 0 ? count * positive(stepPx, 116) / positive(speedPxPerSecond, 16) * 1_000 : 0
);

export function readGallerySession(storage: GallerySessionStorage | null = browserSessionStorage()): GallerySession | null {
  try {
    const raw = storage?.getItem(GALLERY_SESSION_KEY);
    const value: unknown = storage ? (raw ? JSON.parse(raw) : null) : unavailableStorageSession;
    if (!value || typeof value !== 'object') return null;
    const session = value as Partial<GallerySession>;
    if (session.version !== 2 || !Array.isArray(session.artIds)) return null;
    if (typeof session.positionUnits !== 'number' || !Number.isFinite(session.positionUnits) || session.positionUnits < 0) return null;
    if (typeof session.userPaused !== 'boolean' || typeof session.anchorId !== 'string') return null;
    const artIds = validArtIds(session.artIds);
    if (!artIds.length || artIds.length !== session.artIds.length || !artIds.includes(session.anchorId)) return null;
    const fraction = session.positionUnits % 1;
    return { version: 2, artIds, anchorId: session.anchorId, positionUnits: artIds.indexOf(session.anchorId) + fraction, userPaused: session.userPaused };
  } catch { return unavailableStorageSession; }
}

/** Preserve the actual anchor's identity and its fractional left position. */
function mapPosition(oldIds: readonly string[], units: number, nextIds: readonly string[]): number {
  if (!nextIds.length || !oldIds.length) return units;
  const current = normalizeUnits(units, oldIds.length);
  const index = Math.floor(current);
  const fraction = current % 1;
  const retained = nextIds.indexOf(oldIds[index]);
  if (retained >= 0) return retained + fraction;
  for (let distance = 1; distance <= oldIds.length; distance += 1) {
    const next = nextIds.indexOf(oldIds[(index + distance) % oldIds.length]);
    if (next >= 0) return next + fraction;
  }
  return fraction;
}

/**
 * Continuous phase clock, one boundary timer per stride, no React updates per
 * frame. Root owns visibility/release gates and one infinite WAAPI track.
 * resize changes pixels and speed while preserving the anchor and fraction.
 */
export function createGalleryTimeline(options: GalleryTimelineOptions): GalleryTimeline {
  const storage = options.storage === undefined ? browserSessionStorage() : options.storage;
  const now = options.now ?? (() => performance.now());
  const setTimer = options.setTimer ?? ((callback, delay) => window.setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((timer) => window.clearTimeout(timer));
  const restored = readGallerySession(storage);
  let artIds = validArtIds(options.artIds);
  let lastArtIds = artIds.length ? artIds : restored?.artIds ?? [];
  let units = restored ? mapPosition(restored.artIds, restored.positionUnits, artIds) : 0;
  let stepPx = positive(options.stepPx, 116);
  let speedPxPerSecond = positive(options.speedPxPerSecond, 16);
  let userPaused = restored?.userPaused ?? false;
  // Explicit pause/unpause choices can precede intro release. Preserve both
  // values without recording an untouched, offscreen gallery as started.
  let preferenceTouched = false;
  let started = restored !== null;
  let running = false;
  let disposed = false;
  let resumedAt = 0;
  let timer: number | null = null;
  let animation: Animation | null = null;

  const currentUnits = () => normalizeUnits(
    units + (running ? Math.max(0, now() - resumedAt) * speedPxPerSecond / stepPx / 1_000 : 0),
    artIds.length || lastArtIds.length,
  );

  const getSnapshot = (): GallerySnapshot => {
    const positionUnits = artIds.length ? currentUnits() : 0;
    const anchorIndex = artIds.length ? Math.floor(positionUnits) : -1;
    const groupLengthPx = artIds.length * stepPx;
    return {
      phase: !artIds.length ? 'empty' : !started ? 'waiting' : running ? 'running' : 'paused',
      artIds, anchorIndex, anchorId: artIds[anchorIndex] ?? null, positionUnits,
      anchorLeftPx: (positionUnits % 1) * stepPx,
      offsetPx: artIds.length ? -2 * groupLengthPx + stepPx + positionUnits * stepPx : 0,
      durationMs: getGalleryDuration(artIds.length, stepPx, speedPxPerSecond),
      currentTimeMs: artIds.length ? positionUnits * stepPx / speedPxPerSecond * 1_000 : 0,
      stepPx, groupLengthPx, running, userPaused,
    };
  };

  const capture = () => { units = currentUnits(); resumedAt = now(); };
  const clearBoundary = () => { if (timer !== null) clearTimer(timer); timer = null; };

  const persist = () => {
    if ((!started && !preferenceTouched) || !lastArtIds.length) return;
    const positionUnits = normalizeUnits(units, lastArtIds.length);
    const session: GallerySession = {
      version: 2, artIds: [...lastArtIds], positionUnits,
      anchorId: lastArtIds[Math.floor(positionUnits)], userPaused,
    };
    try {
      if (storage) storage.setItem(GALLERY_SESSION_KEY, JSON.stringify(session));
      else unavailableStorageSession = session;
    } catch { unavailableStorageSession = session; }
  };

  const syncAnimation = () => {
    if (!animation) return;
    animation.currentTime = getSnapshot().currentTimeMs;
    if (running) animation.play(); else animation.pause();
  };

  const scheduleBoundary = () => {
    clearBoundary();
    if (!running || disposed || !artIds.length) return;
    const fraction = currentUnits() % 1;
    const delay = (1 - fraction) * stepPx / speedPxPerSecond * 1_000;
    timer = setTimer(() => {
      timer = null;
      if (!running || disposed) return;
      capture();
      persist();
      options.onChange(getSnapshot());
      scheduleBoundary();
    }, delay);
  };

  const resume = () => {
    if (disposed || running || userPaused || !artIds.length) return;
    started = true;
    running = true;
    resumedAt = now();
    persist();
    syncAnimation();
    options.onChange(getSnapshot());
    scheduleBoundary();
  };

  const pause = () => {
    if (disposed || !running) return;
    capture();
    running = false;
    clearBoundary();
    persist();
    syncAnimation();
    options.onChange(getSnapshot());
  };

  const setUserPaused = (paused: boolean) => {
    if (disposed || paused === userPaused) return;
    if (running) capture();
    preferenceTouched = true;
    userPaused = paused;
    if (paused) { running = false; clearBoundary(); }
    persist();
    syncAnimation();
    options.onChange(getSnapshot());
    // Releasing a user pause does not bypass root's visibility/intro gates.
  };

  const reconfigure = (configuration: GalleryConfiguration) => {
    if (disposed) return;
    const nextIds = validArtIds(configuration.artIds);
    const nextStep = positive(configuration.stepPx, 116);
    const nextSpeed = positive(configuration.speedPxPerSecond, 16);
    if (nextStep === stepPx && nextSpeed === speedPxPerSecond
      && nextIds.length === artIds.length && nextIds.every((id, index) => id === artIds[index])) return;
    capture();
    clearBoundary();
    units = mapPosition(lastArtIds, units, nextIds);
    artIds = nextIds;
    if (artIds.length) lastArtIds = artIds;
    else running = false;
    stepPx = nextStep;
    speedPxPerSecond = nextSpeed;
    persist();
    syncAnimation();
    options.onChange(getSnapshot());
    scheduleBoundary();
  };

  const attachAnimation = (next: Animation | null) => {
    if (next === animation) return;
    animation?.cancel();
    animation = disposed ? null : next;
    if (disposed) next?.cancel();
    else syncAnimation();
  };

  const dispose = () => {
    if (disposed) return;
    if (running) capture();
    running = false;
    disposed = true;
    clearBoundary();
    persist();
    animation?.cancel();
    animation = null;
  };

  return { getSnapshot, start: resume, resume, pause, setUserPaused, reconfigure, attachAnimation, dispose };
}
