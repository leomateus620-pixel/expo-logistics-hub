import { useId, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { storeError, storeRpc, type CommandResult, type StoreScope } from "../api/store";
import { PurchaseOption } from "../components/PurchaseOption";
import { fieldError, StoreFailure, StoreField, StoreHeading } from "../components/StoreElements";
import { readCents, readDecimal, scaledDecimal, todayInSaoPaulo, type NamedOption } from "../domain/purchases";
import { useStoreCommand } from "../hooks/useStoreCommand";
import { useUnsavedStoreForm } from "../hooks/useUnsavedStoreForm";
import { purchasesPath } from "./PurchasesPage";

type DraftLine = { key: string; variant: NamedOption | null };
const newLine = (): DraftLine => ({ key: crypto.randomUUID(), variant: null });

export function NewPurchasePage({ scope, queryKey }: {
  scope: StoreScope;
  queryKey: readonly unknown[];
}) {
  const { search } = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()]);
  const [supplier, setSupplier] = useState<NamedOption | null>(null);
  const [location, setLocation] = useState<NamedOption | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formId = useId();
  const command = useStoreCommand(scope, (requestId, payload: object) =>
    storeRpc<CommandResult>("soja_store_create_purchase", { ...scope, _request_id: requestId, _payload: payload }),
  (result) => {
    toast.success("Pedido de compra registrado.");
    void client.invalidateQueries({ queryKey });
    navigate({ pathname: `${purchasesPath}/${result.id}`, search }, { replace: true });
  });
  useUnsavedStoreForm(dirty || command.isPending || command.isUncertain);
  const blocked = command.isPending || command.isUncertain;
  const today = todayInSaoPaulo();

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
    const freight = readCents(read("freight"));
    const charges = readCents(read("charges"));
    if (freight === null) invalid.freight = "Informe um valor com até duas casas decimais.";
    if (charges === null) invalid.charges = "Informe um valor com até duas casas decimais.";
    if (read("expected_on") && read("expected_on") < read("ordered_on")) {
      invalid.expected_on = "A previsão precisa ser na data do pedido ou depois.";
    }
    const payloadLines = lines.map(({ key, variant }) => {
      const quantity = readDecimal(read(`quantity-${key}`));
      const unitCost = readDecimal(read(`cost-${key}`));
      if (!variant) invalid[`variant-${key}`] = "Selecione uma variante ativa.";
      else if (seen.has(variant.id)) invalid[`variant-${key}`] = "O SKU já está em outra linha do pedido.";
      if (variant) seen.add(variant.id);
      if (quantity === null || scaledDecimal(quantity) === 0n) invalid[`quantity-${key}`] = "Informe uma quantidade maior que zero, com até seis casas decimais.";
      if (unitCost === null) invalid[`cost-${key}`] = "Informe o custo unitário acordado, com até seis casas decimais.";
      return { variant_id: variant?.id, quantity, unit_cost: unitCost };
    });
    setErrors(invalid);
    if (Object.keys(invalid).length || !supplier || !location) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
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
    <>
      <StoreHeading title="Novo pedido de compra" description="Registre o pedido com o fornecedor. O estoque é atualizado na conferência dos recebimentos." />
      <form id={formId} onSubmit={submit} onChange={() => setDirty(true)} className="grid gap-4">
        <fieldset className="ss-surface grid gap-4" disabled={blocked}>
          <h2>Pedido e destino</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <PurchaseOption kind="suppliers" label="Fornecedor" value={supplier} onChange={(value) => { setSupplier(value); setDirty(true); }}
              scope={scope} queryKey={queryKey} error={errors.supplier} disabled={blocked} />
            <PurchaseOption kind="locations" label="Local de recebimento" value={location} onChange={(value) => { setLocation(value); setDirty(true); }}
              scope={scope} queryKey={queryKey} error={errors.location} disabled={blocked} />
            <StoreField id="ss-order-date" label="Data do pedido">
              <input id="ss-order-date" name="ordered_on" type="date" defaultValue={today} max={today} required />
            </StoreField>
            <StoreField id="ss-order-expected" label="Previsão de entrega" error={errors.expected_on}>
              <input {...fieldError("ss-order-expected", errors.expected_on)} name="expected_on" type="date" />
            </StoreField>
          </div>
          <StoreField id="ss-order-reference" label="Referência do pedido ou documento">
            <input id="ss-order-reference" name="reference" maxLength={600} />
          </StoreField>
        </fieldset>
        <fieldset className="ss-surface grid gap-4" disabled={blocked}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>Itens do pedido</h2>
            <Button type="button" variant="outline" onClick={() => { setLines([...lines, newLine()]); setDirty(true); }} disabled={lines.length >= 100}>
              <Plus aria-hidden="true" /> Adicionar item
            </Button>
          </div>
          {lines.map(({ key, variant }, index) => (
            <fieldset key={key} className="ss-variant grid gap-3">
              <legend>Item {index + 1}</legend>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <PurchaseOption kind="variants" label="Produto ou SKU" value={variant}
                  onChange={(value) => { setLines((current) => current.map((line) => line.key === key ? { ...line, variant: value } : line)); setDirty(true); }}
                  scope={scope} queryKey={queryKey} error={errors[`variant-${key}`]} disabled={blocked} />
                <StoreField id={`quantity-${key}`} label="Quantidade" error={errors[`quantity-${key}`]}>
                  <input {...fieldError(`quantity-${key}`, errors[`quantity-${key}`])} name={`quantity-${key}`} inputMode="decimal" maxLength={19} required />
                </StoreField>
                <StoreField id={`cost-${key}`} label="Custo unitário (R$)" error={errors[`cost-${key}`]}>
                  <input {...fieldError(`cost-${key}`, errors[`cost-${key}`])} name={`cost-${key}`} inputMode="decimal" maxLength={19} required />
                </StoreField>
              </div>
              {lines.length > 1 && <Button className="w-fit" variant="ghost" type="button" onClick={() => {
                setLines((current) => current.filter((line) => line.key !== key));
                setDirty(true);
              }}><X aria-hidden="true" /> Remover item {index + 1}</Button>}
            </fieldset>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <StoreField id="ss-freight" label="Frete (R$)" error={errors.freight}>
              <input {...fieldError("ss-freight", errors.freight)} name="freight" inputMode="decimal" maxLength={15} />
            </StoreField>
            <StoreField id="ss-charges" label="Outros encargos (R$)" error={errors.charges}>
              <input {...fieldError("ss-charges", errors.charges)} name="charges" inputMode="decimal" maxLength={15} />
            </StoreField>
          </div>
        </fieldset>
        {command.isError && <StoreFailure message={storeError(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
        <Button type="submit" className="ss-primary w-fit" disabled={blocked}>{command.isPending ? "Registrando…" : "Registrar pedido"}</Button>
      </form>
    </>
  );
}
