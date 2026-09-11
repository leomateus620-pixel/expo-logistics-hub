import { CalendarDays, Clock3, Edit3, FileText, History, MapPin, Share2, Users } from 'lucide-react';
import type { AgendaEventViewModel, DocumentViewModel, EventHistoryEntry } from '../types';
import { formatLongDate, formatTimeRange, getDateParts, getEventDuration } from '../lib/agenda-presentation';
import { DocumentCard } from './DocumentCard';
import { EventHistory } from './EventHistory';
import { AgendaEmptyState } from './AgendaStates';
import { EventDateBadge, EventStatusBadge, NextEventFlag, PersonAvatar, UnitBadge, WorkspaceButton } from './primitives';
import { WorkspaceSheet } from './WorkspaceSheet';

export interface EventDetailProps {
  event: AgendaEventViewModel;
  unitId?: string;
  documents?: DocumentViewModel[];
  history?: EventHistoryEntry[];
  todayKey?: string;
  onEdit?: (event: AgendaEventViewModel) => void;
  onOpenDocuments?: (event: AgendaEventViewModel) => void;
  onOpenDocument?: (document: DocumentViewModel) => void;
  onDownloadDocument?: (document: DocumentViewModel) => void;
  onAddDocument?: (event: AgendaEventViewModel) => void;
  onShare?: (event: AgendaEventViewModel) => void;
}

