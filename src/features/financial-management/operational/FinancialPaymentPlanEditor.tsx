import { useEffect, useRef, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { centsToInput, parseCents } from "./financialExpensesApi";
import {
  civilDateInMonth,
  generateInstallments,
  PAYMENT_METHODS,
  type PaymentMethod,
  type PaymentPlan,
  type PaymentPlanInput,
  type PaymentInstallment,
} from "./financialEntryApi";
import {
  FinancialConfirmationContent as AlertDialogContent,
  EntryField,
  FinancialInfo,
} from "./FinancialEntryFields";

/** Keep the typed decimal intact; an invalid draft is propagated so Save cannot use a stale value. */
export function FinancialCentsInput({
  value,
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: number;
  onChange: (cents: number) => void;
}) {
  const [text, setText] = useState(() =>
    Number.isFinite(value) ? centsToInput(value) : "",
  );
  const emitted = useRef(value);
  useEffect(() => {
    if (!Object.is(value, emitted.current)) {
      setText(Number.isFinite(value) ? centsToInput(value) : "");
      emitted.current = value;
    }
  }, [value]);
  return (
    <Input
      {...props}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        let amount: number;
        try {
          amount = parseCents(e.target.value) ?? 0;
        } catch {
          amount = Number.NaN;
        }
        emitted.current = amount;
        onChange(amount);
      }}
      onBlur={(e) => {
        if (Number.isFinite(value)) setText(centsToInput(value));
        props.onBlur?.(e);
      }}
    />
  );
}

