import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Building2, Loader2, LockKeyhole, LogIn, ShieldCheck } from 'lucide-react';
import {
  statusLabels,
  type CommissionModule,
  type CommissionStatus,
} from '@/modules/commissions/commissionRegistry';
import type { PortalAccessPresentation } from '@/components/portal/portalTypes';

interface CommissionCardProps {
  access: PortalAccessPresentation;
  index?: number;
  module: CommissionModule;
  onSelect: () => void;
}

function AccessIcon({ state }: Pick<PortalAccessPresentation, 'state'>) {
  if (state === 'loading') return <Loader2 className="portal-access-icon--loading" aria-hidden="true" />;
  if (state === 'denied') return <LockKeyhole aria-hidden="true" />;
  if (state === 'login') return <LogIn aria-hidden="true" />;
  if (state === 'setup') return <Building2 aria-hidden="true" />;
  return <ShieldCheck aria-hidden="true" />;
}

function getCommissionActionLabel(access: PortalAccessPresentation) {
  if (access.state === 'allowed') return 'Abrir frente';
  if (access.state === 'loading') return 'Aguarde';
  if (access.state === 'denied') return 'Indisponível';
  if (access.state === 'login') return 'Identificar acesso';
  if (access.state === 'setup') return 'Configurar acesso';
  return access.label;
}

export default function CommissionCard({ access, index = 0, module, onSelect }: CommissionCardProps) {
  const Icon = module.icon;
  const status = module.status as CommissionStatus;
  const actionLabel = getCommissionActionLabel(access);
  const content = (
    <>
      <span className="commission-access-card__order" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="commission-access-card__icon" data-tone={module.visual.tone} aria-hidden="true">
        <Icon />
      </span>
      <span className="commission-access-card__copy">
        <span className="commission-access-card__heading">
          <span className="commission-access-card__name">{module.name}</span>
          <span className="commission-access-card__status" data-status={status}>
            {statusLabels[status]}
          </span>
        </span>
        <span className="commission-access-card__description">{module.description}</span>
        <span className="commission-access-card__footer">
          <span className="commission-access-card__permission" data-state={access.state}>
            <AccessIcon state={access.state} />
            {access.label}
          </span>
          <span className="commission-access-card__action" aria-hidden="true">
            <span>{actionLabel}</span>
            <span className="commission-access-card__direction">
              {access.target ? <ArrowUpRight /> : <LockKeyhole />}
            </span>
          </span>
        </span>
      </span>
    </>
  );

  if (access.target) {
    return (
      <Link
        to={access.target}
        onClick={onSelect}
        className="commission-access-card"
        data-status={status}
        data-access-state={access.state}
        data-tone={module.visual.tone}
        data-module={module.slug}
        style={{ animationDelay: `${Math.min(index, 7) * 24}ms` } as CSSProperties}
        aria-label={`${module.name}. ${statusLabels[status]}. ${access.label}.`}
      >
        {content}
      </Link>
    );
  }

  return (
    <article
      className="commission-access-card commission-access-card--static"
      data-status={status}
      data-access-state={access.state}
      data-tone={module.visual.tone}
      data-module={module.slug}
      style={{ animationDelay: `${Math.min(index, 7) * 24}ms` } as CSSProperties}
      aria-label={`${module.name}. ${statusLabels[status]}. ${access.label}. ${access.detail ?? ''}`}
    >
      {content}
    </article>
  );
}
