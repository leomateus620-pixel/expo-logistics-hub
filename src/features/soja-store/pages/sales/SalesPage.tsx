import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShoppingBag } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PurchaseOption } from "../../components/PurchaseOption";
import { StoreFailure, StoreField, StoreFilters, StoreHeading, StoreState } from "../../components/StoreElements";
import { StoreFormDialog } from "../../components/StoreFormDialog";
import { readOperationalFilters } from "../../domain/operationalFilters";
import { dateLabel, decimalLabel, moneyLabel, readCents, readDecimal, scaledDecimal, type NamedOption } from "../../domain/purchases";
import { storeError, storeRpc, type CommandResult, type StoreScope } from "../../api/store";
import { useStoreCommand } from "../../hooks/useStoreCommand";

type SaleOption = { id: string; product_name: string; sku: string; unit: string; price_id: string; price_cents: number; available: string };
type SaleLine = { id: string; product_name: string; sku: string; unit: string; quantity: string; returned_quantity: string; line_cents: number; returned_cents: number };
type Payment = { id: string; method: string; amount_cents: number; tendered_cents: number | null; fee_cents: number; original_payment_id: string | null };
type Receipt = { number: number; kind: "sale" | "return" | "payment"; snapshot: {
  total_cents?: number; return_cents?: number; received_cents?: number; remaining_cents?: number; lines?: SaleLine[];
} };
type Sale = { id: string; status: string; total_cents: number; version: number; occurred_on: string; location_id: string;
  fiscal_reference: string | null; lines: SaleLine[]; payments: Payment[]; receipts: Receipt[];
  paid_cents?: number; reservation_expires_at?: string | null; delivered_at?: string | null;
  payment_methods?: string[]; reservation_release?: "expired" | "cancelled" | null; };
type Session = { id: string; location_id: string; location_name: string; status: string };
type ScopeProps = { scope: StoreScope; queryKey: readonly unknown[] };
const statuses: Record<string, string> = {
  pending: "Reservada", completed: "Concluída", returned_partially: "Devolvida em parte", returned: "Devolvida", cancelled: "Cancelada",
};
const methods: Record<string, string> = { cash: "Dinheiro", pix: "PIX", card: "Cartão" };
const base = "/comissoes/soja-store";
const pageSize = 30;
const one = 1_000_000n;
const receiptKinds = { sale: "Venda", return: "Devolução", payment: "Pagamento da reserva" };
const localTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
});

function lineCents(quantity: string, unitCents: number) {
  return Number((scaledDecimal(quantity) * BigInt(unitCents) + one / 2n) / one);
}

function saleMessage(error: unknown) {
  const message = String((error as { message?: string })?.message ?? "");
  if (message.includes("STOCK_INSUFFICIENT")) return "O saldo disponível mudou. Atualize a busca e confira a quantidade.";
  if (message.includes("SALE_PRICE_CHANGED")) return "O preço mudou desde a seleção. Atualize a busca e selecione o item novamente.";
  if (message.includes("SALE_PAYMENT_TOTAL")) return "A soma das formas de pagamento precisa corresponder ao total da venda.";
  if (message.includes("SALE_PAYMENT_LIMIT")) return "O pagamento supera o saldo pendente da venda.";
  if (message.includes("SALE_NOT_PAID")) return "Confirme o pagamento integral antes da entrega.";
  if (message.includes("RESERVATION_EXPIRED")) return "O prazo da reserva encerrou sem pagamento confirmado.";
  if (message.includes("RESERVATION_HAS_PAYMENT")) return "A reserva tem pagamento confirmado e precisa de conciliação para cancelar.";
  if (message.includes("RESERVATION_NOT_EXPIRED")) return "O prazo da reserva ainda está vigente.";
  if (message.includes("SALE_REFUND_TOTAL")) return "Distribua o estorno entre os pagamentos até atingir o valor da devolução.";
  if (message.includes("SALE_RETURN_LIMIT") || message.includes("SALE_REFUND_LIMIT")) return "A quantidade ou o valor supera o saldo que pode ser devolvido.";
  return storeError(error);
}

