import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { COMMERCIAL_MAP_PRESENTATION_EVENT, setCommercialMapPresentationVisible } from '../../utils/frameActivity';
import { CommercialMapPresentationVisibility } from './CommercialMapPresentationContext';

/** Presentation only: Canvas/controls/resources and context recovery stay mounted. */
export function CommercialMapPresentation({ visible, children }: { visible: boolean; children: ReactNode }) {
  const gl = useThree(state => state.gl);
  const invalidate = useThree(state => state.invalidate);
  const setEvents = useThree(state => state.setEvents);
  const get = useThree(state => state.get);
  const clock = useThree(state => state.clock);
  const elapsed = useRef(clock.elapsedTime);
  useFrame(state => {
    if (state.frameloop === 'demand') elapsed.current = clock.elapsedTime;
    else clock.elapsedTime = elapsed.current;
  }, -101);
  useLayoutEffect(() => {
    // R3F 8.17 leaves already-invalidated frames queued when switching to
    // 'never'. Cancel only that pending presentation count; keep the root,
    // subscribers, controls and context recovery ownership intact.
    if (!visible) get().internal.frames = 0;
    // R3F resets this clock when switching frameloop. Retain animation phase
    // for cattle, character mixers and already-started ride physics.
    clock.elapsedTime = elapsed.current;
    setCommercialMapPresentationVisible(gl, visible);
    setEvents({ enabled: visible });
    gl.domElement.dataset.commercialMapPresentationVisible = String(visible);
    gl.domElement.dispatchEvent(new Event(COMMERCIAL_MAP_PRESENTATION_EVENT));
    if (visible) invalidate();
  }, [clock, get, gl, invalidate, setEvents, visible]);
  return <CommercialMapPresentationVisibility.Provider value={visible}>{children}</CommercialMapPresentationVisibility.Provider>;
}
