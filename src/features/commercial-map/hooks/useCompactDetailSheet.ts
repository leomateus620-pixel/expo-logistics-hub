import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { resolveCommercialMapSheetSnap, type CommercialMapDetailSheetState } from '../utils/viewport';

/** Shared presentation state; changing selection never remounts the map or panel. */
export function useCompactDetailSheet(selectionKey: string | null) {
  const [sheetState, setSheetState] = useState<CommercialMapDetailSheetState>('half');
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef({ pointerId: -1, startY: 0, startHeight: 0, viewportHeight: 0, minimumHeight: 72, maximumHeight: 0, moved: false });
  const suppressClick = useRef(false);

  const cleanupDrag = () => {
    const viewport = panelRef.current?.closest('.commercial-map-viewport') as HTMLElement | null;
    viewport?.classList.remove('is-detail-sheet-dragging');
    viewport?.style.removeProperty('--commercial-map-detail-sheet-height');
  };

  useLayoutEffect(() => {
    setSheetState('half');
    dragRef.current.pointerId = -1;
    suppressClick.current = false;
    cleanupDrag();
  }, [selectionKey]);

  useEffect(() => {
    const panel = panelRef.current;
    const viewport = panel?.closest('.commercial-map-viewport') as HTMLElement | null;
    const notifyPanelResize = () => window.dispatchEvent(new Event('commercial-map-panel-resize'));
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(notifyPanelResize);
    if (panel) observer?.observe(panel);
    notifyPanelResize();
    return () => {
      observer?.disconnect();
      viewport?.classList.remove('is-detail-sheet-dragging');
      viewport?.style.removeProperty('--commercial-map-detail-sheet-height');
      notifyPanelResize();
    };
  }, []);

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const viewport = panelRef.current?.closest('.commercial-map-viewport') as HTMLElement | null;
    const height = Number.parseFloat(viewport?.style.getPropertyValue('--commercial-map-detail-sheet-height') ?? '') || drag.startHeight;
    suppressClick.current = drag.moved;
    setSheetState(resolveCommercialMapSheetSnap(height, drag.viewportHeight, drag.minimumHeight));
    cleanupDrag();
    drag.pointerId = -1;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleProps = {
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const panel = panelRef.current;
      const viewport = panel?.closest('.commercial-map-viewport') as HTMLElement | null;
      if (!panel || !viewport) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const startHeight = panel.getBoundingClientRect().height;
      const viewportHeight = viewport.getBoundingClientRect().height;
      const safeAreaBottom = Number.parseFloat(window.getComputedStyle(panel).paddingBottom) || 0;
      const minimumHeight = 72 + safeAreaBottom;
      dragRef.current = {
        pointerId: event.pointerId, startY: event.clientY, startHeight, viewportHeight,
        minimumHeight, maximumHeight: Math.max(minimumHeight, viewportHeight - Math.max(88, viewportHeight * 0.18)), moved: false,
      };
      viewport.classList.add('is-detail-sheet-dragging');
      viewport.style.setProperty('--commercial-map-detail-sheet-height', `${startHeight}px`);
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      const drag = dragRef.current;
      if (drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = drag.startY - event.clientY;
      if (Math.abs(delta) > 4) drag.moved = true;
      const height = Math.min(Math.max(drag.minimumHeight, drag.startHeight + delta), drag.maximumHeight);
      const viewport = panelRef.current?.closest('.commercial-map-viewport') as HTMLElement | null;
      viewport?.style.setProperty('--commercial-map-detail-sheet-height', `${height}px`);
    },
    onPointerUp: finishDrag,
    onPointerCancel: finishDrag,
    onLostPointerCapture: finishDrag,
    onClick() {
      if (suppressClick.current) { suppressClick.current = false; return; }
      setSheetState((current) => current === 'collapsed' ? 'half' : 'collapsed');
    },
  };

  return { panelRef, sheetState, setSheetState, handleProps };
}

