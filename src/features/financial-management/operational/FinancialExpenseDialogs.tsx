import { FinancialPaymentPlanPanel } from './FinancialPaymentPlanPanel';
import { useQuery } from '@tanstack/react-query';
import { fetchPaymentPlan, type PaymentPlan } from './financialEntryApi';
import { FinancialPaymentPlanEditor, makePlanDraft, paymentPlanInput, validatePaymentPlan } from './FinancialPaymentPlanEditor';
import { FinancialEntryComposer } from './FinancialEntryComposer';
import { useRef, useState, type ComponentProps, type FormEvent } from 'react';
import { AlertCircle, Archive, CheckCircle2, Loader2, Pencil, RotateCcw, Tags, Undo2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { FinancialEdition } from './financialOperationalApi';
import {
  EXPENSE_STATUS_LABELS, FinancialExpenseError, centsToInput, parseCents,
  type ExpenseCategory, type ExpenseInput, type ExpenseStatus, type FinancialExpense,
} from './financialExpensesApi';
import { useExpenseCategories, useExpenseDetail, useSaveExpense, useSaveExpenseCategory, useSeedExpenseCategories, useTransitionExpense } from './useFinancialExpenses';
import type { FinancialExpenseCapabilities } from './useFinancialExpenseCapabilities';
import { canTransitionExpense } from './financialExpenseActions';
import '@/styles/financial-expense-dialogs.css';

type CategoryOption = Pick<ExpenseCategory, 'id' | 'name'> & Partial<Pick<ExpenseCategory, 'active'>>;
type DialogCapabilities = { capabilities: FinancialExpenseCapabilities };
function ExpenseDialogContent(props: ComponentProps<typeof DialogContent>) {
  const opener = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement);
  return <DialogContent {...props} onCloseAutoFocus={(event) => {
    event.preventDefault();
    if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
  }} />;
}
const fmtDate = (value: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Não informado';
const fmtMoney = (value: number | null) => value == null ? 'Não informado' : (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação. Tente novamente.';
const dateToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map((key) => parts.find((part) => part.type === key)?.value).join('-');
};

/** Same action, payload and version retain their key after an uncertain network response. */
function useRequestKeys() {
  const keys = useRef(new Map<string, string>());
  return {
    for: (content: unknown) => {
      const signature = JSON.stringify(content);
      if (!keys.current.has(signature)) keys.current.set(signature, crypto.randomUUID());
      return keys.current.get(signature)!;
    },
    finish: (content: unknown) => { keys.current.delete(JSON.stringify(content)); },
  };
}

function PermissionNotice({ capabilities, allowed }: DialogCapabilities & { allowed: boolean }) {
  if (capabilities.isLoading) return <p className="f28-expense-dialog-notice" role="status"><Loader2 aria-hidden="true" />Verificando permissões…</p>;
  if (capabilities.isError) return <p className="f28-expense-dialog-notice" role="alert"><AlertCircle aria-hidden="true" />Não foi possível verificar suas permissões. Reabra o formulário após atualizar a consulta.</p>;
  if (!allowed) return <p className="f28-expense-dialog-notice" role="status">Seu acesso permite apenas consultar esta operação.</p>;
  return null;
}

function QueryError({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="f28-expense-dialog-state" role="alert">
    <AlertCircle aria-hidden="true" /><p>{error instanceof FinancialExpenseError && error.kind === 'forbidden' ? 'Você não tem permissão para consultar estes dados financeiros.' : errorMessage(error)}</p>
    <Button type="button" variant="outline" size="sm" onClick={retry}>Tentar novamente</Button>
  </div>;
}

function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="f28-expense-dialog-error" role="alert">
    <p>{errorMessage(error)}</p>
    {error instanceof FinancialExpenseError && error.kind === 'conflict' && <p>O formulário mantém seus dados. Feche e consulte a versão atual antes de reenviar alterações.</p>}
  </div>;
}

export function ExpenseFormDialog({ org, edition, value, onClose, commissions, capabilities }: {
  org: string; edition: FinancialEdition; value: FinancialExpense | 'new-prevista' | 'new-realizada'; onClose: () => void;
  categories: CategoryOption[]; commissions: Array<{ id: string; nome: string }>;
} & DialogCapabilities) {
  return <FinancialEntryComposer org={org} edition={edition} kind="expense" expense={typeof value === 'string' ? null : value}
    initialStatus={value === 'new-realizada' ? 'realizada' : 'prevista'} commissions={commissions} capabilities={capabilities} onClose={onClose} />;
}

type TransitionProps = { org: string; expense: FinancialExpense; to: ExpenseStatus; onClose: () => void } & DialogCapabilities;
export function TransitionDialog(props: TransitionProps) {
  const plan = useQuery({queryKey:['financial-operational','payment-plan',props.org,props.expense.edition_id,props.expense.id],queryFn:()=>fetchPaymentPlan(props.org,props.expense.edition_id,'despesa',props.expense.id),enabled:props.capabilities.canAccess,retry:false});
  if (plan.isLoading || plan.isError) return <Dialog open onOpenChange={v=>!v&&props.onClose()}><ExpenseDialogContent className="f28-expense-dialog f28-expense-dialog--compact"><DialogHeader><DialogTitle>Conferir cronograma</DialogTitle><DialogDescription>{plan.isError?'Não foi possível consultar o cronograma atual.':'Consultando o estado persistido…'}</DialogDescription></DialogHeader>{plan.isError&&<Button onClick={()=>void plan.refetch()}>Tentar novamente</Button>}<Button variant="outline" onClick={props.onClose}>Fechar</Button></ExpenseDialogContent></Dialog>;
  return <TransitionDialogBody {...props} initialPlan={plan.data||null}/>;
}
function TransitionDialogBody({ org, expense, to, onClose, capabilities, initialPlan }: TransitionProps & {initialPlan:PaymentPlan|null}) {
  const [planDraft, setPlanDraft] = useState(()=>makePlanDraft(initialPlan,expense.due_date||''));
  const [committed, setCommitted] = useState(centsToInput(expense.planned_cents));
  const [committedOn, setCommittedOn] = useState(dateToday);
  const [due, setDue] = useState(expense.due_date ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const mutation = useTransitionExpense(org);
  const requests = useRequestKeys();
  const allowed = canTransitionExpense(expense, to, capabilities);
  const planTotalPreview=(()=>{try{return to==='realizada'?(parseCents(committed)||0):(expense.planned_cents||0);}catch{return 0;}})();
  const titles = { realizada: 'Realizar despesa', prevista: 'Voltar para prevista', cancelada: 'Cancelar despesa' };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!allowed || mutation.isPending) return;
    setError(null);
    try {
      const amount = to === 'realizada' ? parseCents(committed) : null;
      if (to === 'realizada' && ((amount ?? 0) <= 0 || !committedOn)) throw new FinancialExpenseError('validation', 'Informe valor realizado maior que zero e a data de competência.');
      if (to !== 'realizada' && reason.trim().length < 3) throw new FinancialExpenseError('validation', 'Informe o motivo (mínimo 3 caracteres).');
      const planTotal=to==='realizada'?amount!:(expense.planned_cents||0);
      if(to!=='cancelada'){const problem=validatePaymentPlan(planDraft,planTotal);if(problem)throw new FinancialExpenseError('validation',problem);}
      const schedule=to!=='cancelada'?{payment_plan:paymentPlanInput(planDraft,planTotal)}:{};
      const content = {
        id: expense.id, to, expectedVersion: expense.version,
        payload: to === 'realizada' ? { committed_cents: amount!, committed_on: committedOn, due_date: due || null, ...schedule } : schedule,
        reason: to === 'realizada' ? null : reason.trim(),
      };
      await mutation.mutateAsync({ ...content, requestId: requests.for(content) });
      onClose();
    } catch (caught) { setError(caught); }
  };
  return <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
    <ExpenseDialogContent className="f28-expense-dialog f28-expense-dialog--compact" data-tone={to === 'cancelada' ? 'cancelada' : to === 'realizada' ? 'realizado' : 'projetado'}>
      <DialogHeader><DialogTitle>{titles[to]}</DialogTitle><DialogDescription>{expense.title}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="f28-expense-dialog-form" aria-busy={mutation.isPending}>
        <div className="f28-expense-dialog-body">
          {expense.paid_cents !== 0 && to !== 'realizada' ? <p className="f28-expense-dialog-notice" role="status">Há pagamentos registrados. Estorne-os antes de cancelar ou reverter esta despesa.</p> : <PermissionNotice capabilities={capabilities} allowed={allowed} />}
          <div className="f28-expense-transition-summary"><span>Projetado preservado</span><strong>{fmtMoney(expense.planned_cents)}</strong></div>
          <p className="f28-expense-field-help">{to === 'realizada' ? 'Confirmar registra o compromisso; o pagamento permanece independente.' : to === 'cancelada' ? 'A despesa sai dos totais ativos e seu histórico será preservado. O cancelamento é definitivo.' : 'O compromisso será removido. A previsão e o histórico serão preservados.'}</p>
          <fieldset disabled={!allowed || mutation.isPending} className="f28-expense-fields f28-expense-fields--single">
            {to === 'realizada' ? <>
              <label>Valor realizado (R$) *<Input autoFocus required inputMode="decimal" value={committed} onChange={(event) => setCommitted(event.target.value)} /></label>
              <label>Competência / realização *<Input type="date" required value={committedOn} onChange={(event) => setCommittedOn(event.target.value)} /></label>
              <label>Vencimento<Input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label>
            </> : <label>Motivo *<Textarea autoFocus required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Informe o motivo para o histórico" /></label>}
          </fieldset>
          {to!=='cancelada'&&<div className="f28-entry-transition"><FinancialPaymentPlanEditor id="expense-transition-plan" value={planDraft} total={planTotalPreview} onChange={setPlanDraft} disabled={!allowed||mutation.isPending}/></div>}
          <FormError error={error} />
        </div>
        <DialogFooter className="f28-expense-dialog-footer"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Fechar</Button>
          <Button type="submit" variant={to === 'cancelada' ? 'destructive' : 'default'} disabled={!allowed || mutation.isPending}>{mutation.isPending ? 'Enviando…' : titles[to]}</Button></DialogFooter>
      </form>
    </ExpenseDialogContent>
  </Dialog>;
}

export function CategoriesDialog({ org, onClose, capabilities }: { org: string; onClose: () => void } & DialogCapabilities) {
  const list = useExpenseCategories(org, true);
  const save = useSaveExpenseCategory(org);
  const seed = useSeedExpenseCategories(org);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ category: ExpenseCategory; name: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const requests = useRequestKeys();
  const allowed = capabilities.canAdmin && !capabilities.isLoading && !capabilities.isError;
  const pending = save.isPending || seed.isPending;
  const run = async (operation: () => Promise<unknown>) => {
    if (!allowed || pending) return;
    setError(null); setMessage('');
    try { await operation(); } catch (caught) { setError(caught); }
  };
  const saveCategory = async (payload: Partial<ExpenseCategory> & { name?: string }, expectedVersion: number | null) => {
    const content = { payload, expectedVersion };
    await save.mutateAsync({ ...content, requestId: requests.for(content) });
    requests.finish(content);
  };
  const rename = (event: FormEvent) => {
    event.preventDefault();
    if (!renaming) return;
    const nextName = renaming.name.trim();
    if (nextName === renaming.category.name) { setRenaming(null); return; }
    void run(async () => { await saveCategory({ id: renaming.category.id, name: nextName }, renaming.category.version); setRenaming(null); setMessage('Categoria renomeada. Os vínculos foram preservados.'); });
  };

  return <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
    <ExpenseDialogContent className="f28-expense-dialog f28-expense-dialog--categories">
      <DialogHeader><DialogTitle>Categorias de despesa</DialogTitle><DialogDescription>Arquivar preserva os vínculos e o histórico. Categorias personalizadas participam das mesmas comparações.</DialogDescription></DialogHeader>
      <div className="f28-expense-dialog-body" aria-busy={list.isLoading || pending}>
        <PermissionNotice capabilities={capabilities} allowed={allowed} />
        {list.isLoading ? <p className="f28-expense-dialog-state" role="status"><Loader2 className="animate-spin" aria-hidden="true" />Carregando categorias…</p>
          : list.isError ? <QueryError error={list.error} retry={() => void list.refetch()} />
          : <>
            <form className="f28-expense-category-add" onSubmit={(event) => {
              event.preventDefault();
              void run(async () => { await saveCategory({ name: name.trim() }, null); setName(''); setMessage('Categoria adicionada.'); });
            }}>
              <label>Nova categoria<Input minLength={2} maxLength={80} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da categoria" disabled={!allowed || pending} /></label>
              <Button type="submit" disabled={!allowed || pending || name.trim().length < 2}>Adicionar</Button>
            </form>
            {list.data?.length === 0 ? <p className="f28-expense-category-empty">Nenhuma categoria cadastrada.</p> : <ul className="f28-expense-category-list">{list.data?.map((category) => <li key={category.id} data-archived={!category.active}>
              {renaming?.category.id === category.id ? <form className="f28-expense-category-rename" onSubmit={rename}>
                <label>Novo nome de {category.name}<Input autoFocus required minLength={2} maxLength={80} value={renaming.name} disabled={pending} onChange={(event) => setRenaming({ ...renaming, name: event.target.value })} /></label>
                <div className="f28-expense-category-actions"><Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setRenaming(null)}>Cancelar</Button><Button type="submit" size="sm" disabled={!allowed || pending || renaming.name.trim().length < 2}>Salvar nome</Button></div>
              </form> : <>
                <div className="f28-expense-category-name"><strong>{category.name}</strong><span>{category.usage_count} {category.usage_count === 1 ? 'despesa vinculada' : 'despesas vinculadas'}{!category.active && ' · Arquivada'}</span></div>
                {allowed && <div className="f28-expense-category-actions"><Button type="button" size="sm" variant="ghost" aria-label={`Renomear ${category.name}`} disabled={pending} onClick={() => { setError(null); setRenaming({ category, name: category.name }); }}><Pencil aria-hidden="true" />Renomear</Button>
                  <Button type="button" size="sm" variant="outline" aria-label={`${category.active ? 'Arquivar' : 'Reativar'} ${category.name}`} disabled={pending} onClick={() => void run(async () => {
                    await saveCategory({ id: category.id, active: !category.active }, category.version);
                    setMessage(category.active ? 'Categoria arquivada. Os vínculos foram preservados.' : 'Categoria reativada.');
                  })}>{category.active ? <Archive aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}{category.active ? 'Arquivar' : 'Reativar'}</Button></div>}
              </>}
            </li>)}</ul>}
            {allowed && <div className="f28-expense-category-suggestions"><Tags aria-hidden="true" /><div><p>Comece com os nomes usados em 2026.</p><span>Adiciona apenas sugestões de classificação.</span></div>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void run(async () => {
                const content = { action: 'seed' };
                const result = await seed.mutateAsync(requests.for(content));
                requests.finish(content);
                setMessage(result.created ? `${result.created} sugestões adicionadas.` : 'As sugestões já estão cadastradas.');
              })}>{seed.isPending ? 'Adicionando…' : 'Usar nomes de 2026 como sugestão'}</Button></div>}
          </>}
        {pending && <p className="f28-expense-field-help" role="status">Salvando alteração…</p>}
        {message && <p className="f28-expense-dialog-success" role="status">{message}</p>}
        <FormError error={error} />
      </div>
      <DialogFooter className="f28-expense-dialog-footer"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Fechar</Button></DialogFooter>
    </ExpenseDialogContent>
  </Dialog>;
}

