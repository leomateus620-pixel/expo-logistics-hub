import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AlvoradaCanvas } from './AlvoradaCanvas';
import {
  degradeAlvoradaQualityProfile,
  getAlvoradaQualityProfile,
  getAlvoradaWebGLTier,
} from './capabilities';
import {
  ALVORADA_EXIT_DURATION_MS,
  ALVORADA_SEQUENCE_DURATION,
} from './timeline';
import type {
  AlvoradaFallbackReason,
  AlvoradaRendererState,
} from './types';
import './alvorada.css';

interface FenasojaAlvoradaExperienceProps {
  onComplete: () => void;
}

interface AlvoradaErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onError: () => void;
}

interface AlvoradaErrorBoundaryState {
  failed: boolean;
}

const ALVORADA_CONTEXT_RECOVERY_DELAY_MS = 500;
const ALVORADA_CONTEXT_RECOVERY_TIMEOUT_MS = 3000;

type AlvoradaVisibleTimerKey = 'recovery-delay' | 'recovery-timeout';

interface AlvoradaVisibleTimer {
  callback: (() => void) | null;
  remainingMs: number;
  startedAt: number | null;
  timeoutId: number | null;
}

function createVisibleTimer(): AlvoradaVisibleTimer {
  return {
    callback: null,
    remainingMs: 0,
    startedAt: null,
    timeoutId: null,
  };
}

function useAlvoradaVisibleTimeouts() {
  const timers = useRef<Record<AlvoradaVisibleTimerKey, AlvoradaVisibleTimer>>({
    'recovery-delay': createVisibleTimer(),
    'recovery-timeout': createVisibleTimer(),
  });

  const scheduleTimer = useCallback((timer: AlvoradaVisibleTimer) => {
    if (timer.callback === null || timer.timeoutId !== null || document.hidden) return;

    timer.startedAt = Date.now();
    timer.timeoutId = window.setTimeout(() => {
      timer.timeoutId = null;
      timer.startedAt = null;
      timer.remainingMs = 0;
      const callback = timer.callback;
      timer.callback = null;
      callback?.();
    }, Math.max(0, timer.remainingMs));
  }, []);

  const clearTimer = useCallback((key: AlvoradaVisibleTimerKey) => {
    const timer = timers.current[key];
    if (timer.timeoutId !== null) window.clearTimeout(timer.timeoutId);
    timer.callback = null;
    timer.remainingMs = 0;
    timer.startedAt = null;
    timer.timeoutId = null;
  }, []);

  const clearTimers = useCallback(() => {
    (Object.keys(timers.current) as AlvoradaVisibleTimerKey[]).forEach(clearTimer);
  }, [clearTimer]);

  const armTimer = useCallback((
    key: AlvoradaVisibleTimerKey,
    durationMs: number,
    callback: () => void,
  ) => {
    clearTimer(key);
    const timer = timers.current[key];
    timer.callback = callback;
    timer.remainingMs = Math.max(0, durationMs);
    scheduleTimer(timer);
  }, [clearTimer, scheduleTimer]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const activeTimers = Object.values(timers.current);
      if (document.hidden) {
        const hiddenAt = Date.now();
        activeTimers.forEach((timer) => {
          if (timer.timeoutId === null || timer.startedAt === null) return;
          window.clearTimeout(timer.timeoutId);
          timer.timeoutId = null;
          timer.remainingMs = Math.max(0, timer.remainingMs - (hiddenAt - timer.startedAt));
          timer.startedAt = null;
        });
        return;
      }

      activeTimers.forEach(scheduleTimer);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTimers();
    };
  }, [clearTimers, scheduleTimer]);

  return { armTimer, clearTimer, clearTimers };
}

class AlvoradaErrorBoundary extends Component<
  AlvoradaErrorBoundaryProps,
  AlvoradaErrorBoundaryState
