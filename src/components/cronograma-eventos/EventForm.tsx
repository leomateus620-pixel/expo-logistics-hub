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
import { useOrgCommissions } from '@/hooks/useOrgCommissions';
import { useAuth } from '@/hooks/useAuth';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import {
  ORG_UNIT_SELECT_LABEL,
  normalizeSearchTerm,
  orgUnitGroupLabel,
  orgUnitHint,
  responsibleRoleLabel,
  selectableOrgUnits,
} from '@/lib/org-units';
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

function commissionLinksToSelections(links: CronogramaEventCommissionLink[] | undefined): RelationalSelection[] {
  return (links ?? []).map((link) => ({
    id: link.commissionId ?? `slug:${link.commissionSlug ?? link.commissionName ?? 'sem-vinculo'}`,
    label: link.commissionName ?? link.commissionSlug ?? 'Comissão',
    hint: link.commissionSlug ?? undefined,
    isPrimary: link.isPrimary ?? false,
  }));
}

function responsibleLinksToSelections(links: CronogramaEventResponsibleLink[] | undefined): RelationalSelection[] {
  return (links ?? []).map((link) => ({
    id: link.userId ?? `external:${(link.name ?? '').toLocaleLowerCase('pt-BR')}`,
    label: link.name ?? 'Responsável',
    hint: link.role ?? (link.responsibleType === 'external' ? 'Externo' : 'Membro'),
    isPrimary: link.isPrimary ?? false,
  }));
}

function selectionsToCommissionLinks(
  selections: RelationalSelection[],
  options: Array<{ id: string; nome: string; slug: string }>,
): CronogramaEventCommissionLink[] {
  return selections.map((selection) => {
    const option = options.find((item) => item.id === selection.id);
    return {
      commissionId: option?.id ?? (selection.id.startsWith('slug:') ? null : selection.id),
      commissionSlug: option?.slug ?? selection.hint ?? null,
      commissionName: option?.nome ?? selection.label,
      isPrimary: selection.isPrimary ?? false,
    };
  });
}

