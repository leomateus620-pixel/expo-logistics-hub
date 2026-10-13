import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ImperativePanelGroupHandle } from 'react-resizable-panels';
import { ArrowDownLeft, ArrowUpRight, HelpCircle, Plus, RotateCcw } from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { formatBRL } from '../utils/financialFormatters';
import {
  fetchEditionSummary, fetchReceivableSettlements, fetchRevenues, fetchSponsorships,
  type FinancialEdition, type FinancialRevenue,
} from './financialOperationalApi';
import { RevenueDialog } from './Financial2028Forms';
import { RevenueLedger, type RevenueReceivedState } from './Financial2028Ledgers';
import { Financial2028Loading, Financial2028Panel, Financial2028State } from './Financial2028Presentation';
import { FinancialRevenueRanking, RevenueMoney } from './FinancialRevenueRanking';
import { buildProjectedSide, buildRealizedSide, sharedScale, type RevenueCategoryItem, type RevenueScale } from './revenueComparisonModel';
import '@/styles/financial-revenue-comparison.css';

type RevenueSide = 'projetado' | 'realizado';
type MetricState = 'ready' | 'loading' | 'error' | 'none';
const KEY = ['financial-operational'] as const;
const SPLIT_KEY = 'financial-revenue-split-2028';
const initialSplit = (): number => {
  try {
    const saved = Number(localStorage.getItem(SPLIT_KEY));
    return saved >= 35 && saved <= 65 ? saved : 50;
  } catch { return 50; }
};
const stateOf = (query: UseQueryResult<unknown>, ready: boolean): MetricState => ready ? 'ready' : query.isError ? 'error' : 'loading';
const UNAVAILABLE: Record<Exclude<MetricState, 'ready'>, string> = { loading: 'Carregando…', error: 'Indisponível', none: 'Sem fonte financeira' };

const RevenueMetric = memo(function RevenueMetric({ label, value, hint, state, badge, primary = false }: {
  label: string; value: number | null; hint: ReactNode; state: MetricState; badge?: string; primary?: boolean;
}) {
  const ready = state === 'ready' && value != null && Number.isFinite(value);
  return <article className={`f28-revenue-metric${primary ? ' f28-revenue-metric--primary' : ''}`} aria-busy={state === 'loading'} data-state={ready ? 'ready' : state}>
    <header><h3>{label}</h3>{badge && ready ? <span className="f28-revenue-badge">{badge}</span> : null}</header>
    {ready ? <RevenueMoney label={label} cents={value!} /> : <p className="f28-revenue-metric__unavailable">{UNAVAILABLE[state === 'ready' ? 'error' : state]}</p>}
    <p className="f28-revenue-metric__hint">{hint}</p>
  </article>;
});

function QueryNotice({ queries }: { queries: Array<UseQueryResult<unknown>> }) {
  const failed = queries.filter((query) => query.isError);
  if (failed.length === 0) return null;
  const denied = failed.some(({ error }) => error instanceof Error && /permission denied|FINANCIAL_FORBIDDEN|42501|permissão|acesso financeiro/i.test(error.message));
  const retained = failed.every((query) => query.data !== undefined);
  return <Financial2028State tone={denied ? 'locked' : 'error'} title={denied ? 'Acesso financeiro indisponível' : retained ? 'A atualização falhou. Últimos dados consultados em exibição.' : 'Não foi possível carregar os valores.'} retry={denied ? undefined : () => failed.forEach((query) => void query.refetch())}>
    {denied ? 'Esta consulta exige acesso financeiro à edição.' : 'Os indicadores afetados aparecem como indisponíveis até uma consulta bem-sucedida.'}
  </Financial2028State>;
}

function RankingPanel({ items, total, scale, state, complete, side, footnote }: {
  items: readonly RevenueCategoryItem[] | null; total: number; scale: RevenueScale; state: MetricState; complete: boolean; side: RevenueSide; footnote?: string;
}) {
  const scopeLabel = side === 'projetado' ? 'no projetado' : 'no realizado';
  return <Financial2028Panel title="Receitas por categoria" description={items ? `Base ${formatBRL(total / 100)} · escala comum aos dois lados` : undefined}
    actions={items && !complete ? <span className="f28-revenue-badge">Recorte carregado</span> : undefined}>
    {items ? <FinancialRevenueRanking items={items} total={total} scale={scale} scopeLabel={scopeLabel} />
      : state === 'error' ? <p className="f28-revenue-unavailable">Ranking indisponível até carregar os registros.</p>
        : <Financial2028Loading label="Carregando composição…" />}
    {items && footnote ? <p className="f28-revenue-footnote">{footnote}</p> : null}
  </Financial2028Panel>;
}

