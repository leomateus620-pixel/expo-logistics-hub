import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { storeError, storeRpc, type CommandResult, type StoreScope } from "../api/store";
import { decimalLabel, readDecimal, scaledDecimal, type NamedOption } from "../domain/purchases";
import { useStoreCommand } from "../hooks/useStoreCommand";
import { useUnsavedStoreForm } from "../hooks/useUnsavedStoreForm";
import { PurchaseOption } from "./PurchaseOption";
import { fieldError, StoreFailure, StoreField, StoreState } from "./StoreElements";

const statuses = {
  requested: "Solicitada",
  in_transit: "Em trânsito",
  partially_received: "Recebida em parte",
  received: "Recebida",
  cancelled: "Cancelada",
} as const;
type TransferStatus = keyof typeof statuses;
type Transfer = {
  id: string;
  status: TransferStatus;
  version: number;
  origin_name: string;
  destination_name: string;
  product_name: string;
  variant_label: string | null;
  sku: string;
  unit: string;
  reason: string;
  quantity: string;
  received_quantity: string;
  in_transit_quantity: string;
};
type TransferDetail = Transfer & {
  events: {
    id: string;
    movement_type: "transfer_dispatch" | "transfer_receipt";
    quantity: string;
    reference: string | null;
    recorded_at: string;
  }[];
};
type CommandName = "dispatch" | "receive" | "cancel";
type CommandInput = {
  action: CommandName;
  version: number;
  quantity: string | null;
  reference: string | null;
};
type CreateInput = {
  origin_id: string;
  destination_id: string;
  variant_id: string;
  reason: string;
  quantity: string;
};
const times = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const pageSize = 20;

