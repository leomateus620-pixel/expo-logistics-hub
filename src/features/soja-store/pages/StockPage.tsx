import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ArrowUpRight, ClipboardCheck, PackageMinus } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { storeError, type StoreScope } from "../api/store";
import { readStock, readStockOptions, type StockBalance, type StockMovement } from "../api/stock";
import { InventoryCountForm } from "../components/InventoryCountForm";
import { InstitutionalIssueForm } from "../components/InstitutionalIssueForm";
import { StockTransfers } from "../components/StockTransfers";
import { StoreFailure, StoreField, StoreHeading, StoreState } from "../components/StoreElements";
import type { SojaStoreAccess } from "../hooks/useSojaStoreAccess";
import { SOJA_STORE_UNIT } from "../navigation";

const basePath = `/comissoes/${SOJA_STORE_UNIT}`;
const stockPath = `${basePath}/estoque`;
const pageSize = 30;
const uuid = z.string().uuid();
const localInstant = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const civilDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });
const ownershipLabels = { own: "Próprio", third_party: "De terceiro" };
const destinationLabels: Record<string, string> = { store: "Loja" };
const movementLabels: Record<StockMovement["movement_type"], string> = {
  purchase_receipt: "Recebimento de compra",
  opening_count: "Contagem inicial",
  inventory_adjustment: "Ajuste de inventário",
  transfer_dispatch: "Expedição de transferência",
  transfer_receipt: "Recebimento de transferência",
  sale_fulfillment: "Entrega de venda",
  sale_return: "Devolução de venda",
  institutional_issue: "Saída institucional",
};

export function formatStockQuantity(quantity: string) {
  const [integer, fraction] = quantity.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimals = fraction?.replace(/0+$/, "");
  return decimals ? `${grouped},${decimals}` : grouped;
}

function stockLink(view: "saldos" | "movimentos" | "transferencias", locationId: string, variantId: string) {
  const search = new URLSearchParams();
  if (view !== "saldos") search.set("visao", view);
  if (locationId) search.set("local", locationId);
  if (variantId) search.set("variante", variantId);
  return { pathname: stockPath, search: search.toString() };
}

