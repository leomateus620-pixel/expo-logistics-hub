import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { storeError, storeRpc, type CommandResult, type StoreScope } from "../api/store";
import { StoreFailure, StoreField, StoreHeading, StoreState } from "../components/StoreElements";
import { useStoreCommand } from "../hooks/useStoreCommand";
import { useUnsavedStoreForm } from "../hooks/useUnsavedStoreForm";

const locationKinds = { warehouse: "Estoque", point: "Ponto de atendimento", temporary: "Local temporário" } as const;
const supplierKinds = { unspecified: "A definir", individual: "Pessoa física", company: "Pessoa jurídica" } as const;
const directory = {
  locations: {
    title: "Configurações",
    description: "Cadastre os locais físicos da Soja Store e seus pontos de atendimento.",
    listTitle: "Locais",
    newLabel: "Novo local",
    empty: "Nenhum local cadastrado",
    saved: "Local salvo.",
    read: "soja_store_locations",
    write: "soja_store_save_location",
  },
  suppliers: {
    title: "Fornecedores",
    description: "Consulte os fornecedores da loja, seus prazos e condições.",
    listTitle: "Fornecedores cadastrados",
    newLabel: "Novo fornecedor",
    empty: "Nenhum fornecedor cadastrado",
    saved: "Fornecedor salvo.",
    read: "soja_store_suppliers",
    write: "soja_store_save_supplier",
  },
} as const;

type DirectoryKind = keyof typeof directory;
type DirectoryStatus = "active" | "archived";

type DirectoryRow = {
  id: string;
  name: string;
  kind: keyof typeof locationKinds | keyof typeof supplierKinds;
  status: DirectoryStatus;
  version: number;
  notes?: string | null;
  categories?: string[];
  lead_days?: number | null;
  terms?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  source_reference?: string | null;
};

const pageSize = 30;

