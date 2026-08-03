import { FenasojaCountdownHero } from './FenasojaCountdownHero';
import type { CronogramaEvent } from './types';

export function CronogramaCommandHeader({
  events,
  onOpenUndated,
  onExpandCountdown,
  availability,
}: {
  events: CronogramaEvent[];
  /** Kept as an optional compatibility prop; creation now lives beside view navigation. */
  onNewEvent?: () => void;
  onOpenUndated: () => void;
  onExpandCountdown?: () => void;
  /** Kept as an optional compatibility prop; the relocated action owns the permission gate. */
  canManage?: boolean;
  availability?: 'ready' | 'loading' | 'offline';
}) {
  return (
    <FenasojaCountdownHero
      events={events}
      onOpenUndated={onOpenUndated}
      onExpandCountdown={onExpandCountdown}
      availability={availability}
      presentation="desktop"
    />
  );
}
