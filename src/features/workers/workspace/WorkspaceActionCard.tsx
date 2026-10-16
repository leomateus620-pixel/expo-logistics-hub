import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Check, CheckCircle2, Clock3, ExternalLink, Loader2, LockKeyhole, Pencil, ShieldCheck, X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { ActionView, CommercialManualInput } from '../workspace-contracts';
import { safeSourceUrl } from '../ui-utils';
import type { WorkerWorkspace } from './useWorkerWorkspace';
import { workspaceDate } from './useWorkerWorkspace';

let clockNow = performance.now(); let clockTimer: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();
function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (!clockTimer) { clockNow = performance.now(); clockTimer = setInterval(() => { clockNow = performance.now(); clockListeners.forEach(update => update()); }, 1000); }
  return () => { clockListeners.delete(listener); if (!clockListeners.size) { clearInterval(clockTimer); clockTimer = undefined; } };
}
function useActionExpiry(action: ActionView) {
  const now = useSyncExternalStore(subscribeClock, () => clockNow, () => 0);
  const anchor = useRef({ serverNow: action.serverNow, performanceNow: performance.now() });
  if (anchor.current.serverNow !== action.serverNow) anchor.current = { serverNow: action.serverNow, performanceNow: performance.now() };
  return Math.max(0, Math.ceil((Date.parse(action.expiresAt) - Date.parse(action.serverNow) - (now - anchor.current.performanceNow)) / 1000));
}
const statusLabels: Record<ActionView['status'], string> = { proposed: 'Requer sua confirmação', confirmed: 'Conferindo e executando…', executed: 'Concluído', cancelled: 'Cancelado por você', expired: 'Proposta expirada', failed: 'Não foi executado' };

