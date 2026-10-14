import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ImperativePanelGroupHandle } from 'react-resizable-panels';
import { RotateCcw } from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { formatCompactBRL } from '../utils/financialFormatters';
import { FUNDING_TYPE_LABELS, fetchEditionSummary, fetchRevenues, type FinancialEdition, type FinancialRevenue } from './financialOperationalApi';
import { RevenueDialog } from './Financial2028Forms';
import { Financial2028Loading, Financial2028Panel, Financial2028State } from './Financial2028Presentation';
import { FinancialRevenueRanking } from './FinancialRevenueRanking';
import { FinancialRevenueRecords } from './FinancialRevenueRecords';
import { FinancialComparisonAction, FinancialComparisonHelp, FinancialComparisonMetric, FinancialComparisonSideHeader } from './FinancialComparisonPrimitives';
import { focusFinancialControl } from './financialComparisonFocus';
import { useFinancialExpenseCapabilities } from './useFinancialExpenseCapabilities';
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

function QueryNotice({ error, retry, retained }: { error: unknown; retry: () => void; retained: boolean }) {
  const denied = error instanceof Error && /permission denied|FINANCIAL_FORBIDDEN|42501|permissão|acesso financeiro/i.test(error.message);
  return <Financial2028State tone={denied ? 'locked' : 'error'} title={denied ? 'Acesso financeiro indisponível' : retained ? 'A atualização falhou. Últimos dados consultados em exibição.' : 'Não foi possível carregar os valores.'} retry={denied ? undefined : retry}>
    {denied ? 'Esta consulta exige acesso financeiro à edição.' : 'Os valores só estarão atualizados após uma consulta bem-sucedida.'}
  </Financial2028State>;
}

