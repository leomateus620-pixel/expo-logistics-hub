import { useEffect, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  Copy,
  Loader2,
  Plus,
  ReceiptText,
  Save,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FUNDING_TYPE_LABELS,
  type FinancialEdition,
  type FinancialRevenue,
  type FundingTypeKey,
} from "./financialOperationalApi";
import {
  centsToInput,
  parseCents,
  type FinancialExpense,
} from "./financialExpensesApi";
import {
  FinancialConfirmationContent as AlertDialogContent,
  EntryField,
  FinancialInfo,
  FinancialReferenceField,
  type ReferenceChoice,
} from "./FinancialEntryFields";
import {
  FinancialPaymentPlanEditor,
  draftInstallments,
  makePlanDraft,
  paymentPlanInput,
  validatePaymentPlan,
  type PlanDraft,
} from "./FinancialPaymentPlanEditor";
import {
  FinancialEntryError,
  civilToday,
  fetchPaymentPlan,
  saveFinancialBatch,
  type FinancialBatchItem,
  type PaymentPlan,
} from "./financialEntryApi";
import type { FinancialExpenseCapabilities } from "./useFinancialExpenseCapabilities";
import "@/styles/financial-entry-composer.css";
import { useMobileViewport } from "@/components/cronograma-eventos/mobile/useMobileViewport";

interface Props {
  org: string;
  edition: FinancialEdition;
  kind: "revenue" | "expense";
  revenue?: FinancialRevenue | null;
  expense?: FinancialExpense | null;
  initialStatus?: string;
  capabilities: FinancialExpenseCapabilities;
  commissions?: Array<{ id: string; nome: string }>;
  onClose: () => void;
}
interface Draft {
  id: string;
  sourceId?: string;
  version: number | null;
  description: string;
  detail: string;
  notes: string;
  counterparty: ReferenceChoice;
  origin: ReferenceChoice;
  payee: ReferenceChoice;
  category: ReferenceChoice;
  funding: FundingTypeKey;
  commission: string;
  status: string;
  projected: string;
  realized: string;
  plannedOn: string;
  competence: string;
  reason: string;
  plan: PlanDraft;
}
const emptyChoice = (): ReferenceChoice => ({ id: null, name: "" });
function makeDraft(props: Props, plan: PaymentPlan | null): Draft {
  const r = props.revenue,
    e = props.expense;
  return {
    id: crypto.randomUUID(),
    sourceId: r?.id || e?.id,
    version: r?.version ?? e?.version ?? null,
    description: r?.description || e?.title || "",
    detail: e?.description || "",
    notes: r?.notes || e?.notes || "",
    counterparty: {
      id: r?.counterparty_reference_id || null,
      name: r?.counterparty_reference_name || r?.counterparty || "",
    },
    origin: {
      id: r?.funding_source_reference_id || null,
      name: r?.funding_source_name || "",
    },
    payee: {
      id: e?.payee_reference_id || null,
      name: e?.payee_reference_name || e?.payee_name || "",
    },
    category: { id: e?.category_id || null, name: e?.category_name || "" },
    funding: r?.funding_type || "nao_identificado",
    commission: e?.commission_id || "",
    status:
      r?.status ||
      e?.status ||
      props.initialStatus ||
      (props.kind === "revenue" ? "projetada" : "prevista"),
    projected: centsToInput(r?.projected_cents ?? e?.planned_cents ?? null),
    realized: centsToInput(r?.confirmed_cents ?? e?.committed_cents ?? null),
    plannedOn: e?.planned_on || "",
    competence: r?.competence_date || e?.committed_on || civilToday(),
    reason: "",
    plan: makePlanDraft(plan, r?.due_date || e?.due_date || ""),
  };
}
const isExecuted = (d: Draft) =>
  d.status === "confirmada" || d.status === "realizada";
function money(value: string) {
  try {
    return parseCents(value) ?? 0;
  } catch {
    return Number.NaN;
  }
}
const applicable = (d: Draft) =>
  money(isExecuted(d) ? d.realized : d.projected);

