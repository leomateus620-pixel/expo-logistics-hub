import { CalendarRange } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCronogramaAgendaMode } from './CronogramaAgendaModeContext';

function VolunteerCalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 6h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-5M15 3v5m4-5v5m-8 3h10" />
      <circle cx="6" cy="6" r="3" />
      <path d="M1 16v-2a5 5 0 0 1 8-4m5 6h3m-1.5-1.5v3" />
    </svg>
  );
}

export function CronogramaAgendaModeControls() {
  const agenda = useCronogramaAgendaMode();
  if (!agenda) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="cronograma-agenda-modes" role="group" aria-label="Modo da agenda">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="cronograma-agenda-mode cronograma-agenda-mode--general focus-ring" aria-label="Agenda geral" aria-pressed={agenda.mode === 'general'} onClick={() => agenda.setMode('general')}>
              <CalendarRange aria-hidden="true" />
              <span className="sr-only">Agenda geral</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Agenda geral</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="cronograma-agenda-mode cronograma-agenda-mode--volunteers focus-ring" aria-label="Sala dos Voluntários" aria-pressed={agenda.mode === 'volunteers'} onClick={() => agenda.setMode('volunteers')}>
              <VolunteerCalendarIcon />
              <span className="sr-only">Sala dos Voluntários</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Sala dos Voluntários</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
