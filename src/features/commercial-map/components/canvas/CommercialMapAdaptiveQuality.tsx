import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { recordCommercialMapQualityDecision } from '../../utils/runtimeDiagnostics';
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
  const committedSceneTier = useRef<CommercialMapQualityTier>(initialState.tier);
  const pendingSceneTier = useRef<CommercialMapQualityTier | null>(null);
  const pixelRatioState = useRef(createCommercialMapPixelRatioState(gl.getPixelRatio()));
  const idleCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameWindow = useRef(createCommercialMapFrameTimeWindow());
  const lastDiagnosticSignature = useRef('');

  const resolveCapabilities = useCallback((): CommercialMapQualityCapabilitiesInput => ({
    devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
    viewportWidth: size.width,
    viewportHeight: size.height,
    ...capabilityHints,
  }), [capabilityHints, size.height, size.width]);

  const resolveTierPixelRatio = useCallback((tier: CommercialMapQualityTier) => {
    const capabilities = resolveCapabilities();
    return reducedGraphics
      ? resolveCommercialMapPixelRatio({ ...capabilities, reducedGraphics: true })
      : resolveCommercialMapQualityPixelRatio({ ...capabilities, qualityTier: tier });
  }, [reducedGraphics, resolveCapabilities]);

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
  }, [onQualityChange, reducedGraphics, syncPixelRatio]);

  const flushPendingQuality = useCallback((reason: string) => {
    cancelIdleCommit();
    const logicalTier = pendingSceneTier.current ?? qualityState.current.tier;
    pendingSceneTier.current = null;
    const nextDpr = resolveTierPixelRatio(logicalTier);
    publishQuality(
      logicalTier,
      logicalTier,
      nextDpr,
      resolveCommercialMapAdaptiveQuality(qualityState.current, {
        ...resolveCapabilities(),
        averageFrameTimeMs: Number.NaN,
        sampledFrames: 0,
      }).hardwareCeiling,
      reason,
    );
  }, [cancelIdleCommit, publishQuality, resolveCapabilities, resolveTierPixelRatio]);

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
    const capabilities = resolveCapabilities();
    const decision = resolveCommercialMapAdaptiveQuality(qualityState.current, {
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
  }, [applyQualityDecision, resolveCapabilities]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const resetWindow = () => resetCommercialMapFrameTimeWindow(frameWindow.current);
    document.addEventListener('visibilitychange', resetWindow);
    return () => document.removeEventListener('visibilitychange', resetWindow);
  }, []);

  useEffect(() => () => cancelIdleCommit(), [cancelIdleCommit]);

  useEffect(() => {
    return useCommercialMapStore.subscribe((state, previous) => {
      const wasBusy = isCommercialMapHeavyQualityGestureActive(previous);
      const isBusy = isCommercialMapHeavyQualityGestureActive(state);
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
    const continuousRendering = isCommercialMapHeavyQualityGestureActive(store);
    const samplingActive = isCommercialMapAdaptiveQualitySamplingActive({
      mapActive: active,
      reducedGraphics,
      documentVisibilityState: typeof document === 'undefined'
        ? 'unavailable'
        : document.visibilityState,
      continuousRendering,
    });
    if (!samplingActive || pendingSceneTier.current !== null) {
      // Samples still describe the previously committed scene while its new
      // tier is deferred. Do not repeatedly downgrade/upgrade that unchanged
      // workload before the first decision has actually reached the renderer.
      resetCommercialMapFrameTimeWindow(frameWindow.current);
      if (continuousRendering) cancelIdleCommit();
      else scheduleIdleCommit();
      return;
    }

    cancelIdleCommit();
    const completedWindow = recordCommercialMapAdaptiveFrame(
      frameWindow.current,
      deltaSeconds * 1000,
    );
    if (!completedWindow) return;

    const decision = resolveCommercialMapAdaptiveQuality(qualityState.current, {
      ...resolveCapabilities(),
      averageFrameTimeMs: completedWindow.averageFrameTimeMs,
      sampledFrames: completedWindow.sampledFrames,
      nowMs: typeof performance === 'undefined' ? Date.now() : performance.now(),
    });
    copyQualityState(qualityState.current, decision);
    if (decision.changed) {
      applyQualityDecision(decision, decision.reason);
    }
  }, -90);

  return null;
}
