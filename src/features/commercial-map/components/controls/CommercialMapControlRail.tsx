import { useCallback, useLayoutEffect, useRef, type ReactNode, type SyntheticEvent } from 'react';

interface CommercialMapControlRailProps {
  children: ReactNode;
  className: string;
  label: string;
  nightModeActive: boolean;
}

const DRAG_THRESHOLD_PX = 8;
const DRAG_CLICK_GUARD_MS = 800;

const isLocalRailEvent = (event: SyntheticEvent) => event.currentTarget instanceof Node
  && event.target instanceof Node
  && event.currentTarget.contains(event.target);

const stopMapGesture = (event: SyntheticEvent) => {
  if (isLocalRailEvent(event)) event.stopPropagation();
};

/** Native overflow stays inside the capsule and never becomes a map gesture. */
export function CommercialMapControlRail({
  children,
  className,
  label,
  nightModeActive,
}: CommercialMapControlRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; x: number; y: number; dragged: boolean } | null>(null);
  const suppressPointerClickUntil = useRef(0);

  const syncOverflow = useCallback(() => {
    const rail = railRef.current;
    const scroll = scrollRef.current;
    if (!rail || !scroll) return;
    // A tolerance avoids flicker from fractional layout/scroll coordinates.
    const start = scroll.scrollLeft > 1;
    const end = scroll.scrollWidth - scroll.clientWidth - scroll.scrollLeft > 1;
    if (rail.dataset.overflowStart !== String(start)) rail.dataset.overflowStart = String(start);
    if (rail.dataset.overflowEnd !== String(end)) rail.dataset.overflowEnd = String(end);
  }, []);

  useLayoutEffect(syncOverflow);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const rail = railRef.current;
    if (!scroll || !rail) return undefined;
    const observer = new ResizeObserver(syncOverflow);
    observer.observe(rail);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [syncOverflow]);

  const finishPointer = useCallback((pointerId: number, cancelled = false) => {
    if (pointer.current?.id !== pointerId) return;
    if (pointer.current.dragged || cancelled) {
      suppressPointerClickUntil.current = Date.now() + DRAG_CLICK_GUARD_MS;
    }
    pointer.current = null;
  }, []);

  const trackPointerMovement = useCallback((event: { pointerId: number; clientX: number; clientY: number }) => {
    const gesture = pointer.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > DRAG_THRESHOLD_PX) {
      gesture.dragged = true;
    }
  }, []);

  useLayoutEffect(() => {
    // Release/cancel outside the capsule must finish the same gesture without
    // intercepting any map event outside it. No pointer capture is requested.
    const finishOutside = (event: PointerEvent) => {
      trackPointerMovement(event);
      finishPointer(event.pointerId, event.type === 'pointercancel');
    };
    const cancelOnBlur = () => {
      if (pointer.current) finishPointer(pointer.current.id, true);
    };
    document.addEventListener('pointerup', finishOutside);
    document.addEventListener('pointercancel', finishOutside);
    document.addEventListener('pointermove', trackPointerMovement);
    window.addEventListener('blur', cancelOnBlur);
    return () => {
      document.removeEventListener('pointerup', finishOutside);
      document.removeEventListener('pointercancel', finishOutside);
      document.removeEventListener('pointermove', trackPointerMovement);
      window.removeEventListener('blur', cancelOnBlur);
    };
  }, [finishPointer, trackPointerMovement]);

  return (
    <div
      ref={railRef}
      className={`${className} commercial-map-control-rail commercial-map-glass`}
      role="group"
      aria-label={label}
      data-glass-theme={nightModeActive ? 'night' : 'day'}
      data-commercial-map-full-motion="true"
      onPointerDown={(event) => {
        // Radix portals are outside the capsule's physical input surface.
        // Their native pointerdown must reach DismissableLayer's document listener.
        if (!isLocalRailEvent(event)) return;
        event.stopPropagation();
        if (event.button !== 0) return;
        if (pointer.current && pointer.current.id !== event.pointerId) {
          pointer.current.dragged = true;
          return;
        }
        suppressPointerClickUntil.current = 0;
        pointer.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          dragged: false,
        };
      }}
      onPointerMove={(event) => {
        if (!isLocalRailEvent(event)) return;
        event.stopPropagation();
        trackPointerMovement(event);
      }}
      onPointerUp={(event) => {
        if (!isLocalRailEvent(event)) return;
        event.stopPropagation();
        trackPointerMovement(event);
        finishPointer(event.pointerId);
      }}
      onPointerCancel={(event) => {
        if (!isLocalRailEvent(event)) return;
        event.stopPropagation();
        finishPointer(event.pointerId, true);
      }}
      onLostPointerCapture={(event) => {
        if (!isLocalRailEvent(event)) return;
        event.stopPropagation();
        finishPointer(event.pointerId, true);
      }}
      onClickCapture={(event) => {
        if (!(event.target instanceof Node) || !scrollRef.current?.contains(event.target)) return;
        // Keyboard and assistive-technology clicks remain available after a swipe.
        if (event.detail === 0 || (!pointer.current?.dragged && Date.now() >= suppressPointerClickUntil.current)) return;
        event.preventDefault();
        event.stopPropagation();
        suppressPointerClickUntil.current = 0;
      }}
      onClick={stopMapGesture}
      onDoubleClick={stopMapGesture}
      onMouseDown={stopMapGesture}
      onMouseMove={stopMapGesture}
      onMouseUp={stopMapGesture}
      onTouchStart={stopMapGesture}
      onTouchMove={stopMapGesture}
      onTouchEnd={stopMapGesture}
      onTouchCancel={stopMapGesture}
      onWheel={stopMapGesture}
      onFocusCapture={(event) => {
        const scroll = scrollRef.current;
        const focused = event.target;
        if (!scroll || !(focused instanceof HTMLElement) || !scroll.contains(focused)) return;
        const visibleBounds = scroll.getBoundingClientRect();
        const controlBounds = focused.getBoundingClientRect();
        const inset = 4;
        let delta = 0;
        if (controlBounds.left < visibleBounds.left + inset) {
          delta = controlBounds.left - visibleBounds.left - inset;
        } else if (controlBounds.right > visibleBounds.right - inset) {
          delta = controlBounds.right - visibleBounds.right + inset;
        }
        if (delta !== 0) {
          scroll.scrollLeft += delta;
          syncOverflow();
        }
      }}
    >
      <div ref={scrollRef} className="commercial-map-control-rail__scroll" onScroll={syncOverflow}>
        {children}
      </div>
    </div>
  );
}
