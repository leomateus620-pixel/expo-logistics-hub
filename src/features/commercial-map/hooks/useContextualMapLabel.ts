import { useEffect, useRef, useState } from 'react';

export type ContextualMapLabelState = 'hidden' | 'hovered' | 'selected';

export interface ContextualMapLabelTargets {
  /** Entity kept identified while it stays selected. */
  selectedId: string | null;
  /** Transient hover/focus identification. Never set while the camera moves. */
  hoveredId: string | null;
  state: ContextualMapLabelState;
}

const HOVER_SETTLE_MS = 55;

/**
 * Central visibility controller for the commercial map labels.
 *
 * The map renders no permanent labels: at most one transient tooltip (hover or
 * keyboard focus) and one persistent identification for the selected entity.
 * Hover is suspended while the camera is navigating and slightly throttled so a
 * cursor sweeping across the park does not thrash React state.
 */
export function useContextualMapLabel({
  selectedEntityId,
  hoveredEntityId,
  cameraNavigating,
  enabled,
}: {
  selectedEntityId: string | null;
  hoveredEntityId: string | null;
  cameraNavigating: boolean;
  enabled: boolean;
}): ContextualMapLabelTargets {
  const [settledHoverId, setSettledHoverId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const candidateHoverId = enabled && !cameraNavigating && hoveredEntityId !== selectedEntityId
    ? hoveredEntityId
    : null;

  useEffect(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (candidateHoverId === null) {
      setSettledHoverId(null);
      return;
    }
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setSettledHoverId(candidateHoverId);
    }, HOVER_SETTLE_MS);
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [candidateHoverId]);

  const selectedId = enabled ? selectedEntityId : null;
  const hoveredId = candidateHoverId === settledHoverId ? settledHoverId : null;

  return {
    selectedId,
    hoveredId,
    state: selectedId ? 'selected' : hoveredId ? 'hovered' : 'hidden',
  };
}
