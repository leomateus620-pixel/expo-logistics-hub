import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlvoradaCanvas } from './AlvoradaCanvas';
import { AlvoradaBrandHero } from './AlvoradaBrandHero';
import { AlvoradaErrorBoundary, AlvoradaFallback } from './AlvoradaErrorBoundary';
import { HarvestBackdrop, type HarvestBackdropVariant } from './HarvestBackdrop';
import {
  degradeAlvoradaQualityProfile,
  getAlvoradaQualityProfile,
  getAlvoradaWebGLTier,
  warmAlvoradaAssets,
  type AlvoradaQualityProfile,
} from './capabilities';
import {
  ALVORADA_INTRO_BRAND_HOLD_MS,
  ALVORADA_INTRO_MAX_DURATION_MS,
  ALVORADA_INTRO_PREPARE_TIMEOUT_MS,
  clampAlvoradaIntroPhase,
  getAlvoradaIntroStage,
  getAlvoradaPhase,
  type AlvoradaIntroStage,
  type AlvoradaPhase,
} from './timeline';
import { useAlvoradaVisibleTimeouts } from './useAlvoradaVisibleTimeouts';
import type { AlvoradaFallbackReason, AlvoradaWebGLTier } from './types';
import './alvorada.css';
import './alvorada-intro.css';

export type AlvoradaIntroMotion = 'cinematic' | 'static';

export interface AlvoradaIntroProps {
  /** Visible time the dawn brand frame stays before `onFinished`. */
  brandHoldMs?: number;
  /**
   * `static` skips the camera travel (reduced motion, no WebGL) and presents
   * the dawn brand frame directly for the configured hold.
   */
  motion?: AlvoradaIntroMotion;
  /** Fired exactly once when the sequence is complete; the host restores the countdown. */
  onFinished: () => void;
  onStageChange?: (stage: AlvoradaIntroStage) => void;
}

type IntroRenderer = 'webgl' | 'static';
type IntroTimerKey = 'brand-hold' | 'max-duration' | 'prepare-timeout';
export type AlvoradaIntroStaticReason = AlvoradaFallbackReason | 'reduced-motion' | 'prepare-timeout';

const INTRO_TIMER_KEYS: readonly IntroTimerKey[] = ['brand-hold', 'max-duration', 'prepare-timeout'];
/** The static dawn fades the landscape in before its hold starts counting. */
const STATIC_DAWN_FADE_ALLOWANCE_MS = 700;
const NARROW_CONTAINER_WIDTH = 640;

interface ContainerFrame {
  height: number;
  width: number;
}

function frameVariant(frame: ContainerFrame | null): HarvestBackdropVariant {
  if (!frame || frame.width === 0 || frame.height === 0) return 'landscape';
  return frame.height / frame.width > 1.05 ? 'portrait' : 'landscape';
}

function adaptQualityToFrame(
  profile: AlvoradaQualityProfile,
  frame: ContainerFrame | null,
): AlvoradaQualityProfile {
  if (!frame || frame.width === 0 || profile.mobile || frame.width >= NARROW_CONTAINER_WIDTH) {
    return profile;
  }
  // A narrow card inside a wide window still needs the mobile framing so the
  // globe stays whole; the renderer budget follows the same profile.
  return { ...profile, mobile: true };
}

/**
 * Embedded Alvorada intro: planet → approach to Santa Rosa → dawn brand frame.
 * Reuses the authored WebGL journey and the DOM dawn composition inside any
 * positioned container. Stages advance on real renderer events; only the brand
 * hold and the safety limits are timers, all measured in visible time.
 */
