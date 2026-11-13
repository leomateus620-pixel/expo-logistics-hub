import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, PackageCheck } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { storeError, storeRpc, type CommandResult, type StoreScope } from "../api/store";
import { fieldError, StoreFailure, StoreField, StoreHeading, StoreState } from "../components/StoreElements";
import {
  dateLabel, decimalLabel, moneyLabel, purchaseStates, readDecimal, scaledDecimal, todayInSaoPaulo, type Purchase,
} from "../domain/purchases";
import { useStoreCommand } from "../hooks/useStoreCommand";
import { useUnsavedStoreForm } from "../hooks/useUnsavedStoreForm";
import { purchasesPath } from "./PurchasesPage";

type PurchaseDetailProps = {
  id: string;
  scope: StoreScope;
  queryKey: readonly unknown[];
  canReceive: boolean;
  canViewStock: boolean;
};

export function PurchaseDetailPage({ id, scope, queryKey, canReceive, canViewStock }: PurchaseDetailProps) {
  const { search } = useLocation();
  const [receiptVersion, setReceiptVersion] = useState<number | null>(null);
  const validId = z.string().uuid().safeParse(id).success;
  const query = useQuery({
    queryKey: [...queryKey, "purchase", id],
    queryFn: () => storeRpc<Purchase>("soja_store_purchase", { ...scope, _purchase_id: id }),
    enabled: validId,
    meta: { persist: false },
  });

  return (
    <>
      <Button asChild variant="outline" className="w-fit">
        <Link data-button to={{ pathname: purchasesPath, search }}><ArrowLeft aria-hidden="true" /> Compras</Link>
      </Button>
      {!validId ? <StoreState title="Pedido não encontrado" /> :
        query.isPending ? <StoreState title="Carregando pedido" busy /> :
          query.isError ? <StoreFailure message={storeError(query.error)} retry={() => void query.refetch()} /> :
            <PurchaseRecord purchase={query.data} canViewStock={canViewStock}
              action={canReceive && receiptVersion === null && query.data.status !== "received" && (
                <Button type="button" className="ss-primary" onClick={() => setReceiptVersion(query.data.version)}>
                  <PackageCheck aria-hidden="true" /> Registrar recebimento
                </Button>
              )}>
              {canReceive && receiptVersion !== null && <ReceiptEditor
                key={receiptVersion}
                purchase={query.data}
                expectedVersion={receiptVersion}
                scope={scope}
                queryKey={queryKey}
                close={() => setReceiptVersion(null)}
                reload={() => setReceiptVersion(query.data.version)}
              />}
            </PurchaseRecord>}
    </>
  );
}

