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
import { useAuth } from '@/hooks/useAuth';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { OrgUnitSummary } from '@/components/org-units/OrgUnitSelect';
import {
  ORG_UNIT_SELECT_LABEL,
  orgUnitGroupLabel,
  orgUnitHint,
  selectableOrgUnits,
} from '@/lib/org-units';
import { categoryLabels, priorityLabels, statusLabels } from './cronogramaData';
import { CronogramaSubeventForm } from './CronogramaSubeventForm';
import { RelationalMultiSelect, type RelationalSelection } from './RelationalMultiSelect';
import { normalizeSearchTerm } from '@/lib/org-units';
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
  const { units, commissions, isLoading: commissionsLoading } = useOrgCommissions();
  const { user } = useAuth();
  const { members, loginMembers } = useOrgMembers();
  const currentUserName = useMemo(() => {
    if (!user) return '';
    const member = ([...(loginMembers ?? []), ...(members ?? [])] as any[]).find((item: any) => item.user_id === user.id);
    return (
      member?.nome_exibicao
      || (user.user_metadata as any)?.full_name
      || (user.user_metadata as any)?.name
      || user.email
      || ''
    );
  }, [members, user]);
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
      if (!next.owner?.trim()) next.owner = currentUserName;
      if (!(next.responsiblesRel ?? []).length) {
        next.responsiblesRel = [
          {
            userId: user?.id ?? null,
            name: currentUserName,
            role: null,
            isPrimary: true,
            responsibleType: user?.id ? 'member' : 'external',
          },
        ];
      }
      return next;
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
    const options: Array<{ id: string; label: string; hint?: string; group?: string }> = [];
    const seenNames = new Set<string>();

    (members ?? []).forEach((member: any) => {
      const label = (member?.nome_exibicao ?? '').trim();
      if (!label || !member?.user_id) return;
      const key = normalizeSearchTerm(label);
      if (seenNames.has(key)) return;
      seenNames.add(key);
      options.push({
        id: member.user_id as string,
        label,
        hint: member.cargo || member.commission_nome || undefined,
        group: 'Membros do sistema',
      });
    });

    units.forEach((unit) => {
      unit.responsibles.forEach((person) => {
        const label = (person.displayName ?? '').trim();
        if (!label) return;
        const key = normalizeSearchTerm(label);
        if (seenNames.has(key)) return;
        seenNames.add(key);
        options.push({
          id: person.userId ?? `custom:${label.toLocaleLowerCase('pt-BR')}`,
          label,
          hint: unit.name,
          group: 'Responsáveis institucionais',
        });
      });
    });

    return options;
  }, [members, units]);

  const linkedUnitIds = useMemo(
    () => (form.commissionsRel ?? []).map((link) => link.commissionId).filter(Boolean) as string[],
    [form.commissionsRel],
  );
  const commissionOptions = useMemo(
    () => selectableOrgUnits(units, linkedUnitIds).map((unit) => ({
      id: unit.id,
      label: unit.name,
      hint: orgUnitHint(unit),
      group: orgUnitGroupLabel(unit.type),
    })),
    [units, linkedUnitIds],
  );
  const selectedUnits = useMemo(
    () => linkedUnitIds
      .map((unitId) => units.find((unit) => unit.id === unitId))
      .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit)),
    [linkedUnitIds, units],
  );
  const officialResponsibleNames = useMemo(
    () => Array.from(new Set(selectedUnits.flatMap((unit) => unit.responsibles.map((person) => person.displayName)))),
    [selectedUnits],
  );
  const missingOfficialResponsibles = useMemo(() => {
    const current = new Set(
      (form.responsiblesRel ?? []).map((link) => normalizeSearchTerm(link.name ?? '')),
    );
    return officialResponsibleNames.filter((name) => !current.has(normalizeSearchTerm(name)));
  }, [form.responsiblesRel, officialResponsibleNames]);

  const applyOfficialResponsibles = () => {
    if (missingOfficialResponsibles.length === 0) return;
    const hasPrimary = (form.responsiblesRel ?? []).some((link) => link.isPrimary);
    const confirmed = window.confirm(
      hasPrimary
        ? `Adicionar ${missingOfficialResponsibles.join(', ')} como responsáveis institucionais? O responsável principal atual será mantido.`
        : `Definir ${missingOfficialResponsibles.join(', ')} como responsáveis do evento?`,
    );
    if (!confirmed) return;
    const additions = missingOfficialResponsibles.map((name, index) => ({
      id: `custom:${name.toLocaleLowerCase('pt-BR')}`,
      label: name,
      isPrimary: !hasPrimary && index === 0,
    }));
    update('responsiblesRel', selectionsToResponsibleLinks([...responsibleSelections, ...additions]));
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
              readOnly
              aria-readonly="true"
              tabIndex={-1}
              placeholder="Preenchido automaticamente"
              className="cursor-not-allowed bg-muted/60 text-foreground/80"
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Preenchido automaticamente com o usuário logado.
            </p>
          </div>

        </div>
      </div>

      {showRelational && (
        <div className="cronograma-form-section space-y-4">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-foreground/72">Vínculos relacionais</h3>
          </div>
          <RelationalMultiSelect
            label={ORG_UNIT_SELECT_LABEL}
            placeholder="Buscar por comissão, assessoria ou responsável…"
            emptyLabel="Nenhuma comissão ou assessoria vinculada. Adicione uma ou mais e marque a principal."
            options={commissionOptions}
            value={commissionSelections}
            onChange={(next) => update('commissionsRel', selectionsToCommissionLinks(next, commissions))}
            isLoading={commissionsLoading}
            primaryLabel="Principal"
          />
          {selectedUnits.length > 0 && (
            <div className="space-y-2">
              {selectedUnits.map((unit) => (
                <OrgUnitSummary key={unit.id} unit={unit} />
              ))}
              {missingOfficialResponsibles.length > 0 && (
                <button
                  type="button"
                  onClick={applyOfficialResponsibles}
                  className="rounded-full border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary"
                >
                  Usar responsáveis institucionais ({missingOfficialResponsibles.length})
                </button>
              )}
            </div>
          )}
          <RelationalMultiSelect
            label="Responsáveis do evento"
            placeholder="Buscar pessoa do sistema ou digitar um nome…"
            emptyLabel="Nenhum responsável vinculado. Selecione pessoas do sistema ou digite um nome."
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
            primaryLabel="Principal"
          />

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Os vínculos relacionais são persistidos pelas RPCs oficiais (<code>cronograma_save_event</code>) e complementam
            o campo &quot;Responsável&quot; para eventos já salvos.
          </p>

        </div>
      )}

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
