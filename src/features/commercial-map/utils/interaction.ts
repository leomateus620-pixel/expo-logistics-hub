import type { MapClassification } from '../types';

export const MAP_CLICK_MAX_DELTA = 6;
export const MAP_TAP_MAX_DURATION_MS = 500;
export const MAP_TOUCH_MAX_MOVEMENT_PX = 9;
export const CAMERA_NAVIGATION_MIN_DELTA = 0.025;
export const CAMERA_TRANSITION_MIN_DURATION_MS = 460;
export const CAMERA_TRANSITION_MAX_DURATION_MS = 900;

const NON_SELECTABLE_CLASSIFICATIONS = new Set<MapClassification>(['ROAD', 'PEDESTRIAN_PATH']);

export interface SelectionFocusProfile {
  contextRatio: number;
  fitPadding: number;
  minDistanceRatio: number;
  maxDistanceRatio: number;
  minimumDirectionY: number;
}

interface ActivePointer {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface MapGestureState {
  activePointers: Map<number, ActivePointer>;
  startedAt: number;
  maximumMovement: number;
  multiTouch: boolean;
  lastCompletedAt: number;
  lastTapAccepted: boolean;
}

const gestureStateByTarget = new WeakMap<EventTarget, MapGestureState>();

function eventNow() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function updatePointerMovement(state: MapGestureState, event: PointerEvent) {
  const pointer = state.activePointers.get(event.pointerId);
  if (!pointer) return;
  pointer.currentX = event.clientX;
  pointer.currentY = event.clientY;
  state.maximumMovement = Math.max(
    state.maximumMovement,
    Math.hypot(pointer.currentX - pointer.startX, pointer.currentY - pointer.startY),
  );
}

/**
 * Registers a single gesture gate at the Canvas boundary. R3F click events are
 * accepted only after a short, single-pointer tap; drags, long presses and any
 * gesture that became multi-touch are rejected before they can select a mesh.
 */
export function registerMapGestureGuard(target: HTMLElement) {
  const state: MapGestureState = {
    activePointers: new Map(),
    startedAt: 0,
    maximumMovement: 0,
    multiTouch: false,
    lastCompletedAt: Number.NEGATIVE_INFINITY,
    lastTapAccepted: false,
  };
  gestureStateByTarget.set(target, state);

  const handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (state.activePointers.size === 0) {
      state.startedAt = eventNow();
      state.maximumMovement = 0;
      state.multiTouch = false;
    }
    state.activePointers.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
    });
    if (state.activePointers.size > 1) state.multiTouch = true;
  };
  const handlePointerMove = (event: PointerEvent) => updatePointerMovement(state, event);
  const finishPointer = (event: PointerEvent, cancelled: boolean) => {
    if (!state.activePointers.has(event.pointerId)) return;
    updatePointerMovement(state, event);
    state.activePointers.delete(event.pointerId);
    if (state.activePointers.size > 0) return;
    const duration = eventNow() - state.startedAt;
    state.lastCompletedAt = eventNow();
    state.lastTapAccepted = !cancelled
      && !state.multiTouch
      && duration <= MAP_TAP_MAX_DURATION_MS
      && state.maximumMovement <= MAP_TOUCH_MAX_MOVEMENT_PX;
  };
  const handlePointerUp = (event: PointerEvent) => finishPointer(event, false);
  const handlePointerCancel = (event: PointerEvent) => finishPointer(event, true);

  target.addEventListener('pointerdown', handlePointerDown, true);
  const pointerOwner = target.ownerDocument;
  pointerOwner.addEventListener('pointermove', handlePointerMove, true);
  pointerOwner.addEventListener('pointerup', handlePointerUp, true);
  pointerOwner.addEventListener('pointercancel', handlePointerCancel, true);

  return () => {
    target.removeEventListener('pointerdown', handlePointerDown, true);
    pointerOwner.removeEventListener('pointermove', handlePointerMove, true);
    pointerOwner.removeEventListener('pointerup', handlePointerUp, true);
    pointerOwner.removeEventListener('pointercancel', handlePointerCancel, true);
    gestureStateByTarget.delete(target);
  };
}