function RequestTransfer({ scope, queryKey, onCancel, onCreated }: {
  scope: StoreScope;
  queryKey: readonly unknown[];
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const client = useQueryClient();
  const [origin, setOrigin] = useState<NamedOption | null>(null);
  const [destination, setDestination] = useState<NamedOption | null>(null);
  const [variant, setVariant] = useState<NamedOption | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const command = useStoreCommand(scope, (requestId, payload: CreateInput) =>
    storeRpc<CommandResult>("soja_store_create_transfer", { ...scope, _request_id: requestId, _payload: payload }),
  ({ id }) => {
    void client.invalidateQueries({ queryKey });
    onCreated(id);
  });
  const sending = command.isPending || command.isUncertain;
  useUnsavedStoreForm(dirty || sending);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const quantity = readDecimal(String(data.get("quantity") ?? ""));
    const reason = String(data.get("reason") ?? "").trim();
    const invalid: Record<string, string> = {};
    if (!origin) invalid.origin = "Selecione a origem.";
    if (!destination || destination.id === origin?.id) invalid.destination = "Selecione um local de destino diferente da origem.";
    if (!variant) invalid.variant = "Selecione um produto.";
    if (quantity === null || scaledDecimal(quantity) <= 0n) invalid.quantity = "Informe uma quantidade maior que zero.";
    if (reason.length < 3) invalid.reason = "Descreva o motivo da transferência.";
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (origin && destination && variant && quantity !== null) {
      command.mutate({ origin_id: origin.id, destination_id: destination.id, variant_id: variant.id, reason, quantity });
    }
  }

  return (
    <form className="ss-surface grid gap-4" onSubmit={submit} onChange={() => setDirty(true)} aria-labelledby="ss-transfer-request-title">
      <header><h2 id="ss-transfer-request-title">Solicitar transferência</h2>
        <p className="text-sm text-[var(--ss-muted)]">A saída física será registrada quando você confirmar a expedição.</p>
      </header>
      <fieldset className="grid gap-3" disabled={sending}>
        <div className="grid gap-3 sm:grid-cols-2">
          <PurchaseOption source="inventory" kind="locations" label="Local de origem" value={origin} error={errors.origin}
            onChange={(value) => { setOrigin(value); setDirty(true); }} scope={scope} queryKey={queryKey} />
          <PurchaseOption source="inventory" kind="locations" label="Local de destino" value={destination} error={errors.destination}
            onChange={(value) => { setDestination(value); setDirty(true); }} scope={scope} queryKey={queryKey} />
          <PurchaseOption source="inventory" kind="variants" label="Produto ou SKU" value={variant} error={errors.variant}
            onChange={(value) => { setVariant(value); setDirty(true); }} scope={scope} queryKey={queryKey} />
          <StoreField id="ss-transfer-quantity" label="Quantidade" error={errors.quantity}>
            <input {...fieldError("ss-transfer-quantity", errors.quantity)} name="quantity" inputMode="decimal" maxLength={19} />
          </StoreField>
        </div>
        <StoreField id="ss-transfer-reason" label="Motivo" error={errors.reason}>
          <textarea {...fieldError("ss-transfer-reason", errors.reason)} name="reason" rows={2} maxLength={600} />
        </StoreField>
      </fieldset>
      {command.isError && <StoreFailure message={storeError(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="ss-primary" disabled={sending}>{command.isPending ? "Solicitando…" : "Solicitar transferência"}</Button>
        <Button type="button" variant="outline" disabled={sending} onClick={() => {
          if (!dirty || window.confirm("Descartar esta solicitação?")) onCancel();
        }}>Voltar</Button>
      </div>
    </form>
  );
}

function TransferDetails({ id, scope, queryKey, canManage, onBack }: {
  id: string;
  scope: StoreScope;
  queryKey: readonly unknown[];
  canManage: boolean;
  onBack: () => void;
}) {
  const client = useQueryClient();
  const [action, setAction] = useState<CommandName | null>(null);
  const [actionVersion, setActionVersion] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const details = useQuery({
    queryKey: [...queryKey, "transfer", id],
    queryFn: () => storeRpc<TransferDetail>("soja_store_transfer", { ...scope, _transfer_id: id }),
    meta: { persist: false },
  });
  const command = useStoreCommand(scope, (requestId, input: CommandInput) => {
    const payload: { transfer_id: string; quantity?: string | null; reference?: string | null } = { transfer_id: id };
    if (input.action === "receive") payload.quantity = input.quantity;
    if (input.action !== "cancel") payload.reference = input.reference;
    return storeRpc<CommandResult>(`soja_store_${input.action}_transfer`, {
      ...scope, _request_id: requestId, _expected_version: input.version, _payload: payload,
    });
  }, (result) => {
    setNotice(`Transferência atualizada. ${statuses[result.status as TransferStatus]}.`);
    setAction(null);
    setActionVersion(null);
    setDirty(false);
    void client.invalidateQueries({ queryKey });
  });
  const sending = command.isPending || command.isUncertain;
  useUnsavedStoreForm(dirty || sending);

  if (details.isPending) return <StoreState title="Carregando transferência" busy />;
  if (details.isError) return <StoreFailure message={storeError(details.error)} retry={() => void details.refetch()} />;
  const transfer = details.data;
  const canReceive = transfer.status === "in_transit" || transfer.status === "partially_received";
  const versionChanged = actionVersion !== null && actionVersion !== transfer.version;
  const stale = (command.error as { message?: string } | null)?.message === "SOJA_STORE_STALE_VERSION";

  function start(next: CommandName | null) {
    setAction(next);
    setActionVersion(next ? transfer.version : null);
    setError("");
    setDirty(false);
    setNotice("");
    command.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || actionVersion === null || versionChanged || stale || sending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const quantity = action === "receive" ? readDecimal(String(data.get("quantity") ?? "")) : null;
    const reference = String(data.get("reference") ?? "").trim();
    if (action === "receive" && (quantity === null || scaledDecimal(quantity) <= 0n
      || scaledDecimal(quantity) > scaledDecimal(transfer.in_transit_quantity))) {
      setError("Informe uma quantidade maior que zero e dentro do saldo em trânsito.");
      form.querySelector("input")?.focus();
      return;
    }
    setError("");
    command.mutate({ action, version: actionVersion, quantity, reference: reference || null });
  }

  return (
    <section className="ss-surface grid gap-4" aria-labelledby="ss-transfer-detail-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 id="ss-transfer-detail-title">{transfer.product_name}{transfer.variant_label ? ` · ${transfer.variant_label}` : ""}</h2>
          <p className="text-sm text-[var(--ss-muted)]">{transfer.sku} · {transfer.origin_name} → {transfer.destination_name}</p></div>
        <Button type="button" variant="outline" disabled={sending} onClick={() => {
          if (!dirty || window.confirm("Descartar a conferência ainda não registrada?")) onBack();
        }}><ArrowLeft aria-hidden="true" /> Transferências</Button>
      </div>
      <p className="text-sm">{transfer.reason}</p>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-[var(--ss-muted)]">Situação</dt><dd className="font-semibold">{statuses[transfer.status]}</dd></div>
        <div><dt className="text-[var(--ss-muted)]">Solicitado</dt><dd className="font-semibold">{decimalLabel(transfer.quantity)} {transfer.unit}</dd></div>
        <div><dt className="text-[var(--ss-muted)]">Em trânsito</dt><dd className="font-semibold">{decimalLabel(transfer.in_transit_quantity)} {transfer.unit}</dd></div>
        <div><dt className="text-[var(--ss-muted)]">Recebido</dt><dd className="font-semibold">{decimalLabel(transfer.received_quantity)} {transfer.unit}</dd></div>
      </dl>
      {notice && <p role="status" className="text-sm font-semibold">{notice}</p>}
      {canManage && !action && (
        <div className="flex flex-wrap gap-2">
          {transfer.status === "requested" && <>
            <Button type="button" className="ss-primary" onClick={() => start("dispatch")}>Registrar expedição</Button>
            <Button type="button" variant="outline" onClick={() => start("cancel")}>Cancelar solicitação</Button>
          </>}
          {canReceive && <Button type="button" className="ss-primary" onClick={() => start("receive")}>Registrar recebimento</Button>}
        </div>
      )}
      {action && (
        <form onSubmit={submit} onChange={() => setDirty(true)} className="grid gap-3 border-t pt-4">
          {action === "dispatch" && <p>Confirme a saída de {decimalLabel(transfer.quantity)} {transfer.unit} de {transfer.origin_name}.</p>}
          {action === "cancel" && <p>Confirme o cancelamento desta solicitação.</p>}
          {action === "receive" && <StoreField id="ss-transfer-received" label="Quantidade conferida" error={error}>
            <input {...fieldError("ss-transfer-received", error)} name="quantity" inputMode="decimal" maxLength={19} disabled={sending} />
          </StoreField>}
          {action !== "cancel" && <StoreField id="ss-transfer-reference" label="Referência (opcional)">
            <input id="ss-transfer-reference" name="reference" maxLength={600} disabled={sending} />
          </StoreField>}
          {versionChanged && <p role="status">A transferência foi atualizada. Volte e abra a conferência novamente.</p>}
          {command.isError && <StoreFailure message={storeError(command.error)} retry={command.isUncertain ? command.retry : stale ? () => {
            start(null);
            void details.refetch();
          } : undefined} retryLabel={stale ? "Atualizar transferência" : "Verificar envio"} />}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="ss-primary" disabled={sending || stale || versionChanged || details.isFetching}>
              {command.isPending ? "Registrando…" : action === "dispatch" ? "Confirmar expedição" : action === "receive" ? "Confirmar recebimento" : "Confirmar cancelamento"}
            </Button>
            <Button type="button" variant="outline" disabled={sending} onClick={() => {
              if (!dirty || window.confirm("Descartar a conferência ainda não registrada?")) start(null);
            }}>Voltar</Button>
          </div>
        </form>
      )}
      {transfer.events.length > 0 && <div className="border-t pt-3">
        <h3 className="font-semibold">Conferências e expedição</h3>
        <ul className="divide-y">
          {transfer.events.map((entry) => <li key={entry.id} className="grid gap-1 py-2 text-sm">
            <span>{entry.movement_type === "transfer_dispatch" ? "Expedição" : "Recebimento"} · {decimalLabel(entry.quantity)} {transfer.unit}</span>
            <time className="text-[var(--ss-muted)]" dateTime={entry.recorded_at}>{times.format(new Date(entry.recorded_at))}</time>
            {entry.reference && <span>{entry.reference}</span>}
          </li>)}
        </ul>
      </div>}
    </section>
  );
}

export function StockTransfers({ scope, queryKey, canManage, selectedId, onSelect }: {
  scope: StoreScope;
  queryKey: readonly unknown[];
  canManage: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [create, setCreate] = useState(false);
  const [filter, setFilter] = useState<TransferStatus | "">("");
  const [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: [...queryKey, "transfers", filter, page],
    queryFn: () => storeRpc<{ total: number; items: Transfer[] }>("soja_store_transfers", {
      ...scope, _status: filter || null, _limit: pageSize, _offset: (page - 1) * pageSize,
    }),
    enabled: !create && !selectedId,
    meta: { persist: false },
  });

  if (selectedId) return <TransferDetails key={selectedId} id={selectedId} scope={scope} queryKey={queryKey} canManage={canManage} onBack={() => onSelect("")} />;
  if (create) return <RequestTransfer scope={scope} queryKey={queryKey} onCancel={() => setCreate(false)} onCreated={(id) => { setCreate(false); onSelect(id); }} />;
  if (result.isError && (result.error as { code?: string })?.code === "PGRST202") {
    return <StoreState title="Transferências indisponíveis" description="Aguarde a atualização do servidor para registrar transferências." />;
  }

  return (
    <section className="ss-surface grid gap-3" aria-labelledby="ss-transfers-title">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ss-transfers-title">Transferências entre locais</h2>
        {canManage && <Button type="button" className="ss-primary" onClick={() => setCreate(true)}><Plus aria-hidden="true" /> Nova transferência</Button>}
      </header>
      <StoreField id="ss-transfer-filter" label="Situação">
        <select id="ss-transfer-filter" className="sm:max-w-64" value={filter} onChange={(event) => {
          setFilter(event.target.value as TransferStatus | "");
          setPage(1);
        }}>
          <option value="">Todas</option>
          {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </StoreField>
      {result.isPending ? <StoreState title="Carregando transferências" busy /> :
        result.isError ? <StoreFailure message={storeError(result.error)} retry={() => void result.refetch()} /> :
          result.data.items.length === 0 ? <p role="status" className="text-sm">Nenhuma transferência neste recorte.</p> :
            <ul className="divide-y">
              {result.data.items.map((item) => <li key={item.id}>
                <button type="button" className="ss-list-link w-full rounded-md text-left" onClick={() => onSelect(item.id)}>
                  <span className="grid gap-1">
                    <strong>{item.product_name}</strong>
                    <span className="text-sm text-[var(--ss-muted)]">{item.sku} · {item.origin_name} → {item.destination_name}</span>
                  </span>
                  <span>{decimalLabel(item.quantity)} {item.unit}</span>
                  <span className="ss-pill" data-status={item.status === "received" ? "active" : "draft"}>{statuses[item.status]}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </li>)}
            </ul>}
      {result.data && (result.data.total > pageSize || page > 1) && <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Paginação de transferências">
        <Button type="button" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button>
        <p className="text-sm">Página {page}</p>
        <Button type="button" variant="outline" disabled={page * pageSize >= result.data.total} onClick={() => setPage(page + 1)}>Próxima</Button>
      </nav>}
    </section>
  );
}
