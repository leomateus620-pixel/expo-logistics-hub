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

const PavilionPlan = lazy(() => import('./CommercialDashboardPavilion'));

function Metrics({ aggregate, title }: { aggregate: DashboardAggregate; title: string }) {
  return <div className="commercial-dashboard-scope-metrics" aria-label={`Indicadores de ${title}`}>
    <div><span>Espaços comerciais</span><strong>{formatDashboardInteger(aggregate.commercialLots)}</strong><small>{formatDashboardInteger(aggregate.totalLots)} registros no recorte</small></div>
    <div><span>Em andamento</span><strong>{formatDashboardInteger(aggregate.saleOpenLots)}</strong><small>Aguardando assinatura</small></div>
    <div><span>Vendidos</span><strong>{formatDashboardInteger(aggregate.soldLots)} <small>{aggregate.commercialLots ? formatDashboardPercentage(aggregate.soldLotPercentage) : '—'}</small></strong><small>Do inventário comercial</small></div>
    <div><span>Área comercial oficial</span><strong>{formatDashboardAreaWithCoverage(aggregate.totalAreaSqm, aggregate.commercialLots, aggregate.lotsWithoutOfficialArea, aggregate.commercialLots)}</strong>
      <small>{aggregate.lotsWithoutOfficialArea ? `${aggregate.lotsWithoutOfficialArea} sem metragem válida` : 'Metragem cadastrada'}</small></div>
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

export function CommercialDashboardSpaces({ snapshot, data, onViewLot }: {
  snapshot: CommercialDashboardSnapshot;
  data: Pick<CommercialMapData, 'entities' | 'lots'>;
  onViewLot: (id: string) => void;
}) {
  // Presentation scope only; every element below shares one existing snapshot aggregate.
  const [requestedScopeId, setScopeId] = useState('external:all');
  const scopeId = requestedScopeId === 'pending' && snapshot.unclassified.totalLots === 0 ? 'external:all' : requestedScopeId;
  useEffect(() => {
    if (requestedScopeId === 'pending' && snapshot.unclassified.totalLots === 0) setScopeId('external:all');
  }, [requestedScopeId, snapshot.unclassified.totalLots]);
  const [selections, setSelections] = useState<Record<string, string | null>>({});
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [metric, setMetric] = useState<'lots' | 'area'>('lots');
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

  return <section className="commercial-dashboard-workspace" aria-label="Análise do recorte selecionado">
    <div className="commercial-dashboard-scope-selector">
      <div className="commercial-dashboard-selector-row">
        <span><MapPinned aria-hidden="true" />Áreas externas</span>
        <div className="commercial-dashboard-area-selectors" role="group" aria-label="Selecionar área externa">
          <button type="button" aria-pressed={scopeId === 'external:all'} onClick={() => setScopeId('external:all')}>Todas as áreas <small>{formatDashboardInteger(snapshot.external.totalLots)}</small></button>
          {snapshot.segments.map((item) => <button type="button" key={item.segmentId} aria-pressed={scopeId === `external:${item.segmentId}`}
            onClick={() => setScopeId(`external:${item.segmentId}`)}>{item.segment.name}<small>{formatDashboardInteger(item.totalLots)}</small></button>)}
        </div>
      </div>
      <div className="commercial-dashboard-selector-row">
        <span><Building2 aria-hidden="true" />Pavilhões</span>
        <div className="commercial-dashboard-pavilion-selectors" role="group" aria-label="Selecionar pavilhão">
          <button type="button" aria-pressed={isInternal} onClick={() => setScopeId('internal:all')}>Todos</button>
          {snapshot.pavilions.map((item) => <button type="button" key={item.definition.publicIdentifier} aria-label={item.definition.officialName}
            title={item.definition.officialName} aria-pressed={scopeId === `pavilion:${item.definition.publicIdentifier}`}
            onClick={() => setScopeId(`pavilion:${item.definition.publicIdentifier}`)}>{item.definition.pavilionNumber}</button>)}
        </div>
        {snapshot.unclassified.totalLots > 0 && <button type="button" className="commercial-dashboard-pending-selector" aria-pressed={isPending} onClick={() => setScopeId('pending')}>
          Classificação pendente <strong>{formatDashboardInteger(snapshot.unclassified.totalLots)}</strong>
        </button>}
      </div>
    </div>
    <div className="commercial-dashboard-selected-summary"><div className="commercial-dashboard-scope-heading">
      <div><span className="commercial-dashboard-eyebrow">Recorte selecionado</span><h2>{title}</h2></div>
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
        <CommercialDashboardLotChart aggregate={aggregate} {...highlight} metric={metric} compact />
        <p className="commercial-dashboard-highlight-note">Toque em uma situação para destacá-la na planta. Todos os espaços e totais são mantidos.</p>
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
