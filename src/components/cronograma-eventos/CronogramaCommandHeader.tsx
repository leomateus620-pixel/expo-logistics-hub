import { FenasojaCountdownHero } from './FenasojaCountdownHero';
import type { CronogramaEvent } from './types';

export function CronogramaCommandHeader({
  events,
  onNewEvent,
  onOpenUndated,
  onExpandCountdown,
  canManage,
  availability,
}: {
  events: CronogramaEvent[];
  onNewEvent: () => void;
  onOpenUndated: () => void;
  onExpandCountdown?: () => void;
  canManage: boolean;
  availability?: 'ready' | 'loading' | 'offline';
}) {
  return (
    <FenasojaCountdownHero
      events={events}
      onNewEvent={onNewEvent}
      onOpenUndated={onOpenUndated}
      onExpandCountdown={onExpandCountdown}
      canManage={canManage}
      availability={availability}
      presentation="desktop"
    />
  );
}
