import { useState, type CSSProperties } from 'react';
import {
  formatDashboardCurrency,
  formatDashboardInteger,
  formatDashboardPercentage,
} from './commercialDashboardFormatters';
import type { CommercialSegmentDashboardSnapshot } from './commercialDashboardTypes';

type ComparisonMode = 'area' | 'lots' | 'value';

const COMPARISON_OPTIONS: readonly { id: ComparisonMode; label: string }[] = [
  { id: 'lots', label: 'Quantidade de lotes' },
  { id: 'area', label: 'Área' },
  { id: 'value', label: 'Valor comercial' },
];

export function CommercialDashboardComparison({ segments }: { segments: readonly CommercialSegmentDashboardSnapshot[] }) {
  const [mode, setMode] = useState<ComparisonMode>('lots');

  return <section className="commercial-dashboard-comparison" aria-labelledby="commercial-dashboard-comparison-title">
    <div className="commercial-dashboard-section-heading">
      <div>
        <span className="commercial-dashboard-eyebrow">Leitura comparada</span>
        <h2 id="commercial-dashboard-comparison-title">Comparativo dos segmentos</h2>
      </div>
      <div className="commercial-dashboard-comparison-controls" role="group" aria-label="Métrica de comparação">
        {COMPARISON_OPTIONS.map((option) => <button
          type="button"
          key={option.id}
          className={mode === option.id ? 'is-active' : ''}
          aria-pressed={mode === option.id}
          onClick={() => setMode(option.id)}
        >{option.label}</button>)}
      </div>
    </div>
    <p className="commercial-dashboard-comparison-description">
      {mode === 'area' && 'Percentual da área comercial oficial vendida em cada segmento.'}
      {mode === 'lots' && 'Percentual dos lotes comerciais vendidos em cada segmento.'}
      {mode === 'value' && 'Participação dos lotes vendidos no valor comercial conhecido do segmento. Lotes sem preço ficam fora do percentual.'}
    </p>
    <div className="commercial-dashboard-comparison-rows">
      {segments.map((segment) => {
        const hasComparableData = mode === 'area'
          ? segment.totalAreaSqm > 0
          : mode === 'lots'
            ? segment.commercialLots > 0
            : segment.soldValuePercentage !== null;
        const amount = mode === 'area'
          ? segment.soldAreaPercentage
          : mode === 'lots'
            ? segment.soldLotPercentage
            : segment.soldValuePercentage ?? 0;
        const label = hasComparableData
          ? formatDashboardPercentage(amount)
          : mode === 'area' ? 'Área pendente' : mode === 'value' ? 'Sem valores definidos' : 'Sem lotes';
        const barWidth = hasComparableData ? amount : 0;
        const rowStyle = {
          '--dashboard-segment-accent': segment.segment.palette.surface,
        } as CSSProperties;

        return <div className="commercial-dashboard-comparison-row" key={segment.segmentId} style={rowStyle}>
          <div className="commercial-dashboard-comparison-row-header">
            <span>{segment.segment.name}</span>
            <strong title={hasComparableData && mode === 'value'
              ? `${formatDashboardCurrency(segment.soldValue)} vendidos de ${formatDashboardCurrency(segment.totalKnownValue)} conhecidos`
              : undefined}>{label}</strong>
          </div>
          <div className="commercial-dashboard-comparison-track" role="img" aria-label={`${segment.segment.name}: ${label}`}>
            <i style={{ width: `${barWidth}%` }} />
          </div>
          {mode === 'value' && segment.lotsWithoutPrice > 0 && <small className="commercial-dashboard-comparison-pending">
            {formatDashboardInteger(segment.lotsWithoutPrice)} {segment.lotsWithoutPrice === 1 ? 'lote sem preço' : 'lotes sem preço'}
          </small>}
        </div>;
      })}
    </div>
  </section>;
}
