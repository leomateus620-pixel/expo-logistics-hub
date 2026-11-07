import { PointerGesture, type GestureDelta, type Point } from './surfaceMath';

/** Input ownership is scoped to the surface; page zoom elsewhere remains native. */
export class SurfaceControls {
  readonly gesture = new PointerGesture();
  constructor(private element: HTMLElement, private change: (delta: GestureDelta) => void, private wheel: (factor: number, anchor: Point) => void) {
    element.addEventListener('pointerdown', this.down);
    element.addEventListener('pointermove', this.move);
    element.addEventListener('pointerup', this.up);
    element.addEventListener('pointercancel', this.up);
    element.addEventListener('lostpointercapture', this.up);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', this.contextMenu);
    window.addEventListener('blur', this.cancel);
    document.addEventListener('visibilitychange', this.cancel);
  }
  private point = (event: PointerEvent) => {
    const rect = this.element.getBoundingClientRect();
    return { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top, pan: event.shiftKey || event.button === 2 || event.button === 1 };
  };
  private down = (event: PointerEvent) => { if (event.button <= 2) this.gesture.down(this.point(event)); };
  private move = (event: PointerEvent) => {
    const delta = this.gesture.move(this.point(event));
    if (!delta) return;
    event.preventDefault();
    if (!this.element.hasPointerCapture?.(event.pointerId)) this.element.setPointerCapture?.(event.pointerId);
    this.change(delta);
  };
  private up = (event: PointerEvent) => {
    this.gesture.up(event.pointerId);
    if (this.element.hasPointerCapture?.(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
  };
  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const rect = this.element.getBoundingClientRect(), units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
    if (event.shiftKey) this.change({ dx: -event.deltaX * units, dy: -event.deltaY * units, factor: 1, anchor: { x: 0, y: 0 }, pan: true });
    else this.wheel(Math.exp(-Math.max(-180, Math.min(180, event.deltaY * units)) * .0025), { x: event.clientX - rect.left, y: event.clientY - rect.top });
  };
  private contextMenu = (event: Event) => event.preventDefault();
  cancel = () => {
    for (const id of this.gesture.points.keys()) if (this.element.hasPointerCapture?.(id)) this.element.releasePointerCapture(id);
    this.gesture.cancel();
  };
  dispose() {
    this.cancel();
    this.element.removeEventListener('pointerdown', this.down);
    this.element.removeEventListener('pointermove', this.move);
    this.element.removeEventListener('pointerup', this.up);
    this.element.removeEventListener('pointercancel', this.up);
    this.element.removeEventListener('lostpointercapture', this.up);
    this.element.removeEventListener('wheel', this.onWheel);
    this.element.removeEventListener('contextmenu', this.contextMenu);
    window.removeEventListener('blur', this.cancel);
    document.removeEventListener('visibilitychange', this.cancel);
  }
}