function PurchaseRecord({ purchase, action, children, canViewStock }: {
  purchase: Purchase;
  action?: React.ReactNode;
  children?: React.ReactNode;
  canViewStock: boolean;
}) {
  const lines = new Map(purchase.lines.map((line) => [line.id, line]));
  const summary = [
    ["Situação", purchaseStates[purchase.status]],
    ["Local de recebimento", purchase.location_name],
    ["Data do pedido", dateLabel(purchase.ordered_on)],
    ["Previsão de entrega", purchase.expected_on ? dateLabel(purchase.expected_on) : "Não informada"],
    ...(purchase.reference ? [["Referência", purchase.reference]] : []),
    ...(purchase.total_cents == null ? [] : [
      ["Frete", moneyLabel(purchase.freight_cents ?? 0)],
      ["Encargos", moneyLabel(purchase.charges_cents ?? 0)],
      ["Total do pedido", moneyLabel(purchase.total_cents)],
    ]),
  ];
  return (
    <>
      <StoreHeading title={purchase.supplier_name} icon={ClipboardList} eyebrow="Pedido de compra" action={action} />
      <section className="ss-surface space-y-3" aria-labelledby="ss-purchase-summary">
        <h2 id="ss-purchase-summary">Resumo do pedido</h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.map(([label, value]) => (
            <div key={label} className="min-w-0 break-words">
              <dt className="text-sm text-[var(--ss-muted)]">{label}</dt><dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {children}
      <section className="ss-surface space-y-3" aria-labelledby="ss-purchase-lines">
        <h2 id="ss-purchase-lines">Itens e quantidades</h2>
        <ul className="divide-y">
          {purchase.lines.map((line) => (
            <li key={line.id} className="grid gap-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 break-words">
                  <p className="font-semibold">{line.product_name}{line.variant_label ? ` · ${line.variant_label}` : ""}</p>
                  <p className="text-sm text-[var(--ss-muted)]">{line.sku}</p>
                </div>
                {canViewStock && scaledDecimal(line.received_quantity) > 0n && (
                  <Button variant="outline" asChild>
                    <Link data-button to={{
                      pathname: "/comissoes/soja-store/estoque",
                      search: new URLSearchParams({ local: purchase.location_id, variante: line.variant_id, visao: "movimentos" }).toString(),
                    }}>Ver movimentos</Link>
                  </Button>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {[
                  ["Encomendado", `${decimalLabel(line.quantity)} ${line.unit}`],
                  ["Recebido", `${decimalLabel(line.received_quantity)} ${line.unit}`],
                  ["Pendente", `${decimalLabel(line.pending_quantity)} ${line.unit}`],
                  ...(line.unit_cost == null || line.line_total_cents == null ? [] : [
                    ["Custo unitário", `R$ ${decimalLabel(line.unit_cost)}`], ["Total da linha", moneyLabel(line.line_total_cents)],
                  ]),
                ].map(([label, value]) => (
                  <div className="min-w-0 break-words" key={label}><dt className="text-sm text-[var(--ss-muted)]">{label}</dt><dd>{value}</dd></div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </section>
      <section className="ss-surface space-y-3" aria-labelledby="ss-purchase-receipts">
        <h2 id="ss-purchase-receipts">Recebimentos</h2>
        {!purchase.receipts.length ? <p className="text-[var(--ss-muted)]">Nenhum recebimento registrado.</p> : (
          <ol className="divide-y">
            {purchase.receipts.map((receipt) => (
              <li key={receipt.id} className="grid gap-2 py-3">
                <p className="break-words font-semibold">{dateLabel(receipt.received_on)}{receipt.reference ? ` · ${receipt.reference}` : ""}</p>
                <ul className="space-y-1 text-sm">
                  {receipt.lines.map((item) => (
                    <li key={item.purchase_line_id} className="break-words">
                      {lines.get(item.purchase_line_id)?.sku} · {decimalLabel(item.quantity)} {lines.get(item.purchase_line_id)?.unit}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function ReceiptEditor({ purchase, expectedVersion, scope, queryKey, close, reload }: {
  purchase: Purchase;
  expectedVersion: number;
  scope: StoreScope;
  queryKey: readonly unknown[];
  close: () => void;
  reload: () => void;
}) {
  const client = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [initialLines] = useState(purchase.lines.filter((line) => scaledDecimal(line.pending_quantity) > 0n));
  const command = useStoreCommand(scope, (requestId, payload: object) =>
    storeRpc<CommandResult>("soja_store_receive_purchase", {
      ...scope, _request_id: requestId, _expected_version: expectedVersion, _payload: payload,
    }),
  () => {
    toast.success("Recebimento registrado.");
    void client.invalidateQueries({ queryKey });
    close();
  });
  useUnsavedStoreForm(dirty || command.isPending || command.isUncertain);
  const blocked = command.isPending || command.isUncertain;
  const stale = purchase.version !== expectedVersion;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || stale) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const invalid: Record<string, string> = {};
    const quantities = initialLines.flatMap((line) => {
      const input = String(data.get(line.id) ?? "").trim();
      if (!input) return [];
      const quantity = readDecimal(input);
      if (!quantity || scaledDecimal(quantity) <= 0n || scaledDecimal(quantity) > scaledDecimal(line.pending_quantity)) {
        invalid[line.id] = "Informe uma quantidade positiva dentro do saldo pendente.";
        return [];
      }
      return [{ purchase_line_id: line.id, quantity }];
    });
    if (!quantities.length && !Object.keys(invalid).length) invalid.lines = "Informe a quantidade conferida para pelo menos um item.";
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      requestAnimationFrame(() => (form.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form.querySelector('input[inputmode="decimal"]'))?.focus());
      return;
    }
    command.mutate({
      purchase_id: purchase.id,
      received_on: data.get("received_on"),
      reference: String(data.get("reference") ?? "").trim() || null,
      lines: quantities,
    }, { onError: (error) => {
      if (/STALE_VERSION|ALREADY_RECEIVED|EXCEEDS_PENDING/i.test(String((error as { message?: string })?.message))) {
        void client.invalidateQueries({ queryKey: [...queryKey, "purchase", purchase.id] });
      }
    } });
  }

  return (
    <form className="ss-surface grid gap-4" onSubmit={submit} onChange={() => setDirty(true)} aria-labelledby="ss-receipt">
      <div>
        <h2 id="ss-receipt">Conferir recebimento</h2>
        <p className="text-sm text-[var(--ss-muted)]">Informe somente as quantidades que chegaram em {purchase.location_name}.</p>
      </div>
      <fieldset className="grid gap-3" disabled={blocked}>
        <div className="grid gap-3 sm:grid-cols-2">
          <StoreField id="ss-received-date" label="Data do recebimento">
            <input id="ss-received-date" name="received_on" type="date" defaultValue={todayInSaoPaulo()} min={purchase.ordered_on} max={todayInSaoPaulo()} required />
          </StoreField>
          <StoreField id="ss-received-ref" label="Referência da conferência ou documento">
            <input id="ss-received-ref" name="reference" maxLength={600} />
          </StoreField>
        </div>
        {initialLines.map((line) => (
          <StoreField key={line.id} id={`receipt-${line.id}`} label={`${line.product_name} · ${line.sku}`} error={errors[line.id]}>
            <input
              {...fieldError(`receipt-${line.id}`, errors[line.id])}
              aria-describedby={`pending-${line.id}${errors[line.id] ? ` receipt-${line.id}-error` : ""}`}
              name={line.id}
              inputMode="decimal"
              maxLength={19}
            />
            <p id={`pending-${line.id}`} className="text-sm text-[var(--ss-muted)]">Pendente {decimalLabel(line.pending_quantity)} {line.unit}</p>
          </StoreField>
        ))}
      </fieldset>
      {errors.lines && <StoreFailure message={errors.lines} />}
      {command.isError && <StoreFailure message={storeError(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
      {stale && !command.isUncertain && <StoreFailure message="O pedido mudou durante a conferência." retryLabel="Carregar quantidades atuais" retry={() => {
        if (dirty && !window.confirm("Carregar as quantidades atuais e descartar a conferência aberta?")) return;
        if (purchase.status === "received") close();
        else reload();
      }} />}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="ss-primary" disabled={blocked || stale}>{command.isPending ? "Registrando…" : "Confirmar recebimento"}</Button>
        <Button type="button" variant="outline" disabled={command.isPending} onClick={() => {
          if ((!dirty && !command.isUncertain) || window.confirm("Fechar a conferência sem salvar as alterações?")) close();
        }}>Fechar conferência</Button>
      </div>
    </form>
  );
}
