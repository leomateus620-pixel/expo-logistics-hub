import { Link } from 'react-router-dom';
import { ArrowUpRight, Building2, Loader2, LockKeyhole, LogIn, ShieldCheck } from 'lucide-react';
import type { PortalDestination } from '@/modules/portal/portalRegistry';
import type { PortalAccessPresentation } from '@/components/portal/portalTypes';

interface PortalDestinationCardProps {
  access: PortalAccessPresentation;
  destination: PortalDestination;
  index: number;
  onSelect: () => void;
}

function DestinationStateIcon({ state }: Pick<PortalAccessPresentation, 'state'>) {
  if (state === 'loading') return <Loader2 className="portal-access-icon--loading" aria-hidden="true" />;
  if (state === 'denied') return <LockKeyhole aria-hidden="true" />;
  if (state === 'login') return <LogIn aria-hidden="true" />;
  if (state === 'setup') return <Building2 aria-hidden="true" />;
  return <ShieldCheck aria-hidden="true" />;
}

function getDestinationActionLabel(access: PortalAccessPresentation) {
  if (access.state === 'allowed') return 'Abrir destino';
  if (access.state === 'loading') return 'Aguarde';
  if (access.state === 'denied') return 'Indisponível';
  if (access.state === 'login') return 'Identificar acesso';
  if (access.state === 'setup') return 'Configurar acesso';
  return access.label;
}

export function PortalDestinationCard({
  access,
  destination,
  index,
  onSelect,
}: PortalDestinationCardProps) {
  const Icon = destination.icon;
  const actionLabel = getDestinationActionLabel(access);
  const content = (
    <>
      <span className="portal-destination-card__order" aria-hidden="true">
        Destino {String(index + 1).padStart(2, '0')}
      </span>
      <span className="portal-destination-card__icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="portal-destination-card__copy">
        <span className="portal-destination-card__title">{destination.title}</span>
        <span className="portal-destination-card__description">{destination.description}</span>
      </span>
      <span className="portal-destination-card__footer">
        <span className="portal-destination-card__state" data-state={access.state}>
          <DestinationStateIcon state={access.state} />
          <span>{access.label}</span>
        </span>
        <span className="portal-destination-card__action" data-state={access.state} aria-hidden="true">
          <span>{actionLabel}</span>
          {access.target && <ArrowUpRight />}
        </span>
      </span>
    </>
  );

  if (access.target) {
    return (
      <Link
        to={access.target}
        onClick={onSelect}
        className="portal-destination-card"
        data-destination={destination.id}
        data-access-state={access.state}
        aria-label={`${destination.title}. ${access.label}. ${destination.description}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <article
      className="portal-destination-card portal-destination-card--static"
      data-destination={destination.id}
      data-access-state={access.state}
      aria-label={`${destination.title}. ${access.label}. ${access.detail ?? destination.description}`}
    >
      {content}
    </article>
  );
}