function ActionExpiry({ action, onExpired }: { action: ActionView; onExpired: () => void }) {
  const seconds = useActionExpiry(action); const notified = useRef(false);
  useEffect(() => { if (!seconds && !notified.current) { notified.current = true; onExpired(); } }, [seconds, onExpired]);
  return <span className={`worker-action-expiry ${seconds <= 60 ? 'worker-action-expiry--soon' : ''}`}><Clock3 size={13} /><span aria-hidden="true">{seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Expirada'}</span><span className="sr-only">{seconds ? `Válida até ${workspaceDate(action.expiresAt, false)}` : 'Esta proposta expirou'}</span></span>;
}

export function WorkspaceActionCard({ action, workspace }: { action: ActionView; workspace: WorkerWorkspace }) {
  const [editorOpen, setEditorOpen] = useState(false); const [expired, setExpired] = useState(false);
  const editorTrigger = useRef<HTMLButtonElement>(null);
  const previousVersion = useRef(`${workspace.scope}:${action.version}`);
  useEffect(() => { const key = `${workspace.scope}:${action.version}`; if (key !== previousVersion.current) { setEditorOpen(false); setExpired(false); previousVersion.current = key; } }, [workspace.scope, action.version]);
  const busy = workspace.busyId === action.id; const proposed = action.status === 'proposed' && !expired;
  const href = safeSourceUrl(action.receipt?.target.href ?? action.target.href);
  const status = expired && action.status === 'proposed' ? 'expired' : action.status;
  const mutation = (command: 'confirm' | 'cancel') => { if (workspace.orgId) void workspace.mutateAction({ command, orgId: workspace.orgId, actionId: action.id, expectedVersion: action.version }).catch(() => undefined); };
  return <article className={`worker-action-card worker-action-card--${status}`} aria-label={`Proposta: ${action.summary}`}>
    <div className="worker-action-card__top"><span className="worker-confirm-badge">{status === 'executed' ? <CheckCircle2 size={14} /> : <LockKeyhole size={14} />}{statusLabels[status]}</span>{proposed && <ActionExpiry action={action} onExpired={() => { setExpired(true); void workspace.refresh(); }} />}</div>
    <h3>{action.summary}</h3><p className="worker-action-target">{action.target.label}</p>
    <dl className="worker-action-diff">{action.diff.map((row, index) => <div key={`${row.field}-${index}`}><dt>{row.label}{row.redacted && <LockKeyhole size={11} aria-label="Dado protegido" />}</dt><dd>{row.beforeDisplay && <span className="worker-action-diff__before">{row.beforeDisplay}</span>}<span>{row.afterDisplay ?? 'Sem valor informado'}</span></dd></div>)}</dl>
    {action.manualInputState === 'required' && proposed && <p className="worker-action-private-note"><ShieldCheck size={15} />Complete os dados em um formulário protegido. Eles não entram na conversa nem são enviados ao modelo de IA.</p>}
    {action.failure && <p className="worker-inline-error" role="alert">{action.failure.message}</p>}
    {status === 'expired' && <p className="worker-small-note">O prazo terminou. Peça uma nova proposta para conferir os dados atuais.</p>}
    {status === 'confirmed' && <p className="worker-small-note">A confirmação foi recebida. O resultado aparecerá quando o sistema concluir a execução.</p>}
    {action.receipt && <p className="worker-action-receipt"><Check size={15} />{action.receipt.summary}<time dateTime={action.receipt.executedAt}>{workspaceDate(action.receipt.executedAt)}</time></p>}
    {proposed && <div className="worker-action-controls">{action.permissions.canConfirm && <button type="button" className="worker-button worker-button--primary" disabled={busy} onClick={() => mutation('confirm')}>{busy ? <Loader2 size={15} className="worker-spin" /> : <Check size={15} />}Confirmar</button>}{action.permissions.canEdit && <button ref={editorTrigger} type="button" className="worker-button worker-button--quiet" disabled={busy} onClick={() => setEditorOpen(true)}><Pencil size={14} />{action.manualInputState === 'required' ? 'Completar dados' : 'Editar'}</button>}{action.permissions.canCancel && <button type="button" className="worker-button worker-button--quiet" disabled={busy} onClick={() => mutation('cancel')}><X size={14} />Cancelar</button>}</div>}
    {proposed && !action.permissions.canConfirm && action.manualInputState !== 'required' && <p className="worker-small-note">A confirmação não está disponível para sua conta ou para o estado atual do registro. Atualize a proposta para conferir.</p>}
    <div className="worker-action-card__bottom">{href && <a href={href}>Abrir registro <ExternalLink size={13} /></a>}<button type="button" onClick={() => void workspace.refresh()} disabled={workspace.loading}>Atualizar estado</button></div>
    <Sheet open={editorOpen} onOpenChange={setEditorOpen}><SheetContent className="workers-scope worker-workspace-sheet" onCloseAutoFocus={event => { event.preventDefault(); editorTrigger.current?.focus(); }}><SheetHeader><SheetTitle>{action.kind === 'arena_note' ? 'Editar proposta de nota' : 'Dados protegidos da proposta'}</SheetTitle><SheetDescription>{action.kind === 'arena_note' ? 'O sistema vai gerar um novo resumo. Salvar ainda não executa a ação.' : 'Preencha somente aqui. Os dados vão para o sistema Fenasoja e ficam fora da conversa e do modelo de IA.'}</SheetDescription></SheetHeader>{editorOpen && <ActionEditor key={`${workspace.scope}:${action.id}:${action.version}`} action={action} workspace={workspace} onSaved={() => setEditorOpen(false)} />}</SheetContent></Sheet>
  </article>;
}

function ActionEditor({ action, workspace, onSaved }: { action: ActionView; workspace: WorkerWorkspace; onSaved: () => void }) {
  const [body, setBody] = useState(() => action.kind === 'arena_note' ? action.diff.find(row => row.field === 'body')?.afterDisplay ?? '' : '');
  const [companyName, setCompanyName] = useState(''); const [contactName, setContactName] = useState(''); const [reservationDate, setReservationDate] = useState('');
  const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!workspace.orgId || saving) return;
    setError(null); setSaving(true);
    try {
      const identity = { orgId: workspace.orgId, actionId: action.id, expectedVersion: action.version, requestId: crypto.randomUUID() };
      if (action.kind === 'arena_note') {
        await workspace.mutateAction({ ...identity, command: 'edit', input: { kind: 'arena_note', eventId: action.target.recordId, body: body.trim() } });
      } else {
        let manualInput: CommercialManualInput;
        if (action.kind === 'commercial_reserve') {
          // The entered wall time is explicitly São Paulo, independent of the browser's timezone.
          const reservationExpiresAt = new Date(`${reservationDate}:00-03:00`).toISOString();
          if (Date.parse(reservationExpiresAt) <= Date.now()) throw new Error('Escolha um prazo futuro para a reserva.');
          manualInput = { kind: action.kind, companyName: companyName.trim(), contactName: contactName.trim(), reservationExpiresAt };
        } else manualInput = { kind: action.kind, companyName: companyName.trim(), contactName: contactName.trim() || null };
        await workspace.mutateAction({ ...identity, command: 'manual', manualInput });
      }
      setBody(''); setCompanyName(''); setContactName(''); setReservationDate(''); onSaved();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar a proposta. Confira o estado e tente novamente.'); }
    finally { setSaving(false); }
  };
  return <form className="worker-workspace-form" onSubmit={event => void submit(event)} autoComplete="off">
    <div className="worker-workspace-context"><LockKeyhole size={17} /><span>{action.target.label}</span></div>
    {action.kind === 'arena_note' ? <label>Nota operacional<textarea value={body} onChange={event => setBody(event.target.value)} rows={6} maxLength={2000} required /><small>Evite documentos, contatos e informações pessoais.</small></label> : <>
      <p className="worker-small-note">Ao editar, preencha novamente os campos. Os dados privados salvos não são recuperados pelo chat.</p>
      <label>Empresa ou identificação comercial<input value={companyName} onChange={event => setCompanyName(event.target.value)} maxLength={160} autoComplete="off" required /></label>
      <label>Nome do contato {action.kind === 'commercial_negotiate' && <small>(opcional)</small>}<input value={contactName} onChange={event => setContactName(event.target.value)} maxLength={160} autoComplete="off" required={action.kind === 'commercial_reserve'} /></label>
      {action.kind === 'commercial_reserve' && <label>Reserva válida até<input type="datetime-local" value={reservationDate} onChange={event => setReservationDate(event.target.value)} required /><small>Horário de Brasília · America/Sao_Paulo. Este é o prazo da reserva; a confirmação do card tem validade própria.</small></label>}
    </>}
    {error && <p role="alert" className="worker-inline-error">{error}</p>}<p className="worker-workspace-notice"><ShieldCheck size={16} />Você revisa o novo resumo e confirma depois de salvar.</p><button type="submit" className="worker-button worker-button--primary" disabled={saving}>{saving ? <Loader2 size={16} className="worker-spin" /> : <Check size={16} />}Salvar e revisar proposta</button>
  </form>;
}