function gestureStateForEvent(event: Event | undefined) {
  if (!event) return undefined;
  for (const target of event.composedPath()) {
    const state = gestureStateByTarget.get(target);
    if (state) return state;
  }
  return undefined;
}

export function isMapSelectionClick(delta: number | undefined, nativeEvent?: Event) {
  const withinR3fClickTolerance = delta === undefined
    || (Number.isFinite(delta) && delta >= 0 && delta <= MAP_CLICK_MAX_DELTA);
  if (!withinR3fClickTolerance) return false;

  const gesture = gestureStateForEvent(nativeEvent);
  if (!gesture) return true;
  const completedRecently = eventNow() - gesture.lastCompletedAt <= 750;
  return !completedRecently || gesture.lastTapAccepted;
}

export function isCameraNavigationMovement(cameraDelta: number, targetDelta: number) {
  return Math.max(cameraDelta, targetDelta) >= CAMERA_NAVIGATION_MIN_DELTA;
}

export function resolveCameraTransitionDuration(travelDistance: number) {
  const safeTravel = Number.isFinite(travelDistance) ? Math.max(0, travelDistance) : 0;
  return Math.min(
    CAMERA_TRANSITION_MAX_DURATION_MS,
    Math.max(CAMERA_TRANSITION_MIN_DURATION_MS, 420 + Math.sqrt(safeTravel) * 35),
  );
}

export function resolveCameraTransitionProgress(elapsedMs: number, durationMs: number) {
  const safeDuration = Number.isFinite(durationMs) ? Math.max(1, durationMs) : 1;
  const linear = Math.min(1, Math.max(0, (Number.isFinite(elapsedMs) ? elapsedMs : 0) / safeDuration));
  return linear * linear * (3 - 2 * linear);
}

export function isSelectableMapClassification(classification: MapClassification) {
  return !NON_SELECTABLE_CLASSIFICATIONS.has(classification);
}

export function selectionFocusProfile(classification: MapClassification): SelectionFocusProfile {
  if (classification === 'SELLABLE_LOT' || classification === 'INTERNAL_STAND') {
    return { contextRatio: 0.1, fitPadding: 1.6, minDistanceRatio: 0.085, maxDistanceRatio: 0.54, minimumDirectionY: 0.5 };
  }
  if (classification === 'QUADRA') {
    return { contextRatio: 0.24, fitPadding: 1.3, minDistanceRatio: 0.12, maxDistanceRatio: 0.72, minimumDirectionY: 0.56 };
  }
  if (classification === 'PAVILION' || classification === 'BUILDING' || classification === 'ADMINISTRATION') {
    return { contextRatio: 0.18, fitPadding: 1.46, minDistanceRatio: 0.1, maxDistanceRatio: 0.62, minimumDirectionY: 0.53 };
  }
  if (['PARKING', 'EVENT_VENUE', 'LIVESTOCK_AREA', 'RURAL_EXHIBITION', 'ATTRACTION'].includes(classification)) {
    return { contextRatio: 0.26, fitPadding: 1.34, minDistanceRatio: 0.14, maxDistanceRatio: 0.76, minimumDirectionY: 0.58 };
  }
  if (['RESTAURANT', 'FOOD_AREA', 'SERVICE', 'GATE', 'RESTROOM', 'CHEMICAL_RESTROOM', 'EMERGENCY', 'SECURITY'].includes(classification)) {
    return { contextRatio: 0.14, fitPadding: 1.5, minDistanceRatio: 0.09, maxDistanceRatio: 0.58, minimumDirectionY: 0.51 };
  }
  return { contextRatio: 0.15, fitPadding: 1.45, minDistanceRatio: 0.09, maxDistanceRatio: 0.62, minimumDirectionY: 0.52 };
}
