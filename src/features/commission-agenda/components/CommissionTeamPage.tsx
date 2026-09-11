import { Crown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgendaLoadState, CommissionUnitViewModel, PersonSummary } from '../types';
import { unitArticleLabel } from '../lib/workspace-navigation';
import { AgendaEmptyState, AgendaErrorState } from './AgendaStates';
import { PersonAvatar } from './primitives';

export interface CommissionTeamPageProps {
  unit: CommissionUnitViewModel;
  state?: AgendaLoadState;
  onRetry?: () => void;
  className?: string;
}

function TeamMemberCard({ person, lead = false }: { person: PersonSummary; lead?: boolean }) {
  return (
    <li className={cn('ws-card ua-team-member', lead && 'ua-team-member--lead')}>
      <PersonAvatar person={person} size="lg" tone="light" primary={lead} />
      <div className="min-w-0">
        <p className="ua-team-member__name ws-meta" style={{ fontWeight: 700 }}>{person.name}</p>
        <p className="ua-team-member__role ws-caption">{person.role ?? (lead ? 'Principal' : 'Integrante')}</p>
      </div>
    </li>
  );
}

function TeamSkeleton() {
  return (
    <ul className="ua-team" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index} className="ws-card ua-team-member">
          <span className="ua-skeleton" style={{ width: 44, height: 44, borderRadius: 9999 }} />
          <span className="grid gap-2">
            <span className="ua-skeleton" style={{ height: 14, width: '70%' }} />
            <span className="ua-skeleton" style={{ height: 11, width: '40%' }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CommissionTeamPage({ unit, state = 'ready', onRetry, className }: CommissionTeamPageProps) {
  const unitLabel = unitArticleLabel(unit.type);
  const leads = unit.leads.length > 0 ? unit.leads : unit.principal ? [unit.principal] : [];
  const leadIds = new Set(leads.map((person) => person.id));
  const members = unit.members.filter((person) => !leadIds.has(person.id));
  const total = leads.length + members.length;

  if (state === 'error') {
    return <div className={cn('ua-page', className)}><AgendaErrorState onRetry={onRetry} label="a equipe" /></div>;
  }

  return (
    <div className={cn('ua-page', className)}>
      <header className="ua-header">
        <div className="min-w-0">
          <p className="ua-header__eyebrow ws-label">Equipe {unitLabel}</p>
          <h2 className="ua-header__title ws-title">Pessoas</h2>
          <p className="ua-header__meta ws-meta-secondary">
            {total === 0 ? 'Nenhum integrante vinculado' : `${total} ${total === 1 ? 'pessoa vinculada' : 'pessoas vinculadas'}`}
          </p>
        </div>
      </header>

      {state === 'loading' ? (
        <section className="ws-panel ua-section"><TeamSkeleton /></section>
      ) : total === 0 ? (
        <AgendaEmptyState
          icon={Users}
          title="Equipe em formação"
          detail={`Os responsáveis e integrantes ${unitLabel} serão exibidos aqui assim que forem vinculados.`}
        />
      ) : (
        <>
          {leads.length > 0 && (
            <section className="ws-panel ua-section" aria-labelledby="team-leads">
              <header className="ua-section__header">
                <h3 id="team-leads" className="ua-section__title ws-section-title">
                  <Crown aria-hidden="true" />
                  <span className="truncate">{leads.length === 1 ? 'Responsável principal' : 'Responsáveis principais'}</span>
                </h3>
                <span className="ws-meta-secondary">{leads.length}</span>
              </header>
              <ul className="ua-team">
                {leads.map((person) => <TeamMemberCard key={person.id} person={person} lead />)}
              </ul>
            </section>
          )}

          <section className="ws-panel ua-section" aria-labelledby="team-members">
            <header className="ua-section__header">
              <h3 id="team-members" className="ua-section__title ws-section-title">
                <Users aria-hidden="true" />
                <span className="truncate">Integrantes</span>
              </h3>
              <span className="ws-meta-secondary">{members.length}</span>
            </header>
            {members.length === 0 ? (
              <AgendaEmptyState
                compact
                icon={Users}
                title="Nenhum integrante além dos responsáveis"
                detail={`Novos integrantes ${unitLabel} aparecerão nesta lista.`}
              />
            ) : (
              <ul className="ua-team">
                {members.map((person) => <TeamMemberCard key={person.id} person={person} />)}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
