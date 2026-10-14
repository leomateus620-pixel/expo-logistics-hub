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

export function ExpenseFormDialog({ org, edition, value, onClose, categories, commissions, capabilities }: {
  org: string; edition: FinancialEdition; value: FinancialExpense | 'new-prevista' | 'new-realizada'; onClose: () => void;
  categories: CategoryOption[]; commissions: Array<{ id: string; nome: string }>;
} & DialogCapabilities) {
  const existing = typeof value === 'string' ? null : value;
  const status = existing?.status ?? (value === 'new-realizada' ? 'realizada' : 'prevista');
  const allowed = edition.status === 'operacional' && status !== 'cancelada' && capabilities.canEdit && (!existing && status === 'realizada' ? capabilities.canConfirm : true) && !capabilities.isLoading && !capabilities.isError;
  const [form, setForm] = useState({
    title: existing?.title ?? '', description: existing?.description ?? '', category_id: existing?.category_id ?? '',
    commission_id: existing?.commission_id ?? '', payee_name: existing?.payee_name ?? '',
    planned: centsToInput(existing?.planned_cents ?? null), planned_on: existing?.planned_on ?? '',
    committed: centsToInput(existing?.committed_cents ?? null), committed_on: existing?.committed_on ?? '',
    due_date: existing?.due_date ?? '', notes: existing?.notes ?? '',
  });
  const [error, setError] = useState<unknown>(null);
  const [errorField, setErrorField] = useState<keyof typeof form | null>(null);
  const save = useSaveExpense(org);
  const requests = useRequestKeys();
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    if (errorField === key) { setError(null); setErrorField(null); }
  };
  const fieldError = (key: keyof typeof form) => errorField === key && error
    ? <p id={`expense-${key}-error`} className="f28-expense-field-error" role="alert">{errorMessage(error)}</p> : null;
  const fieldA11y = (key: keyof typeof form) => ({ id: `expense-${key}`, 'aria-invalid': errorField === key || undefined, 'aria-describedby': errorField === key ? `expense-${key}-error` : undefined });
  const canChangeCommitment = capabilities.canConfirm;
  const options = categories.filter((category) => category.active !== false || category.id === existing?.category_id);
  if (existing?.category_id && !options.some((category) => category.id === existing.category_id)) {
    options.push({ id: existing.category_id, name: existing.category_name ?? 'Categoria vinculada', active: false });
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!allowed || save.isPending) return;
    setError(null);
    setErrorField(null);
    let validating: keyof typeof form | null = 'title';
    try {
      if (form.title.trim().length < 2) throw new FinancialExpenseError('validation', 'Informe uma descrição com pelo menos 2 caracteres.');
      validating = 'planned';
      const planned = parseCents(form.planned);
      if (status === 'prevista' && planned == null) throw new FinancialExpenseError('validation', 'Informe o valor projetado.');
      validating = 'committed';
      const committed = status === 'realizada' ? parseCents(form.committed) : null;
      if (status === 'realizada' && (committed ?? 0) <= 0) throw new FinancialExpenseError('validation', 'Informe valor realizado maior que zero.');
      if (existing && committed != null && committed < existing.paid_cents) throw new FinancialExpenseError('validation', 'O valor realizado não pode ficar abaixo do que já foi pago.');
      validating = 'committed_on';
      if (status === 'realizada' && !form.committed_on) throw new FinancialExpenseError('validation', 'Informe a data de competência / realização.');
      validating = null;
      const payload: ExpenseInput = {
        ...(existing ? { id: existing.id } : { edition_id: edition.id, status: status as 'prevista' | 'realizada' }),
        title: form.title.trim(), description: form.description.trim() || null, category_id: form.category_id || null,
        commission_id: form.commission_id || null, payee_name: form.payee_name.trim() || null,
        planned_cents: planned, planned_on: form.planned_on || null, due_date: form.due_date || null, notes: form.notes.trim() || null,
        ...(status === 'realizada' && canChangeCommitment ? { committed_cents: committed, committed_on: form.committed_on || null } : {}),
      };
      const content = { payload, expectedVersion: existing?.version ?? null };
      await save.mutateAsync({ ...content, requestId: requests.for(content) });
      onClose();
    } catch (caught) {
      setError(caught); setErrorField(validating);
      if (validating) document.getElementById(`expense-${validating}`)?.focus();
    }
  };

  return <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
    <ExpenseDialogContent className="f28-expense-dialog" data-tone={status === 'realizada' ? 'realizado' : 'projetado'}>
      <DialogHeader><DialogTitle>{existing ? 'Editar despesa' : status === 'realizada' ? 'Adicionar despesa realizada' : 'Adicionar despesa projetada'}</DialogTitle>
        <DialogDescription>{status === 'realizada' ? 'Realizado registra o compromisso. Pagamentos e saldo vêm da liquidação registrada.' : 'Registre o planejamento. A previsão será preservada quando a despesa for realizada.'}</DialogDescription></DialogHeader>
      <form noValidate onSubmit={submit} className="f28-expense-dialog-form" aria-busy={save.isPending}>
        <div className="f28-expense-dialog-body">
          <PermissionNotice capabilities={capabilities} allowed={allowed} />
          <fieldset disabled={!allowed || save.isPending} className="f28-expense-fields">
            <legend>Identificação</legend>
            <label className="f28-expense-field-wide">Descrição da despesa *<Input {...fieldA11y('title')} autoFocus required minLength={2} maxLength={240} value={form.title} onChange={set('title')} placeholder="Ex.: Locação de equipamentos" />{fieldError('title')}</label>
            <label>Categoria<select className="f28-expense-select" value={form.category_id} onChange={set('category_id')}>
              <option value="">Sem categoria</option>{options.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active === false ? ' · arquivada (vínculo atual)' : ''}</option>)}</select></label>
            <label>Comissão responsável<select className="f28-expense-select" value={form.commission_id} onChange={set('commission_id')}>
              <option value="">Sem comissão</option>{commissions.map((commission) => <option key={commission.id} value={commission.id}>{commission.nome}</option>)}</select></label>
            <label className="f28-expense-field-wide">Fornecedor / favorecido<Input maxLength={200} value={form.payee_name} onChange={set('payee_name')} /></label>
            <label className="f28-expense-field-wide">Detalhamento<Textarea maxLength={2000} value={form.description} onChange={set('description')} rows={2} /></label>
          </fieldset>
          <fieldset disabled={!allowed || save.isPending} className="f28-expense-fields">
            <legend>Previsão e compromisso</legend>
            <label>Valor projetado (R$){status === 'prevista' ? ' *' : ''}<Input {...fieldA11y('planned')} inputMode="decimal" required={status === 'prevista'} value={form.planned} onChange={set('planned')} placeholder="0,00" />{fieldError('planned')}
              {status === 'realizada' && !existing && <small>Deixe em branco para registrar sem previsão.</small>}</label>
            <label>Data prevista<Input type="date" value={form.planned_on} onChange={set('planned_on')} /></label>
            {status === 'realizada' && <>
              <label>Valor realizado (R$) *<Input {...fieldA11y('committed')} inputMode="decimal" required value={form.committed} onChange={set('committed')} placeholder="0,00" disabled={!canChangeCommitment} />{fieldError('committed')}</label>
              <label>Competência / realização *<Input {...fieldA11y('committed_on')} type="date" required value={form.committed_on} onChange={set('committed_on')} disabled={!canChangeCommitment} />{fieldError('committed_on')}</label>
              {!canChangeCommitment && <p className="f28-expense-field-wide f28-expense-field-help">Alterar o compromisso exige confirmação financeira. Os demais campos seguem editáveis.</p>}
            </>}
            <label>Vencimento<Input type="date" value={form.due_date} onChange={set('due_date')} /></label>
            <label className="f28-expense-field-wide">Observações<Textarea maxLength={2000} value={form.notes} onChange={set('notes')} rows={2} /></label>
          </fieldset>
          <FormError error={errorField ? null : error} />
        </div>
        <DialogFooter className="f28-expense-dialog-footer"><Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>Fechar</Button>
          <Button type="submit" disabled={!allowed || save.isPending}>{save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}{save.isPending ? 'Salvando…' : 'Salvar despesa'}</Button></DialogFooter>
      </form>
    </ExpenseDialogContent>
  </Dialog>;
}

