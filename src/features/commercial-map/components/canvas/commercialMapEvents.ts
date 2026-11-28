import { events } from '@react-three/fiber';
import { isMapSelectionClick } from '../../utils/interaction';

interface GastronomyMarkerPicking {
  hit(clientX: number, clientY: number): string | null;
  select(id: string): void;
}

const pickingByCanvas = new WeakMap<HTMLCanvasElement, Set<GastronomyMarkerPicking>>();

export function registerGastronomyMarkerPicking(canvas: HTMLCanvasElement, picking: GastronomyMarkerPicking) {
  const group = pickingByCanvas.get(canvas) ?? new Set<GastronomyMarkerPicking>();
  group.add(picking);
  pickingByCanvas.set(canvas, group);
  return () => {
    group.delete(picking);
    if (!group.size) pickingByCanvas.delete(canvas);
  };
}

/** Give a visible food emblem first claim on selection before dispatching any
 * scene event. The separate native OrbitControls listeners still see the gesture. */
export const createCommercialMapEvents: typeof events = (store) => {
  const manager = events(store);
  const handlers = manager.handlers;
  const canvas = () => store.getState().gl.domElement;
  const picking = () => pickingByCanvas.get(canvas());
  let hitLayer: GastronomyMarkerPicking | null = null;
  const hit = (event: Event) => {
    if (event instanceof MouseEvent) for (const layer of picking() ?? []) {
      const id = layer.hit(event.clientX, event.clientY);
      if (id) { hitLayer = layer; return id; }
    }
    return null;
  };
  let press: { id: string; pointerId: number; x: number; y: number; releasedOnMarker: boolean } | null = null;
  let markerClick = false;
  let markerHover = false;
  let frame: number | null = null;
  let pending: Parameters<NonNullable<typeof handlers>['onPointerMove']>[0] | null = null;
  const clearMarkerHover = () => {
    if (!markerHover) return;
    markerHover = false;
    if (canvas().style.cursor === 'pointer') canvas().style.cursor = 'grab';
  };
  const flush = () => {
    frame = null;
    const event = pending;
    pending = null;
    if (!event || (press && event instanceof MouseEvent && event.buttons)) return;
    if (event instanceof MouseEvent && !event.buttons && hit(event)) {
      if (!markerHover) {
        handlers?.onPointerLeave(event);
        markerHover = true;
        canvas().style.cursor = 'pointer';
      }
      return;
    }
    clearMarkerHover();
    handlers?.onPointerMove(event);
  };
  const cancel = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    pending = null;
  };
  return {
    ...manager,
    handlers: handlers && {
      ...handlers,
      onPointerDown: (event) => {
        if (event instanceof PointerEvent && event.button === 0 && event.isPrimary) {
          const id = hit(event);
          press = id
            ? { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, releasedOnMarker: false }
            : null;
        }
        if (!press) handlers.onPointerDown(event);
        else cancel();
      },
      onPointerUp: (event) => {
        if (!press) {
          handlers.onPointerUp(event);
        } else if (event instanceof PointerEvent && event.pointerId === press.pointerId) {
          press.releasedOnMarker = hit(event) === press.id;
        }
      },
      onClick: (event) => {
        const completed = press;
        press = null;
        markerClick = Boolean(completed || hit(event));
        if (!markerClick) {
          handlers.onClick(event);
        } else if (completed?.releasedOnMarker && event instanceof MouseEvent
          && isMapSelectionClick(Math.hypot(event.clientX - completed.x, event.clientY - completed.y), event)) {
          hitLayer?.select(completed.id);
        }
      },
      onDoubleClick: (event) => {
        if (!markerClick && !hit(event)) handlers.onDoubleClick(event);
      },
      onContextMenu: (event) => {
        if (!press && !hit(event)) handlers.onContextMenu(event);
      },
      onPointerMove: (event) => {
        pending = event;
        if (frame === null) frame = requestAnimationFrame(flush);
      },
      onPointerLeave: (event) => {
        cancel();
        clearMarkerHover();
        handlers.onPointerLeave(event);
      },
      onPointerCancel: (event) => {
        cancel();
        clearMarkerHover();
        if (press) press.releasedOnMarker = false;
        handlers.onPointerCancel(event);
      },
    },
    filter: (intersections) => intersections.filter(({ object }) => {
      let ancestor: typeof object | null = object;
      while (ancestor) {
        if (!ancestor.visible) return false;
        ancestor = ancestor.parent;
      }
      return true;
    }),
    disconnect: () => {
      cancel();
      clearMarkerHover();
      press = null;
      markerClick = false;
      manager.disconnect?.();
    },
  };
};
