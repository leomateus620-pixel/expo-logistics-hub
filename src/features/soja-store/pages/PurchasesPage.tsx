import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronRight, Plus } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { storeError, storeRpc, type StoreScope } from "../api/store";
import { StoreFailure, StoreField, StoreHeading, StoreState } from "../components/StoreElements";
import { readOperationalFilters } from "../domain/operationalFilters";
import { PurchaseQuotes } from "./PurchaseQuotes";
import { dateLabel, moneyLabel, purchaseStates, type PurchaseStatus, type PurchaseSummary } from "../domain/purchases";

export const purchasesPath = "/comissoes/soja-store/compras";
const pageSize = 30;

export function PurchasesPage({ scope, queryKey, canManage, canViewCosts = canManage }: {
  scope: StoreScope;
  queryKey: readonly unknown[];
  canManage: boolean;
  canViewCosts?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const inputStatus = params.get("situacao");
  const status = inputStatus && Object.prototype.hasOwnProperty.call(purchaseStates, inputStatus) ? inputStatus as PurchaseStatus : "";
  const uuid = z.string().uuid().nullable().catch(null);
  const filters = {
    ...readOperationalFilters(params),
    _supplier_id: uuid.parse(params.get("fornecedor")),
    _variant_id: uuid.parse(params.get("variante")),
  };
  const filtered = Object.values(filters).some(Boolean);
  const page = Math.max(1, Math.min(333334, Number.parseInt(params.get("pagina") ?? "", 10) || 1));
  const purchases = useQuery({
    queryKey: [...queryKey, "purchases", status, filters, page],
    queryFn: () => storeRpc<{ total: number; items: PurchaseSummary[] }>("soja_store_purchases_filtered", {
      ...scope, ...filters, _status: status || null, _limit: pageSize, _offset: (page - 1) * pageSize,
    }),
    meta: { persist: false },
  });
  const search = params.toString();
  const link = (id: string) => ({ pathname: `${purchasesPath}/${id}`, search });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "pagina") next.delete("pagina");
    setParams(next);
  }

  return (
    <>
      <StoreHeading title="Compras" description="Acompanhe pedidos e confira o que já entrou no estoque." action={canManage && (
        <Button className="ss-primary" asChild><Link data-button to={link("novo")}><Plus aria-hidden="true" /> Novo pedido</Link></Button>
      )} />
      <div className="ss-surface flex flex-wrap items-end gap-3">
        <StoreField id="ss-purchases-status" label="Situação do pedido">
          <select id="ss-purchases-status" value={status} onChange={(event) => setFilter("situacao", event.target.value)}>
            <option value="">Todas</option>
            {Object.entries(purchaseStates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </StoreField>
        {(filters._start || filters._end || filters._location_id) && <p className="text-sm">
          {filters._start ? `Desde ${dateLabel(filters._start)}` : ""}{filters._end ? ` até ${dateLabel(filters._end)}` : ""}{filters._location_id ? " · Local selecionado no painel" : ""}
        </p>}
        {filtered && <Button type="button" variant="outline" onClick={() => setParams({})}>Limpar filtros</Button>}
      </div>
      {canViewCosts && !filtered && <PurchaseQuotes scope={scope} queryKey={queryKey} canManage={canManage} />}
      {purchases.isPending ? <StoreState title="Carregando pedidos" busy /> :
        purchases.isError ? <StoreFailure message={storeError(purchases.error)} retry={() => void purchases.refetch()} /> :
          !purchases.data.items.length ? (
            <StoreState title="Nenhum pedido encontrado" description={status || filtered ? "Revise os filtros selecionados." :
              "Registre um pedido para acompanhar as quantidades encomendadas e recebidas."}
            action={page > 1 && <Button variant="outline" onClick={() => setFilter("pagina", "")}>Ir à primeira página</Button>} />
          ) : (
            <section className="ss-surface" aria-labelledby="ss-purchases-list">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
                <h2 id="ss-purchases-list">Pedidos de compra</h2>
                <p role="status" className="text-sm text-[var(--ss-muted)]">{purchases.data.total} {purchases.data.total === 1 ? "pedido" : "pedidos"}</p>
              </div>
              <ul className="divide-y">
                {purchases.data.items.map((purchase) => (
                  <li key={purchase.id}>
                    <Link className="ss-list-link rounded" to={link(purchase.id)}>
                      <span className="grid gap-1">
                        <strong className="font-semibold">{purchase.supplier_name}</strong>
                        <span className="text-sm text-[var(--ss-muted)]">{dateLabel(purchase.ordered_on)} · {purchase.location_name}</span>
                      </span>
                      <span className="hidden text-sm sm:block">{purchase.total_cents == null ? "" : moneyLabel(purchase.total_cents)}</span>
                      <span className="ss-pill" data-status={purchase.status === "received" ? "active" : "draft"}>{purchaseStates[purchase.status]}</span>
                      <ChevronRight aria-hidden="true" size={17} className="hidden sm:block" />
                    </Link>
                  </li>
                ))}
              </ul>
              {purchases.data.total > pageSize && (
                <nav className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3" aria-label="Paginação dos pedidos">
                  <Button variant="outline" onClick={() => setFilter("pagina", page === 2 ? "" : String(page - 1))} disabled={page <= 1}>
                    <ArrowLeft aria-hidden="true" /> Anterior
                  </Button>
                  <p className="text-sm">Página {page} de {Math.ceil(purchases.data.total / pageSize)}</p>
                  <Button variant="outline" onClick={() => setFilter("pagina", String(page + 1))} disabled={page * pageSize >= purchases.data.total}>
                    Próxima <ArrowRight aria-hidden="true" />
                  </Button>
                </nav>
              )}
            </section>
          )}
    </>
  );
}
