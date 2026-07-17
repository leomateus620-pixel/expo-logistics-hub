import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarClock, Layers3, Save, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOrgCommissions } from '@/hooks/useOrgCommissions';
import { categoryLabels, priorityLabels, statusLabels } from './cronogramaData';
import { CronogramaSubeventForm } from './CronogramaSubeventForm';
import { RelationalMultiSelect, type RelationalSelection } from './RelationalMultiSelect';
import type {
  CronogramaCategory,
  CronogramaEvent,
  CronogramaEventCommissionLink,
  CronogramaEventResponsibleLink,
  CronogramaKind,
  CronogramaPriority,
  CronogramaStatus,
  CronogramaSubevent,
} from './types';

const kindLabels: Record<CronogramaKind, string> = {
  milestone: 'Marco',
  event: 'Evento',
  meeting: 'Reunião',
  deadline: 'Prazo',
  decision: 'Decisão',
};


const editableStatusLabels: Partial<Record<CronogramaStatus, string>> = {
  planned: statusLabels.planned,
  in_progress: statusLabels.in_progress,
  in_definition: statusLabels.in_definition,
  blocked: statusLabels.blocked,
  completed: statusLabels.completed,
  cancelled: statusLabels.cancelled,
};

function normalizeEditableStatus(status: CronogramaStatus): CronogramaStatus {
  if (status === 'overdue' || status === 'confirmed' || status === 'rescheduled') return 'planned';
  if (status === 'undated') return 'in_definition';
  return status;
}

const defaultForm: CronogramaEvent = {
  id: '',
  title: '',
  summary: '',
  date: null,
  startTime: '',
  endTime: '',
  year: 2028,
  category: 'governanca',
  status: 'planned',
  priority: 'medium',
  kind: 'event',
  location: '',
  owner: '',
  commission: '',
  pendingReason: '',
  decisionNeeded: '',
  subevents: [],
};

type SubeventFormItem = NonNullable<CronogramaEvent['subevents']>[number];

