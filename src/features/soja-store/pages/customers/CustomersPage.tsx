import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronRight, Plus, Search } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { storeError, storeRpc, type CommandResult } from "../../api/store";
import { fieldError, StoreFailure, StoreField, StoreHeading, StoreState } from "../../components/StoreElements";
import { useStoreCommand } from "../../hooks/useStoreCommand";
import { useUnsavedStoreForm } from "../../hooks/useUnsavedStoreForm";
import { CustomerInterests } from "./CustomerInterests";
import { CustomerSales } from "./CustomerSales";
import { customerKinds, customersPath, customerStatuses, type Customer, type CustomerDetail, type CustomerPageContext } from "./types";

const pageSize = 30;
const emailAddress = z.string().email();

export function CustomersPage({ scope, queryKey, canManage, detailId, canReadCatalog, canReadSales }: CustomerPageContext & {
  detailId?: string;
  canReadCatalog: boolean;
  canReadSales?: boolean;
}) {
  const context = { scope, queryKey, canManage };
  return detailId
    ? <CustomerRecord {...context} id={detailId} canReadCatalog={canReadCatalog} canReadSales={canReadSales} />
    : <CustomerList {...context} />;
}

function CustomerList({ scope, queryKey, canManage }: CustomerPageContext) {
  const [search, setSearch] = useState("");
  const [page, goToPage] = useState(1);
  const [draft, setDraft] = useState("");
  const list = useQuery({
    queryKey: [...queryKey, "customers", "list", search, page],
    queryFn: () => storeRpc<{ total: number; items: Customer[] }>("soja_store_customers", {
      ...scope, _search: search || null, _limit: pageSize, _offset: (page - 1) * pageSize,
    }),
    meta: { persist: false },
  });

  return (
    <>
      <StoreHeading title="Clientes e apoiadores" description="Organize cadastros de atendimento e acompanhe interesses por produto."
        action={canManage && <Button asChild className="ss-primary"><Link data-button to={`${customersPath}/novo`}><Plus aria-hidden="true" /> Novo cadastro</Link></Button>} />
      <form className="ss-surface flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        setSearch(draft.trim());
        goToPage(1);
      }}>
        <div className="min-w-0 flex-1 basis-48">
          <StoreField id="ss-customer-search" label="Buscar cliente ou apoiador">
            <input id="ss-customer-search" type="search" maxLength={120} placeholder="Nome, cidade ou contato" value={draft}
              onChange={(event) => setDraft(event.target.value)} />
          </StoreField>
        </div>
        <Button type="submit" variant="outline"><Search aria-hidden="true" /> Buscar</Button>
      </form>
      {list.isPending ? <StoreState title="Carregando cadastros" busy /> : list.isError ? (
        <StoreFailure message={storeError(list.error)} retry={() => void list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <StoreState
          title={list.data.total ? "Nenhum cadastro nesta página" : search ? "Nenhum cadastro para esta busca" : "Nenhum cadastro registrado"}
          description={list.data.total ? "Volte à primeira página para ver os registros." : search ? "Confira o termo usado na busca." : "Os cadastros da loja aparecerão aqui."}
          action={list.data.total ? <Button type="button" variant="outline" onClick={() => goToPage(1)}>Ir à primeira página</Button>
            : search ? <Button type="button" variant="outline" onClick={() => { setDraft(""); setSearch(""); goToPage(1); }}>Limpar busca</Button> : undefined}
        />
      ) : (
        <section className="ss-surface" aria-labelledby="ss-customer-results">
          <header className="flex flex-wrap justify-between gap-3 border-b pb-3">
            <h2 id="ss-customer-results">Cadastros</h2>
            <p role="status">{list.data.total} {list.data.total === 1 ? "cadastro" : "cadastros"}</p>
          </header>
          <ul className="divide-y">
            {list.data.items.map((customer) => (
              <li key={customer.id}>
                <Link className="ss-list-link rounded" to={`${customersPath}/${customer.id}`}>
                  <span className="grid gap-1"><strong>{customer.name}</strong><span className="text-sm">{customerKinds[customer.kind]}</span></span>
                  <span className="hidden text-sm sm:block">{customer.city}</span>
                  <span className="ss-pill" data-status={customer.status}>{customerStatuses[customer.status]}</span>
                  <ChevronRight aria-hidden="true" className="hidden sm:block" size={18} />
                </Link>
              </li>
            ))}
          </ul>
          {list.data.total > pageSize && (
            <nav aria-label="Paginação de clientes" className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <Button type="button" variant="outline" disabled={page <= 1} onClick={() => goToPage(page - 1)}><ArrowLeft aria-hidden="true" /> Anterior</Button>
              <p className="text-sm">Página {page} de {Math.ceil(list.data.total / pageSize)}</p>
              <Button type="button" variant="outline" disabled={page * pageSize >= list.data.total} onClick={() => goToPage(page + 1)}>Próxima <ArrowRight aria-hidden="true" /></Button>
            </nav>
          )}
        </section>
      )}
    </>
  );
}

