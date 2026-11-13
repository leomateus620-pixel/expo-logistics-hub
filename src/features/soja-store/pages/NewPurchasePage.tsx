import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { storeError, storeRpc, type CommandResult, type StoreScope } from "../api/store";
import { PurchaseOption } from "../components/PurchaseOption";
import { fieldError, StoreFailure, StoreField } from "../components/StoreElements";
import { StoreFormDialog, type StoreFormDialogHandle } from "../components/StoreFormDialog";
import { moneyLabel, readCents, readDecimal, scaledDecimal, todayInSaoPaulo, type NamedOption } from "../domain/purchases";
import { useStoreCommand } from "../hooks/useStoreCommand";

type DraftLine = { key: string; variant: NamedOption | null; quantity: string; cost: string };
const newLine = (): DraftLine => ({ key: crypto.randomUUID(), variant: null, quantity: "", cost: "" });
const maxOrderCents = 999999999999999n;
const centsPerProduct = 10000000000n;

function lineTotalCents(line: DraftLine) {
  const quantity = readDecimal(line.quantity);
  const cost = readDecimal(line.cost);
  if (quantity === null || cost === null || scaledDecimal(quantity) === 0n) return null;
  const product = scaledDecimal(quantity) * scaledDecimal(cost);
  // The purchase RPC rounds each line to cents before summing.
  return (product + centsPerProduct / 2n) / centsPerProduct;
}

function amountLabel(value: bigint | null) {
  return value === null || value > maxOrderCents ? "—" : moneyLabel(Number(value));
}

