import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Maximize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OfficialCountdownDigits } from '@/components/countdown/OfficialCountdownDigits';
import { useFenasojaCountdown } from '@/hooks/useFenasojaCountdown';
import {
  FENASOJA_2028_OPENING_LABEL,
  FENASOJA_2028_TIME_ZONE_LABEL,
} from '@/lib/fenasoja-countdown';
import {
  FENASOJA_COUNTDOWN_ROUTE,
  rememberFenasojaCountdownLaunch,
  runFenasojaCountdownViewTransition,
} from '@/lib/fenasoja-countdown-navigation';

const PORTAL_COUNTDOWN_CONTROL_ID = 'fenasoja-countdown-expand-portal';

export const OfficialCountdownCompact = memo(function OfficialCountdownCompact() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLElement>(null);
  const [nearViewport, setNearViewport] = useState(true);
  const [isExpanding, setIsExpanding] = useState(false);
  const { snapshot, accessibleLabel, announcement } = useFenasojaCountdown(nearViewport);
  const isInvalid = snapshot.phase === 'invalid';

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry.isIntersecting),
      { rootMargin: '160px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const openExpandedCountdown = useCallback(() => {
    if (isExpanding) return;

    rememberFenasojaCountdownLaunch(PORTAL_COUNTDOWN_CONTROL_ID, '/portal');
    setIsExpanding(true);
    runFenasojaCountdownViewTransition(() => {
      navigate(FENASOJA_COUNTDOWN_ROUTE, {
        state: { fromPortal: true },
      });
    });
  }, [isExpanding, navigate]);

  return (
    <section
      ref={rootRef}
      className="portal-official-countdown"
      data-phase={snapshot.phase}
      aria-labelledby="portal-official-countdown-title"
    >
      <div className="portal-official-countdown__intro">
        <p id="portal-official-countdown-title">Abertura oficial em</p>
        <p className="portal-official-countdown__date">
          <CalendarDays aria-hidden="true" />
          <span className="portal-official-countdown__date-line">
            <strong>{FENASOJA_2028_OPENING_LABEL}</strong>
            <small title={FENASOJA_2028_TIME_ZONE_LABEL}>
              <span className="sr-only">, {FENASOJA_2028_TIME_ZONE_LABEL}</span>
              <span aria-hidden="true">· Brasília</span>
            </small>
          </span>
        </p>
      </div>

      {isInvalid ? (
        <p className="portal-official-countdown__error" role="status">
          Não foi possível calcular a contagem oficial. A data configurada precisa ser revisada.
        </p>
      ) : (
        <OfficialCountdownDigits
          snapshot={snapshot}
          accessibleLabel={accessibleLabel}
        />
      )}

      <button
        id={PORTAL_COUNTDOWN_CONTROL_ID}
        type="button"
        className="portal-official-countdown__expand"
        data-fenasoja-countdown-expand
        onClick={openExpandedCountdown}
        disabled={isExpanding}
        data-loading={isExpanding || undefined}
        aria-busy={isExpanding}
        aria-label="Abrir contagem oficial da Fenasoja 2028"
      >
        <Maximize2 aria-hidden="true" />
        <span>{isExpanding ? 'Abrindo contagem…' : 'Abrir contagem'}</span>
      </button>

      {!isInvalid && (
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>
      )}
    </section>
  );
});
