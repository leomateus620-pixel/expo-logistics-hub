import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ImperativePanelGroupHandle } from 'react-resizable-panels';
import { ArrowDownLeft, ArrowUpRight, HelpCircle, Plus, RotateCcw } from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { formatBRL, formatCompactBRL } from '../utils/financialFormatters';
import { FUNDING_TYPE_LABELS, fetchEditionSummary, fetchRevenues, type FinancialEdition, type FinancialRevenue } from './financialOperationalApi';
import { RevenueDialog } from './Financial2028Forms';
import { RevenueLedger } from './Financial2028Ledgers';
import { Financial2028Loading, Financial2028Panel, Financial2028State } from './Financial2028Presentation';
import { FinancialRevenueRanking } from './FinancialRevenueRanking';
import '@/styles/financial-revenue-comparison.css';

type RevenueSide = 'projetado' | 'realizado';
const SPLIT_KEY = 'financial-revenue-split-2028';
const EMPTY_REVENUES: readonly FinancialRevenue[] = [];
const initialSplit = (): number => {
  try {
    const saved = Number(localStorage.getItem(SPLIT_KEY));
    return saved >= 35 && saved <= 65 ? saved : 50;
  } catch { return 50; }
};

const RevenueMetric = memo(function RevenueMetric({ label, value, hint, state = 'ready', primary = false }: {
  label: string; value: number | null; hint: string; state?: 'ready' | 'loading' | 'error'; primary?: boolean;
}) {
  const exact = value == null || !Number.isFinite(value) ? null : formatBRL(value / 100);
  return <article className={`f28-revenue-metric${primary ? ' f28-revenue-metric--primary' : ''}`} aria-busy={state === 'loading'}>
    <h3>{label}</h3>
    {exact != null && state === 'ready' ? <Popover><PopoverTrigger asChild><button className="f28-revenue-metric__value" data-negative={value! < 0 || undefined} aria-label={`${label}: ${exact}. Ver valor exato`}>
      <span className="f28-revenue-money-full">{exact}</span><span className="f28-revenue-money-compact">{formatCompactBRL(value! / 100)}</span>
    </button></PopoverTrigger><PopoverContent className="f28-revenue-value-popover"><strong>{label}</strong><span>{exact}</span></PopoverContent></Popover> : <p className="f28-revenue-metric__unavailable">{state === 'loading' ? 'Carregando…' : state === 'error' ? 'Indisponível' : 'Não disponível'}</p>}
    <p className="f28-revenue-metric__hint">{hint}</p>
  </article>;
});

function QueryNotice({ error, retry, retained }: { error: unknown; retry: () => void; retained: boolean }) {
  const denied = error instanceof Error && /permission denied|FINANCIAL_FORBIDDEN|42501|permissão|acesso financeiro/i.test(error.message);
  return <Financial2028State tone={denied ? 'locked' : 'error'} title={denied ? 'Acesso financeiro indisponível' : retained ? 'A atualização falhou. Últimos dados consultados em exibição.' : 'Não foi possível carregar os valores.'} retry={denied ? undefined : retry}>
    {denied ? 'Esta consulta exige acesso financeiro à edição.' : 'Os valores só estarão atualizados após uma consulta bem-sucedida.'}
  </Financial2028State>;
}

