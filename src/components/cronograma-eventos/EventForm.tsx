import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarClock, Layers3, Save, X } from 'lucide-react';
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
import { useAuth } from '@/hooks/useAuth';
import { officialMemberLabel, resolveOfficialMembers } from '@/lib/memberIdentity';
import { ORG_UNIT_SELECT_LABEL } from '@/lib/org-units';
import {
  buildCommissionOptions,
  commissionLinksToSelections,
  reconcileResponsibleSelections,
  responsibleLinksToSelections,
  selectionsToCommissionLinks,
  selectionsToResponsibleLinks,
  useCronogramaRelationOptions,
} from './useCronogramaRelationOptions';
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

interface EventFormMember {
  user_id?: string | null;
  nome_exibicao?: string | null;
  cargo?: string | null;
  role?: string | null;
  commission_nome?: string | null;
  is_active?: boolean | null;
  is_core_team?: boolean | null;
}

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
  commissionsRel: [],
  responsiblesRel: [],
};

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
  showRelational = true,
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
  showRelational?: boolean;
}) {
  const formInstanceId = useId().replace(/:/g, '');
  const fieldId = (name: string) => `${formInstanceId}-${name}`;
  const { user } = useAuth();
  const {
    units,
    commissions,
    members,
    loginMembers,
    responsibleOptions,
    commissionsLoading,
    commissionsError,
    membersLoading,
    membersError,
  } = useCronogramaRelationOptions();
  const officialMembersByUserId = useMemo(
    () => resolveOfficialMembers([...(loginMembers ?? []), ...(members ?? [])] as EventFormMember[]),
    [loginMembers, members],
  );
  /** Member row of the logged user, resolved by immutable auth id. */
  const currentMember = useMemo(() => {
    if (!user) return null;
    return officialMembersByUserId.get(user.id) ?? null;
  }, [officialMembersByUserId, user]);
  const currentUserName = useMemo(() => {
    if (!user) return '';
    return (
      officialMemberLabel(currentMember)
      || (user.user_metadata as any)?.full_name
      || (user.user_metadata as any)?.name
      || user.email
      || ''
    );
  }, [currentMember, user]);

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
      commissionsRel: next.commissionsRel ?? [],
      responsiblesRel: next.responsiblesRel ?? [],
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

  const autoOwnerAppliedRef = useRef(false);
  useEffect(() => {
    if (event) return;
    if (!currentUserName) return;
    if (autoOwnerAppliedRef.current) return;
    autoOwnerAppliedRef.current = true;
    setForm((current) => {
      const next = { ...current };
      if (!current.owner?.trim()) next.owner = currentUserName;
      /** Whoever creates the event starts as the primary responsible. */
      if (!(current.responsiblesRel ?? []).length) {
        next.responsiblesRel = [{
          userId: user?.id ?? null,
          name: currentUserName,
          role: currentMember?.cargo ?? null,
          isPrimary: true,
          responsibleType: user?.id ? 'member' : 'external',
        }];
      }
      return next;
    });
  }, [currentMember, currentUserName, event, user?.id]);




  const update = <K extends keyof CronogramaEvent>(key: K, value: CronogramaEvent[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const commissionSelections = useMemo(
    () => commissionLinksToSelections(form.commissionsRel),
    [form.commissionsRel],
  );
  const responsibleSelections = useMemo(
    () => responsibleLinksToSelections(form.responsiblesRel),
    [form.responsiblesRel],
  );
  const linkedUnitIds = useMemo(
    () => (form.commissionsRel ?? []).map((link) => link.commissionId).filter(Boolean) as string[],
    [form.commissionsRel],
  );
  const commissionOptions = useMemo(
    () => buildCommissionOptions(units, linkedUnitIds),
    [units, linkedUnitIds],
  );





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
    const normalizedSubevents: CronogramaSubevent[] = (form.subevents ?? [])
      .map((subevent, index) => ({
        ...subevent,
        title: subevent.title.trim(),
        date: subevent.date?.trim() || normalizedDate,
        endDate: subevent.endDate?.trim() || subevent.date?.trim() || normalizedDate,
        startTime: subevent.startTime?.trim() || undefined,
        endTime: subevent.endTime?.trim() || undefined,
        owner: subevent.owner?.trim() || undefined,
        sortOrder: subevent.sortOrder ?? index,
      }))
      .filter((subevent) => subevent.title.length > 0);

    const optionByUserId = new Map(responsibleOptions.map((option) => [option.id, option]));
    let primarySeen = false;
    const normalizedResponsibles = selectionsToResponsibleLinks(responsibleSelections).map((link) => {
      const option = link.userId ? optionByUserId.get(link.userId) : null;
      const isPrimary = Boolean(link.isPrimary) && !primarySeen;
      if (isPrimary) primarySeen = true;
      return {
        ...link,
        name: option?.label ?? link.name,
        role: option?.hint ?? link.role,
        isPrimary,
      };
    });
    const primaryResponsible = normalizedResponsibles.find((link) => link.isPrimary);

    onSubmit({
      ...form,
      title: form.title.trim(),
      summary: form.summary.trim(),
      date: normalizedDate,
      year: nextYear,
      startTime: form.startTime?.trim() || undefined,
      endTime: form.endTime?.trim() || undefined,
      location: form.location?.trim() || undefined,
      owner: primaryResponsible?.name?.trim() || currentUserName || form.owner?.trim() || undefined,
      commission: form.commission?.trim() || undefined,
      pendingReason: form.pendingReason?.trim() || undefined,
      decisionNeeded: form.decisionNeeded?.trim() || undefined,
      subevents: normalizedSubevents,
      commissionsRel: selectionsToCommissionLinks(commissionSelections, commissions),
      responsiblesRel: normalizedResponsibles,
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
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-foreground/72">Informações principais</h3>
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
              Resumo <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id={fieldId('summary')}
              rows={3}
              value={form.summary}
              onChange={(event) => update('summary', event.target.value)}
              placeholder="Objetivo ou contexto do evento"
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
              Data <span className="font-normal text-muted-foreground">(opcional)</span>
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
              readOnly
              aria-readonly="true"
              tabIndex={-1}
              placeholder="Preenchido automaticamente"
              className="cursor-not-allowed bg-muted/60 text-foreground/80"
            />
          </div>

        </div>
      </div>

      {showRelational && (
        <div className="cronograma-form-section cronograma-relations-section">
          <div className="cronograma-relations-section__fields">

            <RelationalMultiSelect
              label={ORG_UNIT_SELECT_LABEL}
              placeholder="Buscar comissão, assessoria ou responsável"
              triggerLabel="Selecionar comissão ou assessoria"
              selectedTriggerLabel="Adicionar ou alterar áreas"
              emptyLabel="Nenhuma área vinculada."
              options={commissionOptions}
              value={commissionSelections}
              onChange={(next) => update('commissionsRel', selectionsToCommissionLinks(next, commissions))}
              isLoading={commissionsLoading}
              errorMessage={commissionsError ? 'Tente novamente em instantes.' : null}
              primaryLabel="Comissão principal"
              presentation={presentation}
              variant="organization"
            />




            <RelationalMultiSelect
              label="Responsáveis do evento"
              placeholder="Buscar pessoa por nome ou função"
              triggerLabel="Selecionar responsáveis"
              selectedTriggerLabel="Adicionar ou alterar responsáveis"
              emptyLabel="Nenhum responsável vinculado."
              options={responsibleOptions}
              value={responsibleSelections}
              onChange={(next) => {
                update(
                  'responsiblesRel',
                  selectionsToResponsibleLinks(reconcileResponsibleSelections(next, responsibleOptions)),
                );
              }}
              allowCustom
              isLoading={membersLoading}
              errorMessage={membersError ? 'Tente novamente em instantes.' : null}
              primaryLabel="Responsável principal"
              presentation={presentation}
              variant="person"
            />
          </div>
        </div>
      )}




      {showSubevents && (
        <div className="cronograma-form-section">
          <CronogramaSubeventForm
            value={form.subevents ?? []}
            onChange={(next) => update('subevents', next)}
            presentation={presentation}
            disabled={isSaving}
            defaultDate={form.date}
          />
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
  items: Record<string, string | undefined>;
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
          {Object.entries(items)
            .filter(([, itemLabel]) => Boolean(itemLabel))
            .map(([itemValue, itemLabel]) => (
              <SelectItem key={itemValue} value={itemValue} className="rounded-xl">
                {itemLabel}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}
