import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Pencil, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrgCommissions } from '@/hooks/useOrgCommissions';
import { FinancialAmount } from '../components/FinancialPrimitives';
import {
  FUNDING_TYPE_LABELS, NEGOTIATION_LABELS, REVENUE_STATUS_LABELS, SPONSOR_TIER_LABELS,
  fetchBudgetLines, fetchBudgets, fetchRevenues, fetchSponsorships,
  type FinancialBudget, type FinancialEdition, type FinancialRevenue, type FinancialSponsorship,
} from './financialOperationalApi';
import { buildBudgetRows, sponsorshipConfirmedCents, sponsorshipMoneyCents, type BudgetExecutionRow } from './financialOperationalMath';
import { BudgetDialog, BudgetLineDialog, RevenueDialog, SponsorshipDialog } from './Financial2028Forms';
import {
  Financial2028Composition, Financial2028Loading, Financial2028Metric,
  Financial2028Panel, Financial2028State,
} from './Financial2028Presentation';
import '@/styles/financial-operational-2028-ledgers.css';

const KEY = ['financial-operational'] as const;
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const matches = (search: string, ...values: Array<string | null | undefined>) => normalize(values.filter(Boolean).join(' ')).includes(normalize(search.trim()));

/** Centavos operacionais são convertidos somente ao entrar na apresentação histórica. */
function Money({ value, fallback = 'Não informado' }: { value: number | null; fallback?: string }) {
  return value == null ? <span className="f28-ledger-unavailable">{fallback}</span> : <FinancialAmount value={value / 100} animate={false} className={value < 0 ? 'f28-ledger-negative' : undefined} />;
}

function DateValue({ value }: { value: string | null }) {
  if (!value) return <>Não informado</>;
  const parts = value.slice(0, 10).split('-');
  return <time dateTime={value}>{parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value}</time>;
}

function Status({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'gold' | 'danger' }) {
  return <span className={`f28-ledger-status f28-ledger-status--${tone}`}>{children}</span>;
}

function useExpansion() {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  return { expanded, toggle };
}

function DetailsButton({ open, onClick, controls, label }: { open: boolean; onClick: () => void; controls: string; label: string }) {
  return <Button type="button" variant="ghost" size="sm" className="f28-ledger-detail-button" onClick={onClick} aria-expanded={open} aria-controls={controls} aria-label={`${open ? 'Recolher' : 'Ver'} detalhes de ${label}`}>
    <span>Detalhes</span><ChevronDown aria-hidden="true" className={open ? 'is-open' : ''} />
  </Button>;
}

function QueryError({ error, retry, retained = false }: { error: unknown; retry: () => void; retained?: boolean }) {
  const denied = error instanceof Error && /permission denied|FINANCIAL_FORBIDDEN|42501/i.test(error.message);
  return <Financial2028State tone={denied ? 'locked' : 'error'} title={denied ? 'Acesso financeiro indisponível' : retained ? 'A atualização falhou. Os dados anteriores permanecem visíveis.' : 'Não foi possível carregar os registros.'} retry={denied ? undefined : retry}>
    {denied ? 'A consulta exige acesso financeiro a esta edição.' : 'Tente carregar novamente para consultar os valores atuais.'}
  </Financial2028State>;
}

function ScopeNote({ count, visible, noun = 'registros' }: { count: number; visible: number; noun?: string }) {
  return <p className="f28-ledger-scope"><strong>{visible} de {count} {noun}</strong> carregados nesta visão. A consulta traz até 500 registros; os indicadores e composições abaixo representam esse recorte. Consulte o Painel Financeiro para os totais consolidados da edição.</p>;
}

function Filters({ search, onSearch, placeholder, children, active, clear, count }: {
  search: string; onSearch: (value: string) => void; placeholder: string; children?: ReactNode; active: boolean; clear: () => void; count: number;
}) {
  return <div className="f28-ledger-filters" aria-label="Filtros dos registros carregados">
    <label className="f28-ledger-search"><span>Pesquisar</span><div><Search aria-hidden="true" /><input type="search" value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} /></div></label>
    {children}
    {active ? <Button type="button" variant="ghost" size="sm" onClick={clear}><X aria-hidden="true" className="h-4 w-4" />Limpar filtros</Button> : null}
    <p className="f28-ledger-result" role="status">{count} resultado{count === 1 ? '' : 's'}</p>
  </div>;
}

