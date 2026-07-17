import { FenasojaCountdownHero } from '@/components/cronograma-eventos/FenasojaCountdownHero';
import type { CronogramaEvent } from '../types';
import '@/styles/cronograma-mobile.css';

interface MobileCronogramaHeaderProps {
  events: CronogramaEvent[];
  onNewEvent: () => void;
  onOpenUndated: () => void;
  onExpandCountdown?: () => void;
  canManage: boolean;
}

export function MobileCronogramaHeader({
  events,
  onNewEvent,
  onOpenUndated,
  onExpandCountdown,
  canManage,
}: MobileCronogramaHeaderProps) {
  return (
    <FenasojaCountdownHero
      events={events}
      onNewEvent={onNewEvent}
      onOpenUndated={onOpenUndated}
      onExpandCountdown={onExpandCountdown}
      canManage={canManage}
      presentation="mobile"
    />
  );
}
