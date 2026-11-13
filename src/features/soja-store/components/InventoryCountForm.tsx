import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { readInventoryPosition } from "../api/stock";
import { storeError, storeRpc, type CommandResult, type StoreScope } from "../api/store";
import { decimalLabel, readDecimal, type NamedOption } from "../domain/purchases";
import { useStoreCommand } from "../hooks/useStoreCommand";
import { useUnsavedStoreForm } from "../hooks/useUnsavedStoreForm";
import { PurchaseOption } from "./PurchaseOption";
import { fieldError, StoreFailure, StoreField } from "./StoreElements";

type InventoryCommand = {
  version: number;
  variant_id: string;
  location_id: string;
  kind: "opening_count" | "inventory_adjustment";
  quantity: string;
  reason: string;
  reference: string | null;
};

export function InventoryCountForm({ scope, queryKey, onRecorded, onCancel }: {
  scope: StoreScope;
  queryKey: readonly unknown[];
  onRecorded: (locationId: string, variantId: string) => void;
  onCancel: () => void;
}) {
  const client = useQueryClient();
  const [location, setLocation] = useState<NamedOption | null>(null);
  const [variant, setVariant] = useState<NamedOption | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [checkedVersion, setCheckedVersion] = useState<number | null>(null);
  const position = useQuery({
    queryKey: [...queryKey, "inventory", "position", location?.id, variant?.id],
    queryFn: () => {
      if (!variant || !location) throw new Error("Selecione uma posição de estoque.");
      return readInventoryPosition(scope, variant.id, location.id);
    },
    enabled: Boolean(variant && location),
    meta: { persist: false },
  });

  const command = useStoreCommand(
    scope,
    (requestId, { version, ...payload }: InventoryCommand) =>
      storeRpc<CommandResult>("soja_store_record_inventory", {
        ...scope, _request_id: requestId, _expected_version: version, _payload: payload,
      }),
    () => {
      void client.invalidateQueries({ queryKey });
      if (location && variant) onRecorded(location.id, variant.id);
    },
  );

  useUnsavedStoreForm(dirty || command.isPending || command.isUncertain);
  const hasSelection = Boolean(variant && location);
  const sending = command.isPending || command.isUncertain;
  const stale = (command.error as { message?: string } | null)?.message === "SOJA_STORE_STALE_VERSION";
  const checked = checkedVersion !== null && checkedVersion === position.data?.version;

  function changePosition(setValue: (value: NamedOption) => void, value: NamedOption) {
    setValue(value);
    setCheckedVersion(null);
    setDirty(true);
    command.reset();
  }

  function refreshPosition() {
    setCheckedVersion(null);
    command.reset();
    void position.refetch();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || stale || position.isFetching) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const quantity = readDecimal(String(formData.get("quantity") ?? ""));
    const reason = String(formData.get("reason") ?? "").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const invalid: Record<string, string> = {};
    if (!location) invalid.location = "Selecione o local da contagem.";
    if (!variant) invalid.variant = "Selecione o produto e a variante.";
    if (quantity === null) invalid.quantity = "Informe uma quantidade física com até seis casas decimais.";
    if (reason.length < 3) invalid.reason = "Descreva o motivo da contagem.";
    if (!checked) invalid.confirm = "Confirme a conferência física para registrar o saldo.";
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!location || !variant || !position.data || quantity === null || checkedVersion === null) return;
    command.mutate({
      version: checkedVersion,
      variant_id: variant.id,
      location_id: location.id,
      kind: position.data.has_movement ? "inventory_adjustment" : "opening_count",
      quantity,
      reason,
      reference: reference || null,
    });
  }

  return (
    <form onSubmit={submit} onChange={(event) => {
      setDirty(true);
      if (event.target instanceof HTMLInputElement && event.target.name === "quantity") setCheckedVersion(null);
    }} className="ss-surface grid gap-4" aria-labelledby="ss-inventory-title">
      <header>
        <h2 id="ss-inventory-title">Registrar contagem física</h2>
        <p className="text-sm text-[var(--ss-muted)]">
          Confira o estoque próprio da loja no local. O sistema registra a diferença com o saldo anterior.
        </p>
      </header>
      <fieldset disabled={sending} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <PurchaseOption source="inventory" kind="locations" label="Local da contagem" scope={scope} queryKey={queryKey}
            value={location} onChange={(value) => changePosition(setLocation, value)} error={errors.location} disabled={sending} />
          <PurchaseOption source="inventory" kind="variants" label="Produto ou SKU" scope={scope} queryKey={queryKey}
            value={variant} onChange={(value) => changePosition(setVariant, value)} error={errors.variant} disabled={sending} />
        </div>
        {hasSelection && position.isFetching && <p role="status" className="text-sm">Consultando saldo registrado…</p>}
        {hasSelection && position.isError && (
          <StoreFailure message="Não foi possível consultar esta posição." retry={() => void position.refetch()} />
        )}
        {position.data && hasSelection && (
          <p className="text-sm">
            {position.data.has_movement ? <>Ajuste de inventário · Saldo registrado de <strong>{decimalLabel(position.data.quantity)}</strong></> : "Contagem inicial · Sem movimento registrado"}
          </p>
        )}
        <StoreField id="ss-inventory-quantity" label="Quantidade física conferida" error={errors.quantity}>
          <input {...fieldError("ss-inventory-quantity", errors.quantity)} name="quantity" inputMode="decimal" maxLength={19} />
        </StoreField>
        <StoreField id="ss-inventory-reason" label="Motivo da contagem" error={errors.reason}>
          <textarea {...fieldError("ss-inventory-reason", errors.reason)} name="reason" maxLength={600} rows={3} />
        </StoreField>
        <StoreField id="ss-inventory-reference" label="Referência da conferência (opcional)">
          <input id="ss-inventory-reference" name="reference" maxLength={600} />
        </StoreField>
        <div>
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium" htmlFor="ss-inventory-confirm">
            <input {...fieldError("ss-inventory-confirm", errors.confirm)} type="checkbox" checked={checked}
              disabled={!position.data || position.isFetching || position.isError}
              onChange={(event) => setCheckedVersion(event.target.checked ? position.data?.version ?? null : null)} className="size-5 shrink-0" />
            Conferi a quantidade física desta posição.
          </label>
          {checkedVersion !== null && !checked && <p role="status" className="text-sm">O saldo mudou. Confira a quantidade e confirme novamente.</p>}
          {errors.confirm && <p id="ss-inventory-confirm-error" className="ss-field-error">{errors.confirm}</p>}
        </div>
      </fieldset>
      {command.isError && (
        <StoreFailure
          message={stale ? "O saldo mudou durante a contagem. Atualize a posição e confira novamente." : storeError(command.error)}
          retry={stale ? refreshPosition : command.isUncertain ? command.retry : undefined}
          retryLabel={stale ? "Atualizar saldo" : "Verificar envio"}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="ss-primary" disabled={sending || stale || position.isFetching || position.isError}>
          {command.isPending ? "Registrando…" : "Confirmar contagem"}
        </Button>
        <Button type="button" variant="outline" disabled={sending} onClick={() => {
          if (!dirty || window.confirm("Descartar a contagem ainda não registrada?")) onCancel();
        }}>Cancelar</Button>
      </div>
    </form>
  );
}