function selectionsToResponsibleLinks(selections: RelationalSelection[]): CronogramaEventResponsibleLink[] {
  return selections.map((selection) => {
    const isExternal = selection.id.startsWith('external:') || selection.id.startsWith('custom:');
    return {
      userId: isExternal ? null : selection.id,
      name: selection.label,
      role: selection.hint ?? null,
      isPrimary: selection.isPrimary ?? false,
      responsibleType: isExternal ? 'external' : 'member',
    };
  });
}

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
  const {
    units,
    commissions,
    isLoading: commissionsLoading,
    error: commissionsError,
  } = useOrgCommissions();
  const { user } = useAuth();
  const {
    members,
    loginMembers,
    isLoading: membersLoading,
    isLoadingLoginMembers,
    error: membersError,
    loginMembersError,
  } = useOrgMembers();
  /** Member row of the logged user; core-team rows win over homonym duplicates. */
  const currentMember = useMemo(() => {
    if (!user) return null;
    const pool = ([...(loginMembers ?? []), ...(members ?? [])] as any[]).filter(
      (item: any) => item.user_id === user.id,
    );
    return pool.find((item: any) => item.is_core_team) ?? pool[0] ?? null;
  }, [loginMembers, members, user]);
  const currentUserName = useMemo(() => {
    if (!user) return '';
    return (
      currentMember?.nome_exibicao
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
      if (current.owner?.trim()) return current;
      return { ...current, owner: currentUserName };
    });
  }, [currentUserName, event, user?.id]);



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
  const responsibleOptions = useMemo(() => {
    const options: Array<{
      id: string;
      label: string;
      hint?: string;
      group?: string;
      description?: string;
      context?: string;
      searchText?: string;
    }> = [];
    const seenNames = new Set<string>();
    const typedMembers = members as EventFormMember[];
    const typedLoginMembers = loginMembers as EventFormMember[];
    const memberByUserId = new Map<string, EventFormMember>(
      typedMembers.flatMap((member) => (
        member.user_id ? [[member.user_id, member] as const] : []
      )),
    );
    const institutionalByName = new Map<string, {
      label: string;
      userId: string | null;
      firstUnitName: string;
      unitNames: Set<string>;
      roles: Set<string>;
    }>();

    units.forEach((unit) => {
      unit.responsibles.forEach((person) => {
        const label = (person.displayName ?? '').trim();
        if (!label) return;
        const key = normalizeSearchTerm(label);
        const existing = institutionalByName.get(key);
        if (existing) {
          existing.unitNames.add(unit.name);
          existing.roles.add(responsibleRoleLabel(person.relationshipRole));
          return;
        }
        institutionalByName.set(key, {
          label,
          userId: person.userId,
          firstUnitName: unit.name,
          unitNames: new Set([unit.name]),
          roles: new Set([responsibleRoleLabel(person.relationshipRole)]),
        });
      });
    });

    [...typedLoginMembers]
      .sort((a, b) => (a.nome_exibicao ?? '').localeCompare(b.nome_exibicao ?? '', 'pt-BR'))
      .forEach((member) => {
        const label = (member?.nome_exibicao ?? '').trim();
        if (!label || !member?.user_id) return;
        const key = normalizeSearchTerm(label);
        if (seenNames.has(key)) return;
        seenNames.add(key);
        const memberProfile = memberByUserId.get(member.user_id);
        const institutional = institutionalByName.get(key);
        const persistedRole = member.cargo || undefined;
        const displayRole = member.cargo || memberProfile?.cargo || member.role || undefined;
        const contexts = new Set<string>();
        if (memberProfile?.commission_nome) contexts.add(memberProfile.commission_nome);
        institutional?.unitNames.forEach((unitName) => contexts.add(unitName));
        options.push({
          id: member.user_id as string,
          label,
          // `hint` is persisted as the event relationship role; keep the existing contract.
          hint: persistedRole,
          description: displayRole || 'Membro do sistema',
          context: contexts.size > 0 ? Array.from(contexts).join(' · ') : 'Membro do sistema',
          searchText: [member.role, memberProfile?.role, ...(institutional?.roles ?? [])].filter(Boolean).join(' '),
          group: 'Membros do sistema',
        });
      });

    institutionalByName.forEach((person, key) => {
      if (seenNames.has(key)) return;
      seenNames.add(key);
      const unitNames = Array.from(person.unitNames);
      const roles = Array.from(person.roles);
      options.push({
        id: person.userId ?? `custom:${person.label.toLocaleLowerCase('pt-BR')}`,
        label: person.label,
        // Preserve the existing persisted fallback role for institutional names.
        hint: person.firstUnitName,
        description: roles.join(' · ') || 'Responsável institucional',
        context: unitNames.join(' · '),
        searchText: [...unitNames, ...roles].join(' '),
        group: 'Responsáveis institucionais',
      });
    });

    return options;
  }, [loginMembers, members, units]);

  const linkedUnitIds = useMemo(
    () => (form.commissionsRel ?? []).map((link) => link.commissionId).filter(Boolean) as string[],
    [form.commissionsRel],
  );
  const commissionOptions = useMemo(
    () => selectableOrgUnits(units, linkedUnitIds).map((unit) => ({
      id: unit.id,
      label: unit.name,
      // `hint` participates in the existing persistence fallback; preserve it byte-for-byte.
      hint: orgUnitHint(unit),
      description: orgUnitHint(unit),
      context: unit.isLegacy ? 'Registro histórico' : 'Área institucional oficial',
      searchText: unit.responsibles.map((person) => person.displayName).join(' '),
      group: orgUnitGroupLabel(unit.type),
    })),
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
      commissionsRel: selectionsToCommissionLinks(commissionSelections, commissions),
      responsiblesRel: selectionsToResponsibleLinks(responsibleSelections),
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
                const reconciled = next.map((selection) => {
                  if (!selection.id.startsWith('custom:') && !selection.id.startsWith('external:')) return selection;
                  const match = responsibleOptions.find(
                    (option) => normalizeSearchTerm(option.label) === normalizeSearchTerm(selection.label),
                  );
                  return match ? { ...selection, id: match.id, hint: selection.hint ?? match.hint } : selection;
                });
                const seen = new Set<string>();
                const unique = reconciled.filter((selection) => {
                  const key = normalizeSearchTerm(selection.label);
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
                update('responsiblesRel', selectionsToResponsibleLinks(unique));
              }}
              allowCustom
              isLoading={membersLoading || isLoadingLoginMembers}
              errorMessage={
                loginMembersError || membersError
                  ? 'Tente novamente em instantes.'
                  : null
              }
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
