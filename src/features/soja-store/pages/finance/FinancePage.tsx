import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { storeError, storeRpc, type CommandResult, type StoreScope } from "../../api/store";
import { StoreFailure, StoreField, StoreHeading, StoreState } from "../../components/StoreElements";
import { dateLabel, readCents, todayInSaoPaulo } from "../../domain/purchases";
import { useStoreCommand } from "../../hooks/useStoreCommand";
import { useUnsavedStoreForm } from "../../hooks/useUnsavedStoreForm";

type Props = { scope: StoreScope; queryKey: readonly unknown[]; canManage: boolean };
type Command = { version?: number | null; values: Record<string, string | number | null> };
type Budget = { id: string; category: string; approved_cents: string; realized_cents: string; committed_cents: string; available_cents: string; reference: string; version: number };
type Summary = {
  approved_cents: string | null; realized_cents: string; committed_cents: string; available_cents: string | null;
  recognized_receivable_cents: string; payable_remaining_cents: string; receivable_remaining_cents: string;
  paid_cents: string; received_cents: string; overdue_count: number; budgets: Budget[];
};
type Obligation = {
  id: string; kind: "payable" | "receivable"; category: string; description: string; occurred_on: string; due_on: string;
  amount_cents: string; original_cents: string; settled_cents: string; remaining_cents: string; reference: string; purchase_id: string | null;
  operation_id: string | null; version: number; status: keyof typeof statuses;
};
type Settlement = {
  id: string; occurred_on: string; amount_cents: string; method: keyof typeof methods;
  reference: string; reverses_id: string | null; can_reverse: boolean;
};
type Purchase = { id: string; supplier_name: string; ordered_on: string; reference: string | null; total_cents: string };
type Page<T> = { total: number; items: T[] };

const statuses = { open: "Em aberto", partial: "Parcial", overdue: "Vencida", settled: "Liquidada", cancelled: "Cancelada" } as const;
const kinds = { payable: "A pagar", receivable: "A receber" } as const;
const methods = { cash: "Dinheiro", pix: "PIX", card: "Cartão", transfer: "Transferência", other: "Outro" } as const;
const digits = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

function money(value: string | null) {
  if (value === null) return "Sem orçamento aprovado";
  const cents = BigInt(value);
  const abs = cents < 0 ? -cents : cents;
  return `${cents < 0 ? "−" : ""}R$ ${digits.format(abs / 100n)},${String(abs % 100n).padStart(2, "0")}`;
}

function moneyInput(value: string) {
  const cents = BigInt(value);
  return `${cents / 100n},${String(cents % 100n).padStart(2, "0")}`;
}

function financeError(error: unknown) {
  const messages: Record<string, string> = {
    SOJA_STORE_FINANCE_DUPLICATE_BUDGET: "Já existe orçamento para esta categoria neste ano.",
    SOJA_STORE_FINANCE_PURCHASE_RECOGNIZED: "Este pedido já tem um título financeiro.",
    SOJA_STORE_FINANCE_PURCHASE_PERIOD: "A data de reconhecimento deve ser igual ou posterior à data do pedido.",
    SOJA_STORE_FINANCE_ALREADY_REVERSED: "Essa baixa já foi estornada.",
    SOJA_STORE_FINANCE_SETTLEMENT_LIMIT: "O valor supera o saldo disponível para esta movimentação.",
    SOJA_STORE_FINANCE_INVALID_DATE: "Confira a data em relação ao título, à baixa e ao dia de hoje.",
    SOJA_STORE_FINANCE_INVALID_OBLIGATION: "Confira as datas e os dados do título. O vencimento deve ser igual ou posterior ao reconhecimento.",
    SOJA_STORE_FINANCE_USE_SALE_ORIGIN: "Movimente este título na operação de origem.",
  };
  const message = (error as { message?: string } | null)?.message ?? "";
  return messages[message] ?? storeError(error);
}

