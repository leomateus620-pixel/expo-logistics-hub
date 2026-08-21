import { useCallback, useEffect, useRef, useState } from 'react';

interface Options {
  /** Quantidade de camadas empilhadas (atualmente 2). */
  layers?: number;
}

interface LayerScroll {
  /** Posição contínua entre 0 e (layers - 1). */
  offset: number;
  /** Camada alvo atual (snap). */
  index: number;
  isDragging: boolean;
  goTo: (index: number) => void;
  bind: {
    ref: (node: HTMLElement | null) => void;
    onPointerDown: (event: React.PointerEvent) => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
  };
  /** True quando o gesto atual moveu o conteúdo (evita disparar clique). */
  movedRef: React.MutableRefObject<boolean>;
}

const STIFFNESS = 260;
const DAMPING = 30;
const MOVE_THRESHOLD = 4;

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Navegação vertical entre camadas dentro de um card, com spring/damping,
 * inércia por velocidade, resistência no overscroll e snap.
 * Anima somente valores numéricos consumidos via transform/opacity.
 */
export function useCardLayerScroll({ layers = 2 }: Options = {}): LayerScroll {
  const max = Math.max(0, layers - 1);
  const nodeRef = useRef<HTMLElement | null>(null);
  const heightRef = useRef(1);
  const offsetRef = useRef(0);
  const velocityRef = useRef(0);
  const targetRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const pointerRef = useRef<{ id: number; y: number; time: number } | null>(null);
  const wheelResetRef = useRef<number | null>(null);

  const [offset, setOffset] = useState(0);
  const [index, setIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const now = performance.now();
    const dt = Math.min(0.032, Math.max(0.001, (now - lastTimeRef.current) / 1000));
    lastTimeRef.current = now;

    const distance = targetRef.current - offsetRef.current;
    const accel = distance * STIFFNESS - velocityRef.current * DAMPING;
    velocityRef.current += accel * dt;
    offsetRef.current += velocityRef.current * dt;

    if (Math.abs(distance) < 0.0015 && Math.abs(velocityRef.current) < 0.02) {
      offsetRef.current = targetRef.current;
      velocityRef.current = 0;
      setOffset(offsetRef.current);
      frameRef.current = null;
      return;
    }
    setOffset(offsetRef.current);
    frameRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(() => {
    if (frameRef.current !== null) return;
    lastTimeRef.current = performance.now();
    frameRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const settle = useCallback(
    (next: number) => {
      const clamped = Math.min(max, Math.max(0, Math.round(next)));
      targetRef.current = clamped;
      setIndex(clamped);
      if (prefersReducedMotion()) {
        offsetRef.current = clamped;
        velocityRef.current = 0;
        setOffset(clamped);
        return;
      }
      start();
    },
    [max, start],
  );

  const goTo = useCallback((next: number) => settle(next), [settle]);

  const applyDelta = useCallback(
    (deltaLayers: number) => {
      let next = offsetRef.current + deltaLayers;
      // resistência elástica fora dos limites
      if (next < 0) next = offsetRef.current + deltaLayers * 0.25;
      if (next > max) next = offsetRef.current + deltaLayers * 0.25;
      offsetRef.current = Math.min(max + 0.08, Math.max(-0.08, next));
      setOffset(offsetRef.current);
    },
    [max],
  );

  // Wheel/trackpad — listener nativo não passivo, só captura com intenção clara.
  useEffect(() => {
    const el = nodeRef.current;
    if (!el || max === 0) return;

    const onWheel = (event: WheelEvent) => {
      const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      if (Math.abs(dy) < Math.abs(event.deltaX)) return;
      const atStart = offsetRef.current <= 0.001 && dy < 0;
      const atEnd = offsetRef.current >= max - 0.001 && dy > 0;
      if (atStart || atEnd) return; // deixa a página rolar normalmente
      event.preventDefault();
      stop();
      applyDelta(dy / Math.max(120, heightRef.current));
      velocityRef.current = 0;
      if (wheelResetRef.current) window.clearTimeout(wheelResetRef.current);
      wheelResetRef.current = window.setTimeout(() => {
        settle(offsetRef.current > 0.35 ? Math.ceil(offsetRef.current) : Math.round(offsetRef.current));
      }, 90);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelResetRef.current) window.clearTimeout(wheelResetRef.current);
    };
  }, [applyDelta, max, settle, stop]);

  useEffect(() => () => stop(), [stop]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (max === 0 || event.pointerType === 'mouse' && event.button !== 0) return;
      const node = nodeRef.current;
      if (!node) return;
      heightRef.current = node.getBoundingClientRect().height || 1;
      pointerRef.current = { id: event.pointerId, y: event.clientY, time: performance.now() };
      movedRef.current = false;
      draggingRef.current = false;
      stop();

      const onMove = (moveEvent: PointerEvent) => {
        const origin = pointerRef.current;
        if (!origin || moveEvent.pointerId !== origin.id) return;
        const dy = origin.y - moveEvent.clientY;
        if (!draggingRef.current) {
          if (Math.abs(dy) < MOVE_THRESHOLD) return;
          draggingRef.current = true;
          movedRef.current = true;
          setIsDragging(true);
          node.setPointerCapture?.(moveEvent.pointerId);
        }
        const now = performance.now();
        const dt = Math.max(0.001, (now - origin.time) / 1000);
        velocityRef.current = (dy / heightRef.current) / dt;
        origin.y = moveEvent.clientY;
        origin.time = now;
        applyDelta(dy / heightRef.current);
      };

      const finish = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        node.releasePointerCapture?.(upEvent.pointerId);
        if (draggingRef.current) {
          const projected = offsetRef.current + velocityRef.current * 0.16;
          settle(projected);
        }
        draggingRef.current = false;
        setIsDragging(false);
        pointerRef.current = null;
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [applyDelta, max, settle, stop],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (max === 0) return;
      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault();
        settle(Math.min(max, Math.round(offsetRef.current) + 1));
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        settle(Math.max(0, Math.round(offsetRef.current) - 1));
      }
    },
    [max, settle],
  );

  const setNode = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
    if (node) heightRef.current = node.getBoundingClientRect().height || 1;
  }, []);

  return {
    offset,
    index,
    isDragging,
    goTo,
    bind: { ref: setNode, onPointerDown, onKeyDown },
    movedRef,
  };
}