function StockRow({ item, canViewCatalog, canViewPurchases, canViewSales }: {
  item: StockBalance | StockMovement;
  canViewCatalog: boolean;
  canViewPurchases: boolean;
  canViewSales: boolean;
}) {
  const movement = "movement_type" in item ? item : null;
  const count = movement && (movement.movement_type === "opening_count" || movement.movement_type === "inventory_adjustment") ? movement : null;
  const transfer = movement?.transfer_id ? movement : null;
  const isIssue = movement?.movement_type === "institutional_issue";
  const signedMovement = movement && movement.movement_type !== "purchase_receipt";
  const product = <strong className="font-semibold">{item.product_name}</strong>;
  return (
    <li className="ss-stock-row">
      <div className="grid content-start gap-1">
        {canViewCatalog ? (
          <Link className="ss-stock-name" to={`${basePath}/produtos/${item.product_id}`}>{product}</Link>
        ) : product}
        <p className="text-sm text-[var(--ss-muted)]">
          {item.sku}{item.variant_label && ` · ${item.variant_label}`}
        </p>
        {movement && <p className="text-sm">{movementLabels[movement.movement_type]}</p>}
        {movement?.reason && <p className="text-sm text-[var(--ss-muted)]">{movement.reason}</p>}
        {movement?.reference && <p className="text-sm text-[var(--ss-muted)]">{movement.reference}</p>}
      </div>
      <div className="grid content-start gap-1">
        <p className="font-medium">{item.location_name}</p>
        <p className="text-sm text-[var(--ss-muted)]">
          {item.owner_supplier_name ?? ownershipLabels[item.ownership]} · {destinationLabels[item.destination] ?? item.destination}
        </p>
        {movement?.destination_commission_name && <p className="text-sm">Destino · {movement.destination_commission_name}</p>}
        {movement?.recipient && <p className="text-sm text-[var(--ss-muted)]">Recebido por {movement.recipient}</p>}
      </div>
      <dl className="grid content-start gap-1">
        <div>
          <dt className="sr-only">{signedMovement ? "Variação de saldo" : movement ? "Quantidade recebida" : "Saldo físico"}</dt>
          <dd className="font-semibold">{signedMovement && !item.quantity.startsWith("-") && /[1-9]/.test(item.quantity) ? "+" : ""}
            {formatStockQuantity(item.quantity)} {item.unit}
          </dd>
        </div>
        {count?.previous_quantity != null && count.counted_quantity != null && (
          <div className="flex flex-wrap gap-x-1 text-sm text-[var(--ss-muted)]">
            <dt>Saldo anterior e conferido</dt>
            <dd>{formatStockQuantity(count.previous_quantity)} → {formatStockQuantity(count.counted_quantity)}</dd>
          </div>
        )}
        {"available_quantity" in item && item.available_quantity != null && (
          <div className="flex flex-wrap gap-x-1 text-sm text-[var(--ss-muted)]">
            <dt>Disponível</dt>
            <dd>{formatStockQuantity(item.available_quantity)} {item.unit}</dd>
          </div>
        )}
        {"reserved_quantity" in item && item.reserved_quantity != null && /[1-9]/.test(item.reserved_quantity) && (
          <div className="flex flex-wrap gap-x-1 text-sm text-[var(--ss-muted)]">
            <dt>Reservado</dt>
            <dd>{formatStockQuantity(item.reserved_quantity)} {item.unit}</dd>
          </div>
        )}
        {movement ? (
          <>
            <div className="flex flex-wrap gap-x-1 text-sm text-[var(--ss-muted)]">
              <dt>{count ? "Contado em" : transfer?.movement_type === "transfer_dispatch" ? "Expedido em"
                : isIssue || movement.movement_type === "sale_fulfillment" ? "Entregue em"
                  : movement.movement_type === "sale_return" ? "Devolvido em" : "Recebido em"}</dt>
              <dd><time dateTime={movement.occurred_on}>{civilDate.format(new Date(`${movement.occurred_on}T00:00:00Z`))}</time></dd>
            </div>
            <div className="flex flex-wrap gap-x-1 text-sm text-[var(--ss-muted)]">
              <dt>Registrado em</dt>
              <dd><time dateTime={movement.recorded_at}>{localInstant.format(new Date(movement.recorded_at))}</time></dd>
            </div>
          </>
        ) : "last_movement_at" in item && (
          <div className="flex flex-wrap gap-x-1 text-sm text-[var(--ss-muted)]">
            <dt>Último movimento</dt>
            <dd><time dateTime={item.last_movement_at}>{localInstant.format(new Date(item.last_movement_at))}</time></dd>
          </div>
        )}
      </dl>
      {transfer?.transfer_id ? (
        <Button asChild variant="outline">
          <Link data-button to={{ pathname: stockPath, search: `?visao=transferencias&transferencia=${transfer.transfer_id}` }}>
            Abrir transferência <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      ) : movement?.sale_id && canViewSales ? (
        <Button asChild variant="outline">
          <Link data-button to={{ pathname: `${basePath}/vendas`, search: `?venda=${movement.sale_id}` }}>
            Abrir venda <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      ) : movement ? canViewPurchases && movement.purchase_id && (
        <Button asChild variant="outline">
          <Link data-button to={`${basePath}/compras/${movement.purchase_id}`}>Abrir compra <ArrowUpRight aria-hidden="true" /></Link>
        </Button>
      ) : (
        <Button asChild variant="outline">
          <Link data-button to={stockLink("movimentos", item.location_id, item.variant_id)}>Ver movimentos <ArrowRight aria-hidden="true" /></Link>
        </Button>
      )}
    </li>
  );
}

