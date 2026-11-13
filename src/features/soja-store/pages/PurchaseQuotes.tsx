import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { storeError, storeRpc, type CommandResult, type StoreScope } from "../api/store";
import { PurchaseOption } from "../components/PurchaseOption";
import { StoreFailure, StoreField } from "../components/StoreElements";
import { dateLabel, decimalLabel, moneyLabel, readCents, readDecimal, scaledDecimal, todayInSaoPaulo, type NamedOption } from "../domain/purchases";
import { useStoreCommand } from "../hooks/useStoreCommand";
import { useUnsavedStoreForm } from "../hooks/useUnsavedStoreForm";

type Props = { scope: StoreScope; queryKey: readonly unknown[]; canManage: boolean };
type Quote = {
  id: string; supplier_name: string; quoted_on: string; valid_until: string | null; items_cents: number; freight_cents: number;
  total_cents: number; lead_days: number; minimum_quantity: string | null; terms: string; reference: string;
};
type Need = {
  id: string; description: string; quantity: string; unit: string; notes: string | null; version: number; quotes: Quote[];
  selected_quote_id: string | null; decision_reference: string | null; purchase_id: string | null; order_reference: string | null;
};
type EligibleOrder = { id: string; supplier_name: string; ordered_on: string; reference: string | null; total_cents: number };
type Command = { version: number | null; payload: Record<string, number | string | null> };
const value = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
const pageSize = 10;

function sourcingError(error: unknown) {
  const messages: Record<string, string> = {
    SOJA_STORE_SOURCING_DUPLICATE: "Esta cotação ou pedido já está vinculado.",
    SOJA_STORE_SOURCING_ORDER_LINKED: "Este processo já tem um pedido vinculado.",
    SOJA_STORE_SOURCING_QUOTE_LIMIT: "Esta necessidade atingiu o limite de 30 cotações.",
    SOJA_STORE_SOURCING_SELECT_FIRST: "Selecione a cotação antes de vincular o pedido.",
    SOJA_STORE_SOURCING_QUOTE_INELIGIBLE: "Confira a validade e o lote mínimo da cotação.",
    SOJA_STORE_SOURCING_UNAVAILABLE: "O registro informado não está disponível para este processo.",
  };
  const message = (error as { message?: string } | null)?.message ?? "";
  return messages[message] ?? storeError(error);
}

