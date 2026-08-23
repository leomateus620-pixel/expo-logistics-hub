import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import type { OrgLayoutBounds, OrgLayoutPoint } from '../layout/organizationalLayout';

export interface OrgViewportCamera {
  x: number;
  y: number;
  scale: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

interface PointerSnapshot {
  x: number;
  y: number;
  startedOnInteractive: boolean;
  startedOnNode: boolean;
}

interface GestureSnapshot {
  camera: OrgViewportCamera;
  pointers: Map<number, PointerSnapshot>;
  hadMultiplePointers: boolean;
  moved: boolean;
  startedOnInteractive: boolean;
}

export interface UseOrgViewportOptions {
  bounds: OrgLayoutBounds;
  initialFocusPoint?: OrgLayoutPoint | null;
  onBackgroundPress?: () => void;
}

export interface OrgViewportController {
  camera: OrgViewportCamera;
  cameraStyle: CSSProperties;
  fit: () => void;
  focusPoint: (point: OrgLayoutPoint, preferredScale?: number) => void;
  isAnimating: boolean;
  isInteracting: boolean;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  reset: () => void;
  viewportRef: RefObject<HTMLDivElement>;
  zoomBy: (factor: number) => void;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 2.35;
const CAMERA_TRANSITION_MS = 520;
const PAN_THRESHOLD_PX = 5;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function pointerDistance(a: PointerSnapshot, b: PointerSnapshot): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointerCenter(a: PointerSnapshot, b: PointerSnapshot): PointerSnapshot {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    startedOnInteractive: a.startedOnInteractive || b.startedOnInteractive,
    startedOnNode: a.startedOnNode || b.startedOnNode,
  };
}

function cameraForBounds(bounds: OrgLayoutBounds, size: ViewportSize): OrgViewportCamera {
  const isCompact = size.width <= 720;
  const horizontalPadding = isCompact ? 20 : 64;
  const topPadding = isCompact ? 166 : 142;
  const bottomPadding = isCompact ? 62 : 50;
  const usableWidth = Math.max(1, size.width - horizontalPadding * 2);
  const usableHeight = Math.max(1, size.height - topPadding - bottomPadding);
  const scale = clamp(
    Math.min(usableWidth / Math.max(1, bounds.width), usableHeight / Math.max(1, bounds.height)),
    MIN_SCALE,
    MAX_SCALE,
  );

  return {
    x: (size.width - bounds.width * scale) / 2 - bounds.x * scale,
    y: topPadding + (usableHeight - bounds.height * scale) / 2 - bounds.y * scale,
    scale,
  };
}

function cameraForInitialFocus(
  bounds: OrgLayoutBounds,
  size: ViewportSize,
  focusPoint: OrgLayoutPoint | null | undefined,
): OrgViewportCamera {
  const fitted = cameraForBounds(bounds, size);
  if (!focusPoint) return fitted;

  const compact = size.width <= 720;
  const minimumNarrativeScale = compact ? 0.54 : size.width <= 1600 ? 0.56 : 0.6;
  const scale = clamp(Math.max(fitted.scale, minimumNarrativeScale), MIN_SCALE, 0.78);
  const focusY = compact
    ? clamp(size.height * 0.29, 235, 285)
    : clamp(size.height * 0.26, 230, 280);

  return {
    x: size.width / 2 - focusPoint.x * scale,
    y: focusY - focusPoint.y * scale,
    scale,
  };
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && Boolean(target.closest('[data-org-node], [data-org-interactive]'));
}

function isNodeTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-org-node]'));
}

function capturePointer(element: HTMLDivElement, pointerId: number): void {
  if (
    typeof element.setPointerCapture !== 'function'
    || typeof element.hasPointerCapture !== 'function'
    || element.hasPointerCapture(pointerId)
  ) return;
  element.setPointerCapture(pointerId);
}

function releasePointer(element: HTMLDivElement, pointerId: number): void {
  if (
    typeof element.releasePointerCapture !== 'function'
    || typeof element.hasPointerCapture !== 'function'
    || !element.hasPointerCapture(pointerId)
  ) return;
  element.releasePointerCapture(pointerId);
}

