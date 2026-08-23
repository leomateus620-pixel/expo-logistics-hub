import { useState } from 'react';
import { UserRound, UsersRound, X } from 'lucide-react';
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

function presentationText(value: string): string {
  return value.toLocaleUpperCase('pt-BR');
}

const RAW_RESPONSIBLE_ROLES = new Set<OrgUnitResponsibleRole>([
  'principal',
  'corresponsavel',
  'copresidente',
  'equipe_apoio',
]);

function relationshipRoleLabel(role: string | null | undefined): string {
  const value = role?.trim();
  if (!value) return 'VÍNCULO INSTITUCIONAL';
  const normalized = value.toLocaleLowerCase('pt-BR').replace(/[\s-]+/g, '_');
  if (RAW_RESPONSIBLE_ROLES.has(normalized as OrgUnitResponsibleRole)) {
    return responsibleRoleLabel(normalized as OrgUnitResponsibleRole)
      .toLocaleUpperCase('pt-BR');
  }
  return value.toLocaleUpperCase('pt-BR');
}

function personRoleSummary(
  relationshipRole: string | null | undefined,
  personRoles: string[],
): string {
  if (relationshipRole) return relationshipRoleLabel(relationshipRole);
  const labels = personRoles.map(relationshipRoleLabel);
  return [...new Set(labels)].join(' · ') || 'VÍNCULO INSTITUCIONAL';
}

function DetailAvatar({ person }: { person: OrgPerson }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="org-detail__person-avatar">
      {person.avatarUrl && !failed ? (
        <img
          src={person.avatarUrl}
          alt={`RETRATO DE ${presentationText(person.fullName)}`}
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

export function PersonDetailPanel({ graph, node, onClose }: PersonDetailPanelProps) {
  const people = node.personIds
    .map((personId) => graph.people[personId])
    .filter((person): person is OrgPerson => Boolean(person));
  const contextualResponsibilities = node.responsibilities.filter((responsibility) => (
    !responsibility.personId
    || !node.personIds.includes(responsibility.personId)
    || !graph.people[responsibility.personId]
  ));
  const heading = presentationText(node.type === 'executive' && people[0]
    ? people[0].fullName
    : node.title);

  return (
    <aside
      className="org-detail"
      data-authority={node.authorityLevel}
      data-org-interactive
      data-org-detail-panel
      aria-label={`DETALHES DE ${heading}`}
      aria-live="polite"
    >
      <span className="org-detail__mobile-handle" aria-hidden="true" />
      <header className="org-detail__header">
        <div>
          <h2>{heading}</h2>
          <p>{presentationText(node.type === 'executive' ? (node.subtitle ?? 'PRESIDÊNCIA') : (node.subtitle ?? node.title))}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar detalhes">
          <X aria-hidden="true" />
        </button>
      </header>

      {people.length > 0 && (
        <section className="org-detail__section" aria-labelledby="org-detail-people">
          <div className="org-detail__section-title" id="org-detail-people">
            <UsersRound aria-hidden="true" />
            <span>{people.length === 1 ? 'RESPONSÁVEL' : `${people.length} RESPONSÁVEIS`}</span>
          </div>
          <div className="org-detail__people">
            {people.map((person) => {
              const relationship = node.responsibilities.find((item) => item.personId === person.id);
              const roleSummary = node.type === 'executive'
                ? presentationText(node.subtitle ?? 'PRESIDÊNCIA')
                : personRoleSummary(relationship?.relationshipRole, person.roles);
              return (
                <article key={person.id}>
                  <DetailAvatar person={person} />
                  <span>
                    <strong>{presentationText(person.fullName)}</strong>
                    <small>{roleSummary}</small>
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
            <span>RESPONSABILIDADE REGISTRADA</span>
          </div>
          <div className="org-detail__responsibilities">
            {contextualResponsibilities.map((responsibility) => (
              <p key={responsibility.id}>
                <strong>{presentationText(responsibility.displayName)}</strong>
                <span>{relationshipRoleLabel(responsibility.relationshipRole)}</span>
              </p>
            ))}
          </div>
        </section>
      )}

      {people.length === 0 && contextualResponsibilities.length === 0 && (
        <p className="org-detail__empty">
          NENHUMA PESSOA RESPONSÁVEL ESTÁ VINCULADA A ESTA ESTRUTURA NOS REGISTROS ATUAIS.
        </p>
      )}
    </aside>
  );
}
