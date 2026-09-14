import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { observeAlvoradaHost } from './hostReadiness';
import { ALVORADA_MOTION_MODE } from './motionPolicy';
import { ALVORADA_RUNTIME_VERSION } from './introTelemetry';
import { AlvoradaCanvas } from './AlvoradaCanvas';
import { AlvoradaBrandHero } from './AlvoradaBrandHero';
import { AlvoradaErrorBoundary } from './AlvoradaErrorBoundary';
import { AlvoradaNarrativeFallback } from './AlvoradaNarrativeFallback';
import { AlvoradaPreparingSurface } from './AlvoradaPreparingSurface';
import { HarvestBackdrop, type HarvestBackdropVariant } from './HarvestBackdrop';
import { subscribeAlvoradaAssetProgress, type AlvoradaAssetProgress } from './alvoradaAssets';
import {
  degradeAlvoradaQualityProfile,
  getAlvoradaQualityProfile,
  getAlvoradaWebGLTier,
  warmAlvoradaAssets,
  type AlvoradaQualityProfile,
} from './capabilities';
import { createAlvoradaIntroTelemetry, type AlvoradaIntroTelemetryEvent } from './introTelemetry';
import {
  ALVORADA_FALLBACK_NARRATIVE,
  ALVORADA_INTRO_BRAND_HOLD_MS,
  ALVORADA_INTRO_MAX_DURATION_MS,
  ALVORADA_INTRO_PREPARE_CEILING_MS,
  ALVORADA_INTRO_PREPARE_STALL_MS,
  alvoradaIntroStagesBetween,
  clampAlvoradaIntroPhase,
  getAlvoradaIntroStage,
  getAlvoradaPhase,
  type AlvoradaIntroStage,
  type AlvoradaPhase,
} from './timeline';
import { useAlvoradaVisibleTimeouts } from './useAlvoradaVisibleTimeouts';
import type { AlvoradaFallbackReason, AlvoradaPreparationEvent, AlvoradaWebGLTier } from './types';
import './alvorada.css';
import './alvorada-intro.css';

export interface AlvoradaIntroProps {
  /** Visible time the dawn brand frame stays before `onFinished`. */
  brandHoldMs?: number;
  /** Fired exactly once when the sequence is complete; the host restores the countdown. */
  onFinished: () => void;
  onStageChange?: (stage: AlvoradaIntroStage) => void;
}

/**
 * `webgl`: the authored 3D journey. `fallback`: the 2D narrative, always with
 * an explicit reason (`data-static-reason`). The stage sequence is identical.
 */
type IntroRenderer = 'webgl' | 'fallback';
type IntroTimerKey =
  | 'brand-hold'
  | 'fallback-step'
  | 'max-duration'
  | 'prepare-ceiling'
  | 'prepare-stall'
  | 'context-recovery';
export type AlvoradaIntroStaticReason =
  | AlvoradaFallbackReason
  | 'asset-failed'
  | 'prepare-ceiling'
  | 'prepare-stall';

const INTRO_TIMER_KEYS: readonly IntroTimerKey[] = [
  'brand-hold',
  'fallback-step',
  'max-duration',
  'prepare-ceiling',
  'prepare-stall',
  'context-recovery',
];
/** The narrative dawn fades the landscape in before its hold starts counting. */
const NARRATIVE_DAWN_FADE_ALLOWANCE_MS = 700;
const NARROW_CONTAINER_WIDTH = 640;
const STAGE_TELEMETRY: Partial<Record<AlvoradaIntroStage, AlvoradaIntroTelemetryEvent>> = {
  globe: 'globe-start',
  approach: 'approach-start',
  alvorada: 'alvorada-start',
};

interface ContainerFrame {
  height: number;
  width: number;
}

function frameVariant(frame: ContainerFrame | null): HarvestBackdropVariant {
  if (!frame || frame.width === 0 || frame.height === 0) return 'landscape';
  return frame.height / frame.width > 1.05 ? 'portrait' : 'landscape';
}

/**
 * Only the framing (`mobile`) follows the container: a narrow card inside a
 * wide window keeps the globe whole. The render budget (dpr, post-processing,
 * texture tier) is fixed at mount and changes only through a runtime decline,
 * so a resize or rotation never recompiles or rebuilds the scene.
 */