function cameraFromRenderedTransform(
  transform: string,
  fallback: OrgViewportCamera,
): OrgViewportCamera {
  if (!transform || transform === 'none') return fallback;

  const direct = transform.match(
    /^translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px,\s*-?[\d.]+px\s*\)\s*scale\(\s*([\d.]+)\s*\)$/,
  );
  if (direct) {
    const [, x, y, scale] = direct;
    return { x: Number(x), y: Number(y), scale: Number(scale) };
  }

  const valueStart = transform.indexOf('(');
  const values = valueStart >= 0
    ? transform.slice(valueStart + 1, -1).split(',').map((value) => Number(value.trim()))
    : [];
  if (transform.startsWith('matrix3d(') && values.length === 16) {
    return {
      x: values[12],
      y: values[13],
      scale: Math.hypot(values[0], values[1]),
    };
  }
  if (transform.startsWith('matrix(') && values.length === 6) {
    return {
      x: values[4],
      y: values[5],
      scale: Math.hypot(values[0], values[1]),
    };
  }
  return fallback;
}

export function useOrgViewport({
  bounds,
  initialFocusPoint,
  onBackgroundPress,
}: UseOrgViewportOptions): OrgViewportController {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<OrgViewportCamera>({ x: 0, y: 0, scale: 1 });
  const [isAnimating, setIsAnimating] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const cameraRef = useRef(camera);
  const sizeRef = useRef<ViewportSize>({ width: 0, height: 0 });
  const pointers = useRef(new Map<number, PointerSnapshot>());
  const gesture = useRef<GestureSnapshot | null>(null);
  const transitionTimer = useRef<number | null>(null);
  const animationActive = useRef(false);
  const cameraFrame = useRef<number | null>(null);
  const clickSuppressionFrame = useRef<number | null>(null);
  const pendingCamera = useRef<OrgViewportCamera | null>(null);

  const commitCamera = useCallback((next: OrgViewportCamera) => {
    cameraRef.current = next;
    setCamera(next);
  }, []);

  const queueCamera = useCallback((next: OrgViewportCamera) => {
    pendingCamera.current = next;
    if (cameraFrame.current !== null) return;
    cameraFrame.current = window.requestAnimationFrame(() => {
      cameraFrame.current = null;
      const queued = pendingCamera.current;
      pendingCamera.current = null;
      if (queued) commitCamera(queued);
    });
  }, [commitCamera]);

  const stopAnimation = useCallback(() => {
    if (animationActive.current) {
      const world = viewportRef.current?.querySelector<HTMLElement>('.org-viewport__world');
      if (world) {
        commitCamera(cameraFromRenderedTransform(
          window.getComputedStyle(world).transform,
          cameraRef.current,
        ));
      }
    }
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    transitionTimer.current = null;
    animationActive.current = false;
    setIsAnimating(false);
  }, [commitCamera]);

  const animateCamera = useCallback((next: OrgViewportCamera) => {
    stopAnimation();
    animationActive.current = true;
    setIsAnimating(true);
    commitCamera(next);
    transitionTimer.current = window.setTimeout(() => {
      transitionTimer.current = null;
      animationActive.current = false;
      setIsAnimating(false);
    }, CAMERA_TRANSITION_MS);
  }, [commitCamera, stopAnimation]);

  const fit = useCallback(() => {
    const size = sizeRef.current;
    if (size.width <= 0 || size.height <= 0) return;
    animateCamera(cameraForBounds(bounds, size));
  }, [animateCamera, bounds]);

  const focusPoint = useCallback((point: OrgLayoutPoint, preferredScale?: number) => {
    const size = sizeRef.current;
    if (size.width <= 0 || size.height <= 0) return;
    const compact = size.width <= 720;
    const targetScale = clamp(
      preferredScale ?? Math.max(cameraRef.current.scale, compact ? 0.78 : 0.88),
      MIN_SCALE,
      MAX_SCALE,
    );
    const verticalOffset = compact ? Math.min(90, size.height * 0.1) : 0;
    animateCamera({
      x: size.width / 2 - point.x * targetScale,
      y: size.height / 2 - point.y * targetScale - verticalOffset,
      scale: targetScale,
    });
  }, [animateCamera]);

  const zoomAt = useCallback((factor: number, clientX: number, clientY: number) => {
    const element = viewportRef.current;
    if (!element) return;
    stopAnimation();
    const rect = element.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const current = cameraRef.current;
    const nextScale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
    const worldX = (localX - current.x) / current.scale;
    const worldY = (localY - current.y) / current.scale;
    commitCamera({
      x: localX - worldX * nextScale,
      y: localY - worldY * nextScale,
      scale: nextScale,
    });
  }, [commitCamera, stopAnimation]);

  const zoomBy = useCallback((factor: number) => {
    const element = viewportRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [zoomAt]);

  const onWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const normalizedDelta = event.deltaMode === 1 ? event.deltaY * 18 : event.deltaY;
    zoomAt(Math.exp(-normalizedDelta * 0.00115), event.clientX, event.clientY);
  }, [zoomAt]);

  const beginGesture = useCallback((preserveState = false) => {
    const previousGesture = gesture.current;
    const pointerSnapshots = Array.from(pointers.current.values());
    gesture.current = {
      camera: pendingCamera.current ?? cameraRef.current,
      pointers: new Map(pointers.current),
      hadMultiplePointers: pointers.current.size >= 2
        || (preserveState && Boolean(previousGesture?.hadMultiplePointers)),
      moved: preserveState && Boolean(previousGesture?.moved),
      startedOnInteractive: pointerSnapshots.some((pointer) => pointer.startedOnInteractive)
        || (preserveState && Boolean(previousGesture?.startedOnInteractive)),
    };
  }, []);

  const markGestureMoved = useCallback(() => {
    if (gesture.current) gesture.current.moved = true;
    const element = viewportRef.current;
    if (element) element.dataset.orgGestureMoved = 'true';
  }, []);

  const scheduleClickSuppressionClear = useCallback(() => {
    if (clickSuppressionFrame.current !== null) {
      window.cancelAnimationFrame(clickSuppressionFrame.current);
    }
    clickSuppressionFrame.current = window.requestAnimationFrame(() => {
      clickSuppressionFrame.current = null;
      const element = viewportRef.current;
      if (element) delete element.dataset.orgGestureMoved;
    });
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const startedOnNode = isNodeTarget(event.target);
    const startedOnInteractive = isInteractiveTarget(event.target);
    const touchNodeGesture = event.pointerType === 'touch' && startedOnNode;
    if (startedOnInteractive && !touchNodeGesture) return;

    stopAnimation();
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startedOnInteractive,
      startedOnNode,
    });
    beginGesture(pointers.current.size > 1);
    if (!touchNodeGesture || pointers.current.size > 1) {
      pointers.current.forEach((_, pointerId) => capturePointer(event.currentTarget, pointerId));
    }
    if (pointers.current.size > 1) {
      if (gesture.current) gesture.current.hadMultiplePointers = true;
      markGestureMoved();
    }
    setIsInteracting(true);
  }, [beginGesture, markGestureMoved, stopAnimation]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    const previousPointer = pointers.current.get(event.pointerId);
    if (!previousPointer) return;
    pointers.current.set(event.pointerId, {
      ...previousPointer,
      x: event.clientX,
      y: event.clientY,
    });
    const currentPointers = Array.from(pointers.current.values());
    const initialPointers = Array.from(gesture.current.pointers.values());

    if (currentPointers.length === 1 && initialPointers.length >= 1) {
      const deltaX = currentPointers[0].x - initialPointers[0].x;
      const deltaY = currentPointers[0].y - initialPointers[0].y;
      if (!gesture.current.moved && Math.hypot(deltaX, deltaY) <= PAN_THRESHOLD_PX) return;
      if (!gesture.current.moved) {
        capturePointer(event.currentTarget, event.pointerId);
        markGestureMoved();
      }
      event.preventDefault();
      queueCamera({
        ...gesture.current.camera,
        x: gesture.current.camera.x + deltaX,
        y: gesture.current.camera.y + deltaY,
      });
      return;
    }

    if (currentPointers.length >= 2 && initialPointers.length >= 2) {
      const initialDistance = Math.max(1, pointerDistance(initialPointers[0], initialPointers[1]));
      const currentDistance = pointerDistance(currentPointers[0], currentPointers[1]);
      const initialCenter = pointerCenter(initialPointers[0], initialPointers[1]);
      const currentCenter = pointerCenter(currentPointers[0], currentPointers[1]);
      const initialCamera = gesture.current.camera;
      const nextScale = clamp(
        initialCamera.scale * (currentDistance / initialDistance),
        MIN_SCALE,
        MAX_SCALE,
      );
      const worldX = (initialCenter.x - initialCamera.x) / initialCamera.scale;
      const worldY = (initialCenter.y - initialCamera.y) / initialCamera.scale;
      pointers.current.forEach((_, pointerId) => capturePointer(event.currentTarget, pointerId));
      markGestureMoved();
      event.preventDefault();
      queueCamera({
        x: currentCenter.x - worldX * nextScale,
        y: currentCenter.y - worldY * nextScale,
        scale: nextScale,
      });
    }
  }, [markGestureMoved, queueCamera]);

  const finishPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (!pointers.current.has(event.pointerId)) return;
    const wasSinglePointer = pointers.current.size === 1;
    const wasMoved = Boolean(gesture.current?.moved || gesture.current?.hadMultiplePointers);
    const startedOnInteractive = gesture.current?.startedOnInteractive ?? true;
    pointers.current.delete(event.pointerId);
    releasePointer(event.currentTarget, event.pointerId);

    if (pointers.current.size > 0) {
      beginGesture(true);
      return;
    }

    gesture.current = null;
    setIsInteracting(false);
    if (wasMoved) scheduleClickSuppressionClear();
    if (!cancelled && wasSinglePointer && !wasMoved && !startedOnInteractive) {
      onBackgroundPress?.();
    }
  }, [beginGesture, onBackgroundPress, scheduleClickSuppressionClear]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    finishPointer(event, false);
  }, [finishPointer]);

  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    finishPointer(event, true);
  }, [finishPointer]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;
    let resizeFrame: number | null = null;
    let initialized = false;
    let committedSize: ViewportSize = { width: 0, height: 0 };
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      const nextSize = { width, height };
      sizeRef.current = nextSize;
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        const previousSize = committedSize;
        if (!initialized || previousSize.width <= 0 || previousSize.height <= 0) {
          initialized = true;
          commitCamera(cameraForInitialFocus(bounds, nextSize, initialFocusPoint));
          committedSize = nextSize;
          return;
        }

        const current = cameraRef.current;
        const worldCenterX = (previousSize.width / 2 - current.x) / current.scale;
        const worldCenterY = (previousSize.height / 2 - current.y) / current.scale;
        commitCamera({
          x: nextSize.width / 2 - worldCenterX * current.scale,
          y: nextSize.height / 2 - worldCenterY * current.scale,
          scale: current.scale,
        });
        committedSize = nextSize;
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    };
  }, [bounds, commitCamera, initialFocusPoint]);

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    if (cameraFrame.current !== null) window.cancelAnimationFrame(cameraFrame.current);
    if (clickSuppressionFrame.current !== null) {
      window.cancelAnimationFrame(clickSuppressionFrame.current);
    }
    const element = viewportRef.current;
    if (element) delete element.dataset.orgGestureMoved;
  }, []);

  const cameraStyle = useMemo<CSSProperties>(() => ({
    transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`,
    transformOrigin: '0 0',
  }), [camera]);

  return {
    camera,
    cameraStyle,
    fit,
    focusPoint,
    isAnimating,
    isInteracting,
    onPointerCancel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    reset: fit,
    viewportRef,
    zoomBy,
  };
}
