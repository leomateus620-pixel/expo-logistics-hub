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
    <section
      className="cronograma-registration-action"
      data-presentation={presentation}
      aria-labelledby={`cronograma-registration-title-${presentation}`}
    >
      <div className="cronograma-registration-action__heading">
        <span className="cronograma-registration-action__eyebrow">Gestão do cronograma</span>
        <div>
          <h2 id={`cronograma-registration-title-${presentation}`}>Cronograma e Eventos</h2>
          <p>Acompanhe, organize e execute as ações do ciclo oficial.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onCreate}
        className="cronograma-registration-action__button focus-ring"
        aria-label="Criar novo evento no cronograma"
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
    </section>
  );
}
