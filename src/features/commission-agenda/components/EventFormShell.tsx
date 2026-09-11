import { useEffect, useId, useState, type FormEvent } from 'react';
import { CalendarDays, Check, FileText, Layers3, MapPin, Text, Upload, Users } from 'lucide-react';
import type { AgendaEventViewModel, EventStatus, PersonSummary, UnitSummary } from '../types';
import { EVENT_STATUS_LABELS } from '../lib/agenda-presentation';
import { PersonAvatar, WorkspaceButton } from './primitives';
import { WorkspaceSheet } from './WorkspaceSheet';

/** Local draft shape emitted by the form. The backend phase maps it to storage. */
export interface AgendaEventDraft {
  title: string;
  description: string;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  location: string;
  status: EventStatus;
  peopleIds: string[];
  unitIds: string[];
}

const EMPTY_DRAFT: AgendaEventDraft = {
  title: '',
  description: '',
  date: '',
  endDate: '',
  startTime: '',
  endTime: '',
  location: '',
  status: 'requested',
  peopleIds: [],
  unitIds: [],
};

function draftFromEvent(event: AgendaEventViewModel | null | undefined, unitId?: string): AgendaEventDraft {
  if (!event) return { ...EMPTY_DRAFT, unitIds: unitId ? [unitId] : [] };
  return {
    title: event.title,
    description: event.description ?? '',
    date: event.date,
    endDate: event.endDate ?? '',
    startTime: event.startTime ?? '',
    endTime: event.endTime ?? '',
    location: event.location ?? '',
    status: event.status,
    peopleIds: (event.people ?? []).map((person) => person.id),
    unitIds: (event.units ?? []).map((unit) => unit.id),
  };
}

export interface EventFormShellProps {
  /** When provided the form opens in edit mode. */
  event?: AgendaEventViewModel | null;
  unitId?: string;
  peopleOptions?: PersonSummary[];
  unitOptions?: UnitSummary[];
  onSubmit?: (draft: AgendaEventDraft) => void;
  onCancel?: () => void;
}

const STATUS_OPTIONS: EventStatus[] = ['requested', 'confirmed', 'draft', 'rescheduled'];