export function SalesPage({ scope, queryKey, canManage, reservationFlow = false }: ScopeProps & { canManage: boolean; reservationFlow?: boolean }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [formContext, setFormContext] = useState<{ sessionId: string; methods: string[] }>();
  const page = Math.max(1, Math.min(333334, Number.parseInt(params.get("pagina") ?? "", 10) || 1));
  const filters = readOperationalFilters(params);
  const confirmed = params.get("situacao") === "confirmadas";
  const start = filters._start ?? "";
  const end = filters._end ?? "";
  const [period, setPeriod] = useState({ start, end });
  useEffect(() => setPeriod({ start, end }), [start, end]);
  const filterCount = Number(confirmed) + Number(!!(start || end)) + Number(!!filters._location_id);
  function saleParams(id?: string) {
    const next = new URLSearchParams(params);
    if (id) next.set("venda", id); else next.delete("venda");
    return next;
  }
  const config = useQuery({
    queryKey: [...queryKey, "pos-config"], meta: { persist: false },
    queryFn: () => storeRpc<{ rule: { active: boolean; methods: string[] } | null; points?: NamedOption[] }>("soja_store_pos_config", scope),
  });
  const cash = useQuery({
    queryKey: [...queryKey, "cash-sessions"], meta: { persist: false }, enabled: canManage,
    queryFn: () => storeRpc<{ items: Session[] }>("soja_store_cash_sessions", scope),
  });
  const sales = useQuery({
    queryKey: [...queryKey, "sales", filters, confirmed, page], meta: { persist: false },
    queryFn: () => storeRpc<{ total: number; items: Sale[] }>("soja_store_sales_filtered", {
      ...scope, ...filters, _confirmed: confirmed, _limit: pageSize, _offset: (page - 1) * pageSize,
    }),
  });
  const selected = params.get("venda");
  const saleDetail = useQuery({
    queryKey: [...queryKey, "sale", selected], meta: { persist: false },
    enabled: !!selected && /^[0-9a-f-]{36}$/i.test(selected),
    queryFn: () => storeRpc<Sale>("soja_store_sale", { ...scope, _sale_id: selected }),
  });
  const sessions = cash.data?.items.filter((session) => session.status === "open") ?? [];
  const rule = config.data?.rule;
  const points = config.data?.points ?? [];
  const location = filters._location_id ?? "";
  const canCreate = canManage && !!rule?.active && !!rule.methods.length && !!sessions.length && !config.isError && !cash.isError;
  const accessDenied = (sales.error as { code?: string } | null)?.code === "42501";

  function refresh() {
    const affected = [
      ["sales"], ["dashboard"], ["stock", "saldos"], ["stock", "movimentos"], ["inventory", "position"],
      ["sale-options"], ["cash-sessions"], ["cash-movements"],
    ];
    if (selected) affected.push(["sale", selected]);
    for (const key of affected) void client.invalidateQueries({ queryKey: [...queryKey, ...key] });
    // Sales and reservations appear in the customer's existing history.
    void client.invalidateQueries({ queryKey: [...queryKey, "customers"], predicate: (query) => query.queryKey[queryKey.length + 2] === "sales" });
  }

  function updateFilters(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    next.delete("pagina");
    setParams(next);
  }

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete("pagina"); else next.set("pagina", String(nextPage));
    setParams(next);
  }

  function clearFilters() {
    setPeriod({ start: "", end: "" });
    updateFilters({ situacao: "", inicio: "", fim: "", local: "" });
  }

  function openCreate() {
    if (!canCreate) return;
    setFormContext({ sessionId: sessions[0].id, methods: rule.methods });
  }

  return (
    <>
      <StoreHeading title="Vendas" icon={ShoppingBag}
        action={canCreate && !accessDenied && (
          <Button type="button" className="ss-primary" data-ss-create-trigger onClick={openCreate}>
            <Plus aria-hidden="true" /> Nova venda
          </Button>
        )}
        controls={<form className="ss-filterbar" onSubmit={(event) => {
          event.preventDefault();
          updateFilters({ inicio: period.start, fim: period.end });
        }}>
          <StoreFilters count={filterCount} onClear={clearFilters}>
            <StoreField id="ss-sale-status-filter" label="Situação">
              <select id="ss-sale-status-filter" value={confirmed ? "confirmadas" : ""} onChange={(event) => updateFilters({ situacao: event.target.value })}>
                <option value="">Todas</option>
                <option value="confirmadas">Confirmadas</option>
              </select>
            </StoreField>
            {(points.length > 0 || location) && <StoreField id="ss-sale-location-filter" label="Local">
              <select id="ss-sale-location-filter" value={location} onChange={(event) => updateFilters({ local: event.target.value })}>
                <option value="">Todos</option>
                {location && !points.some((point) => point.id === location) && <option value={location}>Local selecionado</option>}
                {points.map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}
              </select>
            </StoreField>}
            <StoreField id="ss-sale-date-start" label="Data inicial">
              <input id="ss-sale-date-start" type="date" max={period.end || undefined} value={period.start}
                onChange={(event) => setPeriod({ ...period, start: event.target.value })} />
            </StoreField>
            <StoreField id="ss-sale-date-end" label="Data final">
              <input id="ss-sale-date-end" type="date" min={period.start || undefined} value={period.end}
                onChange={(event) => setPeriod({ ...period, end: event.target.value })} />
            </StoreField>
            <Button type="submit" variant="outline" disabled={period.start === start && period.end === end}>Aplicar período</Button>
          </StoreFilters>
        </form>}
      />
      {canManage && (config.isPending || cash.isPending) && <p role="status" className="ss-filter-note">Verificando disponibilidade do caixa…</p>}
      {canManage && (config.isError || cash.isError) && <StoreFailure message="Falha ao consultar a configuração de vendas." retry={() => {
        void config.refetch();
        void cash.refetch();
      }} />}
      {canManage && config.data && !rule?.active && (
        <StoreState title="Cadastre a regra de venda própria" description="Registre a aprovação e as formas de pagamento em Configurações."
          action={<Button asChild variant="outline"><Link to={`${base}/configuracoes`}>Abrir configurações</Link></Button>} />
      )}
      {canManage && rule?.active && cash.data && !sessions.length && (
        <StoreState title="Abra um caixa para iniciar" description="O ponto de atendimento define de qual estoque saem os itens."
          action={<Button asChild variant="outline"><Link to={`${base}/caixa`}>Abrir caixa</Link></Button>} />
      )}
      {canManage && formContext && (
        <SaleForm scope={scope} queryKey={queryKey} sessions={sessions} initialSessionId={formContext.sessionId}
          ready={canCreate} methodsAllowed={formContext.methods} buyerSelection={reservationFlow}
          close={() => setFormContext(undefined)} done={(id, pending) => {
            setFormContext(undefined);
            refresh();
            toast.success(pending ? "Reserva registrada." : "Venda registrada.", {
              action: { label: "Ver venda", onClick: () => navigate({ pathname: `${base}/vendas`, search: saleParams(id).toString() }) },
            });
          }} />
      )}
      {selected && (
        <section className="ss-surface space-y-3" aria-label="Venda selecionada">
          <Button type="button" variant="outline" onClick={() => setParams(saleParams())}>Voltar para as vendas</Button>
          {!saleDetail.data && saleDetail.isFetching ? <p role="status">Carregando venda…</p> : saleDetail.data && !saleDetail.isError ? (
            <SaleDetails key={saleDetail.data.id} sale={saleDetail.data} sessions={sessions} methodsAllowed={config.data?.rule?.methods ?? []}
              canManage={canManage} scope={scope} refresh={refresh} />
          ) : <p role="status">Venda indisponível.</p>}
        </section>
      )}
      <section className="ss-surface space-y-3" aria-labelledby="ss-sale-list">
        <h2 id="ss-sale-list">Histórico de vendas</h2>
        {sales.isPending ? <p role="status">Carregando vendas…</p> : accessDenied ? (
          <p role="status">Seu perfil não tem acesso ao histórico de vendas desta loja.</p>
        ) : sales.isError ? (
          <StoreFailure message={saleMessage(sales.error)} retry={() => void sales.refetch()} />
        ) : !sales.data.items.length ? (
          <StoreState title={sales.data.total ? "Nenhuma venda nesta página" : filterCount ? "Nenhuma venda para estes filtros" : "Nenhuma venda cadastrada"}
            action={sales.data.total && page > 1 ? <Button type="button" variant="outline" onClick={() => goToPage(1)}>Ir à primeira página</Button> :
              filterCount ? <Button type="button" variant="outline" onClick={clearFilters}>Limpar filtros</Button> :
                canCreate ? <Button type="button" variant="outline" onClick={openCreate}>Registrar venda</Button> : undefined} />
        ) : (
          <ul className="divide-y">{sales.data.items.map((sale) => (
            <li key={sale.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div><strong>{moneyLabel(sale.total_cents)}</strong><p>{dateLabel(sale.occurred_on)} · {statuses[sale.status]}</p></div>
              <Button variant="outline" asChild><Link to={`?${saleParams(sale.id).toString()}`}>Ver venda</Link></Button>
            </li>
          ))}</ul>
        )}
        {sales.data && sales.data.total > pageSize && (
          <nav aria-label="Páginas de vendas" className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={page === 1} onClick={() => goToPage(page - 1)}>Anterior</Button>
            <Button variant="outline" disabled={page * pageSize >= sales.data.total} onClick={() => goToPage(page + 1)}>Próxima</Button>
          </nav>
        )}
      </section>
    </>
  );
}