function SourcingForm({ scope, queryKey, children, label, values, done }: Pick<Props, "scope" | "queryKey"> & {
  label: string; values: (data: FormData) => Command | null; children: ReactNode; done: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const client = useQueryClient();
  const command = useStoreCommand<Command>(scope, (requestId, { version, payload }) =>
    storeRpc<CommandResult>("soja_store_write_purchase_need", {
      ...scope, _request_id: requestId, _expected_version: version, _payload: payload,
    }), () => {
      setDirty(false);
      void client.invalidateQueries({ queryKey: [...queryKey, "purchase-needs"] });
      done();
    });
  useUnsavedStoreForm(dirty);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (command.isPending || command.isUncertain) return;
    const data = values(new FormData(event.currentTarget));
    setError(data ? "" : "Confira o fornecedor, as quantidades e os valores informados.");
    if (data) command.mutate(data);
  }

  return <form className="grid gap-3 rounded-lg border p-3" onSubmit={submit} onChange={() => setDirty(true)} aria-busy={command.isPending}>
    <fieldset disabled={command.isPending || command.isUncertain} className="grid min-w-0 gap-3 sm:grid-cols-2">{children}</fieldset>
    {error && <StoreFailure message={error} />}
    {command.isError && <StoreFailure message={sourcingError(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
    <div><Button type="submit" className="ss-primary" disabled={command.isPending || command.isUncertain}>{command.isPending ? "Salvando…" : label}</Button></div>
  </form>;
}

function Text({ name, title, required = true, limit = 160, minLength }: {
  name: string; title: string; required?: boolean; limit?: number; minLength?: number;
}) {
  const id = `ss-sourcing-${name}`;
  return <StoreField id={id} label={title}><input id={id} name={name} required={required} maxLength={limit} minLength={minLength} /></StoreField>;
}

function NumberField({ name, title, required = true, defaultValue }: { name: string; title: string; required?: boolean; defaultValue?: string }) {
  const id = `ss-sourcing-${name}`;
  return <StoreField id={id} label={title}><input id={id} name={name} inputMode="decimal" required={required} maxLength={19} defaultValue={defaultValue} /></StoreField>;
}

function NeedForm({ scope, queryKey, done }: Pick<Props, "scope" | "queryKey"> & { done: () => void }) {
  return <SourcingForm scope={scope} queryKey={queryKey} label="Registrar necessidade" done={done} values={(data) => {
    const quantity = readDecimal(value(data, "quantity"));
    return quantity === null || scaledDecimal(quantity) <= 0n ? null : { version: null, payload: { action: "create", quantity, description: value(data, "description"), unit: value(data, "unit"), notes: value(data, "notes") } };
  }}>
    <Text name="description" title="O que precisa ser comprado?" minLength={2} />
    <NumberField name="quantity" title="Quantidade necessária" />
    <Text name="unit" title="Unidade" limit={24} />
    <Text name="notes" title="Especificações da necessidade" required={false} limit={600} />
  </SourcingForm>;
}

function QuoteForm({ scope, queryKey, need, done }: Pick<Props, "scope" | "queryKey"> & { need: Need; done: () => void }) {
  const [supplier, setSupplier] = useState<NamedOption>();
  const today = todayInSaoPaulo();
  return <SourcingForm scope={scope} queryKey={queryKey} label="Salvar cotação" done={done} values={(data) => {
    const items = readCents(value(data, "items_cents"));
    const freight = readCents(value(data, "freight_cents"));
    const minimum = value(data, "minimum_quantity");
    const minimumQuantity = minimum ? readDecimal(minimum) : null;
    if (!supplier || items === null || freight === null || (minimum && minimumQuantity === null)) return null;
    return { version: need.version, payload: {
      action: "quote", need_id: need.id, supplier_id: supplier.id, items_cents: items, freight_cents: freight,
      quoted_on: value(data, "quoted_on"), valid_until: value(data, "valid_until") || null, lead_days: value(data, "lead_days"),
      minimum_quantity: minimumQuantity, terms: value(data, "terms"), reference: value(data, "reference"),
    } };
  }}>
    <PurchaseOption kind="suppliers" label="Fornecedor da cotação" value={supplier ?? null} onChange={setSupplier} scope={scope} queryKey={queryKey} />
    <Text name="reference" title="Referência ou versão da proposta" limit={600} minLength={4} />
    <StoreField id="ss-sourcing-quoted-on" label="Data da cotação"><input id="ss-sourcing-quoted-on" name="quoted_on" type="date" max={today} defaultValue={today} required /></StoreField>
    <StoreField id="ss-sourcing-valid-until" label="Válida até"><input id="ss-sourcing-valid-until" name="valid_until" type="date" /></StoreField>
    <NumberField name="items_cents" title="Valor dos itens (R$)" />
    <NumberField name="freight_cents" title="Frete (R$)" defaultValue="0,00" />
    <StoreField id="ss-sourcing-lead" label="Prazo em dias"><input id="ss-sourcing-lead" name="lead_days" type="number" min={0} max={3650} required /></StoreField>
    <NumberField name="minimum_quantity" title="Lote mínimo" required={false} />
    <Text name="terms" title="Condições de pagamento" minLength={2} limit={600} />
  </SourcingForm>;
}

function OrderLinkForm({ scope, queryKey, need, done }: Pick<Props, "scope" | "queryKey"> & { need: Need; done: () => void }) {
  const [search, setSearch] = useState("");
  const orders = useQuery({
    queryKey: [...queryKey, "purchase-needs", "orders", need.id, search],
    queryFn: () => storeRpc<EligibleOrder[]>("soja_store_purchase_need_orders", { ...scope, _need_id: need.id, _search: search || null }),
    meta: { persist: false },
  });
  return <SourcingForm scope={scope} queryKey={queryKey} label="Vincular pedido" done={done} values={(data) => ({
    version: need.version, payload: { action: "link_order", need_id: need.id, purchase_id: value(data, "purchase_id"), reference: value(data, "reference") },
  })}>
    <StoreField id="ss-sourcing-order-search" label="Buscar pedido por referência"><input id="ss-sourcing-order-search" maxLength={120} type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></StoreField>
    {orders.isPending ? <p role="status">Carregando pedidos…</p> : orders.isError ?
      <StoreFailure message={storeError(orders.error)} retry={() => void orders.refetch()} /> :
      <StoreField id="ss-sourcing-order" label="Pedido do fornecedor selecionado">
        <select key={search} id="ss-sourcing-order" name="purchase_id" required>
          <option value="">{orders.data.length ? "Selecione o pedido" : "Nenhum pedido correspondente"}</option>
          {orders.data.map((order) => <option value={order.id} key={order.id}>{dateLabel(order.ordered_on)} · {moneyLabel(order.total_cents)} · {order.reference ?? order.supplier_name}</option>)}
        </select>
      </StoreField>}
    <Text name="reference" title="Referência do vínculo com o pedido" limit={600} minLength={4} />
  </SourcingForm>;
}

function QuoteComparison({ scope, queryKey, canManage, need }: Props & { need: Need }) {
  const [form, setForm] = useState<string>();
  const close = () => setForm(undefined);
  const today = todayInSaoPaulo();

  return <div className="grid gap-3">
    <p className="text-sm">{decimalLabel(need.quantity)} {need.unit}{need.notes ? ` · ${need.notes}` : ""}</p>
    {canManage && !need.purchase_id && <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => setForm(form === "quote" ? undefined : "quote")}>Adicionar cotação</Button>
      {need.selected_quote_id && <Button type="button" variant="outline" onClick={() => setForm(form === "order" ? undefined : "order")}>Vincular pedido</Button>}
    </div>}
    {form === "quote" && <QuoteForm scope={scope} queryKey={queryKey} need={need} done={close} />}
    {form === "order" && <OrderLinkForm scope={scope} queryKey={queryKey} need={need} done={close} />}
    {!need.quotes.length && <p className="text-sm text-[var(--ss-muted)]">Nenhuma cotação registrada para esta necessidade.</p>}
    <ul className="grid gap-3 lg:grid-cols-2">{need.quotes.map((quote) => {
      const selected = quote.id === need.selected_quote_id;
      const expired = quote.valid_until !== null && quote.valid_until < today;
      const belowMinimum = quote.minimum_quantity !== null && scaledDecimal(quote.minimum_quantity) > scaledDecimal(need.quantity);
      return <li className="grid min-w-0 gap-2 rounded-lg border p-3" key={quote.id}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="break-words font-semibold">{quote.supplier_name}</h4>
          {selected && <span className="ss-pill" data-status="active">Selecionada</span>}
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div><dt>Total</dt><dd className="font-semibold">{moneyLabel(quote.total_cents)}</dd></div>
          <div><dt>Frete</dt><dd>{moneyLabel(quote.freight_cents)}</dd></div>
          <div><dt>Prazo</dt><dd>{quote.lead_days} dias</dd></div>
          <div><dt>Lote mínimo</dt><dd>{quote.minimum_quantity ? decimalLabel(quote.minimum_quantity) : "Sem indicação"}</dd></div>
          <div><dt>Data da cotação</dt><dd>{dateLabel(quote.quoted_on)}</dd></div>
          <div><dt>Validade</dt><dd>{quote.valid_until ? dateLabel(quote.valid_until) : "Sem indicação"}</dd></div>
          <div className="col-span-2 break-words"><dt>Pagamento</dt><dd>{quote.terms}</dd></div>
          <div className="col-span-2 break-words"><dt>Referência</dt><dd>{quote.reference}</dd></div>
        </dl>
        {selected && need.decision_reference && <p className="break-words text-sm">Decisão · {need.decision_reference}</p>}
        {expired && <p className="text-sm font-medium">Cotação vencida.</p>}
        {belowMinimum && <p className="text-sm font-medium">A quantidade solicitada está abaixo do lote mínimo.</p>}
        {canManage && !selected && !expired && !belowMinimum && !need.purchase_id &&
          <Button type="button" variant="outline" className="w-fit" onClick={() => setForm(form === quote.id ? undefined : quote.id)}>Selecionar cotação</Button>}
        {form === quote.id && <SourcingForm scope={scope} queryKey={queryKey} label="Confirmar seleção" done={close} values={(data) => ({
          version: need.version, payload: { action: "select", need_id: need.id, quote_id: quote.id, reference: value(data, "reference") },
        })}>
          <Text name="reference" title="Motivo e referência da seleção" limit={600} minLength={4} />
        </SourcingForm>}
      </li>;
    })}</ul>
    {need.purchase_id && <div>
      <Link className="font-semibold underline" to={`/comissoes/soja-store/compras/${need.purchase_id}`}>Abrir pedido vinculado</Link>
      <p className="break-words text-sm">{need.order_reference}</p>
    </div>}
  </div>;
}

export function PurchaseQuotes({ scope, queryKey, canManage }: Props) {
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string>();
  const needs = useQuery({
    queryKey: [...queryKey, "purchase-needs", page],
    queryFn: () => storeRpc<{ total: number; items: Need[] }>("soja_store_purchase_needs", {
      ...scope, _limit: pageSize, _offset: (page - 1) * pageSize,
    }),
    meta: { persist: false },
  });

  return <section className="ss-surface grid gap-3" aria-labelledby="ss-purchase-needs">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="ss-purchase-needs">Necessidades e cotações</h2>
      {canManage && <Button type="button" variant="outline" onClick={() => setAdding(!adding)}>Nova necessidade</Button>}
    </div>
    {adding && <NeedForm scope={scope} queryKey={queryKey} done={() => { setAdding(false); setPage(1); }} />}
    {needs.isPending ? <p role="status">Carregando necessidades…</p> : needs.isError ?
      <StoreFailure message={storeError(needs.error)} retry={() => void needs.refetch()} /> : <>
        {!needs.data.items.length && <p className="text-sm text-[var(--ss-muted)]">Nenhuma necessidade registrada.</p>}
        <ul className="divide-y">{needs.data.items.map((need) => <li key={need.id} className="grid gap-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0"><h3 className="break-words font-semibold">{need.description}</h3>
              <p className="text-sm">{need.quotes.length} {need.quotes.length === 1 ? "cotação" : "cotações"} · {need.purchase_id ? "Pedido vinculado" : need.selected_quote_id ? "Cotação selecionada" : "Em cotação"}</p>
            </div>
            <Button type="button" variant="outline" aria-expanded={selected === need.id} onClick={() => setSelected(selected === need.id ? undefined : need.id)}>Comparar cotações</Button>
          </div>
          {selected === need.id && <QuoteComparison scope={scope} queryKey={queryKey} canManage={canManage} need={need} />}
        </li>)}</ul>
        {needs.data.total > pageSize && <nav aria-label="Paginação das necessidades" className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button>
          <span className="text-sm">Página {page}</span>
          <Button type="button" variant="outline" disabled={page * pageSize >= needs.data.total} onClick={() => setPage(page + 1)}>Próxima</Button>
        </nav>}
      </>}
  </section>;
}
