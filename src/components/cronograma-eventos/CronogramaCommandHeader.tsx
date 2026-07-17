import { FenasojaCountdownHero } from './FenasojaCountdownHero';
import type { CronogramaEvent } from './types';

export function CronogramaCommandHeader({
  events,
  onNewEvent,
  onOpenUndated,
  onExpandCountdown,
  canManage,
}: {
  events: CronogramaEvent[];
  onNewEvent: () => void;
  onOpenUndated: () => void;
  onExpandCountdown?: () => void;
  canManage: boolean;
}) {
  return (
    <FenasojaCountdownHero
      events={events}
      onNewEvent={onNewEvent}
      onOpenUndated={onOpenUndated}
      onExpandCountdown={onExpandCountdown}
      canManage={canManage}
      presentation="desktop"
    />
  );
}
