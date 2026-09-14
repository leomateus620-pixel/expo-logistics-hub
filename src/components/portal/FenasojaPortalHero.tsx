import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AlvoradaErrorBoundary } from '@/features/alvorada/AlvoradaErrorBoundary';
import { createAlvoradaIntroTelemetry } from '@/features/alvorada/introTelemetry';
import { AlvoradaDiagnostics } from '@/features/alvorada/AlvoradaDiagnostics';
import { SkipForward } from 'lucide-react';
import { OfficialCountdownCompact } from '@/components/countdown/OfficialCountdownCompact';
import { ALVORADA_MOTION_MODE } from '@/features/alvorada/motionPolicy';
import { AlvoradaPreparingSurface } from '@/features/alvorada/AlvoradaPreparingSurface';
import { warmAlvoradaAssets } from '@/features/alvorada/capabilities';
import {
  markAlvoradaIntroStarted,
  shouldAutoplayAlvoradaIntro,
  subscribeAlvoradaIntroDismiss,
} from '@/features/alvorada/introSession';
import {
  ALVORADA_INTRO_EXIT_DURATION_MS,
  type AlvoradaIntroStage,
} from '@/features/alvorada/timeline';

const loadAlvoradaIntro = () => import('@/features/alvorada/AlvoradaIntro');
const AlvoradaIntro = lazy(loadAlvoradaIntro);

/**
 * `waiting`: the card is reserved and dark until it is on screen and the page is
 * visible. `playing`: the embedded intro runs. `leaving`: cross-fade back to the
 * countdown. `done`: the intro layer is unmounted and nothing renders anymore.
 */
type IntroPresentation = 'waiting' | 'playing' | 'leaving' | 'done';

const INTRO_VISIBILITY_THRESHOLD = 0.35;

export const FenasojaPortalHero = memo(function FenasojaPortalHero() {
  const heroRef = useRef<HTMLElement>(null);
  const [presentation, setPresentation] = useState<IntroPresentation>(() => (
    shouldAutoplayAlvoradaIntro() ? 'waiting' : 'done'
  ));
  const [introStage, setIntroStage] = useState<AlvoradaIntroStage>('preparing');
  const presentationRef = useRef<IntroPresentation>(presentation);
  const leaveTimer = useRef<number | null>(null);
  const introActive = presentation === 'waiting' || presentation === 'playing';

  const finishIntro = useCallback(() => {
    if (presentationRef.current === 'leaving' || presentationRef.current === 'done') return;
    presentationRef.current = 'leaving';
    setPresentation('leaving');
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null;
      presentationRef.current = 'done';
      setPresentation('done');
    }, ALVORADA_INTRO_EXIT_DURATION_MS);
  }, []);

  const handleChunkError = useCallback(() => {
    const telemetry = createAlvoradaIntroTelemetry();
    window.__alvoradaIntroTelemetry = telemetry.record;
    telemetry.setEnvironment({ staticReason: 'chunk-failed' });
    telemetry.mark('chunk-failed', { stage: 'preparing' });
    telemetry.mark('engine-selected', { engine: 'unavailable', reason: 'chunk-failed' });
    finishIntro();
  }, [finishIntro]);

  useEffect(() => () => {
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
  }, []);

  useEffect(() => {
    if (presentation !== 'waiting') return undefined;

    // Download the WebGL chunk and start the shared asset pipeline while the
    // card waits for visibility; the scene consumes these same downloads, so
    // nothing is fetched twice and nothing here blocks the portal.
    void loadAlvoradaIntro().catch(() => {
      // The lazy boundary owns the error UI. Do not emit an unhandled rejection
      // that the application's global cache recovery interprets as a reload.
    });
    warmAlvoradaAssets();

    const node = heroRef.current;
    let onScreen = !node || typeof IntersectionObserver === 'undefined';
    let observer: IntersectionObserver | null = null;

    const tryStart = () => {
      if (!onScreen || document.visibilityState === 'hidden') return;
      if (presentationRef.current !== 'waiting') return;
      markAlvoradaIntroStarted();
      presentationRef.current = 'playing';
      setPresentation('playing');
    };

    if (node && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting && entry.intersectionRatio >= INTRO_VISIBILITY_THRESHOLD;
        tryStart();
      }, { threshold: [0, INTRO_VISIBILITY_THRESHOLD] });
      observer.observe(node);
    }

    document.addEventListener('visibilitychange', tryStart);
    tryStart();

    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', tryStart);
    };
  }, [presentation]);

  useEffect(() => {
    if (!introActive) return undefined;
    return subscribeAlvoradaIntroDismiss(finishIntro);
  }, [finishIntro, introActive]);

  return (
    <>
    <section
      ref={heroRef}
      className="fenasoja-portal__hero portal-reveal"
      aria-labelledby="portal-official-countdown-title"
      data-intro={presentation}
      data-intro-stage={presentation === 'done' ? undefined : introStage}
    >
      <div className="fenasoja-portal__hero-frame">
        <OfficialCountdownCompact concealed={introActive} />
      </div>

      {presentation !== 'done' && (
        <div
          className="fenasoja-portal__intro"
          data-testid="portal-alvorada-intro"
          data-alvorada-motion={ALVORADA_MOTION_MODE}
          data-presentation={presentation}
          role="group"
          aria-label="Introdução: a Alvorada de Santa Rosa e a marca FENASOJA 2028"
        >
          <div className="fenasoja-portal__intro-stage" aria-hidden="true">
            {presentation === 'waiting' ? (
              <AlvoradaPreparingSurface />
            ) : (
              <AlvoradaErrorBoundary fallback={<AlvoradaPreparingSurface />} onError={handleChunkError}>
              <Suspense fallback={<AlvoradaPreparingSurface />}>
                <AlvoradaIntro
                  onFinished={finishIntro}
                  onStageChange={setIntroStage}
                />
              </Suspense>
              </AlvoradaErrorBoundary>
            )}
          </div>

          {introActive && (
            <button
              type="button"
              className="fenasoja-portal__intro-skip"
              onClick={finishIntro}
              aria-label="Pular animação e mostrar a contagem oficial"
            >
              <SkipForward aria-hidden="true" />
              <span>Pular animação</span>
            </button>
          )}
        </div>
      )}
    </section>
    <AlvoradaDiagnostics />
    </>
  );
});