export function FinancialEntryComposer(props: Props) {
  const source = props.revenue?.id || props.expense?.id;
  const plan = useQuery({
    queryKey: [
      "financial-operational",
      "payment-plan",
      props.org,
      props.edition.id,
      source,
    ],
    queryFn: () =>
      fetchPaymentPlan(
        props.org,
        props.edition.id,
        props.kind === "revenue" ? "receita" : "despesa",
        source!,
      ),
    enabled:
      Boolean(source) &&
      props.capabilities.canAccess &&
      !props.capabilities.isLoading &&
      !props.capabilities.isError,
    retry: false,
  });
  if (source && (plan.isLoading || plan.isError))
    return (
      <Dialog.Root open onOpenChange={(v) => !v && props.onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="f28-entry-overlay" />
          <Dialog.Content className="f28-entry-composer f28-entry-composer--loading">
            <Dialog.Title>Consultar cronograma</Dialog.Title>
            <Dialog.Description>
              {plan.isError
                ? "Não foi possível conferir o cronograma atual. O registro permanece preservado."
                : "Carregando os dados persistidos…"}
            </Dialog.Description>
            {plan.isError && (
              <Button onClick={() => void plan.refetch()}>
                Tentar novamente
              </Button>
            )}
            <Button variant="outline" onClick={props.onClose}>
              Fechar
            </Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  return <ComposerForm {...props} initialPlan={plan.data || null} />;
}

function ComposerForm(props: Props & { initialPlan: PaymentPlan | null }) {
  const {
    org,
    edition,
    kind,
    capabilities: caps,
    onClose,
    commissions = [],
  } = props;
  const noun = kind === "revenue" ? "receita" : "despesa";
  const [drafts, setDrafts] = useState<Draft[]>(() => [
    makeDraft(props, props.initialPlan),
  ]);
  const [expanded, setExpanded] = useState<string | null>(drafts[0].id),
    [removeId, setRemoveId] = useState<string | null>(null),
    [errors, setErrors] = useState<Record<string, string>>({});
  const [uncertain, setUncertain] = useState(false);
  const [errorFields, setErrorFields] = useState<Record<string, string>>({}),
    [focusTarget, setFocusTarget] = useState<string | null>(null);
  useEffect(() => {
    if (focusTarget) {
      document.getElementById(focusTarget)?.focus();
      setFocusTarget(null);
    }
  }, [focusTarget, expanded]);
  const opener = useRef<HTMLElement | null>(
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement),
  );
  const pendingRequest = useRef<{
      items: FinancialBatchItem[];
      request: string;
    } | null>(null),
    keys = useRef(new Map<string, string>()),
    inFlight = useRef(false);
  const qc = useQueryClient();
  const viewport = useMobileViewport();
  const verified =
    caps.canAccess &&
    !caps.isLoading &&
    !caps.isError &&
    edition.status === "operacional";
  const allowed =
    verified &&
    props.expense?.status !== "cancelada" &&
    props.revenue?.status !== "cancelada" &&
    (kind !== "revenue" ||
      props.revenue?.status !== "confirmada" ||
      caps.canConfirm) &&
    (kind === "expense"
      ? caps.canEdit
      : drafts.every((d) =>
          d.status === "confirmada" ? caps.canConfirm : caps.canEdit,
        ));
  const save = useMutation({
    mutationFn: async ({
      items,
      request,
    }: {
      items: FinancialBatchItem[];
      request: string;
    }) => {
      const result = await saveFinancialBatch(
        org,
        edition.id,
        kind,
        items,
        request,
      );
      // The write response is canonical; a second request verifies committed schedules before dismissing.
      try {
        await Promise.all(
          result.items.map((i) =>
            fetchPaymentPlan(
              org,
              edition.id,
              kind === "revenue" ? "receita" : "despesa",
              i.record.id,
            ),
          ),
        );
      } catch {
        throw new FinancialEntryError(
          "A gravação foi confirmada, mas a releitura está pendente. Repita a tentativa para recuperar o resultado.",
          undefined,
          true,
        );
      }
      await qc.invalidateQueries({ queryKey: ["financial-operational"] });
      return result;
    },
    onSuccess: () => {
      pendingRequest.current = null;
      onClose();
    },
    onError: (error: Error) => {
      if (error instanceof FinancialEntryError && error.draftId)
        setExpanded(error.draftId);
      if (error instanceof FinancialEntryError && error.uncertain)
        setUncertain(true);
      // A failed post-commit re-read must also replay the same logical request.
      else if (!(error as FinancialEntryError).code) setUncertain(true);
    },
  });
  const locked = !allowed || save.isPending || uncertain;
  const set = (id: string, patch: Partial<Draft>) => {
    setDrafts((old) => old.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    setErrors((old) => {
      const next = { ...old };
      delete next[id];
      return next;
    });
  };
  const add = () => {
    const d = makeDraft(
      {
        ...props,
        revenue: null,
        expense: null,
        initialStatus:
          kind === "expense" ? props.initialStatus || "prevista" : "projetada",
      },
      null,
    );
    setDrafts((old) => [...old, d]);
    setExpanded(d.id);
    setFocusTarget(`entry-${d.id}-description`);
  };
  const duplicate = (d: Draft) => {
    const clone: Draft = {
      ...d,
      id: crypto.randomUUID(),
      sourceId: undefined,
      version: null,
      reason: "",
      plan: {
        ...d.plan,
        version: null,
        unassigned: 0,
        rows: draftInstallments(d.plan, applicable(d)).map((i) => ({
          ...i,
          id: crypto.randomUUID(),
          settled_cents: 0,
        })),
      },
    };
    setDrafts((old) => [...old, clone]);
    setExpanded(clone.id);
    setFocusTarget(`entry-${clone.id}-description`);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!allowed || inFlight.current || save.isPending) return;
    if (uncertain && pendingRequest.current) {
      inFlight.current = true;
      try {
        await save.mutateAsync(pendingRequest.current);
      } catch {
        /* Retain frozen request and drafts. */
      } finally {
        inFlight.current = false;
      }
      return;
    }
    const next: Record<string, string> = {},
      nextFields: Record<string, string> = {};
    const mark = (d: Draft, message: string, field: string) => {
      next[d.id] = message;
      nextFields[d.id] = field;
    };
    const items: FinancialBatchItem[] = [];
    for (const d of drafts) {
      if (
        d.description.trim().length < 2 ||
        d.description.trim().length > 240
      ) {
        mark(d, "Informe uma descrição com 2 a 240 caracteres.", "description");
        continue;
      }
      if (
        isExecuted(d) &&
        !caps.canConfirm &&
        (kind === "revenue" ||
          !d.sourceId ||
          money(d.realized) !== props.expense?.committed_cents ||
          d.competence !== props.expense?.committed_on)
      ) {
        mark(
          d,
          "Confirmar ou alterar o compromisso exige confirmação financeira.",
          "status",
        );
        continue;
      }
      if (!isExecuted(d) && !caps.canEdit) {
        mark(
          d,
          "Seu acesso não permite editar lançamentos previstos.",
          "status",
        );
        continue;
      }
      const total = applicable(d);
      if (
        kind === "expense" &&
        isExecuted(d) &&
        total < (props.expense?.paid_cents || 0)
      ) {
        mark(
          d,
          "O compromisso não pode ficar abaixo do que já foi pago.",
          "realized",
        );
        continue;
      }
      if (!Number.isSafeInteger(total) || total <= 0) {
        mark(
          d,
          isExecuted(d)
            ? "Informe um valor confirmado ou realizado maior que zero."
            : "Informe o valor projetado maior que zero.",
          isExecuted(d) ? "realized" : "projected",
        );
        continue;
      }
      const planError = validatePaymentPlan(d.plan, total);
      if (planError && d.status !== "cancelada") {
        mark(d, planError, d.plan.firstDue ? "plan" : "plan-first-due");
        continue;
      }
      if (isExecuted(d) && !d.competence) {
        mark(d, "Informe a competência do compromisso.", "competence");
        continue;
      }
      if (d.status === "cancelada" && d.reason.trim().length < 3) {
        mark(d, "Informe o motivo do cancelamento.", "reason");
        continue;
      }
      if (!Number.isSafeInteger(money(d.projected))) {
        mark(d, "Confira o valor projetado.", "projected");
        continue;
      }
      const p: Record<string, unknown> = {
        ...(d.sourceId
          ? { id: d.sourceId }
          : { edition_id: edition.id, status: d.status }),
        ...(d.status === "cancelada"
          ? {}
          : {
              payment_plan: paymentPlanInput(d.plan, total),
              due_date: draftInstallments(d.plan, total)[0].due_date,
            }),
        notes: d.notes.trim() || null,
      };
      const creates: FinancialBatchItem["create_references"] = {};
      if (kind === "revenue")
        Object.assign(p, {
          description: d.description.trim(),
          counterparty: d.counterparty.name.trim() || null,
          counterparty_reference_id: d.counterparty.id,
          funding_source_reference_id: d.origin.id,
          funding_type: d.funding,
          status: d.status,
          projected_cents: money(d.projected),
          confirmed_cents:
            d.status === "cancelada"
              ? (props.revenue?.confirmed_cents ?? null)
              : isExecuted(d)
                ? money(d.realized)
                : null,
          competence_date:
            d.status === "cancelada"
              ? (props.revenue?.competence_date ?? null)
              : isExecuted(d)
                ? d.competence
                : null,
        });
      else
        Object.assign(p, {
          title: d.description.trim(),
          description: d.detail.trim() || null,
          category_id: d.category.id,
          commission_id: d.commission || null,
          payee_name: d.payee.name.trim() || null,
          payee_reference_id: d.payee.id,
          planned_cents: d.projected.trim() ? money(d.projected) : null,
          planned_on: d.plannedOn || null,
          ...(isExecuted(d) && caps.canConfirm
            ? { committed_cents: money(d.realized), committed_on: d.competence }
            : {}),
        });
      const choices =
        kind === "revenue"
          ? { counterparty: d.counterparty, funding_source: d.origin }
          : { payee: d.payee, expense_category: d.category };
      for (const [k, v] of Object.entries(choices))
        if (v.createOnSave && !v.id && v.name.trim())
          creates[k as keyof typeof creates] = v.name.trim();
      items.push({
        draft_id: d.id,
        expected_version: d.version,
        payload: p,
        reason: d.reason || undefined,
        ...(Object.keys(creates).length ? { create_references: creates } : {}),
      });
    }
    setErrors(next);
    setErrorFields(nextFields);
    if (Object.keys(next).length) {
      const first = Object.keys(next)[0];
      setExpanded(first);
      setFocusTarget(`entry-${first}-${nextFields[first]}`);
      return;
    }
    const signature = JSON.stringify(items);
    if (!keys.current.has(signature))
      keys.current.set(signature, crypto.randomUUID());
    const request = { items, request: keys.current.get(signature)! };
    pendingRequest.current = request;
    inFlight.current = true;
    try {
      await save.mutateAsync(request);
    } catch {
      /* Error is displayed without discarding drafts. */
    } finally {
      inFlight.current = false;
    }
  };
  const planned = drafts
      .filter((d) => !isExecuted(d))
      .reduce(
        (s, d) => s + (Number.isFinite(applicable(d)) ? applicable(d) : 0),
        0,
      ),
    executed = drafts
      .filter(isExecuted)
      .reduce(
        (s, d) => s + (Number.isFinite(applicable(d)) ? applicable(d) : 0),
        0,
      );
  return (
    <Dialog.Root open onOpenChange={(v) => !v && !save.isPending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="f28-entry-overlay" />
        <Dialog.Content
          className="f28-entry-composer"
          data-kind={kind}
          style={
            viewport.height
              ? {
                  maxHeight: Math.max(0, viewport.height - 16),
                  top: viewport.offsetTop + viewport.height / 2,
                }
              : undefined
          }
          onEscapeKeyDown={(e) => {
            if (save.isPending) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (save.isPending) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.isConnected &&
              opener.current.focus({ preventScroll: true });
          }}
        >
          <header className="f28-entry-header">
            <span className="f28-entry-mark" aria-hidden="true">
              {kind === "revenue" ? <TrendingUp /> : <ReceiptText />}
            </span>
            <div>
              <p>
                FENASOJA 2028 · {kind === "revenue" ? "Receitas" : "Despesas"}
              </p>
              <div className="f28-entry-title-row">
                <Dialog.Title>
                  {props.revenue || props.expense
                    ? `Editar ${noun}`
                    : `Nova ${noun}`}
                </Dialog.Title>
                <FinancialInfo label="Lançamentos financeiros">
                  Previsão e compromisso são etapas do mesmo fato. Pago ou
                  recebido depende exclusivamente dos movimentos financeiros
                  registrados.
                </FinancialInfo>
              </div>
              <Dialog.Description className="sr-only">
                Cadastre um ou mais lançamentos com referências e cronograma
                próprios.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="f28-entry-close"
              disabled={save.isPending}
              aria-label="Fechar formulário"
            >
              <X size={20} />
            </Dialog.Close>
          </header>
          <form
            onSubmit={submit}
            noValidate
            aria-busy={save.isPending}
            className="f28-entry-form"
          >
            <div className="f28-entry-scroll">
              <div className="f28-entry-main">
                {!allowed && (
                  <p role={caps.isError ? "alert" : "status"}>
                    {caps.isLoading
                      ? "Verificando permissões…"
                      : caps.isError
                        ? "Não foi possível verificar suas permissões."
                        : props.revenue?.status === "confirmada" &&
                            !caps.canConfirm
                          ? "Editar uma receita confirmada exige confirmação financeira."
                          : edition.status !== "operacional"
                            ? "Esta edição é histórica e somente leitura."
                            : "Seu acesso permite apenas consultar esta operação."}
                  </p>
                )}
                {save.error && (
                  <div className="f28-entry-error-banner" role="alert">
                    <strong>{save.error.message}</strong>
                    <p>
                      O preenchimento foi preservado.
                      {uncertain
                        ? " Repita a mesma tentativa para confirmar o resultado antes de editar."
                        : ""}
                    </p>
                  </div>
                )}
                {drafts.map((d, index) => {
                  const open = expanded === d.id;
                  const field = (suffix: string) => `entry-${d.id}-${suffix}`;
                  const a11y = (suffix: string) => ({
                    "aria-invalid":
                      (errorFields[d.id] === suffix && Boolean(errors[d.id])) ||
                      undefined,
                    "aria-describedby":
                      errorFields[d.id] === suffix && errors[d.id]
                        ? `${field(suffix)}-error`
                        : undefined,
                  });
                  return (
                    <article
                      key={d.id}
                      className="f28-entry-card"
                      data-expanded={open}
                      data-error={Boolean(errors[d.id])}
                    >
                      <header>
                        <button
                          type="button"
                          className="f28-entry-card-toggle"
                          aria-expanded={open}
                          aria-controls={field("body")}
                          onClick={() => setExpanded(open ? null : d.id)}
                        >
                          <span className="f28-entry-card-number">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span>
                            <strong>
                              {d.description ||
                                `${kind === "revenue" ? "Receita" : "Despesa"} ${index + 1}`}
                            </strong>
                            <small>
                              {isExecuted(d)
                                ? kind === "revenue"
                                  ? "Confirmada"
                                  : "Realizada"
                                : kind === "revenue"
                                  ? "Projetada"
                                  : "Prevista"}{" "}
                              · R${" "}
                              {centsToInput(
                                Number.isFinite(applicable(d))
                                  ? applicable(d)
                                  : 0,
                              )}{" "}
                              ·{" "}
                              {draftInstallments(d.plan, applicable(d)).length}{" "}
                              {d.plan.condition === "avista"
                                ? "vencimento"
                                : "parcelas"}
                            </small>
                          </span>
                          <ChevronDown size={18} />
                        </button>
                        <div className="f28-entry-card-actions">
                          <button
                            type="button"
                            disabled={locked || drafts.length >= 50}
                            aria-label={`Duplicar ${noun} ${index + 1}`}
                            onClick={() => duplicate(d)}
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            type="button"
                            disabled={locked || drafts.length === 1}
                            aria-label={`Remover ${noun} ${index + 1}`}
                            onClick={() => setRemoveId(d.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </header>
                      {errors[d.id] && (
                        <p
                          id={`${field(errorFields[d.id] || "card")}-error`}
                          className="f28-entry-error"
                          role="alert"
                        >
                          {errors[d.id]}
                        </p>
                      )}
                      {open && (
                        <fieldset
                          id={field("body")}
                          disabled={locked}
                          className="f28-entry-card-body"
                        >
                          <legend className="sr-only">
                            {noun} {index + 1}
                          </legend>
                          <div className="f28-entry-grid">
                            <EntryField
                              id={field("description")}
                              label={
                                kind === "revenue"
                                  ? "Descrição"
                                  : "Descrição da despesa"
                              }
                              required
                              wide
                            >
                              <Input
                                id={field("description")}
                                {...a11y("description")}
                                maxLength={240}
                                autoFocus={index === 0}
                                value={d.description}
                                onChange={(e) =>
                                  set(d.id, { description: e.target.value })
                                }
                              />
                            </EntryField>
                            {kind === "revenue" ? (
                              <>
                                <FinancialReferenceField
                                  org={org}
                                  kind="counterparty"
                                  id={field("cp")}
                                  label="Contrapartida"
                                  value={d.counterparty}
                                  onChange={(v) =>
                                    set(d.id, { counterparty: v })
                                  }
                                  canCreate={caps.canEdit}
                                  canAdmin={caps.canAdmin}
                                />
                                <FinancialReferenceField
                                  org={org}
                                  kind="funding_source"
                                  id={field("origin")}
                                  label="Origem do recurso"
                                  value={d.origin}
                                  onChange={(v) => set(d.id, { origin: v })}
                                  onSelect={(r) =>
                                    set(d.id, {
                                      origin: { id: r.id, name: r.name },
                                      funding:
                                        r.funding_type || "nao_identificado",
                                    })
                                  }
                                  fundingType={d.funding}
                                  canCreate={caps.canEdit}
                                  canAdmin={caps.canAdmin}
                                />
                                <EntryField
                                  id={field("funding")}
                                  label="Classificação do recurso"
                                  help="A classificação técnica mantém os relatórios compatíveis. Uma origem nova começa como Não identificado, salvo escolha explícita."
                                >
                                  <select
                                    id={field("funding")}
                                    value={d.funding}
                                    disabled={Boolean(d.origin.id)}
                                    onChange={(e) =>
                                      set(d.id, {
                                        funding: e.target
                                          .value as FundingTypeKey,
                                      })
                                    }
                                  >
                                    {Object.entries(FUNDING_TYPE_LABELS).map(
                                      ([k, v]) => (
                                        <option key={k} value={k}>
                                          {v}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </EntryField>
                              </>
                            ) : (
                              <>
                                <FinancialReferenceField
                                  org={org}
                                  kind="expense_category"
                                  id={field("category")}
                                  label="Categoria"
                                  value={d.category}
                                  onChange={(v) => set(d.id, { category: v })}
                                  canCreate={caps.canEdit}
                                  canAdmin={caps.canAdmin}
                                />
                                <EntryField
                                  id={field("commission")}
                                  label="Comissão responsável"
                                >
                                  <select
                                    id={field("commission")}
                                    value={d.commission}
                                    onChange={(e) =>
                                      set(d.id, { commission: e.target.value })
                                    }
                                  >
                                    <option value="">Sem comissão</option>
                                    {commissions.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.nome}
                                      </option>
                                    ))}
                                  </select>
                                </EntryField>
                                <FinancialReferenceField
                                  org={org}
                                  kind="payee"
                                  id={field("payee")}
                                  label="Fornecedor / favorecido"
                                  value={d.payee}
                                  onChange={(v) => set(d.id, { payee: v })}
                                  canCreate={caps.canEdit}
                                  canAdmin={caps.canAdmin}
                                />
                              </>
                            )}
                            <EntryField id={field("status")} label="Situação">
                              <select
                                id={field("status")}
                                value={d.status}
                                disabled={
                                  kind === "expense" && Boolean(d.sourceId)
                                }
                                onChange={(e) =>
                                  set(d.id, { status: e.target.value })
                                }
                              >
                                <option
                                  value={
                                    kind === "revenue"
                                      ? "projetada"
                                      : "prevista"
                                  }
                                  disabled={!caps.canEdit}
                                >
                                  {kind === "revenue"
                                    ? "Projetada"
                                    : "Prevista"}
                                </option>
                                {caps.canConfirm && (
                                  <option
                                    value={
                                      kind === "revenue"
                                        ? "confirmada"
                                        : "realizada"
                                    }
                                  >
                                    {kind === "revenue"
                                      ? "Confirmada"
                                      : "Realizada"}
                                  </option>
                                )}
                                {((kind === "revenue" && Boolean(d.sourceId)) ||
                                  d.status === "cancelada") && (
                                  <option value="cancelada">Cancelada</option>
                                )}
                              </select>
                            </EntryField>
                            <EntryField
                              id={field("projected")}
                              label="Valor projetado (R$)"
                              required={!isExecuted(d)}
                            >
                              <Input
                                id={field("projected")}
                                {...a11y("projected")}
                                inputMode="decimal"
                                value={d.projected}
                                onChange={(e) =>
                                  set(d.id, { projected: e.target.value })
                                }
                                placeholder="0,00"
                              />
                            </EntryField>
                            {isExecuted(d) && (
                              <EntryField
                                id={field("realized")}
                                label={
                                  kind === "revenue"
                                    ? "Valor confirmado (R$)"
                                    : "Valor realizado (R$)"
                                }
                                required
                              >
                                <Input
                                  id={field("realized")}
                                  {...a11y("realized")}
                                  inputMode="decimal"
                                  disabled={!caps.canConfirm}
                                  value={d.realized}
                                  onChange={(e) =>
                                    set(d.id, { realized: e.target.value })
                                  }
                                  placeholder="0,00"
                                />
                              </EntryField>
                            )}
                            {kind === "expense" && (
                              <EntryField
                                id={field("planned-on")}
                                label="Data prevista"
                              >
                                <Input
                                  id={field("planned-on")}
                                  type="date"
                                  value={d.plannedOn}
                                  onChange={(e) =>
                                    set(d.id, { plannedOn: e.target.value })
                                  }
                                />
                              </EntryField>
                            )}
                            {isExecuted(d) && (
                              <EntryField
                                id={field("competence")}
                                label="Competência / realização"
                                required
                              >
                                <Input
                                  id={field("competence")}
                                  {...a11y("competence")}
                                  type="date"
                                  disabled={!caps.canConfirm}
                                  value={d.competence}
                                  onChange={(e) =>
                                    set(d.id, { competence: e.target.value })
                                  }
                                />
                              </EntryField>
                            )}
                          </div>
                          <FinancialPaymentPlanEditor
                            id={field("plan")}
                            value={d.plan}
                            total={applicable(d)}
                            onChange={(v) => set(d.id, { plan: v })}
                            disabled={locked}
                          />
                          {d.status === "cancelada" && (
                            <EntryField
                              id={field("reason")}
                              label="Motivo do cancelamento"
                              required
                            >
                              <Input
                                id={field("reason")}
                                {...a11y("reason")}
                                value={d.reason}
                                onChange={(e) =>
                                  set(d.id, { reason: e.target.value })
                                }
                              />
                            </EntryField>
                          )}
                          <details className="f28-entry-details">
                            <summary>Detalhamento e observações</summary>
                            {kind === "expense" && (
                              <EntryField
                                id={field("detail")}
                                label="Detalhamento"
                              >
                                <Textarea
                                  id={field("detail")}
                                  value={d.detail}
                                  onChange={(e) =>
                                    set(d.id, { detail: e.target.value })
                                  }
                                />
                              </EntryField>
                            )}
                            <EntryField id={field("notes")} label="Observações">
                              <Textarea
                                id={field("notes")}
                                maxLength={2000}
                                value={d.notes}
                                onChange={(e) =>
                                  set(d.id, { notes: e.target.value })
                                }
                              />
                            </EntryField>
                          </details>
                        </fieldset>
                      )}
                    </article>
                  );
                })}
                <Button
                  type="button"
                  variant="outline"
                  className="f28-entry-add"
                  disabled={locked || drafts.length >= 50}
                  onClick={add}
                >
                  <Plus size={18} />
                  {kind === "revenue"
                    ? "Adicionar outra receita"
                    : "Adicionar outra despesa"}
                </Button>
              </div>
              <aside className="f28-entry-summary">
                <h2>Revisão do lote</h2>
                <dl>
                  <div>
                    <dt>Lançamentos</dt>
                    <dd>{drafts.length}</dd>
                  </div>
                  <div>
                    <dt>Vencimentos</dt>
                    <dd>
                      {drafts.reduce(
                        (s, d) =>
                          s + draftInstallments(d.plan, applicable(d)).length,
                        0,
                      )}
                    </dd>
                  </div>
                </dl>
                <div className="f28-entry-summary-values">
                  <div>
                    <span>
                      {kind === "revenue" ? "Projetadas" : "Previstas"}
                    </span>
                    <strong>R$ {centsToInput(planned)}</strong>
                  </div>
                  <div>
                    <span>
                      {kind === "revenue" ? "Confirmadas" : "Realizadas"}
                    </span>
                    <strong>R$ {centsToInput(executed)}</strong>
                  </div>
                </div>
                <p>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Cada fato é contado uma vez, pelo estágio atual.
                </p>
                <FinancialInfo label="Resumo do lote">
                  Os valores projetado e realizado do mesmo lançamento não são
                  somados. A quantidade de vencimentos inclui a previsão à
                  vista.
                </FinancialInfo>
              </aside>
            </div>
            <footer className="f28-entry-footer">
              <span>
                {save.isPending
                  ? "Aguardando confirmação do servidor…"
                  : "* Campos obrigatórios"}
              </span>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={onClose}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={!allowed || save.isPending}>
                  <span aria-hidden="true">
                    {save.isPending ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <Save size={17} />
                    )}
                  </span>
                  {save.isPending
                    ? "Salvando…"
                    : uncertain
                      ? "Verificar e repetir tentativa"
                      : `Salvar ${drafts.length === 1 ? noun : `${drafts.length} ${noun}s`}`}
                </Button>
              </div>
            </footer>
          </form>
          <AlertDialog
            open={Boolean(removeId)}
            onOpenChange={(v) => !v && setRemoveId(null)}
          >
            <AlertDialogContent className="f28-entry-confirm">
              <AlertDialogHeader>
                <AlertDialogTitle>Remover este rascunho?</AlertDialogTitle>
                <AlertDialogDescription>
                  O preenchimento deste card será descartado. Os demais
                  lançamentos serão mantidos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Manter rascunho</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setDrafts((old) => old.filter((d) => d.id !== removeId));
                    if (expanded === removeId)
                      setExpanded(
                        drafts.find((d) => d.id !== removeId)?.id || null,
                      );
                    setRemoveId(null);
                  }}
                >
                  Remover rascunho
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