export interface PlanDraft {
  condition: "avista" | "parcelado";
  method: PaymentMethod | null;
  quantity: number;
  firstDue: string;
  rows: PaymentInstallment[];
  customized: boolean;
  version: number | null;
  unassigned: number;
}
export const makePlanDraft = (
  plan: PaymentPlan | null,
  due = "",
): PlanDraft => ({
  condition: plan?.condition || "avista",
  method: plan?.default_method || null,
  quantity: plan?.installments.length || 1,
  firstDue: plan?.installments[0]?.due_date || due,
  rows: plan?.installments || [
    { id: crypto.randomUUID(), due_date: due, amount_cents: 0, method: null },
  ],
  customized: Boolean(plan),
  version: plan?.version ?? null,
  unassigned: plan?.unassigned_settled_cents || 0,
});
export function draftInstallments(draft: PlanDraft, total: number) {
  return !draft.customized && draft.condition === "avista"
    ? [
        {
          ...draft.rows[0],
          sequence: 1,
          due_date: draft.firstDue,
          amount_cents: total,
          method: draft.method,
        },
      ]
    : draft.rows;
}
export function paymentPlanInput(
  draft: PlanDraft,
  total: number,
): PaymentPlanInput {
  return {
    condition: draft.condition,
    default_method: draft.method,
    expected_version: draft.version,
    installments: draftInstallments(draft, total).map(
      ({ id, due_date, amount_cents, method }) => ({
        id,
        due_date,
        amount_cents,
        method,
      }),
    ),
  };
}
export function validatePaymentPlan(draft: PlanDraft, total: number) {
  const rows = draftInstallments(draft, total);
  if (!Number.isSafeInteger(total) || total < 1)
    return "Informe um total aplicável maior que zero.";
  if (draft.condition === "avista" && rows.length !== 1)
    return "Gere a previsão à vista antes de salvar.";
  if (rows.length !== draft.quantity)
    return "Gere a distribuição para a quantidade escolhida.";
  if (
    rows.some(
      (i) => !Number.isSafeInteger(i.amount_cents) || i.amount_cents < 1,
    )
  )
    return "Cada parcela deve ter pelo menos R$ 0,01.";
  try {
    if (
      rows.some(
        (i) =>
          !/^\d{4}-\d{2}-\d{2}$/.test(i.due_date) ||
          civilDateInMonth(
            i.due_date.slice(0, 7),
            Number(i.due_date.slice(8)),
          ) !== i.due_date,
      )
    )
      return "Informe todos os vencimentos.";
  } catch {
    return "Confira os vencimentos.";
  }
  if (rows.reduce((s, i) => s + i.amount_cents, 0) !== total)
    return "A soma das parcelas deve ser igual ao total aplicável.";
  return null;
}
export function FinancialPaymentPlanEditor({
  id,
  value,
  total,
  onChange,
  disabled = false,
}: {
  id: string;
  value: PlanDraft;
  total: number;
  onChange: (v: PlanDraft) => void;
  disabled?: boolean;
}) {
  const [confirm, setConfirm] = useState(false),
    [error, setError] = useState("");
  const rows = draftInstallments(value, total),
    sum = rows.reduce((s, i) => s + i.amount_cents, 0),
    difference = total - sum;
  const set = (patch: Partial<PlanDraft>) => onChange({ ...value, ...patch });
  const regenerate = () => {
    try {
      const generated = generateInstallments(
        total,
        value.condition === "avista" ? 1 : value.quantity,
        value.firstDue,
        value.method,
        rows,
      );
      set({ rows: generated, quantity: generated.length, customized: true });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
    setConfirm(false);
  };
  const edit = (index: number, patch: Partial<PaymentInstallment>) => {
    set({
      rows: rows.map((r, n) => (n === index ? { ...r, ...patch } : r)),
      customized: true,
    });
    setError("");
  };
  return (
    <section className="f28-entry-plan" aria-label="Cronograma de vencimentos">
      <div className="f28-entry-section-heading">
        <h3>
          <CalendarDays size={17} aria-hidden="true" />
          Condição e vencimentos
        </h3>
        <FinancialInfo label="Cronograma">
          O cronograma distribui um único lançamento. O meio previsto não
          registra pagamento ou recebimento. Parcelas já liquidadas ficam
          protegidas.
        </FinancialInfo>
      </div>
      <div className="f28-entry-grid">
        <EntryField id={`${id}-method`} label="Meio previsto">
          <select
            id={`${id}-method`}
            disabled={disabled}
            value={value.method || ""}
            onChange={(e) =>
              set({ method: (e.target.value || null) as PaymentMethod | null })
            }
          >
            <option value="">Não informado</option>
            {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </EntryField>
        <EntryField id={`${id}-condition`} label="Condição">
          <select
            id={`${id}-condition`}
            disabled={disabled}
            value={value.condition}
            onChange={(e) =>
              set({
                condition: e.target.value as PlanDraft["condition"],
                quantity:
                  e.target.value === "avista" ? 1 : Math.max(2, value.quantity),
              })
            }
          >
            <option value="avista">À vista</option>
            <option value="parcelado">Parcelado</option>
          </select>
        </EntryField>
        <EntryField
          id={`${id}-first-due`}
          label={
            value.condition === "avista" ? "Vencimento" : "Primeiro vencimento"
          }
          required
        >
          <Input
            id={`${id}-first-due`}
            type="date"
            disabled={disabled}
            value={value.firstDue}
            onChange={(e) => set({ firstDue: e.target.value })}
          />
        </EntryField>
        {value.condition === "parcelado" && (
          <EntryField id={`${id}-quantity`} label="Quantidade de parcelas">
            <Input
              id={`${id}-quantity`}
              type="number"
              min="1"
              max="360"
              disabled={disabled}
              value={value.quantity}
              onChange={(e) => set({ quantity: Number(e.target.value) })}
            />
          </EntryField>
        )}
      </div>
      {value.condition === "parcelado" || value.customized ? (
        <div className="f28-entry-plan-generate">
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => (value.customized ? setConfirm(true) : regenerate())}
          >
            <RefreshCw size={15} />
            {value.rows.length > 1 || value.customized
              ? "Redistribuir parcelas"
              : "Gerar parcelas mensais"}
          </Button>
          <span>
            Alterar o total ou a quantidade mantém a distribuição anterior até
            você redistribuir.
          </span>
        </div>
      ) : null}
      {value.condition === "parcelado" && (
        <details className="f28-entry-months">
          <summary>Escolher meses não consecutivos</summary>
          <div>
            {rows.map((row, n) => (
              <label key={row.id}>
                Mês da parcela {n + 1}
                <input
                  type="month"
                  disabled={disabled || (row.settled_cents || 0) > 0}
                  value={row.due_date.slice(0, 7)}
                  onChange={(e) => {
                    try {
                      edit(n, {
                        due_date: civilDateInMonth(
                          e.target.value,
                          Number(value.firstDue.slice(8)) || 1,
                        ),
                      });
                    } catch {
                      setError("Escolha um mês válido.");
                    }
                  }}
                />
              </label>
            ))}
          </div>
        </details>
      )}
      <ol className="f28-entry-installments">
        {rows.map((row, n) => (
          <li key={row.id}>
            <div className="f28-entry-installment-number">
              <strong>{String(n + 1).padStart(2, "0")}</strong>
              <span>
                {(row.settled_cents || 0) > 0
                  ? `Liquidado: R$ ${centsToInput(row.settled_cents!)}`
                  : "Em aberto"}
              </span>
            </div>
            <EntryField id={`${id}-${n}-date`} label="Vencimento">
              <Input
                id={`${id}-${n}-date`}
                type="date"
                value={row.due_date}
                disabled={disabled || (row.settled_cents || 0) > 0}
                onChange={(e) => edit(n, { due_date: e.target.value })}
              />
            </EntryField>
            <EntryField id={`${id}-${n}-amount`} label="Valor (R$)">
              <FinancialCentsInput
                id={`${id}-${n}-amount`}
                value={row.amount_cents}
                disabled={disabled || (row.settled_cents || 0) > 0}
                onChange={(amount) => edit(n, { amount_cents: amount })}
              />
            </EntryField>
            <EntryField id={`${id}-${n}-method`} label="Meio da parcela">
              <select
                id={`${id}-${n}-method`}
                value={row.method || ""}
                disabled={disabled || (row.settled_cents || 0) > 0}
                onChange={(e) =>
                  edit(n, {
                    method: (e.target.value || null) as PaymentMethod | null,
                  })
                }
              >
                <option value="">Não informado</option>
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </EntryField>
          </li>
        ))}
      </ol>
      <div className="f28-entry-plan-total" role="status">
        <span>
          {rows.length} {rows.length === 1 ? "previsão" : "parcelas"} · R${" "}
          {Number.isFinite(sum) ? centsToInput(sum) : "—"}
        </span>
        <strong data-error={difference !== 0 || undefined}>
          {difference === 0
            ? "Soma conferida"
            : Number.isFinite(difference)
              ? `Diferença: R$ ${centsToInput(difference)}`
              : "Confira os valores"}
        </strong>
      </div>
      {rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.due_date)) && (
        <p className="f28-entry-plan-period">
          Período:{" "}
          {[...rows]
            .map((r) => r.due_date)
            .sort()[0]
            .split("-")
            .reverse()
            .join("/")}{" "}
          a{" "}
          {[...rows]
            .map((r) => r.due_date)
            .sort()
            .at(-1)!
            .split("-")
            .reverse()
            .join("/")}
        </p>
      )}
      {value.unassigned !== 0 && (
        <p className="f28-entry-warning">
          R$ {centsToInput(value.unassigned)} de liquidação anterior ainda sem
          atribuição a parcelas. Nenhum pagamento será inventado ou
          redistribuído ao salvar.
        </p>
      )}
      {error && (
        <p className="f28-entry-error" role="alert">
          {error}
        </p>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="f28-entry-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Redistribuir o cronograma?</AlertDialogTitle>
            <AlertDialogDescription>
              Datas e valores personalizados das parcelas em aberto serão
              substituídos. Parcelas com liquidação serão preservadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter parcelas</AlertDialogCancel>
            <AlertDialogAction onClick={regenerate}>
              Redistribuir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
