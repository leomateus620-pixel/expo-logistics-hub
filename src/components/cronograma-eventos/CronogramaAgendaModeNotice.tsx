import { MapPin } from 'lucide-react';
import { matchesCronogramaLocation, type CronogramaLocationIdentity } from '@/lib/cronograma-agenda-mode';
import { useCronogramaAgendaMode } from './CronogramaAgendaModeContext';

/** Keep an authorized detail/editor mounted while clearly separating it from the room view. */
export function CronogramaAgendaModeNotice({ event }: { event: CronogramaLocationIdentity }) {
  const agenda = useCronogramaAgendaMode();
  if (agenda?.mode !== 'volunteers' || matchesCronogramaLocation(event, 'sala_voluntarios')) return null;
  return (
    <div className="cronograma-agenda-mode-notice" role="status">
      <MapPin aria-hidden="true" />
      <p>Este evento pertence a outro local e não integra a visão Sala dos Voluntários. Suas edições continuam preservadas.</p>
    </div>
  );
}