export function AlvoradaIntro({
  brandHoldMs = ALVORADA_INTRO_BRAND_HOLD_MS,
  motion = 'cinematic',
  onFinished,
  onStageChange,
}: AlvoradaIntroProps) {
  const [rendererTier] = useState<AlvoradaWebGLTier>(() => (
    motion === 'static' ? 'unavailable' : getAlvoradaWebGLTier()
  ));
  const initialRenderer: IntroRenderer = rendererTier === 'unavailable' ? 'static' : 'webgl';
  const [renderer, setRenderer] = useState<IntroRenderer>(initialRenderer);
  const [staticReason, setStaticReason] = useState<AlvoradaIntroStaticReason | null>(() => (
    motion === 'static'
      ? 'reduced-motion'
      : rendererTier === 'unavailable'
        ? 'unsupported-webgl'
        : null
  ));
  const [stage, setStage] = useState<AlvoradaIntroStage>(
    initialRenderer === 'static' ? 'alvorada' : 'preparing',
  );
  const [phase, setPhase] = useState<AlvoradaPhase>(
    initialRenderer === 'static' ? 'brand-reveal' : 'dawn',
  );
  const [harvestCovered, setHarvestCovered] = useState(false);
  const [frame, setFrame] = useState<ContainerFrame | null>(null);
  const [baseQuality, setBaseQuality] = useState(() => getAlvoradaQualityProfile(rendererTier));
  const quality = useMemo(() => adaptQualityToFrame(baseQuality, frame), [baseQuality, frame]);

  const root = useRef<HTMLDivElement>(null);
  const stageRef = useRef<AlvoradaIntroStage>(stage);
  const phaseRef = useRef<AlvoradaPhase>(phase);
  const rendererRef = useRef<IntroRenderer>(renderer);
  const finished = useRef(false);
  const { armTimer, clearTimer, clearTimers, isArmed } = useAlvoradaVisibleTimeouts(INTRO_TIMER_KEYS);

  const commitStage = useCallback((nextStage: AlvoradaIntroStage) => {
    if (stageRef.current === nextStage || finished.current) return;
    stageRef.current = nextStage;
    setStage(nextStage);
    onStageChange?.(nextStage);
  }, [onStageChange]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    clearTimers();
    stageRef.current = 'finished';
    setStage('finished');
    onStageChange?.('finished');
    onFinished();
  }, [clearTimers, onFinished, onStageChange]);

  const startBrandHold = useCallback((extraMs = 0) => {
    if (finished.current || isArmed('brand-hold')) return;
    armTimer('brand-hold', brandHoldMs + extraMs, finish);
  }, [armTimer, brandHoldMs, finish, isArmed]);

  const enterStaticDawn = useCallback((reason: AlvoradaIntroStaticReason) => {
    if (finished.current) return;
    clearTimer('prepare-timeout');
    if (rendererRef.current !== 'static') {
      rendererRef.current = 'static';
      setRenderer('static');
      setStaticReason(reason);
    }
    if (phaseRef.current !== 'brand-reveal' && phaseRef.current !== 'brand-hold') {
      phaseRef.current = 'brand-reveal';
      setPhase('brand-reveal');
    }
    commitStage('alvorada');
    startBrandHold(STATIC_DAWN_FADE_ALLOWANCE_MS);
  }, [clearTimer, commitStage, startBrandHold]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return undefined;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      setFrame((current) => (
        current && current.width === next.width && current.height === next.height
          ? current
          : next
      ));
    };
    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure, { passive: true });
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (rendererTier === 'unavailable') return undefined;
    let resizeFrame: number | null = null;
    const updateQuality = () => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        setBaseQuality(getAlvoradaQualityProfile(rendererTier));
      });
    };

    window.addEventListener('orientationchange', updateQuality, { passive: true });
    return () => {
      window.removeEventListener('orientationchange', updateQuality);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    };
  }, [rendererTier]);

  useEffect(() => {
    armTimer('max-duration', ALVORADA_INTRO_MAX_DURATION_MS, finish);
    if (initialRenderer === 'static') {
      startBrandHold(STATIC_DAWN_FADE_ALLOWANCE_MS);
      return;
    }

    warmAlvoradaAssets();
    armTimer('prepare-timeout', ALVORADA_INTRO_PREPARE_TIMEOUT_MS, () => (
      enterStaticDawn('prepare-timeout')
    ));
    // The mount configuration is fixed for the lifetime of one intro instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReady = useCallback(() => {
    if (finished.current || rendererRef.current !== 'webgl') return;
    clearTimer('prepare-timeout');
    commitStage('globe');
  }, [clearTimer, commitStage]);

  const handleProgress = useCallback((elapsed: number) => {
    if (finished.current || rendererRef.current !== 'webgl') return;
    const nextPhase = clampAlvoradaIntroPhase(getAlvoradaPhase(elapsed));
    if (nextPhase !== phaseRef.current) {
      phaseRef.current = nextPhase;
      setPhase(nextPhase);
    }
    const nextStage = getAlvoradaIntroStage(elapsed);
    if (nextStage !== stageRef.current) {
      commitStage(nextStage);
      if (nextStage === 'alvorada') startBrandHold();
    }
  }, [commitStage, startBrandHold]);

  const handleContextLost = useCallback(() => {
    enterStaticDawn('context-lost');
  }, [enterStaticDawn]);

  const handleRenderError = useCallback(() => {
    enterStaticDawn('render-error');
  }, [enterStaticDawn]);

  const handleQualityDecline = useCallback(() => {
    setBaseQuality((current) => degradeAlvoradaQualityProfile(current));
  }, []);

  const handleHarvestCovered = useCallback(() => setHarvestCovered(true), []);

  // Once the landscape covers the frame during the dawn, the WebGL scene has
  // nothing visible left to contribute and its renderer is released.
  const webglReleased = renderer === 'webgl'
    && harvestCovered
    && (stage === 'alvorada' || stage === 'finished');
  const shouldRenderWebGL = renderer === 'webgl' && rendererTier !== 'unavailable' && !webglReleased;
  const dataRenderer = webglReleased ? 'released' : renderer;
  const variant = frameVariant(frame);

  return (
    <div
      ref={root}
      className="alvorada-intro"
      data-testid="alvorada-intro"
      data-stage={stage}
      data-renderer={dataRenderer}
      data-static-reason={staticReason ?? undefined}
      data-quality={quality.level}
      data-frame={variant}
      aria-hidden="true"
    >
      <div className="alvorada-intro__canvas" data-renderer={dataRenderer}>
        {shouldRenderWebGL ? (
          <AlvoradaErrorBoundary fallback={<AlvoradaFallback />} onError={handleRenderError}>
            <AlvoradaCanvas
              initialElapsed={0}
              onContextLost={handleContextLost}
              onProgress={handleProgress}
              onQualityDecline={handleQualityDecline}
              onReady={handleReady}
              quality={quality}
              rendererTier={rendererTier}
            />
          </AlvoradaErrorBoundary>
        ) : <AlvoradaFallback />}
      </div>

      {stage !== 'preparing' && (
        <HarvestBackdrop stage={phase} variant={variant} onCovered={handleHarvestCovered} />
      )}

      <AlvoradaBrandHero dataPending={false} stage={phase} />

      <div className="alvorada-intro__loader">
        <span className="alvorada-intro__loader-orbit" />
      </div>
    </div>
  );
}

export default AlvoradaIntro;
