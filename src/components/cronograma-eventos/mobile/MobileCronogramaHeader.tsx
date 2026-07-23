import { FenasojaCountdownHero } from '@/components/cronograma-eventos/FenasojaCountdownHero';
import type { CronogramaEvent } from '../types';
import '@/styles/cronograma-mobile.css';

interface MobileCronogramaHeaderProps {
  events: CronogramaEvent[];
  onNewEvent: () => void;
  onOpenUndated: () => void;
  onExpandCountdown?: () => void;
  canManage: boolean;
  availability?: 'ready' | 'loading' | 'offline';
}

export function MobileCronogramaHeader({
  events,
  onNewEvent,
  onOpenUndated,
  onExpandCountdown,
  canManage,
  availability,
}: MobileCronogramaHeaderProps) {
  return (
    <FenasojaCountdownHero
      events={events}
      onNewEvent={onNewEvent}
      onOpenUndated={onOpenUndated}
      onExpandCountdown={onExpandCountdown}
      canManage={canManage}
      availability={availability}
      presentation="mobile"
    />
  );
}