export function EventForm({
  event,
  onSubmit,
  onCancel,
  submitLabel = 'Salvar alterações',
  formId = 'cronograma-event-form',
  showActions = true,
  isSaving = false,
  submitError,
  onDirtyChange,
  presentation = 'desktop',
  defaultYear,
  showSubevents = true,
}: {
  event?: CronogramaEvent | null;
  onSubmit: (event: CronogramaEvent) => Promise<void> | void;
  onCancel: () => void;
  submitLabel?: string;
  formId?: string;
  showActions?: boolean;
  isSaving?: boolean;
  submitError?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  presentation?: 'desktop' | 'mobile';
  defaultYear?: CronogramaEvent['year'];
  showSubevents?: boolean;
}) {
  const formInstanceId = useId().replace(/:/g, '');
  const fieldId = (name: string) => `${formInstanceId}-${name}`;
  const initialForm = useMemo<CronogramaEvent>(() => {
    const next = {
      ...defaultForm,
      ...(!event && defaultYear ? { year: defaultYear } : {}),
      ...(event || {}),
    };
    return {
      ...next,
      status: normalizeEditableStatus(next.status),
      subevents: next.subevents?.map((subevent) => ({
        ...subevent,
        status: normalizeEditableStatus(subevent.status ?? 'planned'),
      })),
    };
  }, [defaultYear, event]);
  const initialSignature = useMemo(() => JSON.stringify(initialForm), [initialForm]);
  const [form, setForm] = useState<CronogramaEvent>(initialForm);
  const [baselineSignature, setBaselineSignature] = useState(initialSignature);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; time?: string }>({});
  const formIdentity = event?.sourceKey ?? event?.id ?? '__new-cronograma-event__';
  const formIdentityRef = useRef(formIdentity);
  const dirtyRef = useRef(false);

  useEffect(() => {
    const identityChanged = formIdentityRef.current !== formIdentity;
    if (!identityChanged && dirtyRef.current) return;
    formIdentityRef.current = formIdentity;
    dirtyRef.current = false;
    setForm(initialForm);
    setBaselineSignature(initialSignature);
    setFieldErrors({});
  }, [formIdentity, initialForm, initialSignature]);

  useEffect(() => {
    const dirty = JSON.stringify(form) !== baselineSignature;
    dirtyRef.current = dirty;
    onDirtyChange?.(dirty);
  }, [baselineSignature, form, onDirtyChange]);

  const update = <K extends keyof CronogramaEvent>(key: K, value: CronogramaEvent[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateSubevent = <K extends keyof SubeventFormItem>(index: number, key: K, value: SubeventFormItem[K]) => {
    setForm((current) => ({
      ...current,
      subevents: (current.subevents ?? []).map((subevent, itemIndex) => (
        itemIndex === index ? { ...subevent, [key]: value } : subevent
      )),
    }));
  };

  const addSubevent = () => {
    setForm((current) => ({
      ...current,
      subevents: [
        ...(current.subevents ?? []),
        { title: '', date: null, owner: '', status: 'planned' },
      ],
    }));
  };

  const removeSubevent = (index: number) => {
    setForm((current) => ({
      ...current,
      subevents: (current.subevents ?? []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleSubmit = (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    if (isSaving) return;

    const nextErrors: { title?: string; time?: string } = {};
    if (!form.title.trim()) nextErrors.title = 'Informe um título para identificar o evento.';
    if (form.startTime && form.endTime && form.endTime <= form.startTime) {
      nextErrors.time = 'O horário final deve ser posterior ao horário inicial.';
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      window.requestAnimationFrame(() => {
        document.getElementById(nextErrors.title ? fieldId('title') : fieldId('end'))?.focus();
      });
      return;
    }

    const normalizedDate = form.date?.trim() ? form.date : null;
    const nextYear = normalizedDate ? Number(normalizedDate.slice(0, 4)) : Number(form.year || 2028);
    const normalizedSubevents = (form.subevents ?? [])
      .map((subevent) => ({
        ...subevent,
        title: subevent.title.trim(),
        date: subevent.date?.trim() || null,
        owner: subevent.owner?.trim() || undefined,
      }))
      .filter((subevent) => subevent.title.length > 0);

    onSubmit({
      ...form,
      title: form.title.trim(),
      summary: form.summary.trim(),
      date: normalizedDate,
      year: nextYear,
      startTime: form.startTime?.trim() || undefined,
      endTime: form.endTime?.trim() || undefined,
      location: form.location?.trim() || undefined,
      owner: form.owner?.trim() || undefined,
      commission: form.commission?.trim() || undefined,
      pendingReason: form.pendingReason?.trim() || undefined,
      decisionNeeded: form.decisionNeeded?.trim() || undefined,
      subevents: normalizedSubevents,
    });
  };

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      className="cronograma-event-form space-y-4"
      data-presentation={presentation}
      noValidate
    >
      <div className="cronograma-form-section">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-gold" />
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-foreground/72">Identidade do evento</h3>
        </div>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={fieldId('title')}>
              Título <span aria-hidden="true" className="text-red-700">*</span>
            </Label>
            <Input
              id={fieldId('title')}
              aria-label="Título"
              value={form.title}
              onChange={(event) => {
                update('title', event.target.value);
                if (fieldErrors.title) setFieldErrors((current) => ({ ...current, title: undefined }));
              }}
              placeholder="Ex: Abertura oficial Fenasoja 2028"
              className="bg-white/72"
              required
              aria-invalid={Boolean(fieldErrors.title) || undefined}
              aria-describedby={fieldErrors.title ? fieldId('title-error') : undefined}
            />
            {fieldErrors.title && (
              <p id={fieldId('title-error')} className="cronograma-mobile-field-error" role="alert">
                {fieldErrors.title}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId('summary')}>
              Resumo executivo <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id={fieldId('summary')}
              rows={3}
              value={form.summary}
              onChange={(event) => update('summary', event.target.value)}
              placeholder="Síntese clara para leitura rápida no cronograma."
              className="rounded-2xl bg-white/72"
            />
          </div>
        </div>
      </div>

      <div className="cronograma-form-section">
        <div className="mb-3 flex items-center gap-2">
          <Layers3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-foreground/72">Classificação</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Categoria"
            mobile={presentation === 'mobile'}
            value={form.category}
            onChange={(value) => update('category', value as CronogramaCategory)}
            items={categoryLabels}
          />
          <SelectField
            label="Status"
            mobile={presentation === 'mobile'}
            value={form.status}
            onChange={(value) => update('status', value as CronogramaStatus)}
            items={editableStatusLabels}
          />
          <SelectField
            label="Prioridade"
            mobile={presentation === 'mobile'}
            value={form.priority}
            onChange={(value) => update('priority', value as CronogramaPriority)}
            items={priorityLabels}
          />
          <SelectField
            label="Tipo"
            mobile={presentation === 'mobile'}
            value={form.kind}
            onChange={(value) => update('kind', value as CronogramaKind)}
            items={kindLabels}
          />
        </div>
      </div>

      <div className="cronograma-form-section">
        <h3 className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-foreground/72">Data, local e responsáveis</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={fieldId('date')}>
              Data {presentation === 'mobile' && <span className="font-normal text-muted-foreground">(opcional)</span>}
            </Label>
            <Input
              id={fieldId('date')}
              type="date"
              value={form.date || ''}
              onChange={(event) => update('date', event.target.value || null)}
              className="bg-white/72"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId('start')}>Início</Label>
            <Input
              id={fieldId('start')}
              type="time"
              value={form.startTime || ''}
              onChange={(event) => {
                update('startTime', event.target.value);
                if (fieldErrors.time) setFieldErrors((current) => ({ ...current, time: undefined }));
              }}
              className="bg-white/72"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId('end')}>Fim</Label>
            <Input
              id={fieldId('end')}
              type="time"
              value={form.endTime || ''}
              onChange={(event) => {
                update('endTime', event.target.value);
                if (fieldErrors.time) setFieldErrors((current) => ({ ...current, time: undefined }));
              }}
              className="bg-white/72"
              aria-invalid={Boolean(fieldErrors.time) || undefined}
              aria-describedby={fieldErrors.time ? fieldId('time-error') : undefined}
            />
            {fieldErrors.time && (
              <p id={fieldId('time-error')} className="cronograma-mobile-field-error" role="alert">
                {fieldErrors.time}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={fieldId('location')}>Local</Label>
            <Input
              id={fieldId('location')}
              value={form.location || ''}
              onChange={(event) => update('location', event.target.value)}
              placeholder="Local ou área do parque"
              className="bg-white/72"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId('owner')}>Responsável</Label>
            <Input
              id={fieldId('owner')}
              value={form.owner || ''}
              onChange={(event) => update('owner', event.target.value)}
              placeholder="Comissão, pessoa ou coordenação"
              className="bg-white/72"
            />
          </div>
        </div>
      </div>

      <div className="cronograma-form-section is-pending">
        <h3 className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-amber-950/72">Quando ainda não há data</h3>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={fieldId('pending')}>Motivo da pendência</Label>
            <Input
              id={fieldId('pending')}
              value={form.pendingReason || ''}
              onChange={(event) => update('pendingReason', event.target.value)}
              placeholder="Ex: aguardando contrato, fornecedor ou validação externa"
              className="bg-white/72"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId('decision')}>Decisão necessária</Label>
            <Textarea
              id={fieldId('decision')}
              rows={2}
              value={form.decisionNeeded || ''}
              onChange={(event) => update('decisionNeeded', event.target.value)}
              placeholder="Qual decisão destrava este item?"
              className="rounded-2xl bg-white/72"
            />
          </div>
        </div>
      </div>

      {showSubevents && (
      <div className="cronograma-form-section">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-foreground/72">Subeventos vinculados</h3>
            <p className="mt-1 text-xs text-muted-foreground">Entregas menores, reuniões de apoio ou ações dependentes do evento principal.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addSubevent} className="rounded-full bg-white/70 text-xs">
            <Plus className="h-4 w-4" />
            Adicionar subevento
          </Button>
        </div>

        {(form.subevents ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/50 bg-white/45 p-4 text-center text-sm text-muted-foreground">
            Nenhum subevento vinculado.
          </div>
        ) : (
          <div className="space-y-3">
            {(form.subevents ?? []).map((subevent, index) => (
              <div key={index} className="rounded-2xl border border-border/35 bg-white/64 p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
                  <div className="space-y-1.5">
                    <Label htmlFor={fieldId(`subevent-title-${index}`)}>Título do subevento</Label>
                    <Input
                      id={fieldId(`subevent-title-${index}`)}
                      value={subevent.title}
                      onChange={(event) => updateSubevent(index, 'title', event.target.value)}
                      placeholder="Ex: validação de fornecedores"
                      className="bg-white/72"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={fieldId(`subevent-date-${index}`)}>Data</Label>
                    <Input
                      id={fieldId(`subevent-date-${index}`)}
                      type="date"
                      value={subevent.date || ''}
                      onChange={(event) => updateSubevent(index, 'date', event.target.value || null)}
                      className="bg-white/72"
                    />
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_auto]">
                  <div className="space-y-1.5">
                    <Label htmlFor={fieldId(`subevent-owner-${index}`)}>Responsável</Label>
                    <Input
                      id={fieldId(`subevent-owner-${index}`)}
                      value={subevent.owner || ''}
                      onChange={(event) => updateSubevent(index, 'owner', event.target.value)}
                      placeholder="Comissão ou responsável"
                      className="bg-white/72"
                    />
                  </div>
                  <SelectField
                    label="Status"
                    mobile={presentation === 'mobile'}
                    value={subevent.status || 'planned'}
                    onChange={(value) => updateSubevent(index, 'status', value as CronogramaStatus)}
                    items={editableStatusLabels}
                  />
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSubevent(index)}
                      className="h-10 w-10 rounded-full text-muted-foreground hover:bg-red-50 hover:text-red-800"
                      aria-label="Remover subevento"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {submitError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-900" role="alert">{submitError}</p>}

      {showActions && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border/50 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving} className="rounded-lg">
            <X className="h-4 w-4" />
            Cancelar
          </Button>
          <Button type="submit" disabled={isSaving} className="rounded-lg">
            <Save className="h-4 w-4" />
            {isSaving ? 'Salvando…' : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  items,
  mobile = false,
}: {
  label: string;
  value: T;
  onChange: (value: string) => void;
  items: Record<string, string>;
  mobile?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="rounded-2xl border-white/60 bg-white/72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          className={mobile
            ? 'cronograma-event-select-content z-[95] max-h-[min(22rem,70dvh)] rounded-2xl bg-white/95'
            : 'rounded-2xl bg-white/95'}
        >
          {Object.entries(items).map(([itemValue, itemLabel]) => (
            <SelectItem key={itemValue} value={itemValue} className="rounded-xl">
              {itemLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
