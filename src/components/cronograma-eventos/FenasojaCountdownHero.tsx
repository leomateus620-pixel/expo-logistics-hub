import { memo, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, Flag, Plus, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatLongDateRange } from '@/components/cronograma-eventos/dateUtils';
import {
  FENASOJA_2028_OPENING_LABEL,
  formatFenasojaCountdownLabel,
  getFenasojaCountdown,
} from '@/lib/fenasoja-countdown';
import { getCountdownLabel, getTimelineSnapshot, getTodayKey } from '@/lib/cronograma-timeline';
import '@/styles/fenasoja-countdown.css';
import { SoybeanParticleCanvas } from './SoybeanParticleCanvas';
import type { CronogramaEvent } from './types';

export interface FenasojaCountdownHeroProps {
  events: CronogramaEvent[];
  onNewEvent: () => void;
  onOpenUndated: () => void;
  canManage: boolean;
  presentation: 'desktop' | 'mobile';
}

function useLiveFenasojaCountdown() {
  const [referenceTime, setReferenceTime] = useState(() => Date.now());

  useEffect(() => {
    let intervalId: number | undefined;
    const delayToNextSecond = 1_000 - (Date.now() % 1_000);
    const timeoutId = window.setTimeout(() => {
      setReferenceTime(Date.now());
      intervalId = window.setInterval(() => setReferenceTime(Date.now()), 1_000);
    }, delayToNextSecond);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, []);

  return useMemo(() => getFenasojaCountdown(referenceTime), [referenceTime]);
}

const CountdownUnit = memo(function CountdownUnit({
  value,
  label,
  unit,
}: {
  value: number;
  label: string;
  unit: 'days' | 'hours' | 'minutes' | 'seconds';
}) {
  const formatted = String(value).padStart(unit === 'days' ? 3 : 2, '0');

  return (
    <span className="fenasoja-countdown-unit" data-unit={unit}>
      <span className="fenasoja-countdown-value" aria-hidden="true">
        <span key={formatted}>{formatted}</span>
      </span>
      <span className="fenasoja-countdown-unit-label">{label}</span>
    </span>
  );
});

export function FenasojaCountdownHero({
  events,
  onNewEvent,
  onOpenUndated,
  canManage,
  presentation,
}: FenasojaCountdownHeroProps) {
  const countdown = useLiveFenasojaCountdown();
  const todayKey = getTodayKey();
  const timelineSnapshot = useMemo(
    () => getTimelineSnapshot(events, todayKey),
    [events, todayKey],
  );
  const nextAction = timelineSnapshot.nextOfficialAction;
  const accessibleCountdown = formatFenasojaCountdownLabel(countdown);
  const isOpen = countdown.phase === 'open';

  return (
    <header
      className="fenasoja-countdown-hero"
      data-presentation={presentation}
      data-phase={countdown.phase}
      aria-labelledby={`fenasoja-countdown-title-${presentation}`}
    >
      <SoybeanParticleCanvas />
      <span className="fenasoja-countdown-ambient" aria-hidden="true" />

      <div className="fenasoja-countdown-content">
        <div className="fenasoja-countdown-topline">
          <div className="fenasoja-countdown-mark">
            <Sprout aria-hidden="true" />
            <span>Contagem oficial</span>
            <span className="fenasoja-countdown-mark-divider" aria-hidden="true" />
            <span>Cronograma e Eventos</span>
          </div>

          {canManage && (
            <Button
              type="button"
              size="sm"
              onClick={onNewEvent}
              className="fenasoja-countdown-new-event"
            >
              <Plus aria-hidden="true" />
              Novo evento
            </Button>
          )}
        </div>

        <div className="fenasoja-countdown-main">
          <div className="fenasoja-countdown-story">
            <p className="fenasoja-countdown-overline">Nossa próxima grande história começa em</p>
            <h1 id={`fenasoja-countdown-title-${presentation}`}>
              FENASOJA <span>2028</span>
            </h1>
            <p className="fenasoja-countdown-lead">
              {isOpen ? (
                'A feira está oficialmente aberta.'
              ) : (
                <>Faltam <strong>{countdown.days} dias</strong> para a abertura oficial.</>
              )}
            </p>
            <p className="fenasoja-countdown-description">
              Cada decisão do cronograma converge para este marco institucional.
              Acompanhe a preparação em tempo real.
            </p>
          </div>

          <section className="fenasoja-countdown-clock" aria-label="Contagem regressiva para a Fenasoja 2028">
            <div className="fenasoja-countdown-clock-heading">
              <span><Clock3 aria-hidden="true" /> Tempo até a abertura</span>
              <span className="fenasoja-countdown-live"><i aria-hidden="true" /> Em tempo real</span>
            </div>

            <div
              className="fenasoja-countdown-grid"
              role="timer"
              aria-live="off"
              aria-label={accessibleCountdown}
            >
              <CountdownUnit value={countdown.days} label="dias" unit="days" />
              <CountdownUnit value={countdown.hours} label="horas" unit="hours" />
              <CountdownUnit value={countdown.minutes} label="min" unit="minutes" />
              <CountdownUnit value={countdown.seconds} label="seg" unit="seconds" />
            </div>
          </section>
        </div>

        <div className="fenasoja-countdown-footer">
          <div className="fenasoja-countdown-progress">
            <div className="fenasoja-countdown-progress-heading">
              <span>Preparação 2026—2028</span>
              <strong>{countdown.cycleProgress}% do ciclo temporal</strong>
            </div>
            <span className="fenasoja-countdown-progress-track" aria-hidden="true">
              <span style={{ width: `${countdown.cycleProgress}%` }} />
            </span>
            <p>Marco oficial · {FENASOJA_2028_OPENING_LABEL} · horário de Brasília</p>
          </div>

          <div className="fenasoja-countdown-operations" aria-label="Resumo operacional do cronograma">
            <div className="fenasoja-countdown-next-action">
              <Flag aria-hidden="true" />
              <span>
                <small>Próximo marco operacional</small>
                <strong>{nextAction?.title ?? 'Nenhuma ação futura no recorte atual'}</strong>
                {nextAction && (
                  <em>
                    {formatLongDateRange(nextAction.date, nextAction.endDate)} · {getCountdownLabel(nextAction.date, todayKey)}
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
      </div>
    </header>
  );
}
