import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronRight, Package, Plus, Search } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readCatalog, storeError, type CommandResult, type StoreScope } from "../api/store";
import { ProductFormDialog } from "../components/ProductFormDialog";
import { StoreFailure, StoreField, StoreFilters, StoreHeading, StoreState } from "../components/StoreElements";
import { productStatus, type ProductStatus } from "../domain/catalog";

export const catalogPath = "/comissoes/soja-store/produtos";
const pageSize = 30;

export function CatalogPage({ scope, queryKey, canManage, initialCreate = false }: {
  scope: StoreScope;
  queryKey: readonly unknown[];
  canManage: boolean;
  initialCreate?: boolean;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = (params.get("busca") ?? "").trim().slice(0, 120);
  const statusParam = params.get("situacao");
  const status = statusParam && Object.prototype.hasOwnProperty.call(productStatus, statusParam) ? statusParam as ProductStatus : "";
  const page = Math.max(1, Math.min(333334, Number.parseInt(params.get("pagina") ?? "", 10) || 1));
  const [draftSearch, setDraftSearch] = useState(search);
  const [creating, setCreating] = useState(false);
  useEffect(() => setDraftSearch(search), [search]);

  const catalog = useQuery({
    queryKey: [...queryKey, "catalog", search, status, page],
    queryFn: () => readCatalog(scope, search, status, (page - 1) * pageSize),
    meta: { persist: false },
  });
  const total = catalog.data?.total ?? 0;
  const pageCount = Math.ceil(total / pageSize);
  const detailSearch = params.toString();
  const accessDenied = (catalog.error as { code?: string } | null)?.code === "42501";
  const activeFilters = Number(Boolean(search)) + Number(Boolean(status));
  const canCreate = canManage && !accessDenied;

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams(params);
    const value = draftSearch.trim();
    if (value) next.set("busca", value);
    else next.delete("busca");
    if (value !== search) next.delete("pagina");
    setDraftSearch(value);
    setParams(next);
  }

  function setStatus(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("situacao", value);
    else next.delete("situacao");
    next.delete("pagina");
    setParams(next);
  }

  function clearFilters() {
    const next = new URLSearchParams(params);
    ["busca", "situacao", "pagina"].forEach((key) => next.delete(key));
    setDraftSearch("");
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

  function closeCreate() {
    setCreating(false);
    if (initialCreate) navigate({ pathname: catalogPath, search: detailSearch }, { replace: true });
  }

  function saved(result: CommandResult) {
    closeCreate();
    toast.success("Produto cadastrado.", {
      action: { label: "Ver produto", onClick: () => navigate(detailLink(result.id)) },
    });
  }

  return (
    <>
      <StoreHeading
        title="Produtos"
        icon={Package}
        action={canCreate && (
          <Button type="button" className="ss-primary" data-ss-create-trigger onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" /> Novo produto
          </Button>
        )}
        controls={
          <form onSubmit={applyFilters} className="ss-filterbar" role="search" aria-label="Filtrar catálogo">
            <div className="ss-search">
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
              <Button type="submit" variant="outline" aria-label="Buscar produtos">
                <Search aria-hidden="true" /> <span className="hidden sm:inline">Buscar</span>
              </Button>
            </div>
            <StoreFilters count={activeFilters} onClear={clearFilters}>
              <StoreField id="ss-product-status" label="Situação">
                <select id="ss-product-status" name="situacao" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">Todas</option>
                  {Object.entries(productStatus).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </StoreField>
            </StoreFilters>
          </form>
        }
      />
      {initialCreate && !canManage && <StoreState title="Cadastro restrito" description="Seu perfil pode consultar os produtos. Para cadastrar, é preciso ter permissão de edição." />}
      {canCreate && (creating || initialCreate) && (
        <ProductFormDialog scope={scope} queryKey={queryKey} onClose={closeCreate} onSaved={saved} />
      )}
      {catalog.isPending ? <StoreState title="Carregando produtos" busy /> : accessDenied ? (
        <StoreState title="Catálogo sem acesso" description="Seu perfil não tem acesso à consulta de produtos nesta loja." />
      ) : catalog.isError ? (
        <StoreFailure message={storeError(catalog.error)} retry={() => void catalog.refetch()} />
      ) : !catalog.data.items.length ? (
        <StoreState
          title={total > 0 ? "Nenhum produto nesta página" : activeFilters ? "Nenhum produto para estes filtros" : "Nenhum produto cadastrado"}
          action={total > 0 && page > 1 ? (
            <Button type="button" variant="outline" onClick={() => goToPage(1)}>Ir à primeira página</Button>
          ) : activeFilters ? (
            <Button type="button" variant="outline" onClick={clearFilters}>Limpar filtros</Button>
          ) : canCreate ? (
            <Button type="button" variant="outline" onClick={() => setCreating(true)}>Cadastrar produto</Button>
          ) : undefined}
        />
      ) : (
        <section aria-labelledby="ss-catalog-results" className="ss-surface">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
            <h2 id="ss-catalog-results">Catálogo</h2>
            <p role="status" className="text-sm text-[var(--ss-muted)]">{total} {total === 1 ? "produto" : "produtos"}</p>
          </div>
          <ul className="divide-y">
            {catalog.data.items.map((product) => {
              const variantSummary = product.variants.length === 1 ? product.variants[0].sku : `${product.variants.length} variantes`;
              return <li key={product.id}>
                <Link className="ss-list-link rounded" to={detailLink(product.id)}>
                  <span className="grid gap-1">
                    <strong className="font-semibold">{product.name}</strong>
                    <span className="text-sm text-[var(--ss-muted)]">{product.category || "Categoria em aberto"}</span>
                    <span className="text-sm text-[var(--ss-muted)] sm:hidden">{variantSummary}</span>
                  </span>
                  <span className="hidden text-sm sm:block">{variantSummary}</span>
                  <span className="ss-pill" data-status={product.status}>{productStatus[product.status]}</span>
                  <ChevronRight aria-hidden="true" size={17} className="hidden sm:block" />
                </Link>
              </li>;
            })}
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
