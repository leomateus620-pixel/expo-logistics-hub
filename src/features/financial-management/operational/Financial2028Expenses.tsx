import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ImperativePanelGroupHandle } from 'react-resizable-panels';
import { ArrowDownLeft, ArrowUpRight, HelpCircle, Plus, RotateCcw, Search, SlidersHorizontal, Tags, X } from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useOrgCommissions } from '@/hooks/useOrgCommissions';
import { formatBRL, formatCompactBRL } from '../utils/financialFormatters';
import type { FinancialEdition } from './financialOperationalApi';
import { EXPENSE_DATE_FIELD_LABELS, EXPENSE_STATUS_LABELS, FinancialExpenseError, type ExpenseDateField, type ExpenseFilters, type ExpenseStatus, type FinancialExpense } from './financialExpensesApi';
import { EXPENSE_PAGE_SIZE, useExpenseCategories, useExpenseComparison, useExpenseList } from './useFinancialExpenses';
import { useFinancialExpenseCapabilities } from './useFinancialExpenseCapabilities';
import { CategoriesDialog, ExpenseDetailDialog, ExpenseFormDialog, TransitionDialog } from './FinancialExpenseDialogs';
import { FinancialExpenseLedger } from './FinancialExpenseLedger';
import { adaptExpenseComparison } from './financialExpenseChartAdapters';
import { FinancialExpenseAnalyses, FinancialExpenseRanking } from './FinancialExpenseCharts';
import { Financial2028Loading, Financial2028State } from './Financial2028Presentation';
import { EXPENSE_SPLIT_KEY, readExpenseSplit } from './financialExpenseLayout';
import '@/styles/financial-expense-comparison.css';