export function Financial2028RevenueComparison({ edition, focus }: { edition: FinancialEdition; focus: RevenueSide }) {
  const { orgId } = useCurrentOrg();
  const summary = useQuery({ queryKey: ['financial-operational', 'summary', edition.id], queryFn: () => fetchEditionSummary(orgId as string, edition.id), enabled: Boolean(orgId) });
  const revenues = useQuery({ queryKey: ['financial-operational', 'revenues', edition.id], queryFn: () => fetchRevenues(edition.id) });
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
  // Keep resize state inside the existing panel primitive. No data/filter renders during dragging.
  const persistLayout = useCallback((sizes: number[]) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(SPLIT_KEY, String(sizes[0])); } catch { /* Local preference is optional. */ }
    }, 180);
  }, []);
  const reset = () => group.current?.setLayout([50, 50]);
  const data = revenues.data ?? EMPTY_REVENUES;
  const projection = useMemo(() => {
    const rows = data.filter((row) => row.status !== 'cancelada');
    const items = Object.entries(FUNDING_TYPE_LABELS).map(([key, label]) => ({ key, label, value: rows.filter((row) => row.funding_type === key).reduce((sum, row) => sum + row.projected_cents, 0) })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'pt-BR'));
    return {
      items, total: rows.reduce((sum, row) => sum + row.projected_cents, 0),
      rouanet: items.find((item) => item.key === 'lei_rouanet')!.value,
      missingConfirmed: rows.filter((row) => row.status === 'confirmada' && row.confirmed_cents == null).length,
      scale: { negative: Math.min(0, ...items.map((item) => item.value)), positive: Math.max(0, ...items.map((item) => item.value)) },
    };
  }, [data]);
  const s = summary.data;
  // Same server-only compatibility used by the executive dashboard. Never add list values.
  const projected = s ? s.revenues?.projected_cents ?? s.revenue.projected_cents + s.sponsorship.projected_cents : null;
  const received = s ? s.revenues?.received_cents ?? s.obligations.received_cents : null;
  const confirmed = s ? s.revenues?.confirmed_cents ?? s.revenue.confirmed_cents + s.sponsorship.confirmed_cents : null;
  const summaryState = s ? 'ready' : summary.isError ? 'error' : 'loading';
  const listState = revenues.data ? 'ready' : revenues.isError ? 'error' : 'loading';
  const edit = useCallback((row: FinancialRevenue) => setEditing(row), []);

  const panel = (side: RevenueSide) => {
    const isProjected = side === 'projetado';
    const title = isProjected ? 'Receitas projetadas' : 'Receitas realizadas';
    const Icon = isProjected ? ArrowUpRight : ArrowDownLeft;
    return <section className="f28-revenue-side" data-revenue-panel={side} aria-labelledby={`${ids}-${side}-heading`}>
      <header className="f28-revenue-side__header"><span><Icon aria-hidden="true" /><h2 id={`${ids}-${side}-heading`}>{title}</h2></span><small>{isProjected ? 'Expectativa' : 'Recebimentos'}</small></header>
      <button type="button" className="f28-revenue-add" onClick={() => setEditing('new')}><span className="f28-revenue-add__icon"><Plus aria-hidden="true" /></span><span><strong>{isProjected ? 'Adicionar receita projetada' : 'Registrar receita'}</strong><small>{isProjected ? 'Abrir cadastro de receita' : 'Cadastro de compromisso · não registra recebimento'}</small></span><span aria-hidden="true">↗</span></button>
      <div className="f28-revenue-indicators">
        <RevenueMetric primary label={isProjected ? 'Total projetado' : 'Total realizado'} value={isProjected ? projected : received} state={summaryState} hint={isProjected ? 'Consolidado da edição · receitas e patrocínios' : 'Recebimentos líquidos registrados · edição completa'} />
        <RevenueMetric label={isProjected ? 'Comercialização projetada' : 'Comercialização realizada'} value={null} hint="Sem recorte comercial na fonte financeira atual" />
        <RevenueMetric label={isProjected ? 'Rouanet projetado' : 'Rouanet realizado'} value={isProjected && revenues.data ? projection.rouanet : null} state={isProjected ? listState : 'ready'} hint={isProjected ? 'Receitas manuais · recorte carregado · origem Lei Rouanet' : 'Recebimento por origem não fornecido'} />
      </div>
      <Financial2028Panel title="Ranking de receitas" description={isProjected ? 'Por origem do recurso · recorte carregado' : 'Recebimentos por origem'}>
        <p className="f28-revenue-scale">Escala comum {revenues.data ? `${formatCompactBRL(projection.scale.negative / 100)} a ${formatCompactBRL(projection.scale.positive / 100)}` : 'indisponível'}</p>
        {isProjected ? revenues.data ? <FinancialRevenueRanking items={projection.items} total={projection.total} scale={projection.scale} /> : revenues.isError ? <p className="f28-revenue-unavailable">Ranking indisponível até carregar os registros.</p> : <Financial2028Loading label="Carregando composição…" /> : <p className="f28-revenue-unavailable">A fonte atual não detalha recebimentos por categoria ou origem. Os compromissos confirmados estão disponíveis abaixo.</p>}
      </Financial2028Panel>
      <Financial2028Panel title={isProjected ? 'Registro das receitas' : 'Compromissos confirmados'} description={isProjected ? undefined : 'Confirmação comercial · independente do recebimento'}>
        {!isProjected && <p className="f28-revenue-commitment">Confirmado na edição <strong>{confirmed == null || !Number.isFinite(confirmed) ? 'Não disponível' : formatBRL(confirmed / 100)}</strong><span>Receitas e patrocínios · não somar ao recebido</span></p>}
        {!isProjected && projection.missingConfirmed > 0 && <p className="f28-revenue-scope">{projection.missingConfirmed} compromisso(s) do recorte sem valor confirmado informado.</p>}
        {revenues.data ? <RevenueLedger data={data} focus={isProjected ? 'projetada' : 'confirmada'} onEdit={edit} /> : revenues.isError ? <p className="f28-revenue-unavailable">Registros indisponíveis.</p> : <Financial2028Loading label="Carregando receitas…" />}
      </Financial2028Panel>
    </section>;
  };

  return <div className="f28-revenue-comparison" ref={shell} data-active-side={active} data-compact={compact || undefined}>
    <div className="f28-revenue-toolbar">
      <span className="f28-revenue-toolbar__scope">Projeção × recebimento{focus === 'realizado' ? <small> · Entrada de compromissos confirmados</small> : null}</span>
      <div className="f28-revenue-toolbar__actions">
        <button type="button" className="f28-revenue-reset" onClick={reset}><RotateCcw aria-hidden="true" />Restaurar divisão</button>
        <Popover><PopoverTrigger asChild><button type="button" className="f28-revenue-help" aria-label="Ajuda sobre fontes e comparação de receitas"><HelpCircle aria-hidden="true" /></button></PopoverTrigger><PopoverContent className="f28-revenue-help-popover" align="end"><strong>Como ler esta comparação</strong><p>O projetado consolidado inclui receitas manuais e patrocínios. O realizado usa apenas recebimentos líquidos registrados nas obrigações, nunca confirmações.</p><p>As listas trazem até 500 registros. A projeção inclui confirmadas e exclui canceladas. Rouanet e ranking projetados representam esse recorte antes dos filtros. Origem do recurso não é categoria comercial; valores mistos não são repartidos.</p><p>Os dados disponíveis não detalham comercialização, Rouanet recebido, categorias ou recebimentos por registro. As vendas de lotes continuam na Dashboard Comercial e não são somadas aqui.</p><p>Arraste o divisor ou use as setas do teclado. Enter, duplo clique ou “Restaurar divisão” retornam a 50/50.</p></PopoverContent></Popover>
      </div>
    </div>
    <div className="f28-revenue-tabs" role="tablist" aria-label="Comparar receitas">{(['projetado', 'realizado'] as const).map((side) => <button key={side} type="button" role="tab" id={`${ids}-tab-${side}`} aria-selected={active === side} aria-controls={`${ids}-panel-${side}`} tabIndex={active === side ? 0 : -1} onClick={() => setActive(side)} onKeyDown={(event) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 'projetado' : event.key === 'End' ? 'realizado' : side === 'projetado' ? 'realizado' : 'projetado';
        setActive(next); document.getElementById(`${ids}-tab-${next}`)?.focus();
      }
    }}>{side === 'projetado' ? 'Projetado' : 'Realizado'}</button>)}</div>
    {summary.isError && <QueryNotice error={summary.error} retained={Boolean(s)} retry={() => void summary.refetch()} />}
    {revenues.isError && <QueryNotice error={revenues.error} retained={Boolean(revenues.data)} retry={() => void revenues.refetch()} />}
    {s?.obligations.inconsistent_count ? <Financial2028State tone="error" title={`${s.obligations.inconsistent_count} registro(s) cancelado(s) com valor liquidado`}>A consolidação preserva o recebido. Os registros exigem estorno ou devolução.</Financial2028State> : null}
    <ResizablePanelGroup ref={group} direction="horizontal" className="f28-revenue-split" onLayout={persistLayout}>
      <ResizablePanel id="projected-revenue" order={1} defaultSize={split} minSize={35} maxSize={65} className="f28-revenue-resizable" data-side="projetado"><div id={`${ids}-panel-projetado`} role={compact ? 'tabpanel' : undefined} aria-labelledby={compact ? `${ids}-tab-projetado` : undefined}>{panel('projetado')}</div></ResizablePanel>
      <ResizableHandle disabled={compact} tabIndex={compact ? -1 : 0} aria-label="Ajustar comparação entre projetado e realizado" className="f28-revenue-divider" withHandle onDoubleClick={reset} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); reset(); } }} />
      <ResizablePanel id="received-revenue" order={2} defaultSize={100 - split} minSize={35} maxSize={65} className="f28-revenue-resizable" data-side="realizado"><div id={`${ids}-panel-realizado`} role={compact ? 'tabpanel' : undefined} aria-labelledby={compact ? `${ids}-tab-realizado` : undefined}>{panel('realizado')}</div></ResizablePanel>
    </ResizablePanelGroup>
    {editing ? <RevenueDialog key={editing === 'new' ? 'new' : editing.id} edition={edition} revenue={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
  </div>;
}
