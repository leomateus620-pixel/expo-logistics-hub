import { ArrowRight, CalendarDays, CalendarPlus, FileText, ListChecks, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { AgendaEventViewModel, AgendaLoadState, CommissionUnitViewModel, DocumentViewModel } from '../types';
import { buildDashboard, getTodayKey, isCompletedLike, sortByChronology } from '../lib/agenda-presentation';
import { WORKSPACE_SECTION_PATHS, unitArticleLabel } from '../lib/workspace-navigation';
import { AgendaDashboard } from './AgendaDashboard';
import { AgendaEventCompactCard } from './AgendaEventCard';
import { AgendaKpiSkeleton, AgendaEventCardSkeleton } from './AgendaSkeleton';
import { AgendaEmptyState, AgendaErrorState, DocumentsEmptyState } from './AgendaStates';
import { DocumentCard } from './DocumentCard';
import { AvatarStack, PersonAvatar, WorkspaceButton } from './primitives';

export interface CommissionOverviewPageProps {
  unit: CommissionUnitViewModel;
  events: AgendaEventViewModel[];
  documents?: DocumentViewModel[];
  state?: AgendaLoadState;
  todayKey?: string;
  onOpenEvent?: (event: AgendaEventViewModel) => void;
  onCreateEvent?: () => void;
  onOpenDocument?: (document: DocumentViewModel) => void;
  onDownloadDocument?: (document: DocumentViewModel) => void;
  onAddDocument?: () => void;
  onRetry?: () => void;
  className?: string;
}

const PREVIEW_LIMIT = 4;

export function CommissionOverviewPage({
  unit,
  events,
  documents = [],
  state = 'ready',
  todayKey: todayKeyProp,
  onOpenEvent,
  onCreateEvent,
  onOpenDocument,
  onDownloadDocument,
  onAddDocument,
  onRetry,
  className,
}: CommissionOverviewPageProps) {
  const todayKey = todayKeyProp ?? getTodayKey();
  const unitLabel = unitArticleLabel(unit.type);
  const agendaPath = `${unit.basePath}/${WORKSPACE_SECTION_PATHS.agenda}`;
  const documentsPath = `${unit.basePath}/${WORKSPACE_SECTION_PATHS.documents}`;
  const teamPath = `${unit.basePath}/${WORKSPACE_SECTION_PATHS.team}`;

  const upcoming = sortByChronology(events)
    .filter((event) => !isCompletedLike(event, todayKey) && event.status !== 'cancelled' && (event.endDate ?? event.date) >= todayKey);
  const nextEvents = upcoming.slice(0, PREVIEW_LIMIT).map((event, index) => ({ ...event, isNext: index === 0 }));
  const dashboard = buildDashboard(events, documents.length, todayKey);
  const recentDocuments = [...documents].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const team = [...unit.leads, ...unit.members];

  if (state === 'error') {
    return (
      <div className={cn('ua-page', className)}>
        <AgendaErrorState onRetry={onRetry} label="a visão geral" />
      </div>
    );
  }

  const loading = state === 'loading';

  return (
    <div className={cn('ua-page', className)}>
      {loading ? <AgendaKpiSkeleton /> : <AgendaDashboard dashboard={dashboard} onOpenNextEvent={() => nextEvents[0] && onOpenEvent?.(nextEvents[0])} />}

      <div className="ua-overview">
        <section className="ws-panel ua-section ua-overview__full" aria-labelledby="overview-next-events">
          <header className="ua-section__header">
            <h2 id="overview-next-events" className="ua-section__title ws-section-title">
              <CalendarDays aria-hidden="true" />
              <span className="truncate">Próximos eventos</span>
            </h2>
            <Link to={agendaPath} className="ua-section__link ws-focus">
              Abrir agenda
              <ArrowRight aria-hidden="true" />
            </Link>
          </header>

          {loading ? (
            <div className="grid gap-2">
              <AgendaEventCardSkeleton />
              <AgendaEventCardSkeleton />
            </div>
          ) : nextEvents.length === 0 ? (
            <AgendaEmptyState
              compact
              title={events.length === 0 ? 'Nenhum evento cadastrado' : 'Nenhum evento futuro'}
              detail={
                events.length === 0
                  ? `Os eventos ${unitLabel} aparecerão aqui assim que forem vinculados na Agenda.`
                  : 'Todos os eventos vinculados já foram concluídos. Consulte o histórico completo na agenda.'
              }
              actions={
                <>
                  {onCreateEvent && (
                    <WorkspaceButton variant="primary" size="sm" icon={CalendarPlus} onClick={onCreateEvent}>
                      Criar evento
                    </WorkspaceButton>
                  )}
                  <Link to={agendaPath} className="ua-button ua-button--sm ua-button--ghost ws-focus">
                    Ver agenda completa
                  </Link>
                </>
              }
            />
          ) : (
            <ul className="grid gap-1" aria-label="Próximos eventos">
              {nextEvents.map((event) => (
                <li key={event.id}>
                  <AgendaEventCompactCard event={event} onOpen={onOpenEvent} />
                </li>
              ))}
            </ul>
          )}

          {!loading && upcoming.length > PREVIEW_LIMIT && (
            <p className="ws-meta-secondary">
              +{upcoming.length - PREVIEW_LIMIT} {upcoming.length - PREVIEW_LIMIT === 1 ? 'evento futuro' : 'eventos futuros'} na agenda completa.
            </p>
          )}
        </section>

        <section className="ws-panel ua-section" aria-labelledby="overview-documents">
          <header className="ua-section__header">
            <h2 id="overview-documents" className="ua-section__title ws-section-title">
              <FileText aria-hidden="true" />
              <span className="truncate">Documentos</span>
            </h2>
            {documents.length > 0 && (
              <Link to={documentsPath} className="ua-section__link ws-focus">
                Ver todos
                <ArrowRight aria-hidden="true" />
              </Link>
            )}
          </header>
          {recentDocuments.length === 0 ? (
            <DocumentsEmptyState unitLabel={unitLabel} onAddDocument={onAddDocument} compact />
          ) : (
            <div className="ua-documents">
              {recentDocuments.map((document) => (
                <DocumentCard key={document.id} document={document} onOpen={onOpenDocument} onDownload={onDownloadDocument} />
              ))}
            </div>
          )}
        </section>

        <section className="ws-panel ua-section" aria-labelledby="overview-team">
          <header className="ua-section__header">
            <h2 id="overview-team" className="ua-section__title ws-section-title">
              <Users aria-hidden="true" />
              <span className="truncate">Equipe</span>
            </h2>
            <Link to={teamPath} className="ua-section__link ws-focus">
              Ver equipe
              <ArrowRight aria-hidden="true" />
            </Link>
          </header>

          {team.length === 0 ? (
            <AgendaEmptyState
              compact
              icon={Users}
              title="Equipe em formação"
              detail={`Os integrantes ${unitLabel} serão exibidos aqui assim que forem vinculados.`}
            />
          ) : (
            <div className="grid gap-3">
              {unit.leads.slice(0, 2).map((person) => (
                <div key={person.id} className="ws-card ua-team-member ua-team-member--lead">
                  <PersonAvatar person={person} size="md" tone="light" primary />
                  <div className="min-w-0">
                    <p className="ua-team-member__name ws-meta">{person.name}</p>
                    <p className="ua-team-member__role ws-caption">{person.role ?? 'Principal'}</p>
                  </div>
                </div>
              ))}
              {unit.members.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <AvatarStack people={unit.members} max={6} size="md" tone="light" />
                  <span className="ws-meta-secondary">
                    {unit.members.length} {unit.members.length === 1 ? 'integrante' : 'integrantes'}
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="ws-panel ua-section ua-overview__full" aria-labelledby="overview-tasks">
          <header className="ua-section__header">
            <h2 id="overview-tasks" className="ua-section__title ws-section-title">
              <ListChecks aria-hidden="true" />
              <span className="truncate">Tarefas {unitLabel}</span>
            </h2>
          </header>
          <AgendaEmptyState
            compact
            icon={ListChecks}
            title="Área preparada"
            detail="O acompanhamento de tarefas específicas desta frente será habilitado após a validação do escopo operacional."
          />
        </section>
      </div>
    </div>
  );
}
