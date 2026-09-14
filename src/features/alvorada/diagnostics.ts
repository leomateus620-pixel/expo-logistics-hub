import { getAlvoradaAssetDiagnostics } from './alvoradaAssets';
import { ALVORADA_RUNTIME_VERSION } from './introTelemetry';

export function isAlvoradaDiagnosticRequested() {
  return typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('alvorada-debug') === '1';
}

function browserIdentity(ua: string) {
  const browsers = [
    ['Edge', /(?:Edg|EdgiOS|EdgA)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ] as const;
  for (const [name, pattern] of browsers) {
    const match = ua.match(pattern);
    if (match) return { name, version: match[1] };
  }
  return { name: /AppleWebKit/.test(ua) ? 'WebKit/WebView' : 'unknown', version: null };
}

/** Explicit debug action only. Never run sacrificial probes during normal boot. */
function probe(api: 'webgl' | 'webgl2') {
  const canvas = document.createElement('canvas');
  try {
    const context = canvas.getContext(api, { failIfMajorPerformanceCaveat: false, powerPreference: 'default' }) as WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!context) return { available: false, result: 'null-context' };
    const result = { available: true, result: 'created', maxTextureSize: context.getParameter(context.MAX_TEXTURE_SIZE) as number };
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return result;
  } catch { return { available: false, result: 'creation-threw' }; }
}

/** Local, user-initiated report: no cookies, identity, tokens, storage values,
 * application records, location, referrer or network request headers. */
export async function collectAlvoradaDiagnostic() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const ua = nav.userAgent;
  const record = window.__alvoradaIntroTelemetry;
  const intro = document.querySelector<HTMLElement>('[data-testid="alvorada-intro"]');
  const canvas = intro?.querySelector<HTMLCanvasElement>('canvas');
  const ancestors = [];
  let node: HTMLElement | null = intro ?? document.querySelector('.fenasoja-portal__hero');
  for (let i = 0; node && i < 6; i++, node = node.parentElement) {
    const css = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    ancestors.push({ tag: node.tagName, width: rect.width, height: rect.height,
      contain: css.contain, containerType: css.containerType,
      contentVisibility: css.contentVisibility, transform: css.transform, overflow: css.overflow });
  }
  let worker: { controlled: boolean; script: string | null } | null = null;
  try {
    const controller = nav.serviceWorker?.controller;
    worker = { controlled: Boolean(controller), script: controller ? new URL(controller.scriptURL).pathname : null };
  } catch { /* Restricted WebViews may deny service-worker inspection. */ }
  const actual = record?.environment.context;
  const webgl2 = actual?.webglVersion === 'webgl2'
    ? { available: true, result: 'active-canonical-context', maxTextureSize: actual.maxTextureSize }
    : probe('webgl2');
  const entries = record?.events ?? [];
  return {
    schema: 1,
    capturedAt: new Date().toISOString(),
    build: { appVersion: import.meta.env.VITE_APP_VERSION ?? 'unknown', gitCommit: import.meta.env.VITE_GIT_COMMIT ?? 'unknown', alvoradaRuntimeVersion: ALVORADA_RUNTIME_VERSION },
    browser: browserIdentity(ua), userAgent: ua,
    os: /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1) ? 'iOS/iPadOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown',
    viewport: { width: innerWidth, height: innerHeight }, dpr: devicePixelRatio,
    hardwareConcurrency: nav.hardwareConcurrency ?? null, deviceMemory: nav.deviceMemory ?? null,
    prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    webgl1: probe('webgl'), webgl2,
    // WebGL1 availability is reported, not misrepresented as supported by r170.
    rendererRequirement: 'Three r170 requires WebGL2',
    engine: intro?.dataset.visualEngine ?? entries.filter(e => e.name === 'engine-selected').at(-1)?.detail?.engine ?? 'unknown',
    environment: record?.environment ?? null,
    criticalAssetResult: entries.filter(e => e.name === 'critical-assets-ready' || (e.name === 'asset-failed' && e.detail?.critical)).at(-1) ?? null,
    contextLossCount: entries.filter(e => e.name === 'context-lost').length,
    fallbackReason: record?.environment.staticReason ?? null,
    stageHistory: entries.filter(e => ['globe-start', 'approach-start', 'alvorada-start', 'finished'].includes(e.name)),
    engineHistory: entries.filter(e => ['engine-selected', 'fallback-triggered', 'recovery-start', 'recovery-complete'].includes(e.name)),
    canvas: canvas ? { ...canvas.dataset } : null,
    ancestors, serviceWorker: worker, assets: getAlvoradaAssetDiagnostics(),
    events: entries, droppedEvents: record?.droppedEvents ?? 0,
  };
}