/** Visual shell of the event detail. Used inside the side panel / full page. */
export function EventDetail({ event, unitId, documents = [], history = [], todayKey, onEdit, onOpenDocuments, onOpenDocument, onDownloadDocument, onAddDocument, onShare }: EventDetailProps) {
  const duration = getEventDuration(event);
  const { weekday } = getDateParts(event.date);
  const people = event.people ?? [];
  const units = event.units ?? [];

  return (
    <article className="ua-detail" aria-label={event.title}>
      <header className="ua-detail__hero">
        <div className="ua-detail__badges">
          <EventStatusBadge status={event.status} size="lg" withIcon />
          {event.isNext && <NextEventFlag />}
        </div>
        <div className="flex items-start gap-3">
          <EventDateBadge date={event.date} endDate={event.endDate} size="lg" showYear emphasis={event.isNext ? 'gold' : 'default'} />
          <h2 className="ua-detail__title ws-title min-w-0">{event.title}</h2>
        </div>
      </header>

      <div className="ua-detail__facts">
        <div className="ua-fact">
          <span className="ua-fact__label ws-caption"><CalendarDays aria-hidden="true" />Data</span>
          <span className="ua-fact__value ws-meta" style={{ fontWeight: 600 }}>
            {weekday}, {formatLongDate(event.date)}
            {event.endDate && event.endDate !== event.date && <span className="block ws-caption" style={{ color: 'var(--text-muted)', fontWeight: 500 }}>até {formatLongDate(event.endDate)}</span>}
          </span>
        </div>
        <div className="ua-fact">
          <span className="ua-fact__label ws-caption"><Clock3 aria-hidden="true" />Horário</span>
          <span className="ua-fact__value ws-meta" style={{ fontWeight: 600 }}>
            {formatTimeRange(event.startTime, event.endTime) ?? 'A definir'}
            {duration && <span className="block ws-caption" style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Duração {duration}</span>}
          </span>
        </div>
        <div className="ua-fact ua-fact--wide">
          <span className="ua-fact__label ws-caption"><MapPin aria-hidden="true" />Local</span>
          <span className="ua-fact__value ws-meta" style={{ fontWeight: 600 }}>{event.location ?? 'Local a definir'}</span>
        </div>
      </div>

      <div className="ua-detail__actions">
        <WorkspaceButton size="sm" icon={Edit3} onClick={() => onEdit?.(event)}>Editar</WorkspaceButton>
        <WorkspaceButton size="sm" icon={FileText} onClick={() => onOpenDocuments?.(event)}>Documentos</WorkspaceButton>
        <WorkspaceButton size="sm" icon={History} onClick={() => document.getElementById(`ua-history-${event.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Histórico</WorkspaceButton>
        <WorkspaceButton size="sm" icon={Share2} onClick={() => onShare?.(event)}>Compartilhar</WorkspaceButton>
      </div>

      <section className="ua-detail__section" aria-labelledby={`ua-detail-people-${event.id}`}>
        <h3 id={`ua-detail-people-${event.id}`} className="ua-detail__section-title ws-label" style={{ color: 'var(--text-muted)' }}>
          Responsáveis <span className="ws-caption" style={{ fontWeight: 600 }}>{people.length}</span>
        </h3>
        {people.length === 0 ? (
          <AgendaEmptyState compact icon={Users} title="Nenhum responsável definido" />
        ) : (
          <ul className="ua-detail__people">
            {people.map((person, index) => (
              <li key={person.id} className="ua-detail__person">
                <PersonAvatar person={person} size="lg" tone="light" primary={index === 0} />
                <span className="min-w-0">
                  <span className="ua-detail__person-name ws-meta block truncate" style={{ fontWeight: 600 }}>{person.name}</span>
                  <span className="ua-detail__person-role ws-caption block" style={{ fontWeight: 500 }}>{person.role ?? (index === 0 ? 'Responsável' : 'Participante')}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {units.length > 0 && (
        <section className="ua-detail__section" aria-labelledby={`ua-detail-units-${event.id}`}>
          <h3 id={`ua-detail-units-${event.id}`} className="ua-detail__section-title ws-label" style={{ color: 'var(--text-muted)' }}>Frentes relacionadas</h3>
          <div className="ua-units">
            {units.map((unit) => <UnitBadge key={unit.id} unit={unit} self={unit.id === unitId} />)}
          </div>
        </section>
      )}

      <section className="ua-detail__section" aria-labelledby={`ua-detail-description-${event.id}`}>
        <h3 id={`ua-detail-description-${event.id}`} className="ua-detail__section-title ws-label" style={{ color: 'var(--text-muted)' }}>Descrição</h3>
        <p className="ua-detail__description ws-body">
          {event.description || <span style={{ color: 'var(--text-muted)' }}>Sem descrição registrada para este evento.</span>}
        </p>
      </section>

      <section className="ua-detail__section" aria-labelledby={`ua-detail-docs-${event.id}`}>
        <h3 id={`ua-detail-docs-${event.id}`} className="ua-detail__section-title ws-label" style={{ color: 'var(--text-muted)' }}>
          Documentos do evento
          <button type="button" className="ua-section__link ws-focus" onClick={() => onAddDocument?.(event)}>Adicionar</button>
        </h3>
        {documents.length === 0 ? (
          <AgendaEmptyState compact icon={FileText} title="Nenhum documento vinculado" detail="Atas, pautas e anexos deste evento aparecerão aqui." />
        ) : (
          <div className="ua-documents">
            {documents.map((document) => (
              <DocumentCard key={document.id} document={document} hideEvent onOpen={onOpenDocument} onDownload={onDownloadDocument} />
            ))}
          </div>
        )}
      </section>

      <section id={`ua-history-${event.id}`} className="ua-detail__section" aria-labelledby={`ua-detail-history-${event.id}`} style={{ scrollMarginTop: 16 }}>
        <h3 id={`ua-detail-history-${event.id}`} className="ua-detail__section-title ws-label" style={{ color: 'var(--text-muted)' }}>Histórico</h3>
        <EventHistory entries={history} todayKey={todayKey} />
      </section>
    </article>
  );
}

export interface EventDetailSheetProps extends Omit<EventDetailProps, 'event'> {
  event: AgendaEventViewModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitLabel: string;
}

export function EventDetailSheet({ event, open, onOpenChange, unitLabel, ...props }: EventDetailSheetProps) {
  return (
    <WorkspaceSheet open={open && Boolean(event)} onOpenChange={onOpenChange} eyebrow="Evento" title={unitLabel}>
      {event && <EventDetail event={event} {...props} />}
    </WorkspaceSheet>
  );
}