function SelectFilter({ label, value, onChange, options, all = 'Todas' }: { label: string; value: string; onChange: (value: string) => void; options: Record<string, string>; all?: string }) {
  return <label className="f28-ledger-filter"><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}><option value="all">{all}</option>{Object.entries(options).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>;
}

function BudgetDetails({ row }: { row: BudgetExecutionRow }) {
  return <div className="f28-ledger-details">
    {row.budget.notes ? <p className="f28-ledger-note"><strong>Observações</strong> {row.budget.notes}</p> : null}
    <div className="f28-ledger-detail-heading"><h3>Linhas de planejamento</h3><p>Somente linhas ativas compõem o valor planejado.</p></div>
    {row.lines.length ? <ul className="f28-budget-lines">{row.lines.map((line) => <li key={line.id}>
      <div><strong>{line.description}</strong><span>{line.kind === 'investimento' ? 'Investimento' : line.kind === 'obrigacao_anterior' ? 'Obrigação de edição anterior' : 'Operacional'}{!line.active ? ' · Inativa' : ''}</span>{line.notes ? <p>{line.notes}</p> : null}</div>
      <Money value={line.planned_cents} />
    </li>)}</ul> : <p className="f28-ledger-note">Este orçamento ainda não tem linhas. Adicione uma linha para compor o planejado.</p>}
  </div>;
}

function BudgetStatus({ row }: { row: BudgetExecutionRow }) {
  return <Status tone={row.balanceCents != null && row.balanceCents < 0 ? 'danger' : 'neutral'}>{row.budget.budget_cap_cents == null ? 'Sem teto' : row.balanceCents != null && row.balanceCents < 0 ? 'Acima do teto' : 'Teto definido'}</Status>;
}

