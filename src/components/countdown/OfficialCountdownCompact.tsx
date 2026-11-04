import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CalendarDays, ArrowLeftRight } from 'lucide-react';
import { SoySummitCountdown } from './SoySummitCountdown';
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

interface OfficialCountdownCompactProps {
  /**
   * While the embedded intro plays above the card, the countdown keeps its
   * layout and its live clock but is hidden from sight and from assistive
   * technology, so the card never shifts and the digits are current on reveal.
   */
  concealed?: boolean;
}

const FenasojaCountdownCompact = memo(function FenasojaCountdownCompact({
  concealed = false,
}: OfficialCountdownCompactProps) {
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
      data-concealed={concealed || undefined}
      aria-labelledby="portal-official-countdown-title"
      aria-hidden={concealed || undefined}
      {...(concealed ? ({ inert: '' } as Record<string, string>) : {})}
    >
      <div className="portal-official-countdown__intro">
        <span className="portal-official-countdown__spark" aria-hidden="true">
          <span />
        </span>
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
        <ArrowUpRight aria-hidden="true" />
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

/** The Fenasoja layout reserves identical space for both events; selection is view-local. */
export const OfficialCountdownCompact = memo(function OfficialCountdownCompact(props: OfficialCountdownCompactProps) {
  const [soy, setSoy] = useState(false);
  return <div className="portal-event-switcher" data-event={soy ? 'soy' : 'fenasoja'}
    {...(props.concealed ? { 'aria-hidden': true, inert: '' } as Record<string, unknown> : {})}>
    <div style={{ display: 'contents' }} {...(soy ? { 'aria-hidden': true, inert: '' } as Record<string, unknown> : {})}>
      <FenasojaCountdownCompact {...props} />
    </div>
    {soy && <div className="portal-event-switcher__soy"><SoySummitCountdown compact /></div>}
    {!props.concealed && <button type="button" className="portal-event-switcher__toggle"
      aria-label={soy ? 'Ver contagem da Fenasoja' : 'Ver contagem do Soy Summit'}
      title={soy ? 'Ver contagem da Fenasoja' : 'Ver contagem do Soy Summit'} onClick={() => setSoy(current => !current)}>
      <ArrowLeftRight aria-hidden="true" />
    </button>}
  </div>;
});