export function StockPage({ scope, queryKey, access }: {
  scope: StoreScope;
  queryKey: readonly unknown[];
  access: SojaStoreAccess;
}) {
  const [params, setParams] = useSearchParams();
  const locationId = params.get("local") ?? "";
  const variantId = params.get("variante") ?? "";
  const invalidFilter = Boolean((locationId && !uuid.safeParse(locationId).success) || (variantId && !uuid.safeParse(variantId).success));
  const rawView = params.get("visao");
  const showTransfers = rawView === "transferencias";
  const transferId = params.get("transferencia") ?? "";
  const view = rawView === "movimentos" ? "movimentos" : "saldos";
  const page = Math.max(1, Math.min(33334, Number.parseInt(params.get("pagina") ?? "", 10) || 1));
  const [search, setSearch] = useState("");
  const [activeForm, setActiveForm] = useState<"count" | "issue" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const canCount = access.capabilities.includes("stock.manage");
  const canIssue = canCount && access.capabilities.includes("stock.institutional");
  const variantSearch = useDeferredValue(search.trim());

  const options = useQuery({
    queryKey: [...queryKey, "stock", "options", variantSearch, locationId, variantId],
    queryFn: () => readStockOptions(scope, variantSearch, locationId, variantId),
    enabled: !invalidFilter && !showTransfers,
    meta: { persist: false },
  });
  const ledger = useQuery({
    queryKey: [...queryKey, "stock", view, locationId, variantId, page],
    queryFn: () => readStock(scope, { locationId, variantId, limit: pageSize, offset: (page - 1) * pageSize }, view),
    enabled: !invalidFilter && !showTransfers,
    meta: { persist: false },
  });
  const total = ledger.data?.total ?? 0;
  const pageCount = Math.ceil(total / pageSize);
  const appliedFilters = Boolean(locationId || variantId);

  function updateFilter(key: "local" | "variante", value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("pagina");
    setParams(next);
  }

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete("pagina");
    else next.set("pagina", String(nextPage));
    setParams(next);
  }

  function clearFilters() {
    setSearch("");
    setParams(view === "movimentos" ? { visao: view } : {});
  }

  function showMovement(newLocationId: string, newVariantId: string, message: string) {
    setActiveForm(null);
    setConfirmation(message);
    setSearch("");
    setParams({ visao: "movimentos", local: newLocationId, variante: newVariantId });
  }

  return (
    <>
      <StoreHeading
        title="Estoque"
        description="Consulte os saldos e confira a origem dos movimentos por local e variante."
        action={canCount && !activeForm && !showTransfers && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="ss-primary" onClick={() => { setConfirmation(""); setActiveForm("count"); }}>
              <ClipboardCheck aria-hidden="true" /> Registrar contagem
            </Button>
            {canIssue && <Button type="button" variant="outline" onClick={() => { setConfirmation(""); setActiveForm("issue"); }}>
              <PackageMinus aria-hidden="true" /> Saída institucional
            </Button>}
          </div>
        )}
      />
      {canCount && activeForm === "count" && !showTransfers && (
        <InventoryCountForm scope={scope} queryKey={queryKey} onCancel={() => setActiveForm(null)}
          onRecorded={(loc, variant) => showMovement(loc, variant, "Contagem registrada no histórico de estoque.")}
        />
      )}
      {canIssue && activeForm === "issue" && !showTransfers && (
        <InstitutionalIssueForm scope={scope} queryKey={queryKey} onCancel={() => setActiveForm(null)}
          onRecorded={(loc, variant) => showMovement(loc, variant, "Saída institucional registrada no estoque.")}
        />
      )}
      {confirmation && !showTransfers && <p role="status" className="ss-surface font-medium">{confirmation}</p>}
      <nav className="flex flex-wrap gap-2" aria-label="Visões de estoque">
        <Button asChild variant={!showTransfers && view === "saldos" ? "default" : "outline"} className={cn(!showTransfers && view === "saldos" && "ss-primary")}>
          <Link data-button aria-current={!showTransfers && view === "saldos" ? "page" : undefined} to={stockLink("saldos", locationId, variantId)}>Saldos físicos</Link>
        </Button>
        <Button asChild variant={view === "movimentos" ? "default" : "outline"} className={cn(view === "movimentos" && "ss-primary")}>
          <Link data-button aria-current={view === "movimentos" ? "page" : undefined} to={stockLink("movimentos", locationId, variantId)}>Movimentos</Link>
        </Button>
        {access.capabilities.includes("stock.transfers") && <Button asChild variant={showTransfers ? "default" : "outline"} className={cn(showTransfers && "ss-primary")}>
          <Link data-button aria-current={showTransfers ? "page" : undefined} to={stockLink("transferencias", "", "")}>Transferências</Link>
        </Button>}
      </nav>
      {showTransfers && access.capabilities.includes("stock.transfers") ? (
        <StockTransfers scope={scope} queryKey={queryKey} canManage={canCount}
          selectedId={uuid.safeParse(transferId).success ? transferId : ""}
          onSelect={(id) => setParams(id ? { visao: "transferencias", transferencia: id } : { visao: "transferencias" })}
        />
      ) : showTransfers ? (
        <StoreState title="Transferências indisponíveis" description="Aguarde a atualização do servidor para consultar transferências." />
      ) : invalidFilter ? (
        <StoreState
          title="Filtro inválido"
          description="Limpe os filtros para consultar o estoque."
          action={<Button variant="outline" onClick={clearFilters}>Limpar filtros</Button>}
        />
      ) : (
        <>
          <section className="ss-surface grid gap-3 sm:grid-cols-3" aria-label="Filtros de estoque">
            <StoreField id="ss-stock-location" label="Local">
              <select id="ss-stock-location" value={locationId} onChange={(event) => updateFilter("local", event.target.value)}>
                <option value="">Todos os locais</option>
                {locationId && !options.data?.locations.some((option) => option.id === locationId) && <option value={locationId}>Local selecionado</option>}
                {options.data?.locations.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </StoreField>
            <StoreField id="ss-stock-search" label="Buscar variante">
              <input id="ss-stock-search" type="search" placeholder="Nome ou SKU" maxLength={120} value={search} onChange={(event) => setSearch(event.target.value)} />
            </StoreField>
            <StoreField id="ss-stock-variant" label="Variante">
              <select id="ss-stock-variant" value={variantId} onChange={(event) => updateFilter("variante", event.target.value)}>
                <option value="">Todas as variantes</option>
                {variantId && !options.data?.variants.some((option) => option.id === variantId) && <option value={variantId}>Variante selecionada</option>}
                {options.data?.variants.map((option) => (
                  <option key={option.id} value={option.id}>{option.sku} · {option.product_name}{option.label && ` · ${option.label}`}</option>
                ))}
              </select>
            </StoreField>
            {variantSearch && options.isPending && <p className="text-sm text-[var(--ss-muted)] sm:col-span-3" role="status">Buscando variantes…</p>}
            {variantSearch && options.data?.variants.length === 0 && <p className="text-sm text-[var(--ss-muted)] sm:col-span-3" role="status">Nenhuma variante para esta busca.</p>}
            {options.isError && (
              <div className="sm:col-span-3"><StoreFailure message="Não foi possível carregar as opções de filtro." retry={() => void options.refetch()} /></div>
            )}
          </section>
          {ledger.isPending ? (
            <StoreState title="Carregando estoque" busy />
          ) : ledger.isError ? (
            <StoreFailure message={storeError(ledger.error)} retry={() => void ledger.refetch()} />
          ) : !ledger.data.items.length ? (
            <StoreState
              title={total ? "Nenhum registro nesta página" : view === "movimentos" ? "Nenhum movimento registrado" : "Nenhum saldo registrado"}
              description={total ? "Volte à primeira página para ver os registros." : appliedFilters ? "Confira os filtros selecionados." : "Os registros aparecem após um recebimento de compra ou uma contagem física."}
              action={total ? (
                <Button type="button" variant="outline" onClick={() => goToPage(1)}>Ir à primeira página</Button>
              ) : appliedFilters ? (
                <Button type="button" variant="outline" onClick={clearFilters}>Limpar filtros</Button>
              ) : undefined}
            />
          ) : (
            <section className="ss-surface" aria-labelledby="ss-stock-results">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
                <h2 id="ss-stock-results">{view === "movimentos" ? "Movimentos registrados" : "Saldos por local e proprietário"}</h2>
                <p className="text-sm text-[var(--ss-muted)]" role="status">{total} {total === 1 ? "registro" : "registros"}</p>
              </header>
              <ul className="divide-y">
                {ledger.data.items.map((item) => (
                  <StockRow
                    key={"id" in item ? item.id : `${item.variant_id}:${item.location_id}:${item.ownership}:${item.owner_supplier_id ?? ""}:${item.destination}`}
                    item={item}
                    canViewCatalog={access.capabilities.includes("catalog.view")}
                    canViewPurchases={access.capabilities.includes("purchases.view")}
                    canViewSales={access.capabilities.includes("sales.view")}
                  />
                ))}
              </ul>
              {pageCount > 1 && (
                <nav className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3" aria-label="Paginação do estoque">
                  <Button type="button" variant="outline" disabled={page === 1} onClick={() => goToPage(page - 1)}>
                    <ArrowLeft aria-hidden="true" /> Anterior
                  </Button>
                  <p className="text-sm">Página {page} de {pageCount}</p>
                  <Button type="button" variant="outline" disabled={page >= pageCount} onClick={() => goToPage(page + 1)}>
                    Próxima <ArrowRight aria-hidden="true" />
                  </Button>
                </nav>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