function CustomerRecord({ scope, queryKey, canManage, canReadCatalog, canReadSales, id }: CustomerPageContext & {
  id: string;
  canReadCatalog: boolean;
  canReadSales?: boolean;
}) {
  const [params] = useSearchParams();
  const search = params.toString();
  const validId = z.string().uuid().safeParse(id).success;
  const query = useQuery({
    queryKey: [...queryKey, "customers", "detail", id],
    queryFn: () => storeRpc<CustomerDetail | null>("soja_store_customer", { ...scope, _customer_id: id }),
    enabled: validId,
    meta: { persist: false },
  });

  return (
    <>
      <Button variant="outline" asChild className="w-fit"><Link data-button to={{ pathname: customersPath, search }}><ArrowLeft aria-hidden="true" /> Clientes e apoiadores</Link></Button>
      {id === "novo" ? (
        <>
          <StoreHeading title="Novo cadastro" description="Registre os dados necessários para o atendimento." />
          {canManage ? <CustomerEditor scope={scope} queryKey={queryKey} search={search} /> :
            <StoreFailure message="Seu perfil precisa de permissão para criar cadastros." />}
        </>
      ) : !validId ? <StoreState title="Cadastro não encontrado" /> : query.isPending ? (
        <StoreState title="Carregando cadastro" busy />
      ) : query.isError ? (
        (query.error as { code?: string }).code === "PT404"
          ? <StoreState title="Cadastro não encontrado" />
          : <StoreFailure message={storeError(query.error)} retry={() => void query.refetch()} />
      ) : query.data ? (
        <CustomerDetails customer={query.data} scope={scope} queryKey={queryKey} canManage={canManage} canReadCatalog={canReadCatalog} canReadSales={canReadSales} />
      ) : <StoreState title="Cadastro não encontrado" />}
    </>
  );
}

function CustomerDetails({ customer, scope, queryKey, canManage, canReadCatalog, canReadSales }: CustomerPageContext & {
  customer: CustomerDetail;
  canReadCatalog: boolean;
  canReadSales?: boolean;
}) {
  const [editing, setEditing] = useState<Customer | null>(null);
  const fields = [
    ["Nome", customer.name], ["Tipo de cadastro", customerKinds[customer.kind]], ["Situação", customerStatuses[customer.status]],
    ["Cidade", customer.city], ["E-mail", customer.email], ["Telefone", customer.phone],
    ["Comunicação autorizada", customer.communication_consent ? "Sim" : "Não"],
  ];
  return (
    <>
      <StoreHeading title={customer.name} description="Cadastro de cliente ou apoiador"
        action={canManage && !editing && <Button type="button" variant="outline" onClick={() => setEditing(customer)}>Editar cadastro</Button>} />
      {editing ? <CustomerEditor customer={editing} scope={scope} queryKey={queryKey}
        currentVersion={customer.version} close={() => setEditing(null)} reload={() => setEditing(customer)} /> : (
        <section className="ss-surface grid gap-3" aria-labelledby="ss-customer-data">
          <h2 id="ss-customer-data">Dados do cadastro</h2>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map(([label, value]) => <div key={label} className="min-w-0 break-words"><dt className="text-sm text-[var(--ss-muted)]">{label}</dt><dd>{value || "Não informado"}</dd></div>)}
          </dl>
        </section>
      )}
      {!editing && <CustomerInterests customer={customer} scope={scope} queryKey={queryKey} canManage={canManage} canReadCatalog={canReadCatalog} />}
      {!editing && canReadSales && <CustomerSales scope={scope} queryKey={queryKey} customerId={customer.id} />}
    </>
  );
}

