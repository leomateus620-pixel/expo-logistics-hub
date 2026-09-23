const keys = new Set<string>();
const touches = new Map<number, number>();
type VehicleAxis = 'forward' | 'strafe' | 'yaw' | 'vertical' | 'brake';
const vehicleTouches = new Map<number, { axis: VehicleAxis; value: number }>();
let touchRun = false;
const touchRunListeners = new Set<() => void>();
let wake: (() => void) | null = null;
interface PointerLockTicket { canvas: HTMLCanvasElement; cancelled: boolean; settled: boolean; promiseBacked?: boolean }
let latestPointerLockTicket: PointerLockTicket | null = null;
let latePointerLockGuard: { ticket: PointerLockTicket; dispose: () => void } | null = null;

function releaseCancelledPointerLock(ticket: PointerLockTicket) {
  // A previous promise/event must never release a newer visit's mouse lock.
  if (!ticket.cancelled || latestPointerLockTicket !== ticket) return;
  if (document.pointerLockElement === ticket.canvas) { ticket.settled = true; document.exitPointerLock(); }
  // Do not keep the departing Canvas alive after its request has settled.
  if (ticket.settled) latestPointerLockTicket = null;
}
function stopLatePointerLockGuard(ticket?: PointerLockTicket) {
  if (!latePointerLockGuard || ticket && latePointerLockGuard.ticket !== ticket) return;
  latePointerLockGuard.dispose(); latePointerLockGuard = null;
}
function watchLatePointerLock(ticket: PointerLockTicket) {
  stopLatePointerLockGuard();
  const settle = () => {
    if (document.pointerLockElement !== ticket.canvas) return;
    ticket.settled = true;
    releaseCancelledPointerLock(ticket);
    stopLatePointerLockGuard(ticket);
  };
  const failed = () => { ticket.settled = true; releaseCancelledPointerLock(ticket); stopLatePointerLockGuard(ticket); };
  // Legacy browsers return void instead of a promise. Keep one bounded guard
  // for their queued event; never retain one document listener per visit.
  const timer = window.setTimeout(() => {
    if (!ticket.promiseBacked) { ticket.settled = true; releaseCancelledPointerLock(ticket); }
    stopLatePointerLockGuard(ticket);
  }, 5000);
  document.addEventListener('pointerlockchange', settle);
  document.addEventListener('pointerlockerror', failed);
  latePointerLockGuard = { ticket, dispose: () => {
    window.clearTimeout(timer);
    document.removeEventListener('pointerlockchange', settle);
    document.removeEventListener('pointerlockerror', failed);
  } };
}
function updateTouchRun(value: boolean) {
  if (touchRun === value) return;
  touchRun = value;
  for (const listener of touchRunListeners) listener();
}
export const visitInput = {
  forward: 0, strafe: 0, yaw: 0, vertical: 0, brake: false, lookX: 0, lookY: 0, run: false, enabled: false,
  reset() { keys.clear(); touches.clear(); vehicleTouches.clear(); updateTouchRun(false); this.forward = this.strafe = this.yaw = this.vertical = this.lookX = this.lookY = 0; this.brake = false; this.run = false; },
};
function recompute() {
  let touch = 0; for (const value of touches.values()) touch += value;
  const vehicle = { forward: 0, strafe: 0, yaw: 0, vertical: 0, brake: 0 };
  for (const { axis, value } of vehicleTouches.values()) vehicle[axis] += value;
  visitInput.forward = Math.max(-1, Math.min(1, touch + vehicle.forward + Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'))));
  visitInput.strafe = Math.max(-1, Math.min(1, vehicle.strafe + Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))));
  visitInput.yaw = Math.max(-1, Math.min(1, vehicle.yaw + Number(keys.has('KeyE')) - Number(keys.has('KeyQ'))));
  visitInput.vertical = Math.max(-1, Math.min(1, vehicle.vertical + Number(keys.has('Space')) - Number(keys.has('ControlLeft') || keys.has('ControlRight'))));
  visitInput.brake = vehicle.brake > 0 || keys.has('Space');
  visitInput.run = touchRun || keys.has('ShiftLeft') || keys.has('ShiftRight');
  wake?.();
}
export function setTouchMove(pointerId: number, value: number) { touches.set(pointerId, value); recompute(); }
export function setTouchVehicle(pointerId: number, axis: VehicleAxis, value: number) { vehicleTouches.set(pointerId, { axis, value }); recompute(); }
export function clearTouch(pointerId: number) { touches.delete(pointerId); vehicleTouches.delete(pointerId); recompute(); }
export function setTouchRun(value: boolean) { updateTouchRun(value); recompute(); }
export function getTouchRun() { return touchRun; }
export function subscribeTouchRun(listener: () => void) { touchRunListeners.add(listener); return () => { touchRunListeners.delete(listener); }; }
export function addLook(dx: number, dy: number) {
  if (!visitInput.enabled) return;
  visitInput.lookX += Math.max(-300, Math.min(300, dx));
  visitInput.lookY += Math.max(-300, Math.min(300, dy)); wake?.();
}
const movementKeys = new Set(['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','Space','ControlLeft','ControlRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight']);
const editable = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'));

