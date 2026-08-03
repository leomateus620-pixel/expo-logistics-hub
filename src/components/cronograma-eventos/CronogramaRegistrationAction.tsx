import { ArrowRight, CalendarPlus2 } from 'lucide-react';
import '@/styles/cronograma-registration-interactions.css';

interface CronogramaRegistrationActionProps {
  canManage: boolean;
  onCreate: () => void;
  presentation: 'desktop' | 'mobile';
}

export function CronogramaRegistrationAction({
  canManage,
  onCreate,
  presentation,
}: CronogramaRegistrationActionProps) {
  if (!canManage) return null;

  return (
    <button
      type="button"
      className="cronograma-registration-action"
      data-presentation={presentation}
      onClick={onCreate}
      aria-label="Novo evento: cadastrar ação no cronograma"
    >
      <span className="cronograma-registration-action__icon" aria-hidden="true">
        <CalendarPlus2 />
      </span>
      <span className="cronograma-registration-action__label">
        <strong>Novo evento</strong>
        <small>Cadastrar ação no cronograma</small>
      </span>
      <ArrowRight className="cronograma-registration-action__arrow" aria-hidden="true" />
    </button>
  );
}
