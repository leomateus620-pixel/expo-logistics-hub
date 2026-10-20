import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  Coins,
  RotateCcw,
  Clock3,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  budgetTotal,
  formatBRL,
  formatCurrencyInput,
  parseCurrencyDigits,
  sortActionsByTime,
} from './planBuilderUtils';
import { statusLabels } from '@/components/cronograma-eventos/cronogramaData';
import { RelationalMultiSelect } from '@/components/cronograma-eventos/RelationalMultiSelect';
import {
  buildCommissionOptions,
  commissionLinksToSelections,
  reconcileResponsibleSelections,
  responsibleLinksToSelections,
  selectionsToCommissionLinks,
  selectionsToResponsibleLinks,
  useCronogramaRelationOptions,
} from '@/components/cronograma-eventos/useCronogramaRelationOptions';
import { ORG_UNIT_SELECT_LABEL } from '@/lib/org-units';
import type {
  CronogramaStatus,
  CronogramaSubevent,
  CronogramaSubeventAction,
  CronogramaSubeventBudgetItem,
  CronogramaSubeventGuest,
  CronogramaSubeventPlanDraft,
  CronogramaSubeventProvision,
} from '@/components/cronograma-eventos/types';

const editableStatuses: CronogramaStatus[] = [
  'planned',
  'in_progress',
  'in_definition',
  'blocked',
  'completed',
  'cancelled',
];

const provisionTemplates = [
  'Convites',
  'Cerimonial',
  'Som e iluminação',
  'Estrutura e montagem',
  'Recepção e credenciamento',
  'Coffee break',
  'Segurança',
  'Limpeza',
  'Sinalização',
  'Imprensa e registro fotográfico',
];

const guestTemplates = [
  'Autoridades',
  'Imprensa',
  'Patrocinadores',
  'Diretoria',
  'Comissões',
  'Expositores',
  'Convidados especiais',
];

function emptyPlanItem(defaultDate: string | null): CronogramaSubeventPlanDraft {
  return {
    title: '',
    description: '',
    date: defaultDate,
    startTime: '',
    endTime: '',
    status: 'planned',
    responsible: '',
    commissionSlug: '',
    commissionsRel: [],
    responsiblesRel: [],
    actions: [],
    provisions: [],
    budget: [],
    guests: [],
  };
}

function planItemFromSubevent(subevent: CronogramaSubevent, defaultDate: string | null): CronogramaSubeventPlanDraft {
  return {
    id: subevent.id,
    title: subevent.title,
    description: subevent.description ?? '',
    date: subevent.date ?? defaultDate,
    startTime: subevent.startTime ?? '',
    endTime: subevent.endTime ?? '',
    status: subevent.status ?? 'planned',
    responsible: subevent.owner ?? '',
    commissionSlug: subevent.commissionSlug ?? '',
    commissionsRel: subevent.commissionsRel?.length
      ? subevent.commissionsRel.map((link) => ({ ...link }))
      : (subevent.commissionSlug || subevent.commission
        ? [{
          commissionId: null,
          commissionSlug: subevent.commissionSlug ?? null,
          commissionName: subevent.commission ?? subevent.commissionSlug ?? null,
          isPrimary: true,
        }]
        : []),
    responsiblesRel: subevent.responsiblesRel?.length
      ? subevent.responsiblesRel.map((link) => ({ ...link }))
      : (subevent.owner?.trim()
        ? [{
          userId: null,
          name: subevent.owner.trim(),
          role: null,
          isPrimary: true,
          responsibleType: 'external' as const,
        }]
        : []),
    actions: (subevent.actions ?? []).map((action) => ({ ...action })),
    provisions: (subevent.provisions ?? []).map((provision) => ({ ...provision })),
    guests: (subevent.guests ?? []).map((guest) => ({ ...guest })),
    budget: (subevent.budget ?? []).map((line) => ({ ...line })),
  };
}

