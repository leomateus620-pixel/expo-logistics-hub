import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronRight, ClipboardList, Plus } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { storeError, storeRpc, type StoreScope } from "../api/store";
import { StoreFailure, StoreField, StoreFilters, StoreHeading, StoreState } from "../components/StoreElements";
import { readOperationalFilters } from "../domain/operationalFilters";
import { dateLabel, moneyLabel, purchaseStates, type PurchaseStatus, type PurchaseSummary } from "../domain/purchases";
import { NewPurchaseDialog } from "./NewPurchasePage";
import { PurchaseQuotes } from "./PurchaseQuotes";

export const purchasesPath = "/comissoes/soja-store/compras";
const pageSize = 30;
const uuid = z.string().uuid().nullable().catch(null);
const filterKeys = ["situacao", "inicio", "fim", "local", "fornecedor", "variante", "pagina"];

export function PurchasesPage({
  scope, queryKey, canManage, canViewCosts = canManage, canViewQuotes = canViewCosts, initialCreate = false,
}: {
  scope: StoreScope;
  queryKey: readonly unknown[];
  canManage: boolean;
  canViewCosts?: boolean;
  canViewQuotes?: boolean;
  initialCreate?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(initialCreate && canManage);
  const inputStatus = params.get("situacao");
  const status = inputStatus && Object.prototype.hasOwnProperty.call(purchaseStates, inputStatus) ? inputStatus as PurchaseStatus : "";
  const filters = {
    ...readOperationalFilters(params),
    _supplier_id: uuid.parse(params.get("fornecedor")),
    _variant_id: uuid.parse(params.get("variante")),
  };
  const period = filters._start && filters._end ? `${dateLabel(filters._start)} a ${dateLabel(filters._end)}`
    : filters._start ? `Desde ${dateLabel(filters._start)}`
    : filters._end ? `Até ${dateLabel(filters._end)}` : null;
  const linkFilters = [period, filters._location_id && "Local selecionado", filters._supplier_id && "Fornecedor selecionado", filters._variant_id && "SKU selecionado"].filter(Boolean);
  const filterCount = linkFilters.length + Number(!!status);
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

  function updateParams(next: URLSearchParams) {
    if (initialCreate && !creating) navigate({ pathname: purchasesPath, search: next.toString() }, { replace: true });
    else setParams(next);
  }

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "pagina") next.delete("pagina");
    updateParams(next);
  }

  function clearFilters() {
    const next = new URLSearchParams(params);
    filterKeys.forEach((key) => next.delete(key));
    updateParams(next);
  }

  function closeCreate() {
    setCreating(false);
    if (initialCreate) navigate({ pathname: purchasesPath, search }, { replace: true });
  }

  const emptyAction = page > 1
    ? <Button variant="outline" onClick={() => setFilter("pagina", "")}>Ir à primeira página</Button>
    : filterCount > 0
      ? <Button variant="outline" onClick={clearFilters}>Limpar filtros</Button>
      : canManage && <Button variant="outline" onClick={() => setCreating(true)}><Plus aria-hidden="true" /> Novo pedido</Button>;
  const isForbidden = (purchases.error as { code?: string } | null)?.code === "42501";

  return (
    <>
      <StoreHeading title="Compras" icon={ClipboardList} action={canManage && (
        <Button type="button" className="ss-primary" data-ss-create-trigger onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" /> Novo pedido
        </Button>
      )} controls={
        <StoreFilters count={filterCount} onClear={clearFilters}>
          <StoreField id="ss-purchases-status" label="Situação do pedido">
            <select id="ss-purchases-status" value={status} onChange={(event) => setFilter("situacao", event.target.value)}>
              <option value="">Todas</option>
              {Object.entries(purchaseStates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </StoreField>
          {linkFilters.length > 0 && <p className="text-sm text-[var(--ss-muted)]">{linkFilters.join(" · ")}</p>}
        </StoreFilters>
      } />
      {initialCreate && !canManage && <StoreFailure message="Seu perfil precisa de permissão para registrar um pedido." />}
      {purchases.isPending ? <StoreState title="Carregando pedidos" busy /> :
        isForbidden ? <StoreFailure message="Seu perfil não tem acesso aos pedidos da loja." /> :
        purchases.isError ? <StoreFailure message={storeError(purchases.error)} retry={() => void purchases.refetch()} /> :
          !purchases.data.items.length ? (
            <StoreState title={page > 1 ? "Nenhum pedido nesta página" : filterCount ? "Nenhum pedido neste recorte" : "Nenhum pedido cadastrado"}
              description={page === 1 && !filterCount ? "Os pedidos ficam disponíveis aqui para acompanhar os recebimentos." : undefined}
              action={emptyAction} />
          ) : (
            <section className="ss-surface" aria-labelledby="ss-purchases-list">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
                <h2 id="ss-purchases-list">Pedidos de compra</h2>
                <p role="status" className="text-sm text-[var(--ss-muted)]">{purchases.data.total} {purchases.data.total === 1 ? "pedido" : "pedidos"}</p>
              </div>
              <ul className="divide-y">
                {purchases.data.items.map((purchase) => (
                  <li key={purchase.id}>
                    <Link className="ss-list-link rounded" to={link(purchase.id)}>
                      <span className="grid min-w-0 gap-1">
                        <strong className="font-semibold">{purchase.supplier_name}</strong>
                        <span className="text-sm text-[var(--ss-muted)]">{dateLabel(purchase.ordered_on)} · {purchase.location_name}</span>
                        <span className="text-sm text-[var(--ss-muted)]">Previsão: {purchase.expected_on ? dateLabel(purchase.expected_on) : "não informada"}</span>
                        {canViewCosts && purchase.total_cents != null && <span className="text-sm sm:hidden">{moneyLabel(purchase.total_cents)}</span>}
                      </span>
                      <span className="hidden text-sm sm:block">{canViewCosts && purchase.total_cents != null ? moneyLabel(purchase.total_cents) : ""}</span>
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
      {canViewQuotes && !isForbidden && linkFilters.length === 0 && <PurchaseQuotes scope={scope} queryKey={queryKey} canManage={canManage} />}
      {canManage && creating && (
        <NewPurchaseDialog scope={scope} queryKey={queryKey} onClose={closeCreate} onSaved={(id) => {
          closeCreate();
          toast.success("Pedido de compra registrado.", { action: { label: "Ver pedido", onClick: () => navigate(link(id)) } });
        }} />
      )}
    </>
  );
}
