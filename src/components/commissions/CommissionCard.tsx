import { ArrowRight, ChevronDown, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  statusLabels,
  type CommissionModule,
  type CommissionStatus,
} from '@/modules/commissions/commissionRegistry';

interface CommissionCardProps {
  module: Pick<CommissionModule, 'slug' | 'name' | 'description' | 'icon' | 'status' | 'accentClass'> & {
    sensitive?: boolean;
    visual?: Partial<CommissionModule['visual']>;
  };
  actionLabel?: string;
  index?: number;
  expanded?: boolean;
  onToggle?: () => void;
  onAccess: () => void;
}

export default function CommissionCard({
  module,
  actionLabel = 'Acessar módulo',
  index = 0,
  expanded = false,
  onToggle,
  onAccess,
}: CommissionCardProps) {
  const Icon = module.icon;
  const status = module.status as CommissionStatus;
  const detailsId = `commission-${module.slug}-details`;

  return (
    <article
      className="commission-access-card portal-card-enter"
      data-expanded={expanded}
      data-status={status}
      data-tone={module.visual?.tone}
      data-module={module.slug}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailsId}
        className="commission-access-card__toggle"
      >
        <span
          className={cn('commission-access-card__icon', module.visual?.iconBackground)}
          aria-hidden="true"
        >
          <Icon />
        </span>

        <span className="commission-access-card__identity">
          <span className="commission-access-card__name">{module.name}</span>
          <span className="commission-access-card__type">Comissão operacional</span>
        </span>

        <span className="commission-access-card__status">{statusLabels[status]}</span>

        <ChevronDown
          className={cn('commission-access-card__chevron', expanded && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div
          id={detailsId}
          className="commission-access-card__details animate-soft-rise"
          role="region"
          aria-label={`Detalhes de ${module.name}`}
        >
          <p>{module.description}</p>

          {module.sensitive && (
            <div className="commission-access-card__sensitive">
              <ShieldCheck aria-hidden="true" />
              Acesso sujeito a permissão específica
            </div>
          )}

          <button
            type="button"
            onClick={onAccess}
            className="commission-access-card__action"
            data-variant={status === 'active' ? 'primary' : 'secondary'}
            aria-label={`${actionLabel} ${module.name}`}
          >
            {actionLabel}
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      )}
    </article>
  );
}
