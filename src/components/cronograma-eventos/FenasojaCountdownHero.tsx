import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  Flag,
  Maximize2,
  Plus,
  Sprout,
} from 'lucide-react';
import { FenasojaCountdownDigits } from '@/components/cronograma-eventos/FenasojaCountdownDigits';
import { formatLongDateRange } from '@/components/cronograma-eventos/dateUtils';
import { useFenasojaCountdown } from '@/hooks/useFenasojaCountdown';
import {
  FENASOJA_2028_OPENING_LABEL,
  getFenasojaCountdown,
} from '@/lib/fenasoja-countdown';
import {
  FENASOJA_COUNTDOWN_ROUTE,
  rememberFenasojaCountdownLaunch,
  runFenasojaCountdownViewTransition,
} from '@/lib/fenasoja-countdown-navigation';
import {
  buildCronogramaCommandSummary,
  getCronogramaCommandReference,
} from '@/lib/cronograma-command-summary';
import '@/styles/fenasoja-countdown.css';
import type { CronogramaEvent } from './types';

export interface FenasojaCountdownHeroProps {
  events: CronogramaEvent[];
  onNewEvent: () => void;
  onOpenUndated: () => void;
  onExpandCountdown?: () => void;
  canManage: boolean;
  presentation: 'desktop' | 'mobile';
}

