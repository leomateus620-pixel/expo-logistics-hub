import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { storeError, storeRpc, type CommandResult, type StoreScope } from "../api/store";
import type { ProductVariant } from "../domain/catalog";
import { dateLabel, moneyLabel, readCents, todayInSaoPaulo } from "../domain/purchases";
import { useStoreCommand } from "../hooks/useStoreCommand";
import { StoreFailure, StoreField } from "./StoreElements";

type Price = { id: string; price_cents: number; effective_on: string };

export function VariantPricePanel({ scope, queryKey, variants, canManage }: {
  scope: StoreScope; queryKey: readonly unknown[]; variants: ProductVariant[]; canManage: boolean;
}) {
  const [selected, setSelected] = useState(variants[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(todayInSaoPaulo);
  const [notice, setNotice] = useState("");
  const client = useQueryClient();
  const priceKey = [...queryKey, "variant-prices", selected];
  const prices = useQuery({
    queryKey: priceKey, meta: { persist: false }, enabled: !!selected,
    queryFn: () => storeRpc<Price[]>("soja_store_sale_prices", { ...scope, _variant_id: selected }),
  });
  const command = useStoreCommand(scope, (request, payload: object) => storeRpc<CommandResult>("soja_store_save_sale_price", {
    ...scope, _request_id: request, _payload: payload,
  }), () => { setNotice("Preço registrado."); setAmount(""); void client.invalidateQueries({ queryKey }); });
  const busy = command.isPending || command.isUncertain;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const cents = readCents(amount);
    if (!cents) { setNotice("Informe um preço positivo com até duas casas decimais."); return; }
    setNotice("");
    command.mutate({ variant_id: selected, price_cents: cents, effective_on: day });
  }

  return (
    <section className="ss-surface grid gap-3" aria-labelledby="ss-variant-prices">
      <h2 id="ss-variant-prices">Preços de venda</h2>
      <StoreField id="ss-price-variant" label="SKU">
        <select id="ss-price-variant" value={selected} disabled={busy} onChange={(event) => { setSelected(event.target.value); setNotice(""); }}>
          {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.sku}{variant.label ? ` · ${variant.label}` : ""}</option>)}
        </select>
      </StoreField>
      {prices.isPending ? <p role="status">Consultando preços…</p> : prices.isError ? (
        <StoreFailure message={storeError(prices.error)} retry={() => void prices.refetch()} />
      ) : prices.data.length ? (
        <ul className="divide-y">{prices.data.map((price) => <li key={price.id} className="flex flex-wrap justify-between gap-3 py-2">
          <span>Vigência desde {dateLabel(price.effective_on)}</span><strong>{moneyLabel(price.price_cents)}</strong>
        </li>)}</ul>
      ) : <p>Nenhum preço cadastrado para este SKU.</p>}
      {canManage && variants.some((variant) => variant.id === selected && variant.active) && (
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={submit}>
          <StoreField id="ss-price-amount" label="Preço (R$)">
            <input id="ss-price-amount" value={amount} inputMode="decimal" required disabled={busy} onChange={(event) => setAmount(event.target.value)} />
          </StoreField>
          <StoreField id="ss-price-day" label="Início da vigência">
            <input id="ss-price-day" type="date" min={todayInSaoPaulo()} value={day} required disabled={busy} onChange={(event) => setDay(event.target.value)} />
          </StoreField>
          <Button type="submit" className="ss-primary" disabled={busy}>Registrar preço</Button>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
      {command.isError && <StoreFailure message={storeError(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
    </section>
  );
}
