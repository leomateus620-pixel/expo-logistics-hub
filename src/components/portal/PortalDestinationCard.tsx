import { memo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Loader2, LockKeyhole, LogIn } from 'lucide-react';
import type { PortalDestination } from '@/modules/portal/portalRegistry';
import type { PortalAccessPresentation } from '@/components/portal/portalTypes';

interface PortalDestinationCardProps {
  access: PortalAccessPresentation;
  destination: PortalDestination;
  onSelect: (storageSlug: string) => void;
}

function DestinationStateIcon({ state }: Pick<PortalAccessPresentation, 'state'>) {
  if (state === 'loading') return <Loader2 className="portal-access-icon--loading" aria-hidden="true" />;
  if (state === 'denied') return <LockKeyhole aria-hidden="true" />;
  if (state === 'login') return <LogIn aria-hidden="true" />;
  if (state === 'setup') return <Building2 aria-hidden="true" />;
  return <ArrowRight aria-hidden="true" />;
}

function getDestinationActionLabel(access: PortalAccessPresentation) {
  if (access.state === 'allowed') return 'Abrir destino';
  if (access.state === 'loading') return 'Verificando acesso';
  if (access.state === 'denied') return 'Perfil sem acesso';
  if (access.state === 'login') return 'Entrar para acessar';
  if (access.state === 'setup') return 'Configurar organização';
  return access.label;
}

function PortalDestinationCardComponent({
  access,
  destination,
  onSelect,
}: PortalDestinationCardProps) {
  const Icon = destination.icon;
  const actionLabel = getDestinationActionLabel(access);
  const statusId = `portal-destination-status-${destination.id}`;
  const stateDescription = access.detail ?? access.label;
  const content = (
    <>
      <span className="portal-destination-card__icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="portal-destination-card__copy">
        <span className="portal-destination-card__title">{destination.title}</span>
        <span className="portal-destination-card__description">{destination.description}</span>
      </span>
      <span className="portal-destination-card__footer">
        <span className="portal-destination-card__action" data-state={access.state} aria-hidden="true">
          <span>{actionLabel}</span>
          <span className="portal-destination-card__direction">
            {access.target ? <ArrowRight /> : <DestinationStateIcon state={access.state} />}
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
        onClick={() => onSelect(destination.storageSlug)}
        className="portal-destination-card"
        data-destination={destination.id}
        data-access-state={access.state}
        aria-label={`${actionLabel}: ${destination.title}`}
        aria-describedby={statusId}
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
      aria-label={`${actionLabel}: ${destination.title}`}
      aria-describedby={statusId}
      aria-disabled="true"
      aria-busy={access.state === 'loading' ? 'true' : undefined}
    >
      {content}
    </article>
  );
}

export const PortalDestinationCard = memo(
  PortalDestinationCardComponent,
  (previous, next) => (
    previous.destination === next.destination
    && previous.onSelect === next.onSelect
    && previous.access.state === next.access.state
    && previous.access.label === next.access.label
    && previous.access.detail === next.access.detail
    && previous.access.target === next.access.target
  ),
);
