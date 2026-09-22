import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { commercialMapFrameActivity } from '../../utils/frameActivity';
import { sampleCommercialMapDisplayCadence } from '../../utils/displayCadence';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { recordCommercialMapQualityDecision } from '../../utils/runtimeDiagnostics';
import { commercialMapDiagnosticsEnabled } from '../../utils/performanceDiagnostics';
import { readCommercialMapQaQualityTier, resolveCommercialMapExecutionPolicy } from '../../utils/executionPolicy';
import {
  capVisitPixelRatio, createInitialVisitQuality, publishVisitQualityTier,
  readVisitQuality, resolveVisitQualityDecision, subscribeVisitQuality,
} from '../../visit/VisitQualityManager';
import {
  resolveCommercialMapAdaptiveQuality,
  resolveCommercialMapPixelRatio,
  resolveCommercialMapQualityPixelRatio,
  type CommercialMapAdaptiveQualityState,
  type CommercialMapQualityCapabilitiesInput,
  type CommercialMapQualityTier,
} from '../../utils/viewport';
import {
  COMMERCIAL_MAP_QUALITY_SCENE_COMMIT_IDLE_MS,
  COMMERCIAL_MAP_QUALITY_EVENT,
  createCommercialMapFrameTimeWindow,
  createCommercialMapPixelRatioState,
  isCommercialMapAdaptiveQualitySamplingActive,
  isCommercialMapHeavyQualityGestureActive,
  recordCommercialMapAdaptiveFrame,
  resetCommercialMapFrameTimeWindow,
  shouldDeferCommercialMapSceneQuality,
  updateCommercialMapPixelRatioState,
  type CommercialMapDeviceCapabilityHints,
} from '../../utils/adaptiveQualityRuntime';

interface CommercialMapAdaptiveQualityControllerProps {
  active: boolean;
  reducedGraphics: boolean;
  initialState: CommercialMapAdaptiveQualityState;
  capabilityHints: CommercialMapDeviceCapabilityHints;
  onQualityChange?: (quality: {
    tier: CommercialMapQualityTier;
    dpr: number;
    sceneTier: CommercialMapQualityTier;
  }) => void;
}

function copyQualityState(
  target: CommercialMapAdaptiveQualityState,
  source: CommercialMapAdaptiveQualityState,
) {
  target.tier = source.tier;
  target.consecutiveSlowWindows = source.consecutiveSlowWindows;
  target.consecutiveFastWindows = source.consecutiveFastWindows;
  target.lastDowngradeAtMs = source.lastDowngradeAtMs;
  target.downgradeStreak = source.downgradeStreak;
  target.lastUpgradeAtMs = source.lastUpgradeAtMs ?? target.lastUpgradeAtMs;
}