export function SubeventPlanBuilder({
  connectedTo,
  defaultDate = null,
  initialSubevents,
  mode = 'create',
  draftKey,
  onSubmit,
  onCancel,
}: {
  connectedTo: string;
  defaultDate?: string | null;
  initialSubevents?: CronogramaSubevent[];
  mode?: 'create' | 'edit';
  /** Stable key used to keep unsaved edits on this device. */
  draftKey?: string;
  onSubmit: (items: CronogramaSubeventPlanDraft[]) => Promise<void> | void;
  onCancel: () => void;
}) {
  const instanceId = useId().replace(/:/g, '');
  const {
    units,
    commissions,
    responsibleOptions,
    commissionsLoading,
    commissionsError,
    membersLoading,
    membersError,
  } = useCronogramaRelationOptions();
  const initialItems = useMemo(() => {
    if (initialSubevents && initialSubevents.length > 0) {
      return initialSubevents.map((subevent) => planItemFromSubevent(subevent, defaultDate));
    }
    return [emptyPlanItem(defaultDate)];
  }, [defaultDate, initialSubevents]);

  const storageKey = draftKey ? `cronograma-plan-draft:${draftKey}` : null;
  const baseline = useMemo(() => JSON.stringify(initialItems), [initialItems]);
  const restoredDraft = useMemo<CronogramaSubeventPlanDraft[] | null>(() => {
    if (!storageKey || typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { items?: CronogramaSubeventPlanDraft[] };
      return Array.isArray(parsed.items) && parsed.items.length ? parsed.items.map((item) => ({ ...item, budget: item.budget ?? [] })) : null;
    } catch {
      return null;
    }
    // Only read once per opened builder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const [items, setItems] = useState<CronogramaSubeventPlanDraft[]>(() => restoredDraft ?? initialItems);
  const [draftRestored, setDraftRestored] = useState(Boolean(restoredDraft));
  const [openIndex, setOpenIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const touchedRef = useRef(Boolean(restoredDraft));
  const dirty = JSON.stringify(items) !== baseline;

  // Background refreshes only replace the form while the user has not edited anything.
  useEffect(() => {
    if (touchedRef.current) return;
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    if (!storageKey || !touchedRef.current) return;
    try {
      if (dirty) window.localStorage.setItem(storageKey, JSON.stringify({ items, savedAt: Date.now() }));
      else window.localStorage.removeItem(storageKey);
    } catch { /* storage unavailable */ }
  }, [items, dirty, storageKey]);

  const clearDraft = () => {
    if (!storageKey) return;
    try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
  };

  const updateItems: typeof setItems = (value) => {
    touchedRef.current = true;
    setItems(value);
  };

  const discardDraft = () => {
    clearDraft();
    touchedRef.current = false;
    setDraftRestored(false);
    setItems(initialItems);
  };

  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmLeave(true);
    else { clearDraft(); onCancel(); }
  };

  const linkedUnitIds = useMemo(
    () => Array.from(new Set(
      items.flatMap((item) => (item.commissionsRel ?? [])
        .map((link) => link.commissionId)
        .filter((id): id is string => Boolean(id))),
    )),
    [items],
  );
  const commissionOptions = useMemo(
    () => buildCommissionOptions(units, linkedUnitIds),
    [units, linkedUnitIds],
  );

  const fieldId = (name: string) => `${instanceId}-${name}`;

  const patchItem = (index: number, patch: Partial<CronogramaSubeventPlanDraft>) => {
    updateItems((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  };

  const addSubevent = () => {
    updateItems((current) => [...current, emptyPlanItem(defaultDate)]);
    setOpenIndex(items.length);
  };

  const removeSubevent = (index: number) => {
    updateItems((current) => (current.length === 1 ? current : current.filter((_, position) => position !== index)));
    setOpenIndex(0);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const invalid = items.findIndex((item) => !item.title.trim());
    if (invalid >= 0) {
      setOpenIndex(invalid);
      setError('Informe o título de todos os subeventos do plano.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(items.map((item) => ({
        ...item,
        title: item.title.trim(),
        description: item.description.trim(),
        responsible: item.responsible.trim(),
        actions: sortActionsByTime(item.actions.filter((action) => action.title.trim())),
        budget: (item.budget ?? []).filter((line) => line.item.trim()),
        provisions: item.provisions.filter((provision) => provision.description.trim()),
        guests: item.guests.filter((guest) => guest.name.trim()),
      })));
      clearDraft();
      touchedRef.current = false;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível salvar o planejamento.');
    } finally {
      setSaving(false);
    }
  };

  const totals = items.reduce(
    (accumulator, item) => ({
      actions: accumulator.actions + item.actions.filter((action) => action.title.trim()).length,
      provisions: accumulator.provisions + item.provisions.filter((provision) => provision.description.trim()).length,
      guests: accumulator.guests + item.guests.filter((guest) => guest.name.trim()).length,
      budget: accumulator.budget + budgetTotal(item.budget),
    }),
    { actions: 0, provisions: 0, guests: 0, budget: 0 },
  );

  return (
    <form
      className="cronograma-plan-builder"
      data-testid="subevent-plan-builder"
      onSubmit={handleSubmit}
      noValidate
    >
      <header className="cronograma-plan-builder-head">
        <span className="cronograma-plan-builder-icon" aria-hidden="true"><ClipboardList /></span>
        <div className="min-w-0">
          <h3>{mode === 'create' ? 'Planejamento do evento' : 'Editar planejamento'}</h3>
          <span>Evento principal: {connectedTo}</span>
        </div>
        <button
          type="button"
          className="cronograma-thought-close focus-ring"
          onClick={requestClose}
          disabled={saving}
          aria-label="Fechar planejamento"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <p className="cronograma-plan-builder-summary">
        {items.length} {items.length === 1 ? 'subevento' : 'subeventos'} · {totals.actions} ações · {totals.provisions} providências · {totals.guests} convidados
        {totals.budget > 0 && <> · <strong>{formatBRL(totals.budget)}</strong></>}
      </p>

      {draftRestored && dirty && (
        <div className="cronograma-plan-draft-notice" role="status">
          <RotateCcw aria-hidden="true" />
          <span>Rascunho não salvo restaurado. Salve para gravar no evento.</span>
          <button type="button" className="focus-ring" onClick={discardDraft}>Descartar</button>
        </div>
      )}

      <div className="cronograma-plan-builder-list">
        {items.map((item, index) => {
          const open = openIndex === index;
          return (
            <section key={item.id ?? `plan-item-${index}`} className="cronograma-plan-card" data-open={open || undefined}>
              <button
                type="button"
                className="cronograma-plan-card-toggle focus-ring"
                onClick={() => setOpenIndex(open ? -1 : index)}
                aria-expanded={open}
              >
                <span className="cronograma-plan-card-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="cronograma-plan-card-title">
                  <strong>{item.title.trim() || 'Novo subevento'}</strong>
                  <small>
                    {item.actions.length} ações · {item.provisions.length} providências · {item.guests.length} convidados
                    {budgetTotal(item.budget) > 0 ? ` · ${formatBRL(budgetTotal(item.budget))}` : ''}
                  </small>
                </span>
                <ChevronDown className="cronograma-plan-card-chevron" aria-hidden="true" />
              </button>

              {open && (
                <div className="cronograma-plan-card-body">
                  <div className="cronograma-thought-fields">
                    <div className="cronograma-thought-field is-wide">
                      <Label htmlFor={fieldId(`title-${index}`)}>Título do subevento</Label>
                      <Input
                        id={fieldId(`title-${index}`)}
                        value={item.title}
                        onChange={(event) => patchItem(index, { title: event.target.value })}
                        placeholder="Ex.: Abertura oficial"
                      />
                    </div>

                    <div className="cronograma-thought-field is-wide">
                      <Label htmlFor={fieldId(`description-${index}`)}>Descrição</Label>
                      <Textarea
                        id={fieldId(`description-${index}`)}
                        rows={2}
                        value={item.description}
                        onChange={(event) => patchItem(index, { description: event.target.value })}
                        placeholder="Objetivo, público e observações"
                      />
                    </div>

                    <div className="cronograma-thought-field">
                      <Label htmlFor={fieldId(`date-${index}`)} className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Data
                      </Label>
                      <Input
                        id={fieldId(`date-${index}`)}
                        type="date"
                        value={item.date ?? ''}
                        onChange={(event) => patchItem(index, { date: event.target.value || null })}
                      />
                    </div>

                    <div className="cronograma-thought-field">
                      <Label htmlFor={fieldId(`start-${index}`)}>Início</Label>
                      <Input
                        id={fieldId(`start-${index}`)}
                        type="time"
                        value={item.startTime ?? ''}
                        onChange={(event) => patchItem(index, { startTime: event.target.value })}
                      />
                    </div>

                    <div className="cronograma-thought-field">
                      <Label htmlFor={fieldId(`end-${index}`)}>Fim</Label>
                      <Input
                        id={fieldId(`end-${index}`)}
                        type="time"
                        value={item.endTime ?? ''}
                        onChange={(event) => patchItem(index, { endTime: event.target.value })}
                      />
                    </div>

                    <div className="cronograma-thought-field">
                      <Label htmlFor={fieldId(`status-${index}`)}>Status</Label>
                      <select
                        id={fieldId(`status-${index}`)}
                        className="cronograma-thought-select focus-ring"
                        value={item.status}
                        onChange={(event) => patchItem(index, { status: event.target.value as CronogramaStatus })}
                      >
                        {editableStatuses.map((status) => (
                          <option key={status} value={status}>{statusLabels[status]}</option>
                        ))}
                      </select>
                    </div>

                    <div className="cronograma-thought-field cronograma-plan-relations">
                      <RelationalMultiSelect
                        label={ORG_UNIT_SELECT_LABEL}
                        placeholder="Buscar comissão, assessoria ou responsável"
                        triggerLabel="Selecionar comissão ou assessoria"
                        selectedTriggerLabel="Adicionar ou alterar áreas"
                        emptyLabel="Nenhuma área vinculada."
                        options={commissionOptions}
                        value={commissionLinksToSelections(item.commissionsRel)}
                        onChange={(next) => {
                          const links = selectionsToCommissionLinks(next, commissions);
                          const primary = links.find((link) => link.isPrimary) ?? links[0];
                          patchItem(index, {
                            commissionsRel: links,
                            commissionSlug: primary?.commissionSlug ?? '',
                          });
                        }}
                        isLoading={commissionsLoading}
                        errorMessage={commissionsError ? 'Tente novamente em instantes.' : null}
                        primaryLabel="Comissão principal"
                        variant="organization"
                      />
                    </div>

                    <div className="cronograma-thought-field cronograma-plan-relations">
                      <RelationalMultiSelect
                        label="Responsáveis do subevento"
                        placeholder="Buscar pessoa por nome ou função"
                        triggerLabel="Selecionar responsáveis"
                        selectedTriggerLabel="Adicionar ou alterar responsáveis"
                        emptyLabel="Nenhum responsável vinculado."
                        options={responsibleOptions}
                        value={responsibleLinksToSelections(item.responsiblesRel)}
                        onChange={(next) => {
                          const links = selectionsToResponsibleLinks(
                            reconcileResponsibleSelections(next, responsibleOptions),
                          );
                          const primary = links.find((link) => link.isPrimary) ?? links[0];
                          patchItem(index, {
                            responsiblesRel: links,
                            responsible: primary?.name ?? '',
                          });
                        }}
                        allowCustom
                        isLoading={membersLoading}
                        errorMessage={membersError ? 'Tente novamente em instantes.' : null}
                        primaryLabel="Responsável principal"
                        variant="person"
                      />
                    </div>
                  </div>

                  <PlanActionsSection
                    actions={item.actions}
                    onChange={(actions) => patchItem(index, { actions })}
                  />

                  <PlanProvisionsSection
                    provisions={item.provisions}
                    onChange={(provisions) => patchItem(index, { provisions })}
                  />

                  <PlanBudgetSection
                    budget={item.budget ?? []}
                    onChange={(budget) => patchItem(index, { budget })}
                  />

                  <PlanGuestsSection
                    guests={item.guests}
                    onChange={(guests) => patchItem(index, { guests })}
                  />

                  {items.length > 1 && (
                    <div className="cronograma-plan-card-footer">
                      <Button
                        type="button"
                        variant="ghost"
                        className="rounded-xl text-destructive"
                        onClick={() => removeSubevent(index)}
                        disabled={saving}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover subevento do plano
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <button type="button" className="cronograma-plan-add focus-ring" onClick={addSubevent} disabled={saving}>
        <Plus aria-hidden="true" /> Adicionar outro subevento ao plano
      </button>

      {error && <p className="cronograma-thought-submit-error" role="alert">{error}</p>}

      <div className="cronograma-thought-actions">
        <Button type="button" variant="ghost" onClick={requestClose} disabled={saving} className="rounded-xl">
          Cancelar
        </Button>
        <Button type="submit" disabled={saving} className="rounded-xl">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Salvando plano…' : 'Salvar planejamento'}
        </Button>
      </div>

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Há alterações não salvas</AlertDialogTitle>
            <AlertDialogDescription>
              Você pode manter o rascunho neste aparelho e continuar depois, ou descartar as alterações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => { clearDraft(); touchedRef.current = false; onCancel(); }}
            >
              Descartar alterações
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => onCancel()}>Manter rascunho</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function SectionHeading({ icon: Icon, title, hint }: { icon: typeof Clock3; title: string; hint: string }) {
  return (
    <div className="cronograma-plan-section-head">
      <span aria-hidden="true"><Icon /></span>
      <div>
        <strong>{title}</strong>
        <small>{hint}</small>
      </div>
    </div>
  );
}

function PlanActionsSection({
  actions,
  onChange,
}: {
  actions: CronogramaSubeventAction[];
  onChange: (actions: CronogramaSubeventAction[]) => void;
}) {
  const [movedKey, setMovedKey] = useState<string | null>(null);
  const keysRef = useRef<WeakMap<CronogramaSubeventAction, string>>(new WeakMap());
  const counterRef = useRef(0);
  const keyOf = (action: CronogramaSubeventAction) => {
    if (action.id) return action.id;
    let key = keysRef.current.get(action);
    if (!key) { key = `new-${counterRef.current++}`; keysRef.current.set(action, key); }
    return key;
  };
  const patch = (index: number, value: Partial<CronogramaSubeventAction>) => {
    onChange(actions.map((action, position) => {
      if (position !== index) return action;
      const next = { ...action, ...value };
      if (!action.id) keysRef.current.set(next, keyOf(action));
      return next;
    }));
  };
  const reorder = (index: number) => {
    const target = actions[index];
    if (!target) return;
    const key = keyOf(target);
    const sorted = sortActionsByTime(actions);
    sorted.forEach((action, position) => {
      const original = actions.find((candidate) => candidate.title === action.title && candidate.startTime === action.startTime && !sorted.slice(0, position).some((prev) => keysRef.current.get(prev) === keyOf(candidate)));
      if (original && !original.id) keysRef.current.set(action, keyOf(original));
    });
    const newIndex = sorted.findIndex((action) => keyOf(action) === key);
    if (sorted.some((action, position) => keyOf(action) !== keyOf(actions[position]))) {
      onChange(sorted);
      if (newIndex !== index) {
        setMovedKey(key);
        window.setTimeout(() => setMovedKey((current) => (current === key ? null : current)), 1400);
      }
    }
  };
  return (
    <section className="cronograma-plan-section">
      <SectionHeading icon={Clock3} title="Ações programadas" hint="Roteiro por horário (recepção, abertura, encerramento…)" />
      <ul className="cronograma-plan-rows">
        {actions.map((action, index) => (
          <li key={keyOf(action)} className="cronograma-plan-row" data-moved={movedKey === keyOf(action) || undefined}>
            <Input
              type="time"
              className="cronograma-plan-row-time"
              value={action.startTime ?? ''}
              onChange={(event) => patch(index, { startTime: event.target.value })}
              onBlur={() => reorder(index)}
              aria-label={`Horário da ação ${index + 1}`}
            />
            <Input
              value={action.title}
              onChange={(event) => patch(index, { title: event.target.value })}
              placeholder="Ex.: Recepção das autoridades"
              aria-label={`Ação ${index + 1}`}
            />
            <Input
              value={action.responsibleName ?? ''}
              onChange={(event) => patch(index, { responsibleName: event.target.value })}
              placeholder="Responsável"
              aria-label={`Responsável da ação ${index + 1}`}
            />
            <button
              type="button"
              className="cronograma-plan-row-remove focus-ring"
              onClick={() => onChange(actions.filter((_, position) => position !== index))}
              aria-label={`Remover ação ${index + 1}`}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="cronograma-plan-row-add focus-ring"
        onClick={() => onChange([...actions, { title: '', startTime: '', responsibleName: '', sortOrder: actions.length }])}
      >
        <Plus aria-hidden="true" /> Adicionar ação
      </button>
    </section>
  );
}

function PlanBudgetSection({
  budget,
  onChange,
}: {
  budget: CronogramaSubeventBudgetItem[];
  onChange: (budget: CronogramaSubeventBudgetItem[]) => void;
}) {
  const patch = (index: number, value: Partial<CronogramaSubeventBudgetItem>) => {
    onChange(budget.map((line, position) => (position === index ? { ...line, ...value } : line)));
  };
  const total = budgetTotal(budget);
  return (
    <section className="cronograma-plan-section cronograma-plan-budget">
      <SectionHeading icon={Coins} title="Valor e custo do evento" hint="Orçamento por produto/serviço e fornecedor" />
      {budget.length > 0 && (
        <div className="cronograma-plan-budget-head" aria-hidden="true">
          <span>Produto / serviço</span>
          <span>Fornecedor</span>
          <span className="is-num">Valor</span>
          <span />
        </div>
      )}
      <ul className="cronograma-plan-rows">
        {budget.map((line, index) => (
          <li key={line.id ?? `budget-${index}`} className="cronograma-plan-row cronograma-plan-budget-row">
            <Input
              value={line.item}
              onChange={(event) => patch(index, { item: event.target.value })}
              placeholder="Ex.: Coffee break"
              aria-label={`Produto ou serviço ${index + 1}`}
            />
            <Input
              value={line.supplier ?? ''}
              onChange={(event) => patch(index, { supplier: event.target.value })}
              placeholder="Fornecedor"
              aria-label={`Fornecedor ${index + 1}`}
            />
            <div className="cronograma-plan-budget-amount">
              <span aria-hidden="true">R$</span>
              <Input
                inputMode="numeric"
                value={formatCurrencyInput(line.amount)}
                onChange={(event) => patch(index, { amount: parseCurrencyDigits(event.target.value) })}
                placeholder="0,00"
                aria-label={`Valor ${index + 1}`}
              />
            </div>
            <button
              type="button"
              className="cronograma-plan-row-remove focus-ring"
              onClick={() => onChange(budget.filter((_, position) => position !== index))}
              aria-label={`Remover item ${index + 1} do orçamento`}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className="cronograma-plan-budget-foot">
        <button
          type="button"
          className="cronograma-plan-row-add focus-ring"
          onClick={() => onChange([...budget, { item: '', supplier: '', amount: 0, sortOrder: budget.length }])}
        >
          <Plus aria-hidden="true" /> Adicionar item
        </button>
        <div className="cronograma-plan-budget-total" aria-live="polite">
          <small>Valor total</small>
          <strong>{formatBRL(total)}</strong>
        </div>
      </div>
    </section>
  );
}

function PlanProvisionsSection({
  provisions,
  onChange,
}: {
  provisions: CronogramaSubeventProvision[];
  onChange: (provisions: CronogramaSubeventProvision[]) => void;
}) {
  const patch = (index: number, value: Partial<CronogramaSubeventProvision>) => {
    onChange(provisions.map((provision, position) => (position === index ? { ...provision, ...value } : provision)));
  };
  const addTemplate = (description: string) => {
    if (provisions.some((provision) => provision.description.toLowerCase() === description.toLowerCase())) return;
    onChange([...provisions, { description, responsibleName: '', sortOrder: provisions.length }]);
  };
  return (
    <section className="cronograma-plan-section">
      <SectionHeading icon={CheckSquare} title="Estrutura e providências" hint="Checklist operacional com responsável" />
      <div className="cronograma-plan-templates">
        {provisionTemplates.map((template) => (
          <button key={template} type="button" className="focus-ring" onClick={() => addTemplate(template)}>
            <Plus aria-hidden="true" /> {template}
          </button>
        ))}
      </div>
      <ul className="cronograma-plan-rows">
        {provisions.map((provision, index) => (
          <li key={provision.id ?? `provision-${index}`} className="cronograma-plan-row">
            <label className="cronograma-plan-row-check">
              <input
                type="checkbox"
                checked={provision.isDone ?? false}
                onChange={(event) => patch(index, { isDone: event.target.checked })}
                aria-label={`Concluir providência ${index + 1}`}
              />
            </label>
            <Input
              value={provision.description}
              onChange={(event) => patch(index, { description: event.target.value })}
              placeholder="Ex.: Convites"
              aria-label={`Providência ${index + 1}`}
            />
            <Input
              value={provision.responsibleName ?? ''}
              onChange={(event) => patch(index, { responsibleName: event.target.value })}
              placeholder="Responsável"
              aria-label={`Responsável da providência ${index + 1}`}
            />
            <button
              type="button"
              className="cronograma-plan-row-remove focus-ring"
              onClick={() => onChange(provisions.filter((_, position) => position !== index))}
              aria-label={`Remover providência ${index + 1}`}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="cronograma-plan-row-add focus-ring"
        onClick={() => onChange([...provisions, { description: '', responsibleName: '', sortOrder: provisions.length }])}
      >
        <Plus aria-hidden="true" /> Adicionar providência
      </button>
    </section>
  );
}

function PlanGuestsSection({
  guests,
  onChange,
}: {
  guests: CronogramaSubeventGuest[];
  onChange: (guests: CronogramaSubeventGuest[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [category, setCategory] = useState('');

  const commit = () => {
    const name = draft.trim();
    if (!name) return;
    onChange([...guests, { name, category: category || null, sortOrder: guests.length }]);
    setDraft('');
  };

  return (
    <section className="cronograma-plan-section">
      <SectionHeading icon={Users} title="Convidados" hint="Grupos e nomes que devem ser comunicados" />
      <div className="cronograma-plan-templates">
        {guestTemplates.map((template) => (
          <button
            key={template}
            type="button"
            className="focus-ring"
            data-active={category === template || undefined}
            onClick={() => setCategory((current) => (current === template ? '' : template))}
          >
            <Sparkles aria-hidden="true" /> {template}
          </button>
        ))}
      </div>
      <div className="cronograma-plan-row">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
          }}
          placeholder={category ? `Nome do convidado (${category})` : 'Nome do convidado ou grupo'}
          aria-label="Novo convidado"
        />
        <button type="button" className="cronograma-plan-row-add is-inline focus-ring" onClick={commit}>
          <Plus aria-hidden="true" /> Incluir
        </button>
      </div>
      {guests.length > 0 && (
        <ul className="cronograma-plan-chips">
          {guests.map((guest, index) => (
            <li key={guest.id ?? `guest-${index}`}>
              <span>{guest.name}</span>
              {guest.category && <small>{guest.category}</small>}
              <button
                type="button"
                className="focus-ring"
                onClick={() => onChange(guests.filter((_, position) => position !== index))}
                aria-label={`Remover convidado ${guest.name}`}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
