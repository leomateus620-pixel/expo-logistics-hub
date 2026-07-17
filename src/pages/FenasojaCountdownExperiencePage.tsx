import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { ArrowLeft, CalendarClock, Clock3, Radio, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import { FenasojaCountdownDigits } from '@/components/cronograma-eventos/FenasojaCountdownDigits';
import { useFenasojaCountdown } from '@/hooks/useFenasojaCountdown';
import {
  FENASOJA_2028_OPENING_LABEL,
  FENASOJA_2028_TIME_ZONE_LABEL,
} from '@/lib/fenasoja-countdown';
import {
  runFenasojaCountdownViewTransition,
} from '@/lib/fenasoja-countdown-navigation';
import '@/styles/fenasoja-countdown-experience.css';

const SoybeanAtmosphere = lazy(
  () => import('@/components/cronograma-eventos/countdown/SoybeanAtmosphere'),
);

interface ExperienceCapabilities {
  compact: boolean;
  documentVisible: boolean;
  reducedMotion: boolean;
  supportsEnhancedAtmosphere: boolean;
}

function supportsWebGL() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', {
    failIfMajorPerformanceCaveat: true,
    powerPreference: 'high-performance',
  }) || canvas.getContext('webgl', {
    failIfMajorPerformanceCaveat: true,
    powerPreference: 'high-performance',
  });

  if (!context) return false;
  context.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
}

function readExperienceCapabilities(): ExperienceCapabilities {
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  const constrainedDevice =
    (navigatorWithMemory.deviceMemory !== undefined && navigatorWithMemory.deviceMemory <= 2)
    || (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 2);

  return {
    compact: window.matchMedia('(max-width: 760px), (max-height: 620px)').matches,
    documentVisible: document.visibilityState !== 'hidden',
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    supportsEnhancedAtmosphere: !constrainedDevice && supportsWebGL(),
  };
}

