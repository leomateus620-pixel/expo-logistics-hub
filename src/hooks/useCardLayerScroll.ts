import { useCallback, useEffect, useRef, useState } from 'react';

interface Options {
  /** Quantidade de telas empilhadas verticalmente (sempre 2 nesta feature). */
  layers?: number;
}

export interface LayerScroll {
  /** Progresso contínuo entre 0 (primary) e 1 (secondary). */
  progress: number;
  /** Tela alvo atual. */
  index: number;
  isDragging: boolean;
  goTo: (index: number) => void;
  bind: {
    ref: (node: HTMLElement | null) => void;
    onPointerDown: (event: React.PointerEvent) => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
  };
  /** True quando o gesto atual deslocou o conteúdo (evita disparar clique). */
  movedRef: React.MutableRefObject<boolean>;
}

const STIFFNESS = 300;
const DAMPING = 32;
/** Acúmulo mínimo de deltaY para considerar intenção real de troca. */
const WHEEL_THRESHOLD = 42;
/** Lock após uma troca, evitando múltiplas transições no mesmo flick. */
const COOLDOWN_MS = 520;
/** Fim do gesto de roda (trackpad emite rajadas contínuas). */
const WHEEL_IDLE_MS = 140;
const DRAG_THRESHOLD = 5;

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Controlador de duas telas empilhadas verticalmente dentro de um card.
 *
 * - roda/trackpad só é consumida quando existe destino válido na direção do gesto,
 *   preservando o scroll da página nos extremos;
 * - toque acompanha o dedo em tempo real e decide por distância + velocidade;
 * - o movimento é integrado com spring-damper em rAF e consumido via transform/opacity.
 */
export function useCardLayerScroll({ layers = 2 }: Options = {}): LayerScroll {
  const max = Math.max(0, layers - 1);
  const nodeRef = useRef<HTMLElement | null>(null);
  const heightRef = useRef(1);
  const progressRef = useRef(0);
  const velocityRef = useRef(0);
  const targetRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const pointerRef = useRef<{ id: number; y: number; time: number } | null>(null);
  const wheelAccumRef = useRef(0);
  const wheelIdleRef = useRef<number | null>(null);
  const lockedUntilRef = useRef(0);

  const [progress, setProgress] = useState(0);
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

    const distance = targetRef.current - progressRef.current;
    const accel = distance * STIFFNESS - velocityRef.current * DAMPING;
    velocityRef.current += accel * dt;
    progressRef.current += velocityRef.current * dt;

    if (Math.abs(targetRef.current - progressRef.current) < 0.0012 && Math.abs(velocityRef.current) < 0.02) {
      progressRef.current = targetRef.current;
      velocityRef.current = 0;
      setProgress(progressRef.current);
      frameRef.current = null;
      return;
    }
    setProgress(progressRef.current);
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
        progressRef.current = clamped;
        velocityRef.current = 0;
        setProgress(clamped);
        return;
      }
      start();
    },
    [max, start],
  );

  const goTo = useCallback(
    (next: number) => {
      lockedUntilRef.current = performance.now() + COOLDOWN_MS;
      settle(next);
    },
    [settle],
  );

  // ---- Roda / trackpad -------------------------------------------------
  useEffect(() => {
    const el = nodeRef.current;
    if (!el || max === 0) return;

    const clearIdle = () => {
      if (wheelIdleRef.current) {
        window.clearTimeout(wheelIdleRef.current);
        wheelIdleRef.current = null;
      }
    };

    const onWheel = (event: WheelEvent) => {
      const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      if (Math.abs(dy) <= Math.abs(event.deltaX)) return;

      const current = targetRef.current;
      const direction = dy > 0 ? 1 : -1;
      const destination = current + direction;
      // Sem destino válido: a página segue rolando normalmente.
      if (destination < 0 || destination > max) {
        wheelAccumRef.current = 0;
        return;
      }

      event.preventDefault();

      const now = performance.now();
      if (now < lockedUntilRef.current) {
        clearIdle();
        wheelIdleRef.current = window.setTimeout(() => {
          wheelAccumRef.current = 0;
        }, WHEEL_IDLE_MS);
        return;
      }

      if (wheelAccumRef.current * direction < 0) wheelAccumRef.current = 0;
      wheelAccumRef.current += dy;

      clearIdle();
      wheelIdleRef.current = window.setTimeout(() => {
        wheelAccumRef.current = 0;
      }, WHEEL_IDLE_MS);

      if (Math.abs(wheelAccumRef.current) >= WHEEL_THRESHOLD) {
        wheelAccumRef.current = 0;
        lockedUntilRef.current = now + COOLDOWN_MS;
        velocityRef.current = Math.max(-2.4, Math.min(2.4, direction * 1.1));
        settle(destination);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      clearIdle();
    };
  }, [max, settle]);

  useEffect(() => () => stop(), [stop]);

  // ---- Toque / arraste -------------------------------------------------
  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (max === 0) return;
      if (event.pointerType === 'mouse') return; // mouse usa roda/teclado
      const node = nodeRef.current;
      if (!node) return;
      heightRef.current = node.getBoundingClientRect().height || 1;
      pointerRef.current = { id: event.pointerId, y: event.clientY, time: performance.now() };
      movedRef.current = false;
      draggingRef.current = false;

      const startIndex = targetRef.current;

      const onMove = (moveEvent: PointerEvent) => {
        const origin = pointerRef.current;
        if (!origin || moveEvent.pointerId !== origin.id) return;
        const dy = origin.y - moveEvent.clientY;

        if (!draggingRef.current) {
          if (Math.abs(dy) < DRAG_THRESHOLD) return;
          const direction = dy > 0 ? 1 : -1;
          // Sem destino válido, o gesto pertence à página.
          if (startIndex + direction < 0 || startIndex + direction > max) return;
          draggingRef.current = true;
          movedRef.current = true;
          setIsDragging(true);
          stop();
          node.setPointerCapture?.(moveEvent.pointerId);
        }

        const now = performance.now();
        const dt = Math.max(0.001, (now - origin.time) / 1000);
        velocityRef.current = dy / heightRef.current / dt;
        origin.y = moveEvent.clientY;
        origin.time = now;

        const next = progressRef.current + dy / heightRef.current;
        progressRef.current = Math.min(max + 0.05, Math.max(-0.05, next));
        setProgress(progressRef.current);
      };

      const finish = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        node.releasePointerCapture?.(upEvent.pointerId);
        if (draggingRef.current) {
          const projected = progressRef.current + velocityRef.current * 0.14;
          lockedUntilRef.current = performance.now() + COOLDOWN_MS;
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
    [max, settle, stop],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (max === 0) return;
      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        if (targetRef.current >= max) return;
        event.preventDefault();
        goTo(targetRef.current + 1);
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        if (targetRef.current <= 0) return;
        event.preventDefault();
        goTo(targetRef.current - 1);
      }
    },
    [goTo, max],
  );

  const setNode = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
    if (node) heightRef.current = node.getBoundingClientRect().height || 1;
  }, []);

  return {
    progress,
    index,
    isDragging,
    goTo,
    bind: { ref: setNode, onPointerDown, onKeyDown },
    movedRef,
  };
}
