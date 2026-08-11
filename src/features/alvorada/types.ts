export type AlvoradaWebGLTier = 'hardware' | 'compatible' | 'unavailable';

export type AlvoradaRendererState = 'loading' | 'webgl' | 'recovering' | 'fallback';

export type AlvoradaFallbackReason =
  | 'unsupported-webgl'
  | 'context-lost'
  | 'render-error';
