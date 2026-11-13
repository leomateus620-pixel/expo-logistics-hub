import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { storeError, storeRpc, type CommandResult } from "../../api/store";
import { fieldError, StoreFailure, StoreField, StoreHeading, StoreState } from "../../components/StoreElements";
import { moneyLabel, readCents } from "../../domain/purchases";
import { useStoreCommand } from "../../hooks/useStoreCommand";
import { useUnsavedStoreForm } from "../../hooks/useUnsavedStoreForm";
import type { CashMovement, CashSession, PosConfiguration, PosPageContext } from "./types";

const recordedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
type Action = { kind: "open" } | { kind: "supply" | "withdrawal" | "close"; session: CashSession };
const actionLabels = { open: "Abrir caixa", supply: "Registrar suprimento", withdrawal: "Registrar sangria", close: "Fechar caixa" };
const success = { open: "Caixa aberto.", supply: "Suprimento registrado.", withdrawal: "Sangria registrada.", close: "Caixa fechado." };
const amountLabels = { open: "Fundo inicial (R$)", supply: "Valor do suprimento (R$)", withdrawal: "Valor da sangria (R$)", close: "Dinheiro contado (R$)" };
const movementLabels = { supply: "Suprimento", withdrawal: "Sangria", receipt: "Recebimento", refund: "Estorno" };
const movementPageSize = 30;