export function Financial2028RevenueComparison({ edition, focus }: { edition: FinancialEdition; focus: RevenueSide }) {
  const { orgId } = useCurrentOrg();
  const capabilities = useFinancialExpenseCapabilities(orgId);
  const canEdit = capabilities.canAccess && capabilities.canEdit && edition.status === 'operacional';
  const canConfirm = capabilities.canAccess && capabilities.canConfirm && edition.status === 'operacional';
  const summary = useQuery({ queryKey: ['financial-operational', 'summary', edition.id], queryFn: () => fetchEditionSummary(orgId as string, edition.id), enabled: Boolean(orgId) && capabilities.canAccess });
  const revenues = useQuery({ queryKey: ['financial-operational', 'revenues', edition.id], queryFn: () => fetchRevenues(edition.id), enabled: capabilities.canAccess });
  const [active, setActive] = useState(focus);
  const [editing, setEditing] = useState<FinancialRevenue | 'new' | null>(null);
  const [compact, setCompact] = useState(false);
  const [split] = useState(initialSplit);
  const shell = useRef<HTMLDivElement>(null);
  const group = useRef<ImperativePanelGroupHandle>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const latestLayout = useRef<number | null>(null);
  const ids = useId();
  useEffect(() => { setActive(focus); }, [focus]);
  useEffect(() => {
    const element = shell.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 840));
    observer.observe(element);
    return () => observer.disconnect();
  }, [capabilities.canAccess]);
  useEffect(() => {
    const flush = () => {
      clearTimeout(saveTimer.current);
      if (latestLayout.current != null) {
        try { localStorage.setItem(SPLIT_KEY, String(latestLayout.current)); } catch { /* Optional preference. */ }
      }
    };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, []);
  // Keep resize state inside the existing panel primitive. No data/filter renders during dragging.
  const persistLayout = useCallback((sizes: number[]) => {
    latestLayout.current = sizes[0];
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
  const receivable = s ? s.revenues?.receivable_open_cents ?? s.obligations.receivable_open_cents : null;
  const summaryState = s ? 'ready' : summary.isError ? 'error' : 'loading';
  const listState = revenues.data ? 'ready' : revenues.isError ? 'error' : 'loading';
  const edit = useCallback((row: FinancialRevenue) => { if (row.status === 'confirmada' ? canConfirm : canEdit) setEditing(row); }, [canEdit, canConfirm]);

  if (capabilities.isLoading) return <Financial2028Loading label="Verificando acesso financeiro…" />;
  if (capabilities.isError) return <Financial2028State tone="error" title="Não foi possível verificar o acesso financeiro" retry={() => void capabilities.refetch()}>Tente novamente para consultar as receitas desta edição.</Financial2028State>;
  if (!capabilities.canAccess) return <Financial2028State tone="locked" title="Acesso financeiro indisponível">Esta consulta exige acesso financeiro à edição.</Financial2028State>;

  const panel = (side: RevenueSide) => {
    const isProjected = side === 'projetado';
    const title = isProjected ? 'Receitas projetadas' : 'Receitas recebidas';
    return <section className="f28-revenue-side" data-revenue-panel={side} aria-labelledby={`${ids}-${side}-heading`}>
      <FinancialComparisonSideHeader id={`${ids}-${side}-heading`} title={title} eyebrow={isProjected ? 'Planejamento' : 'Liquidação'} tone={side} action={canEdit ? <FinancialComparisonAction label={isProjected ? 'Adicionar receita projetada' : 'Cadastrar receita'} compactLabel="Nova receita" tone={side} onClick={() => setEditing('new')} description={isProjected ? 'Abrir cadastro de receita' : 'Cadastro de compromisso · não registra recebimento'} /> : undefined} />
      <div className="f28-revenue-indicators">
        <FinancialComparisonMetric primary label={isProjected ? 'Total projetado' : 'Recebido líquido'} value={isProjected ? projected : received} state={summaryState} hint={isProjected ? 'Receitas manuais e patrocínios · edição completa' : 'Recebimentos líquidos registrados · edição completa'} />
        <div className="f28-revenue-secondary-indicators">
          <FinancialComparisonMetric label={isProjected ? 'Receitas manuais' : 'Confirmado'} value={isProjected ? s?.revenue.projected_cents ?? null : confirmed} state={summaryState} hint={isProjected ? 'Projetado · consolidação do servidor' : 'Compromissos da edição · independente do recebido'} />
          <FinancialComparisonMetric label={isProjected ? 'Patrocínios' : 'Saldo a receber'} value={isProjected ? s?.sponsorship.projected_cents ?? null : receivable} state={summaryState} hint={isProjected ? 'Projetado em dinheiro · sem contrapartidas' : 'Obrigações em aberto · consolidação do servidor'} />
        </div>
      </div>
    </section>;
  };

  return <div className="f28-revenue-comparison" ref={shell} data-active-side={active} data-compact={compact || undefined} onClickCapture={focusFinancialControl}>
    <div className="f28-revenue-toolbar">
      <span className="f28-revenue-toolbar__scope">Resumo da edição<small>Projeção × recebimento</small></span>
      <div className="f28-revenue-toolbar__actions">
        <button type="button" className="f28-revenue-reset" onClick={reset}><RotateCcw aria-hidden="true" />Restaurar divisão</button>
        <FinancialComparisonHelp label="Ajuda sobre fontes e comparação de receitas"><strong>Como ler esta comparação</strong><p>O projetado consolidado inclui receitas manuais e patrocínios, incluindo confirmadas e excluindo canceladas. O recebido usa os recebimentos líquidos registrados nas obrigações.</p><p>Cadastrar uma receita registra o compromisso. Os recebimentos são registrados separadamente em Movimentos; confirmar uma receita não registra entrada no caixa.</p><p><strong>Cobertura financeira</strong>: comercialização de lotes e recebimentos por origem ou registro não são detalhados nesta fonte. As vendas de lotes continuam na Dashboard Comercial e não são somadas aqui.</p><p>Arraste o divisor ou use as setas do teclado. Enter, duplo clique ou “Restaurar divisão” retornam a 50/50.</p></FinancialComparisonHelp>
      </div>
    </div>
    <div className="f28-revenue-tabs" role="tablist" aria-label="Comparar receitas">{(['projetado', 'realizado'] as const).map((side) => <button key={side} type="button" role="tab" id={`${ids}-tab-${side}`} aria-selected={active === side} aria-controls={`${ids}-panel-${side}`} tabIndex={active === side ? 0 : -1} onClick={() => setActive(side)} onKeyDown={(event) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 'projetado' : event.key === 'End' ? 'realizado' : side === 'projetado' ? 'realizado' : 'projetado';
        setActive(next); document.getElementById(`${ids}-tab-${next}`)?.focus();
      }
    }}>{side === 'projetado' ? 'Projetado' : 'Recebido'}</button>)}</div>
    {summary.isError && <QueryNotice error={summary.error} retained={Boolean(s)} retry={() => void summary.refetch()} />}
    {revenues.isError && <QueryNotice error={revenues.error} retained={Boolean(revenues.data)} retry={() => void revenues.refetch()} />}
    {s?.obligations.inconsistent_count ? <Financial2028State tone="error" title={`${s.obligations.inconsistent_count} registro(s) cancelado(s) com valor liquidado`}>A consolidação preserva o recebido. Os registros exigem estorno ou devolução.</Financial2028State> : null}
    <ResizablePanelGroup ref={group} direction="horizontal" className="f28-revenue-split" onLayout={persistLayout}>
      <ResizablePanel id="projected-revenue" order={1} defaultSize={split} minSize={35} maxSize={65} className="f28-revenue-resizable" data-side="projetado"><div id={`${ids}-panel-projetado`} role={compact ? 'tabpanel' : undefined} aria-labelledby={compact ? `${ids}-tab-projetado` : undefined}>{panel('projetado')}</div></ResizablePanel>
      <ResizableHandle disabled={compact} tabIndex={compact ? -1 : 0} aria-label="Ajustar comparação entre projetado e recebido" className="f28-revenue-divider" withHandle onDoubleClick={reset} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); reset(); } }} />
      <ResizablePanel id="received-revenue" order={2} defaultSize={100 - split} minSize={35} maxSize={65} className="f28-revenue-resizable" data-side="realizado"><div id={`${ids}-panel-realizado`} role={compact ? 'tabpanel' : undefined} aria-labelledby={compact ? `${ids}-tab-realizado` : undefined}>{panel('realizado')}</div></ResizablePanel>
    </ResizablePanelGroup>
    <div className="f28-revenue-records-panel"><Financial2028Panel title="Receitas manuais carregadas" actions={<span className="f28-revenue-records__scope-badge">Até 500 registros</span>}>
      <div className="f28-revenue-composition">
        <div className="f28-revenue-composition__ranking"><div className="f28-revenue-composition__heading"><h3>Projeção por origem</h3><div><span>Registros manuais ativos</span><FinancialComparisonHelp label="Ajuda sobre a composição das receitas manuais"><strong>Composição das receitas manuais</strong><p>O ranking representa os registros ativos carregados, até o limite de 500, antes dos filtros da lista. Receitas confirmadas participam da projeção e canceladas são excluídas.</p><p>Origem do recurso não é categoria comercial. Os valores desta composição não substituem os totais consolidados da edição.</p></FinancialComparisonHelp></div></div>
          {revenues.data ? <FinancialRevenueRanking items={projection.items} total={projection.total} scale={projection.scale} /> : revenues.isError ? <p className="f28-revenue-unavailable">Ranking indisponível até carregar os registros.</p> : <Financial2028Loading label="Carregando composição…" />}
          <p className="f28-revenue-scale">Escala monetária {revenues.data ? `${formatCompactBRL(projection.scale.negative / 100)} a ${formatCompactBRL(projection.scale.positive / 100)}` : 'indisponível'}</p>
        </div>
        <div className="f28-revenue-composition__rouanet"><FinancialComparisonMetric label="Rouanet projetado" value={revenues.data ? projection.rouanet : null} state={listState} hint="Origem Lei Rouanet · registros ativos carregados, antes dos filtros. Valores mistos permanecem em sua própria origem. Esta composição não inclui os patrocínios da edição." />{projection.missingConfirmed > 0 ? <p className="f28-revenue-composition__attention">{projection.missingConfirmed} compromisso(s) do recorte sem valor confirmado informado.</p> : null}</div>
      </div>
      {revenues.data ? <FinancialRevenueRecords data={data} focus={focus === 'projetado' ? 'projetada' : 'confirmada'} canEdit={canEdit} canConfirm={canConfirm} onEdit={edit} /> : revenues.isError ? <p className="f28-revenue-unavailable">Registros indisponíveis.</p> : <Financial2028Loading label="Carregando receitas…" />}
    </Financial2028Panel></div>
    {editing && (editing === 'new' ? canEdit : editing.status === 'confirmada' ? canConfirm : canEdit) ? <RevenueDialog key={editing === 'new' ? 'new' : editing.id} edition={edition} revenue={editing === 'new' ? null : editing} capabilities={capabilities} onClose={() => setEditing(null)} /> : null}
  </div>;
}