export function Financial2028RevenueComparison({ edition, focus }: { edition: FinancialEdition; focus: RevenueSide }) {
  const { orgId } = useCurrentOrg();
  const summary = useQuery({ queryKey: [...KEY, 'summary', edition.id], queryFn: () => fetchEditionSummary(orgId as string, edition.id), enabled: Boolean(orgId) });
  const revenues = useQuery({ queryKey: [...KEY, 'revenues', edition.id], queryFn: () => fetchRevenues(edition.id) });
  const sponsorships = useQuery({ queryKey: [...KEY, 'sponsorships', edition.id], queryFn: () => fetchSponsorships(edition.id) });
  const receivables = useQuery({ queryKey: [...KEY, 'receivables', edition.id], queryFn: () => fetchReceivableSettlements(edition.id) });
  const [active, setActive] = useState(focus);
  const [editing, setEditing] = useState<FinancialRevenue | 'new' | null>(null);
  const [compact, setCompact] = useState(false);
  const [split] = useState(initialSplit);
  const shell = useRef<HTMLDivElement>(null);
  const group = useRef<ImperativePanelGroupHandle>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const ids = useId();
  useEffect(() => { setActive(focus); }, [focus]);
  useEffect(() => {
    const element = shell.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 840));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => clearTimeout(saveTimer.current), []);
  // The panel primitive owns drag state; nothing below re-renders or refetches while dragging.
  const persistLayout = useCallback((sizes: number[]) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(SPLIT_KEY, String(sizes[0])); } catch { /* Local preference is optional. */ }
    }, 180);
  }, []);
  const reset = () => group.current?.setLayout([50, 50]);

  const s = summary.data ?? null;
  const projection = useMemo(() => revenues.data && sponsorships.data ? buildProjectedSide(revenues.data, sponsorships.data, s) : null, [revenues.data, sponsorships.data, s]);
  const realization = useMemo(() => receivables.data && revenues.data && sponsorships.data ? buildRealizedSide(receivables.data, revenues.data, sponsorships.data, s) : null, [receivables.data, revenues.data, sponsorships.data, s]);
  const scale = useMemo(() => sharedScale(projection?.items ?? null, realization?.items ?? null), [projection, realization]);
  const received = useMemo<RevenueReceivedState>(() => realization ? { byRevenue: realization.receivedByRevenue, complete: realization.complete } : receivables.isError || revenues.isError || sponsorships.isError ? 'error' : 'loading', [realization, receivables.isError, revenues.isError, sponsorships.isError]);
  // Same server-only compatibility used by the executive dashboard. Never add list values.
  const projected = s ? s.revenues?.projected_cents ?? s.revenue.projected_cents + s.sponsorship.projected_cents : null;
  const receivedTotal = s ? s.revenues?.received_cents ?? s.obligations.received_cents : null;
  const confirmed = s ? s.revenues?.confirmed_cents ?? s.revenue.confirmed_cents + s.sponsorship.confirmed_cents : null;
  const summaryState = s ? 'ready' : summary.isError ? 'error' : 'loading';
  const listsState = revenues.isError || sponsorships.isError ? 'error' : 'loading';
  const projectionState = projection ? 'ready' : listsState;
  const realizationState = realization ? 'ready' : receivables.isError ? 'error' : listsState;
  const missingConfirmed = useMemo(() => (revenues.data ?? []).filter((row) => row.status === 'confirmada' && row.confirmed_cents == null).length, [revenues.data]);
  const edit = useCallback((row: FinancialRevenue) => setEditing(row), []);

  const panel = (side: RevenueSide) => {
    const isProjected = side === 'projetado';
    const Icon = isProjected ? ArrowUpRight : ArrowDownLeft;
    return <section className="f28-revenue-side" data-revenue-panel={side} aria-labelledby={`${ids}-${side}-heading`}>
      <header className="f28-revenue-side__header"><span><Icon aria-hidden="true" /><h2 id={`${ids}-${side}-heading`}>{isProjected ? 'Receitas projetadas' : 'Receitas realizadas'}</h2></span><small>{isProjected ? 'Expectativa' : 'Recebimentos'}</small></header>
      <button type="button" className="f28-revenue-add" onClick={() => setEditing('new')}>
        <span className="f28-revenue-add__icon"><Plus aria-hidden="true" /></span>
        <span><strong>{isProjected ? 'Adicionar receita projetada' : 'Registrar receita'}</strong><small>{isProjected ? 'Cadastro de receita' : 'Cadastro de compromisso · não registra recebimento'}</small></span>
      </button>
      <div className="f28-revenue-indicators">
        {isProjected ? <>
          <RevenueMetric primary label="Total projetado" value={projected} state={summaryState} hint="Receitas cadastradas e patrocínios · edição completa" />
          <div className="f28-revenue-indicators__pair">
            <RevenueMetric label="Comercialização projetada" value={null} state="none" hint="Projeção de vendas fica na Dashboard Comercial" />
            <RevenueMetric label="Rouanet projetado" value={projection?.rouanet ?? null} state={projectionState} badge={projection && !projection.complete ? 'Recorte' : undefined} hint="Origem Lei Rouanet + cota Rouanet dos patrocínios" />
          </div>
        </> : <>
          <RevenueMetric primary label="Total realizado" value={receivedTotal} state={summaryState} hint="Recebimentos líquidos registrados · edição completa" />
          <div className="f28-revenue-indicators__pair">
            <RevenueMetric label="Comercialização realizada" value={realization?.commercial ?? null} state={realizationState} badge={realization && !realization.complete ? 'Recorte' : undefined} hint="Parcelas comerciais vinculadas ao Financeiro" />
            <RevenueMetric label="Rouanet realizado" value={realization?.rouanet ?? null} state={realizationState} badge={realization ? realization.rouanetUnattributed > 0 ? 'Parcial' : !realization.complete ? 'Recorte' : undefined : undefined}
              hint={realization && realization.rouanetUnattributed > 0 ? <>{formatBRL(realization.rouanetUnattributed / 100)} recebidos sem origem discriminada</> : 'Origem Lei Rouanet + patrocínios só Rouanet'} />
          </div>
        </>}
      </div>
      {isProjected
        ? <RankingPanel side={side} items={projection?.items ?? null} total={projection?.total ?? 0} scale={scale} state={projectionState} complete={projection?.complete ?? true} footnote="Comercialização e recebimentos avulsos não têm projeção na fonte financeira." />
        : <RankingPanel side={side} items={realization?.items ?? null} total={realization?.total ?? 0} scale={scale} state={realizationState} complete={realization?.complete ?? true} footnote={realization && realization.items.some((item) => item.key === 'patrocinios' && item.value > 0) ? 'Patrocínios recebidos não são repartidos entre recurso livre e Rouanet.' : undefined} />}
      <Financial2028Panel title={isProjected ? 'Registro das receitas' : 'Compromissos confirmados'} description={isProjected ? undefined : 'Confirmação comercial · independente do recebimento'}>
        {!isProjected && <p className="f28-revenue-commitment"><span>Confirmado na edição</span><strong>{confirmed == null || !Number.isFinite(confirmed) ? summaryState === 'loading' ? 'Carregando…' : 'Indisponível' : formatBRL(confirmed / 100)}</strong><small>Receitas e patrocínios · não somar ao recebido</small></p>}
        {!isProjected && missingConfirmed > 0 && <p className="f28-revenue-scope">{missingConfirmed} compromisso(s) do recorte sem valor confirmado informado.</p>}
        {revenues.data ? <RevenueLedger data={revenues.data} focus={isProjected ? 'projetada' : 'confirmada'} onEdit={edit} received={isProjected ? undefined : received} />
          : revenues.isError ? <p className="f28-revenue-unavailable">Registros indisponíveis.</p> : <Financial2028Loading label="Carregando receitas…" />}
      </Financial2028Panel>
    </section>;
  };

  return <div className="f28-revenue-comparison" ref={shell} data-active-side={active} data-compact={compact || undefined}>
    <div className="f28-revenue-toolbar">
      <span className="f28-revenue-toolbar__scope">Projeção × recebimento{focus === 'realizado' ? <small> · Entrada de compromissos confirmados</small> : null}</span>
      <div className="f28-revenue-toolbar__actions">
        <button type="button" className="f28-revenue-reset" onClick={reset}><RotateCcw aria-hidden="true" />Restaurar divisão</button>
        <Popover><PopoverTrigger asChild><button type="button" className="f28-revenue-help" aria-label="Ajuda sobre fontes e comparação de receitas"><HelpCircle aria-hidden="true" /></button></PopoverTrigger><PopoverContent className="f28-revenue-help-popover" align="end">
          <strong>Como ler esta comparação</strong>
          <p>Os totais vêm da consolidação do servidor. O projetado inclui receitas cadastradas e patrocínios; o realizado usa apenas recebimentos líquidos alocados às obrigações, nunca confirmações.</p>
          <p>Comercialização e Rouanet são recortes de natureza e de origem, respectivamente: podem se sobrepor e não devem ser somados entre si. Patrocínios com cota livre e Rouanet não são repartidos no realizado.</p>
          <p>As listas carregam até 500 receitas e 500 patrocínios. “Recorte carregado” aparece quando elas não cobrem toda a edição. As vendas de lotes continuam na Dashboard Comercial e não são somadas aqui.</p>
          <p>Arraste o divisor ou use as setas do teclado. Enter, duplo clique ou “Restaurar divisão” retornam a 50/50.</p>
        </PopoverContent></Popover>
      </div>
    </div>
    <div className="f28-revenue-tabs" role="tablist" aria-label="Comparar receitas">{(['projetado', 'realizado'] as const).map((side) => <button key={side} type="button" role="tab" id={`${ids}-tab-${side}`} aria-selected={active === side} aria-controls={`${ids}-panel-${side}`} tabIndex={active === side ? 0 : -1} onClick={() => setActive(side)} onKeyDown={(event) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 'projetado' : event.key === 'End' ? 'realizado' : side === 'projetado' ? 'realizado' : 'projetado';
        setActive(next); document.getElementById(`${ids}-tab-${next}`)?.focus();
      }
    }}>{side === 'projetado' ? 'Projetado' : 'Realizado'}</button>)}</div>
    <QueryNotice queries={[summary, revenues, sponsorships, receivables]} />
    {s?.obligations.inconsistent_count ? <Financial2028State tone="error" title={`${s.obligations.inconsistent_count} registro(s) cancelado(s) com valor liquidado`}>A consolidação preserva o recebido. Os registros exigem estorno ou devolução.</Financial2028State> : null}
    <ResizablePanelGroup ref={group} direction="horizontal" className="f28-revenue-split" onLayout={persistLayout}>
      <ResizablePanel id="projected-revenue" order={1} defaultSize={split} minSize={35} maxSize={65} className="f28-revenue-resizable" data-side="projetado"><div id={`${ids}-panel-projetado`} role={compact ? 'tabpanel' : undefined} aria-labelledby={compact ? `${ids}-tab-projetado` : undefined}>{panel('projetado')}</div></ResizablePanel>
      <ResizableHandle disabled={compact} tabIndex={compact ? -1 : 0} aria-label="Ajustar comparação entre projetado e realizado" className="f28-revenue-divider" withHandle onDoubleClick={reset} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); reset(); } }} />
      <ResizablePanel id="received-revenue" order={2} defaultSize={100 - split} minSize={35} maxSize={65} className="f28-revenue-resizable" data-side="realizado"><div id={`${ids}-panel-realizado`} role={compact ? 'tabpanel' : undefined} aria-labelledby={compact ? `${ids}-tab-realizado` : undefined}>{panel('realizado')}</div></ResizablePanel>
    </ResizablePanelGroup>
    {editing ? <RevenueDialog key={editing === 'new' ? 'new' : editing.id} edition={edition} revenue={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
  </div>;
}
