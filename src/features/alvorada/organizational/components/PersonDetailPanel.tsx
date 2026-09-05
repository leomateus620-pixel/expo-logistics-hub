import { useState } from 'react';
import { UserRound, UsersRound, X } from 'lucide-react';
import {
  responsibleRoleLabel,
  type OrgUnitResponsibleRole,
} from '@/lib/org-units';
import type { OrganizationalGraph, OrgNode, OrgPerson } from '../types';
import { optimizedPortraitUrl } from '../optimizedPortrait';

interface PersonDetailPanelProps {
  graph: OrganizationalGraph;
  node: OrgNode;
  selectedPersonId?: string | null;
  onPersonSelect?: (personId: string) => void;
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
          src={optimizedPortraitUrl(person.avatarUrl)}
          alt={`RETRATO DE ${presentationText(person.fullName)}`}
          loading="lazy"
          decoding="async"
          width={72}
          height={72}
          onError={() => setFailed(true)}
        />
      ) : (
        <UserRound aria-hidden="true" />
      )}
    </span>
  );
}

export function PersonDetailPanel({ graph, node, selectedPersonId, onPersonSelect, onClose }: PersonDetailPanelProps) {
  const people = node.personIds
    .map((personId) => graph.people[personId])
    .filter((person): person is OrgPerson => Boolean(person));
  const contextualResponsibilities = node.responsibilities.filter((responsibility) => (
    !responsibility.personId
    || !node.personIds.includes(responsibility.personId)
    || !graph.people[responsibility.personId]
  ));
  const selectedPerson = selectedPersonId ? graph.people[selectedPersonId] : null;
  const allowedNodeIds = new Set(graph.renderableNodeIds);
  const memberships = selectedPerson
    ? graph.nodes.filter((item) => item.isRenderable
      && allowedNodeIds.has(item.id)
      && (item.personIds.includes(selectedPerson.id)
        || item.responsibilities.some((responsibility) => responsibility.personId === selectedPerson.id)))
    : [];
  const heading = presentationText(selectedPerson ? selectedPerson.fullName : node.type === 'executive' && people[0]
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
          <p>{presentationText(selectedPerson ? node.title : node.type === 'executive' ? (node.subtitle ?? 'PRESIDÊNCIA') : (node.subtitle ?? node.title))}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar detalhes" title="Fechar detalhes">
          <X aria-hidden="true" />
        </button>
      </header>

      {selectedPerson && (
        <section className="org-detail__selected-person" aria-label="Pessoa selecionada">
          <DetailAvatar key={selectedPerson.id} person={selectedPerson} />
          <div>
            <span className="org-detail__eyebrow">VÍNCULOS DIRETOS</span>
            <ul>
              {memberships.map((membership) => {
                const responsibility = membership.responsibilities.find((item) => item.personId === selectedPerson.id);
                return (
                  <li key={membership.id}>
                    <strong>{membership.title}</strong>
                    <span>{personRoleSummary(responsibility?.relationshipRole, selectedPerson.roles)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

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
                <button
                  key={person.id}
                  className="org-detail__person"
                  type="button"
                  aria-label={`Selecionar ${person.fullName}`}
                  aria-pressed={person.id === selectedPersonId}
                  onClick={() => onPersonSelect?.(person.id)}
                  disabled={!onPersonSelect}
                >
                  <DetailAvatar person={person} />
                  <span>
                    <strong>{presentationText(person.fullName)}</strong>
                    <small>{roleSummary}</small>
                  </span>
                </button>
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
