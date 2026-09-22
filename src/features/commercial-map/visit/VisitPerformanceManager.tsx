import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { commercialMapFrameActivity, COMMERCIAL_MAP_ANIMATION } from '../utils/frameActivity';
import { createVisitTelemetry, type VisitTelemetry } from './VisitTelemetry';
import {
  beginVisitQualitySession, readVisitQuality, setVisitQualityMotion, subscribeVisitQuality,
  type VisitQualityPreset,
} from './VisitQualityManager';

interface Props {
  ready: boolean;
  requestedAtMs?: number;
  getMoving: () => boolean;
  onQualityChange?: (preset: VisitQualityPreset) => void;
}

/** Mount inside the persistent Canvas, for the lifetime of a visit only. */
export function VisitPerformanceManager({ ready, requestedAtMs, getMoving, onQualityChange }: Props) {
  const gl = useThree((state) => state.gl);
  const telemetry = useRef<VisitTelemetry | null>(null);
  const callbacks = useRef({ getMoving, onQualityChange });
  callbacks.current = { getMoving, onQualityChange };
  const readyRef = useRef(ready);
  readyRef.current = ready;
  useEffect(() => {
    const release = beginVisitQualitySession();
    telemetry.current = createVisitTelemetry(gl, requestedAtMs);
    const notify = () => callbacks.current.onQualityChange?.(readVisitQuality().preset);
    const unsubscribe = subscribeVisitQuality(notify);
    notify();
    return () => {
      telemetry.current?.dispose();
      telemetry.current = null;
      unsubscribe();
      release();
    };
  }, [gl, requestedAtMs]);
  useEffect(() => { if (ready) telemetry.current?.controlsReady(); }, [ready]);
  useFrame((_state, delta) => {
    const moving = callbacks.current.getMoving();
    setVisitQualityMotion(moving);
    const requested = commercialMapFrameActivity(gl).requested & COMMERCIAL_MAP_ANIMATION.visit;
    telemetry.current?.frame(delta * 1000, Boolean(requested) || moving);
    if (readyRef.current) telemetry.current?.controlsReady();
  }, -110);
  return null;
}
