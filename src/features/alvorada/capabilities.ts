export interface AlvoradaQualityProfile {
  antialias: boolean;
  buildingCount: number;
  cloudCount: number;
  dpr: [number, number];
  mobile: boolean;
  shadowMapSize: number;
  shadows: boolean;
  treeCount: number;
}

interface NavigatorPerformanceHints extends Navigator {
  deviceMemory?: number;
}

const ALVORADA_CRITICAL_ASSETS = [
  '/alvorada/earth-day-2048.jpg',
  '/alvorada/earth-night-lights-2048.png',
  '/alvorada/earth-normal-2048.jpg',
  '/alvorada/earth-clouds-1024.png',
] as const;

const ALVORADA_DATA_ASSETS = [
  '/alvorada/brazil-min.geojson',
  '/alvorada/rio-grande-do-sul-min.geojson',
  '/alvorada/santa-rosa-min.geojson',
  '/alvorada/santa-rosa-roads.json',
  '/alvorada/helvetiker-bold.typeface.json',
] as const;

let assetsWarmed = false;

export function warmAlvoradaAssets() {
  if (assetsWarmed || typeof window === 'undefined') return;
  assetsWarmed = true;

  ALVORADA_CRITICAL_ASSETS.forEach((source) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = source;
  });
  ALVORADA_DATA_ASSETS.forEach((source) => {
    void fetch(source, { cache: 'force-cache' }).catch(() => undefined);
  });
}

export function supportsAlvoradaWebGL() {
  if (typeof document === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    if (typeof window.WebGL2RenderingContext === 'undefined') return false;
    const context = canvas.getContext('webgl2', {
      failIfMajorPerformanceCaveat: true,
      powerPreference: 'high-performance',
    });
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}

export function getAlvoradaQualityProfile(): AlvoradaQualityProfile {
  const coarsePointer = typeof window !== 'undefined'
    && window.matchMedia?.('(pointer: coarse)').matches;
  const narrowViewport = typeof window !== 'undefined' && window.innerWidth < 760;
  const navigatorHints = typeof navigator === 'undefined'
    ? undefined
    : navigator as NavigatorPerformanceHints;
  const lowMemory = (navigatorHints?.deviceMemory ?? 8) <= 3;
  const lowConcurrency = (navigatorHints?.hardwareConcurrency ?? 8) <= 4;
  const mobile = Boolean(coarsePointer || narrowViewport);
  const reduced = mobile || lowMemory || lowConcurrency;

  return {
    antialias: !reduced,
    buildingCount: reduced ? 320 : 780,
    cloudCount: reduced ? 7 : 13,
    dpr: reduced ? [0.75, 1.1] : [1, 1.5],
    mobile,
    shadowMapSize: reduced ? 512 : 1024,
    shadows: !reduced,
    treeCount: reduced ? 320 : 680,
  };
}

export function prefersReducedAlvoradaMotion() {
  return typeof window !== 'undefined'
    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}
