import type { ReactNode, Ref } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Loader2,
  LockKeyhole,
  LogIn,
} from 'lucide-react';
import { AgendaWordmark } from '@/components/brand/AgendaWordmark';

import type { PortalPrimaryEntry as PortalPrimaryEntryConfig } from '@/modules/portal/portalRegistry';
import type { PortalAccessPresentation } from '@/components/portal/portalTypes';

interface PortalPrimaryEntryProps {
  access: PortalAccessPresentation;
  children?: ReactNode;
  controlRef?: Ref<HTMLButtonElement>;
  entry: PortalPrimaryEntryConfig;
  expanded?: boolean;
  index: number;
  onSelect?: () => void;
  onToggle?: () => void;
}

function AccessIcon({ state }: Pick<PortalAccessPresentation, 'state'>) {
  if (state === 'loading') return <Loader2 className="portal-access-icon--loading" aria-hidden="true" />;
  if (state === 'denied') return <LockKeyhole aria-hidden="true" />;
  if (state === 'login') return <LogIn aria-hidden="true" />;
  if (state === 'setup') return <Building2 aria-hidden="true" />;
  return <ArrowRight aria-hidden="true" />;
}

function getActionLabel(
  entry: PortalPrimaryEntryConfig,
  access: PortalAccessPresentation,
  expanded: boolean,
) {
  if (entry.kind === 'expandable') {
    return expanded ? 'Recolher comissões' : 'Ver comissões';
  }

  if (access.state === 'allowed') {
    if (entry.id === 'mapa-comercial') return 'Abrir mapa';
    if (entry.id === 'financeiro') return 'Abrir financeiro';
    return 'Abrir agenda';
  }
  if (access.state === 'loading') return 'Verificando acesso';
  if (access.state === 'denied') {
    return entry.id === 'financeiro' ? 'Restrito ao perfil' : 'Perfil sem acesso';
  }
  if (access.state === 'login') return 'Entrar para acessar';
  if (access.state === 'setup') return 'Configurar organização';
  return access.label;
}


export function PortalPrimaryEntry({
  access,
  children,
  controlRef,
  entry,
  expanded = false,
  index,
  onSelect,
  onToggle,
}: PortalPrimaryEntryProps) {
  const Icon = entry.icon;
  const panelId = `portal-entry-panel-${entry.id}`;
  const statusId = `portal-entry-status-${entry.id}`;
  const isExpandable = entry.kind === 'expandable';
  const actionLabel = getActionLabel(entry, access, expanded);
  const stateDescription = access.detail ?? access.label;

  const content = (
    <>
      <span className="portal-primary-entry__index" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="portal-primary-entry__icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="portal-primary-entry__copy">
        <span className="portal-primary-entry__title" data-testid="portal-primary-title">
          {entry.wordmark ? (
            <AgendaWordmark variant={entry.wordmark} />
          ) : (
            entry.title
          )}
        </span>

        <span className="portal-primary-entry__description">{entry.description}</span>
      </span>
      {entry.countLabel && (
        <span className="portal-primary-entry__count">{entry.countLabel}</span>
      )}
      <span className="portal-primary-entry__action" aria-hidden="true">
        <span className="portal-primary-entry__action-label">{actionLabel}</span>
        <span className="portal-primary-entry__direction">
          {isExpandable ? <ChevronDown /> : access.target ? <ArrowRight /> : <AccessIcon state={access.state} />}
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

  return (
    <article
      className="portal-primary-entry"
      data-expanded={expanded}
      data-kind={entry.kind}
      data-tone={entry.tone}
      data-access-state={access.state}
      aria-busy={access.state === 'loading' ? 'true' : undefined}
    >
      {isExpandable ? (
        <button
          ref={controlRef}
          type="button"
          className="portal-primary-entry__control"
          onClick={onToggle}
          aria-label={`${actionLabel}: ${entry.title}`}
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-describedby={statusId}
        >
          {content}
        </button>
      ) : access.target ? (
        <Link
          to={access.target}
          className="portal-primary-entry__control"
          onClick={onSelect}
          aria-label={`${actionLabel}: ${entry.title}`}
          aria-describedby={statusId}
        >
          {content}
        </Link>
      ) : (
        <div
          className="portal-primary-entry__control portal-primary-entry__control--static"
          role="group"
          aria-label={`${actionLabel}: ${entry.title}`}
          aria-describedby={statusId}
          aria-disabled="true"
        >
          {content}
        </div>
      )}

      {isExpandable && (
        <div
          id={panelId}
          className="portal-primary-entry__panel"
          aria-hidden={!expanded}
          {...(!expanded ? ({ inert: '' } as Record<string, string>) : {})}
        >
          <div className="portal-primary-entry__panel-clip">
            <div className="portal-primary-entry__panel-content">{children}</div>
          </div>
        </div>
      )}
    </article>
  );
}