export function DirectoryPage({ kind, scope, queryKey, canManage }: {
  kind: DirectoryKind;
  scope: StoreScope;
  queryKey: readonly unknown[];
  canManage: boolean;
}) {
  const config = directory[kind];
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DirectoryRow | "new" | null>(null);
  const options = kind === "locations" ? locationKinds : supplierKinds;
  const items = useQuery({
    queryKey: [...queryKey, kind, page],
    queryFn: () => storeRpc<{ items: DirectoryRow[]; total: number }>(config.read, {
      ...scope, _limit: pageSize, _offset: (page - 1) * pageSize,
    }),
    meta: { persist: false },
  });

  return (
    <>
      <StoreHeading
        title={config.title}
        description={config.description}
        action={canManage && !editing && (
          <Button type="button" className="ss-primary" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> {config.newLabel}</Button>
        )}
      />
      {editing ? (
        <DirectoryEditor
          key={editing === "new" ? "new" : editing.id}
          kind={kind}
          scope={scope}
          queryKey={queryKey}
          row={editing === "new" ? undefined : editing}
          close={() => setEditing(null)}
          latest={items.data?.items.find((row) => editing !== "new" && row.id === editing.id)}
        />
      ) : items.isPending ? <StoreState title={`Carregando ${config.listTitle.toLowerCase()}`} busy /> :
        items.isError ? <StoreFailure message={storeError(items.error)} retry={() => void items.refetch()} /> :
          !items.data.items.length ? <StoreState title={config.empty} action={page > 1 && (
            <Button type="button" variant="outline" onClick={() => setPage(1)}>Ir à primeira página</Button>
          )} /> :
            <section className="ss-surface" aria-labelledby="ss-directory-list">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
                <h2 id="ss-directory-list">{config.listTitle}</h2>
                <p className="text-sm text-[var(--ss-muted)]">{items.data.total} {items.data.total === 1 ? "registro" : "registros"}</p>
              </div>
              <ul className="divide-y">
                {items.data.items.map((row) => (
                  <li key={row.id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                    <div className="min-w-0 break-words">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="font-semibold">{row.name}</strong>
                        <span className="ss-pill" data-status={row.status}>{row.status === "active" ? "Ativo" : "Arquivado"}</span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--ss-muted)]">
                        {options[row.kind]}{row.lead_days != null ? ` · Prazo de ${row.lead_days} dias` : ""}
                      </p>
                      {row.notes && <p className="mt-1 text-sm">{row.notes}</p>}
                      {!!row.categories?.length && <p className="mt-1 text-sm">{row.categories.join(" · ")}</p>}
                      {(row.contact_name || row.email || row.phone || row.terms || row.source_reference) && (
                        <details className="mt-1">
                          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Contato e condições</summary>
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
                    {canManage && (
                      <Button type="button" variant="outline" className="w-fit" onClick={() => setEditing(row)} aria-label={`Editar ${row.name}`}>
                        <Pencil aria-hidden="true" /> Editar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {items.data.total > pageSize && (
                <nav aria-label="Paginação dos registros" className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <Button variant="outline" onClick={() => setPage(page - 1)} disabled={page === 1}><ArrowLeft aria-hidden="true" /> Anterior</Button>
                  <p className="text-sm">Página {page} de {Math.ceil(items.data.total / pageSize)}</p>
                  <Button variant="outline" onClick={() => setPage(page + 1)} disabled={page * pageSize >= items.data.total}>Próxima <ArrowRight aria-hidden="true" /></Button>
                </nav>
              )}
            </section>}
    </>
  );
}

function DirectoryEditor({ kind, scope, queryKey, row, latest, close }: {
  kind: DirectoryKind;
  scope: StoreScope;
  queryKey: readonly unknown[];
  row?: DirectoryRow;
  latest?: DirectoryRow;
  close: () => void;
}) {
  const [current, setCurrent] = useState(row);
  const [dirty, setDirty] = useState(false);
  const [localError, setLocalError] = useState("");
  const client = useQueryClient();
  const isLocation = kind === "locations";
  const options = isLocation ? locationKinds : supplierKinds;
  const command = useStoreCommand(scope, (requestId, payload: object) =>
    storeRpc<CommandResult>(directory[kind].write, {
      ...scope, _request_id: requestId, _expected_version: current?.version ?? null, _payload: payload,
    }),
  () => {
    toast.success(directory[kind].saved);
    void client.invalidateQueries({ queryKey });
    close();
  });
  useUnsavedStoreForm(dirty || command.isPending || command.isUncertain);

  const blocked = command.isPending || command.isUncertain;
  const stale = !!latest && latest.version > (current?.version ?? 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || stale) return;
    const data = new FormData(event.currentTarget);
    const get = (key: string) => String(data.get(key) ?? "").trim();
    const categories = get("categories").split(",").map((category) => category.trim()).filter(Boolean);
    if (!get("name")) {
      setLocalError("Informe o nome.");
      event.currentTarget.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
      return;
    }
    if (categories.length > 20 || categories.some((category) => category.length > 100)) {
      setLocalError("Informe até 20 categorias com até 100 caracteres cada.");
      event.currentTarget.querySelector<HTMLInputElement>('input[name="categories"]')?.focus();
      return;
    }
    setLocalError("");
    command.mutate({
      ...(current && { id: current.id }),
      name: get("name"),
      kind: get("kind"),
      status: get("status"),
      ...(isLocation ? { notes: get("notes") || null } : {
        categories,
        lead_days: get("lead_days") ? Number(get("lead_days")) : null,
        terms: get("terms") || null,
        contact_name: get("contact_name") || null,
        email: get("email") || null,
        phone: get("phone") || null,
        source_reference: get("source_reference") || null,
      }),
    }, { onError: (error) => {
      if (/STALE_VERSION/i.test(String((error as { message?: string })?.message))) {
        void client.invalidateQueries({ queryKey: [...queryKey, kind] });
      }
    } });
  }

  return (
    <form className="ss-surface grid gap-4" onSubmit={submit} onChange={() => setDirty(true)} key={current?.version ?? "new"}>
      <h2>{current ? `Editar ${isLocation ? "local" : "fornecedor"}` : directory[kind].newLabel}</h2>
      <fieldset disabled={blocked} className="grid gap-4 sm:grid-cols-2">
        <StoreField id="ss-directory-name" label="Nome">
          <input id="ss-directory-name" name="name" maxLength={160} defaultValue={current?.name} required />
        </StoreField>
        <StoreField id="ss-directory-kind" label="Tipo">
          <select id="ss-directory-kind" name="kind" defaultValue={current?.kind}>
            {Object.entries(options).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </StoreField>
        <StoreField id="ss-directory-status" label="Situação">
          <select id="ss-directory-status" name="status" defaultValue={current?.status ?? "active"}>
            <option value="active">Ativo</option>
            <option value="archived">Arquivado</option>
          </select>
        </StoreField>
        {isLocation ? (
          <StoreField id="ss-location-notes" label="Observações">
            <textarea id="ss-location-notes" name="notes" maxLength={600} rows={2} defaultValue={current?.notes ?? ""} />
          </StoreField>
        ) : (
          <>
            <StoreField id="ss-supplier-lead" label="Prazo em dias">
              <input id="ss-supplier-lead" name="lead_days" type="number" min={0} max={3650} step={1} defaultValue={current?.lead_days ?? ""} />
            </StoreField>
            <StoreField id="ss-supplier-categories" label="Categorias separadas por vírgula">
              <input id="ss-supplier-categories" name="categories" maxLength={2019} defaultValue={current?.categories?.join(", ")} />
            </StoreField>
            <StoreField id="ss-supplier-terms" label="Condições de pagamento">
              <textarea id="ss-supplier-terms" name="terms" maxLength={600} rows={2} defaultValue={current?.terms ?? ""} />
            </StoreField>
            <StoreField id="ss-supplier-contact" label="Nome do contato">
              <input id="ss-supplier-contact" name="contact_name" maxLength={160} defaultValue={current?.contact_name ?? ""} />
            </StoreField>
            <StoreField id="ss-supplier-email" label="E-mail">
              <input id="ss-supplier-email" name="email" type="email" maxLength={254} defaultValue={current?.email ?? ""} />
            </StoreField>
            <StoreField id="ss-supplier-phone" label="Telefone">
              <input id="ss-supplier-phone" name="phone" type="tel" maxLength={40} defaultValue={current?.phone ?? ""} />
            </StoreField>
            <StoreField id="ss-supplier-source" label="Referência de origem">
              <input id="ss-supplier-source" name="source_reference" maxLength={600} defaultValue={current?.source_reference ?? ""} />
            </StoreField>
          </>
        )}
      </fieldset>
      {localError && <StoreFailure message={localError} />}
      {command.isError && <StoreFailure message={storeError(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
      {stale && <StoreFailure message="Uma versão mais recente está disponível." retryLabel="Carregar versão atual" retry={() => {
        if (dirty && !window.confirm("Carregar a versão atual e descartar as suas alterações?")) return;
        setCurrent(latest);
        setDirty(false);
        setLocalError("");
        command.reset();
      }} />}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="ss-primary" disabled={blocked || stale || (!!current && !dirty)}>{command.isPending ? "Salvando…" : "Salvar"}</Button>
        <Button type="button" variant="outline" disabled={command.isPending} onClick={() => {
          if ((!dirty && !command.isUncertain) || window.confirm("Fechar o cadastro sem salvar as alterações?")) close();
        }}>Fechar</Button>
      </div>
    </form>
  );
}
