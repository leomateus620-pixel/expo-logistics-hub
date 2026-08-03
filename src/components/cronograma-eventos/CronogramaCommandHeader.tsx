import { CronogramaOperationalHeader } from './CronogramaOperationalHeader';

export function CronogramaCommandHeader({
  availability,
}: {
  availability?: 'ready' | 'loading' | 'offline';
}) {
  return (
    <CronogramaOperationalHeader
      availability={availability}
      presentation="desktop"
    />
  );
}
