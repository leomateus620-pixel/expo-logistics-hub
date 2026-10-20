import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import '@/styles/cronograma-plan-editor.css';
import {
  CalendarDays,
  CheckCircle2,
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

function planItemFromSubevent(
  subevent: CronogramaSubevent,
  defaultDate: string | null,
): CronogramaSubeventPlanDraft {
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
      : subevent.commissionSlug || subevent.commission
        ? [
            {
              commissionId: null,
              commissionSlug: subevent.commissionSlug ?? null,
              commissionName: subevent.commission ?? subevent.commissionSlug ?? null,
              isPrimary: true,
            },
          ]
        : [],
    responsiblesRel: subevent.responsiblesRel?.length
      ? subevent.responsiblesRel.map((link) => ({ ...link }))
      : subevent.owner?.trim()
        ? [
            {
              userId: null,
              name: subevent.owner.trim(),
              role: null,
              isPrimary: true,
              responsibleType: 'external' as const,
            },
          ]
        : [],
    actions: (subevent.actions ?? []).map((action) => ({ ...action })),
    provisions: (subevent.provisions ?? []).map((provision) => ({
      ...provision,
    })),
    guests: (subevent.guests ?? []).map((guest) => ({ ...guest })),
    budget: (subevent.budget ?? []).map((line) => ({ ...line })),
  };
}

const editorSections = [
  ['general', 'Dados gerais'],
  ['relations', 'Responsáveis'],
  ['actions', 'Ações programadas'],
  ['provisions', 'Providências'],
  ['budget', 'Orçamento'],
  ['guests', 'Convidados'],
] as const;