const LiveCountdownCore = memo(function LiveCountdownCore({
  presentation,
}: {
  presentation: 'desktop' | 'mobile';
}) {
  const coreRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(true);
  const { snapshot, accessibleLabel, announcement } = useFenasojaCountdown(nearViewport);
  const isOpen = snapshot.phase === 'open';

  useEffect(() => {
    const node = coreRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry.isIntersecting),
      { rootMargin: '160px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={coreRef} className="fenasoja-countdown-main">
      <div className="fenasoja-countdown-story">
        <p className="fenasoja-countdown-overline">
          <span aria-hidden="true" />
          A próxima grande história começa em
        </p>
        <h1 id={`fenasoja-countdown-title-${presentation}`}>
          <span className="fenasoja-countdown-wordmark">FENASOJA</span>
          <span className="fenasoja-countdown-edition">2028</span>
        </h1>
        <p className="fenasoja-countdown-lead">
          {isOpen ? (
            'A feira está oficialmente aberta.'
          ) : (
            <>
              Faltam <strong>{snapshot.days} dias</strong> para a abertura oficial.
            </>
          )}
        </p>
      </div>

      <section className="fenasoja-countdown-clock" aria-label="Contagem regressiva para a Fenasoja 2028">
        <div className="fenasoja-countdown-clock-heading">
          <span><Clock3 aria-hidden="true" /> Tempo até a abertura</span>
          <span className="fenasoja-countdown-live"><i aria-hidden="true" /> Atualização em tempo real</span>
        </div>

        <FenasojaCountdownDigits
          snapshot={snapshot}
          accessibleLabel={accessibleLabel}
        />
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>
      </section>
    </div>
  );
});

export function FenasojaCountdownHero({
  events,
  onNewEvent,
  onOpenUndated,
  onExpandCountdown,
  canManage,
  presentation,
}: FenasojaCountdownHeroProps) {
  const [isExpanding, setIsExpanding] = useState(false);
  const referenceKey = getCronogramaCommandReference();
  const { snapshot: timelineSnapshot, nextCountdown } = useMemo(
    () => buildCronogramaCommandSummary(events, referenceKey),
    [events, referenceKey],
  );
  const cycleProgress = getFenasojaCountdown().cycleProgress;
  const nextAction = timelineSnapshot.nextOfficialAction;
  const expandControlId = `fenasoja-countdown-expand-${presentation}`;

  const openExpandedCountdown = useCallback(() => {
    if (isExpanding) return;

    rememberFenasojaCountdownLaunch(expandControlId);
    setIsExpanding(true);
    runFenasojaCountdownViewTransition(() => {
      if (onExpandCountdown) {
        onExpandCountdown();
        return;
      }

      window.location.assign(FENASOJA_COUNTDOWN_ROUTE);
    });
  }, [expandControlId, isExpanding, onExpandCountdown]);

  return (
    <div className="fenasoja-countdown-wrapper" data-presentation={presentation}>
      <header
        className="fenasoja-countdown-hero"
        data-presentation={presentation}
        aria-labelledby={`fenasoja-countdown-title-${presentation}`}
      >
        <span className="fenasoja-countdown-ambient" aria-hidden="true" />
        <span className="fenasoja-countdown-soy-cluster" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>

        <div className="fenasoja-countdown-content">
          <div className="fenasoja-countdown-topline">
            <div className="fenasoja-countdown-mark">
              <span className="fenasoja-countdown-mark-icon" aria-hidden="true">
                <Sprout />
              </span>
              <span>
                <strong>Contagem oficial</strong>
                <small>Cronograma e Eventos</small>
              </span>
            </div>

            <div className="fenasoja-countdown-actions">
              <button
                id={expandControlId}
                type="button"
                className="fenasoja-countdown-expand"
                data-fenasoja-countdown-expand
                onClick={openExpandedCountdown}
                disabled={isExpanding}
                data-loading={isExpanding || undefined}
                aria-busy={isExpanding}
                aria-label="Ver contagem completa da Fenasoja 2028"
              >
                <span className="fenasoja-countdown-expand-icon" aria-hidden="true">
                  <Maximize2 />
                </span>
                <span>
                  <strong>{isExpanding ? 'Abrindo experiência…' : 'Abrir contagem'}</strong>
                  <small>Experiência imersiva</small>
                </span>
                <ArrowUpRight className="fenasoja-countdown-expand-arrow" aria-hidden="true" />
              </button>

              {canManage && (
                <button
                  type="button"
                  onClick={onNewEvent}
                  className="fenasoja-countdown-new-event"
                >
                  <Plus aria-hidden="true" />
                  <span>Novo evento</span>
                </button>
              )}
            </div>
          </div>

          <LiveCountdownCore presentation={presentation} />

          <div className="fenasoja-countdown-card-meta">
            <span>Marco oficial</span>
            <i aria-hidden="true" />
            <span>{FENASOJA_2028_OPENING_LABEL}</span>
            <i aria-hidden="true" />
            <span>Horário de Brasília</span>
          </div>
        </div>
      </header>

      <section
        className="fenasoja-countdown-ops-card"
        data-presentation={presentation}
        aria-label="Painel operacional do cronograma"
      >
        <div className="fenasoja-countdown-footer">
          <div className="fenasoja-countdown-progress">
            <div className="fenasoja-countdown-progress-heading">
              <span>Preparação 2026—2028</span>
              <strong>{cycleProgress}% do ciclo temporal</strong>
            </div>
            <span className="fenasoja-countdown-progress-track" aria-hidden="true">
              <span style={{ width: `${cycleProgress}%` }} />
            </span>
            <p>Planejamento conectado ao marco oficial da edição 2028.</p>
          </div>

          <div className="fenasoja-countdown-operations" aria-label="Resumo operacional do cronograma">
            <div className="fenasoja-countdown-next-action">
              <Flag aria-hidden="true" />
              <span>
                <small>Próximo marco operacional</small>
                <strong>{nextAction?.title ?? 'Nenhuma ação futura no recorte atual'}</strong>
                {nextAction && (
                  <em>
                    {formatLongDateRange(nextAction.date, nextAction.endDate)} · {nextCountdown}
                  </em>
                )}
              </span>
            </div>

            <div
              className="fenasoja-countdown-operation-metric"
              data-alert={timelineSnapshot.overdue > 0 || undefined}
            >
              <AlertTriangle aria-hidden="true" />
              <span><small>Atrasadas</small><strong>{timelineSnapshot.overdue}</strong></span>
            </div>

            <button
              type="button"
              onClick={onOpenUndated}
              className="fenasoja-countdown-operation-metric fenasoja-countdown-undated"
              aria-label={`Abrir ${timelineSnapshot.undated} ${timelineSnapshot.undated === 1 ? 'evento sem data' : 'eventos sem data'}`}
            >
              <Clock3 aria-hidden="true" />
              <span><small>Sem data</small><strong>{timelineSnapshot.undated}</strong></span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
