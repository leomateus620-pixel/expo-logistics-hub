import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { storeError, type StoreScope } from "../api/store";
import { readStock, readStockOptions, type StockBalance, type StockMovement } from "../api/stock";
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
const movementLabels: Record<StockMovement["movement_type"], string> = { purchase_receipt: "Recebimento de compra" };

export function formatStockQuantity(quantity: string) {
  const [integer, fraction] = quantity.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimals = fraction?.replace(/0+$/, "");
  return decimals ? `${grouped},${decimals}` : grouped;
}

function stockLink(view: "saldos" | "movimentos", locationId: string, variantId: string) {
  const search = new URLSearchParams();
  if (view === "movimentos") search.set("visao", view);
  if (locationId) search.set("local", locationId);
  if (variantId) search.set("variante", variantId);
  return { pathname: stockPath, search: search.toString() };
}

function StockRow({ item, canViewCatalog, canViewPurchases }: {
  item: StockBalance | StockMovement;
  canViewCatalog: boolean;
  canViewPurchases: boolean;
}) {
  const movement = "movement_type" in item ? item : null;
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
      </div>
      <div className="grid content-start gap-1">
        <p className="font-medium">{item.location_name}</p>
        <p className="text-sm text-[var(--ss-muted)]">
          {item.owner_supplier_name ?? ownershipLabels[item.ownership]} · {destinationLabels[item.destination] ?? item.destination}
        </p>
      </div>
      <dl className="grid content-start gap-1">
        <div>
          <dt className="sr-only">{movement ? "Quantidade recebida" : "Saldo físico"}</dt>
          <dd className="font-semibold">{formatStockQuantity(item.quantity)} {item.unit}</dd>
        </div>
        {movement ? (
          <>
            <div className="flex flex-wrap gap-x-1 text-sm text-[var(--ss-muted)]">
              <dt>Recebido em</dt>
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
      {movement ? canViewPurchases && (
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
  const view = params.get("visao") === "movimentos" ? "movimentos" : "saldos";
  const page = Math.max(1, Math.min(33334, Number.parseInt(params.get("pagina") ?? "", 10) || 1));
  const [search, setSearch] = useState("");
  const variantSearch = useDeferredValue(search.trim());

  const options = useQuery({
    queryKey: [...queryKey, "stock", "options", variantSearch, locationId, variantId],
    queryFn: () => readStockOptions(scope, variantSearch, locationId, variantId),
    enabled: !invalidFilter,
    meta: { persist: false },
  });
  const ledger = useQuery({
    queryKey: [...queryKey, "stock", view, locationId, variantId, page],
    queryFn: () => readStock(scope, { locationId, variantId, limit: pageSize, offset: (page - 1) * pageSize }, view),
    enabled: !invalidFilter,
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

  return (
    <>
      <StoreHeading title="Estoque" description="Consulte o saldo físico registrado e confira a origem de cada entrada." />
      <nav className="flex flex-wrap gap-2" aria-label="Visões de estoque">
        <Button asChild variant={view === "saldos" ? "default" : "outline"} className={cn(view === "saldos" && "ss-primary")}>
          <Link data-button aria-current={view === "saldos" ? "page" : undefined} to={stockLink("saldos", locationId, variantId)}>Saldos físicos</Link>
        </Button>
        <Button asChild variant={view === "movimentos" ? "default" : "outline"} className={cn(view === "movimentos" && "ss-primary")}>
          <Link data-button aria-current={view === "movimentos" ? "page" : undefined} to={stockLink("movimentos", locationId, variantId)}>Movimentos</Link>
        </Button>
      </nav>
      {invalidFilter ? (
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
              description={total ? "Volte à primeira página para ver os registros." : appliedFilters ? "Confira os filtros selecionados." : "As entradas aparecem após a confirmação de um recebimento."}
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
