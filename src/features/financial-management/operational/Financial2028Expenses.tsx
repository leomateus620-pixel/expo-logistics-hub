import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, Pencil, Plus, Tags, XCircle, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useOrgCommissions } from '@/hooks/useOrgCommissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { FinancialAmount } from '../components/FinancialPrimitives';
import type { FinancialEdition } from './financialOperationalApi';
import {
  EXPENSE_DATE_FIELD_LABELS, EXPENSE_STATUS_LABELS, FinancialExpenseError, centsToInput, deviation, parseCents,
  type ExpenseDateField, type ExpenseFilters, type ExpenseStatus, type FinancialExpense,
} from './financialExpensesApi';
import {
  EXPENSE_PAGE_SIZE, useExpenseCategories, useExpenseComparison, useExpenseList, useSaveExpense,
  useSaveExpenseCategory, useSeedExpenseCategories, useTransitionExpense,
} from './useFinancialExpenses';
import { Financial2028Composition, Financial2028Loading, Financial2028Metric, Financial2028Panel, Financial2028State } from './Financial2028Presentation';

const newKey = () => crypto.randomUUID();
const fmtDate = (v: string | null) => (v ? v.slice(0, 10).split('-').reverse().join('/') : '—');
const Money = ({ v }: { v: number | null }) => (v == null ? <span className="f28-unavailable">Não informado</span> : <FinancialAmount value={v / 100} animate={false} />);

function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  const kind = error instanceof FinancialExpenseError ? error.kind : 'unknown';
  if (kind === 'not_activated') return <Financial2028State tone="locked" title="Despesas 2028 ainda não ativadas no backend" />;
  if (kind === 'forbidden') return <Financial2028State tone="locked" title="Acesso financeiro indisponível">A consulta exige acesso financeiro a esta edição.</Financial2028State>;
  return <Financial2028State tone="error" title={kind === 'network' ? 'Falha de conexão' : 'Não foi possível carregar as despesas.'} retry={retry} />;
}

