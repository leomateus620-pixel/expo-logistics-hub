import { memo, useMemo, type CSSProperties } from 'react';
import { CalendarClock, Check, Flag, Loader2, Radio, WifiOff } from 'lucide-react';
import { formatLongDateRange } from '@/components/cronograma-eventos/dateUtils';
import { FENASOJA_2028_OPENING_LABEL } from '@/lib/fenasoja-countdown';
import { statusLabels } from './cronogramaData';
import type { CronogramaEvent } from './types';

type TimelineAvailability = 'ready' | 'loading' | 'offline';

interface FenasojaPreparationTimelineProps {
  events: CronogramaEvent[];
  cycleProgress: number;
  nextAction: CronogramaEvent | null;
  nextCountdown: string | null;
  availability: TimelineAvailability;
  presentation: 'desktop' | 'mobile';
}

const completedStatuses = new Set(['completed']);

function compareDatedEvents(left: CronogramaEvent, right: CronogramaEvent) {
  return (left.date ?? '9999-12-31').localeCompare(right.date ?? '9999-12-31');
}

export const FenasojaPreparationTimeline = memo(function FenasojaPreparationTimeline({
  events,
  cycleProgress,
  nextAction,
  nextCountdown,
  availability,
  presentation,
}: FenasojaPreparationTimelineProps) {
  const supportingMilestones = useMemo(
    () => events
      .filter((event) => (
        event.date
        && event.id !== nextAction?.id
        && (event.isOfficial || event.kind === 'milestone')
        && !completedStatuses.has(event.status)
      ))
      .sort(compareDatedEvents)
      .slice(0, 2),
    [events, nextAction?.id],
  );

  const state = availability === 'loading'
    ? 'loading'
    : events.length === 0
      ? 'empty'
      : availability;

  return (
    <section
      className="fenasoja-preparation"
      data-presentation={presentation}
      data-state={state}
      aria-labelledby={`fenasoja-preparation-title-${presentation}`}
    >
      <div className="fenasoja-preparation-shell">
        <div className="fenasoja-preparation-summary">
          <span className="fenasoja-preparation-kicker">Ciclo institucional</span>
          <h2 id={`fenasoja-preparation-title-${presentation}`}>Preparação 2026—2028</h2>
          <div className="fenasoja-preparation-percentage">
            <strong>{cycleProgress}%</strong>
            <span>
              <small>Progresso atual</small>
              <b>{cycleProgress >= 100 ? 'Ciclo concluído' : 'Construção em andamento'}</b>
            </span>
          </div>
          <div
            className="fenasoja-preparation-meter"
            role="progressbar"
            aria-label="Progresso temporal da preparação para a Fenasoja 2028"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={cycleProgress}
          >
            <span style={{ '--preparation-progress': cycleProgress / 100 } as CSSProperties} />
          </div>
          <p>Planejamento conectado ao marco oficial da edição 2028.</p>
        </div>

        <div className="fenasoja-preparation-timeline-wrap">
          {state === 'loading' ? (
            <div className="fenasoja-preparation-state" role="status">
              <Loader2 aria-hidden="true" />
              <span><strong>Carregando marcos do ciclo</strong><small>Sincronizando o cronograma oficial…</small></span>
            </div>
          ) : state === 'empty' ? (
            <div className="fenasoja-preparation-state" role="status">
              <CalendarClock aria-hidden="true" />
              <span><strong>Marcos ainda indisponíveis</strong><small>A linha será preenchida assim que os dados do cronograma estiverem disponíveis.</small></span>
            </div>
          ) : (
            <>
              <div className="fenasoja-preparation-track" aria-hidden="true">
                <span style={{ '--preparation-progress': cycleProgress / 100 } as CSSProperties} />
              </div>
              <ol className="fenasoja-preparation-milestones" aria-label="Marcos da preparação">
                <li data-stage="completed">
                  <span className="fenasoja-preparation-node"><Check aria-hidden="true" /></span>
                  <small>Etapa concluída</small>
                  <strong>Início do ciclo</strong>
                  <em>2026</em>
                </li>
                <li data-stage="current" aria-current="step">
                  <span className="fenasoja-preparation-node"><Radio aria-hidden="true" /></span>
                  <small>Etapa atual</small>
                  <strong>{nextAction ? statusLabels[nextAction.status] : 'Planejamento ativo'}</strong>
                  <em>{cycleProgress}% do ciclo</em>
                </li>
                <li data-stage="upcoming">
                  <span className="fenasoja-preparation-node"><Flag aria-hidden="true" /></span>
                  <small>Próximo marco operacional</small>
                  <strong>{nextAction?.title ?? 'Nenhuma ação futura no recorte atual'}</strong>
                  <em>
                    {nextAction
                      ? `${formatLongDateRange(nextAction.date, nextAction.endDate)}${nextCountdown ? ` · ${nextCountdown}` : ''}`
                      : 'Sem data disponível'}
                  </em>
                </li>
                {supportingMilestones.map((event) => (
                  <li key={event.id} data-stage="future">
                    <span className="fenasoja-preparation-node" />
                    <small>Marco futuro</small>
                    <strong>{event.title}</strong>
                    <em>{formatLongDateRange(event.date, event.endDate)}</em>
                  </li>
                ))}
                <li data-stage="official">
                  <span className="fenasoja-preparation-node"><Flag aria-hidden="true" /></span>
                  <small>Marco oficial</small>
                  <strong>Abertura FENASOJA 2028</strong>
                  <em>{FENASOJA_2028_OPENING_LABEL}</em>
                </li>
              </ol>
              {availability === 'offline' && (
                <p className="fenasoja-preparation-offline" role="status">
                  <WifiOff aria-hidden="true" /> Base oficial consolidada; sincronização online indisponível.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
});
