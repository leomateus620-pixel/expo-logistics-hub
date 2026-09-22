const keys = new Set<string>();
const touches = new Map<number, number>();
let touchRun = false;
let wake: (() => void) | null = null;
export const visitInput = {
  forward: 0, strafe: 0, lookX: 0, lookY: 0, run: false, enabled: false,
  reset() { keys.clear(); touches.clear(); touchRun = false; this.forward = this.strafe = this.lookX = this.lookY = 0; this.run = false; },
};
function recompute() {
  let touch = 0; for (const value of touches.values()) touch += value;
  visitInput.forward = Math.max(-1, Math.min(1, touch + Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'))));
  visitInput.strafe = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  visitInput.run = touchRun || keys.has('ShiftLeft') || keys.has('ShiftRight');
  wake?.();
}
export function setTouchMove(pointerId: number, value: number) { touches.set(pointerId, value); recompute(); }
export function clearTouch(pointerId: number) { touches.delete(pointerId); recompute(); }
export function setTouchRun(value: boolean) { touchRun = value; recompute(); }
export function addLook(dx: number, dy: number) {
  if (!visitInput.enabled) return;
  visitInput.lookX += Math.max(-300, Math.min(300, dx));
  visitInput.lookY += Math.max(-300, Math.min(300, dy)); wake?.();
}
const movementKeys = new Set(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight']);
const editable = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'));

/** One listener lifetime per visit. Touch IDs are independent of keyboard/lock. */
export function installVisitInput(canvas: HTMLCanvasElement, invalidate: () => void) {
  wake = invalidate;
  let drag: { id: number; x: number; y: number } | null = null;
  const previousTouch = canvas.style.touchAction;
  const previousTabIndex = canvas.getAttribute('tabindex');
  canvas.style.touchAction = 'none'; canvas.tabIndex = 0;
  const reset = () => { visitInput.reset(); drag = null; invalidate(); };
  const keydown = (event: KeyboardEvent) => {
    if (!visitInput.enabled || editable(event.target)) return;
    if (event.code === 'Escape') { reset(); if (document.pointerLockElement === canvas) document.exitPointerLock(); event.preventDefault(); return; }
    if (!movementKeys.has(event.code)) return;
    event.preventDefault(); keys.add(event.code); recompute();
  };
  const keyup = (event: KeyboardEvent) => { if (keys.delete(event.code)) { event.preventDefault(); recompute(); } };
  const down = (event: PointerEvent) => {
    if (!visitInput.enabled || event.button !== 0) return;
    canvas.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    if (event.pointerType === 'mouse' && !document.pointerLockElement) {
      try { const result = canvas.requestPointerLock?.(); if (result) void Promise.resolve(result).catch(() => undefined); } catch { /* drag remains available */ }
    }
    event.preventDefault();
  };
  const move = (event: PointerEvent) => {
    if (document.pointerLockElement === canvas) { addLook(event.movementX, event.movementY); return; }
    if (drag?.id !== event.pointerId) return;
    addLook(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX; drag.y = event.clientY; event.preventDefault();
  };
  const up = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return;
    drag = null; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  const lock = () => { if (document.pointerLockElement !== canvas) reset(); };
  const visibility = () => { if (document.hidden) reset(); else invalidate(); };
  const context = (event: Event) => event.preventDefault();
  window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup, true);
  window.addEventListener('blur', reset); window.addEventListener('focus', invalidate);
  document.addEventListener('visibilitychange', visibility); document.addEventListener('pointerlockchange', lock);
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up); canvas.addEventListener('contextmenu', context);
  canvas.addEventListener('webglcontextlost', reset);
  return () => {
    reset(); visitInput.enabled = false; wake = null;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true);
    window.removeEventListener('blur', reset); window.removeEventListener('focus', invalidate);
    document.removeEventListener('visibilitychange', visibility); document.removeEventListener('pointerlockchange', lock);
    canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('lostpointercapture', up); canvas.removeEventListener('contextmenu', context);
    canvas.removeEventListener('webglcontextlost', reset); canvas.style.touchAction = previousTouch;
    if (previousTabIndex === null) canvas.removeAttribute('tabindex'); else canvas.setAttribute('tabindex', previousTabIndex);
  };
}
