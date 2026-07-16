import { cn } from '@/lib/utils';
import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend?: string;
  variant?: 'default' | 'primary' | 'accent' | 'success' | 'warning';
  to?: string;
  /** Proporção entre 0 e 1 exibida abaixo do resumo. */
  progress?: number;
  /** Etiqueta contextual, por exemplo "próximo em 45 min". */
  smartLabel?: string;
  /** Indica atividade ao vivo sem depender de animação. */
  liveActive?: boolean;
  /** Contagem de itens urgentes. */
  urgentCount?: number;
}

const variantConfig = {
  default: {
    icon: 'bg-muted text-muted-foreground',
    progress: 'bg-muted-foreground',
  },
  primary: {
    icon: 'bg-primary/10 text-primary',
    progress: 'bg-primary',
  },
  accent: {
    icon: 'bg-action/10 text-[oklch(var(--brand-orange-700))]',
    progress: 'bg-action',
  },
  success: {
    icon: 'bg-success/10 text-success',
    progress: 'bg-success',
  },
  warning: {
    icon: 'bg-warning/15 text-warning',
    progress: 'bg-warning',
  },
};

export default function StatCard({
  label,
  value,
  icon,
  trend,
  variant = 'default',
  to,
  progress,
  smartLabel,
  liveActive,
  urgentCount,
}: StatCardProps) {
  const navigate = useNavigate();
  const config = variantConfig[variant];
  const showProgressBar = typeof progress === 'number';
  const progressPct = showProgressBar ? Math.max(0, Math.min(1, progress)) * 100 : 0;
  const hasUrgent = typeof urgentCount === 'number' && urgentCount > 0;
  const hasStatusRow = showProgressBar || Boolean(smartLabel) || hasUrgent;

  const activate = () => {
    if (to) navigate(to);
  };

  return (
    <div
      className={cn(
        'group relative flex min-h-[124px] flex-col rounded-xl border border-border bg-card p-4 text-card-foreground shadow-[var(--shadow-xs)]',
        to &&
          'cursor-pointer transition-[background-color,border-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-muted/25 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none',
      )}
      onClick={to ? activate : undefined}
      tabIndex={to ? 0 : undefined}
      role={to ? 'link' : undefined}
      aria-label={to ? `${label}: ${value}` : undefined}
      onKeyDown={(event) => {
        if (to && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          activate();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {liveActive && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
                <span className="sr-only">Ativo agora</span>
              </span>
            )}
            {to && (
              <ArrowUpRight
                aria-hidden
                className="h-3.5 w-3.5 text-muted-foreground transition-colors duration-150 group-hover:text-foreground motion-reduce:transition-none"
              />
            )}
          </div>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums sm:text-3xl">
            {value}
          </p>
          {trend && <p className="mt-0.5 text-xs font-medium text-muted-foreground">{trend}</p>}
        </div>

        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', config.icon)}>
          {icon}
        </div>
      </div>

      {hasStatusRow && (
        <div className="mt-auto flex items-center gap-2 pt-3">
          {showProgressBar && (
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={`Progresso de ${label}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progressPct)}
            >
              <div
                className={cn('h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none', config.progress)}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
          {smartLabel && (
            <span className="whitespace-nowrap rounded-md bg-muted px-2 py-1 text-[10px] font-semibold text-foreground">
              {smartLabel}
            </span>
          )}
          {hasUrgent && (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-destructive/10 px-2 py-1 text-[10px] font-semibold text-destructive">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-destructive" />
              {urgentCount} urgente{urgentCount! > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
