import { cn } from '@/lib/utils';

export interface WorkerTeamMarkProps {
  size?: 24 | 32 | 40 | number;
  className?: string;
  decorative?: boolean;
  ariaLabel?: string;
}

/** Local vector sub-brand: the official sun/fields meet the team's expressive eyes. */
export function WorkerTeamMark({
  size = 32,
  className,
  decorative = true,
  ariaLabel = 'Equipe IA Fenasoja',
}: WorkerTeamMarkProps) {
  return <img
    src="/fenasoja-bots.svg"
    width={size}
    height={size}
    alt={decorative ? '' : ariaLabel}
    aria-hidden={decorative || undefined}
    className={cn('worker-team-brand__mark', className)}
    draggable={false}
    decoding="async"
  />;
}

export interface WorkerTeamBrandProps {
  size?: WorkerTeamMarkProps['size'];
  className?: string;
  showWordmark?: boolean;
  tone?: 'light' | 'dark' | 'inherit';
  subtitle?: string;
}

export function WorkerTeamBrand({
  size = 32,
  className,
  showWordmark = true,
  tone = 'inherit',
  subtitle = 'Equipe IA',
}: WorkerTeamBrandProps) {
  return <span
    role="img"
    aria-label={`Fenasoja, ${subtitle}`}
    className={cn(
      'worker-team-brand',
      tone === 'light' && 'worker-team-brand--light',
      tone === 'dark' && 'worker-team-brand--dark',
      className,
    )}
  >
    <WorkerTeamMark size={size} />
    {showWordmark && <span className="worker-team-brand__copy">
      <span className="worker-team-brand__name">Fenasoja</span>
      <span className="worker-team-brand__subtitle">{subtitle}</span>
    </span>}
  </span>;
}
