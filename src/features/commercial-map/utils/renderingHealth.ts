/** Lightweight production diagnostics. No frame histories or renderer references are retained. */
export const COMMERCIAL_MAP_RENDER_HEALTH_EVENT = 'commercial-map-render-health';
export const COMMERCIAL_MAP_RENDER_RETRY_EVENT = 'commercial-map-render-retry';

export type RenderPath = 'post' | 'direct' | 'suspended';
export type RenderHealthStatus = 'ready' | 'degraded' | 'context-lost' | 'recovering' | 'failed';

export interface CommercialMapRenderHealth {
  status: RenderHealthStatus;
  path: RenderPath;
  presentedFrames: number;
  contextLosses: number;
  lastErrorCode: string | null;
}

const publishedHealth = new WeakMap<HTMLCanvasElement, {
  snapshot: CommercialMapRenderHealth;
  publishedAt: number;
}>();
const latestHealth = new WeakMap<HTMLCanvasElement, CommercialMapRenderHealth>();
const COUNTER_UPDATE_INTERVAL_MS = 1000;

/** Publish transitions immediately, but avoid DOM writes/events on every frame. */
export function publishCommercialMapRenderHealth(
  canvas: HTMLCanvasElement,
  health: CommercialMapRenderHealth,
): void {
  const latest = latestHealth.get(canvas);
  if (latest) Object.assign(latest, health);
  else latestHealth.set(canvas, { ...health });
  const previous = publishedHealth.get(canvas);
  const now = performance.now();
  if (previous) {
    const snapshot = previous.snapshot;
    const sameState = snapshot.status === health.status
      && snapshot.path === health.path
      && snapshot.contextLosses === health.contextLosses
      && snapshot.lastErrorCode === health.lastErrorCode;
    if (sameState && (
      snapshot.presentedFrames === health.presentedFrames
      || now - previous.publishedAt < COUNTER_UPDATE_INTERVAL_MS
    )) return;
  }

  const snapshot = { ...health };
  publishedHealth.set(canvas, { snapshot, publishedAt: now });
  canvas.dataset.commercialMapRenderHealth = JSON.stringify(snapshot);
  const EventConstructor = canvas.ownerDocument.defaultView?.CustomEvent ?? CustomEvent;
  canvas.dispatchEvent(new EventConstructor(COMMERCIAL_MAP_RENDER_HEALTH_EVENT, {
    bubbles: true,
    detail: snapshot,
  }));
}

/**
 * Unthrottled in-memory successful screen-target draw state. A submitted draw
 * is not proof of browser-compositor pixel presentation; visual QA is separate.
 * Reading a copy lets diagnostics retain a bounded historical snapshot safely.
 */
export function readLatestCommercialMapRenderHealth(
  canvas: HTMLCanvasElement | null,
): CommercialMapRenderHealth | null {
  const latest = canvas ? latestHealth.get(canvas) : undefined;
  return latest ? { ...latest } : readCommercialMapRenderHealth(canvas);
}

/** Read the most recent published snapshot, including when the notice mounts after the renderer. */
export function readCommercialMapRenderHealth(
  canvas: HTMLCanvasElement | null,
): CommercialMapRenderHealth | null {
  const serialized = canvas?.dataset.commercialMapRenderHealth;
  if (!serialized) return null;
  try {
    const health: unknown = JSON.parse(serialized);
    if (!health || typeof health !== 'object') return null;
    const candidate = health as Record<string, unknown>;
    if (typeof candidate.status !== 'string'
      || !['ready', 'degraded', 'context-lost', 'recovering', 'failed'].includes(candidate.status)
      || typeof candidate.path !== 'string'
      || !['post', 'direct', 'suspended'].includes(candidate.path)
      || typeof candidate.presentedFrames !== 'number'
      || !Number.isSafeInteger(candidate.presentedFrames)
      || candidate.presentedFrames < 0
      || typeof candidate.contextLosses !== 'number'
      || !Number.isSafeInteger(candidate.contextLosses)
      || candidate.contextLosses < 0
      || (candidate.lastErrorCode !== null && typeof candidate.lastErrorCode !== 'string')) return null;
    return candidate as unknown as CommercialMapRenderHealth;
  } catch {
    return null;
  }
}