function EntryForm({ scope, queryKey, name, label, values, children, onSaved }: Pick<Props, "scope" | "queryKey"> & {
  name: `soja_store_${string}`;
  label: string;
  values: (data: FormData) => Command | null;
  children: ReactNode;
  onSaved: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState("");
  const client = useQueryClient();
  const command = useStoreCommand<Command>(scope, (request, payload) => storeRpc<CommandResult>(name, {
    ...scope, _request_id: request, _payload: payload.values,
    ...(payload.version !== undefined ? { _expected_version: payload.version } : {}),
  }), () => {
    setDirty(false);
    void client.invalidateQueries({ queryKey: [...queryKey, "finance"] });
    onSaved();
  });
  useUnsavedStoreForm(dirty);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (command.isPending || command.isUncertain) return;
    const payload = values(new FormData(event.currentTarget));
    setValidation(payload ? "" : "Confira os valores informados e use até duas casas decimais.");
    if (payload) command.mutate(payload);
  }

  return (
    <form onSubmit={submit} onChange={() => setDirty(true)} className="grid gap-3" aria-busy={command.isPending}>
      <fieldset disabled={command.isPending || command.isUncertain} className="grid min-w-0 gap-3 sm:grid-cols-2">{children}</fieldset>
      {validation && <StoreFailure message={validation} />}
      {command.isError && <StoreFailure message={financeError(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
      <div><Button type="submit" className="ss-primary" disabled={command.isPending || command.isUncertain}>{command.isPending ? "Salvando…" : label}</Button></div>
    </form>
  );
}

function TextField({ id, name, label, defaultValue, maxLength = 160, minLength = 2 }: {
  id: string; name: string; label: string; defaultValue?: string; maxLength?: number; minLength?: number;
}) {
  return <StoreField id={id} label={label}><input id={id} name={name} required defaultValue={defaultValue} maxLength={maxLength} minLength={minLength} /></StoreField>;
}

function AmountField({ id, label, defaultValue }: { id: string; label: string; defaultValue?: string }) {
  return <StoreField id={id} label={label}><input id={id} name="amount" required defaultValue={defaultValue} inputMode="decimal" maxLength={16} placeholder="0,00" /></StoreField>;
}

function DateField({ id, label, name, max, min, defaultValue }: {
  id: string; label: string; name: string; max?: string; min?: string; defaultValue?: string;
}) {
  return <StoreField id={id} label={label}><input id={id} name={name} type="date" required max={max} min={min} defaultValue={defaultValue} /></StoreField>;
}

const val = (data: FormData, field: string) => String(data.get(field) ?? "").trim();
const paidOn = todayInSaoPaulo;
const reference = { name: "reference", minLength: 4, maxLength: 600 };

function BudgetEditor({ scope, queryKey, year, budget, done }: Pick<Props, "scope" | "queryKey"> & {
  year: number; budget?: Budget; done: () => void;
}) {
  const id = budget?.id ?? "new";
  return <EntryForm scope={scope} queryKey={queryKey} name="soja_store_save_budget" label="Salvar orçamento" onSaved={done} values={(data) => {
    const amount = readCents(val(data, "amount"));
    return amount === null ? null : { version: budget?.version ?? null, values: {
      id: budget?.id ?? null, year, category: budget?.category ?? val(data, "category"), approved_cents: amount, reference: val(data, "reference"),
    } };
  }}>
    {budget ? <p className="sm:col-span-2 font-medium">{budget.category}</p> : <TextField id={`ss-fin-budget-${id}-category`} name="category" label="Categoria" maxLength={100} />}
    <AmountField id={`ss-fin-budget-${id}-amount`} label="Valor aprovado (R$)" defaultValue={budget && moneyInput(budget.approved_cents)} />
    <TextField id={`ss-fin-budget-${id}-ref`} {...reference} label="Documento de aprovação ou revisão" defaultValue={budget?.reference} />
  </EntryForm>;
}

function RecognizeForm({ scope, queryKey, year, done }: Pick<Props, "scope" | "queryKey"> & { year: number; done: () => void }) {
  const [origin, setOrigin] = useState<"manual" | "purchase">("manual");
  const [search, setSearch] = useState("");
  const [purchaseId, setPurchaseId] = useState("");
  const options = useQuery({
    queryKey: [...queryKey, "finance", "purchase-options", year, search],
    queryFn: () => storeRpc<Purchase[]>("soja_store_finance_purchase_options", { ...scope, _year: year, _search: search || null }),
    enabled: origin === "purchase", meta: { persist: false },
  });
  const purchase = options.data?.find((row) => row.id === purchaseId);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const maximum = yearEnd < paidOn() ? yearEnd : paidOn();

  return <EntryForm scope={scope} queryKey={queryKey} name="soja_store_recognize_obligation" label="Reconhecer título" onSaved={done} values={(data) => {
    const base = { occurred_on: val(data, "occurred_on"), due_on: val(data, "due_on"), reference: val(data, "reference") };
    if (origin === "purchase") return purchase ? { values: { ...base, purchase_id: purchase.id } } : null;
    const amount = readCents(val(data, "amount"));
    return !amount ? null : { values: { ...base, amount_cents: amount, kind: val(data, "kind"), category: val(data, "category"), description: val(data, "description") } };
  }}>
    <StoreField id="ss-fin-origin" label="Origem do título"><select id="ss-fin-origin" value={origin} onChange={(event) => setOrigin(event.target.value as typeof origin)}>
      <option value="manual">Lançamento da loja</option><option value="purchase">Pedido de compra</option>
    </select></StoreField>
    {origin === "purchase" ? <>
      <StoreField id="ss-fin-purchase-search" label="Buscar pedido por fornecedor ou referência">
        <input id="ss-fin-purchase-search" type="search" value={search} maxLength={120} onChange={(event) => { setSearch(event.target.value); setPurchaseId(""); }} />
      </StoreField>
      {options.isPending ? <p role="status">Carregando pedidos…</p> : options.isError ?
        <StoreFailure message={financeError(options.error)} retry={() => void options.refetch()} /> :
        <StoreField id="ss-fin-purchase" label="Pedido com valor a reconhecer">
          <select id="ss-fin-purchase" value={purchaseId} onChange={(event) => setPurchaseId(event.target.value)} required>
            <option value="">{options.data.length ? "Selecione o pedido" : "Nenhum pedido elegível"}</option>
            {options.data.map((item) => <option key={item.id} value={item.id}>{item.supplier_name} · {dateLabel(item.ordered_on)} · {money(item.total_cents)}{item.reference ? ` · ${item.reference}` : ""}</option>)}
          </select>
        </StoreField>}
    </> : <>
      <StoreField id="ss-fin-kind" label="Tipo de título"><select id="ss-fin-kind" name="kind"><option value="payable">A pagar</option><option value="receivable">A receber</option></select></StoreField>
      <TextField id="ss-fin-description" name="description" label="Descrição" />
      <TextField id="ss-fin-category" name="category" label="Categoria" maxLength={100} />
      <AmountField id="ss-fin-amount" label="Valor do título (R$)" />
    </>}
    <DateField id="ss-fin-recognized-on" name="occurred_on" label="Data de reconhecimento" min={purchase && purchase.ordered_on > yearStart ? purchase.ordered_on : yearStart} max={maximum} defaultValue={maximum} />
    <DateField id="ss-fin-due-on" name="due_on" label="Vencimento" min={yearStart} />
    <TextField id="ss-fin-obligation-reference" {...reference} label="Referência ou evidência" />
  </EntryForm>;
}

function SettlementEditor({ scope, queryKey, entry, original, done }: Pick<Props, "scope" | "queryKey"> & {
  entry: Obligation; original?: Settlement; done: () => void;
}) {
  const suffix = original?.id ?? entry.id;
  return <EntryForm scope={scope} queryKey={queryKey} name={original ? "soja_store_reverse_settlement" : "soja_store_settle_obligation"}
    label={original ? "Confirmar estorno" : "Registrar baixa"} onSaved={done} values={(data) => {
      const values = { obligation_id: entry.id, occurred_on: val(data, "occurred_on"), reference: val(data, "reference") };
      if (original) return { version: entry.version, values: { ...values, settlement_id: original.id } };
      const amount = readCents(val(data, "amount"));
      return !amount ? null : { version: entry.version, values: { ...values, amount_cents: amount, method: val(data, "method") } };
    }}>
    {original ? <p className="sm:col-span-2">Valor da baixa a estornar · <strong>{money(original.amount_cents)}</strong></p> : <>
      <AmountField id={`ss-fin-settle-${suffix}-amount`} label="Valor da baixa (R$)" />
      <StoreField id={`ss-fin-method-${suffix}`} label="Forma de liquidação">
        <select id={`ss-fin-method-${suffix}`} name="method">{Object.entries(methods).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select>
      </StoreField>
    </>}
    <DateField id={`ss-fin-date-${suffix}`} label={original ? "Data do estorno" : "Data da liquidação"} name="occurred_on"
      min={original?.occurred_on ?? entry.occurred_on} max={paidOn()} defaultValue={paidOn()} />
    <TextField id={`ss-fin-settle-${suffix}-ref`} {...reference} label={original ? "Motivo e referência do estorno" : "Referência da liquidação"} />
  </EntryForm>;
}

function Pagination({ page, count, size, onChange }: { page: number; count: number; size: number; onChange: (page: number) => void }) {
  const last = Math.ceil(count / size);
  if (page === 1 && last <= 1) return null;
  return <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-2">
    <Button type="button" variant="outline" onClick={() => onChange(page - 1)} disabled={page <= 1}>Anterior</Button>
    <span className="text-sm">Página {page} de {Math.max(last, 1)}</span>
    <Button type="button" variant="outline" onClick={() => onChange(page + 1)} disabled={page >= last}>Próxima</Button>
  </nav>;
}

function EntryDetails({ scope, queryKey, canManage, entry }: Props & { entry: Obligation }) {
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<"settle" | Settlement>();
  const size = 15;
  const settlements = useQuery({
    queryKey: [...queryKey, "finance", "settlements", entry.id, page],
    queryFn: () => storeRpc<Page<Settlement>>("soja_store_finance_settlements", { ...scope, _obligation_id: entry.id, _limit: size, _offset: (page - 1) * size }),
    meta: { persist: false },
  });
  return <div className="grid gap-4 border-t pt-3">
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      <div><dt className="font-semibold">Reconhecido em</dt><dd>{dateLabel(entry.occurred_on)}</dd></div>
      <div><dt className="font-semibold">Referência</dt><dd className="break-words">{entry.reference}</dd></div>
      {entry.original_cents !== entry.amount_cents && <div><dt className="font-semibold">Valor original</dt><dd>{money(entry.original_cents)}</dd></div>}
      <div><dt className="font-semibold">Liquidado</dt><dd>{money(entry.settled_cents)}</dd></div>
      <div><dt className="font-semibold">Saldo</dt><dd>{money(entry.remaining_cents)}</dd></div>
    </dl>
    {entry.purchase_id && <Link to={`/comissoes/soja-store/compras/${entry.purchase_id}`} className="w-fit py-2 font-semibold underline">Abrir pedido de compra</Link>}
    {entry.operation_id && <Link to={`/comissoes/soja-store/vendas?venda=${entry.operation_id}`} className="w-fit py-2 font-semibold underline">Abrir operação</Link>}
    {canManage && !entry.operation_id && entry.remaining_cents !== "0" && <div><Button type="button" variant="outline" onClick={() => setForm(form === "settle" ? undefined : "settle")}>Registrar baixa</Button></div>}
    {form === "settle" && <SettlementEditor scope={scope} queryKey={queryKey} entry={entry} done={() => setForm(undefined)} />}
    <h3 className="font-semibold">Histórico de baixas</h3>
    {settlements.isPending ? <p role="status">Carregando histórico…</p> : settlements.isError ?
      <StoreFailure message={financeError(settlements.error)} retry={() => void settlements.refetch()} /> : <>
        {settlements.data.items.length === 0 && <p className="text-sm">Nenhuma baixa registrada neste título.</p>}
        <ul className="divide-y">
          {settlements.data.items.map((item) => <li className="grid gap-2 py-3" key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm"><strong>{money(item.amount_cents)}</strong> · {dateLabel(item.occurred_on)} · {methods[item.method] ?? item.method}</p>
              {canManage && item.can_reverse && <Button type="button" variant="outline" onClick={() => setForm(form === item ? undefined : item)}>Estornar baixa</Button>}
            </div>
            <p className="break-words text-sm text-[var(--ss-muted)]">{item.reverses_id ? "Estorno · " : ""}{item.reference}</p>
            {form && form !== "settle" && form.id === item.id && <SettlementEditor scope={scope} queryKey={queryKey} entry={entry} original={item} done={() => setForm(undefined)} />}
          </li>)}
        </ul>
        <Pagination page={page} count={settlements.data.total} size={size} onChange={setPage} />
      </>}
  </div>;
}

const size = 25;
export function FinancePage({ scope, queryKey, canManage }: Props) {
  const [params, setParams] = useSearchParams();
  const [budget, setBudget] = useState<string>();
  const [newEntry, setNewEntry] = useState(false);
  const [expanded, setExpanded] = useState<string>();
  const [periodDraft, setPeriodDraft] = useState<string>();
  const [notice, setNotice] = useState("");
  const current = Number(paidOn().slice(0, 4));
  const requested = Number(params.get("ano"));
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2200 ? requested : current;
  const requestedStatus = params.get("situacao");
  const requestedKind = params.get("tipo");
  const status = requestedStatus && Object.prototype.hasOwnProperty.call(statuses, requestedStatus) ? requestedStatus : "";
  const kind = requestedKind && Object.prototype.hasOwnProperty.call(kinds, requestedKind) ? requestedKind : "";
  const page = Math.min(100000, Math.max(1, Number.parseInt(params.get("pagina") ?? "", 10) || 1));
  const summary = useQuery({ queryKey: [...queryKey, "finance", "summary", year],
    queryFn: () => storeRpc<Summary>("soja_store_finance_summary", { ...scope, _year: year }), meta: { persist: false } });
  const entries = useQuery({ queryKey: [...queryKey, "finance", "entries", year, kind, status, page],
    queryFn: () => storeRpc<Page<Obligation>>("soja_store_finance_entries", {
      ...scope, _year: year, _kind: kind || null, _status: status || null, _limit: size, _offset: (page - 1) * size,
    }), meta: { persist: false } });

  function updateFilters(change: Record<string, string>) {
    const next = new URLSearchParams(params);
    next.delete("pagina");
    for (const [key, value] of Object.entries(change)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    setParams(next);
    setExpanded(undefined);
  }

  const cards: [string, string | null][] = summary.data ? [
    ["Orçamento aprovado", summary.data.approved_cents],
    ["Comprometido em pedidos", summary.data.committed_cents],
    ["Realizado em títulos a pagar", summary.data.realized_cents],
    ["Saldo disponível", summary.data.available_cents],
    ["Recebíveis reconhecidos", summary.data.recognized_receivable_cents],
    ["Em aberto a receber", summary.data.receivable_remaining_cents],
    ["Em aberto a pagar", summary.data.payable_remaining_cents],
    ["Pagamentos no ano", summary.data.paid_cents],
    ["Recebimentos no ano", summary.data.received_cents],
  ] : [];

  return <>
    <StoreHeading title="Financeiro da loja" description="Acompanhe orçamento, títulos e liquidações da Soja Store." />
    <form className="ss-surface flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault();
      updateFilters({ ano: periodDraft ?? String(year) });
      setBudget(undefined); setNewEntry(false); setPeriodDraft(undefined);
    }}>
      <StoreField id="ss-fin-year" label="Ano de competência">
        <input id="ss-fin-year" type="number" min={2000} max={2200} required value={periodDraft ?? year} onChange={(event) => setPeriodDraft(event.target.value)} />
      </StoreField>
      <Button type="submit" variant="outline">Consultar ano</Button>
    </form>
    {notice && <p role="status" className="text-sm font-semibold">{notice}</p>}
    {summary.isPending ? <StoreState title="Carregando orçamento" busy /> : summary.isError ?
      <StoreFailure message={financeError(summary.error)} retry={() => void summary.refetch()} /> : <>
        <section className="ss-surface grid gap-3" aria-labelledby="ss-fin-summary-title">
          <h2 id="ss-fin-summary-title">Resumo do ano</h2>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value]) => <div className="min-w-0 rounded-lg border p-3" key={label}>
            <dt className="text-sm">{label}</dt><dd className="break-words font-semibold">{money(value)}</dd>
          </div>)}</dl>
          {summary.data.overdue_count > 0 && <Button type="button" variant="outline" className="w-fit" onClick={() => updateFilters({ situacao: "overdue", tipo: "" })}>
            Ver {summary.data.overdue_count} {summary.data.overdue_count === 1 ? "título vencido" : "títulos vencidos"}
          </Button>}
        </section>
        <section className="ss-surface grid gap-3" aria-labelledby="ss-fin-budgets">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="ss-fin-budgets">Orçamento por categoria</h2>
            {canManage && <Button type="button" variant="outline" onClick={() => setBudget(budget === "new" ? undefined : "new")}>Nova categoria de orçamento</Button>}
          </div>
          {budget === "new" && <BudgetEditor scope={scope} queryKey={queryKey} year={year} done={() => { setBudget(undefined); setNotice("Orçamento salvo."); }} />}
          {summary.data.budgets.length === 0 && <p className="text-sm text-[var(--ss-muted)]">Nenhuma categoria com orçamento aprovado neste ano.</p>}
          <ul className="divide-y">
            {summary.data.budgets.map((row) => <li key={row.id} className="grid gap-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="break-words font-semibold">{row.category}</h3>
                {canManage && <Button type="button" variant="outline" onClick={() => setBudget(budget === row.id ? undefined : row.id)}>Revisar valor</Button>}
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {([["Aprovado", row.approved_cents], ["Comprometido", row.committed_cents], ["Realizado", row.realized_cents], ["Disponível", row.available_cents]] as const)
                  .map(([label, value]) => <div className="min-w-0" key={label}><dt>{label}</dt><dd className="break-words font-medium">{money(value)}</dd></div>)}
              </dl>
              <p className="break-words text-sm text-[var(--ss-muted)]">{row.reference}</p>
              {budget === row.id && <BudgetEditor scope={scope} queryKey={queryKey} year={year} budget={row} done={() => { setBudget(undefined); setNotice("Orçamento revisado."); }} />}
            </li>)}
          </ul>
        </section>
      </>}
    <section className="ss-surface grid gap-3" aria-labelledby="ss-fin-entries">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="ss-fin-entries">Títulos a pagar e a receber</h2>
        {canManage && <Button type="button" className="ss-primary" onClick={() => setNewEntry(!newEntry)}>{newEntry ? "Fechar cadastro" : "Reconhecer título"}</Button>}
      </div>
      {newEntry && <RecognizeForm scope={scope} queryKey={queryKey} year={year} done={() => { setNewEntry(false); setNotice("Título reconhecido."); }} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <StoreField id="ss-fin-kind-filter" label="Tipo"><select id="ss-fin-kind-filter" value={kind} onChange={(event) => updateFilters({ tipo: event.target.value })}>
          <option value="">Todos</option>{Object.entries(kinds).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></StoreField>
        <StoreField id="ss-fin-status-filter" label="Situação"><select id="ss-fin-status-filter" value={status} onChange={(event) => updateFilters({ situacao: event.target.value })}>
          <option value="">Todas</option>{Object.entries(statuses).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></StoreField>
      </div>
      {entries.isPending ? <StoreState title="Carregando títulos" busy /> : entries.isError ?
        <StoreFailure message={financeError(entries.error)} retry={() => void entries.refetch()} /> : <>
          {!entries.data.items.length && <p role="status" className="text-sm text-[var(--ss-muted)]">Nenhum título para este recorte.</p>}
          <ul className="divide-y">
            {entries.data.items.map((entry) => <li key={entry.id} className="grid gap-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words font-semibold">{entry.description}</h3>
                  <p className="break-words text-sm text-[var(--ss-muted)]">{kinds[entry.kind]} · {entry.category} · vence em {dateLabel(entry.due_on)}</p>
                  <p className="text-sm"><strong>{money(entry.amount_cents)}</strong> · {statuses[entry.status]}</p>
                </div>
                <Button type="button" variant="outline" aria-expanded={expanded === entry.id} onClick={() => setExpanded(expanded === entry.id ? undefined : entry.id)}>Ver título</Button>
              </div>
              {expanded === entry.id && <EntryDetails scope={scope} queryKey={queryKey} canManage={canManage} entry={entry} />}
            </li>)}
          </ul>
          <Pagination page={page} count={entries.data.total} size={size} onChange={(next) => updateFilters({ pagina: String(next) })} />
        </>}
    </section>
  </>;
}
