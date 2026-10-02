import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, Check, FileText, Layers3, MapPin, Text, Users } from 'lucide-react';
import type { AgendaEventViewModel, EventStatus, PersonSummary, UnitSummary } from '../types';
import { EVENT_STATUS_LABELS } from '../lib/agenda-presentation';
import { PersonAvatar, WorkspaceButton } from './primitives';
import { WorkspaceSheet } from './WorkspaceSheet';
import { WorkspaceRelationalSelect } from './WorkspaceRelationalSelect';

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
  /** Presentation name for the required workspace unit. */
  unitLabel?: string;
  peopleOptions?: PersonSummary[];
  unitOptions?: UnitSummary[];
  onSubmit?: (draft: AgendaEventDraft) => void;
  onCancel?: () => void;
}

const STATUS_OPTIONS: EventStatus[] = ['requested', 'confirmed', 'draft', 'rescheduled'];

export function EventFormShell({ event, unitId, unitLabel, peopleOptions = [], unitOptions = [], onSubmit, onCancel }: EventFormShellProps) {
  const id = useId();
  const [draft, setDraft] = useState<AgendaEventDraft>(() => draftFromEvent(event, unitId));
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDraft(draftFromEvent(event, unitId));
    setTouched({});
  }, [event, unitId]);

  // A saved selection absent from the current catalog remains visible and editable.
  // Identity and order come from IDs, never from matching names.
  const people = useMemo(() => {
    const options = [...peopleOptions];
    for (const person of event?.people ?? []) {
      if (!options.some((option) => option.id === person.id)) options.push(person);
    }
    return options;
  }, [peopleOptions, event]);
  const units = useMemo(() => {
    const options = [...unitOptions];
    for (const unit of event?.units ?? []) {
      if (!options.some((option) => option.id === unit.id)) options.push(unit);
    }
    return options;
  }, [unitOptions, event]);
  const workspaceUnit = units.find((unit) => unit.id === unitId);
  const titleError = touched.title && draft.title.trim().length <= 2 ? 'Informe um título com pelo menos 3 caracteres.' : undefined;
  const dateError = touched.date && !draft.date ? 'Informe a data do evento.' : undefined;
  const endDateError = draft.endDate && draft.endDate < draft.date ? 'A data final não pode ser anterior à inicial.' : undefined;
  const endTimeError = draft.startTime && draft.endTime && !draft.endDate && draft.endTime < draft.startTime ? 'O horário final não pode ser anterior ao inicial.' : undefined;

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
      <div className="ua-form__body">
      <section className="ua-form__section" aria-labelledby={`${id}-info`}>
        <h3 id={`${id}-info`} className="ua-form__section-title ws-label"><Text className="h-4 w-4" aria-hidden="true" />Informações</h3>
        <div className="ua-field">
          <label htmlFor={`${id}-title`} className="ua-field__label ws-meta">Título <span aria-hidden="true">*</span></label>
          <input id={`${id}-title`} name="title" autoComplete="off" value={draft.title} onChange={(e) => update('title', e.target.value)} onBlur={() => setTouched((current) => ({ ...current, title: true }))} aria-invalid={Boolean(titleError)} aria-describedby={titleError ? `${id}-title-error` : undefined} placeholder="Ex.: Reunião de preparação da frente" required />
          {titleError && <span id={`${id}-title-error`} className="ua-field__error ws-caption" role="alert">{titleError}</span>}
        </div>
        <div className="ua-field">
          <label htmlFor={`${id}-description`} className="ua-field__label ws-meta">Descrição <span className="ua-field__optional">(opcional)</span></label>
          <textarea id={`${id}-description`} name="description" autoComplete="off" value={draft.description} onChange={(e) => update('description', e.target.value)} placeholder="Pauta, objetivos e observações do evento" />
        </div>
      </section>

      <section className="ua-form__section" aria-labelledby={`${id}-when`}>
        <h3 id={`${id}-when`} className="ua-form__section-title ws-label"><CalendarDays className="h-4 w-4" aria-hidden="true" />Data e horário</h3>
        <div className="ua-form__grid ua-form__grid--3">
          <div className="ua-field">
            <label htmlFor={`${id}-date`} className="ua-field__label ws-meta">Data <span aria-hidden="true">*</span></label>
            <input id={`${id}-date`} type="date" value={draft.date} onChange={(e) => update('date', e.target.value)} onBlur={() => setTouched((current) => ({ ...current, date: true }))} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? `${id}-date-error` : undefined} required />
            {dateError && <span id={`${id}-date-error`} className="ua-field__error ws-caption" role="alert">{dateError}</span>}
          </div>
          <div className="ua-field">
            <label htmlFor={`${id}-start`} className="ua-field__label ws-meta">Início</label>
            <input id={`${id}-start`} type="time" value={draft.startTime} onChange={(e) => update('startTime', e.target.value)} />
          </div>
          <div className="ua-field">
            <label htmlFor={`${id}-end`} className="ua-field__label ws-meta">Fim</label>
            <input id={`${id}-end`} type="time" value={draft.endTime} onChange={(e) => update('endTime', e.target.value)} aria-invalid={Boolean(endTimeError)} aria-describedby={endTimeError ? `${id}-end-error` : undefined} />
            {endTimeError && <span id={`${id}-end-error`} className="ua-field__error ws-caption" role="alert">{endTimeError}</span>}
          </div>
        </div>
        <div className="ua-form__grid ua-form__grid--2">
          <div className="ua-field">
            <label htmlFor={`${id}-end-date`} className="ua-field__label ws-meta">Término (opcional)</label>
            <input id={`${id}-end-date`} type="date" value={draft.endDate} min={draft.date || undefined} onChange={(e) => update('endDate', e.target.value)} aria-invalid={Boolean(endDateError)} aria-describedby={endDateError ? `${id}-end-date-error` : `${id}-end-date-hint`} />
            <span id={`${id}-end-date-hint`} className="ua-field__hint ws-caption" style={{ fontWeight: 500 }}>Para eventos de mais de um dia.</span>
            {endDateError && <span id={`${id}-end-date-error`} className="ua-field__error ws-caption" role="alert">{endDateError}</span>}
          </div>
          <div className="ua-field">
            <label htmlFor={`${id}-status`} className="ua-field__label ws-meta">Situação</label>
            <select id={`${id}-status`} value={draft.status} onChange={(e) => update('status', e.target.value as EventStatus)}>
              {!STATUS_OPTIONS.includes(draft.status) && <option value={draft.status} disabled>{EVENT_STATUS_LABELS[draft.status]}</option>}
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{EVENT_STATUS_LABELS[status]}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="ua-form__section" aria-labelledby={`${id}-where`}>
        <h3 id={`${id}-where`} className="ua-form__section-title ws-label"><MapPin className="h-4 w-4" aria-hidden="true" />Local</h3>
        <div className="ua-field">
          <label htmlFor={`${id}-location`} className="ua-field__label ws-meta">Local do evento</label>
          <input id={`${id}-location`} name="location" autoComplete="off" value={draft.location} onChange={(e) => update('location', e.target.value)} placeholder="Ex.: Casa Fenasoja" />
        </div>
      </section>

      <section className="ua-form__section ua-form__section--relations" aria-labelledby={`${id}-relations`}>
        <h3 id={`${id}-relations`} className="ua-form__section-title ws-label"><Users className="h-4 w-4" aria-hidden="true" />Responsáveis e frentes</h3>
        <div className="ua-form__relations-grid">
          <WorkspaceRelationalSelect
            label="Pessoas responsáveis"
            description="O primeiro selecionado é o responsável principal."
            options={people.map((person) => ({ id: person.id, label: person.name, description: person.role, leading: <PersonAvatar person={person} size="xs" tone="light" /> }))}
            value={draft.peopleIds}
            primaryId={draft.peopleIds[0]}
            onToggle={(personId) => toggle('peopleIds', personId)}
            emptyLabel="Nenhuma pessoa selecionada."
          />
          <div className="ua-form__fronts">
            {unitId && (
              <div className="ua-form__required-unit">
                <Layers3 aria-hidden="true" />
                <span className="ua-relation__option-copy">
                  <span className="ws-caption">Frente principal deste cadastro</span>
                  <strong className="ws-meta">{workspaceUnit?.name ?? unitLabel ?? 'Frente deste workspace'}</strong>
                </span>
                <span className="ua-relation__locked ws-caption">Obrigatória</span>
              </div>
            )}
            <WorkspaceRelationalSelect
              label="Comissões e assessorias participantes"
              description="Outras frentes vinculadas ao evento."
              options={units.filter((unit) => unit.id !== unitId).map((unit) => ({ id: unit.id, label: unit.name, description: unit.type === 'assessoria' ? 'Assessoria' : 'Comissão', leading: <Layers3 aria-hidden="true" /> }))}
              value={draft.unitIds.filter((selectedId) => selectedId !== unitId)}
              onToggle={(selectedId) => toggle('unitIds', selectedId)}
              emptyLabel="Nenhuma outra frente selecionada."
            />
          </div>
        </div>
      </section>

      <section className="ua-form__section" aria-labelledby={`${id}-docs`}>
        <h3 id={`${id}-docs`} className="ua-form__section-title ws-label"><FileText className="h-4 w-4" aria-hidden="true" />Documentos</h3>
        <p className="ua-field__hint ws-meta-secondary">Publique arquivos na seção Documentos após salvar o evento.</p>
      </section>
      </div>

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
      {open && <EventFormShell {...props} unitLabel={unitLabel} onCancel={() => { onCancel?.(); onOpenChange(false); }} />}
    </WorkspaceSheet>
  );
}
