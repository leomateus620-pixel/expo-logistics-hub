import { useState } from 'react';
import { CalendarClock, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCronogramaMobilePresentation } from '@/hooks/useCronogramaMobilePresentation';
import { useCronogramaWeeklySummary } from '@/hooks/useCronogramaWeeklySummary';
import {
  buildCollapsedLabel,
  formatDurationLabel,
  type WeeklySummary,
  type WeeklySummaryEntry,
} from '@/lib/cronograma-weekly-summary';
import '@/styles/cronograma-weekly-summary.css';

function EntryRow({ entry, onSelect }: { entry: WeeklySummaryEntry; onSelect: () => void }) {
  return (
    <button type="button" className="cronograma-week-row focus-ring" onClick={onSelect}>
      <span className="cronograma-week-row__time">{entry.startTime ?? '--:--'}</span>
      <span className="min-w-0">
        <span className="cronograma-week-row__title block">{entry.title}</span>
        {entry.contextLabel && (
          <span className="cronograma-week-row__context block">{entry.contextLabel}</span>
        )}
      </span>
      <span className="cronograma-week-row__duration">
        {entry.durationMinutes === null ? 'duração não informada' : formatDurationLabel(entry.durationMinutes)}
      </span>
    </button>
  );
}

function WeeklySummaryPanel({
  summary,
  onSelectEvent,
  onSeeAll,
}: {
  summary: WeeklySummary;
  onSelectEvent: (entry: WeeklySummaryEntry) => void;
  onSeeAll: () => void;
}) {
  return (
    <div className="cronograma-week-panel">
      <div className="cronograma-week-panel__head">
        <p className="cronograma-week-panel__title">Sua semana</p>
        <div className="cronograma-week-panel__metrics">
          <p className="cronograma-week-panel__metric">
            {summary.eventCount}
            <span>{summary.eventCount === 1 ? 'evento' : 'eventos'}</span>
          </p>
          <p className="cronograma-week-panel__metric">
            {summary.totalMinutes > 0 ? formatDurationLabel(summary.totalMinutes) : '—'}
            <span>de agenda</span>
          </p>
          <p className="cronograma-week-panel__metric">
            {summary.daysWithEvents}
            <span>{summary.daysWithEvents === 1 ? 'dia com evento' : 'dias com eventos'}</span>
          </p>
        </div>
        {summary.eventsWithoutDuration > 0 && (
          <p className="cronograma-week-panel__note">
            {summary.eventsWithoutDuration === 1
              ? '1 evento sem duração informada'
              : `${summary.eventsWithoutDuration} eventos sem duração informada`}
          </p>
        )}
      </div>

      {summary.eventCount === 0 ? (
        <p className="cronograma-week-panel__note">Nenhum evento vinculado nesta semana.</p>
      ) : (
        <div className="cronograma-week-panel__days">
          {summary.days.map((day) => (
            <div key={day.dateKey}>
              <p className="cronograma-week-panel__day-label">{day.weekdayLabel}</p>
              {day.entries.map((entry) => (
                <EntryRow key={entry.identity} entry={entry} onSelect={() => onSelectEvent(entry)} />
              ))}
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" className="w-full rounded-xl" onClick={onSeeAll}>
        Ver todos os eventos
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function WeeklySummaryPill({ presentation = 'desktop' }: { presentation?: 'desktop' | 'mobile' }) {
  const { summary, isLoading, isError, refetch } = useCronogramaWeeklySummary();
  const viewportIsMobile = useCronogramaMobilePresentation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const useDrawer = presentation === 'mobile' || viewportIsMobile;
  const className = `cronograma-week-pill focus-ring${presentation === 'mobile' ? ' cronograma-week-pill--mobile' : ''}`;

  if (isLoading) {
    return (
      <span className={className} aria-live="polite">
        <span className="cronograma-week-pill__icon">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        </span>
        <span className="cronograma-week-pill__label">
          <span className="cronograma-week-pill__caption">Resumo da semana</span>
          <span className="cronograma-week-pill__value">Carregando…</span>
        </span>
      </span>
    );
  }

  if (isError) {
    return (
      <button type="button" className={className} onClick={() => void refetch()}>
        <span className="cronograma-week-pill__icon">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="cronograma-week-pill__label">
          <span className="cronograma-week-pill__caption">Resumo da semana</span>
          <span className="cronograma-week-pill__value">Não foi possível atualizar seu resumo.</span>
        </span>
      </button>
    );
  }

  const handleSelectEvent = (entry: WeeklySummaryEntry) => {
    setOpen(false);
    navigate(`/cronograma-eventos?event=${encodeURIComponent(entry.identity)}`);
  };

  const handleSeeAll = () => {
    setOpen(false);
    navigate('/cronograma-eventos?view=timeline&week=me');
  };

  const trigger = (
    <button
      type="button"
      className={className}
      data-highlight={summary.window.isLastBusinessDay ? 'true' : 'false'}
      aria-label={`Resumo da semana: ${buildCollapsedLabel(summary)}`}
    >
      <span className="cronograma-week-pill__icon">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="cronograma-week-pill__label">
        <span className="cronograma-week-pill__caption">Resumo da semana</span>
        <span className="cronograma-week-pill__value">{buildCollapsedLabel(summary)}</span>
      </span>
    </button>
  );

  if (useDrawer) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="z-50 max-h-[90dvh] px-4 pb-6">
          <DrawerTitle className="sr-only">Resumo da semana</DrawerTitle>
          <div className="mt-2">
            <WeeklySummaryPanel summary={summary} onSelectEvent={handleSelectEvent} onSeeAll={handleSeeAll} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="z-50 w-[22rem] p-3">
        <WeeklySummaryPanel summary={summary} onSelectEvent={handleSelectEvent} onSeeAll={handleSeeAll} />
      </PopoverContent>
    </Popover>
  );
}
