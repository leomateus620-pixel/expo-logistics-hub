import { lazy, Suspense, useMemo, useState } from 'react';
import { Building2, MapPinned } from 'lucide-react';
import type { CommercialMapData } from '../types';
import type { CommercialDashboardSnapshot, DashboardAggregate } from './commercialDashboardTypes';
import { CommercialMiniMap } from './CommercialMiniMap';
import { buildDashboardExternalBoundaries } from './commercialDashboardBoundaries';
import { formatDashboardAreaWithCoverage, formatDashboardCurrency, formatDashboardInteger, formatDashboardPercentage } from './commercialDashboardFormatters';
import { COMMERCIAL_PHASES, STATUS_CONFIG } from '../constants';
import { toCommercialPhase } from '../types';
import { CommercialDashboardLotChart, CommercialDashboardValueChart } from './CommercialDashboardCharts';
import { useDashboardStatusHighlight } from './useDashboardStatusHighlight';
import { CommercialDashboardComparison } from './CommercialDashboardComparison';

const PavilionPlan = lazy(() => import('./CommercialDashboardPavilion'));

function Metrics({ aggregate, title }: { aggregate: DashboardAggregate; title: string }) {
  return <div className="commercial-dashboard-scope-metrics" aria-label={`Indicadores de ${title}`}>
    <div><span>Lotes comerciais</span><strong>{formatDashboardInteger(aggregate.commercialLots)}</strong><small>{aggregate.unavailableLots} fora da área comercial ativa</small></div>
    <div><span>Vendidos</span><strong>{aggregate.commercialLots ? formatDashboardPercentage(aggregate.soldLotPercentage) : '—'}</strong><small>{aggregate.soldLots} de {aggregate.commercialLots} lotes</small></div>
    <div><span>Área comercial oficial</span><strong>{formatDashboardAreaWithCoverage(aggregate.totalAreaSqm, aggregate.commercialLots, aggregate.lotsWithoutOfficialArea, aggregate.commercialLots)}</strong><small>{aggregate.lotsWithoutOfficialArea} sem metragem</small></div>
    <div><span>Valor comercial conhecido</span><strong>{aggregate.knownValueLots ? formatDashboardCurrency(aggregate.totalKnownValue, true) : '—'}</strong><small>{aggregate.knownValueLots} de {aggregate.commercialLots} com preço · não é receita</small></div>
  </div>;
}
function Analysis({ aggregate, highlight }: { aggregate: DashboardAggregate; highlight: ReturnType<typeof useDashboardStatusHighlight> }) {
  const [open, setOpen] = useState(false);
  return <details className="commercial-dashboard-scope-analysis" onToggle={(event) => setOpen(event.currentTarget.open)}><summary>Distribuição por situação, área e valor</summary>
    {open && <CommercialDashboardLotChart aggregate={aggregate} {...highlight} />}
    {open && <CommercialDashboardValueChart aggregate={aggregate} {...highlight} />}
    <div className="commercial-dashboard-status-table-wrap"><table className="commercial-dashboard-status-table">
      <caption>Valores comerciais cadastrados; espaços fora da área comercial ativa excluídos dos percentuais</caption>
      <thead><tr><th>Situação</th><th>Lotes</th><th>% lotes</th><th>Área oficial</th><th>% área</th><th>Valor conhecido</th><th>Sem área / preço</th></tr></thead>
      <tbody>{COMMERCIAL_PHASES.map((phase) => {
        const rows = Object.entries(aggregate.byStatus).filter(([status]) => status !== 'UNAVAILABLE' && toCommercialPhase(status as keyof typeof aggregate.byStatus) === phase).map(([, row]) => row);
        const lotCount = rows.reduce((sum, row) => sum + row.lotCount, 0);
        const areaSqm = rows.reduce((sum, row) => sum + row.areaSqm, 0);
        const areaPendingCount = rows.reduce((sum, row) => sum + row.areaPendingCount, 0);
        const pricePendingCount = rows.reduce((sum, row) => sum + row.pricePendingCount, 0);
        const value = rows.reduce((sum, row) => sum + row.value, 0);
        return <tr key={phase}>
          <th>{STATUS_CONFIG[phase].label}</th><td>{lotCount}</td>
          <td>{aggregate.commercialLots ? formatDashboardPercentage(100 * lotCount / aggregate.commercialLots) : '—'}</td>
          <td>{formatDashboardAreaWithCoverage(areaSqm, lotCount, areaPendingCount, aggregate.totalLots)}</td>
          <td>{aggregate.totalAreaSqm > 0 ? formatDashboardPercentage(100 * areaSqm / aggregate.totalAreaSqm) : '—'}</td>
          <td>{value ? formatDashboardCurrency(value) : '—'}</td><td>{areaPendingCount} / {pricePendingCount}</td>
        </tr>;
      })}</tbody>
    </table></div>
  </details>;
}

