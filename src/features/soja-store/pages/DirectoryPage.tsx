import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Pencil, Plus, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  directoryStatuses, locationKinds, matchesDirectoryFilters, readDirectory, readDirectoryPages, supplierKinds,
  type DirectoryKind, type DirectoryRow,
} from "../api/directory";
import { storeError, type StoreScope } from "../api/store";
import { StoreFailure, StoreField, StoreFilters, StoreHeading, StoreState } from "../components/StoreElements";
import { SOJA_STORE_SECTIONS } from "../navigation";
import { DirectoryEditor } from "./DirectoryEditor";

const directory = {
  locations: {
    listTitle: "Locais",
    newLabel: "Novo local",
    empty: "Nenhum local cadastrado",
    saved: "Local salvo.",
    searchLabel: "Buscar local",
    searchPlaceholder: "Nome do local",
  },
  suppliers: {
    listTitle: "Fornecedores",
    newLabel: "Novo fornecedor",
    empty: "Nenhum fornecedor cadastrado",
    saved: "Fornecedor salvo.",
    searchLabel: "Buscar fornecedor",
    searchPlaceholder: "Nome ou categoria",
  },
} as const;

const pageSize = 30;

export function DirectoryPage({ kind, scope, queryKey, canManage }: {
  kind: DirectoryKind;
  scope: StoreScope;
  queryKey: readonly unknown[];
  canManage: boolean;
}) {
  const config = directory[kind];
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<DirectoryRow | "new" | null>(null);
  const isLocation = kind === "locations";
  const options = isLocation ? locationKinds : supplierKinds;
  const kindLabels = { ...locationKinds, ...supplierKinds };
  const search = (params.get("busca") ?? "").trim().slice(0, 120);
  const [draftSearch, setDraftSearch] = useState(search);
  useEffect(() => setDraftSearch(search), [search]);
  const typeParam = params.get("tipo") ?? "";
  const statusParam = params.get("situacao") ?? "";
  const type = Object.prototype.hasOwnProperty.call(options, typeParam) ? typeParam : "";
  const status = Object.prototype.hasOwnProperty.call(directoryStatuses, statusParam) ? statusParam : "";
  const filters = { search, type, status };
  const filterCount = Number(Boolean(type)) + Number(Boolean(status));
  const filtered = Boolean(search || filterCount);
  const page = Math.max(1, Math.min(333334, Number.parseInt(params.get("pagina") ?? "", 10) || 1));
  const offset = (page - 1) * pageSize;
  const serverPage = useQuery({
    queryKey: [...queryKey, kind, "page", page],
    queryFn: () => readDirectory(scope, kind, pageSize, offset),
    enabled: !filtered,
    meta: { persist: false },
  });
  const filteredDirectory = useQuery({
    queryKey: [...queryKey, kind, "complete"],
    queryFn: async ({ signal }) => {
      const rows: DirectoryRow[] = [];
      for await (const items of readDirectoryPages(scope, kind, signal)) rows.push(...items);
      return rows;
    },
    enabled: filtered,
    staleTime: 30_000,
    meta: { persist: false },
  });
  const results = filteredDirectory.data?.filter((row) => matchesDirectoryFilters(row, filters));
  const query = filtered ? filteredDirectory : serverPage;
  const items = filtered ? results?.slice(offset, offset + pageSize) : serverPage.data?.items;
  const total = filtered ? results?.length : serverPage.data?.total;
  const pageCount = Math.ceil((total ?? 0) / pageSize);
  const denied = (query.error as { code?: string } | null)?.code === "42501";
  const canEdit = canManage && !denied;

  function updateParams(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setParams(next);
  }

  function clearFilters() {
    setDraftSearch("");
    updateParams({ busca: "", tipo: "", situacao: "", pagina: "" });
  }
  const goToPage = (next: number) => updateParams({ pagina: next > 1 ? String(next) : "" });
  const newRecord = () => setEditing("new");

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDraftSearch(draftSearch.trim());
    updateParams({ busca: draftSearch.trim(), pagina: "" });
  }

  const controls = (
    <div className="ss-filterbar">
      <form className="ss-search" role="search" aria-label={config.searchLabel} onSubmit={applySearch}>
        <StoreField id="ss-directory-search" label={config.searchLabel}>
          <input id="ss-directory-search" name="busca" type="search" maxLength={120}
            value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder={config.searchPlaceholder} />
        </StoreField>
        <Button type="submit" variant="outline" aria-label="Buscar">
          <Search aria-hidden="true" /> <span className="hidden sm:inline">Buscar</span>
        </Button>
      </form>
      <StoreFilters count={filterCount + Number(Boolean(search))} onClear={clearFilters}>
        <StoreField id="ss-directory-filter-kind" label="Tipo">
          <select id="ss-directory-filter-kind" value={type} onChange={(event) => updateParams({ tipo: event.target.value, pagina: "" })}>
            <option value="">Todos</option>
            {Object.entries(options).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </StoreField>
        <StoreField id="ss-directory-filter-status" label="Situação">
          <select id="ss-directory-filter-status" value={status} onChange={(event) => updateParams({ situacao: event.target.value, pagina: "" })}>
            <option value="">Todas</option>
            {Object.entries(directoryStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </StoreField>
      </StoreFilters>
    </div>
  );

  return (
    <>
      {isLocation && <StoreHeading title="Configurações" icon={SOJA_STORE_SECTIONS.configuracoes.icon} />}
      <StoreHeading
        title={config.listTitle}
        level={isLocation ? 2 : 1}
        icon={isLocation ? undefined : SOJA_STORE_SECTIONS.fornecedores.icon}
        controls={controls}
        action={canEdit && (
          <Button type="button" className="ss-primary" data-ss-create-trigger onClick={newRecord}>
            <Plus aria-hidden="true" /> {config.newLabel}
          </Button>
        )}
      />
      {query.isPending ? (
        <StoreState title={`Carregando ${config.listTitle.toLowerCase()}`} busy />
      ) : denied ? (
        <StoreState title={`Sem acesso a ${config.listTitle.toLowerCase()}`} description="Seu perfil não pode consultar estes registros." />
      ) : query.isError ? (
        <StoreFailure message={storeError(query.error)} retry={() => void query.refetch()} />
      ) : !items?.length ? (
        <StoreState
          title={total ? "Nenhum registro nesta página" : filtered ? "Nenhum registro para estes filtros" : config.empty}
          action={total ? (
            <Button type="button" variant="outline" onClick={() => goToPage(1)}>Ir à primeira página</Button>
          ) : filtered ? (
            <Button type="button" variant="outline" onClick={clearFilters}>Limpar filtros</Button>
          ) : canEdit ? (
            <Button type="button" variant="outline" onClick={newRecord}><Plus aria-hidden="true" /> {config.newLabel}</Button>
          ) : undefined}
        />
      ) : (
        <section className="ss-surface" aria-label={config.listTitle}>
          <p role="status" className="border-b pb-2 text-sm text-[var(--ss-muted)]">
            {total} {total === 1 ? "registro" : "registros"}
          </p>
          <ul className="divide-y">
            {items.map((row) => (
              <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 py-2 sm:gap-3">
                <div className="min-w-0 break-words">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="font-semibold">{row.name}</strong>
                    <span className="ss-pill" data-status={row.status}>{directoryStatuses[row.status]}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--ss-muted)]">
                    {kindLabels[row.kind]}{row.lead_days != null ? ` · Prazo de ${row.lead_days} dias` : ""}
                  </p>
                  {row.notes && <p className="mt-1 text-sm">{row.notes}</p>}
                  {!!row.categories?.length && <p className="mt-1 text-sm">{row.categories.join(" · ")}</p>}
                  {(row.contact_name || row.email || row.phone || row.terms || row.source_reference) && (
                    <details className="mt-1">
                      <summary className="w-fit cursor-pointer py-3 text-sm font-medium">Contato e condições</summary>
                      <dl className="grid gap-2 sm:grid-cols-2">
                        {[
                          ["Contato", row.contact_name], ["E-mail", row.email], ["Telefone", row.phone],
                          ["Condições de pagamento", row.terms], ["Referência de origem", row.source_reference],
                        ].filter(([, value]) => value).map(([label, value]) => (
                          <div key={label}><dt className="text-sm text-[var(--ss-muted)]">{label}</dt><dd>{value}</dd></div>
                        ))}
                      </dl>
                    </details>
                  )}
                </div>
                {canEdit && (
                  <Button type="button" variant="outline" onClick={() => setEditing(row)} aria-label={`Editar ${row.name}`}>
                    <Pencil aria-hidden="true" /> Editar
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {pageCount > 1 && (
            <nav aria-label="Paginação dos registros" className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
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
      {canEdit && editing && (
        <DirectoryEditor
          key={editing === "new" ? "new" : editing.id}
          kind={kind}
          scope={scope}
          queryKey={queryKey}
          row={editing === "new" ? undefined : editing}
          latest={(filtered ? filteredDirectory.data : serverPage.data?.items)?.find((row) => editing !== "new" && row.id === editing.id)}
          close={() => setEditing(null)}
          onSaved={(row) => {
            toast.success(config.saved, !matchesDirectoryFilters(row, filters) ? {
              description: "O registro está fora do recorte atual.",
              action: { label: "Limpar filtros", onClick: clearFilters },
            } : undefined);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
