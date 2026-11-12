import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronRight, Plus, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { readCatalog, storeError, type StoreScope } from "../api/store";
import { StoreFailure, StoreField, StoreHeading, StoreState } from "../components/StoreElements";
import { productStatus, type ProductStatus } from "../domain/catalog";

export const catalogPath = "/comissoes/soja-store/produtos";
const pageSize = 30;

export function CatalogPage({ scope, queryKey, canManage }: {
  scope: StoreScope;
  queryKey: readonly unknown[];
  canManage: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const search = (params.get("busca") ?? "").trim().slice(0, 120);
  const statusParam = params.get("situacao");
  const status = statusParam && Object.prototype.hasOwnProperty.call(productStatus, statusParam) ? statusParam as ProductStatus : "";
  const page = Math.max(1, Math.min(333334, Number.parseInt(params.get("pagina") ?? "", 10) || 1));
  const [draftSearch, setDraftSearch] = useState(search);
  useEffect(() => setDraftSearch(search), [search]);

  const catalog = useQuery({
    queryKey: [...queryKey, "catalog", search, status, page],
    queryFn: () => readCatalog(scope, search, status, (page - 1) * pageSize),
    meta: { persist: false },
  });
  const total = catalog.data?.total ?? 0;
  const pageCount = Math.ceil(total / pageSize);
  const detailSearch = params.toString();

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    const value = draftSearch.trim();
    if (value) next.set("busca", value);
    if (values.get("situacao")) next.set("situacao", String(values.get("situacao")));
    setParams(next);
  }

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete("pagina");
    else next.set("pagina", String(nextPage));
    setParams(next);
  }

  function detailLink(id: string) {
    return { pathname: `${catalogPath}/${id}`, search: detailSearch };
  }

  return (
    <>
      <StoreHeading
        title="Produtos"
        description="Cadastre produtos e acompanhe os SKUs de cada variante."
        action={canManage && (
          <Button asChild className="ss-primary">
            <Link data-button to={detailLink("novo")}><Plus aria-hidden="true" /> Novo produto</Link>
          </Button>
        )}
      />
      <form onSubmit={applyFilters} className="ss-surface grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)_auto] sm:items-end">
        <StoreField id="ss-product-search" label="Buscar produto">
          <input
            id="ss-product-search"
            type="search"
            placeholder="Nome, SKU, categoria ou variante"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            maxLength={120}
          />
        </StoreField>
        <StoreField id="ss-product-status" label="Situação">
          <select id="ss-product-status" name="situacao" key={status} defaultValue={status}>
            <option value="">Todas</option>
            {Object.entries(productStatus).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </StoreField>
        <Button type="submit" variant="outline"><Search aria-hidden="true" /> Buscar</Button>
      </form>
      {catalog.isPending ? <StoreState title="Carregando produtos" busy /> : catalog.isError ? (
        <StoreFailure message={storeError(catalog.error)} retry={() => void catalog.refetch()} />
      ) : !catalog.data.items.length ? (
        <StoreState
          title={search || status ? "Nenhum produto para estes filtros" : "Nenhum produto nesta página"}
          description={search || status ? "Altere ou limpe os filtros para ampliar a busca." :
            total ? "Volte à primeira página para continuar." : "Os produtos cadastrados aparecerão aqui com seus SKUs."}
          action={search || status ? (
            <Button type="button" variant="outline" onClick={() => setParams({})}>Limpar filtros</Button>
          ) : page > 1 ? (
            <Button type="button" variant="outline" onClick={() => goToPage(1)}>Ir à primeira página</Button>
          ) : canManage ? (
            <Button variant="outline" asChild><Link data-button to={detailLink("novo")}>Cadastrar produto</Link></Button>
          ) : undefined}
        />
      ) : (
        <section aria-labelledby="ss-catalog-results" className="ss-surface">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
            <h2 id="ss-catalog-results">Catálogo</h2>
            <p role="status" className="text-sm text-[var(--ss-muted)]">{total} {total === 1 ? "produto" : "produtos"}</p>
          </div>
          <ul className="divide-y">
            {catalog.data.items.map((product) => (
              <li key={product.id}>
                <Link className="ss-list-link rounded" to={detailLink(product.id)}>
                  <span className="grid gap-1">
                    <strong className="font-semibold">{product.name}</strong>
                    <span className="text-sm text-[var(--ss-muted)]">{product.category || "Categoria em aberto"}</span>
                  </span>
                  <span className="hidden text-sm sm:block">
                    {product.variants.length === 1 ? product.variants[0].sku : `${product.variants.length} variantes`}
                  </span>
                  <span className="ss-pill" data-status={product.status}>{productStatus[product.status]}</span>
                  <ChevronRight aria-hidden="true" size={17} className="hidden sm:block" />
                </Link>
              </li>
            ))}
          </ul>
          {pageCount > 1 && (
            <nav aria-label="Paginação do catálogo" className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <Button type="button" variant="outline" onClick={() => goToPage(page - 1)} disabled={page === 1}>
                <ArrowLeft aria-hidden="true" /> Anterior
              </Button>
              <p className="text-sm">Página {page} de {pageCount}</p>
              <Button type="button" variant="outline" onClick={() => goToPage(page + 1)} disabled={page >= pageCount}>
                Próxima <ArrowRight aria-hidden="true" />
              </Button>
            </nav>
          )}
        </section>
      )}
    </>
  );
}