export function CommercialDashboardSpaces({ snapshot, data, onViewLot }: {
  snapshot: CommercialDashboardSnapshot;
  data: Pick<CommercialMapData, 'entities' | 'lots'>;
  onViewLot: (id: string) => void;
}) {
  const [areaId, setAreaId] = useState('all');
  const [pavilionId, setPavilionId] = useState('all');
  const [pavilionSelections, setPavilionSelections] = useState<Record<string, string | null>>({});
  const [pendingOpen, setPendingOpen] = useState(false);
  const externalHighlight = useDashboardStatusHighlight();
  const internalHighlight = useDashboardStatusHighlight();
  const pendingHighlight = useDashboardStatusHighlight();
  const area = snapshot.segments.find((segment) => segment.segmentId === areaId);
  const pavilion = snapshot.pavilions.find((item) => item.definition.publicIdentifier === pavilionId);
  const external = area ?? snapshot.external;
  const externalTitle = area?.segment.name ?? 'Todas as áreas externas';
  const internal = pavilion ?? snapshot.internal;
  const boundary = useMemo(() => buildDashboardExternalBoundaries(data.entities, data.lots,
    area ? [area.segment] : snapshot.segments.map((segment) => segment.segment)), [data.entities, data.lots, area, snapshot.segments]);
  const outsideIcons = snapshot.pavilions.filter((item) => item.definition.pavilionNumber === 13);
  const externalItems = useMemo(() => external.records.map((record) => ({
    ...record, areaName: snapshot.segments.find((segment) => segment.segmentId === record.segmentId)?.segment.name,
  })), [external.records, snapshot.segments]);

  return <>
    <div className="commercial-dashboard-reconciliation" role="note" aria-label="Reconciliação do inventário ativo">
      <strong>{snapshot.overall.totalLots} registros ativos</strong>
      <span>= {snapshot.external.totalLots} externos + {snapshot.internal.totalLots} internos + {snapshot.unclassified.totalLots} pendentes de classificação</span>
      <small>Espaços fora da área comercial ativa permanecem separados dos percentuais.</small>
    </div>
    <section className="commercial-dashboard-spaces" aria-labelledby="dashboard-external-title">
      <div className="commercial-dashboard-section-heading"><div><span className="commercial-dashboard-eyebrow">Áreas e quadras do parque</span>
        <h2 id="dashboard-external-title" tabIndex={-1}>Visão geral externa</h2></div><p>Somente lotes externos, sem módulos de pavilhões.</p></div>
      <div className="commercial-dashboard-area-selectors" role="group" aria-label="Selecionar área externa">
        <button type="button" aria-pressed={areaId === 'all'} onClick={() => setAreaId('all')}><MapPinned aria-hidden="true" /><strong>Todas as áreas</strong><span>{snapshot.external.totalLots} espaços ativos</span></button>
        {snapshot.segments.map((segment) => <button type="button" key={segment.segmentId} aria-pressed={areaId === segment.segmentId}
          onClick={() => setAreaId(segment.segmentId)}><MapPinned aria-hidden="true" /><strong>{segment.segment.name}</strong>
          <span>{segment.totalLots} espaços · {formatDashboardPercentage(segment.soldLotPercentage)} vendidos</span></button>)}
      </div>
      <Metrics aggregate={external} title={externalTitle} />
      <div className="commercial-dashboard-spatial-card">
        <CommercialMiniMap items={externalItems} title={externalTitle} outlines={boundary.outlines} onViewLot={onViewLot} highlightedStatus={externalHighlight.highlightedStatus} />
        <div className="commercial-dashboard-blocks" aria-label="Quadras confirmadas no recorte">
          {boundary.outlines.filter(({ kind }) => kind === 'block').map((block) => <span key={block.id}>{block.label}</span>)}
        </div>
        <p className="commercial-dashboard-data-note">Contorno: união exata das quadras e dos membros externos declarados do segmento. Os vazios entre polígonos são preservados.</p>
        {boundary.pending.map((message) => <p className="commercial-dashboard-pending" key={message}>{message}</p>)}
      </div>
      <Analysis aggregate={external} highlight={externalHighlight} />
      <CommercialDashboardComparison segments={snapshot.segments} />
    </section>

    <section className="commercial-dashboard-spaces" aria-labelledby="dashboard-internal-title">
      <div className="commercial-dashboard-section-heading"><div><span className="commercial-dashboard-eyebrow">Módulos comerciais</span>
        <h2 id="dashboard-internal-title" tabIndex={-1}>Visão geral interna</h2></div><p>Vínculo cadastral com o pavilhão, inclusive nos segmentos comerciais.</p></div>
      <div className="commercial-dashboard-pavilion-selectors" role="group" aria-label="Selecionar pavilhão">
        <button type="button" aria-pressed={pavilionId === 'all'} onClick={() => setPavilionId('all')}><Building2 aria-hidden="true" /><strong>Todos</strong><span>Pavilhões</span></button>
        {snapshot.pavilions.filter((item) => item.definition.pavilionNumber !== 13).map((item) => <button type="button" key={item.definition.publicIdentifier}
          aria-label={item.definition.officialName} aria-pressed={pavilionId === item.definition.publicIdentifier}
          onClick={() => setPavilionId(item.definition.publicIdentifier)}>
          <Building2 aria-hidden="true" /><strong>{item.definition.pavilionNumber}</strong><span title={item.definition.officialName}>Pavilhão {item.definition.pavilionNumber}</span>
        </button>)}
      </div>
      {outsideIcons.map((item) => <p className="commercial-dashboard-pending" key={item.definition.publicIdentifier}>
        Pavilhão 13: {item.totalLots} módulos ativos carregados ({item.commercialLots} comerciais e {item.unavailableLots} indisponíveis), incluídos no consolidado interno.
        Está fora da seleção principal de sete pavilhões. <button type="button" aria-pressed={pavilionId === 'B5'} onClick={() => setPavilionId('B5')}>Consultar Pavilhão 13</button>
      </p>)}
      <Metrics aggregate={internal} title={pavilion?.definition.officialName ?? 'Todos os pavilhões'} />
      <div className="commercial-dashboard-spatial-card">
        {pavilion ? <Suspense fallback={<p role="status">Preparando planta do pavilhão…</p>}>
          <PavilionPlan snapshot={pavilion} onViewLot={onViewLot} highlightedStatus={internalHighlight.highlightedStatus} selection={{
            entityId: pavilionSelections[pavilionId] ?? null,
            onChange: (id) => setPavilionSelections((current) => ({ ...current, [pavilionId]: id })),
          }} />
        </Suspense> : <div className="commercial-dashboard-pavilion-overview">
          {snapshot.pavilions.map((item) => <button type="button" key={item.definition.publicIdentifier} onClick={() => setPavilionId(item.definition.publicIdentifier)}>
            <span>{item.definition.officialName}</span><strong>{item.commercialLots} módulos comerciais</strong>
            <span>{item.soldLots} vendidos · {item.availableLots} disponíveis</span>
            <span>{formatDashboardAreaWithCoverage(item.totalAreaSqm, item.commercialLots, item.lotsWithoutOfficialArea, item.commercialLots)}</span>
            <small>Abrir planta →</small>
          </button>)}
        </div>}
      </div>
      <Analysis aggregate={internal} highlight={internalHighlight} />
    </section>
    {snapshot.unclassified.totalLots > 0 && <section className="commercial-dashboard-spaces" aria-label="Pendências de classificação">
      <h2>Pendências de classificação</h2><p>Estes espaços permanecem no total consolidado, fora dos recortes externo e interno.</p>
      <Metrics aggregate={snapshot.unclassified} title="Pendências de classificação" />
      <Analysis aggregate={snapshot.unclassified} highlight={pendingHighlight} />
      <details className="commercial-dashboard-scope-analysis" onToggle={(event) => setPendingOpen(event.currentTarget.open)}><summary>Consultar {snapshot.unclassified.totalLots} espaços pendentes</summary>
        {pendingOpen && <CommercialMiniMap items={snapshot.unclassified.records} title="Classificação pendente" onViewLot={onViewLot} highlightedStatus={pendingHighlight.highlightedStatus} />}
        <ul>{[...new Set(snapshot.unclassified.records.map((record) => record.classificationIssue))].map((reason) =>
          <li key={reason}>{reason}: {snapshot.unclassified.records.filter((record) => record.classificationIssue === reason).length}</li>)}</ul>
      </details>
    </section>}
  </>;
}
