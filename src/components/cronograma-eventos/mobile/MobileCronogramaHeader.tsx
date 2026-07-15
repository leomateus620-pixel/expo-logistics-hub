import { AlertTriangle, CalendarDays, Clock3, Flag, Plus } from 'lucide-react';
import { formatShortDateRange } from '@/components/cronograma-eventos/dateUtils';
import { getCountdownLabel, getTimelineSnapshot, getTodayKey } from '@/lib/cronograma-timeline';
import type { CronogramaEvent } from '../types';
import '@/styles/cronograma-mobile.css';

const mobileDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Sao_Paulo',
});

interface MobileCronogramaHeaderProps {
  events: CronogramaEvent[];
  onNewEvent: () => void;
  onOpenUndated: () => void;
  canManage: boolean;
}

export function MobileCronogramaHeader({
  events,
  onNewEvent,
  onOpenUndated,
  canManage,
}: MobileCronogramaHeaderProps) {
  const todayKey = getTodayKey();
  const snapshot = getTimelineSnapshot(events, todayKey);
  const nextAction = snapshot.nextOfficialAction;

  return (
    <header className="cronograma-mobile-header">
      <div className="cronograma-mobile-header-topline">
        <div className="cronograma-mobile-header-heading">
          <span className="cronograma-mobile-live-dot" aria-hidden="true" />
          <div>
            <p className="cronograma-mobile-eyebrow">
              Linha do tempo · {mobileDateFormatter.format(new Date())}
            </p>
            <h1 className="cronograma-mobile-title">Cronograma e Eventos</h1>
          </div>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={onNewEvent}
            className="cronograma-mobile-new-event"
          >
            <Plus aria-hidden="true" />
            <span>Novo evento</span>
          </button>
        )}
      </div>

      <section className="cronograma-mobile-next-action" aria-labelledby="cronograma-mobile-next-title">
        <div className="cronograma-mobile-next-label">
          <Flag aria-hidden="true" />
          <span id="cronograma-mobile-next-title">Próxima ação oficial</span>
        </div>

        {nextAction ? (
          <>
            <p className="cronograma-mobile-next-title">{nextAction.title}</p>
            <div className="cronograma-mobile-next-meta">
              <span>{formatShortDateRange(nextAction.date, nextAction.endDate)}</span>
              {nextAction.startTime && <span>{nextAction.startTime}</span>}
              <strong>{getCountdownLabel(nextAction.date, todayKey)}</strong>
            </div>
          </>
        ) : (
          <p className="cronograma-mobile-next-empty">Nenhuma ação futura no recorte atual.</p>
        )}
      </section>

      <div className="cronograma-mobile-signals" aria-label="Resumo operacional">
        <div className="cronograma-mobile-signal">
          <CalendarDays aria-hidden="true" />
          <span>Progresso</span>
          <strong>{snapshot.progress}%</strong>
        </div>
        <div className="cronograma-mobile-signal" data-alert={snapshot.overdue > 0 || undefined}>
          <AlertTriangle aria-hidden="true" />
          <span>Atrasados</span>
          <strong>{snapshot.overdue}</strong>
        </div>
        <button
          type="button"
          onClick={onOpenUndated}
          className="cronograma-mobile-signal cronograma-mobile-signal-action"
          aria-label={`Abrir ${snapshot.undated} ${snapshot.undated === 1 ? 'evento sem data' : 'eventos sem data'}`}
        >
          <Clock3 aria-hidden="true" />
          <span>Sem data</span>
          <strong>{snapshot.undated}</strong>
        </button>
      </div>
    </header>
  );
}
