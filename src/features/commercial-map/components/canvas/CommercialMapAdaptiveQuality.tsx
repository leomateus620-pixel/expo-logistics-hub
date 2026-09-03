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
  createCommercialMapFrameTimeWindow,
  isCommercialMapAdaptiveQualitySamplingActive,
  recordCommercialMapAdaptiveFrame,
  resetCommercialMapFrameTimeWindow,
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
  }) => void;
}

function qualityStateFromDecision(
  decision: ReturnType<typeof resolveCommercialMapAdaptiveQuality>,
): CommercialMapAdaptiveQualityState {
  return {
    tier: decision.tier,
    consecutiveSlowWindows: decision.consecutiveSlowWindows,
    consecutiveFastWindows: decision.consecutiveFastWindows,
  };
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
  const qualityState = useRef<CommercialMapAdaptiveQualityState>(initialState);
  const frameWindow = useRef(createCommercialMapFrameTimeWindow());
  const lastDiagnosticSignature = useRef('');

  const resolveCapabilities = useCallback((): CommercialMapQualityCapabilitiesInput => ({
    devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
    viewportWidth: size.width,
    viewportHeight: size.height,
    ...capabilityHints,
  }), [capabilityHints, size.height, size.width]);

  const applyPixelRatio = useCallback((
    tier: CommercialMapQualityTier,
    hardwareCeiling: CommercialMapQualityTier,
    reason: string,
  ) => {
    const capabilities = resolveCapabilities();
    const nextDpr = reducedGraphics
      ? resolveCommercialMapPixelRatio({ ...capabilities, reducedGraphics: true })
      : resolveCommercialMapQualityPixelRatio({ ...capabilities, qualityTier: tier });
    const dprChanged = Math.abs(gl.getPixelRatio() - nextDpr) > 0.005;
    if (dprChanged) {
      setDpr(nextDpr);
      invalidate();
    }
    // Keep the Canvas `dpr` prop controlled by the same value. R3F calls
    // root.configure() after parent rerenders and would otherwise reapply the
    // original prop over this imperative setDpr update.
    onQualityChange?.({ tier, dpr: nextDpr });

    const diagnosticSignature = [
      tier,
      hardwareCeiling,
      nextDpr.toFixed(3),
      reducedGraphics ? 'reduced' : 'adaptive',
    ].join(':');
    if (diagnosticSignature !== lastDiagnosticSignature.current) {
      lastDiagnosticSignature.current = diagnosticSignature;
      recordCommercialMapQualityDecision({
        tier,
        hardwareCeiling,
        dpr: nextDpr,
        reducedGraphics,
        reason,
      });
    }
  }, [gl, invalidate, onQualityChange, reducedGraphics, resolveCapabilities, setDpr]);

  // Viewport and hardware caps are safety limits, so they do not wait for a
  // performance window. Upgrades still pass through the slower hysteresis.
  useLayoutEffect(() => {
    const capabilities = resolveCapabilities();
    const decision = resolveCommercialMapAdaptiveQuality(qualityState.current, {
      ...capabilities,
      averageFrameTimeMs: Number.NaN,
      sampledFrames: 0,
    });
    qualityState.current = qualityStateFromDecision(decision);
    resetCommercialMapFrameTimeWindow(frameWindow.current);
    applyPixelRatio(
      decision.tier,
      decision.hardwareCeiling,
      decision.reason === 'hardware-cap' ? decision.reason : 'viewport-sync',
    );
  }, [applyPixelRatio, resolveCapabilities]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const resetWindow = () => resetCommercialMapFrameTimeWindow(frameWindow.current);
    document.addEventListener('visibilitychange', resetWindow);
    return () => document.removeEventListener('visibilitychange', resetWindow);
  }, []);

  useFrame((_frameState, deltaSeconds) => {
    const store = useCommercialMapStore.getState();
    const continuousRendering = store.cameraNavigating
      || store.lunarLaunchPhase !== 'idle'
      || store.lunarLaunchReturning;
    const samplingActive = isCommercialMapAdaptiveQualitySamplingActive({
      mapActive: active,
      reducedGraphics,
      documentVisibilityState: typeof document === 'undefined'
        ? 'unavailable'
        : document.visibilityState,
      continuousRendering,
    });
    if (!samplingActive) {
      resetCommercialMapFrameTimeWindow(frameWindow.current);
      return;
    }

    const completedWindow = recordCommercialMapAdaptiveFrame(
      frameWindow.current,
      deltaSeconds * 1000,
    );
    if (!completedWindow) return;

    const decision = resolveCommercialMapAdaptiveQuality(qualityState.current, {
      ...resolveCapabilities(),
      ...completedWindow,
    });
    qualityState.current = qualityStateFromDecision(decision);
    if (decision.changed) {
      applyPixelRatio(decision.tier, decision.hardwareCeiling, decision.reason);
    }
  }, -90);

  return null;
}
