import { FenasojaCountdownHero } from '@/components/cronograma-eventos/FenasojaCountdownHero';
import type { CronogramaEvent } from '../types';
import '@/styles/cronograma-mobile.css';

interface MobileCronogramaHeaderProps {
  events: CronogramaEvent[];
  onOpenUndated: () => void;
  onExpandCountdown?: () => void;
  availability?: 'ready' | 'loading' | 'offline';
}

export function MobileCronogramaHeader({
  events,
  onOpenUndated,
  onExpandCountdown,
  availability,
}: MobileCronogramaHeaderProps) {
  return (
    <FenasojaCountdownHero
      events={events}
      onOpenUndated={onOpenUndated}
      onExpandCountdown={onExpandCountdown}
      availability={availability}
      presentation="mobile"
    />
  );
}
