import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Building2, MapPinned } from 'lucide-react';
import type { CommercialMapData, CommercialStatus } from '../types';
import type { CommercialDashboardSnapshot, DashboardAggregate } from './commercialDashboardTypes';
import { CommercialMiniMap } from './CommercialMiniMap';
import { buildDashboardExternalBoundaries } from './commercialDashboardBoundaries';
import { formatDashboardAreaWithCoverage, formatDashboardInteger, formatDashboardPercentage } from './commercialDashboardFormatters';
import { STATUS_CONFIG } from '../constants';
import { CommercialDashboardLotChart } from './CommercialDashboardCharts';
import { useDashboardStatusHighlight } from './useDashboardStatusHighlight';
import { CommercialDashboardComparison } from './CommercialDashboardComparison';
import { CommercialDashboardScopeCard } from './CommercialDashboardScopeCard';
import { OverviewInfo } from './CommercialDashboardOverviewInfo';
import { formatDashboardCommercialProgress } from './commercialDashboardProgress';
import './commercial-dashboard-scope-cards.css';
import './commercial-dashboard-workspace-analysis.css';

const PavilionPlan = lazy(() => import('./CommercialDashboardPavilion'));

export interface CommercialDashboardSpacesState {
  requestedScopeId: string;
  selections: Record<string, string | null>;
  metric: 'lots' | 'area';
}

/** A project-scoped presentation memory supplied by the mounted Dashboard. */
export interface CommercialDashboardSpacesMemory {
  current: CommercialDashboardSpacesState | null;
}

function Metrics({ aggregate, title }: { aggregate: DashboardAggregate; title: string }) {
  return <div className="commercial-dashboard-scope-metrics" aria-label={`Indicadores de ${title}`}>
    <div><span>Espaços comerciais</span><strong>{formatDashboardInteger(aggregate.commercialLots)}</strong></div>
    <div><span>Em andamento</span><strong>{formatDashboardInteger(aggregate.saleOpenLots)}</strong></div>
    <div><span>Vendidos</span><strong>{formatDashboardInteger(aggregate.soldLots)} <small>{aggregate.commercialLots ? formatDashboardCommercialProgress(aggregate.soldLotPercentage) : '—'}</small></strong></div>
    <div><span>Área comercial oficial</span><strong>{formatDashboardAreaWithCoverage(aggregate.totalAreaSqm, aggregate.commercialLots, aggregate.lotsWithoutOfficialArea, aggregate.commercialLots)}</strong></div>
  </div>;
}

function Verification({ aggregate }: { aggregate: DashboardAggregate }) {
  return <details className="commercial-dashboard-scope-analysis">
    <summary>Conferência do recorte · {formatDashboardInteger(aggregate.totalLots)} registros</summary>
    <div className="commercial-dashboard-status-table-wrap"><table className="commercial-dashboard-status-table">
      <caption>Estados cadastrais preservados. Indisponíveis não participam dos percentuais comerciais.</caption>
      <thead><tr><th>Situação cadastral</th><th>Lotes</th><th>% comercial</th><th>Área oficial</th><th>Sem área</th></tr></thead>
      <tbody>{Object.entries(aggregate.byStatus).map(([status, row]) => <tr key={status}>
        <th>{STATUS_CONFIG[status as CommercialStatus].label}</th><td>{formatDashboardInteger(row.lotCount)}</td>
        <td>{status === 'UNAVAILABLE' || !aggregate.commercialLots ? '—' : formatDashboardPercentage(row.lotPercentage)}</td>
        <td>{formatDashboardAreaWithCoverage(row.areaSqm, row.lotCount, row.areaPendingCount, aggregate.totalLots)}</td><td>{row.areaPendingCount}</td>
      </tr>)}</tbody>
    </table></div>
  </details>;
}