function BudgetUtilization({ row }: { row: BudgetExecutionRow }) {
  return <div className="f28-budget-utilization"><span className="f28-budget-utilization__label">Utilização do teto</span><span>{row.utilizationPercentage == null ? '—' : `${number.format(row.utilizationPercentage)}%`}</span>{row.utilizationPercentage != null ? <span className="f28-budget-track" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, row.utilizationPercentage))}%` }} /></span> : <small>{row.budget.budget_cap_cents == null ? 'Sem teto' : 'Teto zero'}</small>}</div>;
}

export function BudgetsView({ edition }: { edition: FinancialEdition }) {
  const { commissions } = useOrgCommissions();
  const budgets = useQuery({ queryKey: [...KEY, 'budgets', edition.id], queryFn: () => fetchBudgets(edition.id) });
  const lines = useQuery({ queryKey: [...KEY, 'lines', edition.id], queryFn: () => fetchBudgetLines(edition.id) });
  const [editing, setEditing] = useState<FinancialBudget | null | 'new'>(null);
  const [lineFor, setLineFor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { expanded, toggle } = useExpansion();
  const names = useMemo(() => new Map(commissions.map((c) => [c.id, c.nome])), [commissions]);
  const rows = useMemo(() => buildBudgetRows(budgets.data ?? [], lines.data ?? []), [budgets.data, lines.data]);
  const visible = rows.filter((row) => matches(search, names.get(row.budget.commission_id), row.budget.responsible_name, row.budget.notes));
  const used = new Set(rows.map((row) => row.budget.commission_id));
  const retry = () => { void budgets.refetch(); void lines.refetch(); };
  const totalCap = rows.reduce((sum, row) => sum + (row.budget.budget_cap_cents ?? 0), 0);
  const totalPlanned = rows.reduce((sum, row) => sum + row.plannedCents, 0);
  const uncapped = rows.filter((row) => row.budget.budget_cap_cents == null).length;
  if ((budgets.isLoading || lines.isLoading) && (!budgets.data || !lines.data)) return <Financial2028Loading label="Carregando orçamentos…" />;
  if ((budgets.isError && !budgets.data) || (lines.isError && !lines.data)) return <QueryError error={budgets.error ?? lines.error} retry={retry} />;
  return <section className="f28-ledger-stack" aria-label="Orçamento por comissão">
    {(budgets.isError || lines.isError) ? <QueryError error={budgets.error ?? lines.error} retry={retry} retained /> : null}
    <div className="f28-ledger-kpis">
      <Financial2028Metric label="Planejado pelas linhas" value={totalPlanned} hint={`${rows.length} comissões · ${lines.data?.filter((line) => line.active).length ?? 0} linhas ativas`} tone="indigo" priority />
      <Financial2028Metric label="Tetos definidos" value={rows.length > 0 && uncapped === rows.length ? null : totalCap} hint={`${rows.length - uncapped} comissões com teto · ${uncapped} sem teto`} />
      <Financial2028Metric label="Saldo dos tetos definidos" value={rows.length > 0 && uncapped === rows.length ? null : rows.reduce((sum, row) => sum + (row.balanceCents ?? 0), 0)} hint="Teto menos planejado somente nas comissões com teto" tone="gold" />
    </div>
    <div className="f28-ledger-analytics">
      <Financial2028Composition title="Planejamento por comissão" description="Linhas ativas dos orçamentos carregados, sem dados históricos." items={rows.map((row) => ({ label: names.get(row.budget.commission_id) ?? 'Comissão', value: row.plannedCents, tone: 'indigo' }))} />
      <Financial2028Panel title="Leitura do orçamento" description="Identificação e limites da comparação">
        <dl className="f28-ledger-facts"><div><dt>Comissões cadastradas</dt><dd>{rows.length}</dd></div><div><dt>Sem teto definido</dt><dd>{uncapped}</dd></div><div><dt>Planejado acima do teto</dt><dd>{rows.filter((row) => row.balanceCents != null && row.balanceCents < 0).length}</dd></div></dl>
        <p className="f28-ledger-note">Teto vazio permanece “Sem teto”. O planejado é calculado pelas linhas ativas; não representa despesa realizada nem pagamento.</p>
      </Financial2028Panel>
    </div>
    <Financial2028Panel title="Orçamentos das comissões" description="Base completa dos orçamentos e linhas carregados. Expanda uma comissão para ver seu planejamento." actions={<Button className="f28-ledger-primary-action" onClick={() => setEditing('new')}><Plus aria-hidden="true" className="h-4 w-4" />Novo orçamento</Button>}>
      <Filters search={search} onSearch={setSearch} placeholder="Comissão, responsável ou observação" active={Boolean(search)} clear={() => setSearch('')} count={visible.length} />
      {rows.length === 0 ? <Financial2028State tone="info" title="Primeiro orçamento de 2028">Cadastre uma comissão, informe o responsável e detalhe o planejamento em linhas. O teto pode permanecer em aberto.</Financial2028State> : visible.length === 0 ? <Financial2028State tone="info" title="Nenhuma comissão corresponde à pesquisa">Limpe a pesquisa para voltar aos orçamentos cadastrados.</Financial2028State> : <>
        <div className="f28-ledger-table-shell f28-ledger-desktop" role="region" aria-label="Tabela rolável de orçamento por comissão" tabIndex={0}><table className="f28-ledger-table f28-ledger-table--budgets"><caption className="sr-only">Orçamento por comissão de 2028</caption><thead><tr><th scope="col">Comissão / responsável</th><th scope="col" className="f28-ledger-number">Teto</th><th scope="col" className="f28-ledger-number">Planejado</th><th scope="col" className="f28-ledger-number">Saldo</th><th scope="col" className="f28-ledger-number">Utilização</th><th scope="col">Situação</th><th scope="col">Ações</th></tr></thead><tbody>{visible.map((row) => {
          const name = names.get(row.budget.commission_id) ?? 'Comissão';
          return <Fragment key={row.budget.id}><tr><th scope="row"><strong>{name}</strong><small>{row.budget.responsible_name || 'Sem responsável definido'}</small></th><td className="f28-ledger-number"><Money value={row.budget.budget_cap_cents} fallback="Sem teto" /></td><td className="f28-ledger-number f28-ledger-number--primary"><Money value={row.plannedCents} /></td><td className={`f28-ledger-number ${row.balanceCents != null && row.balanceCents < 0 ? 'f28-ledger-negative' : ''}`}><Money value={row.balanceCents} fallback="—" /></td><td className="f28-ledger-number"><BudgetUtilization row={row} /></td><td><BudgetStatus row={row} /></td><td><div className="f28-ledger-actions"><DetailsButton open={expanded.has(row.budget.id)} onClick={() => toggle(row.budget.id)} controls={`budget-detail-${row.budget.id}`} label={name} /><Button variant="outline" size="sm" onClick={() => setLineFor(row.budget.id)} aria-label={`Adicionar linha a ${name}`}><Plus aria-hidden="true" className="h-4 w-4" />Linha</Button><Button variant="ghost" size="sm" onClick={() => setEditing(row.budget)} aria-label={`Editar orçamento de ${name}`}><Pencil aria-hidden="true" className="h-4 w-4" /></Button></div></td></tr>{expanded.has(row.budget.id) ? <tr className="f28-ledger-expanded"><td colSpan={7} id={`budget-detail-${row.budget.id}`}><BudgetDetails row={row} /></td></tr> : null}</Fragment>;
        })}</tbody></table></div>
        <div className="f28-ledger-mobile">{visible.map((row) => {
          const name = names.get(row.budget.commission_id) ?? 'Comissão';
          return <article className="f28-ledger-mobile-record" key={row.budget.id}><header><div><h3>{name}</h3><p>{row.budget.responsible_name || 'Sem responsável definido'}</p></div><BudgetStatus row={row} /></header><dl className="f28-ledger-mobile-values"><div className="f28-ledger-mobile-values__primary"><dt>Planejado · linhas ativas</dt><dd><Money value={row.plannedCents} /></dd></div><div><dt>Teto</dt><dd><Money value={row.budget.budget_cap_cents} fallback="Sem teto" /></dd></div><div><dt>Saldo do teto</dt><dd><Money value={row.balanceCents} fallback="—" /></dd></div></dl><BudgetUtilization row={row} /><footer><DetailsButton open={expanded.has(row.budget.id)} onClick={() => toggle(row.budget.id)} controls={`mobile-budget-detail-${row.budget.id}`} label={name} /><Button variant="outline" size="sm" onClick={() => setLineFor(row.budget.id)}><Plus aria-hidden="true" className="h-4 w-4" />Linha</Button><Button variant="ghost" size="sm" onClick={() => setEditing(row.budget)}><Pencil aria-hidden="true" className="h-4 w-4" />Editar</Button></footer>{expanded.has(row.budget.id) ? <div id={`mobile-budget-detail-${row.budget.id}`}><BudgetDetails row={row} /></div> : null}</article>;
        })}</div>
      </>}
    </Financial2028Panel>
    {editing ? <BudgetDialog key={editing === 'new' ? 'new' : editing.id} edition={edition} budget={editing === 'new' ? null : editing} open onOpenChange={(open) => !open && setEditing(null)} usedCommissionIds={used} /> : null}
    {lineFor ? <BudgetLineDialog key={lineFor} budgetId={lineFor} commissionName={names.get(rows.find((row) => row.budget.id === lineFor)?.budget.commission_id ?? '')} open onOpenChange={(open) => !open && setLineFor(null)} /> : null}
  </section>;
}

function RevenueDetails({ row }: { row: FinancialRevenue }) {
  return <div className="f28-ledger-details"><dl className="f28-ledger-detail-grid"><div><dt>Contraparte</dt><dd>{row.counterparty || 'Não informada'}</dd></div><div><dt>Responsável</dt><dd>{row.responsible_name || 'Não informado'}</dd></div><div><dt>Competência</dt><dd><DateValue value={row.competence_date} /></dd></div><div><dt>Vencimento</dt><dd><DateValue value={row.due_date} /></dd></div></dl>{row.notes ? <p className="f28-ledger-note"><strong>Observações</strong> {row.notes}</p> : null}<p className="f28-ledger-note">O valor confirmado indica compromisso comercial. Esta consulta não fornece recebimento ou saldo a receber por registro.</p></div>;
}

export function RevenuesView({ edition, focus }: { edition: FinancialEdition; focus: 'projetada' | 'confirmada' }) {
  const query = useQuery({ queryKey: [...KEY, 'revenues', edition.id], queryFn: () => fetchRevenues(edition.id) });
  const [editing, setEditing] = useState<FinancialRevenue | null | 'new'>(null);
  const [search, setSearch] = useState('');
  const [funding, setFunding] = useState('all');
  const [status, setStatus] = useState('all');
  const { expanded, toggle } = useExpansion();
  // A seleção financeira original permanece: projetadas inclui confirmadas e exclui canceladas.
  const rows = (query.data ?? []).filter((row) => focus === 'confirmada' ? row.status === 'confirmada' : row.status !== 'cancelada');
  const visible = rows.filter((row) => (funding === 'all' || row.funding_type === funding) && (focus === 'confirmada' || status === 'all' || row.status === status) && matches(search, row.description, row.counterparty, row.responsible_name));
  const confirmedRows = rows.filter((row) => row.status === 'confirmada');
  const confirmed = confirmedRows.some((row) => row.confirmed_cents == null) ? null : confirmedRows.reduce((sum, row) => sum + (row.confirmed_cents ?? 0), 0);
  const projected = rows.reduce((sum, row) => sum + row.projected_cents, 0);
  const clear = () => { setSearch(''); setFunding('all'); setStatus('all'); };
  if (query.isLoading && !query.data) return <Financial2028Loading label="Carregando receitas…" />;
  if (query.isError && !query.data) return <QueryError error={query.error} retry={() => { void query.refetch(); }} />;
  return <section className="f28-ledger-stack" aria-label={focus === 'confirmada' ? 'Receitas confirmadas' : 'Receitas projetadas'}>
    {query.isError ? <QueryError error={query.error} retry={() => { void query.refetch(); }} retained /> : null}
    <ScopeNote count={rows.length} visible={visible.length} noun="receitas" />
    <div className="f28-ledger-kpis"><Financial2028Metric label={focus === 'confirmada' ? 'Confirmado na visão' : 'Projetado na visão'} value={focus === 'confirmada' ? confirmed : projected} hint={`${rows.length} receitas carregadas nesta visão`} tone={focus === 'confirmada' ? 'success' : 'indigo'} priority /><Financial2028Metric label={focus === 'confirmada' ? 'Projeção dos mesmos registros' : 'Confirmado nos registros'} value={focus === 'confirmada' ? projected : confirmed} hint={confirmed == null ? 'Há confirmação sem valor informado' : `${confirmedRows.length} receitas com situação confirmada · não é recebimento`} tone={focus === 'confirmada' ? 'indigo' : 'success'} /><Financial2028Panel title={focus === 'confirmada' ? 'Acompanhamento comercial' : 'Expectativa de recursos'}><p className="f28-ledger-note">{focus === 'confirmada' ? 'Somente receitas com situação Confirmada. Os recebimentos registrados ficam na consolidação do painel.' : 'Receitas projetadas e confirmadas conforme a seleção existente. Canceladas ficam fora desta visão.'}</p><p className="f28-ledger-note">Patrocínios são acompanhados na carteira; as vendas de lotes, na Dashboard Comercial.</p></Financial2028Panel></div>
    {focus === 'confirmada' && confirmed == null ? <Financial2028State tone="info" title="Composição confirmada incompleta">Há receitas confirmadas sem valor informado. A distribuição por origem ficará disponível quando os valores desses registros estiverem preenchidos.</Financial2028State> : <Financial2028Composition title={focus === 'confirmada' ? 'Confirmações por origem' : 'Projeção por origem'} description="Composição do recorte carregado desta visão, antes dos filtros locais." items={Object.entries(FUNDING_TYPE_LABELS).map(([key, label]) => ({ label, value: rows.filter((row) => row.funding_type === key).reduce((sum, row) => sum + (focus === 'confirmada' ? row.confirmed_cents ?? 0 : row.projected_cents), 0), tone: key === 'lei_rouanet' ? 'gold' : 'indigo' }))} />}
    <Financial2028Panel title={focus === 'confirmada' ? 'Receitas com confirmação' : 'Registro das receitas'} description="Valores e situação preservados conforme os cadastros de 2028." actions={<Button className="f28-ledger-primary-action" onClick={() => setEditing('new')}><Plus aria-hidden="true" className="h-4 w-4" />Nova receita</Button>}>
      <Filters search={search} onSearch={setSearch} placeholder="Descrição, contraparte ou responsável" active={Boolean(search) || funding !== 'all' || (focus !== 'confirmada' && status !== 'all')} clear={clear} count={visible.length}><SelectFilter label="Origem do recurso" value={funding} onChange={setFunding} options={FUNDING_TYPE_LABELS} all="Todas as origens" />{focus !== 'confirmada' ? <SelectFilter label="Situação" value={status} onChange={setStatus} options={{ projetada: 'Projetada', confirmada: 'Confirmada' }} all="Todas as situações" /> : null}</Filters>
      {rows.length === 0 ? <Financial2028State tone="info" title={focus === 'confirmada' ? 'Nenhuma receita confirmada nesta visão' : 'Primeiras receitas de 2028'}>{focus === 'confirmada' ? 'Os registros aparecerão após a confirmação comercial no cadastro.' : 'Cadastre a descrição, origem e valores para iniciar o acompanhamento.'}</Financial2028State> : visible.length === 0 ? <Financial2028State tone="info" title="Nenhuma receita corresponde aos filtros">Limpe os filtros para voltar aos registros carregados.</Financial2028State> : <>
        <div className="f28-ledger-table-shell f28-ledger-desktop" role="region" aria-label="Tabela rolável de receitas" tabIndex={0}><table className="f28-ledger-table"><caption className="sr-only">Receitas {focus === 'confirmada' ? 'confirmadas' : 'projetadas'} de 2028</caption><thead><tr><th scope="col">Descrição / contraparte</th><th scope="col">Origem / situação</th><th scope="col" className="f28-ledger-number">Projetado</th><th scope="col" className="f28-ledger-number">Confirmado</th><th scope="col">Vencimento</th><th scope="col">Ações</th></tr></thead><tbody>{visible.map((row) => <Fragment key={row.id}><tr><th scope="row"><strong>{row.description}</strong><small>{row.counterparty || 'Contraparte não informada'}</small></th><td><span className="f28-ledger-secondary">{FUNDING_TYPE_LABELS[row.funding_type]}</span><Status tone={row.status === 'confirmada' ? 'success' : 'neutral'}>{REVENUE_STATUS_LABELS[row.status]}</Status></td><td className={`f28-ledger-number ${focus === 'projetada' ? 'f28-ledger-number--primary' : ''}`}><Money value={row.projected_cents} /></td><td className={`f28-ledger-number ${focus === 'confirmada' ? 'f28-ledger-number--primary' : ''}`}><Money value={row.confirmed_cents} /></td><td><DateValue value={row.due_date} /></td><td><div className="f28-ledger-actions"><DetailsButton open={expanded.has(row.id)} onClick={() => toggle(row.id)} controls={`revenue-detail-${row.id}`} label={row.description} /><Button variant="ghost" size="sm" aria-label={`Editar ${row.description}`} onClick={() => setEditing(row)}><Pencil aria-hidden="true" className="h-4 w-4" /></Button></div></td></tr>{expanded.has(row.id) ? <tr className="f28-ledger-expanded"><td colSpan={6} id={`revenue-detail-${row.id}`}><RevenueDetails row={row} /></td></tr> : null}</Fragment>)}</tbody></table></div>
        <div className="f28-ledger-mobile">{visible.map((row) => <article className="f28-ledger-mobile-record" key={row.id}><header><div><h3>{row.description}</h3><p>{row.counterparty || 'Contraparte não informada'}</p></div><Status tone={row.status === 'confirmada' ? 'success' : 'neutral'}>{REVENUE_STATUS_LABELS[row.status]}</Status></header><p className="f28-ledger-secondary">{FUNDING_TYPE_LABELS[row.funding_type]}</p><dl className="f28-ledger-mobile-values"><div className={focus === 'projetada' ? 'f28-ledger-mobile-values__primary' : ''}><dt>Projetado</dt><dd><Money value={row.projected_cents} /></dd></div><div className={focus === 'confirmada' ? 'f28-ledger-mobile-values__primary' : ''}><dt>Confirmado</dt><dd><Money value={row.confirmed_cents} /></dd></div><div><dt>Vencimento</dt><dd><DateValue value={row.due_date} /></dd></div></dl><footer><DetailsButton open={expanded.has(row.id)} onClick={() => toggle(row.id)} controls={`mobile-revenue-detail-${row.id}`} label={row.description} /><Button variant="outline" size="sm" onClick={() => setEditing(row)}><Pencil aria-hidden="true" className="h-4 w-4" />Editar</Button></footer>{expanded.has(row.id) ? <div id={`mobile-revenue-detail-${row.id}`}><RevenueDetails row={row} /></div> : null}</article>)}</div>
      </>}
    </Financial2028Panel>
    {editing ? <RevenueDialog key={editing === 'new' ? 'new' : editing.id} edition={edition} revenue={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
  </section>;
}

function SponsorDetails({ row }: { row: FinancialSponsorship }) {
  return <div className="f28-ledger-details"><dl className="f28-ledger-detail-grid"><div><dt>Declarado</dt><dd><Money value={row.declared_cents} /></dd></div><div><dt>Responsável</dt><dd>{row.responsible_name || 'Não informado'}</dd></div><div><dt>Projetado · livre</dt><dd><Money value={row.projected_free_cents} /></dd></div><div><dt>Projetado · Rouanet</dt><dd><Money value={row.projected_rouanet_cents} /></dd></div><div><dt>Confirmado · livre</dt><dd><Money value={row.confirmed_free_cents} /></dd></div><div><dt>Confirmado · Rouanet</dt><dd><Money value={row.confirmed_rouanet_cents} /></dd></div></dl><div className="f28-sponsor-in-kind"><h3>Bens ou serviços</h3><p>{row.in_kind_description || 'Nenhuma contrapartida informada.'}</p>{row.in_kind_value_cents != null ? <p>Referência não financeira: <Money value={row.in_kind_value_cents} /></p> : null}<small>Contrapartidas ficam separadas dos valores em dinheiro.</small></div>{row.notes ? <p className="f28-ledger-note"><strong>Observações</strong> {row.notes}</p> : null}<p className="f28-ledger-note">Declarado, projetado e confirmado são etapas do mesmo patrocínio e não se somam. Esta consulta não fornece recebimento por patrocinador.</p></div>;
}

export function SponsorshipsView({ edition }: { edition: FinancialEdition }) {
  const query = useQuery({ queryKey: [...KEY, 'sponsorships', edition.id], queryFn: () => fetchSponsorships(edition.id) });
  const [editing, setEditing] = useState<FinancialSponsorship | null | 'new'>(null);
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('all');
  const [status, setStatus] = useState('all');
  const { expanded, toggle } = useExpansion();
  const rows = query.data ?? [];
  const visible = rows.filter((row) => (tier === 'all' || row.tier === tier) && (status === 'all' || row.negotiation_status === status) && matches(search, row.name, row.responsible_name, row.in_kind_description));
  const projected = rows.reduce((sum, row) => sum + sponsorshipMoneyCents(row), 0);
  const confirmed = rows.reduce((sum, row) => sum + sponsorshipConfirmedCents(row), 0);
  const projectedFree = rows.reduce((sum, row) => sum + row.projected_free_cents, 0);
  const projectedRouanet = rows.reduce((sum, row) => sum + row.projected_rouanet_cents, 0);
  const inKindCount = rows.filter((row) => row.in_kind_description || row.in_kind_value_cents != null).length;
  const clear = () => { setSearch(''); setTier('all'); setStatus('all'); };
  if (query.isLoading && !query.data) return <Financial2028Loading label="Carregando patrocínios…" />;
  if (query.isError && !query.data) return <QueryError error={query.error} retry={() => { void query.refetch(); }} />;
  return <section className="f28-ledger-stack" aria-label="Patrocínios">
    {query.isError ? <QueryError error={query.error} retry={() => { void query.refetch(); }} retained /> : null}
    <ScopeNote count={rows.length} visible={visible.length} noun="patrocínios" />
    <div className="f28-ledger-kpis"><Financial2028Metric label="Projetado em dinheiro" value={projected} hint={`${rows.length} registros carregados · todos os estados da carteira`} tone="indigo" priority /><Financial2028Metric label="Confirmado em dinheiro" value={confirmed} hint="Livre + Rouanet · compromisso, não recebimento" tone="success" /><Financial2028Panel title="Bens e serviços" description="Contrapartidas não financeiras"><p className="f28-ledger-count">{inKindCount}<span> patrocínio{inKindCount === 1 ? '' : 's'} com contrapartida</span></p><p className="f28-ledger-note">Descrições e valores de referência são consultados nos detalhes e ficam fora dos totais em dinheiro.</p></Financial2028Panel></div>
    <div className="f28-ledger-analytics"><Financial2028Composition title="Origem dos recursos projetados" description="Composição monetária do recorte carregado, antes dos filtros locais." items={[{ label: 'Recursos livres', value: projectedFree, tone: 'indigo' }, { label: 'Lei Rouanet', value: projectedRouanet, tone: 'gold' }]} /><Financial2028Composition title="Portfólio por categoria" description="Uma projeção por patrocínio. Categorias com valores registrados na carteira carregada." items={Object.entries(SPONSOR_TIER_LABELS).map(([key, label]) => ({ label, value: rows.filter((row) => row.tier === key).reduce((sum, row) => sum + sponsorshipMoneyCents(row), 0), tone: key === 'grao_de_ouro' || key === 'ouro' ? 'gold' : 'indigo' }))} /></div>
    <Financial2028Panel title="Carteira de patrocínios" description="Categoria, negociação e valores do mesmo registro. Expanda para aprofundar a composição." actions={<Button className="f28-ledger-primary-action" onClick={() => setEditing('new')}><Plus aria-hidden="true" className="h-4 w-4" />Novo patrocínio</Button>}>
      <Filters search={search} onSearch={setSearch} placeholder="Patrocinador, responsável ou contrapartida" active={Boolean(search) || tier !== 'all' || status !== 'all'} clear={clear} count={visible.length}><SelectFilter label="Categoria" value={tier} onChange={setTier} options={SPONSOR_TIER_LABELS} all="Todas as categorias" /><SelectFilter label="Negociação" value={status} onChange={setStatus} options={NEGOTIATION_LABELS} all="Todos os estados" /></Filters>
      {rows.length === 0 ? <Financial2028State tone="info" title="Primeiros patrocínios de 2028">Cadastre os patrocinadores, classifique a negociação e acompanhe os recursos livres, Rouanet e contrapartidas.</Financial2028State> : visible.length === 0 ? <Financial2028State tone="info" title="Nenhum patrocínio corresponde aos filtros">Limpe os filtros para voltar à carteira carregada.</Financial2028State> : <>
        <div className="f28-ledger-table-shell f28-ledger-desktop" role="region" aria-label="Tabela rolável de patrocínios" tabIndex={0}><table className="f28-ledger-table"><caption className="sr-only">Carteira de patrocínios de 2028</caption><thead><tr><th scope="col">Patrocinador</th><th scope="col">Categoria</th><th scope="col" className="f28-ledger-number">Projetado</th><th scope="col" className="f28-ledger-number">Confirmado</th><th scope="col">Negociação</th><th scope="col">Ações</th></tr></thead><tbody>{visible.map((row) => <Fragment key={row.id}><tr><th scope="row"><strong>{row.name}</strong><small>{row.in_kind_description ? 'Com contrapartida em bens / serviços' : row.responsible_name || 'Responsável não informado'}</small></th><td><Status tone={row.tier === 'grao_de_ouro' || row.tier === 'ouro' ? 'gold' : 'neutral'}>{SPONSOR_TIER_LABELS[row.tier]}</Status></td><td className="f28-ledger-number f28-ledger-number--primary"><Money value={sponsorshipMoneyCents(row)} /></td><td className="f28-ledger-number"><Money value={sponsorshipConfirmedCents(row)} /></td><td><Status tone={row.negotiation_status === 'confirmado' ? 'success' : row.negotiation_status === 'cancelado' ? 'danger' : 'neutral'}>{NEGOTIATION_LABELS[row.negotiation_status]}</Status></td><td><div className="f28-ledger-actions"><DetailsButton open={expanded.has(row.id)} onClick={() => toggle(row.id)} controls={`sponsor-detail-${row.id}`} label={row.name} /><Button variant="ghost" size="sm" aria-label={`Editar ${row.name}`} onClick={() => setEditing(row)}><Pencil aria-hidden="true" className="h-4 w-4" /></Button></div></td></tr>{expanded.has(row.id) ? <tr className="f28-ledger-expanded"><td colSpan={6} id={`sponsor-detail-${row.id}`}><SponsorDetails row={row} /></td></tr> : null}</Fragment>)}</tbody></table></div>
        <div className="f28-ledger-mobile">{visible.map((row) => <article className="f28-ledger-mobile-record" key={row.id}><header><div><h3>{row.name}</h3><p>{SPONSOR_TIER_LABELS[row.tier]}</p></div><Status tone={row.negotiation_status === 'confirmado' ? 'success' : row.negotiation_status === 'cancelado' ? 'danger' : 'neutral'}>{NEGOTIATION_LABELS[row.negotiation_status]}</Status></header><dl className="f28-ledger-mobile-values"><div className="f28-ledger-mobile-values__primary"><dt>Projetado · dinheiro</dt><dd><Money value={sponsorshipMoneyCents(row)} /></dd></div><div><dt>Confirmado · dinheiro</dt><dd><Money value={sponsorshipConfirmedCents(row)} /></dd></div></dl>{row.in_kind_description ? <p className="f28-ledger-secondary">Com contrapartida em bens ou serviços</p> : null}<footer><DetailsButton open={expanded.has(row.id)} onClick={() => toggle(row.id)} controls={`mobile-sponsor-detail-${row.id}`} label={row.name} /><Button variant="outline" size="sm" onClick={() => setEditing(row)}><Pencil aria-hidden="true" className="h-4 w-4" />Editar</Button></footer>{expanded.has(row.id) ? <div id={`mobile-sponsor-detail-${row.id}`}><SponsorDetails row={row} /></div> : null}</article>)}</div>
      </>}
    </Financial2028Panel>
    {editing ? <SponsorshipDialog key={editing === 'new' ? 'new' : editing.id} edition={edition} sponsor={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
  </section>;
}
