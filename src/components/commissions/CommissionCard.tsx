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

export default function CommissionCard({ access, index = 0, module, onSelect }: CommissionCardProps) {
  const Icon = module.icon;
  const status = module.status as CommissionStatus;
  const content = (
    <>
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
        <span className="commission-access-card__permission" data-state={access.state}>
          <AccessIcon state={access.state} />
          {access.label}
        </span>
      </span>
      <span className="commission-access-card__direction" aria-hidden="true">
        {access.target ? <ArrowUpRight /> : <LockKeyhole />}
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
      data-module={module.slug}
      style={{ animationDelay: `${Math.min(index, 7) * 24}ms` } as CSSProperties}
      aria-label={`${module.name}. ${statusLabels[status]}. ${access.label}. ${access.detail ?? ''}`}
    >
      {content}
    </article>
  );
}