export function EventFormShell({ event, unitId, peopleOptions = [], unitOptions = [], onSubmit, onCancel }: EventFormShellProps) {
  const id = useId();
  const [draft, setDraft] = useState<AgendaEventDraft>(() => draftFromEvent(event, unitId));

  useEffect(() => {
    setDraft(draftFromEvent(event, unitId));
  }, [event, unitId]);

  const update = <K extends keyof AgendaEventDraft>(key: K, value: AgendaEventDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const toggle = (key: 'peopleIds' | 'unitIds', value: string) => setDraft((current) => ({
    ...current,
    [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value],
  }));

  const handleSubmit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    onSubmit?.(draft);
  };

  const canSubmit = draft.title.trim().length > 2 && draft.date.length > 0;

  return (
    <form id={`${id}-form`} className="ua-form" onSubmit={handleSubmit} noValidate>
      <section className="ua-form__section" aria-labelledby={`${id}-info`}>
        <h3 id={`${id}-info`} className="ua-form__section-title ws-label"><Text className="h-4 w-4" aria-hidden="true" />Informações</h3>
        <div className="ua-field">
          <label htmlFor={`${id}-title`} className="ua-field__label ws-meta">Título</label>
          <input id={`${id}-title`} value={draft.title} onChange={(e) => update('title', e.target.value)} placeholder="Ex.: Reunião operacional de logística" required />
        </div>
        <div className="ua-field">
          <label htmlFor={`${id}-description`} className="ua-field__label ws-meta">Descrição</label>
          <textarea id={`${id}-description`} value={draft.description} onChange={(e) => update('description', e.target.value)} placeholder="Pauta, objetivos e observações do evento" />
        </div>
      </section>

      <section className="ua-form__section" aria-labelledby={`${id}-when`}>
        <h3 id={`${id}-when`} className="ua-form__section-title ws-label"><CalendarDays className="h-4 w-4" aria-hidden="true" />Data e horário</h3>
        <div className="ua-form__grid ua-form__grid--3">
          <div className="ua-field">
            <label htmlFor={`${id}-date`} className="ua-field__label ws-meta">Data</label>
            <input id={`${id}-date`} type="date" value={draft.date} onChange={(e) => update('date', e.target.value)} required />
          </div>
          <div className="ua-field">
            <label htmlFor={`${id}-start`} className="ua-field__label ws-meta">Início</label>
            <input id={`${id}-start`} type="time" value={draft.startTime} onChange={(e) => update('startTime', e.target.value)} />
          </div>
          <div className="ua-field">
            <label htmlFor={`${id}-end`} className="ua-field__label ws-meta">Fim</label>
            <input id={`${id}-end`} type="time" value={draft.endTime} onChange={(e) => update('endTime', e.target.value)} />
          </div>
        </div>
        <div className="ua-form__grid ua-form__grid--2">
          <div className="ua-field">
            <label htmlFor={`${id}-end-date`} className="ua-field__label ws-meta">Término (opcional)</label>
            <input id={`${id}-end-date`} type="date" value={draft.endDate} min={draft.date || undefined} onChange={(e) => update('endDate', e.target.value)} />
            <span className="ua-field__hint ws-caption" style={{ fontWeight: 500 }}>Para eventos de mais de um dia.</span>
          </div>
          <div className="ua-field">
            <label htmlFor={`${id}-status`} className="ua-field__label ws-meta">Situação</label>
            <select id={`${id}-status`} value={draft.status} onChange={(e) => update('status', e.target.value as EventStatus)}>
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{EVENT_STATUS_LABELS[status]}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="ua-form__section" aria-labelledby={`${id}-where`}>
        <h3 id={`${id}-where`} className="ua-form__section-title ws-label"><MapPin className="h-4 w-4" aria-hidden="true" />Local</h3>
        <div className="ua-field">
          <label htmlFor={`${id}-location`} className="ua-field__label ws-meta">Local do evento</label>
          <input id={`${id}-location`} value={draft.location} onChange={(e) => update('location', e.target.value)} placeholder="Ex.: Casa Fenasoja" />
        </div>
      </section>

      <section className="ua-form__section" aria-labelledby={`${id}-people`}>
        <h3 id={`${id}-people`} className="ua-form__section-title ws-label"><Users className="h-4 w-4" aria-hidden="true" />Responsáveis</h3>
        {peopleOptions.length === 0 ? (
          <p className="ua-field__hint ws-meta-secondary">A seleção de pessoas será conectada ao cadastro oficial da frente.</p>
        ) : (
          <div className="ua-chip-select" role="group" aria-label="Responsáveis">
            {peopleOptions.map((person) => {
              const selected = draft.peopleIds.includes(person.id);
              return (
                <button key={person.id} type="button" className="ua-chip ws-focus" aria-pressed={selected} onClick={() => toggle('peopleIds', person.id)}>
                  <PersonAvatar person={person} size="xs" tone={selected ? 'dark' : 'light'} />
                  {person.name}
                  {selected && <Check aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="ua-form__section" aria-labelledby={`${id}-units`}>
        <h3 id={`${id}-units`} className="ua-form__section-title ws-label"><Layers3 className="h-4 w-4" aria-hidden="true" />Comissões relacionadas</h3>
        {unitOptions.length === 0 ? (
          <p className="ua-field__hint ws-meta-secondary">As frentes relacionadas serão carregadas do catálogo oficial.</p>
        ) : (
          <div className="ua-chip-select" role="group" aria-label="Comissões relacionadas">
            {unitOptions.map((unit) => {
              const selected = draft.unitIds.includes(unit.id);
              return (
                <button key={unit.id} type="button" className="ua-chip ws-focus" aria-pressed={selected} onClick={() => toggle('unitIds', unit.id)} disabled={unit.id === unitId}>
                  {unit.shortName ?? unit.name}
                  {selected && <Check aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="ua-form__section" aria-labelledby={`${id}-docs`}>
        <h3 id={`${id}-docs`} className="ua-form__section-title ws-label"><FileText className="h-4 w-4" aria-hidden="true" />Documentos</h3>
        <div className="ws-inset ua-dropzone" role="button" tabIndex={0} aria-label="Adicionar documentos ao evento">
          <Upload aria-hidden="true" />
          <span className="ws-meta" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Adicionar documentos</span>
          <span className="ws-caption" style={{ fontWeight: 500 }}>PDF, DOC, XLS ou imagens · até 25 MB</span>
        </div>
      </section>

      <div className="ua-form__footer">
        <WorkspaceButton onClick={onCancel}>Cancelar</WorkspaceButton>
        <WorkspaceButton type="submit" variant="primary" icon={Check} disabled={!canSubmit}>
          {event ? 'Salvar alterações' : 'Criar evento'}
        </WorkspaceButton>
      </div>
    </form>
  );
}

export interface EventFormSheetProps extends EventFormShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitLabel: string;
}

export function EventFormSheet({ open, onOpenChange, unitLabel, onCancel, ...props }: EventFormSheetProps) {
  return (
    <WorkspaceSheet
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={props.event ? 'Editar evento' : 'Criar evento'}
      title={unitLabel}
      description="As informações serão sincronizadas com a Agenda Fenasoja."
      wide
    >
      {open && <EventFormShell {...props} onCancel={() => { onCancel?.(); onOpenChange(false); }} />}
    </WorkspaceSheet>
  );
}
