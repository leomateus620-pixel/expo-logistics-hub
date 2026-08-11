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
  getAlvoradaQualityProfile,
  prefersReducedAlvoradaMotion,
  supportsAlvoradaWebGL,
} from './capabilities';
import { ALVORADA_EXIT_DURATION_MS } from './timeline';
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

function AlvoradaFallback({ onSettled, reducedMotion }: {
  onSettled: () => void;
  reducedMotion: boolean;
}) {
  useEffect(() => {
    const timeout = window.setTimeout(onSettled, reducedMotion ? 1800 : 3200);
    return () => window.clearTimeout(timeout);
  }, [onSettled, reducedMotion]);

  return (
    <div
      className="alvorada-fallback"
      data-testid="alvorada-fallback"
      role="img"
      aria-label="FENASOJA 2028 revelada na Alvorada de Santa Rosa"
    >
      <div className="alvorada-fallback__sun" aria-hidden="true" />
      <div className="alvorada-fallback__cloud alvorada-fallback__cloud--one" aria-hidden="true" />
      <div className="alvorada-fallback__cloud alvorada-fallback__cloud--two" aria-hidden="true" />
      <div className="alvorada-fallback__horizon" aria-hidden="true" />
      <div className="alvorada-fallback__title" aria-hidden="true">
        <span>FENASOJA</span>
        <strong>2028</strong>
      </div>
    </div>
  );
}

export default function FenasojaAlvoradaExperience({ onComplete }: FenasojaAlvoradaExperienceProps) {
  const [quality] = useState(getAlvoradaQualityProfile);
  const [webglAvailable] = useState(supportsAlvoradaWebGL);
  const [reducedMotion] = useState(prefersReducedAlvoradaMotion);
  const [renderFailure, setRenderFailure] = useState(false);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const exitStarted = useRef(false);
  const exitTimer = useRef<number | null>(null);

  const finish = useCallback(() => {
    if (exitStarted.current) return;
    exitStarted.current = true;
    setLeaving(true);
    exitTimer.current = window.setTimeout(onComplete, ALVORADA_EXIT_DURATION_MS);
  }, [onComplete]);
  const handleRenderFailure = useCallback(() => setRenderFailure(true), []);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => closeButton.current?.focus({ preventScroll: true }));

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
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    };
  }, [finish]);

  const fallback = (
    <AlvoradaFallback onSettled={finish} reducedMotion={reducedMotion} />
  );
  const canRenderWebGL = webglAvailable && !reducedMotion && !renderFailure;

  return createPortal(
    <section
      className={`alvorada-overlay${ready ? ' alvorada-overlay--ready' : ''}${leaving ? ' alvorada-overlay--leaving' : ''}`}
      data-testid="alvorada-experience"
      role="dialog"
      aria-modal="true"
      aria-label="O Nascer da Alvorada"
    >
      <div
        className="alvorada-overlay__canvas"
        aria-hidden={canRenderWebGL ? true : undefined}
        data-renderer={canRenderWebGL ? 'webgl' : 'fallback'}
      >
        {canRenderWebGL ? (
          <AlvoradaErrorBoundary fallback={fallback} onError={handleRenderFailure}>
            <AlvoradaCanvas
              onContextLost={handleRenderFailure}
              onReady={() => setReady(true)}
              onSequenceComplete={finish}
              quality={quality}
            />
          </AlvoradaErrorBoundary>
        ) : fallback}
      </div>

      {canRenderWebGL && !ready && (
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
