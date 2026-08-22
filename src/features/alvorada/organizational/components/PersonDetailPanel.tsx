import { useState } from 'react';
import { Network, UserRound, UsersRound, X } from 'lucide-react';
import {
  responsibleRoleLabel,
  type OrgUnitResponsibleRole,
} from '@/lib/org-units';
import type { OrganizationalGraph, OrgNode, OrgPerson } from '../types';

interface PersonDetailPanelProps {
  graph: OrganizationalGraph;
  node: OrgNode;
  onClose: () => void;
}

const AUTHORITY_TITLES: Record<number, string> = {
  1: 'Autoridade 01 · CCP',
  2: 'Autoridade 02 · Presidência',
  3: 'Autoridade 03 · Comissão Central',
  4: 'Autoridade 04 · Operação institucional',
};

const RAW_RESPONSIBLE_ROLES = new Set<OrgUnitResponsibleRole>([
  'principal',
  'corresponsavel',
  'copresidente',
  'equipe_apoio',
]);

function relationshipRoleLabel(role: string | null | undefined): string {
  const value = role?.trim();
  if (!value) return 'Vínculo institucional';
  const normalized = value.toLocaleLowerCase('pt-BR').replace(/[\s-]+/g, '_');
  if (RAW_RESPONSIBLE_ROLES.has(normalized as OrgUnitResponsibleRole)) {
    return responsibleRoleLabel(normalized as OrgUnitResponsibleRole);
  }
  return value;
}

function personRoleSummary(
  relationshipRole: string | null | undefined,
  personRoles: string[],
): string {
  if (relationshipRole) return relationshipRoleLabel(relationshipRole);
  const labels = personRoles.map(relationshipRoleLabel);
  return [...new Set(labels)].join(' · ') || 'Vínculo institucional';
}

function DetailAvatar({ person }: { person: OrgPerson }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="org-detail__person-avatar">
      {person.avatarUrl && !failed ? (
        <img
          src={person.avatarUrl}
          alt={`Retrato de ${person.fullName}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <UserRound aria-hidden="true" />
      )}
    </span>
  );
}

function relationshipTitle(graph: OrganizationalGraph, nodeId: string): string | null {
  if (!graph.renderableNodeIds.includes(nodeId)) return null;
  const relatedNode = graph.nodes.find((node) => node.id === nodeId);
  return relatedNode?.isRenderable ? relatedNode.title : null;
}

export function PersonDetailPanel({ graph, node, onClose }: PersonDetailPanelProps) {
  const people = node.personIds
    .map((personId) => graph.people[personId])
    .filter((person): person is OrgPerson => Boolean(person));
  const contextualResponsibilities = node.responsibilities.filter((responsibility) => (
    !responsibility.personId
    || !node.personIds.includes(responsibility.personId)
    || !graph.people[responsibility.personId]
  ));
  const parentTitles = node.parentIds
    .map((nodeId) => relationshipTitle(graph, nodeId))
    .filter((title): title is string => Boolean(title));
  const childTitles = node.childIds
    .map((nodeId) => relationshipTitle(graph, nodeId))
    .filter((title): title is string => Boolean(title));
  const heading = node.type === 'executive' && people[0]
    ? people[0].fullName
    : node.title;

  return (
    <aside
      className="org-detail"
      data-authority={node.authorityLevel}
      data-org-interactive
      data-org-detail-panel
      aria-label={`Detalhes de ${heading}`}
      aria-live="polite"
    >
      <span className="org-detail__mobile-handle" aria-hidden="true" />
      <header className="org-detail__header">
        <div>
          <span className="org-detail__authority">
            {AUTHORITY_TITLES[node.authorityLevel] ?? `Autoridade ${node.authorityLevel}`}
          </span>
          <h2>{heading}</h2>
          <p>{node.type === 'executive' ? (node.subtitle ?? 'Presidência') : (node.subtitle ?? node.title)}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar detalhes">
          <X aria-hidden="true" />
        </button>
      </header>

      {people.length > 0 && (
        <section className="org-detail__section" aria-labelledby="org-detail-people">
          <div className="org-detail__section-title" id="org-detail-people">
            <UsersRound aria-hidden="true" />
            <span>{people.length === 1 ? 'Responsável' : `${people.length} responsáveis`}</span>
          </div>
          <div className="org-detail__people">
            {people.map((person) => {
              const relationship = node.responsibilities.find((item) => item.personId === person.id);
              return (
                <article key={person.id}>
                  <DetailAvatar person={person} />
                  <span>
                    <strong>{person.fullName}</strong>
                    <small>{personRoleSummary(relationship?.relationshipRole, person.roles)}</small>
                  </span>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {contextualResponsibilities.length > 0 && (
        <section className="org-detail__section">
          <div className="org-detail__section-title">
            <UsersRound aria-hidden="true" />
            <span>Responsabilidade registrada</span>
          </div>
          <div className="org-detail__responsibilities">
            {contextualResponsibilities.map((responsibility) => (
              <p key={responsibility.id}>
                <strong>{responsibility.displayName}</strong>
                <span>{relationshipRoleLabel(responsibility.relationshipRole)}</span>
              </p>
            ))}
          </div>
        </section>
      )}

      {(parentTitles.length > 0 || childTitles.length > 0) && (
        <section className="org-detail__section org-detail__relationships">
          <div className="org-detail__section-title">
            <Network aria-hidden="true" />
            <span>Fluxo de autoridade</span>
          </div>
          {parentTitles.length > 0 && (
            <div>
              <small>Responde a</small>
              <p>{parentTitles.join(' · ')}</p>
            </div>
          )}
          {childTitles.length > 0 && (
            <div>
              <small>Conecta</small>
              <p>{childTitles.slice(0, 5).join(' · ')}{childTitles.length > 5 ? ` · +${childTitles.length - 5}` : ''}</p>
            </div>
          )}
        </section>
      )}

      {people.length === 0 && contextualResponsibilities.length === 0 && (
        <p className="org-detail__empty">
          Nenhuma pessoa responsável está vinculada a esta estrutura nos registros atuais.
        </p>
      )}
    </aside>
  );
}
