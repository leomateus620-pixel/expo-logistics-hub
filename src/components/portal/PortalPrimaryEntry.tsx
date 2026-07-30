import type { ReactNode, Ref } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Loader2,
  LockKeyhole,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
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
  if (state === 'allowed') return <ShieldCheck aria-hidden="true" />;
  return null;
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
          {entry.title}
        </span>
        <span className="portal-primary-entry__description">{entry.description}</span>
      </span>
      <span className="portal-primary-entry__meta" id={statusId}>
        <span className="portal-primary-entry__eyebrow">{entry.eyebrow}</span>
        <span className="portal-primary-entry__status" data-state={access.state}>
          <AccessIcon state={access.state} />
          {access.label}
        </span>
      </span>
      <span className="portal-primary-entry__direction" aria-hidden="true">
        {isExpandable ? <ChevronDown /> : access.target ? <ArrowRight /> : <LockKeyhole />}
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
    >
      {isExpandable ? (
        <button
          ref={controlRef}
          type="button"
          className="portal-primary-entry__control"
          onClick={onToggle}
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
          aria-describedby={statusId}
        >
          {content}
        </Link>
      ) : (
        <div
          className="portal-primary-entry__control portal-primary-entry__control--static"
          aria-label={`${entry.title}. ${access.label}. ${access.detail ?? entry.description}`}
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
