import type { AlvoradaWebGLTier } from './types';
import { warmAlvoradaIntroAssets } from './alvoradaAssets';

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
  /**
   * Texture resolution tier, fixed by the device profile. Unlike `mobile`
   * (which embedded hosts may adapt to a narrow container for framing), the
   * tier never changes after warming so the scene consumes what was warmed.
   */
  textureTier: 'desktop' | 'mobile';
  treeCount: number;
}

interface NavigatorPerformanceHints extends Navigator {
  deviceMemory?: number;
}

/**
 * Starts the shared asset pipeline for the texture tier this device will use.
 * The scene consumes the same downloads later, so nothing is requested twice.
 */
export function warmAlvoradaAssets() {
  if (typeof window === 'undefined') return;
  warmAlvoradaIntroAssets(getAlvoradaQualityProfile().mobile);
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
    antialias: !compatibleRenderer && !mobile,
    buildingCount: compatibleRenderer ? 1800 : mobile ? 3000 : reduced ? 4200 : 9000,
    bloom: !compatibleRenderer && !mobile && !reduced,
    cloudCount: compatibleRenderer ? 4 : mobile ? 5 : reduced ? 7 : 13,
    dpr: compatibleRenderer
      ? [0.75, 1]
      : mobile
        ? [0.85, 1.25]
        : reduced
          ? [0.9, 1.4]
          : [1, 1.85],
    level,
    mobile,
    postprocessing: !compatibleRenderer && !mobile,
    shadowMapSize: compatibleRenderer ? 512 : reduced ? 1024 : 2048,
    shadows: !compatibleRenderer && !mobile && !lowMemory,
    terrainSegments: compatibleRenderer ? 56 : mobile ? 72 : reduced ? 96 : 128,
    textureTier: mobile ? 'mobile' : 'desktop',
    treeCount: compatibleRenderer ? 500 : mobile ? 900 : reduced ? 1400 : 4500,
  };
}

/**
 * Applies one durable runtime downgrade. PerformanceMonitor calls this only
 * when a sustained decline is detected, so React work is limited to at most
 * two scene rebuilds (high -> medium -> low), never one update per frame.
 */
export function degradeAlvoradaQualityProfile(
  current: AlvoradaQualityProfile,
): AlvoradaQualityProfile {
  if (current.level === 'low') return current;

  if (current.level === 'high') {
    return {
      ...current,
      antialias: !current.mobile,
      bloom: false,
      buildingCount: Math.min(current.buildingCount, current.mobile ? 2400 : 5400),
      cloudCount: Math.min(current.cloudCount, current.mobile ? 5 : 7),
      dpr: current.mobile ? [0.8, 1.1] : [0.85, 1.45],
      level: 'medium',
      postprocessing: !current.mobile,
      shadowMapSize: Math.min(current.shadowMapSize, 1024),
      shadows: false,
      terrainSegments: Math.min(current.terrainSegments, current.mobile ? 64 : 96),
      treeCount: Math.min(current.treeCount, current.mobile ? 700 : 1800),
    };
  }

  return {
    ...current,
    antialias: false,
    bloom: false,
    buildingCount: Math.min(current.buildingCount, current.mobile ? 1600 : 2600),
    cloudCount: Math.min(current.cloudCount, 4),
    dpr: [0.75, 1],
    level: 'low',
    postprocessing: false,
    shadowMapSize: 512,
    shadows: false,
    terrainSegments: Math.min(current.terrainSegments, current.mobile ? 48 : 64),
    treeCount: Math.min(current.treeCount, current.mobile ? 450 : 700),
  };
}