function adaptQualityToFrame(
  profile: AlvoradaQualityProfile,
  frame: ContainerFrame | null,
): AlvoradaQualityProfile {
  if (!frame || frame.width === 0 || profile.mobile || frame.width >= NARROW_CONTAINER_WIDTH) {
    return profile;
  }
  return { ...profile, mobile: true };
}

function assetProgressRatio(progress: AlvoradaAssetProgress) {
  if (progress.totalBytes <= 0) return null;
  return Math.min(1, progress.loadedBytes / progress.totalBytes);
}

/**
 * Embedded Alvorada intro: planet → approach to Santa Rosa → dawn brand frame.
 *
 * Stages advance on real renderer events only (`preparing → globe → approach →
 * alvorada → finished`, never skipping). Preparation is supervised by a
 * progress watchdog: as long as the canvas keeps reporting progress the intro
 * waits, and only a real stall, a ceiling or a renderer failure hands the same
 * narrative to the 2D fallback — with an explicit reason. All timers count
 * visible time.
 */
export function AlvoradaIntro({
  brandHoldMs = ALVORADA_INTRO_BRAND_HOLD_MS,
  onFinished,
  onStageChange,
}: AlvoradaIntroProps) {
  const [telemetry] = useState(createAlvoradaIntroTelemetry);
  const [rendererTier] = useState<AlvoradaWebGLTier>(() => (
    getAlvoradaWebGLTier()
  ));
  const initialRenderer: IntroRenderer = rendererTier === 'unavailable' ? 'fallback' : 'webgl';
  const [renderer, setRenderer] = useState<IntroRenderer>(initialRenderer);
  const [staticReason, setStaticReason] = useState<AlvoradaIntroStaticReason | null>(() => (
    rendererTier === 'unavailable' ? 'unsupported-webgl' : null
  ));
  const [stage, setStage] = useState<AlvoradaIntroStage>('preparing');
  const [phase, setPhase] = useState<AlvoradaPhase>('dawn');
  const [harvestCovered, setHarvestCovered] = useState(false);
  const [frame, setFrame] = useState<ContainerFrame | null>(null);
  const [hostReady, setHostReady] = useState(false);
  const [hostUsable, setHostUsable] = useState(false);
  const contextLosses = useRef(0);
  const [budget, setBudget] = useState(() => getAlvoradaQualityProfile(rendererTier));
  const [preparationMs, setPreparationMs] = useState<number | null>(null);
  const [firstFrameMs, setFirstFrameMs] = useState<number | null>(null);
  const [assetProgress, setAssetProgress] = useState<number | null>(null);
  const quality = useMemo(() => adaptQualityToFrame(budget, frame), [budget, frame]);

  const root = useRef<HTMLDivElement>(null);
  const stageRef = useRef<AlvoradaIntroStage>(stage);
  const phaseRef = useRef<AlvoradaPhase>(phase);
  const rendererRef = useRef<IntroRenderer>(renderer);
  const finished = useRef(false);
  const harvestCoveredRef = useRef(false);
  const lastElapsed = useRef(-1);
  const { armTimer, clearTimer, clearTimers, isArmed } = useAlvoradaVisibleTimeouts(INTRO_TIMER_KEYS);

  const commitPhase = useCallback((nextPhase: AlvoradaPhase) => {
    if (phaseRef.current === nextPhase) return;
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    clearTimers();
    stageRef.current = 'finished';
    setStage('finished');
    telemetry.mark('finished');
    onStageChange?.('finished');
    onFinished();
  }, [clearTimers, onFinished, onStageChange, telemetry]);

  const startBrandHold = useCallback((extraMs = 0) => {
    if (finished.current || isArmed('brand-hold')) return;
    armTimer('brand-hold', brandHoldMs + extraMs, finish);
  }, [armTimer, brandHoldMs, finish, isArmed]);

  const commitStage = useCallback((nextStage: AlvoradaIntroStage) => {
    if (stageRef.current === nextStage || finished.current) return;
    stageRef.current = nextStage;
    setStage(nextStage);
    const event = STAGE_TELEMETRY[nextStage];
    if (event) telemetry.mark(event, { renderer: rendererRef.current });
    onStageChange?.(nextStage);
    if (nextStage === 'alvorada') {
      startBrandHold(rendererRef.current === 'fallback' ? NARRATIVE_DAWN_FADE_ALLOWANCE_MS : 0);
    }
  }, [onStageChange, startBrandHold, telemetry]);

  /**
   * Stage invariant: the sequence only moves forward, one stage at a time. A
   * request that would skip a stage is walked through every intermediate stage
   * (observers never see `preparing → alvorada`) and recorded as a violation,
   * because it means the clock did not start from zero.
   */
  const advanceStage = useCallback((target: AlvoradaIntroStage) => {
    if (finished.current) return;
    const steps = alvoradaIntroStagesBetween(stageRef.current, target);
    if (steps.length === 0) return;
    if (steps.length > 1) {
      const detail = { from: stageRef.current, to: target, skipped: steps.slice(0, -1) };
      telemetry.mark('stage-invariant-violation', detail);
      if (import.meta.env.DEV) {
        console.warn('[alvorada] a sequência tentou pular etapas', detail);
      }
    }
    steps.forEach(commitStage);
  }, [commitStage, telemetry]);

  /**
   * The 2D narrative walks the remaining stages on visible timers, starting
   * from wherever the WebGL journey stopped so nothing already shown regresses.
   */
  const runFallbackStep = useCallback(() => {
    if (finished.current || rendererRef.current !== 'fallback') return;
    if (!isArmed('max-duration')) armTimer('max-duration', ALVORADA_INTRO_MAX_DURATION_MS, finish);
    switch (stageRef.current) {
      case 'preparing':
        commitPhase('dawn');
        advanceStage('globe');
        armTimer('fallback-step', ALVORADA_FALLBACK_NARRATIVE.globeMs, runFallbackStep);
        return;
      case 'globe':
        commitPhase('territory');
        advanceStage('approach');
        armTimer('fallback-step', ALVORADA_FALLBACK_NARRATIVE.approachMs, runFallbackStep);
        return;
      case 'approach':
        if (phaseRef.current !== 'santa-rosa') {
          commitPhase('santa-rosa');
          armTimer('fallback-step', ALVORADA_FALLBACK_NARRATIVE.santaRosaMs, runFallbackStep);
          return;
        }
        commitPhase('brand-reveal');
        advanceStage('alvorada');
        return;
      case 'alvorada':
        if (phaseRef.current !== 'brand-reveal' && phaseRef.current !== 'brand-hold') {
          commitPhase('brand-reveal');
        }
        startBrandHold(NARRATIVE_DAWN_FADE_ALLOWANCE_MS);
        return;
      default:
    }
  }, [advanceStage, armTimer, commitPhase, finish, isArmed, startBrandHold]);

  const enterFallback = useCallback((reason: AlvoradaIntroStaticReason) => {
    if (finished.current || rendererRef.current === 'fallback') return;
    clearTimer('prepare-stall');
    clearTimer('prepare-ceiling');
    clearTimer('context-recovery');
    telemetry.mark('engine-selected', { engine: 'emergency-fallback', previousEngine: 'webgl-canonical', reason, stage: stageRef.current, recoveryAttempt: contextLosses.current });
    rendererRef.current = 'fallback';
    setRenderer('fallback');
    setStaticReason(reason);
    telemetry.setEnvironment({ staticReason: reason });
    telemetry.mark('fallback-triggered', {
      reason,
      stage: stageRef.current,
      phase: phaseRef.current,
      preparationMs: telemetry.elapsed(),
    });
    runFallbackStep();
  }, [clearTimer, runFallbackStep, telemetry]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return undefined;

    return observeAlvoradaHost(element, (next, usable) => {
      telemetry.setEnvironment({ containerWidth: next.width, containerHeight: next.height });
      setHostUsable(usable);
      // Preserve the last valid framing while a host is temporarily collapsed.
      if (usable) setFrame((current) => {
        if (current?.width === next.width && current?.height === next.height) return current;
        telemetry.mark('host-frame', { ...next, usable });
        return next;
      });
    }, () => {
      telemetry.mark('host-ready');
      setHostReady(true);
    });
  }, [telemetry]);

  useEffect(() => {
    window.__alvoradaIntroTelemetry = telemetry.record;
    telemetry.setEnvironment({ rendererTier, qualityProfile: budget.level, textureTier: budget.textureTier });
    telemetry.mark('engine-selected', { engine: initialRenderer === 'webgl' ? 'webgl-canonical' : 'emergency-fallback', reason: staticReason, previousEngine: null, recoveryAttempt: 0 });
    telemetry.mark('intro-mounted', { motionMode: ALVORADA_MOTION_MODE, rendererTier, quality: budget.level });
    if (initialRenderer === 'fallback') {
      const reason: AlvoradaIntroStaticReason = 'unsupported-webgl';
      telemetry.setEnvironment({ staticReason: reason });
      telemetry.mark('fallback-triggered', { reason, stage: 'preparing', phase: 'dawn', preparationMs: 0 });
      return undefined;
    }

    telemetry.mark('assets-warm-start');
    warmAlvoradaAssets();
    return undefined;
    // The mount configuration is fixed for the lifetime of one intro instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hostReady || stageRef.current !== 'preparing') return;
    if (initialRenderer === 'fallback') { runFallbackStep(); return; }
    // Charge GPU preparation only after the embedded host can present frames.
    // The budgets themselves are unchanged from PR #147.
    armTimer('prepare-stall', ALVORADA_INTRO_PREPARE_STALL_MS, () => enterFallback('prepare-stall'));
    armTimer('prepare-ceiling', ALVORADA_INTRO_PREPARE_CEILING_MS, () => enterFallback('prepare-ceiling'));
    return () => { clearTimer('prepare-stall'); clearTimer('prepare-ceiling'); };
  }, [hostReady, initialRenderer, armTimer, clearTimer, enterFallback, runFallbackStep]);

  const notePreparationProgress = useCallback((event: AlvoradaPreparationEvent) => {
    if (finished.current || rendererRef.current !== 'webgl' || stageRef.current !== 'preparing') return;
    if (isArmed('prepare-stall')) {
      armTimer('prepare-stall', ALVORADA_INTRO_PREPARE_STALL_MS, () => enterFallback('prepare-stall'));
    }
    telemetry.mark('watchdog-progress', { kind: event.kind });
  }, [armTimer, enterFallback, isArmed, telemetry]);

  const handlePreparation = useCallback((event: AlvoradaPreparationEvent) => {
    if (finished.current || rendererRef.current !== 'webgl') return;
    switch (event.kind) {
      case 'context-created':
        telemetry.setEnvironment({ webglVersion: String(event.detail?.webglVersion ?? 'unknown'), context: event.detail ?? {} });
        break;
      case 'context-restored':
        clearTimer('context-recovery');
        telemetry.mark('recovery-complete', { attempt: contextLosses.current, elapsed: lastElapsed.current });
        break;
      case 'render-error':
        telemetry.mark('render-error', event.detail);
        enterFallback('render-error');
        return;
      case 'shader-compile-end':
        telemetry.setEnvironment({ shaderPreparationMs: Number(event.detail?.shaderPreparationMs ?? 0) });
        break;
      case 'first-frame': {
        const value = Number(event.detail?.firstFrameMs ?? 0);
        telemetry.setEnvironment({ firstFrameMs: value });
        setFirstFrameMs(Math.round(value));
        break;
      }
      case 'asset-failed':
        telemetry.mark('asset-failed', event.detail);
        if (event.detail?.critical) enterFallback('asset-failed');
        return;
      default:
    }
    telemetry.mark(event.kind, event.detail);
    notePreparationProgress(event);
  }, [clearTimer, enterFallback, notePreparationProgress, telemetry]);

  useEffect(() => {
    if (initialRenderer === 'fallback') return undefined;
    let warmEndMarked = false;
    return subscribeAlvoradaAssetProgress((progress) => {
      if (finished.current || rendererRef.current !== 'webgl') return;
      telemetry.mark('asset-progress', { ...progress });
      if (stageRef.current === 'preparing') setAssetProgress(assetProgressRatio(progress));
      if (!warmEndMarked && progress.totalItems > 0
        && progress.loadedItems + progress.failedItems === progress.totalItems) {
        warmEndMarked = true;
        telemetry.mark('assets-warm-end', { ...progress });
      }
      notePreparationProgress({ kind: 'asset-progress' });
    });
  }, [initialRenderer, notePreparationProgress, telemetry]);

  const handleReady = useCallback(() => {
    if (finished.current || rendererRef.current !== 'webgl') return;
    clearTimer('prepare-stall');
    clearTimer('prepare-ceiling');
    const readyAt = telemetry.elapsed();
    setPreparationMs(readyAt);
    telemetry.mark('renderer-ready', { preparationMs: readyAt });
    // The journey budget starts with the journey, never with the download.
    armTimer('max-duration', ALVORADA_INTRO_MAX_DURATION_MS, finish);
    lastElapsed.current = -1;
    advanceStage('globe');
  }, [advanceStage, armTimer, clearTimer, finish, telemetry]);

  const handleProgress = useCallback((elapsed: number) => {
    if (finished.current || rendererRef.current !== 'webgl') return;
    if (stageRef.current === 'preparing') {
      // Progress before `onReady` means the renderer skipped its own gate.
      telemetry.mark('stage-invariant-violation', { from: 'preparing', progressWithoutReady: elapsed });
      handleReady();
    }
    if (elapsed < lastElapsed.current) {
      // Out-of-order callback from the frame loop: the clock is monotonic.
      telemetry.mark('stage-invariant-violation', { regression: { from: lastElapsed.current, to: elapsed } });
      return;
    }
    lastElapsed.current = elapsed;
    commitPhase(clampAlvoradaIntroPhase(getAlvoradaPhase(elapsed)));
    advanceStage(getAlvoradaIntroStage(elapsed));
  }, [advanceStage, commitPhase, handleReady, telemetry]);

  const handleContextLost = useCallback(() => {
    if (harvestCoveredRef.current || finished.current) return;
    contextLosses.current += 1;
    telemetry.mark('context-lost', { count: contextLosses.current, elapsed: lastElapsed.current, stage: stageRef.current });
    if (contextLosses.current > 1) { enterFallback('context-lost'); return; }
    // Keep this Canvas and its timeline alive while Three restores the context.
    telemetry.mark('recovery-start', { attempt: 1, previousEngine: 'webgl-canonical' });
    armTimer('context-recovery', 3000, () => enterFallback('context-lost'));
  }, [armTimer, enterFallback, telemetry]);

  const handleRenderError = useCallback(() => {
    enterFallback('render-error');
  }, [enterFallback]);

  const handleQualityDecline = useCallback(() => {
    setBudget((current) => {
      const next = degradeAlvoradaQualityProfile(current);
      if (next.level !== current.level) {
        telemetry.mark('quality-degraded', { from: current.level, to: next.level, stage: stageRef.current });
        telemetry.setEnvironment({ qualityProfile: next.level });
      }
      return next;
    });
  }, [telemetry]);

  const handleHarvestCovered = useCallback(() => {
    harvestCoveredRef.current = true;
    setHarvestCovered(true);
  }, []);

  // Once the landscape covers the frame during the dawn, the WebGL scene has
  // nothing visible left to contribute and its renderer is released.
  const webglReleased = renderer === 'webgl'
    && harvestCovered
    && (stage === 'alvorada' || stage === 'finished');
  const shouldRenderWebGL = renderer === 'webgl'
    && rendererTier !== 'unavailable'
    && hostReady && frame !== null
    && !webglReleased;
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
      data-visual-engine={renderer === 'webgl' ? 'webgl-canonical' : 'emergency-fallback'}
      data-runtime-version={ALVORADA_RUNTIME_VERSION}
      data-host-state={!hostReady ? 'waiting-size' : hostUsable ? 'ready' : 'suspended-size'}
      data-frame={variant}
      data-motion={ALVORADA_MOTION_MODE}
      data-motion-mode={ALVORADA_MOTION_MODE}
      data-alvorada-motion={ALVORADA_MOTION_MODE}
      data-preparation-ms={preparationMs ?? undefined}
      data-first-frame-ms={firstFrameMs ?? undefined}
      aria-hidden="true"
    >
      <div className="alvorada-intro__canvas" data-renderer={dataRenderer}>
        {shouldRenderWebGL ? (
          <AlvoradaErrorBoundary fallback={null} onError={handleRenderError}>
            <AlvoradaCanvas
              initialElapsed={0}
              paused={!hostUsable}
              onContextLost={handleContextLost}
              onPreparation={handlePreparation}
              onProgress={handleProgress}
              onQualityDecline={handleQualityDecline}
              onReady={handleReady}
              quality={quality}
              rendererTier={rendererTier}
            />
          </AlvoradaErrorBoundary>
        ) : renderer === 'fallback' && (
          <AlvoradaNarrativeFallback
            phase={phase}
            stage={stage}
          />
        )}
      </div>

      {stage !== 'preparing' && (
        <HarvestBackdrop stage={phase} variant={variant} onCovered={handleHarvestCovered} />
      )}

      <AlvoradaBrandHero dataPending={false} stage={phase} />

      <AlvoradaPreparingSurface active={stage === 'preparing'} progress={assetProgress} />
    </div>
  );
}

export default AlvoradaIntro;
