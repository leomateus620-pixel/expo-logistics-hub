import { CronogramaOperationalHeader } from '@/components/cronograma-eventos/CronogramaOperationalHeader';
import '@/styles/cronograma-mobile.css';

interface MobileCronogramaHeaderProps {
  availability?: 'ready' | 'loading' | 'offline';
}

export function MobileCronogramaHeader({
  availability,
}: MobileCronogramaHeaderProps) {
  return (
    <CronogramaOperationalHeader
      availability={availability}
      presentation="mobile"
    />
  );
}
