import {
  memo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from 'react';
import { UserRound } from 'lucide-react';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import type { OrgPerson } from '../types';
import type { PositionedOrgNode } from '../layout/organizationalLayout';
import type { OrgNodeVisualState } from '../hooks/useOrgGraphInteraction';

interface OrganizationalNodeProps {
  active: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  keyboardActive: boolean;
  people: Record<string, OrgPerson>;
  position: PositionedOrgNode;
  state: OrgNodeVisualState;
  onBlur: (nodeId: string) => void;
  onFocus: (nodeId: string) => void;
  onHover: (nodeId: string | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, nodeId: string) => void;
  onSelect: (nodeId: string) => void;
}

type NodeStyle = CSSProperties & {
  '--org-node-delay': string;
  '--org-node-x': string;
  '--org-node-y': string;
};

function presentationText(value: string): string {
  return value.toLocaleUpperCase('pt-BR');
}

function arrivalDelay(authorityLevel: number, levelOrder: number): number {
  if (authorityLevel === 1) return 140;
  if (authorityLevel === 2) return Math.min(680, 480 + levelOrder * 160);
  if (authorityLevel === 3) return 920;
  return Math.min(1880, 1120 + levelOrder * 22);
}

function normalizedIdentity(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueNames(names: string[]): string[] {
  const known = new Set<string>();
  return names.filter((name) => {
    const identity = normalizedIdentity(name);
    if (!identity || known.has(identity)) return false;
    known.add(identity);
    return true;
  });
}

function gestureConsumedClick(event: MouseEvent<HTMLButtonElement>): boolean {
  const viewport = event.currentTarget.closest<HTMLElement>('.org-viewport');
  return viewport?.dataset.orgGestureMoved === 'true';
}

function Avatar({
  person,
  eager = false,
}: {
  person: OrgPerson | null;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const canRenderImage = Boolean(person?.avatarUrl) && !failed;

  return (
    <span className="org-node__avatar" aria-hidden="true">
      {canRenderImage ? (
        <img
          src={person?.avatarUrl ?? undefined}
          alt=""
          decoding="async"
          draggable={false}
          loading={eager ? 'eager' : 'lazy'}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="org-node__avatar-fallback">
          <UserRound />
        </span>
      )}
    </span>
  );
}

function OrganizationalNodeComponent({
  active,
  buttonRef,
  keyboardActive,
  people,
  position,
  state,
  onBlur,
  onFocus,
  onHover,
  onKeyDown,
  onSelect,
}: OrganizationalNodeProps) {
  const { node, levelOrder, x, y } = position;
  const peopleForNode = node.personIds
    .map((personId) => people[personId])
    .filter((person): person is OrgPerson => Boolean(person));
  const responsibilityNames = node.responsibilities
    .map((responsibility) => responsibility.displayName)
    .filter(Boolean);
  const names = uniqueNames([
    ...peopleForNode.map((person) => person.fullName),
    ...responsibilityNames,
  ]).map(presentationText);
  const primaryName = names[0] ?? node.title;
  const isRoot = node.type === 'ccp';
  const isCentral = node.type === 'central-commission';
  const additionalCount = isRoot
    ? names.length
    : isCentral
      ? 0
      : Math.max(0, names.length - 1);
  const isCluster = node.type === 'central-commission' || peopleForNode.length > 1;
  const primaryLabel = presentationText(
    isRoot || isCentral ? node.title : primaryName,
  );
  const organizationLabel = isRoot
    ? (node.subtitle ?? 'CCPF')
    : node.type === 'executive'
      ? (node.subtitle ?? 'PRESIDÊNCIA')
      : isCentral
        ? (node.subtitle ?? node.title)
        : names.length > 0
          ? node.title
          : (node.subtitle ?? node.title);
  const presentedOrganizationLabel = presentationText(organizationLabel);
  const ariaDescription = [
    primaryLabel,
    presentedOrganizationLabel !== primaryLabel ? presentedOrganizationLabel : null,
    names.filter((name) => name !== primaryLabel).join(', '),
  ].filter(Boolean).join('. ');
  const nodeStyle: NodeStyle = {
    '--org-node-delay': `${arrivalDelay(node.authorityLevel, levelOrder)}ms`,
    '--org-node-x': `${x}px`,
    '--org-node-y': `${y}px`,
  };
  const visiblePeople = peopleForNode.slice(0, isCluster ? 3 : 1);

  return (
    <article
      className="org-node"
      data-active={active || undefined}
      data-authority={node.authorityLevel}
      data-filtered={state.filtered || undefined}
      data-hovered={state.hovered || undefined}
      data-matched={state.matched || undefined}
      data-muted={state.muted || undefined}
      data-node-type={node.type}
      data-related={state.related || undefined}
      data-selected={!state.filtered && state.selected ? true : undefined}
      aria-hidden={state.filtered || undefined}
      style={nodeStyle}
    >
      <button
        ref={buttonRef}
        type="button"
        className="org-node__button"
        data-org-node=""
        aria-label={ariaDescription}
        aria-pressed={!state.filtered && state.selected}
        disabled={!active || state.filtered}
        tabIndex={active && !state.filtered && keyboardActive ? 0 : -1}
        onBlur={() => onBlur(node.id)}
        onClick={(event) => {
          event.stopPropagation();
          if (state.filtered || gestureConsumedClick(event)) {
            event.preventDefault();
            return;
          }
          onSelect(node.id);
        }}
        onFocus={() => {
          if (!state.filtered) onFocus(node.id);
        }}
        onKeyDown={(event) => onKeyDown(event, node.id)}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(null)}
      >
        <span className="org-node__halo" aria-hidden="true" />
        <span className="org-node__ring" aria-hidden="true">
          <span className="org-node__ring-segments" />
          <span className="org-node__portrait">
            {isRoot ? (
              <FenasojaBrand
                className="org-node__brand-mark"
                markOnly
                showEdition={false}
                tone="dark"
              />
            ) : visiblePeople.length > 0 ? (
              <span className="org-node__avatar-stack" data-count={visiblePeople.length}>
                {visiblePeople.map((person, index) => (
                  <Avatar
                    key={person.id}
                    person={person}
                    eager={node.authorityLevel <= 2 && index === 0}
                  />
                ))}
              </span>
            ) : (
              <Avatar person={null} />
            )}
          </span>
          <span className="org-node__authority-tick" />
        </span>

        <span className="org-node__copy">
          <span className="org-node__name">{primaryLabel}</span>
          {additionalCount > 0 && (
            <span className="org-node__additional">
              {isRoot ? `${additionalCount} INTEGRANTES` : `+${additionalCount} RESPONSÁVEIS`}
            </span>
          )}
          <span className="org-node__organization">{presentedOrganizationLabel}</span>
        </span>
      </button>
    </article>
  );
}

export const OrganizationalNode = memo(
  OrganizationalNodeComponent,
  (previous, next) => (
    previous.active === next.active
    && previous.buttonRef === next.buttonRef
    && previous.keyboardActive === next.keyboardActive
    && previous.people === next.people
    && previous.position === next.position
    && previous.state.filtered === next.state.filtered
    && previous.state.hovered === next.state.hovered
    && previous.state.matched === next.state.matched
    && previous.state.muted === next.state.muted
    && previous.state.related === next.state.related
    && previous.state.selected === next.state.selected
    && previous.onBlur === next.onBlur
    && previous.onFocus === next.onFocus
    && previous.onHover === next.onHover
    && previous.onKeyDown === next.onKeyDown
    && previous.onSelect === next.onSelect
  ),
);
