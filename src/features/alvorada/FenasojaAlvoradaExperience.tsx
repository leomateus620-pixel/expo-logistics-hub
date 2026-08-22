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
import { AlvoradaBrandHero } from './AlvoradaBrandHero';
import {
  degradeAlvoradaQualityProfile,
  getAlvoradaQualityProfile,
  getAlvoradaWebGLTier,
} from './capabilities';
import { OrganizationalEcosystem } from './organizational/components/OrganizationalEcosystem';
import { useOrganizationalEcosystemData } from './organizational';
import {
  ALVORADA_EXIT_DURATION_MS,
  ALVORADA_PHASES,
  ALVORADA_SEQUENCE_DURATION,
  getAlvoradaPhase,
  type AlvoradaPhase,
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
const ALVORADA_LATE_ORG_TRANSITION_DURATION_MS =
  (ALVORADA_PHASES['org-transition'].end - ALVORADA_PHASES['org-transition'].start) * 1000;

type AlvoradaVisibleTimerKey =
  | 'fallback-progress'
  | 'late-org-transition'
  | 'recovery-delay'
  | 'recovery-timeout';

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
    'fallback-progress': createVisibleTimer(),
    'late-org-transition': createVisibleTimer(),
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

function AlvoradaFallback({ recovering = false }: { recovering?: boolean }) {
  return (
    <div
      className="alvorada-fallback"
      data-testid="alvorada-fallback"
      role="img"
      aria-label={recovering
        ? 'Recuperando a Alvorada de Santa Rosa'
        : 'Alvorada de Santa Rosa'}
    >
      <div className="alvorada-fallback__sun" aria-hidden="true" />
      <div className="alvorada-fallback__cloud alvorada-fallback__cloud--one" aria-hidden="true" />
      <div className="alvorada-fallback__cloud alvorada-fallback__cloud--two" aria-hidden="true" />
      <div className="alvorada-fallback__horizon" aria-hidden="true" />
    </div>
  );
}

const PHASE_ANNOUNCEMENTS: Record<AlvoradaPhase, string> = {
  dawn: 'O novo ciclo desperta na Alvorada.',
  territory: 'A jornada percorre o território do Rio Grande do Sul.',
  'santa-rosa': 'Santa Rosa é localizada como origem da FENASOJA 2028.',
  'brand-reveal': 'A marca oficial FENASOJA 2028 é revelada.',
  'brand-hold': 'FENASOJA 2028, edição de Santa Rosa.',
  'org-transition': 'A marca se transforma no ecossistema organizacional.',
  'org-ready': 'Ecossistema organizacional interativo disponível.',
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function FenasojaAlvoradaExperience({ onComplete }: FenasojaAlvoradaExperienceProps) {
  const organizationalData = useOrganizationalEcosystemData();
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
  const [phase, setPhase] = useState<AlvoradaPhase>('dawn');
  const [lateOrgTransitionActive, setLateOrgTransitionActive] = useState(false);
  const [ready, setReady] = useState(rendererTier === 'unavailable');
  const [leaving, setLeaving] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const rendererStateRef = useRef<AlvoradaRendererState>(
    rendererTier === 'unavailable' ? 'fallback' : 'loading',
  );
  const currentElapsed = useRef(0);
  const phaseRef = useRef<AlvoradaPhase>('dawn');
  const recoveryAttempts = useRef(0);
  const terminalDataWasPending = useRef(false);
  const lateOrgTransitionStarted = useRef(false);
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

  const commitElapsed = useCallback((elapsed: number) => {
    const nextElapsed = Math.min(
      ALVORADA_SEQUENCE_DURATION,
      Math.max(0, elapsed),
    );
    currentElapsed.current = nextElapsed;
    const nextPhase = getAlvoradaPhase(nextElapsed);
    if (nextPhase !== phaseRef.current) {
      phaseRef.current = nextPhase;
      setPhase(nextPhase);
    }
  }, []);

  const handleProgress = useCallback((elapsed: number) => {
    if (
      rendererStateRef.current !== 'loading'
      && rendererStateRef.current !== 'webgl'
    ) return;

    commitElapsed(elapsed);
  }, [commitElapsed]);

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
    commitElapsed(elapsedSnapshot);

    // The WebGL journey has already fulfilled its role at this boundary. React
    // releases the canvas on the same render, so a recovery can no longer
    // contribute to the experience.
    if (elapsedSnapshot >= ALVORADA_SEQUENCE_DURATION) {
      return;
    }

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
  }, [
    armTimer,
    clearRuntimeTimers,
    commitElapsed,
    enterTerminalFallback,
    transitionRenderer,
  ]);

  useEffect(() => {
    if (rendererState !== 'fallback' || phase === 'org-ready' || exitStarted.current) {
      clearTimer('fallback-progress');
      return;
    }

    const phaseEnd = ALVORADA_PHASES[phase].end;
    if (!Number.isFinite(phaseEnd)) return;

    armTimer(
      'fallback-progress',
      Math.max(0, phaseEnd - currentElapsed.current) * 1000,
      () => commitElapsed(phaseEnd),
    );

    return () => clearTimer('fallback-progress');
  }, [armTimer, clearTimer, commitElapsed, phase, rendererState]);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => closeButton.current?.focus({
      preventScroll: true,
    }));

    const containKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const activeDialog = dialog.current;
        if (!activeDialog) return;
        const focusable = Array.from(
          activeDialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((element) => (
          element.getAttribute('aria-hidden') !== 'true'
          && !element.closest('[aria-hidden="true"]')
        ));
        const first = focusable[0];
        const last = focusable.at(-1);
        const activeElement = document.activeElement;

        if (!first || !last) {
          event.preventDefault();
          closeButton.current?.focus({ preventScroll: true });
          return;
        }

        if (event.shiftKey && (activeElement === first || !activeDialog.contains(activeElement))) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && (activeElement === last || !activeDialog.contains(activeElement))) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      }
      if (event.key === 'Escape') {
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLInputElement
          && activeElement.closest('.org-search')
          && activeElement.value
        ) return;
        const openDetail = dialog.current?.querySelector<HTMLElement>(
          '.org-ecosystem__ready[data-org-detail-open="true"]',
        );
        if (openDetail?.contains(activeElement)) return;
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

  const graphPhase = phase === 'org-transition' || phase === 'org-ready';
  const graphActive = graphPhase && !organizationalData.isLoading;
  const graphPreloaded = (phase === 'brand-hold' || graphPhase)
    && !organizationalData.isLoading;
  const lateOrgTransitionPending = phase === 'org-ready'
    && !organizationalData.isLoading
    && terminalDataWasPending.current
    && !lateOrgTransitionStarted.current;
  const displayPhase: AlvoradaPhase = lateOrgTransitionActive || lateOrgTransitionPending
    ? 'org-transition'
    : graphPhase && organizationalData.isLoading
      ? 'brand-hold'
      : phase;
  const webglReleased = phase === 'org-ready';
  const fallback = <AlvoradaFallback />;
  const recoveryFallback = <AlvoradaFallback recovering />;
  const shouldRenderWebGL = rendererTier !== 'unavailable'
    && !webglReleased
    && (rendererState === 'loading' || rendererState === 'webgl');
  const dataRenderer = webglReleased
    ? 'released'
    : shouldRenderWebGL
      ? 'webgl'
      : rendererState;

  useEffect(() => {
    if (webglReleased) clearRuntimeTimers();
  }, [clearRuntimeTimers, webglReleased]);

  useEffect(() => {
    if (phase !== 'org-ready' || exitStarted.current) return;

    if (organizationalData.isLoading) {
      terminalDataWasPending.current = true;
      return;
    }

    if (!terminalDataWasPending.current || lateOrgTransitionStarted.current) return;

    terminalDataWasPending.current = false;
    lateOrgTransitionStarted.current = true;
    setLateOrgTransitionActive(true);
    armTimer(
      'late-org-transition',
      ALVORADA_LATE_ORG_TRANSITION_DURATION_MS,
      () => setLateOrgTransitionActive(false),
    );
  }, [armTimer, organizationalData.isLoading, phase]);

  return createPortal(
    <section
      ref={dialog}
      className={`alvorada-overlay${ready ? ' alvorada-overlay--ready' : ''}${leaving ? ' alvorada-overlay--leaving' : ''}`}
      data-testid="alvorada-experience"
      data-renderer-state={rendererState}
      data-fallback-reason={fallbackReason ?? undefined}
      data-quality={quality.level}
      data-stage={displayPhase}
      role="dialog"
      aria-modal="true"
      aria-label="O Nascer da Alvorada"
    >
      <div
        className="alvorada-overlay__canvas"
        aria-hidden={shouldRenderWebGL ? true : undefined}
        data-renderer={dataRenderer}
      >
        {webglReleased ? null : shouldRenderWebGL ? (
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

      <AlvoradaBrandHero
        dataPending={organizationalData.isLoading}
        stage={displayPhase}
      />

      {graphPreloaded && (
        <OrganizationalEcosystem
          active={graphActive}
          error={organizationalData.error}
          graph={organizationalData.graph}
          loading={organizationalData.isLoading}
          onRetry={() => void organizationalData.refetch()}
        />
      )}

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
        {PHASE_ANNOUNCEMENTS[displayPhase]}
      </p>
    </section>,
    document.body,
  );
}