export function CashPage({ scope, queryKey, canManage }: PosPageContext) {
  const { user } = useAuth();
  const [action, setAction] = useState<Action | null>(null);
  const [movements, setMovements] = useState<string | null>(null);
  const sessions = useQuery({
    queryKey: [...queryKey, "cash-sessions"],
    queryFn: () => storeRpc<{ items: CashSession[] }>("soja_store_cash_sessions", scope),
    meta: { persist: false },
  });
  const selectedSession = action && "session" in action
    ? sessions.data?.items.find(({ id }) => id === action.session.id) : undefined;
  const ownOpen = sessions.data?.items.some((session) => session.status === "open" && session.operator_id === user?.id);

  return (
    <>
      <StoreHeading title="Caixa" description="Acompanhe o dinheiro por sessão e registre as conferências de cada ponto."
        action={canManage && !action && !ownOpen && !sessions.isPending && !sessions.isError && (
          <Button type="button" className="ss-primary" onClick={() => setAction({ kind: "open" })}><Plus aria-hidden="true" /> Abrir caixa</Button>
        )} />
      {action && (
        <CashEditor key={`${action.kind}:${"session" in action ? action.session.version : "novo"}`} action={action} actorId={user?.id}
          selectedSession={selectedSession} scope={scope} queryKey={queryKey} close={() => setAction(null)}
          reload={selectedSession && action.kind !== "open" ? () => setAction({ kind: action.kind, session: selectedSession }) : undefined} />
      )}
      {sessions.isPending ? <StoreState title="Carregando sessões de caixa" busy /> : sessions.isError ? (
        <StoreFailure message={storeError(sessions.error)} retry={() => void sessions.refetch()} />
      ) : sessions.data.items.length === 0 ? (
        <StoreState title="Nenhuma sessão de caixa registrada" description="O fundo de abertura e os valores conferidos aparecerão aqui." />
      ) : (
        <section className="ss-surface space-y-3" aria-labelledby="ss-cash-sessions">
          <h2 id="ss-cash-sessions">Sessões de caixa</h2>
          <ul className="divide-y">
            {sessions.data.items.map((session) => (
              <li className="grid gap-3 py-4" key={session.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{session.location_name}</p>
                  <span className="ss-pill" data-status={session.status === "open" ? "active" : "archived"}>{session.status === "open" ? "Aberta" : "Fechada"}</span>
                </div>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  <div><dt className="text-sm text-[var(--ss-muted)]">Abertura</dt><dd>{recordedAt.format(new Date(session.opened_at))}</dd></div>
                  <div><dt className="text-sm text-[var(--ss-muted)]">Fundo inicial</dt><dd>{moneyLabel(session.opening_cents)}</dd></div>
                  <div><dt className="text-sm text-[var(--ss-muted)]">Dinheiro esperado</dt><dd>{moneyLabel(session.expected_cents)}</dd></div>
                  {session.closed_at && <div><dt className="text-sm text-[var(--ss-muted)]">Fechamento</dt><dd>{recordedAt.format(new Date(session.closed_at))}</dd></div>}
                  {session.counted_cents !== null && <div><dt className="text-sm text-[var(--ss-muted)]">Dinheiro contado</dt><dd>{moneyLabel(session.counted_cents)}</dd></div>}
                  {session.difference_cents !== null && <div><dt className="text-sm text-[var(--ss-muted)]">Diferença</dt><dd>{moneyLabel(session.difference_cents)}</dd></div>}
                </dl>
                <div className="flex flex-wrap gap-2">
                  {canManage && !action && session.status === "open" && <>
                    <Button type="button" variant="outline" onClick={() => setAction({ kind: "supply", session })}>Suprimento</Button>
                    <Button type="button" variant="outline" onClick={() => setAction({ kind: "withdrawal", session })}>Sangria</Button>
                    <Button type="button" variant="outline" onClick={() => setAction({ kind: "close", session })}><Wallet aria-hidden="true" /> Fechar caixa</Button>
                  </>}
                  <Button type="button" variant="outline" aria-expanded={movements === session.id}
                    onClick={() => setMovements(movements === session.id ? null : session.id)}>
                    {movements === session.id ? "Ocultar movimentos" : "Ver movimentos"}
                  </Button>
                </div>
                {movements === session.id && <CashMovements scope={scope} queryKey={queryKey} sessionId={session.id} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function CashMovements({ scope, queryKey, sessionId }: Omit<PosPageContext, "canManage"> & { sessionId: string }) {
  const [page, setPage] = useState(1);
  const movements = useQuery({
    queryKey: [...queryKey, "cash-movements", sessionId, page],
    queryFn: () => storeRpc<{ items: CashMovement[]; total: number }>("soja_store_cash_movements", {
      ...scope, _session_id: sessionId, _limit: movementPageSize, _offset: (page - 1) * movementPageSize,
    }),
    meta: { persist: false },
  });

  return (
    <section className="ss-variant grid gap-2" aria-label="Movimentos da sessão">
      <h3 className="font-semibold">Movimentos da sessão</h3>
      {movements.isPending ? <p role="status">Carregando movimentos…</p> : movements.isError ? (
        <StoreFailure message={storeError(movements.error)} retry={() => void movements.refetch()} />
      ) : movements.data.total === 0 ? <p>Nenhum movimento registrado.</p> : (
        <>
          <ul className="divide-y">
            {movements.data.items.map((movement) => (
              <li key={movement.id} className="grid grid-cols-[1fr_auto] gap-x-3 py-2">
                <strong>{movementLabels[movement.kind]}</strong>
                <span>{moneyLabel(movement.amount_cents)}</span>
                <span className="text-sm text-[var(--ss-muted)]"><time dateTime={movement.recorded_at}>{recordedAt.format(new Date(movement.recorded_at))}</time></span>
                {movement.reason && <span className="col-span-2 break-words text-sm">{movement.reason}</span>}
              </li>
            ))}
          </ul>
          {movements.data.total > movementPageSize && (
            <nav className="flex flex-wrap items-center gap-2" aria-label="Paginação dos movimentos">
              <Button type="button" variant="outline" onClick={() => setPage(page - 1)} disabled={page === 1}><ArrowLeft aria-hidden="true" /> Anterior</Button>
              <p className="text-sm">Página {page} de {Math.ceil(movements.data.total / movementPageSize)}</p>
              <Button type="button" variant="outline" onClick={() => setPage(page + 1)} disabled={page * movementPageSize >= movements.data.total}>Próxima <ArrowRight aria-hidden="true" /></Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

function CashEditor({ action, actorId, selectedSession, scope, queryKey, close, reload }: Omit<PosPageContext, "canManage"> & {
  action: Action;
  actorId?: string;
  selectedSession?: CashSession;
  close: () => void;
  reload?: () => void;
}) {
  const client = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<{ location?: string; amount?: string; reason?: string }>({});
  const [amount, setAmount] = useState("");
  const configuration = useQuery({
    queryKey: [...queryKey, "pos-config"],
    queryFn: () => storeRpc<PosConfiguration>("soja_store_pos_config", scope),
    enabled: action.kind === "open",
    meta: { persist: false },
  });
  const kind = action.kind;
  const session = "session" in action ? action.session : null;
  const takeover = !!session && session.operator_id !== actorId;
  const stale = !!session && (!selectedSession || selectedSession.version !== session.version || selectedSession.status !== "open");
  const command = useStoreCommand(scope, (requestId, payload: object) => storeRpc<CommandResult>(
    kind === "open" ? "soja_store_open_cash" : kind === "close" ? "soja_store_close_cash" : "soja_store_adjust_cash", {
      ...scope, _request_id: requestId, ...(session && { _expected_version: session.version }), _payload: payload,
    },
  ), () => {
    toast.success(success[kind]);
    void client.invalidateQueries({ queryKey });
    close();
  });
  const blocked = command.isPending || command.isUncertain;
  useUnsavedStoreForm(dirty || blocked);
  const enteredCents = amount.trim() ? readCents(amount) : null;
  const difference = kind === "close" && enteredCents !== null && session ? enteredCents - session.expected_cents : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || stale) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const locationId = String(data.get("location") ?? "");
    const reason = String(data.get("reason") ?? "").trim();
    const invalid: typeof errors = {};
    if (kind === "open" && !locationId) invalid.location = "Selecione o ponto de atendimento.";
    if (enteredCents === null || ((kind === "supply" || kind === "withdrawal") && enteredCents === 0)) invalid.amount = "Informe um valor válido com até duas casas decimais.";
    if ((kind === "supply" || kind === "withdrawal" || takeover || (difference !== null && difference !== 0)) && reason.length < 2) {
      invalid.reason = "Informe o motivo.";
    }
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    command.mutate(kind === "open" ? { location_id: locationId, opening_cents: enteredCents }
      : kind === "close" ? { session_id: session?.id, counted_cents: enteredCents, reason: reason || null }
      : { session_id: session?.id, kind, amount_cents: enteredCents, reason }, {
      onError: (error) => {
        if (/STALE_VERSION|CASH_CLOSED/i.test(String((error as { message?: string })?.message))) {
          void client.invalidateQueries({ queryKey: [...queryKey, "cash-sessions"] });
        }
      },
    });
  }

  return (
    <form className="ss-surface grid gap-4" aria-labelledby="ss-cash-action" onSubmit={submit} onChange={() => setDirty(true)} noValidate>
      <div>
        <h2 id="ss-cash-action">{actionLabels[kind]}</h2>
        {session && <p className="text-sm text-[var(--ss-muted)]">{session.location_name}</p>}
        {takeover && <p className="text-sm text-[var(--ss-muted)]">Outra pessoa abriu esta sessão. Registre o motivo da intervenção.</p>}
      </div>
      {kind === "open" && configuration.isPending && <p role="status">Carregando pontos de atendimento…</p>}
      {kind === "open" && configuration.isError && <StoreFailure message={storeError(configuration.error)} retry={() => void configuration.refetch()} />}
      {kind === "open" && configuration.isSuccess && !configuration.data.points.length && <p>Cadastre um ponto de atendimento ativo para abrir o caixa.</p>}
      <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2" disabled={blocked || stale}>
        {kind === "open" && (
          <StoreField id="ss-cash-location" label="Ponto de atendimento" error={errors.location}>
            <select {...fieldError("ss-cash-location", errors.location)} name="location" defaultValue="" required>
              <option value="">Selecione o ponto</option>
              {configuration.data?.points.map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}
            </select>
          </StoreField>
        )}
        <StoreField id="ss-cash-amount" label={amountLabels[kind]} error={errors.amount}>
          <input {...fieldError("ss-cash-amount", errors.amount)} inputMode="decimal" maxLength={16} value={amount}
            onChange={(event) => setAmount(event.target.value)} required />
        </StoreField>
        {kind !== "open" && (
          <StoreField id="ss-cash-reason" label={kind === "close" && !takeover ? "Justificativa da diferença, quando houver" : "Motivo"} error={errors.reason}>
            <input {...fieldError("ss-cash-reason", errors.reason)} name="reason" maxLength={600} />
          </StoreField>
        )}
        {kind === "close" && session && (
          <p className="text-sm sm:col-span-2">
            Dinheiro esperado {moneyLabel(session.expected_cents)}{difference !== null && ` · Diferença ${moneyLabel(difference)}`}
          </p>
        )}
      </fieldset>
      {command.isError && <StoreFailure message={storeError(command.error)} retry={command.isUncertain ? command.retry : undefined} retryLabel="Verificar envio" />}
      {stale && !command.isUncertain && <StoreFailure message="A sessão mudou durante a conferência." retryLabel="Carregar sessão atual"
        retry={selectedSession?.status === "open" ? reload : undefined} />}
      <div className="flex flex-wrap gap-2">
        <Button className="ss-primary" type="submit" disabled={blocked || stale || (kind === "open" && !configuration.data?.points.length)}>
          {command.isPending ? "Salvando…" : actionLabels[kind]}
        </Button>
        <Button variant="outline" type="button" disabled={command.isPending} onClick={() => {
          if ((!dirty && !command.isUncertain) || window.confirm("Descartar as alterações deste caixa?")) close();
        }}>Cancelar</Button>
      </div>
    </form>
  );
}