/** One listener lifetime per visit. Touch IDs are independent of keyboard/lock. */
export function installVisitInput(canvas: HTMLCanvasElement, invalidate: () => void,
  options: { onTap?: (clientX: number, clientY: number) => void; allowPointerLock?: () => boolean } = {}) {
  wake = invalidate;
  let lockTicket: PointerLockTicket | null = null;
  let drag: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
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
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
    if (event.pointerType === 'mouse' && (options.allowPointerLock?.() ?? true) && !document.pointerLockElement && canvas.requestPointerLock && (!lockTicket || lockTicket.settled)) {
      stopLatePointerLockGuard();
      const ticket: PointerLockTicket = { canvas, cancelled: false, settled: false };
      latestPointerLockTicket = lockTicket = ticket;
      try {
        const result = canvas.requestPointerLock();
        if (result) {
          ticket.promiseBacked = true;
          void Promise.resolve(result).then(() => {
            ticket.settled = true;
            releaseCancelledPointerLock(ticket);
            stopLatePointerLockGuard(ticket);
          }, () => { ticket.settled = true; releaseCancelledPointerLock(ticket); stopLatePointerLockGuard(ticket); });
        }
      } catch { ticket.settled = true; /* drag remains available */ }
    }
    event.preventDefault();
  };
  const move = (event: PointerEvent) => {
    if (document.pointerLockElement === canvas) { addLook(event.movementX, event.movementY); return; }
    if (drag?.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 7) drag.moved = true;
    addLook(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX; drag.y = event.clientY; event.preventDefault();
  };
  const up = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return;
    const tapped = event.type === 'pointerup' && !drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= 7;
    drag = null; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (tapped) options.onTap?.(event.clientX, event.clientY);
  };
  const lock = () => {
    if (document.pointerLockElement !== canvas) reset();
    else if (lockTicket) lockTicket.settled = true;
  };
  const lockError = () => { if (lockTicket) lockTicket.settled = true; };
  const visibility = () => { if (document.hidden) reset(); else invalidate(); };
  const context = (event: Event) => event.preventDefault();
  window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup, true);
  window.addEventListener('blur', reset); window.addEventListener('focus', invalidate);
  document.addEventListener('visibilitychange', visibility); document.addEventListener('pointerlockchange', lock);
  document.addEventListener('pointerlockerror', lockError);
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up); canvas.addEventListener('contextmenu', context);
  canvas.addEventListener('webglcontextlost', reset);
  return () => {
    if (lockTicket) {
      lockTicket.cancelled = true;
      if (!lockTicket.settled && latestPointerLockTicket === lockTicket) watchLatePointerLock(lockTicket);
    }
    reset(); visitInput.enabled = false; wake = null;
    if (lockTicket) { releaseCancelledPointerLock(lockTicket); if (lockTicket.settled) stopLatePointerLockGuard(lockTicket); }
    window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true);
    window.removeEventListener('blur', reset); window.removeEventListener('focus', invalidate);
    document.removeEventListener('visibilitychange', visibility); document.removeEventListener('pointerlockchange', lock);
    document.removeEventListener('pointerlockerror', lockError);
    canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('lostpointercapture', up); canvas.removeEventListener('contextmenu', context);
    canvas.removeEventListener('webglcontextlost', reset); canvas.style.touchAction = previousTouch;
    if (previousTabIndex === null) canvas.removeAttribute('tabindex'); else canvas.setAttribute('tabindex', previousTabIndex);
  };
}
