import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  directoryStatuses, locationKinds, readDirectoryPages, supplierKinds, type DirectoryKind, type DirectoryRow,
} from "../api/directory";
import { storeError, storeRpc, type CommandResult, type StoreScope } from "../api/store";
import { fieldError, StoreFailure, StoreField } from "../components/StoreElements";
import { StoreFormDialog } from "../components/StoreFormDialog";
import { useStoreCommand } from "../hooks/useStoreCommand";

type Fields = "name" | "categories" | "lead_days" | "email";
type Errors = Partial<Record<Fields, string>>;
type DirectoryPayload = Pick<DirectoryRow, "name" | "kind" | "status" | "notes" | "categories" |
  "lead_days" | "terms" | "contact_name" | "email" | "phone" | "source_reference"> & { id?: string };

const staleVersion = /STALE_VERSION/i;
const errorMessage = (error: unknown) => (error as { message?: string } | null)?.message ?? "";

export function DirectoryEditor({ kind, scope, queryKey, row, latest, close, onSaved }: {
  kind: DirectoryKind;
  scope: StoreScope;
  queryKey: readonly unknown[];
  row?: DirectoryRow;
  latest?: DirectoryRow;
  close: () => void;
  onSaved: (row: DirectoryPayload) => void;
}) {
  const formId = useId();
  const [current, setCurrent] = useState(row);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [reloadError, setReloadError] = useState("");
  const [isReloading, setReloading] = useState(false);
  const submitted = useRef<DirectoryPayload | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const failure = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  const isLocation = kind === "locations";
  const options = isLocation ? locationKinds : supplierKinds;
  const write = isLocation ? "soja_store_save_location" : "soja_store_save_supplier";
  const recordLabel = isLocation ? "local" : "fornecedor";
  const command = useStoreCommand(scope, (requestId, payload: DirectoryPayload) =>
    storeRpc<CommandResult>(write, {
      ...scope, _request_id: requestId, _expected_version: current?.version ?? null, _payload: payload,
    }),
  () => {
    // Only these reads consume live directory rows. Historical purchase and cash names are snapshots.
    void client.invalidateQueries({ queryKey: [...queryKey, kind] });
    void client.invalidateQueries({ queryKey: [...queryKey, "purchase", "options"] });
    if (isLocation) {
      for (const key of [["stock", "saldos"], ["stock", "options"], ["pos-config"], ["dashboard"], ["inventory", "options"]]) {
        void client.invalidateQueries({ queryKey: [...queryKey, ...key] });
      }
    } else {
      for (const key of [["product-suppliers"], ["stock", "saldos"], ["stock", "movimentos"]]) {
        void client.invalidateQueries({ queryKey: [...queryKey, ...key] });
      }
    }
    if (submitted.current) onSaved(submitted.current);
  });
  const blocked = command.isPending || command.isUncertain || isReloading;
  const newer = latest && latest.version > (current?.version ?? 0) ? latest : undefined;
  const versionConflict = staleVersion.test(errorMessage(command.error));
  const stale = !!newer || versionConflict;
  const duplicateLocation = /DUPLICATE_LOCATION/i.test(errorMessage(command.error));

  useEffect(() => {
    if (!command.isError) return;
    if (versionConflict) void client.invalidateQueries({ queryKey: [...queryKey, kind] });
    if (duplicateLocation) {
      setErrors({ name: storeError(command.error) });
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus());
    } else {
      failure.current?.focus();
    }
  }, [client, command.error, command.isError, duplicateLocation, kind, queryKey, versionConflict]);

  function id(name: string) {
    return `${formId}-${name}`;
  }

  function invalid(form: HTMLFormElement, fields: Errors) {
    setErrors(fields);
    requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || stale) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const get = (key: string) => String(data.get(key) ?? "").trim();
    const name = get("name");
    const categoryText = get("categories");
    const categories = current?.categories && categoryText === current.categories.join("\n")
      ? current.categories
      : categoryText.split("\n").map((category) => category.trim()).filter(Boolean);
    const leadInput = form.elements.namedItem("lead_days") as HTMLInputElement | null;
    const leadDays = get("lead_days") ? Number(get("lead_days")) : null;
    const email = get("email");
    const nextErrors: Errors = {};
    if (name.length < 2) nextErrors.name = "Informe um nome com pelo menos dois caracteres.";
    if (categories.length > 20 || categories.some((category) => category.length > 100)) {
      nextErrors.categories = "Informe até 20 categorias com até 100 caracteres cada.";
    }
    if (leadInput?.validity.badInput || (leadDays !== null && (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 3650))) {
      nextErrors.lead_days = "Informe um número inteiro de 0 a 3650.";
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = "Informe um e-mail válido.";
    if (Object.keys(nextErrors).length) {
      invalid(form, nextErrors);
      return;
    }

    const payload: DirectoryPayload = {
      ...(current && { id: current.id }),
      name,
      kind: get("kind") as DirectoryRow["kind"],
      status: get("status") as DirectoryRow["status"],
      ...(isLocation ? { notes: get("notes") || null } : {
        categories,
        lead_days: leadDays,
        terms: get("terms") || null,
        contact_name: get("contact_name") || null,
        email: email || null,
        phone: get("phone") || null,
        source_reference: get("source_reference") || null,
      }),
    };
    setErrors({});
    submitted.current = payload;
    command.mutate(payload);
  }

  async function reload() {
    if (!current || (dirty && !window.confirm("Carregar a versão atual e descartar as suas alterações?"))) return;
    setReloading(true);
    setReloadError("");
    try {
      let found = newer;
      if (!found) {
        for await (const rows of readDirectoryPages(scope, kind)) {
          found = rows.find(({ id }) => id === current.id);
          if (found) break;
        }
      }
      if (!found) {
        setReloadError("Este registro não está mais disponível.");
        return;
      }
      setCurrent(found);
      setDirty(false);
      setErrors({});
      command.reset();
    } catch (error) {
      setReloadError(storeError(error));
    } finally {
      setReloading(false);
    }
  }

  return (
    <StoreFormDialog
      title={current ? `Editar ${recordLabel}` : `Novo ${recordLabel}`}
      size={isLocation ? "small" : "default"}
      onClose={close}
      dirty={dirty || command.isUncertain}
      busy={command.isPending}
      formId={formId}
      submitDisabled={blocked || stale || (!!current && !dirty)}
    >
      <form id={formId} ref={formRef} className="grid gap-4" onSubmit={submit} onChange={() => setDirty(true)}
        key={current?.version ?? "new"} noValidate>
        <fieldset disabled={blocked} className="grid min-w-0 gap-3">
          {!isLocation && <legend className="mb-1 font-semibold">Identificação</legend>}
          <StoreField id={id("name")} label="Nome" error={errors.name}>
            <input {...fieldError(id("name"), errors.name)} name="name" maxLength={160} defaultValue={current?.name} required />
          </StoreField>
          <div className="grid gap-3 sm:grid-cols-2">
            <StoreField id={id("kind")} label="Tipo">
              <select id={id("kind")} name="kind" defaultValue={current?.kind}>
                {Object.entries(options).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </StoreField>
            <StoreField id={id("status")} label="Situação">
              <select id={id("status")} name="status" defaultValue={current?.status ?? "active"}>
                {Object.entries(directoryStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </StoreField>
          </div>
          {isLocation && (
            <StoreField id={id("notes")} label="Observações">
              <textarea id={id("notes")} name="notes" maxLength={600} rows={2} defaultValue={current?.notes ?? ""} />
            </StoreField>
          )}
        </fieldset>
        {!isLocation && (
          <>
            <fieldset disabled={blocked} className="grid min-w-0 gap-3 border-t border-[var(--ss-line)] pt-2">
              <legend className="pr-2 font-semibold">Condições comerciais</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <StoreField id={id("categories")} label="Categorias (uma por linha)" error={errors.categories}>
                  <textarea {...fieldError(id("categories"), errors.categories)} name="categories" maxLength={2019}
                    rows={2} defaultValue={current?.categories?.join("\n")} />
                </StoreField>
                <StoreField id={id("lead-days")} label="Prazo em dias" error={errors.lead_days}>
                  <input {...fieldError(id("lead-days"), errors.lead_days)} name="lead_days" type="number"
                    min={0} max={3650} step={1} defaultValue={current?.lead_days ?? ""} />
                </StoreField>
              </div>
              <StoreField id={id("terms")} label="Condições de pagamento">
                <textarea id={id("terms")} name="terms" maxLength={600} rows={2} defaultValue={current?.terms ?? ""} />
              </StoreField>
            </fieldset>
            <fieldset disabled={blocked} className="grid min-w-0 gap-3 border-t border-[var(--ss-line)] pt-2">
              <legend className="pr-2 font-semibold">Contato</legend>
              <StoreField id={id("contact")} label="Nome do contato">
                <input id={id("contact")} name="contact_name" maxLength={160} defaultValue={current?.contact_name ?? ""} />
              </StoreField>
              <div className="grid gap-3 sm:grid-cols-2">
                <StoreField id={id("email")} label="E-mail" error={errors.email}>
                  <input {...fieldError(id("email"), errors.email)} name="email" type="email" maxLength={254} defaultValue={current?.email ?? ""} />
                </StoreField>
                <StoreField id={id("phone")} label="Telefone">
                  <input id={id("phone")} name="phone" type="tel" maxLength={40} defaultValue={current?.phone ?? ""} />
                </StoreField>
              </div>
            </fieldset>
            <details className="border-t pt-2" open={current?.source_reference ? true : undefined}>
              <summary className="w-fit cursor-pointer py-2 font-semibold">Detalhes opcionais</summary>
              <StoreField id={id("source")} label="Referência de origem">
                <input id={id("source")} name="source_reference" maxLength={600} disabled={blocked}
                  defaultValue={current?.source_reference ?? ""} />
              </StoreField>
            </details>
          </>
        )}
        {((command.isError && !duplicateLocation) || stale || reloadError) && (
          <div ref={failure} tabIndex={-1} className="grid gap-2">
            {command.isError && (!stale || command.isUncertain) && !duplicateLocation && (
              <StoreFailure message={storeError(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />
            )}
            {stale && !command.isUncertain && (
              <StoreFailure message="Uma versão mais recente está disponível."
                retryLabel="Carregar versão atual" retry={isReloading ? undefined : () => void reload()} />
            )}
            {reloadError && <StoreFailure message={reloadError} />}
          </div>
        )}
      </form>
    </StoreFormDialog>
  );
}
