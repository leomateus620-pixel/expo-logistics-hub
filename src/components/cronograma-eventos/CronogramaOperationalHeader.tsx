import { memo } from 'react';
import { FenasojaPreparationTimeline } from '@/components/cronograma-eventos/FenasojaPreparationTimeline';
import { GoogleCalendarHeroWidget } from '@/components/cronograma-eventos/GoogleCalendarHeroWidget';
import { useFenasojaCycleProgress } from '@/hooks/useFenasojaCountdown';
import '@/styles/fenasoja-countdown.css';
import '@/styles/cronograma-operational-header.css';

interface CronogramaOperationalHeaderProps {
  presentation: 'desktop' | 'mobile';
  availability?: 'ready' | 'loading' | 'offline';
}

export const CronogramaOperationalHeader = memo(function CronogramaOperationalHeader({
  presentation,
  availability = 'ready',
}: CronogramaOperationalHeaderProps) {
  const cycleProgress = useFenasojaCycleProgress();

  return (
    <section
      className="cronograma-operational-header"
      data-presentation={presentation}
      aria-label="Resumo operacional do cronograma"
    >
      <div className="cronograma-operational-header__services">
        <FenasojaPreparationTimeline
          cycleProgress={cycleProgress}
          availability={availability}
          presentation={presentation}
        />
        <div className="cronograma-operational-header__calendar" aria-label="Integração com Google Agenda">
          <GoogleCalendarHeroWidget />
        </div>
      </div>

    </section>
  );
});
