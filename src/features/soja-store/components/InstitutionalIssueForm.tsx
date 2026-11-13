import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { readInventoryPosition } from "../api/stock";
import { storeError, storeRpc, type CommandResult, type StoreScope } from "../api/store";
import { decimalLabel, readDecimal, scaledDecimal, type NamedOption } from "../domain/purchases";
import { useStoreCommand } from "../hooks/useStoreCommand";
import { useUnsavedStoreForm } from "../hooks/useUnsavedStoreForm";
import { PurchaseOption } from "./PurchaseOption";
import { fieldError, StoreFailure, StoreField } from "./StoreElements";

type IssueCommand = {
  version: number;
  variant_id: string;
  location_id: string;
  destination_commission_id: string;
  quantity: string;
  recipient: string;
  reason: string;
  reference: string | null;
};

export function InstitutionalIssueForm({ scope, queryKey, onRecorded, onCancel }: {
  scope: StoreScope;
  queryKey: readonly unknown[];
  onRecorded: (locationId: string, variantId: string) => void;
  onCancel: () => void;
}) {
  const client = useQueryClient();
  const [location, setLocation] = useState<NamedOption | null>(null);
  const [variant, setVariant] = useState<NamedOption | null>(null);
  const [destination, setDestination] = useState<NamedOption | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const position = useQuery({
    queryKey: [...queryKey, "inventory", "position", location?.id, variant?.id],
    queryFn: () => {
      if (!location || !variant) throw new Error("Selecione a posição.");
      return readInventoryPosition(scope, variant.id, location.id);
    },
    enabled: Boolean(location && variant),
    meta: { persist: false },
  });
  const command = useStoreCommand(scope, (requestId, { version, ...payload }: IssueCommand) =>
    storeRpc<CommandResult>("soja_store_register_institutional_issue", {
      ...scope, _request_id: requestId, _expected_version: version, _payload: payload,
    }),
  () => {
    void client.invalidateQueries({ queryKey });
    if (location && variant) onRecorded(location.id, variant.id);
  });

  const sending = command.isPending || command.isUncertain;
  const stale = (command.error as { message?: string } | null)?.message === "SOJA_STORE_STALE_VERSION";
  useUnsavedStoreForm(dirty || sending);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || stale || position.isFetching || position.isError) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const read = (name: string) => String(values.get(name) ?? "").trim();
    const quantity = readDecimal(read("quantity"));
    const invalid: Record<string, string> = {};
    if (!location) invalid.location = "Selecione o local de saída.";
    if (!variant) invalid.variant = "Selecione o produto e a variante.";
    if (!destination) invalid.destination = "Selecione a comissão de destino.";
    if (quantity === null || scaledDecimal(quantity) <= 0n) invalid.quantity = "Informe uma quantidade maior que zero.";
    else if (position.data && scaledDecimal(quantity) > scaledDecimal(position.data.available_quantity)) {
      invalid.quantity = "A quantidade supera o saldo disponível da posição.";
    }
    if (read("recipient").length < 2) invalid.recipient = "Identifique quem recebeu os itens.";
    if (read("reason").length < 3) invalid.reason = "Descreva o motivo da saída.";
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!location || !variant || !destination || !position.data || quantity === null) return;
    command.mutate({
      version: position.data.version, variant_id: variant.id, location_id: location.id,
      destination_commission_id: destination.id, quantity,
      recipient: read("recipient"), reason: read("reason"), reference: read("reference") || null,
    });
  }

  function choose(setter: (value: NamedOption) => void, value: NamedOption) {
    setter(value);
    setDirty(true);
    command.reset();
  }

  return (
    <form onSubmit={submit} onChange={() => setDirty(true)} className="ss-surface grid gap-4" aria-labelledby="ss-institutional-issue-title">
      <header>
        <h2 id="ss-institutional-issue-title">Registrar saída institucional</h2>
        <p className="text-sm text-[var(--ss-muted)]">Registre a entrega de itens do estoque próprio para uma comissão.</p>
      </header>
      <fieldset disabled={sending} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <PurchaseOption source="inventory" kind="locations" label="Local de saída" scope={scope} queryKey={queryKey}
            value={location} onChange={(value) => choose(setLocation, value)} error={errors.location} disabled={sending} />
          <PurchaseOption source="inventory" kind="variants" label="Produto ou SKU" scope={scope} queryKey={queryKey}
            value={variant} onChange={(value) => choose(setVariant, value)} error={errors.variant} disabled={sending} />
        </div>
        {location && variant && position.isFetching && <p role="status" className="text-sm">Consultando saldo disponível…</p>}
        {position.isError && <StoreFailure message="Não foi possível consultar esta posição." retry={() => void position.refetch()} />}
        {position.data && <p className="text-sm">Saldo disponível de <strong>{decimalLabel(position.data.available_quantity)}</strong>.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <StoreField id="ss-issue-quantity" label="Quantidade entregue" error={errors.quantity}>
            <input {...fieldError("ss-issue-quantity", errors.quantity)} name="quantity" inputMode="decimal" maxLength={19} />
          </StoreField>
          <PurchaseOption kind="commissions" label="Comissão de destino" scope={scope} queryKey={queryKey}
            value={destination} onChange={(value) => choose(setDestination, value)} error={errors.destination} disabled={sending} />
          <StoreField id="ss-issue-recipient" label="Nome de quem recebeu" error={errors.recipient}>
            <input {...fieldError("ss-issue-recipient", errors.recipient)} name="recipient" maxLength={160} />
          </StoreField>
          <StoreField id="ss-issue-reference" label="Referência da entrega (opcional)">
            <input id="ss-issue-reference" name="reference" maxLength={600} />
          </StoreField>
        </div>
        <StoreField id="ss-issue-reason" label="Motivo da saída" error={errors.reason}>
          <textarea {...fieldError("ss-issue-reason", errors.reason)} name="reason" maxLength={600} rows={2} />
        </StoreField>
      </fieldset>
      {command.isError && <StoreFailure message={stale ? "O saldo mudou. Atualize a posição e confira a quantidade entregue." : storeError(command.error)}
        retry={stale ? () => { command.reset(); void position.refetch(); } : command.isUncertain ? command.retry : undefined}
        retryLabel={stale ? "Atualizar saldo" : "Verificar envio"} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="ss-primary" disabled={sending || stale || position.isFetching || position.isError}>
          {command.isPending ? "Registrando…" : "Confirmar saída"}
        </Button>
        <Button type="button" variant="outline" disabled={sending} onClick={() => {
          if (!dirty || window.confirm("Descartar a saída ainda não registrada?")) onCancel();
        }}>Cancelar</Button>
      </div>
    </form>
  );
}