/** UI-only keys survive immutable field patches and removal of preceding rows. */
function usePresentationKeys() {
  const keys = useRef(new WeakMap<object, string>());
  const keyFor = (item: object): string => {
    let key = keys.current.get(item);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(item, key);
    }
    return key;
  };
  const replace = <T extends object>(previous: T, next: T): T => {
    keys.current.set(next, keyFor(previous));
    return next;
  };
  return { keyFor, replace };
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
  const returnFocusRef = useRef(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemKeys = usePresentationKeys();
  const visitedItemsRef = useRef(new Set<string>());
  const submittingRef = useRef(false);
  const [activeSection, setActiveSection] = useState('general');
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
      const parsed = JSON.parse(raw) as {
        items?: CronogramaSubeventPlanDraft[];
      };
      return Array.isArray(parsed.items) && parsed.items.length
        ? parsed.items.map((item) => ({ ...item, budget: item.budget ?? [] }))
        : null;
    } catch {
      return null;
    }
    // Only read once per opened builder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const [items, setItems] = useState<CronogramaSubeventPlanDraft[]>(() => restoredDraft ?? initialItems);
  const [draftRestored] = useState(Boolean(restoredDraft));
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
    } catch {
      /* storage unavailable */
    }
  }, [items, dirty, storageKey]);

  const clearDraft = () => {
    if (!storageKey) return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  };

  const updateItems: typeof setItems = (value) => {
    touchedRef.current = true;
    setItems(value);
  };

  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmLeave(true);
    else {
      clearDraft();
      onCancel();
    }
  };

  const linkedUnitIds = useMemo(
    () =>
      Array.from(
        new Set(
          items.flatMap((item) =>
            (item.commissionsRel ?? [])
              .map((link) => link.commissionId)
              .filter((id): id is string => Boolean(id)),
          ),
        ),
      ),
    [items],
  );
  const commissionOptions = useMemo(
    () => buildCommissionOptions(units, linkedUnitIds),
    [units, linkedUnitIds],
  );

  const fieldId = (name: string) => `${instanceId}-${name}`;

  const patchItem = (index: number, patch: Partial<CronogramaSubeventPlanDraft>) => {
    updateItems((current) =>
      current.map((item, position) =>
        position === index ? itemKeys.replace(item, { ...item, ...patch }) : item,
      ),
    );
  };

  const addSubevent = () => {
    updateItems((current) => [...current, emptyPlanItem(defaultDate)]);
    setOpenIndex(items.length);
  };

  const removeSubevent = (index: number) => {
    updateItems((current) =>
      current.length === 1 ? current : current.filter((_, position) => position !== index),
    );
    setOpenIndex(0);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const invalid = items.findIndex((item) => !item.title.trim());
    if (invalid >= 0) {
      setOpenIndex(invalid);
      setError('Informe o título de todos os subeventos do plano.');
      window.requestAnimationFrame(() => document.getElementById(fieldId(`title-${invalid}`))?.focus());
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(
        items.map((item) => ({
          ...item,
          title: item.title.trim(),
          description: item.description.trim(),
          responsible: item.responsible.trim(),
          actions: sortActionsByTime(item.actions.filter((action) => action.title.trim())),
          budget: (item.budget ?? []).filter((line) => line.item.trim()),
          provisions: item.provisions.filter((provision) => provision.description.trim()),
          guests: item.guests.filter((guest) => guest.name.trim()),
        })),
      );
      clearDraft();
      touchedRef.current = false;
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Não foi possível salvar o planejamento.',
      );
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  const totals = useMemo(
    () =>
      items.reduce(
        (accumulator, item) => ({
          actions: accumulator.actions + item.actions.filter((action) => action.title.trim()).length,
          provisions:
            accumulator.provisions +
            item.provisions.filter((provision) => provision.description.trim()).length,
          guests: accumulator.guests + item.guests.filter((guest) => guest.name.trim()).length,
          budget: accumulator.budget + budgetTotal(item.budget),
        }),
        { actions: 0, provisions: 0, guests: 0, budget: 0 },
      ),
    [items],
  );

  const navigateTo = (section: string) => {
    setActiveSection(section);
    const target = document.getElementById(fieldId(`section-${openIndex}-${section}`));
    target?.focus({ preventScroll: true });
    const scrollArea = scrollRef.current;
    if (target && scrollArea) {
      // Scroll only the work area: scrollIntoView also moves fixed modal ancestors.
      scrollArea.scrollTo({
        top:
          target.getBoundingClientRect().top -
          scrollArea.getBoundingClientRect().top +
          scrollArea.scrollTop -
          24,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    }
  };

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="cronograma-plan-editor-overlay" />
        <DialogPrimitive.Content
          className="cronograma-plan-editor"
          aria-modal="true"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            headingRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus({ preventScroll: true });
          }}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <form
            className="cronograma-plan-builder"
            data-testid="subevent-plan-builder"
            onSubmit={handleSubmit}
            noValidate
            aria-busy={saving}
          >
            <header className="cronograma-plan-editor-header">
              <div className="cronograma-plan-editor-header-inner">
                <span className="cronograma-plan-builder-icon" aria-hidden="true">
                  <ClipboardList />
                </span>
                <div className="cronograma-plan-editor-heading">
                  <span className="cronograma-plan-editor-eyebrow">
                    Fenasoja 2028 <span>/</span>{' '}
                    {mode === 'create' ? 'Novo planejamento' : 'Editar planejamento'}
                  </span>
                  <DialogPrimitive.Title asChild>
                    <h2 ref={headingRef} tabIndex={-1}>
                      {items[openIndex]?.title.trim() ||
                        (mode === 'create' ? 'Planejamento do evento' : 'Editar planejamento')}
                    </h2>
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description>Evento principal: {connectedTo}</DialogPrimitive.Description>
                </div>
                <span className="cronograma-plan-editor-state">
                  <span /> Em edição
                </span>
                <button
                  type="button"
                  className="cronograma-thought-close focus-ring"
                  onClick={requestClose}
                  disabled={saving}
                  aria-label="Fechar planejamento"
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              <div className="cronograma-plan-editor-context">
                <div className="cronograma-plan-editor-metrics" aria-label="Resumo do planejamento">
                  <span>
                    <Clock3 aria-hidden="true" />
                    <strong>{totals.actions}</strong> ações
                  </span>
                  <span>
                    <CheckSquare aria-hidden="true" />
                    <strong>{totals.provisions}</strong> providências
                  </span>
                  <span>
                    <Users aria-hidden="true" />
                    <strong>{totals.guests}</strong> convidados
                  </span>
                  <span>
                    <Coins aria-hidden="true" />
                    <strong>{formatBRL(totals.budget)}</strong> em orçamento
                  </span>
                </div>
              </div>
            </header>

            <nav className="cronograma-plan-editor-nav" aria-label="Seções do planejamento">
              <div>
                {editorSections.map(([key, label], index) => (
                  <button
                    key={key}
                    type="button"
                    disabled={openIndex < 0}
                    onClick={() => navigateTo(key)}
                    aria-current={activeSection === key ? 'location' : undefined}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    {label}
                  </button>
                ))}
                <label className="cronograma-plan-editor-mobile-nav">
                  <span>Ir para seção</span>
                  <select
                    aria-label="Ir para seção"
                    value={activeSection}
                    disabled={openIndex < 0}
                    onChange={(event) => navigateTo(event.target.value)}
                  >
                    {editorSections.map(([key, label], index) => (
                      <option key={key} value={key}>
                        {String(index + 1).padStart(2, '0')} · {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </nav>

            <div ref={scrollRef} className="cronograma-plan-editor-scroll">
              <fieldset disabled={saving} className="cronograma-plan-editor-content">
                {draftRestored && dirty && (
                  <div className="cronograma-plan-draft-notice" role="status">
                    <RotateCcw aria-hidden="true" />
                    <span>Rascunho não salvo restaurado. Salve para gravar no evento.</span>
                    <button type="button" className="focus-ring" onClick={() => setConfirmLeave(true)}>
                      Descartar
                    </button>
                  </div>
                )}

                <div className="cronograma-plan-builder-list">
                  {items.map((item, index) => {
                    const open = openIndex === index;
                    const itemKey = item.id ?? itemKeys.keyFor(item);
                    // Mount a subevent on first expansion, then keep its fields alive.
                    if (open) visitedItemsRef.current.add(itemKey);
                    return (
                      <section key={itemKey} className="cronograma-plan-card" data-open={open || undefined}>
                        <button
                          type="button"
                          className="cronograma-plan-card-toggle focus-ring"
                          onClick={() => setOpenIndex(open ? -1 : index)}
                          aria-expanded={open}
                        >
                          <span className="cronograma-plan-card-index">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="cronograma-plan-card-title">
                            <strong>{item.title.trim() || 'Novo subevento'}</strong>
                            <small>
                              {item.actions.length} ações · {item.provisions.length} providências ·{' '}
                              {item.guests.length} convidados
                              {budgetTotal(item.budget) > 0
                                ? ` · ${formatBRL(budgetTotal(item.budget))}`
                                : ''}
                            </small>
                          </span>
                          <ChevronDown className="cronograma-plan-card-chevron" aria-hidden="true" />
                        </button>

                        <div className="cronograma-plan-card-body" hidden={!open}>
                          {visitedItemsRef.current.has(itemKey) && (
                            <>
                              <section
                                className="cronograma-plan-section"
                                id={fieldId(`section-${index}-general`)}
                                tabIndex={-1}
                                aria-label="Identificação do subevento"
                              >
                                <SectionHeading
                                  icon={CalendarDays}
                                  title="Identificação do subevento"
                                  hint="Informações essenciais e período de realização"
                                  number="01"
                                />
                                <div className="cronograma-thought-fields">
                                  <div className="cronograma-thought-field is-wide">
                                    <Label htmlFor={fieldId(`title-${index}`)}>Título do subevento</Label>
                                    <Input
                                      id={fieldId(`title-${index}`)}
                                      value={item.title}
                                      aria-invalid={Boolean(error && !item.title.trim())}
                                      aria-describedby={
                                        error && !item.title.trim() ? fieldId('error') : undefined
                                      }
                                      onChange={(event) =>
                                        patchItem(index, {
                                          title: event.target.value,
                                        })
                                      }
                                      placeholder="Ex.: Abertura oficial"
                                    />
                                  </div>

                                  <div className="cronograma-thought-field is-wide">
                                    <Label htmlFor={fieldId(`description-${index}`)}>Descrição</Label>
                                    <Textarea
                                      id={fieldId(`description-${index}`)}
                                      rows={4}
                                      value={item.description}
                                      onChange={(event) =>
                                        patchItem(index, {
                                          description: event.target.value,
                                        })
                                      }
                                      placeholder="Objetivo, público e observações"
                                    />
                                  </div>

                                  <div className="cronograma-thought-field">
                                    <Label
                                      htmlFor={fieldId(`date-${index}`)}
                                      className="inline-flex items-center gap-1.5"
                                    >
                                      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Data
                                    </Label>
                                    <Input
                                      id={fieldId(`date-${index}`)}
                                      type="date"
                                      value={item.date ?? ''}
                                      onChange={(event) =>
                                        patchItem(index, {
                                          date: event.target.value || null,
                                        })
                                      }
                                    />
                                  </div>

                                  <div className="cronograma-thought-field">
                                    <Label htmlFor={fieldId(`start-${index}`)}>Início</Label>
                                    <Input
                                      id={fieldId(`start-${index}`)}
                                      type="time"
                                      value={item.startTime ?? ''}
                                      onChange={(event) =>
                                        patchItem(index, {
                                          startTime: event.target.value,
                                        })
                                      }
                                    />
                                  </div>

                                  <div className="cronograma-thought-field">
                                    <Label htmlFor={fieldId(`end-${index}`)}>Fim</Label>
                                    <Input
                                      id={fieldId(`end-${index}`)}
                                      type="time"
                                      value={item.endTime ?? ''}
                                      onChange={(event) =>
                                        patchItem(index, {
                                          endTime: event.target.value,
                                        })
                                      }
                                    />
                                  </div>

                                  <div className="cronograma-thought-field">
                                    <Label htmlFor={fieldId(`status-${index}`)}>Status</Label>
                                    <select
                                      id={fieldId(`status-${index}`)}
                                      className="cronograma-thought-select focus-ring"
                                      value={item.status}
                                      onChange={(event) =>
                                        patchItem(index, {
                                          status: event.target.value as CronogramaStatus,
                                        })
                                      }
                                    >
                                      {editableStatuses.map((status) => (
                                        <option key={status} value={status}>
                                          {statusLabels[status]}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </section>
                              <section
                                className="cronograma-plan-section"
                                id={fieldId(`section-${index}-relations`)}
                                tabIndex={-1}
                                aria-label="Comissões e responsáveis"
                              >
                                <SectionHeading
                                  icon={Users}
                                  title="Comissões e responsáveis"
                                  hint="Vínculos oficiais e responsáveis por este subevento"
                                  number="02"
                                />
                                <div className="cronograma-plan-relations-grid">
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
                                      description="Selecione as áreas envolvidas e indique a principal."
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
                                      description="Vincule pessoas e destaque o responsável principal."
                                      variant="person"
                                    />
                                  </div>
                                </div>
                              </section>

                              <PlanActionsSection
                                id={fieldId(`section-${index}-actions`)}
                                actions={item.actions}
                                onChange={(actions) => patchItem(index, { actions })}
                              />

                              <PlanProvisionsSection
                                id={fieldId(`section-${index}-provisions`)}
                                provisions={item.provisions}
                                onChange={(provisions) => patchItem(index, { provisions })}
                              />

                              <PlanBudgetSection
                                id={fieldId(`section-${index}-budget`)}
                                budget={item.budget ?? []}
                                onChange={(budget) => patchItem(index, { budget })}
                              />

                              <PlanGuestsSection
                                id={fieldId(`section-${index}-guests`)}
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
                                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover subevento do
                                    plano
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="cronograma-plan-add focus-ring"
                  onClick={addSubevent}
                  disabled={saving}
                >
                  <Plus aria-hidden="true" /> Adicionar outro subevento ao plano
                </button>
              </fieldset>
            </div>
            <footer className="cronograma-plan-editor-footer">
              <div className="cronograma-plan-editor-footer-inner">
                <div className="cronograma-plan-editor-save-state" role="status" aria-live="polite">
                  {saving ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 aria-hidden="true" />
                  )}
                  <span>
                    {saving
                      ? 'Salvando planejamento…'
                      : dirty
                        ? 'Alterações não salvas'
                        : 'Planejamento sem alterações'}
                    <small>
                      {items.length} {items.length === 1 ? 'subevento no plano' : 'subeventos no plano'}
                      {dirty && storageKey ? ' · Rascunho neste aparelho' : ''}
                    </small>
                  </span>
                </div>
                <div className="cronograma-plan-editor-buttons">
                  <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="h-4 w-4" aria-hidden="true" />
                    )}
                    {saving ? 'Salvando plano…' : 'Salvar planejamento'}
                  </Button>
                </div>
                {error && (
                  <p id={fieldId('error')} className="cronograma-thought-submit-error" role="alert">
                    {error}
                  </p>
                )}
              </div>
            </footer>

            <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
              <AlertDialogContent className="cronograma-plan-leave-dialog">
                <AlertDialogHeader>
                  <AlertDialogTitle>Há alterações não salvas</AlertDialogTitle>
                  <AlertDialogDescription>
                    Você pode manter o rascunho neste aparelho e continuar depois, ou descartar as alterações.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Continuar editando</AlertDialogCancel>
                  <AlertDialogAction
                    className="cronograma-plan-discard"
                    onClick={() => {
                      clearDraft();
                      touchedRef.current = false;
                      onCancel();
                    }}
                  >
                    Descartar alterações
                  </AlertDialogAction>
                  <AlertDialogAction onClick={() => onCancel()}>Manter rascunho</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  hint,
  number,
}: {
  icon: typeof Clock3;
  title: string;
  hint: string;
  number: string;
}) {
  return (
    <div className="cronograma-plan-section-head">
      <span aria-hidden="true">
        <Icon />
      </span>
      <div>
        <h3>
          <small className="cronograma-plan-section-number">{number}</small>
          {title}
        </h3>
        <small>{hint}</small>
      </div>
    </div>
  );
}

function RowField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="cronograma-plan-cell">
      <span className="cronograma-plan-cell-label">{label}</span>
      {children}
    </label>
  );
}

function PlanActionsSection({
  id,
  actions,
  onChange,
}: {
  id: string;
  actions: CronogramaSubeventAction[];
  onChange: (actions: CronogramaSubeventAction[]) => void;
}) {
  const [movedKey, setMovedKey] = useState<string | null>(null);
  const focusFrameRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (focusFrameRef.current !== null) window.cancelAnimationFrame(focusFrameRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!movedKey) return;
    const timer = window.setTimeout(() => setMovedKey(null), 1400);
    return () => window.clearTimeout(timer);
  }, [movedKey]);
  const rowKeys = usePresentationKeys();
  const keyOf = (action: CronogramaSubeventAction) => action.id ?? action.clientKey ?? rowKeys.keyFor(action);
  const patch = (index: number, value: Partial<CronogramaSubeventAction>) => {
    onChange(
      actions.map((action, position) =>
        position === index ? rowKeys.replace(action, { ...action, ...value }) : action,
      ),
    );
  };
  const reorder = (index: number, nextFocus: EventTarget | null) => {
    const target = actions[index];
    if (!target) return;
    const withKeys = actions.map((action) =>
      action.id || action.clientKey ? action : { ...action, clientKey: rowKeys.keyFor(action) },
    );
    const key = keyOf(withKeys[index]);
    const sorted = sortActionsByTime(withKeys);
    const newIndex = sorted.findIndex((action) => keyOf(action) === key);
    if (newIndex === index) return;
    onChange(sorted);
    setMovedKey(key);
    // Browsers may blur a focused element when React moves its keyed row.
    // Restore the intended destination after the native focus transfer finishes.
    if (focusFrameRef.current !== null) window.cancelAnimationFrame(focusFrameRef.current);
    if (nextFocus instanceof HTMLElement) {
      focusFrameRef.current = window.requestAnimationFrame(() => {
        focusFrameRef.current = null;
        if (nextFocus.isConnected) nextFocus.focus({ preventScroll: true });
      });
    }
  };
  return (
    <section id={id} tabIndex={-1} aria-label="Ações programadas" className="cronograma-plan-section">
      <SectionHeading
        number="03"
        icon={Clock3}
        title="Ações programadas"
        hint="Roteiro organizado automaticamente ao sair do horário"
      />
      <div className="cronograma-plan-columns cronograma-plan-action-columns" aria-hidden="true">
        <span>Horário</span>
        <span>Descrição da ação</span>
        <span>Responsável</span>
        <span>Ações</span>
      </div>
      {actions.length === 0 && (
        <p className="cronograma-plan-empty">Adicione as ações para organizar o roteiro deste subevento.</p>
      )}
      <ul className="cronograma-plan-rows">
        {actions.map((action, index) => (
          <li
            key={keyOf(action)}
            className="cronograma-plan-row cronograma-plan-action-row"
            data-moved={movedKey === keyOf(action) || undefined}
          >
            <RowField label="Horário">
              <Input
                type="time"
                className="cronograma-plan-row-time"
                value={action.startTime ?? ''}
                onChange={(event) => patch(index, { startTime: event.target.value })}
                onBlur={(event) => reorder(index, event.relatedTarget)}
                aria-label={`Horário da ação ${index + 1}`}
              />
            </RowField>
            <RowField label="Descrição da ação">
              <Textarea
                rows={1}
                value={action.title}
                onChange={(event) => patch(index, { title: event.target.value })}
                placeholder="Ex.: Recepção das autoridades"
                aria-label={`Ação ${index + 1}`}
              />
            </RowField>
            <RowField label="Responsável">
              <Textarea
                rows={1}
                value={action.responsibleName ?? ''}
                onChange={(event) => patch(index, { responsibleName: event.target.value })}
                placeholder="Responsável"
                aria-label={`Responsável da ação ${index + 1}`}
              />
            </RowField>
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
        onClick={() =>
          onChange([
            ...actions,
            {
              title: '',
              startTime: '',
              responsibleName: '',
              sortOrder: actions.length,
              clientKey: crypto.randomUUID(),
            },
          ])
        }
      >
        <Plus aria-hidden="true" /> Adicionar ação
      </button>
    </section>
  );
}

function PlanBudgetSection({
  id,
  budget,
  onChange,
}: {
  id: string;
  budget: CronogramaSubeventBudgetItem[];
  onChange: (budget: CronogramaSubeventBudgetItem[]) => void;
}) {
  const rowKeys = usePresentationKeys();
  const patch = (index: number, value: Partial<CronogramaSubeventBudgetItem>) => {
    onChange(
      budget.map((line, position) =>
        position === index ? rowKeys.replace(line, { ...line, ...value }) : line,
      ),
    );
  };
  const total = budgetTotal(budget);
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-label="Orçamento"
      className="cronograma-plan-section cronograma-plan-budget"
    >
      <SectionHeading
        number="05"
        icon={Coins}
        title="Valor e custo do evento"
        hint="Orçamento por produto/serviço e fornecedor"
      />
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
          <li
            key={line.id ?? rowKeys.keyFor(line)}
            className="cronograma-plan-row cronograma-plan-budget-row"
          >
            <RowField label="Produto / serviço">
              <Textarea
                rows={1}
                value={line.item}
                onChange={(event) => patch(index, { item: event.target.value })}
                placeholder="Ex.: Coffee break"
                aria-label={`Produto ou serviço ${index + 1}`}
              />
            </RowField>
            <RowField label="Fornecedor">
              <Textarea
                rows={1}
                value={line.supplier ?? ''}
                onChange={(event) => patch(index, { supplier: event.target.value })}
                placeholder="Fornecedor"
                aria-label={`Fornecedor ${index + 1}`}
              />
            </RowField>
            <RowField label="Valor">
              <div className="cronograma-plan-budget-amount">
                <span aria-hidden="true">R$</span>
                <Input
                  inputMode="numeric"
                  value={formatCurrencyInput(line.amount)}
                  onChange={(event) =>
                    patch(index, {
                      amount: parseCurrencyDigits(event.target.value),
                    })
                  }
                  placeholder="0,00"
                  aria-label={`Valor ${index + 1}`}
                />
              </div>
            </RowField>
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
          onClick={() =>
            onChange([...budget, { item: '', supplier: '', amount: 0, sortOrder: budget.length }])
          }
        >
          <Plus aria-hidden="true" /> Adicionar item
        </button>
        <div className="cronograma-plan-budget-total" aria-live="polite">
          <small>Valor total do orçamento</small>
          <strong>{formatBRL(total)}</strong>
        </div>
      </div>
    </section>
  );
}

function PlanProvisionsSection({
  id,
  provisions,
  onChange,
}: {
  id: string;
  provisions: CronogramaSubeventProvision[];
  onChange: (provisions: CronogramaSubeventProvision[]) => void;
}) {
  const rowKeys = usePresentationKeys();
  const patch = (index: number, value: Partial<CronogramaSubeventProvision>) => {
    onChange(
      provisions.map((provision, position) =>
        position === index ? rowKeys.replace(provision, { ...provision, ...value }) : provision,
      ),
    );
  };
  const addTemplate = (description: string) => {
    if (provisions.some((provision) => provision.description.toLowerCase() === description.toLowerCase()))
      return;
    onChange([...provisions, { description, responsibleName: '', sortOrder: provisions.length }]);
  };
  return (
    <section id={id} tabIndex={-1} aria-label="Providências" className="cronograma-plan-section">
      <SectionHeading
        number="04"
        icon={CheckSquare}
        title="Estrutura e providências"
        hint={`${provisions.filter((provision) => provision.isDone).length} de ${provisions.length} concluídas · Checklist operacional com responsável`}
      />
      <div className="cronograma-plan-templates">
        {provisionTemplates.map((template) => (
          <button key={template} type="button" className="focus-ring" onClick={() => addTemplate(template)}>
            <Plus aria-hidden="true" /> {template}
          </button>
        ))}
      </div>
      <div className="cronograma-plan-columns cronograma-plan-provision-columns" aria-hidden="true">
        <span>Feito</span>
        <span>Descrição da providência</span>
        <span>Responsável</span>
        <span>Ações</span>
      </div>
      {provisions.length === 0 && (
        <p className="cronograma-plan-empty">Use uma sugestão ou adicione uma providência para começar.</p>
      )}
      <ul className="cronograma-plan-rows">
        {provisions.map((provision, index) => (
          <li
            key={provision.id ?? rowKeys.keyFor(provision)}
            className="cronograma-plan-row cronograma-plan-provision-row"
            data-done={provision.isDone || undefined}
          >
            <label className="cronograma-plan-row-check">
              <input
                type="checkbox"
                checked={provision.isDone ?? false}
                onChange={(event) => patch(index, { isDone: event.target.checked })}
                aria-label={`Concluir providência ${index + 1}`}
              />
            </label>
            <RowField label="Descrição da providência">
              <Textarea
                rows={1}
                value={provision.description}
                onChange={(event) => patch(index, { description: event.target.value })}
                placeholder="Ex.: Convites"
                aria-label={`Providência ${index + 1}`}
              />
            </RowField>
            <RowField label="Responsável">
              <Textarea
                rows={1}
                value={provision.responsibleName ?? ''}
                onChange={(event) => patch(index, { responsibleName: event.target.value })}
                placeholder="Responsável"
                aria-label={`Responsável da providência ${index + 1}`}
              />
            </RowField>
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
        onClick={() =>
          onChange([
            ...provisions,
            {
              description: '',
              responsibleName: '',
              sortOrder: provisions.length,
            },
          ])
        }
      >
        <Plus aria-hidden="true" /> Adicionar providência
      </button>
    </section>
  );
}

function PlanGuestsSection({
  id,
  guests,
  onChange,
}: {
  id: string;
  guests: CronogramaSubeventGuest[];
  onChange: (guests: CronogramaSubeventGuest[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [category, setCategory] = useState('');
  const rowKeys = usePresentationKeys();

  const commit = () => {
    const name = draft.trim();
    if (!name) return;
    onChange([...guests, { name, category: category || null, sortOrder: guests.length }]);
    setDraft('');
  };

  return (
    <section id={id} tabIndex={-1} aria-label="Convidados" className="cronograma-plan-section">
      <SectionHeading
        number="06"
        icon={Users}
        title={`Convidados · ${guests.length}`}
        hint="Grupos e nomes que devem ser comunicados"
      />
      <p className="cronograma-plan-suggestion-label">
        Categoria do próximo convidado <span>Opcional</span>
      </p>
      <div className="cronograma-plan-templates">
        {guestTemplates.map((template) => (
          <button
            key={template}
            type="button"
            className="focus-ring"
            data-active={category === template || undefined}
            aria-pressed={category === template}
            onClick={() => setCategory((current) => (current === template ? '' : template))}
          >
            <Sparkles aria-hidden="true" /> {template}
          </button>
        ))}
      </div>
      <div className="cronograma-plan-guest-entry">
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
      <p className="cronograma-plan-suggestion-label">Convidados adicionados</p>
      {guests.length === 0 && (
        <p className="cronograma-plan-empty">
          Nenhum convidado adicionado. Selecione uma categoria, se desejar, e inclua um nome ou grupo.
        </p>
      )}
      {guests.length > 0 && (
        <ul className="cronograma-plan-chips">
          {guests.map((guest, index) => (
            <li key={guest.id ?? rowKeys.keyFor(guest)}>
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
