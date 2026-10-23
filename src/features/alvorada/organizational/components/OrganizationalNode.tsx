import {
  memo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from 'react';
import { BriefcaseBusiness, PanelsTopLeft, UserRound } from 'lucide-react';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import type { OrgPerson } from '../types';
import type { PositionedOrgNode } from '../layout/organizationalLayout';
import type { OrgNodeVisualState } from '../hooks/useOrgGraphInteraction';
import { presentationStage } from '../presentationPlan';
import { organizationalPresentationLevel } from '../layout/organizationalLayout';
import { optimizedPortraitUrl } from '../optimizedPortrait';

interface OrganizationalNodeProps {
  active: boolean;
  presenting?: boolean;
  elapsed?: number;
  buttonRef?: Ref<HTMLButtonElement>;
  keyboardActive: boolean;
  people: Record<string, OrgPerson>;
  selectedPersonId?: string | null;
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
  '--org-node-duration': string;
  '--org-node-x': string;
  '--org-node-y': string;
  '--org-node-size': string;
  '--org-node-width': string;
  '--org-node-height': string;
};

function presentationText(value: string): string {
  return value.toLocaleUpperCase('pt-BR');
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
  const portraitUrl = optimizedPortraitUrl(person?.avatarUrl);

  return (
    <span className="org-node__avatar" aria-hidden="true">
      {canRenderImage ? (
        <img
          src={portraitUrl}
          alt=""
          decoding="async"
          width={96}
          height={96}
          draggable={false}
          loading={eager || portraitUrl?.startsWith('/alvorada/portraits/') ? 'eager' : 'lazy'}
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
  presenting = false,
  elapsed = 3400,
  buttonRef,
  keyboardActive,
  people,
  selectedPersonId,
  position,
  state,
  onBlur,
  onFocus,
  onHover,
  onKeyDown,
  onSelect,
}: OrganizationalNodeProps) {
  const { node, levelOrder, x, y } = position;
  const stage = presentationStage(organizationalPresentationLevel(node), levelOrder);
  const revealed = !presenting || elapsed >= stage.start + stage.duration;
  const groupIds = node.metadata.presentationGroupIds;
  const isGroup = Array.isArray(groupIds);
  const GroupIcon = node.type === 'advisory' ? PanelsTopLeft : BriefcaseBusiness;
  const focusedPerson = selectedPersonId && node.personIds.includes(selectedPersonId)
    ? people[selectedPersonId]
    : null;
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
  const primaryName = focusedPerson?.fullName ?? names[0] ?? node.title;
  const isRoot = node.type === 'ccp';
  const isCentral = node.type === 'central-commission';
  const additionalCount = isRoot
    ? names.length
    : isCentral
      ? 0
      : Math.max(0, names.length - 1);
  const isCluster = !focusedPerson && (node.type === 'central-commission' || peopleForNode.length > 1);
  const primaryLabel = presentationText(
    (isRoot || isCentral) && !focusedPerson ? node.title : primaryName,
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
  const visibleOrganizationLabel = isRoot && !focusedPerson
    ? 'CONSELHO CONSULTIVO PERMANENTE'
    : presentedOrganizationLabel;
  const ariaDescription = [
    primaryLabel,
    presentedOrganizationLabel !== primaryLabel ? presentedOrganizationLabel : null,
    names.filter((name) => name !== primaryLabel).join(', '),
  ].filter(Boolean).join('. ');
  const nodeStyle: NodeStyle = {
    '--org-node-delay': `${stage.start}ms`,
    '--org-node-duration': `${stage.duration}ms`,
    '--org-node-x': `${x}px`,
    '--org-node-y': `${y}px`,
    '--org-node-size': `${position.radius * 2}px`,
    '--org-node-width': `${position.width}px`,
    '--org-node-height': `${position.height}px`,
  };
  const visiblePeople = focusedPerson ? [focusedPerson] : peopleForNode.slice(0, isCluster ? 3 : 1);

  return (
    <article
      className="org-node"
      data-active={active || undefined}
      data-presenting={presenting || undefined}
      data-horizontal={position.horizontal || undefined}
      data-caption-side={position.captionSide}
      data-context={position.context || undefined}
      data-group={isGroup || undefined}
      data-compact-group={position.compactGroup || undefined}
      data-node-id={node.id}
      data-authority={node.authorityLevel}
      data-filtered={state.filtered || undefined}
      data-hovered={state.hovered || undefined}
      data-muted={state.muted || undefined}
      data-node-type={node.type}
      data-related={state.related || undefined}
      data-selected={!state.filtered && state.selected ? true : undefined}
      aria-hidden={!revealed || state.filtered || undefined}
      style={nodeStyle}
    >
      <div className="org-node__reveal"><button
        ref={buttonRef}
        type="button"
        className="org-node__button"
        data-org-node=""
        aria-label={ariaDescription}
        title={ariaDescription}
        aria-pressed={!state.filtered && state.selected}
        disabled={!active || !revealed || position.context || state.filtered}
        tabIndex={active && revealed && !position.context && !state.filtered && keyboardActive ? 0 : -1}
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
            {isGroup ? <GroupIcon className="org-node__group-icon" /> : isRoot && !focusedPerson ? (
              <FenasojaBrand
                className="org-node__brand-mark"
                markOnly
                showEdition={false}
                tone="dark"
                markSrc="/alvorada/fenasoja-symbol-official.png"
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
          {position.horizontal && <span className="org-node__rank" aria-hidden="true">{String(organizationalPresentationLevel(node)).padStart(2, '0')}<i /></span>}
          <span className="org-node__name">{primaryLabel}</span>
          {additionalCount > 0 && (
            <span className="org-node__additional">
              {isRoot ? `${additionalCount} INTEGRANTES` : `+${additionalCount} RESPONSÁVEIS`}
            </span>
          )}
          <span className="org-node__organization">{isGroup ? node.subtitle : visibleOrganizationLabel}</span>
        </span>
      </button></div>
    </article>
  );
}

export const OrganizationalNode = memo(
  OrganizationalNodeComponent,
  (previous, next) => (
    previous.active === next.active
    && previous.presenting === next.presenting
    && previous.elapsed === next.elapsed
    && previous.buttonRef === next.buttonRef
    && previous.keyboardActive === next.keyboardActive
    && previous.people === next.people
    && previous.selectedPersonId === next.selectedPersonId
    && previous.position === next.position
    && previous.state.filtered === next.state.filtered
    && previous.state.hovered === next.state.hovered
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
