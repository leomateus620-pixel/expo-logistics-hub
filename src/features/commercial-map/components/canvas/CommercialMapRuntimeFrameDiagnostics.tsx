import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { isCommercialMapHeavyQualityGestureActive } from '../../utils/adaptiveQualityRuntime';
import { recordCommercialMapFrame } from '../../utils/runtimeDiagnostics';

/** Measure complete visible interaction intervals, not demand-idle wall time. */
export function RuntimeFrameDiagnostics() {
  const gl = useThree((state) => state.gl);
  const active = useRef(false);
  const frameCount = useRef(0);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const reset = () => {
      active.current = false;
      frameCount.current = 0;
    };
    // A demand canvas may render no frame while idle/hidden. Observe the actual
    // boundary so the next interaction cannot inherit a stale "active" flag.
    const unsubscribe = useCommercialMapStore.subscribe((state) => {
      if (!isCommercialMapHeavyQualityGestureActive(state)) reset();
    });
    document.addEventListener('visibilitychange', reset);
    gl.domElement.addEventListener('webglcontextlost', reset);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', reset);
      gl.domElement.removeEventListener('webglcontextlost', reset);
    };
  }, [gl]);

  useFrame((_state, delta) => {
    if (!import.meta.env.DEV) return;
    const measuring = isCommercialMapHeavyQualityGestureActive(useCommercialMapStore.getState())
      && document.visibilityState === 'visible'
      && !gl.getContext().isContextLost();
    if (!measuring) {
      active.current = false;
      frameCount.current = 0;
      gl.info.reset();
      return;
    }
    if (frameCount.current % 30 === 0) window.__commercialMapRuntimeDiagnostics?.capture();
    gl.info.reset();
    // The first delta may include a long idle interval preceding this gesture.
    if (!active.current) {
      active.current = true;
      return;
    }
    recordCommercialMapFrame(delta * 1000);
    frameCount.current += 1;
  }, -100);
  return null;
}
