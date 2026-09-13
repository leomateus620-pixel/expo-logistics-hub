/**
 * Diagnostic telemetry for the embedded Alvorada intro.
 *
 * Every lifecycle milestone is timestamped relative to the intro mount and kept
 * in memory on `window.__alvoradaIntroTelemetry`, so QA can read the exact
 * reason a presentation degraded on a real device (devtools console, remote
 * inspection or the `data-*` attributes mirrored on the DOM). Console output is
 * emitted only in development or when the debug flag is enabled
 * (`?alvorada-debug` in the URL or `localStorage['alvorada:debug'] = '1'`), so
 * production never logs by default.
 */

export type AlvoradaIntroTelemetryEvent =
  | 'intro-mounted'
  | 'assets-warm-start'
  | 'assets-warm-end'
  | 'asset-progress'
  | 'asset-failed'
  | 'canvas-created'
  | 'context-created'
  | 'critical-assets-ready'
  | 'shader-compile-start'
  | 'shader-compile-end'
  | 'first-frame'
  | 'renderer-ready'
  | 'globe-start'
  | 'approach-start'
  | 'alvorada-start'
  | 'watchdog-progress'
  | 'fallback-triggered'
  | 'stage-invariant-violation'
  | 'quality-degraded'
  | 'frame-clamped'
  | 'finished';

export interface AlvoradaIntroTelemetryEnvironment {
  containerHeight: number | null;
  containerWidth: number | null;
  devicePixelRatio: number;
  firstFrameMs: number | null;
  qualityProfile: string | null;
  rendererTier: string | null;
  shaderPreparationMs: number | null;
  staticReason: string | null;
  webglVersion: string | null;
}

export interface AlvoradaIntroTelemetryEntry {
  at: number;
  detail?: Record<string, unknown>;
  name: AlvoradaIntroTelemetryEvent;
}

export interface AlvoradaIntroTelemetryRecord {
  environment: AlvoradaIntroTelemetryEnvironment;
  events: AlvoradaIntroTelemetryEntry[];
  startedAt: number;
}

export interface AlvoradaIntroTelemetry {
  readonly record: AlvoradaIntroTelemetryRecord;
  /** Milliseconds since the intro mounted. */
  elapsed(): number;
  mark(name: AlvoradaIntroTelemetryEvent, detail?: Record<string, unknown>): void;
  setEnvironment(patch: Partial<AlvoradaIntroTelemetryEnvironment>): void;
}

declare global {
  interface Window {
    __alvoradaIntroTelemetry?: AlvoradaIntroTelemetryRecord;
  }
}

const DEBUG_STORAGE_KEY = 'alvorada:debug';
const DEBUG_QUERY_FLAG = 'alvorada-debug';
const NOISY_EVENTS: ReadonlySet<AlvoradaIntroTelemetryEvent> = new Set(['asset-progress', 'watchdog-progress']);

export function isAlvoradaDebugEnabled() {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.DEV) return true;
  try {
    if (new URLSearchParams(window.location.search).has(DEBUG_QUERY_FLAG)) return true;
    return window.localStorage?.getItem(DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function createAlvoradaIntroTelemetry(): AlvoradaIntroTelemetry {
  const startedAt = now();
  const record: AlvoradaIntroTelemetryRecord = {
    environment: {
      containerHeight: null,
      containerWidth: null,
      devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio ?? 1,
      firstFrameMs: null,
      qualityProfile: null,
      rendererTier: null,
      shaderPreparationMs: null,
      staticReason: null,
      webglVersion: null,
    },
    events: [],
    startedAt,
  };
  const debug = isAlvoradaDebugEnabled();
  if (typeof window !== 'undefined') window.__alvoradaIntroTelemetry = record;

  const elapsed = () => Math.round(now() - startedAt);

  return {
    record,
    elapsed,
    mark(name, detail) {
      const entry: AlvoradaIntroTelemetryEntry = { at: elapsed(), name };
      if (detail) entry.detail = detail;
      record.events.push(entry);
      if (debug && !NOISY_EVENTS.has(name)) {
        console.debug(`[alvorada] ${String(entry.at).padStart(6)}ms ${name}`, detail ?? '');
      }
    },
    setEnvironment(patch) {
      Object.assign(record.environment, patch);
    },
  };
}