function useExperienceCapabilities() {
  const [capabilities, setCapabilities] = useState<ExperienceCapabilities>(
    readExperienceCapabilities,
  );

  useEffect(() => {
    const compactQuery = window.matchMedia('(max-width: 760px), (max-height: 620px)');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setCapabilities((current) => ({
        ...current,
        compact: compactQuery.matches,
        documentVisible: document.visibilityState !== 'hidden',
        reducedMotion: motionQuery.matches,
      }));
    };

    compactQuery.addEventListener('change', update);
    motionQuery.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      compactQuery.removeEventListener('change', update);
      motionQuery.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return capabilities;
}

class AtmosphereBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[countdown-atmosphere] enhanced_renderer_unavailable', {
      errorName: error.name || 'Error',
      component: info.componentStack?.split('\n').find(Boolean)?.trim() || 'unknown',
    });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function FenasojaCountdownExperiencePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnButtonRef = useRef<HTMLButtonElement>(null);
  const { snapshot, accessibleLabel, announcement } = useFenasojaCountdown();
  const capabilities = useExperienceCapabilities();
  const [enhancedReady, setEnhancedReady] = useState(false);
  const openedFromCronograma = Boolean(
    (location.state as { fromCronograma?: boolean } | null)?.fromCronograma,
  );

  const returnToCronograma = useCallback(() => {
    runFenasojaCountdownViewTransition(() => {
      if (openedFromCronograma) {
        navigate(-1);
        return;
      }
      navigate('/cronograma-eventos', { replace: true });
    });
  }, [navigate, openedFromCronograma]);

  useEffect(() => {
    const previousTitle = document.title;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    document.title = 'Contagem Oficial | Fenasoja 2028';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.dataset.countdownExperience = 'open';

    const focusFrame = window.requestAnimationFrame(() => {
      returnButtonRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.title = previousTitle;
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
      delete document.body.dataset.countdownExperience;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      returnToCronograma();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [returnToCronograma]);

  useEffect(() => {
    if (
      !capabilities.supportsEnhancedAtmosphere
      || capabilities.reducedMotion
      || !capabilities.documentVisible
    ) {
      setEnhancedReady(false);
      return;
    }

    let timeoutId: number | undefined;
    const idleId = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(() => setEnhancedReady(true), { timeout: 360 })
      : undefined;
    if (idleId === undefined) {
      timeoutId = window.setTimeout(() => setEnhancedReady(true), 120);
    }

    return () => {
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [
    capabilities.documentVisible,
    capabilities.reducedMotion,
    capabilities.supportsEnhancedAtmosphere,
  ]);

  const motionEnabled =
    enhancedReady
    && capabilities.documentVisible
    && !capabilities.reducedMotion;

  return (
    <main
      id="fenasoja-countdown-experience"
      className="fenasoja-countdown-experience"
      data-motion={motionEnabled ? 'active' : 'still'}
      data-phase={snapshot.phase}
      data-renderer={enhancedReady ? 'enhanced' : 'photographic'}
    >
      <div className="fenasoja-countdown-experience__photographic" aria-hidden="true">
        <picture>
          <source
            media="(max-width: 760px), (orientation: portrait)"
            srcSet="/portal/soybean-atmosphere-portrait.jpg"
          />
          <img
            src="/portal/soybean-atmosphere-landscape.jpg"
            alt=""
            decoding="async"
            loading="eager"
          />
        </picture>
      </div>

      {enhancedReady && (
        <AtmosphereBoundary>
          <Suspense fallback={null}>
            <SoybeanAtmosphere
              compact={capabilities.compact}
              motionEnabled={motionEnabled}
            />
          </Suspense>
        </AtmosphereBoundary>
      )}

      <span className="fenasoja-countdown-experience__vignette" aria-hidden="true" />
      <span className="fenasoja-countdown-experience__grain" aria-hidden="true" />

      <header className="fenasoja-countdown-experience__header">
        <FenasojaBrand
          compact
          subtitle="Contagem oficial"
          tone="dark"
          className="fenasoja-countdown-experience__brand"
        />

        <div className="fenasoja-countdown-experience__status" aria-label="Contagem sincronizada em tempo real">
          <Radio aria-hidden="true" />
          <span>Tempo real</span>
        </div>

        <button
          ref={returnButtonRef}
          type="button"
          className="fenasoja-countdown-experience__return"
          onClick={returnToCronograma}
        >
          <ArrowLeft aria-hidden="true" />
          <span>Voltar ao cronograma</span>
          <kbd>Esc</kbd>
        </button>
      </header>

      <section
        className="fenasoja-countdown-experience__content"
        aria-labelledby="fenasoja-countdown-experience-title"
      >
        <div className="fenasoja-countdown-experience__identity">
          <p className="fenasoja-countdown-experience__eyebrow">
            <ShieldCheck aria-hidden="true" />
            Fenasoja 2028 · marco oficial
          </p>
          <h1 id="fenasoja-countdown-experience-title">
            Contagem <span>Oficial</span>
          </h1>
          <p className="fenasoja-countdown-experience__opening">
            <CalendarClock aria-hidden="true" />
            Abertura em {FENASOJA_2028_OPENING_LABEL}
          </p>
        </div>

        <div className="fenasoja-countdown-experience__clock" data-phase={snapshot.phase}>
          <div className="fenasoja-countdown-experience__clock-topline">
            <span><Clock3 aria-hidden="true" /> Tempo até a abertura</span>
            <span>{snapshot.phase === 'open' ? 'Fenasoja aberta' : 'Atualização contínua'}</span>
          </div>

          <FenasojaCountdownDigits
            snapshot={snapshot}
            accessibleLabel={accessibleLabel}
            variant="immersive"
          />

          <div className="fenasoja-countdown-experience__clock-footer">
            <span aria-hidden="true" />
            <p>
              {snapshot.phase === 'open'
                ? 'A Fenasoja 2028 está oficialmente aberta.'
                : `Horário oficial · ${FENASOJA_2028_TIME_ZONE_LABEL}`}
            </p>
            <span aria-hidden="true" />
          </div>
        </div>

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>
      </section>

      <footer className="fenasoja-countdown-experience__footer">
        <span className="fenasoja-countdown-experience__live-dot" aria-hidden="true" />
        <span>Contagem sincronizada com o marco absoluto da abertura</span>
      </footer>
    </main>
  );
}
