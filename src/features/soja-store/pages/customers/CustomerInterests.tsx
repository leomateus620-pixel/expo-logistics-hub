import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readCatalog, storeError, storeRpc, type CommandResult } from "../../api/store";
import { fieldError, StoreFailure, StoreField } from "../../components/StoreElements";
import { decimalLabel, readDecimal, scaledDecimal } from "../../domain/purchases";
import { useStoreCommand } from "../../hooks/useStoreCommand";
import { useUnsavedStoreForm } from "../../hooks/useUnsavedStoreForm";
import type { CustomerDetail, CustomerPageContext, Interest } from "./types";

const interestStatus = { open: "Em aberto", closed: "Encerrado" } as const;

export function CustomerInterests({ customer, canManage, canReadCatalog, scope, queryKey }: CustomerPageContext & {
  customer: CustomerDetail;
  canReadCatalog: boolean;
}) {
  const [editing, setEditing] = useState<Interest | "new" | null>(null);
  const canAdd = canManage && canReadCatalog && customer.status === "active";

  return (
    <section className="ss-surface grid gap-4" aria-labelledby="ss-interest-heading">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="ss-interest-heading">Interesses</h2>
          <p className="text-sm text-[var(--ss-muted)]">Registre produtos que a pessoa deseja consultar novamente.</p>
        </div>
        {canAdd && !editing && (
          <Button type="button" variant="outline" onClick={() => setEditing("new")}><Plus aria-hidden="true" /> Registrar interesse</Button>
        )}
      </header>
      {editing && (
        <InterestEditor
          key={editing === "new" ? "new" : editing.id}
          customer={customer}
          interest={editing === "new" ? undefined : editing}
          scope={scope}
          queryKey={queryKey}
          close={() => setEditing(null)}
        />
      )}
      {customer.interests.length === 0 ? (
        <p role="status">Nenhum interesse registrado.</p>
      ) : (
        <ul className="divide-y">
          {customer.interests.map((interest) => (
            <li className="flex flex-wrap items-start justify-between gap-3 py-3" key={interest.id}>
              <div className="min-w-0 break-words">
                <p className="font-semibold">{interest.product_name}{interest.variant_label && ` · ${interest.variant_label}`}</p>
                <p className="text-sm text-[var(--ss-muted)]">
                  {interest.sku}{interest.quantity && ` · Quantidade ${decimalLabel(interest.quantity)}`}
                </p>
                {interest.notes && <p className="mt-1 text-sm">{interest.notes}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="ss-pill" data-status={interest.status === "closed" ? "archived" : "active"}>{interestStatus[interest.status]}</span>
                {canManage && customer.status === "active" && !editing && (
                  <Button type="button" variant="outline" aria-label={`Editar interesse em ${interest.sku}`} onClick={() => setEditing(interest)}>Editar</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InterestEditor({ customer, interest, scope, queryKey, close }: Omit<CustomerPageContext, "canManage"> & {
  customer: CustomerDetail;
  interest?: Interest;
  close: () => void;
}) {
  const client = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const [variantId, setVariantId] = useState(interest?.variant_id ?? "");
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [errors, setErrors] = useState<{ variant?: string; quantity?: string }>({});
  const products = useQuery({
    queryKey: [...queryKey, "customer-interest-catalog", searchTerm],
    queryFn: () => readCatalog(scope, searchTerm, "active", 0),
    enabled: !interest,
    meta: { persist: false },
  });
  const options = products.data?.items.flatMap((product) => product.variants.filter(({ active }) => active).map((variant) => ({
    id: variant.id,
    name: [product.name, variant.label, variant.sku].filter(Boolean).join(" · "),
  }))) ?? [];
  const command = useStoreCommand(scope, (requestId, payload: object) =>
    storeRpc<CommandResult>("soja_store_save_interest", {
      ...scope, _request_id: requestId, _expected_version: interest?.version ?? null, _payload: payload,
    }),
  () => {
    toast.success("Interesse salvo.");
    void client.invalidateQueries({ queryKey: [...queryKey, "customers"] });
    close();
  });
  const blocked = command.isPending || command.isUncertain;
  const errorMessage = /INTEREST_ALREADY_OPEN/i.test(String((command.error as { message?: string } | null)?.message ?? ""))
    ? "Já existe um interesse em aberto para esta variante. Abra o interesse registrado para alterá-lo."
    : storeError(command.error);
  useUnsavedStoreForm(dirty || blocked);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = String(data.get("quantity") ?? "").trim();
    const quantity = input ? readDecimal(input) : null;
    const invalid: typeof errors = {};
    if (!variantId) invalid.variant = "Selecione uma variante do catálogo.";
    if (input && (quantity === null || scaledDecimal(quantity) <= 0n)) {
      invalid.quantity = "Informe uma quantidade positiva com até seis casas decimais.";
    }
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    command.mutate({
      id: interest?.id,
      customer_id: customer.id,
      variant_id: variantId,
      quantity,
      status: data.get("status"),
      notes: String(data.get("notes") ?? "").trim() || null,
    });
  }

  useEffect(() => {
    if (!interest) setVariantId("");
  }, [searchTerm, interest]);

  return (
    <div className="ss-variant grid gap-3">
      {!interest && (
        <form role="search" aria-label="Buscar variante para interesse" className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => { event.preventDefault(); setSearchTerm(search.trim()); }}>
          <StoreField id="ss-interest-search" label="Buscar produto ou SKU">
            <input id="ss-interest-search" type="search" maxLength={120} value={search} disabled={blocked} onChange={(event) => setSearch(event.target.value)} />
          </StoreField>
          <Button type="submit" variant="outline" disabled={blocked}><Search aria-hidden="true" /> Buscar</Button>
        </form>
      )}
      <form className="grid gap-3" onSubmit={submit} onChange={() => setDirty(true)} noValidate>
        <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2" disabled={blocked}>
          {!interest && (
            <div className="sm:col-span-2">
              <StoreField id="ss-interest-variant" label="Variante" error={errors.variant}>
                <select {...fieldError("ss-interest-variant", errors.variant)} value={variantId} onChange={(event) => setVariantId(event.target.value)}>
                  <option value="">Selecione uma variante</option>
                  {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </StoreField>
              {products.isPending && <p className="mt-2 text-sm" role="status">Carregando variantes…</p>}
              {products.isError && <StoreFailure message={storeError(products.error)} retry={() => void products.refetch()} />}
              {products.isSuccess && options.length === 0 && <p className="mt-2 text-sm" role="status">Nenhuma variante ativa encontrada.</p>}
              {products.isSuccess && products.data.total > 30 && <p className="mt-2 text-sm">Refine a busca para consultar mais produtos.</p>}
            </div>
          )}
          <StoreField id="ss-interest-quantity" label="Quantidade (opcional)" error={errors.quantity}>
            <input {...fieldError("ss-interest-quantity", errors.quantity)} name="quantity" inputMode="decimal" defaultValue={interest?.quantity ? decimalLabel(interest.quantity) : ""} maxLength={20} />
          </StoreField>
          <StoreField id="ss-interest-status" label="Situação do interesse">
            <select id="ss-interest-status" name="status" defaultValue={interest?.status ?? "open"}>
              {Object.entries(interestStatus).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </StoreField>
          <div className="sm:col-span-2">
            <StoreField id="ss-interest-notes" label="Observação (opcional)">
              <textarea id="ss-interest-notes" name="notes" maxLength={600} rows={2} defaultValue={interest?.notes ?? ""} />
            </StoreField>
          </div>
        </fieldset>
        {command.isError && <StoreFailure message={errorMessage} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="ss-primary" disabled={blocked}>{command.isPending ? "Salvando…" : "Salvar interesse"}</Button>
          <Button type="button" variant="outline" disabled={command.isPending} onClick={() => {
            if ((!dirty && !command.isUncertain) || window.confirm("Descartar as alterações deste interesse?")) close();
          }}>Cancelar</Button>
        </div>
      </form>
    </div>
  );
}