export function Financial2028Expenses({ edition, focus }: { edition: FinancialEdition; focus: 'projetado' | 'realizado' }) {
  const { orgId } = useCurrentOrg();
  const org = orgId as string;
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<ExpenseFilters>({ date_field: focus === 'projetado' ? 'planned_on' : 'committed_on' });
  const [page, setPage] = useState(0);
  const [side, setSide] = useState(focus);
  const [editing, setEditing] = useState<FinancialExpense | 'new-prevista' | 'new-realizada' | null>(null);
  const [transition, setTransition] = useState<{ expense: FinancialExpense; to: ExpenseStatus } | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  useEffect(() => { setSide(focus); }, [focus]);
  useEffect(() => { setPage(0); }, [filters]);

  const comparison = useExpenseComparison(org, edition.id, filters);
  const list = useExpenseList(org, edition.id, filters, page);
  const categories = useExpenseCategories(org);
  const { commissions } = useOrgCommissions();

  if (comparison.isLoading) return <Financial2028Loading label="Carregando despesas 2028…" />;
  if (comparison.isError) return <ErrorState error={comparison.error} retry={() => void comparison.refetch()} />;
  const t = comparison.data!.totals;

  const toolbar = <div className="f28-expense-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
    <Input aria-label="Buscar despesa" placeholder="Buscar por título ou favorecido" style={{ maxWidth: 260 }}
      onKeyDown={(e) => { if (e.key === 'Enter') setFilters((f) => ({ ...f, q: (e.target as HTMLInputElement).value })); }} />
    <select aria-label="Categoria" className="f28-select" value={filters.category_id ?? ''} onChange={(e) => setFilters((f) => ({ ...f, category_id: e.target.value }))}>
      <option value="">Todas as categorias</option><option value="none">Sem categoria</option>
      {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
    <select aria-label="Comissão" className="f28-select" value={filters.commission_id ?? ''} onChange={(e) => setFilters((f) => ({ ...f, commission_id: e.target.value }))}>
      <option value="">Todas as comissões</option><option value="none">Sem comissão</option>
      {commissions.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
    </select>
    <select aria-label="Situação" className="f28-select" value={filters.status ?? ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as ExpenseStatus | '' }))}>
      <option value="">Todas as situações</option>
      {(Object.keys(EXPENSE_STATUS_LABELS) as ExpenseStatus[]).map((s) => <option key={s} value={s}>{EXPENSE_STATUS_LABELS[s]}</option>)}
    </select>
    <select aria-label="Data do período" className="f28-select" value={filters.date_field} onChange={(e) => setFilters((f) => ({ ...f, date_field: e.target.value as ExpenseDateField }))}>
      {(Object.keys(EXPENSE_DATE_FIELD_LABELS) as ExpenseDateField[]).map((k) => <option key={k} value={k}>{EXPENSE_DATE_FIELD_LABELS[k]}</option>)}
    </select>
    <Input type="date" aria-label="De" style={{ width: 150 }} value={filters.from ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
    <Input type="date" aria-label="Até" style={{ width: 150 }} value={filters.to ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
    <span style={{ flex: 1 }} />
    <Button type="button" variant="outline" onClick={() => setCategoriesOpen(true)}><Tags aria-hidden="true" />Categorias</Button>
    <Button type="button" variant="outline" onClick={() => setEditing('new-realizada')}><Plus aria-hidden="true" />Realizada direta</Button>
    <Button type="button" onClick={() => setEditing('new-prevista')}><Plus aria-hidden="true" />Nova prevista</Button>
  </div>;

  const pct = t.deviation_pct == null ? 'sem previsão para comparar' : `${t.deviation_pct > 0 ? '+' : ''}${t.deviation_pct.toLocaleString('pt-BR')}%`;
  const panel = (which: 'projetado' | 'realizado') => which === 'projetado'
    ? <div style={{ display: 'grid', gap: 12, padding: 8 }}>
        <Financial2028Metric label="Total projetado" value={t.planned_cents} hint={`${t.by_status.prevista} previstas · exclui canceladas`} tone="indigo" priority />
        <Financial2028Composition title="Projetado por categoria" items={comparison.data!.by_category.filter((g) => g.planned_cents > 0).map((g) => ({ label: g.name, value: g.planned_cents }))} />
        <Financial2028Composition title="Projetado por comissão" items={comparison.data!.by_commission.filter((g) => g.planned_cents > 0).map((g) => ({ label: g.name, value: g.planned_cents }))} />
      </div>
    : <div style={{ display: 'grid', gap: 12, padding: 8 }}>
        <Financial2028Metric label="Total realizado" value={t.committed_cents} hint={`Desvio ${pct} · ${t.realized_without_plan_count} sem previsão`} tone="success" priority />
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
          <Financial2028Metric label="Pago líquido" value={t.paid_cents} hint="Movimentos alocados" />
          <Financial2028Metric label="Saldo a pagar" value={t.open_cents} hint={`${t.overdue_count} vencidas em aberto`} tone={t.overdue_count ? 'danger' : 'gold'} />
          <Financial2028Metric label="Desvio (realizado − projetado)" value={t.deviation_cents} hint={pct} tone={t.deviation_cents > 0 ? 'danger' : 'neutral'} />
        </div>
        <Financial2028Composition title="Realizado por categoria" items={comparison.data!.by_category.filter((g) => g.committed_cents > 0).map((g) => ({ label: g.name, value: g.committed_cents, tone: 'success' }))} />
      </div>;

  return <div style={{ display: 'grid', gap: 16 }} data-expense-focus={focus}>
    {toolbar}
    {isMobile
      ? <><div role="tablist" style={{ display: 'flex', gap: 8 }}>
          {(['projetado', 'realizado'] as const).map((s) => <Button key={s} role="tab" aria-selected={side === s} variant={side === s ? 'default' : 'outline'} onClick={() => setSide(s)}>{s === 'projetado' ? 'Projetado' : 'Realizado'}</Button>)}
        </div>{panel(side)}</>
      : <ResizablePanelGroup direction="horizontal" className="f28-revenue-split">
          <ResizablePanel defaultSize={50} minSize={35} maxSize={65}>{panel('projetado')}</ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={35} maxSize={65}>{panel('realizado')}</ResizablePanel>
        </ResizablePanelGroup>}

    <Financial2028Panel title="Despesas" description={`${list.data?.total ?? 0} registros. Totais consideram todos os filtrados, não só esta página.`}>
      {list.isError ? <ErrorState error={list.error} retry={() => void list.refetch()} />
        : !list.data ? <Financial2028Loading label="Carregando lista…" />
        : list.data.items.length === 0 ? <p className="f28-composition-empty">Nenhuma despesa para os filtros atuais.</p>
        : <div style={{ overflowX: 'auto' }}><table className="f28-ledger-table" style={{ width: '100%' }}>
            <thead><tr><th>Despesa</th><th>Situação</th><th>Projetado</th><th>Realizado</th><th>Desvio</th><th>Pago</th><th>Saldo</th><th>Vencimento</th><th /></tr></thead>
            <tbody>{list.data.items.map((e) => {
              const d = deviation(e.planned_cents, e.status === 'realizada' ? e.committed_cents : null);
              return <tr key={e.id}>
                <td><strong>{e.title}</strong><br /><small>{[e.category_name, e.commission_name, e.payee_name].filter(Boolean).join(' · ') || 'Sem classificação'}</small></td>
                <td>{EXPENSE_STATUS_LABELS[e.status]}</td>
                <td><Money v={e.planned_cents} /></td>
                <td><Money v={e.committed_cents} /></td>
                <td>{d.state === 'comparavel' ? <><Money v={d.cents} /> <small>({d.pct! > 0 ? '+' : ''}{d.pct}%)</small></> : d.state === 'sem_previsao' ? <small>Sem previsão</small> : '—'}</td>
                <td><Money v={e.paid_cents} /></td>
                <td><Money v={e.status === 'realizada' ? e.open_cents : null} /></td>
                <td>{fmtDate(e.due_date)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {e.status !== 'cancelada' && <Button size="sm" variant="ghost" aria-label={`Editar ${e.title}`} onClick={() => setEditing(e)}><Pencil aria-hidden="true" /></Button>}
                  {e.status === 'prevista' && <Button size="sm" variant="ghost" aria-label={`Realizar ${e.title}`} onClick={() => setTransition({ expense: e, to: 'realizada' })}><CheckCircle2 aria-hidden="true" /></Button>}
                  {e.status === 'realizada' && e.planned_cents != null && <Button size="sm" variant="ghost" aria-label={`Voltar ${e.title} para prevista`} onClick={() => setTransition({ expense: e, to: 'prevista' })}><Undo2 aria-hidden="true" /></Button>}
                  {e.status !== 'cancelada' && <Button size="sm" variant="ghost" aria-label={`Cancelar ${e.title}`} onClick={() => setTransition({ expense: e, to: 'cancelada' })}><XCircle aria-hidden="true" /></Button>}
                </td>
              </tr>;
            })}</tbody>
          </table>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <span>Página {page + 1} de {Math.max(1, Math.ceil(list.data.total / EXPENSE_PAGE_SIZE))}</span>
            <Button size="sm" variant="outline" disabled={(page + 1) * EXPENSE_PAGE_SIZE >= list.data.total} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div></div>}
    </Financial2028Panel>

    {editing && <ExpenseFormDialog org={org} edition={edition} value={editing} onClose={() => setEditing(null)}
      categories={categories.data ?? []} commissions={commissions.map((c) => ({ id: c.id, nome: c.nome }))} />}
    {transition && <TransitionDialog org={org} {...transition} onClose={() => setTransition(null)} />}
    {categoriesOpen && <CategoriesDialog org={org} onClose={() => setCategoriesOpen(false)} />}
  </div>;
}

function useStableKey(deps: unknown) {
  // Uma chave por conteúdo enviado: repetir a mesma tentativa reaproveita a chave (sem duplicar);
  // alterar o formulário gera nova chave.
  const ref = useRef<{ sig: string; key: string } | null>(null);
  const sig = JSON.stringify(deps);
  if (!ref.current || ref.current.sig !== sig) ref.current = { sig, key: newKey() };
  return ref.current.key;
}

function ExpenseFormDialog({ org, edition, value, onClose, categories, commissions }: {
  org: string; edition: FinancialEdition; value: FinancialExpense | 'new-prevista' | 'new-realizada'; onClose: () => void;
  categories: Array<{ id: string; name: string }>; commissions: Array<{ id: string; nome: string }>;
}) {
  const existing = typeof value === 'string' ? null : value;
  const status = existing?.status ?? (value === 'new-realizada' ? 'realizada' : 'prevista');
  const [form, setForm] = useState({
    title: existing?.title ?? '', description: existing?.description ?? '', category_id: existing?.category_id ?? '',
    commission_id: existing?.commission_id ?? '', payee_name: existing?.payee_name ?? '',
    planned: centsToInput(existing?.planned_cents ?? null), planned_on: existing?.planned_on ?? '',
    committed: centsToInput(existing?.committed_cents ?? null), committed_on: existing?.committed_on ?? '',
    due_date: existing?.due_date ?? '', notes: existing?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const save = useSaveExpense(org);
  const key = useStableKey(form);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (ev: FormEvent) => {
    ev.preventDefault(); setError(null);
    try {
      const planned = parseCents(form.planned);
      const committed = status === 'realizada' ? parseCents(form.committed) : null;
      const payload = {
        ...(existing ? { id: existing.id } : { edition_id: edition.id, status: status as 'prevista' | 'realizada' }),
        title: form.title, description: form.description || null, category_id: form.category_id || null,
        commission_id: form.commission_id || null, payee_name: form.payee_name || null,
        planned_cents: planned, planned_on: form.planned_on || null, due_date: form.due_date || null, notes: form.notes || null,
        ...(status === 'realizada' ? { committed_cents: committed, committed_on: form.committed_on || null } : {}),
      };
      await save.mutateAsync({ payload, expectedVersion: existing?.version ?? null, requestId: key });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar.'); }
  };

  return <Dialog open onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>{existing ? 'Editar despesa' : status === 'realizada' ? 'Nova despesa realizada' : 'Nova despesa prevista'}</DialogTitle>
        <DialogDescription>Pago e saldo vêm só dos pagamentos registrados.{status === 'realizada' && !existing ? ' Sem previsão anterior: o projetado fica em branco se não for informado.' : ''}</DialogDescription></DialogHeader>
      <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
        <label>Título<Input required minLength={2} maxLength={240} value={form.title} onChange={set('title')} /></label>
        <label>Descrição<Input maxLength={2000} value={form.description} onChange={set('description')} /></label>
        <label>Categoria<select className="f28-select" value={form.category_id} onChange={set('category_id')}>
          <option value="">Sem categoria</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Comissão responsável<select className="f28-select" value={form.commission_id} onChange={set('commission_id')}>
          <option value="">Sem comissão</option>{commissions.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
        <label>Fornecedor / favorecido<Input maxLength={200} value={form.payee_name} onChange={set('payee_name')} /></label>
        <label>Valor projetado (R$){status === 'prevista' ? ' *' : ''}<Input inputMode="decimal" required={status === 'prevista'} value={form.planned} onChange={set('planned')} placeholder="0,00" /></label>
        <label>Data prevista<Input type="date" value={form.planned_on} onChange={set('planned_on')} /></label>
        {status === 'realizada' && <>
          <label>Valor realizado (R$) *<Input inputMode="decimal" required value={form.committed} onChange={set('committed')} placeholder="0,00" /></label>
          <label>Competência / realização *<Input type="date" required value={form.committed_on} onChange={set('committed_on')} /></label>
        </>}
        <label>Vencimento<Input type="date" value={form.due_date} onChange={set('due_date')} /></label>
        <label>Observações<Input maxLength={2000} value={form.notes} onChange={set('notes')} /></label>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function TransitionDialog({ org, expense, to, onClose }: { org: string; expense: FinancialExpense; to: ExpenseStatus; onClose: () => void }) {
  const [committed, setCommitted] = useState(centsToInput(expense.planned_cents));
  const [committedOn, setCommittedOn] = useState(new Date().toISOString().slice(0, 10));
  const [due, setDue] = useState(expense.due_date ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useTransitionExpense(org);
  const key = useStableKey([committed, committedOn, due, reason]);
  const titles = { realizada: 'Realizar despesa', prevista: 'Voltar para prevista', cancelada: 'Cancelar despesa' };
  const submit = async (ev: FormEvent) => {
    ev.preventDefault(); setError(null);
    try {
      const payload = to === 'realizada' ? { committed_cents: parseCents(committed) ?? 0, committed_on: committedOn, due_date: due || null } : {};
      await mutation.mutateAsync({ id: expense.id, to, expectedVersion: expense.version, payload, reason: reason || null, requestId: key });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha.'); }
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}>
    <DialogContent>
      <DialogHeader><DialogTitle>{titles[to as keyof typeof titles]}</DialogTitle><DialogDescription>{expense.title}</DialogDescription></DialogHeader>
      <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
        {to === 'realizada' ? <>
          <p>Projetado: <Money v={expense.planned_cents} /> (preservado)</p>
          <label>Valor realizado (R$) *<Input inputMode="decimal" required value={committed} onChange={(e) => setCommitted(e.target.value)} /></label>
          <label>Competência / realização *<Input type="date" required value={committedOn} onChange={(e) => setCommittedOn(e.target.value)} /></label>
          <label>Vencimento<Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        </> : <label>Motivo *<Input required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Enviando…' : 'Confirmar'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function CategoriesDialog({ org, onClose }: { org: string; onClose: () => void }) {
  const list = useExpenseCategories(org, true);
  const save = useSaveExpenseCategory(org);
  const seed = useSeedExpenseCategories(org);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const addKey = useStableKey(name);
  const sorted = useMemo(() => list.data ?? [], [list.data]);
  const run = async (fn: () => Promise<unknown>) => { setError(null); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Falha.'); } };
  return <Dialog open onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Categorias de despesa</DialogTitle>
        <DialogDescription>Arquivar não apaga nem desvincula despesas antigas. Cor e ícone não afetam cálculos.</DialogDescription></DialogHeader>
      {list.isError ? <ErrorState error={list.error} retry={() => void list.refetch()} /> : <>
        {sorted.length === 0 && <Button type="button" variant="outline" disabled={seed.isPending} onClick={() => run(() => seed.mutateAsync(newKey()))}>Usar nomes de 2026 como sugestão</Button>}
        <ul style={{ display: 'grid', gap: 6 }}>{sorted.map((c) => <li key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', opacity: c.active ? 1 : 0.6 }}>
          <span style={{ flex: 1 }}>{c.name} <small>({c.usage_count} vínculos{c.active ? '' : ' · arquivada'})</small></span>
          <Button size="sm" variant="outline" onClick={() => {
            const next = window.prompt('Novo nome', c.name);
            if (next && next.trim() !== c.name) void run(() => save.mutateAsync({ payload: { id: c.id, name: next.trim() }, expectedVersion: c.version, requestId: newKey() }));
          }}>Renomear</Button>
          <Button size="sm" variant="outline" onClick={() => run(() => save.mutateAsync({ payload: { id: c.id, active: !c.active }, expectedVersion: c.version, requestId: newKey() }))}>{c.active ? 'Arquivar' : 'Reativar'}</Button>
        </li>)}</ul>
        <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); void run(async () => { await save.mutateAsync({ payload: { name }, expectedVersion: null, requestId: addKey }); setName(''); }); }}>
          <Input aria-label="Nova categoria" minLength={2} maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria" />
          <Button type="submit" disabled={save.isPending}>Adicionar</Button>
        </form></>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </DialogContent>
  </Dialog>;
}
