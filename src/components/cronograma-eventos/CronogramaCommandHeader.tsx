import { FenasojaCountdownHero } from './FenasojaCountdownHero';
import type { CronogramaEvent } from './types';

export function CronogramaCommandHeader({
  events,
  onNewEvent,
  onOpenUndated,
  canManage,
}: {
  events: CronogramaEvent[];
  onNewEvent: () => void;
  onOpenUndated: () => void;
  canManage: boolean;
}) {
  return (
    <FenasojaCountdownHero
      events={events}
      onNewEvent={onNewEvent}
      onOpenUndated={onOpenUndated}
      canManage={canManage}
      presentation="desktop"
    />
  );
}
