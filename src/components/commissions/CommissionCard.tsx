import { memo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Building2, Loader2, LockKeyhole, LogIn } from 'lucide-react';
import {
  statusLabels,
  type CommissionModule,
  type CommissionStatus,
} from '@/modules/commissions/commissionRegistry';
import type { PortalAccessPresentation } from '@/components/portal/portalTypes';

interface CommissionCardProps {
  access: PortalAccessPresentation;
  module: CommissionModule;
  onSelect: (moduleSlug: string) => void;
}

function AccessIcon({ state }: Pick<PortalAccessPresentation, 'state'>) {
  if (state === 'loading') return <Loader2 className="portal-access-icon--loading" aria-hidden="true" />;
  if (state === 'denied') return <LockKeyhole aria-hidden="true" />;
  if (state === 'login') return <LogIn aria-hidden="true" />;
  if (state === 'setup') return <Building2 aria-hidden="true" />;
  return <ArrowUpRight aria-hidden="true" />;
}

function getCommissionActionLabel(access: PortalAccessPresentation) {
  if (access.state === 'allowed') return 'Abrir frente';
  if (access.state === 'loading') return 'Verificando acesso';
  if (access.state === 'denied') return 'Perfil sem acesso';
  if (access.state === 'login') return 'Entrar para acessar';
  if (access.state === 'setup') return 'Configurar organização';
  return access.label;
}

function getCommissionVisualActionLabel(access: PortalAccessPresentation) {
  if (access.state === 'allowed') return 'Abrir frente';
  if (access.state === 'loading') return 'Verificando';
  if (access.state === 'denied') return 'Sem acesso';
  if (access.state === 'login') return 'Entrar';
  if (access.state === 'setup') return 'Configurar';
  return access.label;
}

function CommissionCard({ access, module, onSelect }: CommissionCardProps) {
  const Icon = module.icon;
  const status = module.status as CommissionStatus;
  const actionLabel = getCommissionActionLabel(access);
  const visualActionLabel = getCommissionVisualActionLabel(access);
  const showModuleStatus = status !== 'active';
  const statusId = `commission-access-status-${module.slug}`;
  const statusDescription = showModuleStatus ? `${statusLabels[status]}. ` : '';
  const accessDescription = access.detail ?? `${access.label}.`;
  const stateDescription = access.target
    ? accessDescription
    : `${statusDescription}${accessDescription}`;
  const content = (
    <>
      <span className="commission-access-card__icon" data-tone={module.visual.tone} aria-hidden="true">
        <Icon />
      </span>
      <span className="commission-access-card__copy">
        <span className="commission-access-card__heading">
          <span className="commission-access-card__name">{module.name}</span>
          {showModuleStatus && (
            <span className="commission-access-card__status" data-status={status}>
              {statusLabels[status]}
            </span>
          )}
        </span>
        <span className="commission-access-card__footer">
          <span className="commission-access-card__action" data-state={access.state} aria-hidden="true">
            <span>{visualActionLabel}</span>
            <span className="commission-access-card__direction">
              {access.target ? <ArrowUpRight /> : <AccessIcon state={access.state} />}
            </span>
          </span>
        </span>
      </span>
      <span
        id={statusId}
        className="portal-access-sr-only"
      >
        {stateDescription}
      </span>
    </>
  );

  if (access.target) {
    return (
      <Link
        to={access.target}
        onClick={() => onSelect(module.slug)}
        className="commission-access-card"
        data-status={status}
        data-access-state={access.state}
        data-tone={module.visual.tone}
        data-module={module.slug}
        aria-label={`${actionLabel}: ${module.name}${showModuleStatus ? `. ${statusLabels[status]}` : ''}`}
        aria-describedby={statusId}
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
      aria-label={`${actionLabel}: ${module.name}`}
      aria-describedby={statusId}
      aria-disabled="true"
      aria-busy={access.state === 'loading' ? 'true' : undefined}
    >
      {content}
    </article>
  );
}

export default memo(
  CommissionCard,
  (previous, next) => (
    previous.module === next.module
    && previous.onSelect === next.onSelect
    && previous.access.state === next.access.state
    && previous.access.label === next.access.label
    && previous.access.detail === next.access.detail
    && previous.access.target === next.access.target
  ),
);