export function CommercialMapAdaptiveQualityController({
  active,
  reducedGraphics,
  initialState,
  capabilityHints,
  onQualityChange,
}: CommercialMapAdaptiveQualityControllerProps) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const setDpr = useThree((state) => state.setDpr);
  const size = useThree((state) => state.size);
  const qualityState = useRef<CommercialMapAdaptiveQualityState>({ ...initialState });
  const visitSessionActive = useRef(false);
  const normalQuality = useRef<{
    state: CommercialMapAdaptiveQualityState;
    sceneTier: CommercialMapQualityTier;
    pendingTier: CommercialMapQualityTier | null;
  } | null>(null);
  const committedSceneTier = useRef<CommercialMapQualityTier>(initialState.tier);
  const pendingSceneTier = useRef<CommercialMapQualityTier | null>(null);
  const pixelRatioState = useRef(createCommercialMapPixelRatioState(gl.getPixelRatio()));
  const idleCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameWindow = useRef(createCommercialMapFrameTimeWindow());
  const lastDiagnosticSignature = useRef('');
  const samplingSignature = useRef('');
  const sampledPresentation = useRef(-1);
  const displayCadence = useRef<number | null>(null);
  const cadenceCancel = useRef<(() => void) | null>(null);
  const activity = useRef(commercialMapFrameActivity(gl));
  const executionReportAt = useRef(0);
  const lastMeasuredWindow = useRef<{ averageFrameTimeMs: number; p95FrameTimeMs: number; sampledFrames: number } | null>(null);
  const qaOverrideSnapshot = useRef<{ state: CommercialMapAdaptiveQualityState; fixed: boolean; qaTier: CommercialMapQualityTier | null } | null>(null);
  // Opt-in, local QA only: compare identical initial quality before/after.
  // groundQa also enables comparison on the application route in DEV only.
  const initialQaTier = useRef(readCommercialMapQaQualityTier(commercialMapDiagnosticsEnabled, typeof window === 'undefined' ? '' : window.location.search));
  const fixedQualityForComparison = useRef(initialQaTier.current !== null || (commercialMapDiagnosticsEnabled
    && (window.location.pathname === '/__dev/commercial-map-rendering'
      || (import.meta.env.DEV && new URLSearchParams(window.location.search).has('groundQa')))
    && new URLSearchParams(window.location.search).get('quality') === 'fixed'));

  const resolveCapabilities = useCallback((): CommercialMapQualityCapabilitiesInput => ({
    devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
    viewportWidth: size.width,
    viewportHeight: size.height,
    ...capabilityHints,
  }), [capabilityHints, size.height, size.width]);

  const resolveTierPixelRatio = useCallback((tier: CommercialMapQualityTier) => {
    const capabilities = resolveCapabilities();
    const adaptiveDpr = resolveCommercialMapQualityPixelRatio({ ...capabilities, qualityTier: tier });
    const dpr = reducedGraphics
      ? Math.min(adaptiveDpr, resolveCommercialMapPixelRatio({ ...capabilities, reducedGraphics: true }))
      : adaptiveDpr;
    return readVisitQuality().enabled ? capVisitPixelRatio(dpr, tier) : dpr;
  }, [reducedGraphics, resolveCapabilities]);

  const resolveQuality = useCallback((sample: Parameters<typeof resolveCommercialMapAdaptiveQuality>[1]) => {
    if (initialQaTier.current && !readVisitQuality().enabled) return {
      ...qualityState.current, tier: initialQaTier.current, hardwareCeiling: initialQaTier.current,
      changed: qualityState.current.tier !== initialQaTier.current, reason: 'stable' as const,
    };
    return readVisitQuality().enabled
      ? resolveVisitQualityDecision(qualityState.current, sample)
      : resolveCommercialMapAdaptiveQuality(qualityState.current, sample);
  }, []);

  const cancelIdleCommit = useCallback(() => {
    if (idleCommitTimer.current === null) return;
    clearTimeout(idleCommitTimer.current);
    idleCommitTimer.current = null;
  }, []);

  const syncPixelRatio = useCallback((baseDpr?: number) => {
    const nextDpr = updateCommercialMapPixelRatioState(
      pixelRatioState.current,
      isCommercialMapHeavyQualityGestureActive(useCommercialMapStore.getState()),
      baseDpr,
    );
    if (nextDpr !== null && Math.abs(gl.getPixelRatio() - nextDpr) > 0.005) {
      setDpr(nextDpr);
      const quality = gl.domElement?.dataset.commercialMapQuality;
      if (quality) gl.domElement.dataset.commercialMapQuality = JSON.stringify({ ...JSON.parse(quality), effectiveDpr: nextDpr });
      // A demand canvas must present the resized drawing buffer even when
      // this is the last transition after OrbitControls has stopped moving.
      invalidate();
    }
  }, [gl, invalidate, setDpr]);

  const publishQuality = useCallback((
    logicalTier: CommercialMapQualityTier,
    sceneTier: CommercialMapQualityTier,
    nextDpr: number,
    hardwareCeiling: CommercialMapQualityTier,
    reason: string,
  ) => {
    syncPixelRatio(nextDpr);
    const effectiveDpr = pixelRatioState.current.effectiveDpr;

    committedSceneTier.current = sceneTier;
    publishVisitQualityTier(sceneTier);
    if (gl.domElement) {
      gl.domElement.dataset.commercialMapQuality = JSON.stringify({ logicalTier, sceneTier, baseDpr: pixelRatioState.current.baseDpr, effectiveDpr, hardwareCeiling, reason });
      gl.domElement.dispatchEvent(new Event(COMMERCIAL_MAP_QUALITY_EVENT, { bubbles: true }));
    }
    // Publish only to the scene-tier child. Canvas itself deliberately keeps
    // its initial DPR prop stable; mirroring DPR into parent React state would
    // call root.configure() and resize the drawing buffer a second time.
    onQualityChange?.({
      tier: logicalTier,
      dpr: effectiveDpr,
      sceneTier,
    });

    const diagnosticSignature = [
      logicalTier,
      sceneTier,
      hardwareCeiling,
      effectiveDpr.toFixed(3),
      reducedGraphics ? 'reduced' : 'adaptive',
      reason,
    ].join(':');
    if (diagnosticSignature !== lastDiagnosticSignature.current) {
      lastDiagnosticSignature.current = diagnosticSignature;
      recordCommercialMapQualityDecision({
        tier: logicalTier,
        hardwareCeiling,
        dpr: effectiveDpr,
        reducedGraphics,
        reason,
      });
    }
  }, [gl, onQualityChange, reducedGraphics, syncPixelRatio]);

  const flushPendingQuality = useCallback((reason: string) => {
    cancelIdleCommit();
    const logicalTier = pendingSceneTier.current ?? qualityState.current.tier;
    pendingSceneTier.current = null;
    const nextDpr = resolveTierPixelRatio(logicalTier);
    publishQuality(
      logicalTier,
      logicalTier,
      nextDpr,
      resolveQuality({
        ...resolveCapabilities(),
        averageFrameTimeMs: Number.NaN,
        sampledFrames: 0,
      }).hardwareCeiling,
      reason,
    );
  }, [cancelIdleCommit, publishQuality, resolveCapabilities, resolveQuality, resolveTierPixelRatio]);

  const scheduleIdleCommit = useCallback(() => {
    if (pendingSceneTier.current === null || idleCommitTimer.current !== null) return;
    idleCommitTimer.current = setTimeout(() => {
      idleCommitTimer.current = null;
      if (isCommercialMapHeavyQualityGestureActive(useCommercialMapStore.getState())) return;
      flushPendingQuality('idle-scene-commit');
    }, COMMERCIAL_MAP_QUALITY_SCENE_COMMIT_IDLE_MS);
  }, [flushPendingQuality]);

  const applyQualityDecision = useCallback((
    decision: ReturnType<typeof resolveCommercialMapAdaptiveQuality>,
    reason: string,
  ) => {
    const gestureActive = isCommercialMapHeavyQualityGestureActive(
      useCommercialMapStore.getState(),
    );
    const nextDpr = resolveTierPixelRatio(decision.tier);
    const deferScene = shouldDeferCommercialMapSceneQuality({
      fromTier: committedSceneTier.current,
      toTier: decision.tier,
      gestureActive,
    });

    if (deferScene) {
      pendingSceneTier.current = decision.tier;
    } else {
      pendingSceneTier.current = null;
    }

    publishQuality(
      decision.tier,
      deferScene ? committedSceneTier.current : decision.tier,
      nextDpr,
      decision.hardwareCeiling,
      reason,
    );

    if (deferScene) scheduleIdleCommit();
    else cancelIdleCommit();
  }, [
    cancelIdleCommit,
    publishQuality,
    resolveTierPixelRatio,
    scheduleIdleCommit,
  ]);

  // Viewport and hardware caps are safety limits, so they do not wait for a
  // performance window. Heavy GPU rebuilds still wait if a gesture is live.
  useLayoutEffect(() => {
    cadenceCancel.current?.();
    cadenceCancel.current = null;
    displayCadence.current = null;
    samplingSignature.current = '';
    const capabilities = resolveCapabilities();
    const decision = resolveQuality({
      ...capabilities,
      averageFrameTimeMs: Number.NaN,
      sampledFrames: 0,
    });
    copyQualityState(qualityState.current, decision);
    resetCommercialMapFrameTimeWindow(frameWindow.current);
    applyQualityDecision(
      decision,
      decision.reason === 'hardware-cap' ? decision.reason : 'viewport-sync',
    );
  }, [applyQualityDecision, resolveCapabilities, resolveQuality]);

  useEffect(() => {
    const syncVisitSession = () => {
      const enabled = readVisitQuality().enabled;
      if (enabled === visitSessionActive.current) return;
      visitSessionActive.current = enabled;
      cancelIdleCommit();
      resetCommercialMapFrameTimeWindow(frameWindow.current);
      samplingSignature.current = '';
      if (enabled) {
        normalQuality.current = {
          state: { ...qualityState.current },
          sceneTier: committedSceneTier.current,
          pendingTier: pendingSceneTier.current,
        };
        qualityState.current = createInitialVisitQuality(resolveCapabilities());
        pendingSceneTier.current = null;
        const tier = qualityState.current.tier;
        publishQuality(tier, tier, resolveTierPixelRatio(tier), 'HIGH', 'visit-enter');
      } else if (normalQuality.current) {
        const saved = normalQuality.current;
        normalQuality.current = null;
        qualityState.current = saved.state;
        pendingSceneTier.current = saved.pendingTier;
        const ceiling = resolveQuality({ ...resolveCapabilities(), averageFrameTimeMs: Number.NaN, sampledFrames: 0 }).hardwareCeiling;
        publishQuality(saved.state.tier, saved.sceneTier, resolveTierPixelRatio(saved.state.tier), ceiling, 'visit-exit-restore');
        scheduleIdleCommit();
      }
      invalidate();
    };
    const unsubscribe = subscribeVisitQuality(syncVisitSession);
    syncVisitSession();
    return unsubscribe;
  }, [cancelIdleCommit, invalidate, publishQuality, resolveCapabilities, resolveQuality, resolveTierPixelRatio, scheduleIdleCommit]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const resetWindow = () => {
      resetCommercialMapFrameTimeWindow(frameWindow.current);
      samplingSignature.current = '';
      cadenceCancel.current?.();
      cadenceCancel.current = null;
      displayCadence.current = null;
    };
    document.addEventListener('visibilitychange', resetWindow);
    return () => document.removeEventListener('visibilitychange', resetWindow);
  }, []);

  useEffect(() => {
    if (!commercialMapDiagnosticsEnabled) return;
    const override = (event: Event) => {
      const tier = (event as CustomEvent<{ tier: CommercialMapQualityTier | null }>).detail?.tier;
      if (tier === null) {
        const saved = qaOverrideSnapshot.current;
        if (!saved) return;
        qaOverrideSnapshot.current = null;
        fixedQualityForComparison.current = saved.fixed;
        initialQaTier.current = saved.qaTier;
        qualityState.current = saved.state;
        publishQuality(saved.state.tier, saved.state.tier, resolveTierPixelRatio(saved.state.tier), saved.state.tier, 'qa-override-release');
      } else {
        if (tier !== 'LOW' && tier !== 'MEDIUM' && tier !== 'HIGH' && tier !== 'ULTRA') return;
        qaOverrideSnapshot.current ??= { state: { ...qualityState.current }, fixed: fixedQualityForComparison.current, qaTier: initialQaTier.current };
        fixedQualityForComparison.current = true;
        initialQaTier.current = tier;
        qualityState.current = { ...qualityState.current, tier };
        publishQuality(tier, tier, resolveTierPixelRatio(tier), tier, 'qa-override');
      }
      cancelIdleCommit();
      pendingSceneTier.current = null;
      resetCommercialMapFrameTimeWindow(frameWindow.current);
      samplingSignature.current = '';
      invalidate();
    };
    gl.domElement.addEventListener('commercial-map-quality-test', override);
    return () => gl.domElement.removeEventListener('commercial-map-quality-test', override);
  }, [cancelIdleCommit, gl, invalidate, publishQuality, resolveTierPixelRatio]);

  useEffect(() => () => { cancelIdleCommit(); cadenceCancel.current?.(); }, [cancelIdleCommit]);

  useEffect(() => {
    return useCommercialMapStore.subscribe((state, previous) => {
      const wasBusy = isCommercialMapHeavyQualityGestureActive(previous);
      const isBusy = isCommercialMapHeavyQualityGestureActive(state);
      if (wasBusy !== isBusy) samplingSignature.current = '';
      if (wasBusy !== isBusy) syncPixelRatio();
      if (isBusy) {
        cancelIdleCommit();
        return;
      }
      if (wasBusy && !isBusy) scheduleIdleCommit();
    });
  }, [cancelIdleCommit, scheduleIdleCommit, syncPixelRatio]);

  useFrame((_frameState, deltaSeconds) => {
    const store = useCommercialMapStore.getState();
    const gestureActive = isCommercialMapHeavyQualityGestureActive(store);
    // Visit motion is an external mutable signal, not a React/store update.
    // Observe its edges here; the sole DPR owner performs no per-frame writes.
    if (pixelRatioState.current.gestureActive !== gestureActive) {
      samplingSignature.current = '';
      syncPixelRatio();
    }
    const frame = activity.current;
    const now = performance.now();
    if (commercialMapDiagnosticsEnabled && now - executionReportAt.current >= 1000) {
      executionReportAt.current = now;
      gl.domElement.dataset.commercialMapExecution = JSON.stringify({
        initialTier: initialState.tier,
        tier: qualityState.current.tier,
        sceneTier: committedSceneTier.current,
        policy: resolveCommercialMapExecutionPolicy(committedSceneTier.current),
        dpr: gl.getPixelRatio(),
        shadowResolution: Number(gl.domElement.dataset.commercialMapShadowResolution) || null,
        lastFrameWindow: lastMeasuredWindow.current,
        inventory: gl.domElement.dataset.commercialMapInventoryCounts ? JSON.parse(gl.domElement.dataset.commercialMapInventoryCounts) : null,
        hardwareRestrictedActions: [],
      });
    }
    const requested = frame.requested;
    frame.requested = 0;
    const ready = gl.domElement?.dataset.commercialMapHydration === 'complete'
      && !gl.domElement.dataset.commercialMapPreparing;
    const continuousRendering = gestureActive || requested !== 0;
    // Calibrate RAF once in idle; do not request any extra WebGL draws.
    if (active && ready && !continuousRendering && displayCadence.current === null && !cadenceCancel.current && document.visibilityState === 'visible') {
      cadenceCancel.current = sampleCommercialMapDisplayCadence((cadence) => {
        displayCadence.current = cadence;
        // Retain the completed handle: retry only after a visibility/viewport boundary.
      });
    }
    const signature = `${gestureActive ? 'gesture' : requested}:${frame.path}:${store.interiorEntityId ?? 'outside'}:${gl.getPixelRatio()}:${committedSceneTier.current}`;
    const samplingActive = isCommercialMapAdaptiveQualitySamplingActive({
      mapActive: active && ready && !fixedQualityForComparison.current,
      reducedGraphics,
      documentVisibilityState: typeof document === 'undefined'
        ? 'unavailable'
        : document.visibilityState,
      continuousRendering,
    });
    if (!samplingActive || pendingSceneTier.current !== null || frame.frames === sampledPresentation.current) {
      // Samples still describe the previously committed scene while its new
      // tier is deferred. Do not repeatedly downgrade/upgrade that unchanged
      // workload before the first decision has actually reached the renderer.
      resetCommercialMapFrameTimeWindow(frameWindow.current);
      samplingSignature.current = '';
      if (gestureActive) cancelIdleCommit();
      else scheduleIdleCommit();
      return;
    }
    sampledPresentation.current = frame.frames;
    if (signature !== samplingSignature.current) {
      samplingSignature.current = signature;
      resetCommercialMapFrameTimeWindow(frameWindow.current);
      return; // First interval belongs partly to idle, loading or the previous path.
    }
    if (gestureActive) cancelIdleCommit();
    const completedWindow = recordCommercialMapAdaptiveFrame(
      frameWindow.current,
      deltaSeconds * 1000,
    );
    if (!completedWindow) return;
    lastMeasuredWindow.current = { ...completedWindow };

    const decision = resolveQuality({
      ...resolveCapabilities(),
      averageFrameTimeMs: completedWindow.averageFrameTimeMs,
      sampledFrames: completedWindow.sampledFrames,
      p95FrameTimeMs: completedWindow.p95FrameTimeMs,
      displayCadenceMs: displayCadence.current,
      recoveryEligible: !gestureActive,
      nowMs: typeof performance === 'undefined' ? Date.now() : performance.now(),
    });
    copyQualityState(qualityState.current, decision);
    if (decision.changed) {
      applyQualityDecision(decision, decision.reason);
    }
  }, -90);

  return null;
}