export function TransitionDialog({ org, expense, to, onClose, capabilities }: { org: string; expense: FinancialExpense; to: ExpenseStatus; onClose: () => void } & DialogCapabilities) {
  const [committed, setCommitted] = useState(centsToInput(expense.planned_cents));
  const [committedOn, setCommittedOn] = useState(dateToday);
  const [due, setDue] = useState(expense.due_date ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const mutation = useTransitionExpense(org);
  const requests = useRequestKeys();
  const allowed = canTransitionExpense(expense, to, capabilities);
  const titles = { realizada: 'Realizar despesa', prevista: 'Voltar para prevista', cancelada: 'Cancelar despesa' };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!allowed || mutation.isPending) return;
    setError(null);
    try {
      const amount = to === 'realizada' ? parseCents(committed) : null;
      if (to === 'realizada' && ((amount ?? 0) <= 0 || !committedOn)) throw new FinancialExpenseError('validation', 'Informe valor realizado maior que zero e a data de competência.');
      if (to !== 'realizada' && reason.trim().length < 3) throw new FinancialExpenseError('validation', 'Informe o motivo (mínimo 3 caracteres).');
      const content = {
        id: expense.id, to, expectedVersion: expense.version,
        payload: to === 'realizada' ? { committed_cents: amount!, committed_on: committedOn, due_date: due || null } : {},
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
              <div><dt>Fornecedor / favorecido</dt><dd>{expense.payee_name || 'Não informado'}</dd></div>
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
