import { memo, type CSSProperties } from 'react';
import {
  FENASOJA_2028_OPENING_LABEL,
  FENASOJA_2028_TIME_ZONE_LABEL,
} from '@/lib/fenasoja-countdown';

type TimelineAvailability = 'ready' | 'loading' | 'offline';

interface FenasojaPreparationTimelineProps {
  cycleProgress: number;
  availability: TimelineAvailability;
  presentation: 'desktop' | 'mobile';
}

function getPreparationStatus(cycleProgress: number, availability: TimelineAvailability) {
  if (availability === 'loading') return 'Atualizando o progresso oficial…';
  if (availability === 'offline') return 'Progresso temporal disponível; sincronização online indisponível.';
  if (cycleProgress >= 100) return 'Ciclo concluído no marco oficial.';
  return 'Construção em andamento.';
}

export const FenasojaPreparationTimeline = memo(function FenasojaPreparationTimeline({
  cycleProgress,
  availability,
  presentation,
}: FenasojaPreparationTimelineProps) {
  const status = getPreparationStatus(cycleProgress, availability);

  return (
    <section
      className="fenasoja-preparation"
      data-presentation={presentation}
      data-state={availability}
      aria-labelledby={`fenasoja-preparation-title-${presentation}`}
    >
      <div className="fenasoja-preparation-heading">
        <div className="fenasoja-preparation-title">
          <h2 id={`fenasoja-preparation-title-${presentation}`}>Preparação 2026—2028</h2>
          <strong aria-label={`${cycleProgress}% do ciclo`}>{cycleProgress}%</strong>
        </div>

        <p className="fenasoja-preparation-date">
          <span>Data final</span>
          <strong>{FENASOJA_2028_OPENING_LABEL}</strong>
          <small>{FENASOJA_2028_TIME_ZONE_LABEL}</small>
        </p>
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

      <p className="fenasoja-preparation-status" role="status">
        <span aria-hidden="true" />
        {status}
      </p>
    </section>
  );
});
