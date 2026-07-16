import { ArrowRight, CalendarRange, CheckCircle2 } from 'lucide-react';

export function CronogramaPortalCard({ onAccess }: { onAccess: () => void }) {
  return (
    <button
      type="button"
      onClick={onAccess}
      className="cronograma-portal-card"
      aria-label="Acessar Cronograma e Eventos"
    >
      <span className="cronograma-portal-card__content">
        <span className="cronograma-portal-icon" aria-hidden="true">
          <CalendarRange />
        </span>

        <span className="cronograma-portal-card__body">
          <span className="cronograma-portal-card__meta">
            <span>Planejamento central</span>
            <span className="cronograma-portal-card__availability">
              <CheckCircle2 aria-hidden="true" />
              Ativo
            </span>
          </span>
          <span className="cronograma-portal-card__title">Cronograma e Eventos</span>
          <span className="cronograma-portal-card__description">
            Reuniões, eventos, atividades e decisões do ciclo oficial.
          </span>
          <span className="cronograma-portal-card__cycle">
            <span>Ciclo oficial</span>
            <strong>2026—2028</strong>
          </span>
        </span>

        <span className="cronograma-portal-card__cta">
          Acessar Cronograma
          <ArrowRight aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
