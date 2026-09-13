export type AlvoradaWebGLTier = 'hardware' | 'compatible' | 'unavailable';

export type AlvoradaRendererState = 'loading' | 'webgl' | 'recovering' | 'fallback';

export type AlvoradaFallbackReason =
  | 'unsupported-webgl'
  | 'context-lost'
  | 'render-error';

/**
 * Preparation milestones reported by the WebGL canvas while it gets ready.
 * The embedded intro feeds them to its watchdog (progress resets the stall
 * budget) and to the telemetry record.
 */
export type AlvoradaPreparationEventKind =
  | 'canvas-created'
  | 'context-created'
  | 'asset-progress'
  | 'asset-failed'
  | 'critical-assets-ready'
  | 'shader-compile-start'
  | 'shader-compile-end'
  | 'first-frame';

export interface AlvoradaPreparationEvent {
  detail?: Record<string, unknown>;
  kind: AlvoradaPreparationEventKind;
}