function CustomerEditor({ customer, scope, queryKey, search, currentVersion, close, reload }: Omit<CustomerPageContext, "canManage"> & {
  customer?: Customer;
  search?: string;
  currentVersion?: number;
  close?: () => void;
  reload?: () => void;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const command = useStoreCommand(scope, (requestId, payload: object) =>
    storeRpc<CommandResult>("soja_store_save_customer", {
      ...scope, _request_id: requestId, _expected_version: customer?.version ?? null, _payload: payload,
    }),
  (result) => {
    toast.success("Cadastro salvo.");
    void client.invalidateQueries({ queryKey: [...queryKey, "customers"] });
    if (close) close();
    else navigate({ pathname: `${customersPath}/${result.id}`, search }, { replace: true });
  });
  const blocked = command.isPending || command.isUncertain;
  const stale = currentVersion !== undefined && currentVersion !== customer?.version;
  useUnsavedStoreForm(dirty || blocked);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || stale) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const invalid: typeof errors = {};
    if (value("name").length < 2) invalid.name = "Informe o nome com pelo menos dois caracteres.";
    if (value("email") && !emailAddress.safeParse(value("email")).success) invalid.email = "Informe um endereço de e-mail válido.";
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    command.mutate({
      id: customer?.id,
      kind: value("kind"),
      name: value("name"),
      email: value("email") || null,
      phone: value("phone") || null,
      city: value("city") || null,
      status: value("status") || "active",
      communication_consent: data.has("consent"),
    }, { onError: (error) => {
      if (customer && /STALE_VERSION/i.test(String((error as { message?: string })?.message))) {
        void client.invalidateQueries({ queryKey: [...queryKey, "customers", "detail", customer.id] });
      }
    } });
  }

  return (
    <form className="ss-surface grid gap-4" key={customer?.version ?? "new"} onSubmit={submit} onChange={() => setDirty(true)} noValidate>
      <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2" disabled={blocked}>
        <StoreField id="ss-customer-name" label="Nome ou razão social" error={errors.name}>
          <input {...fieldError("ss-customer-name", errors.name)} name="name" autoComplete="off" maxLength={160} required defaultValue={customer?.name} />
        </StoreField>
        <StoreField id="ss-customer-kind" label="Tipo de cadastro">
          <select id="ss-customer-kind" name="kind" defaultValue={customer?.kind ?? "individual"}>
            {Object.entries(customerKinds).map(([kind, label]) => <option value={kind} key={kind}>{label}</option>)}
          </select>
        </StoreField>
        <StoreField id="ss-customer-city" label="Cidade (opcional)">
          <input id="ss-customer-city" name="city" maxLength={100} autoComplete="off" defaultValue={customer?.city ?? ""} />
        </StoreField>
        <StoreField id="ss-customer-phone" label="Telefone (opcional)">
          <input id="ss-customer-phone" name="phone" type="tel" maxLength={40} autoComplete="off" defaultValue={customer?.phone ?? ""} />
        </StoreField>
        <StoreField id="ss-customer-email" label="E-mail (opcional)" error={errors.email}>
          <input {...fieldError("ss-customer-email", errors.email)} name="email" type="email" maxLength={254} autoComplete="off" defaultValue={customer?.email ?? ""} />
        </StoreField>
        {customer && (
          <StoreField id="ss-customer-status" label="Situação do cadastro">
            <select id="ss-customer-status" name="status" defaultValue={customer.status}>
              {Object.entries(customerStatuses).map(([status, label]) => <option value={status} key={status}>{label}</option>)}
            </select>
          </StoreField>
        )}
        <label className="flex min-h-11 items-center gap-2 sm:col-span-2">
          <input type="checkbox" name="consent" defaultChecked={customer?.communication_consent ?? false} className="size-4 accent-emerald-800" />
          <span>Autorizou contato para comunicações da loja</span>
        </label>
      </fieldset>
      {command.isError && <StoreFailure message={storeError(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
      {stale && !command.isUncertain && (
        <StoreFailure message="O cadastro mudou enquanto estava aberto." retryLabel="Carregar versão atual" retry={() => {
          if (!dirty || window.confirm("Descartar as alterações e abrir a versão atual?")) {
            setDirty(false);
            setErrors({});
            command.reset();
            reload?.();
          }
        }} />
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="ss-primary" disabled={blocked || stale}>{command.isPending ? "Salvando…" : "Salvar cadastro"}</Button>
        {close && <Button type="button" variant="outline" disabled={command.isPending} onClick={() => {
          if ((!dirty && !command.isUncertain) || window.confirm("Descartar as alterações deste cadastro?")) close();
        }}>Cancelar</Button>}
      </div>
    </form>
  );
}
