import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
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
import {
  civilToday,
  fetchPaymentPlan,
  financialEntryRpc,
  FinancialEntryError,
  PAYMENT_METHODS,
  type PaymentPlan,
} from "./financialEntryApi";
import { centsToInput, parseCents } from "./financialExpensesApi";
import { useFinancialExpenseCapabilities } from "./useFinancialExpenseCapabilities";
import {
  FinancialConfirmationContent as AlertDialogContent,
  EntryField,
  FinancialInfo,
} from "./FinancialEntryFields";
import "@/styles/financial-entry-composer.css";

export function FinancialPaymentPlanPanel({
  editionId,
  type,
  sourceId,
}: {
  editionId: string;
  type: "receita" | "despesa";
  sourceId: string;
}) {
  const { orgId } = useCurrentOrg();
  const caps = useFinancialExpenseCapabilities(orgId);
  const qc = useQueryClient();
  const key = [
    "financial-operational",
    "payment-plan",
    orgId,
    editionId,
    sourceId,
  ];
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchPaymentPlan(orgId!, editionId, type, sourceId),
    enabled: Boolean(orgId) && caps.canAccess,
    retry: false,
  });
  const [amounts, setAmounts] = useState<Record<string, string>>({}),
    [date, setDate] = useState(civilToday),
    [method, setMethod] = useState(""),
    [assignTo, setAssignTo] = useState<string | null>(null);
  const [reverse, setReverse] = useState<string | null>(null),
    [reason, setReason] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const keys = useRef(new Map<string, string>()),
    frozen = useRef<{ name: string; args: Record<string, unknown> } | null>(
      null,
    ),
    busy = useRef(false);
  const mutation = useMutation<
    unknown,
    Error,
    { name: string; args: Record<string, unknown> }
  >({
    mutationFn: async (request) => {
      const input = request as { name: string; args: Record<string, unknown> };
      const result = await financialEntryRpc(input.name, input.args);
      try {
        const fresh = await fetchPaymentPlan(orgId!, editionId, type, sourceId);
        qc.setQueryData(key, fresh);
      } catch {
        throw new FinancialEntryError(
          "Movimento confirmado; releitura pendente. Repita a mesma tentativa.",
          undefined,
          true,
        );
      }
      await qc.invalidateQueries({ queryKey: ["financial-operational"] });
      return result;
    },
    onSuccess: () => {
      setAmounts({});
      setAssignTo(null);
      setReverse(null);
      setReason("");
      setUncertain(false);
      frozen.current = null;
    },
    onError: (e) => {
      if (e instanceof FinancialEntryError && e.uncertain) setUncertain(true);
    },
  });
  const run = async (name: string, args: Record<string, unknown>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (uncertain && frozen.current) {
        await mutation.mutateAsync(frozen.current);
        return;
      }
      const content = JSON.stringify([name, args]);
      if (!keys.current.has(content))
        keys.current.set(content, crypto.randomUUID());
      const input = {
        name,
        args: { ...args, _request_id: keys.current.get(content) },
      };
      frozen.current = input;
      await mutation.mutateAsync(input);
    } catch {
      /* Keep exact request and editable amounts for definitive validation errors. */
    } finally {
      busy.current = false;
    }
  };
  if (!caps.canAccess) return null;
  if (query.isLoading) return <p role="status">Consultando cronograma…</p>;
  if (query.isError)
    return (
      <p role="alert">
        Não foi possível consultar o cronograma.{" "}
        <button type="button" onClick={() => void query.refetch()}>
          Tentar novamente
        </button>
      </p>
    );
  const plan = query.data;
  if (!plan)
    return (
      <p className="f28-plan-empty">
        Sem cronograma cadastrado. A edição do lançamento permite definir seus
        vencimentos.
      </p>
    );
  let sum = 0,
    valid = true;
  for (const value of Object.values(amounts)) {
    try {
      sum += parseCents(value) || 0;
    } catch {
      valid = false;
    }
  }
  const locked =
    !caps.canSettle || !plan.active || mutation.isPending || uncertain;
  const installments = plan.installments
    .map((i) => ({
      installment_id: i.id,
      amount_cents: (() => {
        try {
          return parseCents(amounts[i.id] || "") || 0;
        } catch {
          return 0;
        }
      })(),
    }))
    .filter((i) => i.amount_cents > 0);
  const record = () => {
    if (assignTo)
      return void run("financial_assign_installments", {
        _org_id: orgId,
        _allocation_id: assignTo,
        _details: installments,
      });
    return void run("financial_record_movement", {
      _org_id: orgId,
      _payload: {
        edition_id: editionId,
        kind: type === "receita" ? "recebimento" : "pagamento",
        direction: type === "receita" ? "entrada" : "saida",
        amount_cents: sum,
        occurred_on: date,
        method: method || null,
      },
      _allocations: [
        { obligation_id: plan.obligation_id, amount_cents: sum, installments },
      ],
    });
  };
  return (
    <section className="f28-plan-panel" aria-label="Cronograma e liquidação">
      <header>
        <h3>Vencimentos e liquidação</h3>
        <FinancialInfo label="Liquidação das parcelas">
          O caixa considera apenas movimentos. O detalhamento por parcela
          distribui a alocação da obrigação e não acrescenta outro valor ao
          caixa.
        </FinancialInfo>
      </header>
      <p>
        {plan.condition === "avista"
          ? "À vista"
          : `${plan.installments.length} parcelas`}{" "}
        ·{" "}
        {plan.default_method
          ? PAYMENT_METHODS[plan.default_method]
          : "Meio não informado"}{" "}
        · R$ {centsToInput(plan.total_cents)}
      </p>
      <dl className="f28-plan-balances">
        <div>
          <dt>Liquidado líquido</dt>
          <dd>R$ {centsToInput(plan.settled_cents)}</dd>
        </div>
        <div>
          <dt>Saldo da obrigação</dt>
          <dd>
            {plan.obligation_id
              ? `R$ ${centsToInput(plan.total_cents - plan.settled_cents)}`
              : "Previsão sem obrigação exigível"}
          </dd>
        </div>
      </dl>
      {plan.unassigned_settled_cents !== 0 && (
        <p className="f28-entry-warning">
          R$ {centsToInput(plan.unassigned_settled_cents)} liquidado(s)
          anteriormente ainda sem atribuição às parcelas. O saldo da obrigação
          já considera esses movimentos.
        </p>
      )}
      {assignTo && (
        <p className="f28-entry-warning">
          Distribua o movimento existente nas parcelas. Esta ação não cria outro
          pagamento.{" "}
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              setAssignTo(null);
              setAmounts({});
            }}
          >
            Cancelar atribuição
          </button>
        </p>
      )}
      <ol className="f28-plan-rows">
        {plan.installments.map((i) => {
          const paid = i.settled_cents || 0;
          return (
            <li key={i.id}>
              <div>
                <strong>Parcela {i.sequence}</strong>
                <time dateTime={i.due_date}>
                  {i.due_date.split("-").reverse().join("/")}
                </time>
              </div>
              <div>
                <span>R$ {centsToInput(i.amount_cents)}</span>
                <small>
                  {paid === i.amount_cents
                    ? "Liquidada"
                    : paid > 0
                      ? "Parcialmente liquidada"
                      : "Em aberto"}
                  {i.method ? ` · ${PAYMENT_METHODS[i.method]}` : ""}
                </small>
              </div>
              {caps.canSettle &&
                plan.obligation_id &&
                plan.active &&
                paid < i.amount_cents && (
                  <EntryField
                    id={`settle-${i.id}`}
                    label={assignTo ? "Atribuir (R$)" : "Liquidar agora (R$)"}
                  >
                    <Input
                      id={`settle-${i.id}`}
                      inputMode="decimal"
                      value={amounts[i.id] || ""}
                      disabled={locked}
                      onChange={(e) =>
                        setAmounts((old) => ({
                          ...old,
                          [i.id]: e.target.value,
                        }))
                      }
                    />
                  </EntryField>
                )}
            </li>
          );
        })}
      </ol>
      {caps.canSettle && plan.obligation_id && plan.active && (
        <div className="f28-plan-settlement">
          <div>
            {!assignTo && (
              <>
                <EntryField
                  id={`settle-date-${sourceId}`}
                  label="Data do movimento"
                >
                  <Input
                    id={`settle-date-${sourceId}`}
                    type="date"
                    disabled={locked}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </EntryField>
                <EntryField
                  id={`settle-method-${sourceId}`}
                  label="Meio efetivamente utilizado"
                >
                  <select
                    id={`settle-method-${sourceId}`}
                    disabled={locked}
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option value="">Não informado</option>
                    {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </EntryField>
              </>
            )}
          </div>
          <Button
            type="button"
            disabled={
              mutation.isPending ||
              (!uncertain && (!valid || sum <= 0 || (!assignTo && !date)))
            }
            onClick={() =>
              uncertain && frozen.current
                ? void run(frozen.current.name, frozen.current.args)
                : record()
            }
          >
            {mutation.isPending
              ? "Confirmando…"
              : uncertain
                ? "Verificar e repetir tentativa"
                : assignTo
                  ? `Atribuir R$ ${centsToInput(sum)}`
                  : `Registrar ${type === "receita" ? "recebimento" : "pagamento"} de R$ ${centsToInput(sum)}`}
          </Button>
        </div>
      )}
      {mutation.error && (
        <p className="f28-entry-error" role="alert">
          {mutation.error.message}
        </p>
      )}
      {plan.movements.length > 0 && (
        <details>
          <summary>Movimentos registrados ({plan.movements.length})</summary>
          <ul className="f28-plan-movements">
            {plan.movements.map((m) => (
              <li key={m.id}>
                <span>
                  {m.occurred_on.split("-").reverse().join("/")} ·{" "}
                  {m.kind === "estorno"
                    ? "Estorno"
                    : m.amount_cents > 0
                      ? "Liquidação"
                      : "Devolução"}{" "}
                  · R$ {centsToInput(m.amount_cents)}
                  {m.reversed ? " · Estornado" : ""}
                </span>
                {caps.canSettle && !m.reversed && m.kind !== "estorno" && (
                  <div>
                    {!m.assigned &&
                      m.amount_cents > 0 &&
                      plan.unassigned_settled_cents > 0 && (
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => {
                            setAssignTo(m.allocation_id);
                            setAmounts({});
                          }}
                        >
                          Atribuir às parcelas
                        </button>
                      )}
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => {
                        setReason("");
                        setReverse(m.id);
                      }}
                    >
                      Estornar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      <AlertDialog
        open={Boolean(reverse)}
        onOpenChange={(v) => !v && !mutation.isPending && setReverse(null)}
      >
        <AlertDialogContent className="f28-entry-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar movimento</AlertDialogTitle>
            <AlertDialogDescription>
              O movimento original permanece no histórico. O estorno reduz as
              mesmas alocações e parcelas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <EntryField id="reversal-reason" label="Motivo" required>
            <Input
              id="reversal-reason"
              minLength={3}
              value={reason}
              disabled={mutation.isPending}
              onChange={(e) => setReason(e.target.value)}
            />
          </EntryField>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={reason.trim().length < 3 || mutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                void run("financial_reverse_movement", {
                  _org_id: orgId,
                  _movement_id: reverse,
                  _reason: reason.trim(),
                  _occurred_on: civilToday(),
                });
              }}
            >
              Confirmar estorno
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