type Side = 'projetado' | 'realizado';
function Help({ label, children }: { label: string; children: React.ReactNode }) {
  return <Popover><PopoverTrigger asChild><button type="button" className="f28-expense-help" aria-label={label}><HelpCircle aria-hidden="true" /></button></PopoverTrigger><PopoverContent className="f28-expense-help-popover" align="end">{children}</PopoverContent></Popover>;
}
const Metric = memo(function Metric({ label, value, state, primary = false, hint, attention = false }: { label: string; value: number | null; state: 'ready' | 'loading' | 'error'; primary?: boolean; hint?: string; attention?: boolean }) {
  const exact = value == null ? null : formatBRL(value / 100);
  return <article className="f28-expense-metric" data-primary={primary || undefined} data-attention={attention || undefined} aria-busy={state === 'loading'}>
    <h3>{label}</h3>
    {state === 'ready' && exact != null ? <Popover><PopoverTrigger asChild><button className="f28-expense-metric__value" aria-label={`${label}: ${exact}. Ver valor exato`}><span className="f28-expense-money-full">{exact}</span><span className="f28-expense-money-compact">{formatCompactBRL(value! / 100)}</span></button></PopoverTrigger><PopoverContent className="f28-expense-value-popover"><strong>{label}</strong><span>{exact}</span></PopoverContent></Popover> : <p className="f28-expense-unavailable">{state === 'loading' ? 'Carregando…' : 'Indisponível'}</p>}
    {hint && <p className="f28-expense-metric__hint">{hint}</p>}
  </article>;
});
export function ExpenseQueryError({ error, retry }: { error: unknown; retry: () => void }) {
  const kind = error instanceof FinancialExpenseError ? error.kind : 'unknown';
  if (kind === 'not_activated') return <Financial2028State tone="locked" title="Despesas 2028 ainda não ativadas no backend" />;
  if (kind === 'forbidden') return <Financial2028State tone="locked" title="Acesso financeiro indisponível">A consulta exige acesso financeiro a esta edição.</Financial2028State>;
  return <Financial2028State tone="error" title={kind === 'network' ? 'Falha de conexão' : 'Não foi possível carregar as despesas.'} retry={retry} />;
}
export function Financial2028Expenses({ edition, focus }: { edition: FinancialEdition; focus: Side }) {
  const { orgId } = useCurrentOrg();
  const org = orgId as string;
  const capabilities = useFinancialExpenseCapabilities(org);
  const [filters, setFilters] = useState<ExpenseFilters>({ date_field: focus === 'projetado' ? 'planned_on' : 'committed_on' });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [side, setSide] = useState(focus);
  const [compact, setCompact] = useState(false);
  const [split] = useState(readExpenseSplit);
  const [editing, setEditing] = useState<FinancialExpense | 'new-prevista' | 'new-realizada' | null>(null);
  const [transition, setTransition] = useState<{ expense: FinancialExpense; to: ExpenseStatus } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const group = useRef<ImperativePanelGroupHandle>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const latestLayout = useRef<number | null>(null);
  const ids = useId();
  useEffect(() => { setSide(focus); }, [focus]);
  useEffect(() => {
    const element = shell.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 840));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const flush = () => {
      clearTimeout(saveTimer.current);
      if (latestLayout.current != null) {
        try { localStorage.setItem(EXPENSE_SPLIT_KEY, String(latestLayout.current)); } catch { /* Optional preference. */ }
      }
    };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, []);
  // Dragging stays in the panel primitive: no query, financial calculation or form remount.
  const persistLayout = useCallback((sizes: number[]) => {
    latestLayout.current = sizes[0];
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(EXPENSE_SPLIT_KEY, String(sizes[0])); } catch { /* Optional preference. */ }
    }, 180);
  }, []);
  const reset = () => group.current?.setLayout([50, 50]);
  const updateFilters = (patch: Partial<ExpenseFilters>) => { setPage(0); setFilters(current => ({ ...current, ...patch })); };
  const clearFilters = () => { setQuery(''); setPage(0); setFilters({ date_field: filters.date_field }); };
  const submitSearch = (event: FormEvent) => { event.preventDefault(); updateFilters({ q: query.trim() }); };
  const comparison = useExpenseComparison(org, edition.id, filters);
  const list = useExpenseList(org, edition.id, filters, page);
  useEffect(() => {
    if (list.data && !list.isPlaceholderData && !list.isError) {
      const lastPage = Math.max(0, Math.ceil(list.data.total / EXPENSE_PAGE_SIZE) - 1);
      if (page > lastPage) setPage(lastPage);
    }
  }, [list.data, list.isPlaceholderData, list.isError, page]);
  const categories = useExpenseCategories(org, true);
  const { commissions } = useOrgCommissions();
  const model = useMemo(() => adaptExpenseComparison(comparison.data, categories.data), [comparison.data, categories.data]);
  const t = comparison.data?.totals;
  const state = comparison.isError ? 'error' : t ? 'ready' : 'loading';
  const filtered = Boolean(filters.q || filters.category_id || filters.commission_id || filters.status || filters.from || filters.to);
  const noCategory = comparison.data?.by_category.find(g => g.id == null);
  const noCommission = comparison.data?.by_commission.find(g => g.id == null);
  const canEdit = capabilities.canEdit && edition.status === 'operacional';
  const canConfirm = canEdit && capabilities.canConfirm;
  // Verify this session before displaying even a retained financial query cache.
  if (!capabilities.canAccess) return <div ref={shell} className="f28-expense-comparison">
    {capabilities.isLoading ? <Financial2028Loading label="Verificando acesso financeiro…" />
      : capabilities.isError ? <Financial2028State tone="error" title="Não foi possível verificar suas permissões" retry={() => void capabilities.refetch()} />
      : <Financial2028State tone="locked" title="Acesso financeiro indisponível">A consulta exige acesso financeiro a esta edição.</Financial2028State>}
  </div>;
  const openTransition = (expense: FinancialExpense, to: ExpenseStatus) => setTransition({ expense, to });
  const filterOverdue = () => {
    const date = new Date(); date.setDate(date.getDate() - 1);
    const yesterday = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    updateFilters({ status: 'realizada', date_field: 'due_date', from: '', to: yesterday });
    document.getElementById(`${ids}-ledger`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const panel = (which: Side) => {
    const projected = which === 'projetado';
    const Icon = projected ? ArrowUpRight : ArrowDownLeft;
    return <section className="f28-expense-side" data-expense-panel={which} aria-labelledby={`${ids}-${which}-heading`}>
      <header className="f28-expense-side__header"><span><Icon aria-hidden="true" /><h2 id={`${ids}-${which}-heading`}>{projected ? 'Despesas projetadas' : 'Despesas realizadas'}</h2></span><small>{projected ? 'Planejamento' : 'Compromissos'}</small></header>
      <button type="button" className="f28-expense-add" disabled={projected ? !canEdit : !canConfirm} onClick={() => setEditing(projected ? 'new-prevista' : 'new-realizada')}><span className="f28-expense-add__icon"><Plus aria-hidden="true" /></span><span><strong>{projected ? 'Adicionar despesa projetada' : 'Adicionar despesa realizada'}</strong><small>{capabilities.isLoading ? 'Verificando permissões…' : (projected ? canEdit : canConfirm) ? projected ? 'Cadastrar uma previsão' : 'Cadastro direto · pagamento separado' : 'Ação indisponível para sua sessão'}</small></span></button>
      <Metric primary label={projected ? 'Total projetado' : 'Total realizado'} value={t ? projected ? t.planned_cents : t.committed_cents : null} state={state} hint={projected ? 'Inclui previsões preservadas · exclui canceladas' : 'Compromissos realizados · independente do pagamento'} />
      {projected ? <>
        {(noCategory || noCommission) && <div className="f28-expense-secondary"><>{noCategory && <Metric label="Sem categoria" value={noCategory.planned_cents} state={state} />}{noCommission && <Metric label="Sem comissão" value={noCommission.planned_cents} state={state} />}</></div>}
      </> : <>
        <div className="f28-expense-secondary"><Metric label="Pago líquido" value={t?.paid_cents ?? null} state={state} /><Metric label="Saldo a pagar" value={t?.open_cents ?? null} state={state} /><Metric label="Desvio" value={t?.deviation_cents ?? null} state={state} attention={Boolean(t && t.deviation_cents > 0)} hint={t ? t.deviation_pct == null ? 'Sem previsão · percentual indisponível' : `${t.deviation_pct > 0 ? '+' : ''}${t.deviation_pct.toLocaleString('pt-BR')}% sobre o projetado` : undefined} /></div>
        {t && (t.overdue_count > 0 || t.realized_without_plan_count > 0) && <aside className="f28-expense-alerts" aria-label="Atenção às despesas realizadas">{t.overdue_count > 0 && <button type="button" onClick={filterOverdue}>{t.overdue_count} vencida(s) em aberto <strong>{formatBRL(t.overdue_cents / 100)}</strong><small>Consultar por vencimento · inclui quitadas</small></button>}{t.realized_without_plan_count > 0 && <span>{t.realized_without_plan_count} realizada(s) <strong>Sem previsão</strong></span>}</aside>}
      </>}
      <FinancialExpenseRanking model={state === 'error' ? null : model} side={which} dimension="category" loading={state === 'loading'} error={state === 'error'} filtered={filtered} />
      <FinancialExpenseRanking model={state === 'error' ? null : model} side={which} dimension="commission" loading={state === 'loading'} error={state === 'error'} filtered={filtered} />
    </section>;
  };
  return <div ref={shell} className="f28-expense-comparison" data-expense-focus={focus} data-active-side={side} data-compact={compact || undefined}>
    <div className="f28-expense-toolbar">
      <form className="f28-expense-search" onSubmit={submitSearch}><Search aria-hidden="true" /><input type="search" aria-label="Buscar despesa" placeholder="Título ou favorecido" value={query} onChange={e => setQuery(e.target.value)} />{query && <button type="button" aria-label="Limpar busca" onClick={() => { setQuery(''); updateFilters({ q: '' }); }}><X aria-hidden="true" /></button>}<button type="submit">Buscar</button></form>
      <select aria-label="Categoria" value={filters.category_id ?? ''} onChange={e => updateFilters({ category_id: e.target.value })}><option value="">Todas as categorias</option><option value="none">Sem categoria</option>{categories.data?.map(c => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' · arquivada'}</option>)}</select>
      <select aria-label="Comissão" value={filters.commission_id ?? ''} onChange={e => updateFilters({ commission_id: e.target.value })}><option value="">Todas as comissões</option><option value="none">Sem comissão</option>{commissions.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
      <details className="f28-expense-filters"><summary><SlidersHorizontal aria-hidden="true" />Mais filtros{filters.status || filters.from || filters.to ? ' · ativos' : ''}</summary><div>
        <label>Situação<select value={filters.status ?? ''} onChange={e => updateFilters({ status: e.target.value as ExpenseStatus | '' })}><option value="">Todas as situações</option>{(Object.keys(EXPENSE_STATUS_LABELS) as ExpenseStatus[]).map(s => <option key={s} value={s}>{EXPENSE_STATUS_LABELS[s]}</option>)}</select></label>
        <label>Data do período<select value={filters.date_field} onChange={e => updateFilters({ date_field: e.target.value as ExpenseDateField })}>{(Object.keys(EXPENSE_DATE_FIELD_LABELS) as ExpenseDateField[]).map(k => <option key={k} value={k}>{EXPENSE_DATE_FIELD_LABELS[k]}</option>)}</select></label>
        <label>De<input type="date" value={filters.from ?? ''} max={filters.to || undefined} onChange={e => updateFilters({ from: e.target.value })} /></label><label>Até<input type="date" value={filters.to ?? ''} min={filters.from || undefined} onChange={e => updateFilters({ to: e.target.value })} /></label>
      </div></details>
      {capabilities.canAdmin && <button type="button" className="f28-expense-control" onClick={() => setCategoriesOpen(true)}><Tags aria-hidden="true" />Categorias</button>}
    </div>
    <div className="f28-expense-scope"><p role="status">{t && state === 'ready' ? `${t.count} despesas no recorte` : state === 'error' ? 'Consulta indisponível' : 'Consultando despesas…'} · Período por {EXPENSE_DATE_FIELD_LABELS[filters.date_field ?? 'planned_on'].toLocaleLowerCase('pt-BR')}{filters.from || filters.to ? ` · ${filters.from || 'início'} a ${filters.to || 'sem limite final'}` : ''}</p><div>{filtered && <button type="button" className="f28-expense-control" onClick={clearFilters}>Limpar filtros</button>}<button type="button" className="f28-expense-control f28-expense-reset" onClick={reset}><RotateCcw aria-hidden="true" />Restaurar 50/50</button><Help label="Como comparar despesas"><strong>Planejamento e execução</strong><p>Projetado e realizado pertencem à mesma despesa. A previsão continua no total após realizar. Realizado é compromisso; pago é liquidação.</p><p>Desvio = realizado − projetado. Valores negativos também podem representar previsões ainda não realizadas. Sem previsão não há percentual comparável.</p><p>Indicadores e gráficos consideram todo o recorte do servidor; a paginação altera apenas a lista. Pagamentos incluem os movimentos das despesas filtradas.</p><p>Arraste o divisor ou use as setas do teclado. Enter, duplo clique e o botão restauram 50/50. Em áreas estreitas, use as abas.</p></Help></div></div>
    {comparison.isError && <ExpenseQueryError error={comparison.error} retry={() => void comparison.refetch()} />}
    {categories.isError && <ExpenseQueryError error={categories.error} retry={() => void categories.refetch()} />}
    <div className="f28-expense-tabs" role="tablist" aria-label="Comparar despesas">{(['projetado', 'realizado'] as const).map(s => <button key={s} type="button" role="tab" id={`${ids}-tab-${s}`} aria-selected={side === s} aria-controls={`${ids}-panel-${s}`} tabIndex={side === s ? 0 : -1} onClick={() => setSide(s)} onKeyDown={event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'projetado' : event.key === 'End' ? 'realizado' : s === 'projetado' ? 'realizado' : 'projetado'; setSide(next); document.getElementById(`${ids}-tab-${next}`)?.focus(); }
    }}>{s === 'projetado' ? 'Projetado' : 'Realizado'}</button>)}</div>
    <ResizablePanelGroup ref={group} direction="horizontal" className="f28-expense-split" onLayout={persistLayout}>
      <ResizablePanel id="projected-expense" order={1} defaultSize={split} minSize={35} maxSize={65} className="f28-expense-resizable" data-side="projetado"><div id={`${ids}-panel-projetado`} role={compact ? 'tabpanel' : undefined} aria-labelledby={compact ? `${ids}-tab-projetado` : undefined}>{panel('projetado')}</div></ResizablePanel>
      <ResizableHandle disabled={compact} tabIndex={compact ? -1 : 0} className="f28-expense-divider" aria-label="Ajustar comparação de despesas" withHandle onDoubleClick={reset} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); reset(); } }} />
      <ResizablePanel id="committed-expense" order={2} defaultSize={100 - split} minSize={35} maxSize={65} className="f28-expense-resizable" data-side="realizado"><div id={`${ids}-panel-realizado`} role={compact ? 'tabpanel' : undefined} aria-labelledby={compact ? `${ids}-tab-realizado` : undefined}>{panel('realizado')}</div></ResizablePanel>
    </ResizablePanelGroup>
    <FinancialExpenseAnalyses model={state === 'error' ? null : model} loading={state === 'loading'} error={state === 'error'} filtered={filtered} />
    <section id={`${ids}-ledger`} className="f28-expense-ledger-section" aria-labelledby={`${ids}-ledger-heading`}><header><div><h2 id={`${ids}-ledger-heading`}>Registros de despesas</h2><p>Projetado e realizado no mesmo registro · totais independentes da página</p></div>{list.isFetching && <span role="status">Atualizando…</span>}</header>
      {list.isError ? <ExpenseQueryError error={list.error} retry={() => void list.refetch()} /> : !list.data || list.isPlaceholderData ? <Financial2028Loading label="Carregando registros do recorte…" /> : list.data.items.length === 0 ? <Financial2028State tone="info" title={filtered ? 'Nenhuma despesa para estes filtros' : 'Nenhuma despesa cadastrada'}>{filtered ? 'Ajuste ou limpe os filtros para consultar outros registros.' : 'Cadastre uma previsão ou um compromisso realizado para iniciar a comparação.'}</Financial2028State> : <FinancialExpenseLedger data={list.data} page={page} onPage={setPage} capabilities={capabilities} readOnly={edition.status !== 'operacional'} onDetail={setDetailId} onEdit={setEditing} onTransition={openTransition} />}
    </section>
    {editing && <ExpenseFormDialog org={org} edition={edition} value={editing} capabilities={capabilities} onClose={() => setEditing(null)} categories={categories.data ?? []} commissions={commissions.map(c => ({ id: c.id, nome: c.nome }))} />}
    {transition && <TransitionDialog org={org} {...transition} capabilities={capabilities} onClose={() => setTransition(null)} />}
    {categoriesOpen && <CategoriesDialog org={org} capabilities={capabilities} onClose={() => setCategoriesOpen(false)} />}
    {detailId && <ExpenseDetailDialog org={org} expenseId={detailId} capabilities={capabilities} onClose={() => setDetailId(null)} onEdit={canEdit ? expense => { setDetailId(null); setEditing(expense); } : undefined} onTransition={canEdit ? (expense, to) => { setDetailId(null); openTransition(expense, to); } : undefined} />}
  </div>;
}