export function CommercialDashboardSpaces({ snapshot, data, onViewLot, stateMemory }: {
  snapshot: CommercialDashboardSnapshot;
  data: Pick<CommercialMapData, 'entities' | 'lots'>;
  onViewLot: (id: string) => void;
  stateMemory?: CommercialDashboardSpacesMemory;
}) {
  // Presentation scope only; every element below shares one existing snapshot aggregate.
  const [requestedScopeId, setScopeId] = useState(() => stateMemory?.current?.requestedScopeId ?? 'external:all');
  // The former internal aggregate remains in the snapshot, without a visible selector.
  // Normalize a retained aggregate scope explicitly instead of choosing a pavilion.
  const normalizedScopeId = requestedScopeId === 'internal:all' ? 'external:all' : requestedScopeId;
  const scopeId = normalizedScopeId === 'pending' && snapshot.unclassified.totalLots === 0 ? 'external:all' : normalizedScopeId;
  useEffect(() => {
    if (requestedScopeId === 'internal:all' || (requestedScopeId === 'pending' && snapshot.unclassified.totalLots === 0)) setScopeId('external:all');
  }, [requestedScopeId, snapshot.unclassified.totalLots]);
  const [selections, setSelections] = useState<Record<string, string | null>>(() => stateMemory?.current?.selections ?? {});
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [metric, setMetric] = useState<'lots' | 'area'>(() => stateMemory?.current?.metric ?? 'lots');
  useEffect(() => {
    if (stateMemory) stateMemory.current = { requestedScopeId: scopeId, selections, metric };
  }, [stateMemory, scopeId, selections, metric]);
  const highlight = useDashboardStatusHighlight();
  const area = scopeId.startsWith('external:') ? snapshot.segments.find((item) => `external:${item.segmentId}` === scopeId) : undefined;
  const pavilion = snapshot.pavilions.find((item) => `pavilion:${item.definition.publicIdentifier}` === scopeId);
  const isInternal = scopeId === 'internal:all';
  const isPending = scopeId === 'pending';
  const aggregate = pavilion ?? (isInternal ? snapshot.internal : isPending ? snapshot.unclassified : area ?? snapshot.external);
  const title = pavilion?.definition.officialName ?? (isInternal ? 'Todos os pavilhões' : isPending ? 'Classificação pendente' : area?.segment.name ?? 'Todas as áreas externas');
  const boundary = useMemo(() => buildDashboardExternalBoundaries(data.entities, data.lots,
    area ? [area.segment] : snapshot.segments.map((item) => item.segment)), [data.entities, data.lots, area, snapshot.segments]);
  const items = useMemo(() => aggregate.records.map((record) => ({
    ...record, areaName: snapshot.segments.find((item) => item.segmentId === record.segmentId)?.segment.name,
  })), [aggregate.records, snapshot.segments]);
  const internalOutlines = useMemo(() => snapshot.pavilions.flatMap((item) => item.entity ? [{
    id: item.entity.id, label: item.definition.officialName, kind: 'pavilion' as const,
    color: '#315543', coordinates: item.entity.geometry.coordinates,
  }] : []), [snapshot.pavilions]);
  const selection = { entityId: selections[scopeId] ?? null,
    onChange: (id: string | null) => setSelections((current) => ({ ...current, [scopeId]: id })) };

  return <section className="commercial-dashboard-workspace commercial-dashboard-workspace-analysis" aria-label="Análise do recorte selecionado">
    <div className="commercial-dashboard-scope-selector commercial-dashboard-scope-cards">
      <div className="commercial-dashboard-scope-cards__section">
        <div className="commercial-dashboard-scope-cards__heading"><span><MapPinned aria-hidden="true" />Áreas externas</span>
          <small>Comercialização por espaços</small></div>
        <div className="commercial-dashboard-scope-grid commercial-dashboard-scope-grid--external" role="group" aria-label="Selecionar área externa">
          <CommercialDashboardScopeCard scopeId="external:all" title="Todas as áreas" aggregate={snapshot.external}
            selected={scopeId === 'external:all'} onSelect={() => setScopeId('external:all')} />
          {snapshot.segments.map((item) => <CommercialDashboardScopeCard key={item.segmentId} scopeId={`external:${item.segmentId}`}
            title={item.segment.name} aggregate={item} segmentId={item.segmentId}
            selected={scopeId === `external:${item.segmentId}`} onSelect={() => setScopeId(`external:${item.segmentId}`)} />)}
        </div>
      </div>
      <div className="commercial-dashboard-scope-cards__section">
        <div className="commercial-dashboard-scope-cards__heading"><span><Building2 aria-hidden="true" />Pavilhões</span>
          <div className="commercial-dashboard-scope-cards__legend" aria-label="Legenda da comercialização">
            <span><i data-status="SALE_OPEN" aria-hidden="true" />Em andamento</span><span><i data-status="SOLD" aria-hidden="true" />Confirmada</span>
          </div>
        </div>
        <div className="commercial-dashboard-scope-grid commercial-dashboard-scope-grid--pavilions" role="group" aria-label="Selecionar pavilhão">
          {snapshot.pavilions.map((item) => <CommercialDashboardScopeCard key={item.definition.publicIdentifier}
            scopeId={`pavilion:${item.definition.publicIdentifier}`} title={item.definition.officialName} aggregate={item}
            pavilionNumber={item.definition.pavilionNumber} selected={scopeId === `pavilion:${item.definition.publicIdentifier}`}
            onSelect={() => setScopeId(`pavilion:${item.definition.publicIdentifier}`)} />)}
        </div>
        {snapshot.unclassified.totalLots > 0 && <button type="button" className="commercial-dashboard-pending-selector" aria-pressed={isPending} onClick={() => setScopeId('pending')}>
          Classificação pendente <strong>{formatDashboardInteger(snapshot.unclassified.totalLots)}</strong>
        </button>}
      </div>
    </div>
    <div className="commercial-dashboard-selected-summary"><div className="commercial-dashboard-scope-heading">
      <div><span className="commercial-dashboard-eyebrow">Recorte selecionado</span>
        <div className="commercial-dashboard-workspace-analysis__scope-title"><h2>{title}</h2>
          <OverviewInfo label={`Informações dos indicadores de ${title}`} title="Indicadores do recorte"
            lead="Os indicadores usam o mesmo inventário ativo da planta e do gráfico. Vendas em andamento aguardam assinatura; vendidos seguem o estado comercial SOLD, preservando os registros legados."
            facts={[
              ['Registros ativos', formatDashboardInteger(aggregate.totalLots)],
              ['Base comercial', formatDashboardInteger(aggregate.commercialLots)],
              ['Indisponíveis fora da base', formatDashboardInteger(aggregate.unavailableLots)],
              ['Área oficial conhecida', formatDashboardAreaWithCoverage(aggregate.totalAreaSqm, aggregate.commercialLots, aggregate.lotsWithoutOfficialArea, aggregate.commercialLots)],
              ['Lotes sem área oficial', formatDashboardInteger(aggregate.lotsWithoutOfficialArea)],
            ]}
            note={<>{aggregate.commercialLots > 0
              ? 'O percentual vendido divide os lotes vendidos pela base comercial, incluindo bloqueados e excluindo indisponíveis. '
              : 'Não há base comercial para calcular o percentual vendido. '}
              {aggregate.lotsWithoutOfficialArea > 0
                ? 'A cobertura da área é parcial: somente metragens oficiais válidas entram no subtotal. Área ausente não é zero e não é estimada pela geometria.'
                : 'A metragem usa somente áreas oficiais cadastradas.'}</>} />
        </div>
      </div>
    </div><Metrics aggregate={aggregate} title={title} /></div>
    <div className="commercial-dashboard-integrated-analysis">
      <div className="commercial-dashboard-spatial-card">
        {pavilion ? <Suspense fallback={<p role="status">Preparando planta do pavilhão…</p>}>
          <PavilionPlan key={scopeId} snapshot={pavilion} onViewLot={onViewLot} highlightedStatus={highlight.highlightedStatus} selection={selection} hideStatusLegend />
        </Suspense> : <CommercialMiniMap items={items} title={title} outlines={isInternal ? internalOutlines : isPending ? undefined : boundary.outlines}
          onViewLot={onViewLot} highlightedStatus={highlight.highlightedStatus} selection={selection} hideStatusLegend />}
      </div>
      <aside className="commercial-dashboard-distribution" aria-label={`Distribuição de ${title}`}>
        <div className="commercial-dashboard-distribution-heading"><h3>Distribuição comercial</h3>
          <div role="group" aria-label="Métrica de distribuição">
            <button type="button" aria-pressed={metric === 'lots'} onClick={() => setMetric('lots')}>Quantidade</button>
            <button type="button" aria-pressed={metric === 'area'} onClick={() => setMetric('area')}>Área oficial</button>
          </div>
        </div>
        <CommercialDashboardLotChart aggregate={aggregate} {...highlight} metric={metric} compact variant="workspace" />
      </aside>
    </div>
    <div className="commercial-dashboard-secondary">
      <Verification aggregate={aggregate} />
      <details className="commercial-dashboard-scope-analysis" onToggle={(event) => setComparisonOpen(event.currentTarget.open)}>
        <summary>Comparar segmentos externos</summary>
        {comparisonOpen && <CommercialDashboardComparison segments={snapshot.segments} includeValue={false} />}
      </details>
    </div>
    {isPending && <p className="commercial-dashboard-pending">Estes espaços permanecem nos totais globais, sem atribuição de área ou pavilhão por suposição.
      {[...new Set(snapshot.unclassified.records.map((record) => record.classificationIssue))].filter(Boolean).map((reason) => <span key={reason}> {reason}.</span>)}
    </p>}
    {!pavilion && !isInternal && !isPending && boundary.pending.map((message) => <p className="commercial-dashboard-pending" key={message}>{message}</p>)}
    <div className="commercial-dashboard-reconciliation" role="note" aria-label="Reconciliação do inventário ativo">
      <span>{formatDashboardInteger(snapshot.overall.totalLots)} registros ativos = {formatDashboardInteger(snapshot.external.totalLots)} externos + {formatDashboardInteger(snapshot.internal.totalLots)} internos + {formatDashboardInteger(snapshot.unclassified.totalLots)} pendentes</span>
      <small>Indisponíveis aparecem na planta e na legenda, fora dos percentuais comerciais.</small>
    </div>
  </section>;
}