const historyLabels: Record<string, string> = { create: 'Despesa criada', update: 'Cadastro atualizado', status_realizada: 'Despesa realizada', status_prevista: 'Retorno para prevista', status_cancelada: 'Despesa cancelada' };

export function ExpenseDetailDialog({ org, expenseId, onClose, onEdit, onTransition, capabilities }: {
  org: string; expenseId: string; onClose: () => void;
  onEdit?: (expense: FinancialExpense) => void;
  onTransition?: (expense: FinancialExpense, to: ExpenseStatus) => void;
} & DialogCapabilities) {
  const detail = useExpenseDetail(org, expenseId);
  const expense = detail.data?.expense;
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <ExpenseDialogContent className="f28-expense-dialog f28-expense-dialog--detail">
      <DialogHeader><DialogTitle>{expense?.title ?? 'Detalhes da despesa'}</DialogTitle><DialogDescription>Compromisso, liquidação e histórico do mesmo registro financeiro.</DialogDescription></DialogHeader>
      <div className="f28-expense-dialog-body">
        {detail.isLoading ? <p className="f28-expense-dialog-state" role="status"><Loader2 className="animate-spin" aria-hidden="true" />Consultando despesa…</p>
          : detail.isError ? <QueryError error={detail.error} retry={() => void detail.refetch()} />
          : expense && detail.data && <>
            <div className="f28-expense-detail-heading"><span data-status={expense.status} className="f28-expense-detail-status">{EXPENSE_STATUS_LABELS[expense.status]}</span><span>{[expense.category_name ?? 'Sem categoria', expense.commission_name ?? 'Sem comissão'].join(' · ')}</span></div>
            <dl className="f28-expense-detail-values">
              <div><dt>Projetado</dt><dd>{fmtMoney(expense.planned_cents)}</dd></div>
              <div><dt>Realizado</dt><dd>{fmtMoney(expense.status === 'realizada' ? expense.committed_cents : null)}</dd></div>
              <div><dt>Pago líquido</dt><dd>{fmtMoney(expense.paid_cents)}</dd></div>
              <div><dt>Saldo a pagar</dt><dd>{fmtMoney(expense.status === 'realizada' ? expense.open_cents : null)}</dd></div>
            </dl>
            {expense.settlement_inconsistent && <p className="f28-expense-dialog-error" role="alert">O servidor identificou uma inconsistência de liquidação. Revise os movimentos antes de alterar o compromisso.</p>}
            <dl className="f28-expense-detail-metadata">
              <div><dt>Fornecedor / favorecido</dt><dd>{expense.payee_reference_name || expense.payee_name || 'Não informado'}</dd></div>
              <div><dt>Data prevista</dt><dd>{fmtDate(expense.planned_on)}</dd></div>
              <div><dt>Competência / realização</dt><dd>{fmtDate(expense.committed_on)}</dd></div>
              <div><dt>Vencimento</dt><dd>{fmtDate(expense.due_date)}</dd></div>
              {expense.description && <div className="f28-expense-field-wide"><dt>Detalhamento</dt><dd>{expense.description}</dd></div>}
              {expense.notes && <div className="f28-expense-field-wide"><dt>Observações</dt><dd>{expense.notes}</dd></div>}
              {expense.cancel_reason && <div className="f28-expense-field-wide"><dt>Motivo do cancelamento</dt><dd>{expense.cancel_reason}</dd></div>}
            </dl>
            <section className="f28-expense-detail-section" aria-labelledby="expense-payments-heading"><h3 id="expense-payments-heading">Pagamentos e estornos</h3>
              <p>O valor realizado é o compromisso; o pago líquido considera os movimentos alocados.</p>
              {detail.data.movements.length === 0 ? <p className="f28-expense-detail-empty">Nenhum pagamento ou estorno registrado.</p> : <ul className="f28-expense-movement-list">{detail.data.movements.map((movement) => {
                const reversal = Boolean(movement.reverses_movement_id) || movement.kind === 'estorno';
                return <li key={movement.id}><div><strong>{reversal ? 'Estorno de pagamento' : 'Pagamento'}</strong><span>{fmtDate(movement.occurred_on)}</span></div><strong>{fmtMoney(movement.allocated_cents)}</strong></li>;
              })}</ul>}
            </section>
            <section className="f28-expense-detail-section" aria-labelledby="expense-history-heading"><h3 id="expense-history-heading">Histórico da despesa</h3>
              {detail.data.history.length === 0 ? <p className="f28-expense-detail-empty">Nenhuma alteração registrada.</p> : <ol className="f28-expense-history-list">{detail.data.history.map((entry) => <li key={entry.id}><div><strong>{historyLabels[entry.action] ?? entry.action}</strong><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</time></div>{entry.reason && <p>{entry.reason}</p>}</li>)}</ol>}
            </section>
          </>}
      {expense&&<FinancialPaymentPlanPanel editionId={expense.edition_id} type="despesa" sourceId={expense.id}/>}
      </div>
      <DialogFooter className="f28-expense-dialog-footer f28-expense-detail-actions">
        {expense && onEdit && capabilities.canEdit && !capabilities.isLoading && !capabilities.isError && expense.status !== 'cancelada' && <Button type="button" size="sm" variant="outline" onClick={() => onEdit(expense)}><Pencil aria-hidden="true" />Editar</Button>}
        {expense && onTransition && <>
          {canTransitionExpense(expense, 'realizada', capabilities) && <Button type="button" size="sm" onClick={() => onTransition(expense, 'realizada')}><CheckCircle2 aria-hidden="true" />Realizar</Button>}
          {canTransitionExpense(expense, 'prevista', capabilities) && <Button type="button" size="sm" variant="outline" onClick={() => onTransition(expense, 'prevista')}><Undo2 aria-hidden="true" />Reverter</Button>}
          {canTransitionExpense(expense, 'cancelada', capabilities) && <Button type="button" size="sm" variant="outline" onClick={() => onTransition(expense, 'cancelada')}><XCircle aria-hidden="true" />Cancelar despesa</Button>}
        </>}
        <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
      </DialogFooter>
    </ExpenseDialogContent>
  </Dialog>;
}