type DraftPayment = { method: string; amount: string; tender: string; fee: string; reference: string };
const initialPayment = (method: string): DraftPayment => ({ method, amount: "", tender: "", fee: "", reference: "" });

function readPayments(rows: DraftPayment[], total: number, allowPartial = false) {
  const result = rows.map((row) => {
    const amount = readCents(row.amount);
    const tender = row.method === "cash" ? readCents(row.tender || row.amount) : null;
    const fee = row.method === "card" ? readCents(row.fee) : 0;
    if (!amount || (row.method === "cash" && (tender == null || tender < amount)) || fee == null || fee > amount
      || (row.method !== "cash" && !row.reference.trim())) return null;
    return { method: row.method, amount_cents: amount, tendered_cents: tender, fee_cents: fee, reference: row.reference.trim() || null };
  });
  const sum = result.reduce((amount, row) => amount + (row?.amount_cents ?? 0), 0);
  if (result.some((row) => !row) || (allowPartial ? sum <= 0 || sum > total : sum !== total)) return null;
  return result;
}

function PaymentFields({ rows, onChange, allowed, prefix }: {
  rows: DraftPayment[]; onChange: (rows: DraftPayment[]) => void; allowed: string[]; prefix: string;
}) {
  return (
    <div className="grid gap-3">
      {rows.map((row, index) => {
        const field = (name: keyof DraftPayment, value: string) => onChange(rows.map((item, i) => i === index ? { ...item, [name]: value } : item));
        const id = `${prefix}-${index}`;
        return (
          <fieldset key={index} className="ss-variant grid gap-3">
            <legend>Pagamento {index + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <StoreField id={`${id}-method`} label="Forma de pagamento">
                <select id={`${id}-method`} value={row.method} onChange={(event) => field("method", event.target.value)}>
                  {allowed.map((method) => <option key={method} value={method}>{methods[method]}</option>)}
                </select>
              </StoreField>
              <StoreField id={`${id}-amount`} label="Valor alocado (R$)">
                <input id={`${id}-amount`} inputMode="decimal" value={row.amount} onChange={(event) => field("amount", event.target.value)} />
              </StoreField>
              {row.method === "cash" && <StoreField id={`${id}-tender`} label="Dinheiro entregue (R$)">
                <input id={`${id}-tender`} inputMode="decimal" value={row.tender} onChange={(event) => field("tender", event.target.value)} />
              </StoreField>}
              {row.method === "card" && <StoreField id={`${id}-fee`} label="Taxa do cartão (R$)">
                <input id={`${id}-fee`} inputMode="decimal" value={row.fee} onChange={(event) => field("fee", event.target.value)} />
              </StoreField>}
              {row.method !== "cash" && <StoreField id={`${id}-reference`} label="Referência da confirmação manual">
                <input id={`${id}-reference`} maxLength={600} value={row.reference} onChange={(event) => field("reference", event.target.value)} />
              </StoreField>}
            </div>
            {rows.length > 1 && <Button type="button" variant="ghost" className="w-fit" onClick={() => onChange(rows.filter((_, i) => i !== index))}>Remover pagamento</Button>}
          </fieldset>
        );
      })}
      <Button type="button" variant="outline" className="w-fit" disabled={rows.length >= 8 || !allowed.length}
        onClick={() => onChange([...rows, initialPayment(allowed[0])])}>Dividir pagamento</Button>
    </div>
  );
}

function SaleForm({ scope, queryKey, sessions, initialSessionId, ready, methodsAllowed, buyerSelection, close, done }: ScopeProps & {
  sessions: Session[];
  initialSessionId: string;
  ready: boolean;
  methodsAllowed: string[];
  buyerSelection: boolean;
  close: () => void;
  done: (id: string, pending: boolean) => void;
}) {
  const formId = useId();
  const errorRegion = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [draftTerm, setDraftTerm] = useState("");
  const [term, setTerm] = useState("");
  const [lines, setLines] = useState<{ option: SaleOption; quantity: string }[]>([]);
  const [payments, setPayments] = useState<DraftPayment[]>([initialPayment(methodsAllowed[0])]);
  const [pending, setPending] = useState(false);
  const [customer, setCustomer] = useState<NamedOption | null>(null);
  const [validation, setValidation] = useState("");
  const session = sessions.find((item) => item.id === sessionId);
  useEffect(() => {
    const timeout = window.setTimeout(() => setTerm(draftTerm.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [draftTerm]);
  const options = useQuery({
    queryKey: [...queryKey, "sale-options", session?.location_id, term], meta: { persist: false }, enabled: !!session,
    queryFn: () => storeRpc<SaleOption[]>("soja_store_sale_options", { ...scope, _location_id: session.location_id, _search: term || null }),
  });
  const command = useStoreCommand(scope, (request, payload: object) => storeRpc<CommandResult>("soja_store_create_sale", {
    ...scope, _request_id: request, _payload: payload,
  }), (result) => done(result.id, pending));
  const locked = command.isPending || command.isUncertain;
  const dirty = sessionId !== initialSessionId || lines.length > 0 || customer != null || pending ||
    payments.length > 1 || payments.some(({ method, amount, tender, fee, reference }) =>
      method !== methodsAllowed[0] || amount || tender || fee || reference);
  const total = lines.reduce((sum, row) => {
    const quantity = readDecimal(row.quantity);
    return sum + (quantity ? lineCents(quantity, row.option.price_cents) : 0);
  }, 0);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked || !ready) return;
    if (!session || !lines.length || !Number.isSafeInteger(total) || total <= 0) {
      setValidation("Selecione um ponto e informe os itens da venda.");
      window.requestAnimationFrame(() => errorRegion.current?.focus());
      return;
    }
    const items = lines.map(({ option, quantity }) => {
      const value = readDecimal(quantity);
      return value && scaledDecimal(value) > 0n && scaledDecimal(value) <= scaledDecimal(option.available)
        ? { variant_id: option.id, price_id: option.price_id, quantity: value } : null;
    });
    const paymentRows = pending ? [] : readPayments(payments, total);
    if (items.some((item) => !item) || !paymentRows) {
      setValidation("Confira as quantidades e preencha os pagamentos até atingir o valor total.");
      window.requestAnimationFrame(() => errorRegion.current?.focus());
      return;
    }
    setValidation("");
    command.mutate({ session_id: session.id, customer_id: customer?.id ?? null, lines: items, pending, payments: paymentRows });
  }

  return (
    <StoreFormDialog title="Nova venda" size="wide" initialFocus="title" formId={formId}
      submitLabel={pending ? "Registrar reserva" : "Confirmar pagamento e entrega"}
      dirty={dirty || command.isUncertain} busy={command.isPending} submitDisabled={locked || !ready} onClose={close}
      footerDetails={<p className="whitespace-nowrap font-semibold">Total {moneyLabel(total)}</p>}>
      <form id={formId} onSubmit={submit} className="grid gap-4" aria-label="Nova venda">
        <fieldset disabled={locked} className="grid min-w-0 gap-3">
          <h3>Caixa e itens</h3>
          {!ready && <StoreFailure message="O caixa ou a configuração de venda ficou indisponível. Confira a operação antes de enviar." />}
          <div className="grid gap-3 sm:grid-cols-2">
            <StoreField id="ss-sale-session" label="Caixa aberto">
              <select id="ss-sale-session" value={sessionId} onChange={(event) => { setSessionId(event.target.value); setLines([]); }}>
                {!session && <option value={sessionId}>Selecione um caixa aberto</option>}
                {sessions.map((item) => <option key={item.id} value={item.id}>{item.location_name}</option>)}
              </select>
            </StoreField>
            <StoreField id="ss-sale-search" label="Buscar produto ou SKU">
              <input id="ss-sale-search" type="search" value={draftTerm} onChange={(event) => setDraftTerm(event.target.value)} maxLength={160} />
            </StoreField>
          </div>
          {draftTerm.trim() !== term || options.isFetching ? <p role="status">Buscando produtos…</p> : options.isError ? (
            <StoreFailure message={saleMessage(options.error)} retry={() => void options.refetch()} />
          ) : !options.data?.length ? <p>Cadastre um preço vigente e confira o estoque disponível no ponto.</p> : (
            <div className="flex max-h-52 flex-wrap gap-2 overflow-auto" aria-label="Produtos disponíveis">
              {options.data.map((option) => <Button key={option.id} type="button" variant="outline" className="max-w-full whitespace-normal break-words text-left"
                disabled={lines.some((row) => row.option.id === option.id)}
                onClick={() => setLines([...lines, { option, quantity: "1" }])}>{option.product_name} · {option.sku}</Button>)}
            </div>
          )}
          {lines.map(({ option, quantity }, index) => <div key={option.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
            <div className="min-w-0 break-words"><strong>{option.product_name} · {option.sku}</strong><p>{moneyLabel(option.price_cents)} por {option.unit} · {decimalLabel(option.available)} disponíveis</p></div>
            <StoreField id={`ss-sale-qty-${option.id}`} label="Quantidade">
              <input id={`ss-sale-qty-${option.id}`} value={quantity} inputMode="decimal"
                onChange={(event) => setLines(lines.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} />
            </StoreField>
            <Button type="button" variant="ghost" onClick={() => setLines(lines.filter((row) => row.option.id !== option.id))}>Remover item</Button>
          </div>)}
          <h3>Pagamento</h3>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={pending} onChange={(event) => setPending(event.target.checked)} /> Reservar e confirmar pagamento depois
          </label>
          {buyerSelection && <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,24rem)_auto]">
            <PurchaseOption kind="customers" label="Cliente (opcional)" value={customer} onChange={setCustomer} scope={scope} queryKey={queryKey}
              disabled={command.isPending || command.isUncertain} />
            {customer && <Button type="button" variant="ghost" className="w-fit" onClick={() => setCustomer(null)}>Remover cliente</Button>}
          </div>}
          {!pending && <PaymentFields rows={payments} onChange={setPayments} allowed={methodsAllowed} prefix="ss-sale" />}
        </fieldset>
        {validation && <div ref={errorRegion} tabIndex={-1}><StoreFailure message={validation} /></div>}
        {command.isError && <StoreFailure message={saleMessage(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
      </form>
    </StoreFormDialog>
  );
}

function SaleDetails({ sale, sessions, methodsAllowed, canManage, scope, refresh }: {
  sale: Sale; sessions: Session[]; methodsAllowed: string[]; canManage: boolean; scope: StoreScope; refresh: () => void;
}) {
  const [session, setSession] = useState(sessions.find((item) => item.location_id === sale.location_id)?.id ?? "");
  const [payments, setPayments] = useState<DraftPayment[]>([initialPayment(sale.payment_methods?.[0] ?? methodsAllowed[0] ?? "cash")]);
  const [reason, setReason] = useState("");
  const [fiscal, setFiscal] = useState(sale.fiscal_reference ?? "");
  const [returns, setReturns] = useState<Record<string, string>>({});
  const [refunds, setRefunds] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const command = useStoreCommand(scope, (request, change: { action: string; version: number; payload: object }) => storeRpc<CommandResult>(`soja_store_${change.action}`, {
    ...scope, _request_id: request, _expected_version: change.version, _payload: { sale_id: sale.id, ...change.payload },
  }), () => {
    setNotice("Registro atualizado."); setReason(""); setReturns({}); setRefunds({});
    setPayments([initialPayment(sale.payment_methods?.[0] ?? methodsAllowed[0] ?? "cash")]);
    refresh();
  });
  const locationSessions = sessions.filter((item) => item.location_id === sale.location_id);
  const busy = command.isPending || command.isUncertain;
  const original = sale.payments.filter((item) => item.amount_cents > 0);
  const reservationFlow = sale.reservation_expires_at != null;
  const paid = sale.paid_cents ?? sale.payments.reduce((sum, item) => sum + item.amount_cents, 0);
  const remaining = Math.max(0, sale.total_cents - paid);
  const expired = !!(sale.reservation_expires_at && paid === 0 && Date.parse(sale.reservation_expires_at) <= Date.now());
  const reservationMethods = sale.payment_methods ?? methodsAllowed;
  const returning = sale.lines.flatMap((line) => {
    const value = readDecimal(returns[line.id] ?? "");
    if (!value || scaledDecimal(value) <= 0n) return [];
    const quantity = scaledDecimal(value) + scaledDecimal(line.returned_quantity);
    const sold = scaledDecimal(line.quantity);
    const cents = Number((BigInt(line.line_cents) * quantity + sold / 2n) / sold) - line.returned_cents;
    return [{ line_id: line.id, quantity: value, cents }];
  });
  const returnTotal = returning.reduce((sum, item) => sum + item.cents, 0);

  function send(action: string, payload: object) {
    setNotice("");
    command.mutate({ action, version: sale.version, payload });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>Venda · {sale.reservation_release === "expired" ? "Reserva expirada" : statuses[sale.status]}</h2>
        <strong>{moneyLabel(sale.total_cents)}</strong>
      </div>
      <p>{dateLabel(sale.occurred_on)} · {sale.fiscal_reference ? `Documento fiscal externo ${sale.fiscal_reference}` : "Referência fiscal pendente"}</p>
      {sale.delivered_at && <p className="text-sm">Entrega confirmada em {localTime.format(new Date(sale.delivered_at))}.</p>}
      <ul className="divide-y">
        {sale.lines.map((line) => <li key={line.id} className="py-2">
          <strong>{line.product_name} · {line.sku}</strong>
          <p>{decimalLabel(line.quantity)} {line.unit} · {moneyLabel(line.line_cents)}
            {scaledDecimal(line.returned_quantity) > 0n && ` · ${decimalLabel(line.returned_quantity)} devolvidas`}</p>
        </li>)}
      </ul>
      {!!sale.payments.length && <div><h3 className="font-semibold">Pagamentos</h3><ul>
        {sale.payments.map((item) => <li key={item.id}>{methods[item.method]} · {moneyLabel(item.amount_cents)}
          {item.tendered_cents != null && item.tendered_cents > item.amount_cents && ` · Troco ${moneyLabel(item.tendered_cents - item.amount_cents)}`}
          {!!item.fee_cents && ` · Taxa ${moneyLabel(item.fee_cents)} · Líquido ${moneyLabel(item.amount_cents - item.fee_cents)}`}
        </li>)}
      </ul></div>}
      {sale.receipts.map((receipt) => <details key={receipt.number} className="ss-variant">
        <summary className="min-h-11 cursor-pointer">Comprovante interno nº {receipt.number} · {receiptKinds[receipt.kind]}</summary>
        <p>Soja Store · {moneyLabel(receipt.snapshot.total_cents ?? receipt.snapshot.return_cents ?? receipt.snapshot.received_cents ?? 0)}</p>
        {receipt.snapshot.remaining_cents != null && <p>Saldo pendente · {moneyLabel(receipt.snapshot.remaining_cents)}</p>}
        <ul>{receipt.kind === "sale" && receipt.snapshot.lines?.map((line) => <li key={line.id}>{line.product_name} · {decimalLabel(line.quantity)} {line.unit}</li>)}</ul>
        <Button type="button" variant="outline" className="mt-2" onClick={() => {
          const receiptWindow = window.open("", "_blank", "popup,width=520,height=640");
          if (!receiptWindow) { setNotice("Habilite a abertura de janelas para imprimir o comprovante."); return; }
          receiptWindow.opener = null;
          receiptWindow.document.title = `Comprovante Soja Store ${receipt.number}`;
          const heading = receiptWindow.document.createElement("h1");
          heading.textContent = `Soja Store · Comprovante interno nº ${receipt.number}`;
          receiptWindow.document.body.append(heading);
          const text = receiptWindow.document.createElement("p");
          text.textContent = `${receiptKinds[receipt.kind]} · ${moneyLabel(receipt.snapshot.total_cents ?? receipt.snapshot.return_cents ?? receipt.snapshot.received_cents ?? 0)}`;
          receiptWindow.document.body.append(text);
          for (const line of receipt.snapshot.lines ?? []) {
            if (!line.product_name) continue;
            const item = receiptWindow.document.createElement("p");
            item.textContent = `${line.product_name} · ${decimalLabel(line.quantity)} ${line.unit}`;
            receiptWindow.document.body.append(item);
          }
          receiptWindow.print();
        }}>Imprimir comprovante</Button>
      </details>)}
      {canManage && sale.status === "pending" && reservationFlow && <fieldset disabled={busy} className="ss-variant grid gap-3">
        <legend>Pagamento e entrega da reserva</legend>
        <p>Recebido {moneyLabel(paid)} · A receber {moneyLabel(remaining)}</p>
        {paid === 0 && sale.reservation_expires_at && (
          <p>{expired ? "Prazo encerrado em " : "Prazo para o primeiro pagamento até "}{localTime.format(new Date(sale.reservation_expires_at))}.</p>
        )}
        {paid > 0 && remaining > 0 && <p className="text-sm">A reserva continua ativa após o primeiro pagamento.</p>}
        {expired ? (
          <Button className="w-fit" variant="outline" type="button" onClick={() => send("finish_sale", { action: "expire" })}>Liberar reserva vencida</Button>
        ) : remaining > 0 ? (
          <>
            <StoreField id="ss-finish-session" label="Caixa aberto no ponto">
              <select id="ss-finish-session" value={session} onChange={(event) => setSession(event.target.value)}>
                <option value="">Selecione</option>{locationSessions.map((item) => <option key={item.id} value={item.id}>{item.location_name}</option>)}
              </select>
            </StoreField>
            {!!reservationMethods.length && <PaymentFields rows={payments} onChange={setPayments} allowed={reservationMethods} prefix="ss-finish" />}
            <Button className="ss-primary w-fit" type="button" disabled={!session || !reservationMethods.length} onClick={() => {
              const rows = readPayments(payments, remaining, true);
              if (!rows) { setNotice("Confira os valores e o saldo pendente antes de registrar o pagamento."); return; }
              send("finish_sale", { action: "payment", payments: rows, session_id: session });
            }}>Registrar pagamento</Button>
            <p className="text-sm">A mercadoria permanece reservada até a confirmação da entrega.</p>
          </>
        ) : (
          <Button className="ss-primary w-fit" type="button" onClick={() => send("finish_sale", { action: "deliver" })}>
            Confirmar entrega
          </Button>
        )}
        {paid === 0 && !expired && <>
          <StoreField id="ss-cancel-reason" label="Motivo do cancelamento">
            <input id="ss-cancel-reason" maxLength={600} value={reason} onChange={(event) => setReason(event.target.value)} />
          </StoreField>
          <Button className="w-fit" variant="outline" type="button" disabled={!reason.trim()}
            onClick={() => send("finish_sale", { action: "cancel", reason: reason.trim() })}>Cancelar reserva</Button>
        </>}
      </fieldset>}
      {canManage && sale.status === "pending" && !reservationFlow && <fieldset disabled={busy} className="ss-variant grid gap-3">
        <legend>Confirmar ou cancelar reserva</legend>
        <StoreField id="ss-finish-session" label="Caixa aberto no ponto">
          <select id="ss-finish-session" value={session} onChange={(event) => setSession(event.target.value)}>
            <option value="">Selecione</option>{locationSessions.map((item) => <option key={item.id} value={item.id}>{item.location_name}</option>)}
          </select>
        </StoreField>
        {!!methodsAllowed.length && <PaymentFields rows={payments} onChange={setPayments} allowed={methodsAllowed} prefix="ss-finish" />}
        <Button className="ss-primary w-fit" type="button" disabled={!session || !methodsAllowed.length} onClick={() => {
          const rows = readPayments(payments, sale.total_cents);
          if (!rows) { setNotice("Confira os pagamentos e o total da venda."); return; }
          send("finish_sale", { action: "confirm", payments: rows, session_id: session });
        }}>Confirmar pagamento e entrega</Button>
        <StoreField id="ss-cancel-reason" label="Motivo do cancelamento">
          <input id="ss-cancel-reason" maxLength={600} value={reason} onChange={(event) => setReason(event.target.value)} />
        </StoreField>
        <Button className="w-fit" variant="outline" type="button" disabled={!reason.trim()} onClick={() => send("finish_sale", { action: "cancel", reason: reason.trim() })}>Cancelar reserva</Button>
      </fieldset>}
      {canManage && ["completed", "returned_partially"].includes(sale.status) && <details className="ss-variant">
        <summary className="min-h-11 cursor-pointer font-semibold">Registrar devolução e estorno</summary>
        <fieldset disabled={busy} className="grid gap-3">
          <StoreField id="ss-return-session" label="Caixa aberto no ponto">
            <select id="ss-return-session" value={session} onChange={(event) => setSession(event.target.value)}>
              <option value="">Selecione</option>{locationSessions.map((item) => <option key={item.id} value={item.id}>{item.location_name}</option>)}
            </select>
          </StoreField>
          {sale.lines.filter((line) => scaledDecimal(line.quantity) > scaledDecimal(line.returned_quantity)).map((line) => <StoreField
            key={line.id} id={`ss-return-${line.id}`} label={`Quantidade a devolver · ${line.sku}`}>
            <input id={`ss-return-${line.id}`} inputMode="decimal" value={returns[line.id] ?? ""}
              onChange={(event) => setReturns({ ...returns, [line.id]: event.target.value })} />
          </StoreField>)}
          <p>Valor calculado da devolução {moneyLabel(returnTotal)}</p>
          {original.map((payment, index) => <StoreField key={payment.id} id={`ss-refund-${payment.id}`}
            label={`Estorno em ${methods[payment.method]} · pagamento ${index + 1} (R$)`}>
            <input id={`ss-refund-${payment.id}`} inputMode="decimal" value={refunds[payment.id] ?? ""}
              onChange={(event) => setRefunds({ ...refunds, [payment.id]: event.target.value })} />
          </StoreField>)}
          <StoreField id="ss-return-reason" label="Motivo da devolução">
            <input id="ss-return-reason" maxLength={600} value={reason} onChange={(event) => setReason(event.target.value)} />
          </StoreField>
          <Button className="w-fit" type="button" disabled={!session || !reason.trim() || !returning.length} onClick={() => {
            const rows = original.flatMap((payment) => {
              const cents = readCents(refunds[payment.id] ?? "");
              return cents ? [{ payment_id: payment.id, amount_cents: cents }] : [];
            });
            if (rows.reduce((sum, item) => sum + item.amount_cents, 0) !== returnTotal) {
              setNotice("Confira a distribuição do estorno."); return;
            }
            send("return_sale", { session_id: session, lines: returning.map(({ line_id, quantity }) => ({ line_id, quantity })), refunds: rows, reason: reason.trim() });
          }}>Confirmar devolução</Button>
        </fieldset>
      </details>}
      {canManage && !["pending", "cancelled"].includes(sale.status) && <form className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
        onSubmit={(event) => { event.preventDefault(); if (!busy && fiscal.trim()) send("record_sale_fiscal", { reference: fiscal.trim() }); }}>
        <StoreField id="ss-fiscal-external" label="Referência do documento fiscal externo">
          <input id="ss-fiscal-external" value={fiscal} maxLength={600} onChange={(event) => setFiscal(event.target.value)} />
        </StoreField>
        <Button type="submit" variant="outline" disabled={busy || !fiscal.trim() || fiscal === sale.fiscal_reference}>Salvar referência</Button>
      </form>}
      {notice && <p role="status">{notice}</p>}
      {command.isError && <StoreFailure message={saleMessage(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
    </>
  );
}