export function NewPurchaseDialog({ scope, queryKey, onClose, onSaved }: {
  scope: StoreScope;
  queryKey: readonly unknown[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const client = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()]);
  const [supplier, setSupplier] = useState<NamedOption | null>(null);
  const [location, setLocation] = useState<NamedOption | null>(null);
  const [freightInput, setFreightInput] = useState("");
  const [chargesInput, setChargesInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formId = useId();
  const dialog = useRef<StoreFormDialogHandle>(null);
  const serverFailure = useRef<HTMLDivElement>(null);
  const command = useStoreCommand(scope, (requestId, payload: object) =>
    storeRpc<CommandResult>("soja_store_create_purchase", { ...scope, _request_id: requestId, _payload: payload }),
  (result) => {
    const complete = () => onSaved(result.id);
    if (dialog.current) dialog.current.finish(complete);
    else complete();
    void client.invalidateQueries({ queryKey: [...queryKey, "purchases"] });
    void client.invalidateQueries({ queryKey: [...queryKey, "dashboard"] });
    void client.invalidateQueries({ queryKey: [...queryKey, "finance", "summary"] });
    void client.invalidateQueries({ queryKey: [...queryKey, "finance", "purchase-options"] });
    void client.invalidateQueries({ queryKey: [...queryKey, "purchase-needs", "orders"] });
  });
  useEffect(() => {
    if (command.isError && !command.isPending) serverFailure.current?.focus();
  }, [command.isError, command.isPending]);
  const blocked = command.isPending || command.isUncertain;
  const today = todayInSaoPaulo();
  const lineTotals = lines.map(lineTotalCents);
  const itemsTotal = lineTotals.reduce<bigint>((sum, cents) => sum + (cents ?? 0n), 0n);
  const freight = readCents(freightInput);
  const charges = readCents(chargesInput);
  const total = freight === null || charges === null ? null : itemsTotal + BigInt(freight) + BigInt(charges);
  const hasPreview = lineTotals.some((cents) => cents !== null);
  const complete = lineTotals.every((cents) => cents !== null);

  function updateLine(key: string, values: Partial<Omit<DraftLine, "key">>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...values } : line));
    setDirty(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const read = (name: string) => String(values.get(name) ?? "").trim();
    const invalid: Record<string, string> = {};
    const seen = new Set<string>();
    if (!supplier) invalid.supplier = "Selecione um fornecedor ativo.";
    if (!location) invalid.location = "Selecione um local de recebimento ativo.";
    if (!read("ordered_on")) invalid.ordered_on = "Informe a data do pedido.";
    else if (read("ordered_on") > today) invalid.ordered_on = "A data do pedido não pode estar no futuro.";
    if (read("expected_on") && read("expected_on") < read("ordered_on")) {
      invalid.expected_on = "A previsão precisa ser na data do pedido ou depois.";
    }
    const payloadLines = lines.map(({ key, variant, quantity: quantityInput, cost }) => {
      const quantity = readDecimal(quantityInput);
      const unitCost = readDecimal(cost);
      if (!variant) invalid[`variant-${key}`] = "Selecione uma variante ativa.";
      else if (seen.has(variant.id)) invalid[`variant-${key}`] = "O SKU já está em outra linha do pedido.";
      if (variant) seen.add(variant.id);
      if (quantity === null || scaledDecimal(quantity) === 0n) invalid[`quantity-${key}`] = "Informe uma quantidade maior que zero, com até seis casas decimais.";
      if (unitCost === null) invalid[`cost-${key}`] = "Informe o custo unitário acordado, com até seis casas decimais.";
      return { variant_id: variant?.id, quantity, unit_cost: unitCost };
    });
    if (freight === null) invalid.freight = "Informe um valor com até duas casas decimais.";
    if (charges === null) invalid.charges = "Informe um valor com até duas casas decimais.";
    if (total !== null && total > maxOrderCents) invalid.total = "O total excede o limite do pedido. Confira quantidades, custos e encargos.";
    setErrors(invalid);
    if (Object.keys(invalid).length || !supplier || !location) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"], [data-total-error]')?.focus());
      return;
    }
    command.mutate({
      supplier_id: supplier.id,
      location_id: location.id,
      ordered_on: read("ordered_on"),
      expected_on: read("expected_on") || null,
      reference: read("reference") || null,
      freight_cents: freight,
      charges_cents: charges,
      lines: payloadLines,
    });
  }

  return (
    <StoreFormDialog handle={dialog} title="Novo pedido" description="O estoque é atualizado ao registrar o recebimento." size="wide"
      initialFocus="title" onClose={onClose} dirty={dirty || command.isUncertain} busy={command.isPending}
      formId={formId} submitLabel="Registrar pedido" submitDisabled={blocked}
      footerDetails={<div className="min-w-0 text-sm">
        <span className="block text-[var(--ss-muted)]">{hasPreview && !complete ? "Total parcial" : "Total do pedido"}</span>
        <output className="break-words font-semibold">{amountLabel(hasPreview ? total : null)}</output>
      </div>}>
      <form id={formId} onSubmit={submit} onChange={() => setDirty(true)} className="grid min-w-0 gap-4" noValidate>
        <fieldset className="grid min-w-0 gap-3" disabled={blocked}>
          <legend>Fornecedor e destino</legend>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <PurchaseOption kind="suppliers" label="Fornecedor" value={supplier} onChange={(value) => { setSupplier(value); setDirty(true); }}
              scope={scope} queryKey={queryKey} error={errors.supplier} disabled={blocked} inDialog />
            <PurchaseOption kind="locations" label="Local de recebimento" value={location} onChange={(value) => { setLocation(value); setDirty(true); }}
              scope={scope} queryKey={queryKey} error={errors.location} disabled={blocked} inDialog />
            <StoreField id="ss-order-date" label="Data do pedido" error={errors.ordered_on}>
              <input {...fieldError("ss-order-date", errors.ordered_on)} name="ordered_on" type="date" defaultValue={today} max={today} required />
            </StoreField>
            <StoreField id="ss-order-expected" label="Previsão de entrega" error={errors.expected_on}>
              <input {...fieldError("ss-order-expected", errors.expected_on)} name="expected_on" type="date" />
            </StoreField>
          </div>
          <StoreField id="ss-order-reference" label="Referência do pedido ou documento">
            <input id="ss-order-reference" name="reference" maxLength={600} />
          </StoreField>
        </fieldset>
        <fieldset className="grid min-w-0 gap-3" disabled={blocked}>
          <legend>Itens do pedido</legend>
          {lines.map(({ key, variant, quantity, cost }, index) => (
            <fieldset key={key} className="ss-variant grid gap-2">
              <legend>Item {index + 1}</legend>
              <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
                <PurchaseOption kind="variants" label="Produto ou SKU" value={variant}
                  onChange={(value) => updateLine(key, { variant: value })}
                  scope={scope} queryKey={queryKey} error={errors[`variant-${key}`]} disabled={blocked} inDialog />
                <StoreField id={`quantity-${key}`} label="Quantidade" error={errors[`quantity-${key}`]}>
                  <input {...fieldError(`quantity-${key}`, errors[`quantity-${key}`])} inputMode="decimal" maxLength={19}
                    value={quantity} onChange={(event) => updateLine(key, { quantity: event.target.value })} required />
                </StoreField>
                <StoreField id={`cost-${key}`} label="Custo unitário (R$)" error={errors[`cost-${key}`]}>
                  <input {...fieldError(`cost-${key}`, errors[`cost-${key}`])} inputMode="decimal" maxLength={19}
                    value={cost} onChange={(event) => updateLine(key, { cost: event.target.value })} required />
                </StoreField>
                <dl className="min-w-0">
                  <dt className="text-sm font-semibold">Subtotal</dt>
                  <dd className="break-words py-1 md:py-2.5">{amountLabel(lineTotals[index])}</dd>
                </dl>
              </div>
              {lines.length > 1 && <Button className="w-fit" variant="ghost" type="button" onClick={() => {
                setLines((current) => current.filter((line) => line.key !== key));
                setDirty(true);
              }}><X aria-hidden="true" /> Remover item {index + 1}</Button>}
            </fieldset>
          ))}
          <Button type="button" variant="outline" className="w-fit" onClick={() => {
            setLines((current) => [...current, newLine()]);
            setDirty(true);
          }} disabled={lines.length >= 100}>
            <Plus aria-hidden="true" /> Adicionar item
          </Button>
        </fieldset>
        <fieldset className="grid min-w-0 gap-3" disabled={blocked}>
          <legend>Resumo</legend>
          <div className="grid min-w-0 gap-3 sm:grid-cols-3">
            <dl className="min-w-0">
              <dt className="text-sm font-semibold">Subtotal dos itens</dt>
              <dd className="break-words py-1 sm:py-2.5">{amountLabel(hasPreview ? itemsTotal : null)}</dd>
            </dl>
            <StoreField id="ss-freight" label="Frete (R$)" error={errors.freight}>
              <input {...fieldError("ss-freight", errors.freight)} inputMode="decimal" maxLength={15}
                value={freightInput} onChange={(event) => setFreightInput(event.target.value)} />
            </StoreField>
            <StoreField id="ss-charges" label="Outros encargos (R$)" error={errors.charges}>
              <input {...fieldError("ss-charges", errors.charges)} inputMode="decimal" maxLength={15}
                value={chargesInput} onChange={(event) => setChargesInput(event.target.value)} />
            </StoreField>
          </div>
          {errors.total && <p data-total-error tabIndex={-1} className="ss-field-error">{errors.total}</p>}
        </fieldset>
        {command.isError && <div ref={serverFailure} tabIndex={-1}>
          <StoreFailure message={storeError(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />
        </div>}
      </form>
    </StoreFormDialog>
  );
}
