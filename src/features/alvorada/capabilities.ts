import type { AlvoradaWebGLTier } from './types';

export interface AlvoradaQualityProfile {
  antialias: boolean;
  buildingCount: number;
  bloom: boolean;
  cloudCount: number;
  dpr: [number, number];
  level: 'high' | 'medium' | 'low';
  mobile: boolean;
  postprocessing: boolean;
  shadowMapSize: number;
  shadows: boolean;
  terrainSegments: number;
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
  '/alvorada/santa-rosa-horizon.webp',
  '/alvorada/santa-rosa-horizon-portrait.webp',
  '/alvorada/fenasoja-symbol-official.png',
] as const;

const ALVORADA_DATA_ASSETS = [
  '/alvorada/brazil-min.geojson',
  '/alvorada/rio-grande-do-sul-min.geojson',
  '/alvorada/santa-rosa-min.geojson',
  '/alvorada/santa-rosa-roads.json',
  '/alvorada/santa-rosa-city-v2.json',
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

function canCreateWebGL2Context(attributes: WebGLContextAttributes) {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', attributes);
    if (!context) return false;

    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function getAlvoradaWebGLTier(): AlvoradaWebGLTier {
  if (
    typeof document === 'undefined'
    || typeof window === 'undefined'
    || typeof window.WebGL2RenderingContext === 'undefined'
  ) {
    return 'unavailable';
  }

  if (canCreateWebGL2Context({
    failIfMajorPerformanceCaveat: true,
    powerPreference: 'high-performance',
  })) {
    return 'hardware';
  }

  return canCreateWebGL2Context({ powerPreference: 'default' })
    ? 'compatible'
    : 'unavailable';
}

export function getAlvoradaQualityProfile(
  rendererTier: AlvoradaWebGLTier = 'hardware',
): AlvoradaQualityProfile {
  const coarsePointer = typeof window !== 'undefined'
    && window.matchMedia?.('(pointer: coarse)').matches;
  const narrowViewport = typeof window !== 'undefined' && window.innerWidth < 760;
  const navigatorHints = typeof navigator === 'undefined'
    ? undefined
    : navigator as NavigatorPerformanceHints;
  const lowMemory = (navigatorHints?.deviceMemory ?? 8) <= 3;
  const lowConcurrency = (navigatorHints?.hardwareConcurrency ?? 8) <= 4;
  const mobile = Boolean(coarsePointer || narrowViewport);
  const compatibleRenderer = rendererTier === 'compatible';
  const reduced = compatibleRenderer || mobile || lowMemory || lowConcurrency;
  const level: AlvoradaQualityProfile['level'] = compatibleRenderer
    ? 'low'
    : reduced
      ? 'medium'
      : 'high';

  return {
    antialias: !compatibleRenderer,
    buildingCount: compatibleRenderer ? 3000 : reduced ? 5400 : 9000,
    bloom: !compatibleRenderer,
    cloudCount: compatibleRenderer ? 5 : reduced ? 7 : 13,
    dpr: compatibleRenderer ? [0.85, 1.2] : reduced ? [1, 1.5] : [1, 1.85],
    level,
    mobile,
    postprocessing: !compatibleRenderer,
    shadowMapSize: compatibleRenderer ? 512 : reduced ? 1024 : 2048,
    shadows: !compatibleRenderer && !lowMemory && (!mobile || !lowConcurrency),
    terrainSegments: compatibleRenderer ? 64 : reduced ? 96 : 128,
    treeCount: compatibleRenderer ? 1200 : reduced ? 3000 : 4500,
  };
}