> {
  state: AlvoradaErrorBoundaryState = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError();
    if (import.meta.env.DEV) {
      console.warn('A experiência Alvorada ativou o fallback WebGL.', error, info.componentStack);
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function AlvoradaFallback({ showTitle = true }: { showTitle?: boolean }) {
  return (
    <div
      className="alvorada-fallback"
      data-testid="alvorada-fallback"
      role="img"
      aria-label={showTitle
        ? 'FENASOJA 2028 revelada na Alvorada de Santa Rosa'
        : 'Recuperando a Alvorada de Santa Rosa'}
    >
      <div className="alvorada-fallback__sun" aria-hidden="true" />
      <div className="alvorada-fallback__cloud alvorada-fallback__cloud--one" aria-hidden="true" />
      <div className="alvorada-fallback__cloud alvorada-fallback__cloud--two" aria-hidden="true" />
      <div className="alvorada-fallback__horizon" aria-hidden="true" />
      {showTitle && (
        <div className="alvorada-fallback__title" aria-hidden="true">
          <img src="/alvorada/fenasoja-symbol-official.png" alt="" />
          <span>FENASOJA</span>
          <strong>2028</strong>
        </div>
      )}
    </div>
  );
}

export default function FenasojaAlvoradaExperience({ onComplete }: FenasojaAlvoradaExperienceProps) {
  const [rendererTier] = useState(getAlvoradaWebGLTier);
  const [quality, setQuality] = useState(() => getAlvoradaQualityProfile(rendererTier));
  const [rendererState, setRendererState] = useState<AlvoradaRendererState>(
    rendererTier === 'unavailable' ? 'fallback' : 'loading',
  );
  const [fallbackReason, setFallbackReason] = useState<AlvoradaFallbackReason | null>(
    rendererTier === 'unavailable' ? 'unsupported-webgl' : null,
  );
  const [canvasAttempt, setCanvasAttempt] = useState(0);
  const [initialElapsed, setInitialElapsed] = useState(0);
  const [ready, setReady] = useState(rendererTier === 'unavailable');
  const [leaving, setLeaving] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const rendererStateRef = useRef<AlvoradaRendererState>(
    rendererTier === 'unavailable' ? 'fallback' : 'loading',
  );
  const currentElapsed = useRef(0);
  const recoveryAttempts = useRef(0);
  const exitStarted = useRef(false);
  const exitTimer = useRef<number | null>(null);
  const recoveryFrame = useRef<number | null>(null);
  const { armTimer, clearTimer, clearTimers } = useAlvoradaVisibleTimeouts();

  useEffect(() => {
    let resizeFrame: number | null = null;
    const updateQuality = () => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        setQuality(getAlvoradaQualityProfile(rendererTier));
      });
    };

    window.addEventListener('resize', updateQuality, { passive: true });
    window.addEventListener('orientationchange', updateQuality, { passive: true });
    return () => {
      window.removeEventListener('resize', updateQuality);
      window.removeEventListener('orientationchange', updateQuality);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    };
  }, [rendererTier]);

  const transitionRenderer = useCallback((nextState: AlvoradaRendererState) => {
    rendererStateRef.current = nextState;
    setRendererState(nextState);
  }, []);

  const clearRuntimeTimers = useCallback(() => {
    if (recoveryFrame.current !== null) window.cancelAnimationFrame(recoveryFrame.current);
    clearTimers();
    recoveryFrame.current = null;
  }, [clearTimers]);

  const finish = useCallback(() => {
    if (exitStarted.current) return;
    exitStarted.current = true;
    clearRuntimeTimers();
    setLeaving(true);
    exitTimer.current = window.setTimeout(onComplete, ALVORADA_EXIT_DURATION_MS);
  }, [clearRuntimeTimers, onComplete]);

  const enterTerminalFallback = useCallback((reason: AlvoradaFallbackReason) => {
    if (exitStarted.current || rendererStateRef.current === 'fallback') return;
    clearRuntimeTimers();
    setFallbackReason(reason);
    transitionRenderer('fallback');
    setReady(true);
  }, [clearRuntimeTimers, transitionRenderer]);

  const handleProgress = useCallback((elapsed: number) => {
    if (
      rendererStateRef.current !== 'loading'
      && rendererStateRef.current !== 'webgl'
    ) return;

    currentElapsed.current = Math.min(
      ALVORADA_SEQUENCE_DURATION,
      Math.max(0, elapsed),
    );
  }, []);

  const handleQualityDecline = useCallback(() => {
    setQuality((current) => degradeAlvoradaQualityProfile(current));
  }, []);

  const handleReady = useCallback(() => {
    if (exitStarted.current || rendererStateRef.current !== 'loading') return;
    clearTimer('recovery-timeout');
    setFallbackReason(null);
    transitionRenderer('webgl');
    setReady(true);
  }, [clearTimer, transitionRenderer]);

  const handleContextLost = useCallback((elapsed: number) => {
    if (
      exitStarted.current
      || rendererStateRef.current === 'recovering'
      || rendererStateRef.current === 'fallback'
    ) return;

    const elapsedSnapshot = Math.min(
      ALVORADA_SEQUENCE_DURATION,
      Math.max(0, elapsed),
    );
    currentElapsed.current = elapsedSnapshot;

    if (recoveryAttempts.current >= 1) {
      enterTerminalFallback('context-lost');
      return;
    }

    recoveryAttempts.current += 1;
    setInitialElapsed(elapsedSnapshot);
    setFallbackReason('context-lost');
    transitionRenderer('recovering');
    setReady(true);
    clearRuntimeTimers();

    armTimer('recovery-delay', ALVORADA_CONTEXT_RECOVERY_DELAY_MS, () => {
      if (exitStarted.current) return;

      recoveryFrame.current = window.requestAnimationFrame(() => {
        recoveryFrame.current = null;
        if (exitStarted.current) return;

        setCanvasAttempt((attempt) => attempt + 1);
        transitionRenderer('loading');
        setReady(false);
        armTimer(
          'recovery-timeout',
          ALVORADA_CONTEXT_RECOVERY_TIMEOUT_MS,
          () => enterTerminalFallback('context-lost'),
        );
      });
    });
  }, [armTimer, clearRuntimeTimers, enterTerminalFallback, transitionRenderer]);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => closeButton.current?.focus({
      preventScroll: true,
    }));

    const containKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        closeButton.current?.focus({ preventScroll: true });
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish();
      }
    };
    window.addEventListener('keydown', containKeyboard, true);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', containKeyboard, true);
      clearRuntimeTimers();
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    };
  }, [clearRuntimeTimers, finish]);

  const fallback = <AlvoradaFallback />;
  const recoveryFallback = <AlvoradaFallback showTitle={false} />;
  const shouldRenderWebGL = rendererTier !== 'unavailable'
    && (rendererState === 'loading' || rendererState === 'webgl');
  const dataRenderer = shouldRenderWebGL ? 'webgl' : rendererState;

  return createPortal(
    <section
      className={`alvorada-overlay${ready ? ' alvorada-overlay--ready' : ''}${leaving ? ' alvorada-overlay--leaving' : ''}`}
      data-testid="alvorada-experience"
      data-renderer-state={rendererState}
      data-fallback-reason={fallbackReason ?? undefined}
      data-quality={quality.level}
      role="dialog"
      aria-modal="true"
      aria-label="O Nascer da Alvorada"
    >
      <div
        className="alvorada-overlay__canvas"
        aria-hidden={shouldRenderWebGL ? true : undefined}
        data-renderer={dataRenderer}
      >
        {shouldRenderWebGL ? (
          <AlvoradaErrorBoundary
            key={canvasAttempt}
            fallback={fallback}
            onError={() => enterTerminalFallback('render-error')}
          >
            <AlvoradaCanvas
              initialElapsed={initialElapsed}
              onContextLost={handleContextLost}
              onProgress={handleProgress}
              onQualityDecline={handleQualityDecline}
              onReady={handleReady}
              quality={quality}
              rendererTier={rendererTier}
            />
          </AlvoradaErrorBoundary>
        ) : rendererState === 'recovering' ? recoveryFallback : fallback}
      </div>

      {rendererState === 'loading' && (
        <div className="alvorada-overlay__loader" aria-live="polite" aria-atomic="true">
          <span className="alvorada-overlay__loader-orbit" aria-hidden="true" />
          <span>Preparando a Alvorada</span>
        </div>
      )}

      <button
        ref={closeButton}
        type="button"
        className="alvorada-overlay__close"
        aria-label="Fechar O Nascer da Alvorada"
        onClick={finish}
      >
        <X aria-hidden="true" />
      </button>

      <p className="sr-only" aria-live="polite">
        Jornada de Brasil a Santa Rosa, culminando na Alvorada da FENASOJA 2028.
      </p>
    </section>,
    document.body,
  );
}
