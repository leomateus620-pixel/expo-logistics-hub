import { events } from '@react-three/fiber';

/** Coalesce hover raycasts only. Pointer down/up, click, wheel and controls keep
 * their native timing; a click always performs its own fresh R3F raycast. */
export const createCommercialMapEvents: typeof events = (store) => {
  const manager = events(store);
  const handlers = manager.handlers;
  let frame: number | null = null;
  let pending: Parameters<NonNullable<typeof handlers>['onPointerMove']>[0] | null = null;
  const flush = () => {
    frame = null;
    const event = pending;
    pending = null;
    if (event) handlers?.onPointerMove(event);
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
      onPointerMove: (event) => {
        pending = event;
        if (frame === null) frame = requestAnimationFrame(flush);
      },
      onPointerLeave: (event) => {
        cancel();
        handlers.onPointerLeave(event);
      },
      onPointerCancel: (event) => {
        cancel();
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
      manager.disconnect?.();
    },
  };
};
