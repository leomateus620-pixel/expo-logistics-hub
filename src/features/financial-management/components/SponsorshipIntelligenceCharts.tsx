import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDollarSign } from 'lucide-react';
import type { SponsorTier } from '../types';
import {
  formatBRL,
  formatCompactBRL,
  formatPercentage,
} from '../utils/financialFormatters';
import { FinancialIntelligenceTooltip } from './FinancialIntelligenceTooltip';

type FinancialChartStyle = CSSProperties & Record<`--${string}`, string | number>;

export interface SponsorshipTierDatum {
  tier: SponsorTier;
  sponsorCount: number;
  financialSponsorCount: number;
  projectedAmount: number;
  consolidatedAmount: number;
  projectedSharePercentage: number;
}

export interface SponsorshipParetoDatum {
  id: string;
  name: string;
  tier: SponsorTier;
  sourceRow: number;
  projectedAmount: number;
  consolidatedAmount: number;
  sharePercentage: number;
  cumulativeSharePercentage: number;
}

export interface SponsorshipResourceDatum {
  id: 'free-resource' | 'rouanet';
  label: string;
  projectedAmount: number;
  consolidatedAmount: number;
  consolidationRate: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function SponsorshipConsolidationRail({
  projectedAmount,
  consolidatedAmount,
  receivableAmount,
  consolidationGapAmount,
  consolidationRate,
}: {
  projectedAmount: number;
  consolidatedAmount: number;
  receivableAmount: number;
  consolidationGapAmount: number;
  consolidationRate: number;
}) {
  const railTooltipId = useId();
  const receivableTooltipId = useId();
  const projectedWidth = Math.max(projectedAmount, consolidatedAmount, 1);
  const consolidatedWidth = clamp((consolidatedAmount / projectedWidth) * 100, 0, 100);

  return (
    <div className="fsi-consolidation" aria-label="Fluxo de consolidação dos patrocínios">
      <div className="fsi-consolidation__flow">
        <div
          className="fsi-consolidation__rail fsi-focusable"
          tabIndex={0}
          role="img"
          aria-describedby={railTooltipId}
          aria-label={`Projetado ${formatBRL(projectedAmount)}; consolidado ${formatBRL(consolidatedAmount)}; lacuna ${formatBRL(consolidationGapAmount)}; taxa ${formatPercentage(consolidationRate, 2)}`}
        >
          <div className="fsi-consolidation__labels">
            <span><small>Projetado</small><strong>{formatBRL(projectedAmount)}</strong></span>
            <span><small>Consolidado</small><strong>{formatBRL(consolidatedAmount)}</strong></span>
          </div>
          <div className="fsi-consolidation__track" aria-hidden="true">
            <span
              className="fsi-consolidation__fill"
              style={{ '--fsi-width': `${consolidatedWidth}%` } as FinancialChartStyle}
            />
            <span
              className="fsi-consolidation__gap"
              style={{ '--fsi-width': `${100 - consolidatedWidth}%` } as FinancialChartStyle}
            />
          </div>
          <div className="fsi-consolidation__foot">
            <span><CheckCircle2 aria-hidden="true" /> {formatPercentage(consolidationRate, 2)} consolidado</span>
            <span>{formatBRL(consolidationGapAmount)} de lacuna</span>
          </div>
          <FinancialIntelligenceTooltip
            id={railTooltipId}
            as="span"
            classPrefix="fsi-tooltip"
            eyebrow="Projetado × consolidado"
            title={`${formatPercentage(consolidationRate, 2)} da projeção consolidada`}
            rows={[
              { label: 'Projetado', value: formatBRL(projectedAmount) },
              { label: 'Consolidado', value: formatBRL(consolidatedAmount), tone: 'positive' },
              { label: 'Lacuna', value: formatBRL(consolidationGapAmount), tone: 'attention' },
            ]}
          />
        </div>

        <div className="fsi-consolidation__connector" aria-hidden="true">
          <span />
          <ArrowDownRight />
        </div>

        <div
          className="fsi-consolidation__receivable fsi-focusable"
          tabIndex={0}
          role="note"
          aria-describedby={receivableTooltipId}
          aria-label={`A receber informado: ${formatBRL(receivableAmount)}. Campo independente da lacuna de consolidação.`}
        >
          <span className="fsi-consolidation__receivable-icon"><CircleDollarSign aria-hidden="true" /></span>
          <span>
            <small>A receber informado</small>
            <strong>{formatBRL(receivableAmount)}</strong>
            <em>campo independente da lacuna</em>
          </span>
          <FinancialIntelligenceTooltip
            id={receivableTooltipId}
            as="span"
            classPrefix="fsi-tooltip"
            eyebrow="Campo explícito da fonte"
            title={formatBRL(receivableAmount)}
            rows={[
              { label: 'Lacuna de consolidação', value: formatBRL(consolidationGapAmount) },
              { label: 'Leitura', value: 'Não equivalentes', tone: 'attention' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export function SponsorshipResourceComposition({
  resources,
}: {
  resources: readonly SponsorshipResourceDatum[];
}) {
  const chartId = useId();
  const projectedTotal = resources.reduce((sum, item) => sum + item.projectedAmount, 0);
  const consolidatedTotal = resources.reduce((sum, item) => sum + item.consolidatedAmount, 0);
  const maximum = Math.max(projectedTotal, consolidatedTotal, 1);
  const series = [
    {
      id: 'projected',
      label: 'Projetado',
      total: projectedTotal,
      amount: (resource: SponsorshipResourceDatum) => resource.projectedAmount,
    },
    {
      id: 'consolidated',
      label: 'Consolidado',
      total: consolidatedTotal,
      amount: (resource: SponsorshipResourceDatum) => resource.consolidatedAmount,
    },
  ] as const;

  return (
    <div className="fsi-resources" aria-labelledby={`${chartId}-title`}>
      <h3 id={`${chartId}-title`} className="sr-only">Composição entre Recurso Livre e Lei Rouanet</h3>
      <div className="fsi-resources__legend" aria-hidden="true">
        {resources.map((resource) => (
          <span key={resource.id} data-resource={resource.id}>{resource.label}</span>
        ))}
      </div>
      <div className="fsi-resources__rows">
        {series.map((item) => (
          <div
            key={item.id}
            className="fsi-resources__row"
            data-series={item.id}
            aria-label={`${item.label}: ${formatBRL(item.total)}`}
          >
            <div className="fsi-resources__identity">
              <strong>{item.label}</strong>
              <span>{formatPercentage((item.total / projectedTotal) * 100, 2)} da projeção</span>
            </div>
            <div className="fsi-resources__stack">
              {resources.map((resource) => {
                const amount = item.amount(resource);
                const tooltipId = `${chartId}-${item.id}-${resource.id}`;
                return (
                  <span
                    key={resource.id}
                    className="fsi-resources__segment fsi-focusable"
                    data-resource={resource.id}
                    tabIndex={0}
                    role="img"
                    aria-describedby={tooltipId}
                    aria-label={`${item.label}, ${resource.label}: ${formatBRL(amount)}`}
                    onPointerDown={(event) => event.currentTarget.focus()}
                    style={{ '--fsi-width': `${(amount / maximum) * 100}%` } as FinancialChartStyle}
                  >
                    <FinancialIntelligenceTooltip
                      id={tooltipId}
                      as="span"
                      classPrefix="fsi-tooltip"
                      eyebrow={`${item.label} · ${resource.label}`}
                      title={formatBRL(amount)}
                      rows={[
                        { label: 'Participação na barra', value: formatPercentage((amount / item.total) * 100, 2) },
                        { label: 'Taxa de consolidação', value: formatPercentage(resource.consolidationRate, 2), tone: 'positive' },
                      ]}
                    />
                  </span>
                );
              })}
              <span className="fsi-resources__remainder" aria-hidden="true" />
            </div>
            <strong className="fsi-resources__value">{formatCompactBRL(item.total)}</strong>
          </div>
        ))}
      </div>
      <dl className="fsi-resources__rates">
        {resources.map((resource) => (
          <div key={resource.id}>
            <dt>{resource.label}</dt>
            <dd>{formatPercentage(resource.consolidationRate, 2)} consolidado</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function SponsorshipTierRanking({
  tiers,
  selectedTier,
  onSelectTier,
}: {
  tiers: readonly SponsorshipTierDatum[];
  selectedTier: SponsorTier | null;
  onSelectTier: (tier: SponsorTier | null) => void;
}) {
  const chartId = useId();
  const maximum = Math.max(1, ...tiers.flatMap((tier) => [
    tier.projectedAmount,
    tier.consolidatedAmount,
  ]));

  return (
    <div className="fsi-tier-ranking" aria-label="Capital por categoria">
      <div className="fsi-tier-ranking__toolbar">
        <div>
          <p>Escala monetária única · categorias explícitas da fonte</p>
        </div>
      </div>
      <div className="fsi-tier-ranking__legend" aria-hidden="true">
        <span data-series="projected">Projetado</span>
        <span data-series="consolidated">Consolidado</span>
      </div>
      <div className="fsi-tier-ranking__list">
        {tiers.map((tier, index) => {
          const isSelected = selectedTier === tier.tier;
          const tooltipId = `${chartId}-tier-${index}`;
          const delta = tier.consolidatedAmount - tier.projectedAmount;
          const deltaDescription = delta === 0
            ? 'Sem diferença entre projetado e consolidado'
            : delta > 0
              ? `Consolidado ${formatBRL(delta)} acima da projeção`
              : `Lacuna de ${formatBRL(Math.abs(delta))}`;
          return (
            <button
              key={tier.tier}
              type="button"
              className="fsi-tier-row"
              data-active={isSelected || undefined}
              data-dimmed={Boolean(selectedTier && !isSelected) || undefined}
              aria-pressed={isSelected}
              aria-label={`${tier.tier}. ${tier.sponsorCount} registros, ${tier.financialSponsorCount} com valor. Projetado ${formatBRL(tier.projectedAmount)}. Consolidado ${formatBRL(tier.consolidatedAmount)}. ${deltaDescription}. Participação ${formatPercentage(tier.projectedSharePercentage, 2)}.`}
              onClick={() => onSelectTier(isSelected ? null : tier.tier)}
            >
              <span className="fsi-tier-row__identity">
                <b>{tier.tier}</b>
                <small>{tier.sponsorCount} registros · {tier.financialSponsorCount} com valor</small>
              </span>
              <span className="fsi-tier-row__plot" aria-hidden="true">
                <i
                  data-series="projected"
                  style={{ '--fsi-width': `${(tier.projectedAmount / maximum) * 100}%` } as FinancialChartStyle}
                />
                <i
                  data-series="consolidated"
                  style={{ '--fsi-width': `${(tier.consolidatedAmount / maximum) * 100}%` } as FinancialChartStyle}
                />
                <em>{formatCompactBRL(tier.projectedAmount)}</em>
              </span>
              <span className="fsi-tier-row__share">
                <b>{formatPercentage(tier.projectedSharePercentage)}</b>
                <small>da projeção</small>
              </span>
              <FinancialIntelligenceTooltip
                id={tooltipId}
                as="span"
                classPrefix="fsi-tooltip"
                eyebrow={`${index + 1}ª posição`}
                title={tier.tier}
                rows={[
                  { label: 'Projetado', value: formatBRL(tier.projectedAmount) },
                  { label: 'Consolidado', value: formatBRL(tier.consolidatedAmount), tone: 'positive' },
                  {
                    label: delta === 0 ? 'Sem diferença' : delta > 0 ? 'Acima da projeção' : 'Lacuna',
                    value: formatBRL(Math.abs(delta)),
                    tone: delta === 0 ? 'neutral' : delta > 0 ? 'positive' : 'attention',
                  },
                  { label: 'Participação', value: formatPercentage(tier.projectedSharePercentage, 2) },
                ]}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function paretoPoint(points: readonly SponsorshipParetoDatum[], index: number) {
  if (points.length <= 1) return { x: 0, y: 100 - (points[0]?.cumulativeSharePercentage ?? 0) };
  const point = points[index];
  return {
    x: (index / (points.length - 1)) * 100,
    y: 100 - clamp(point.cumulativeSharePercentage, 0, 100),
  };
}

export function SponsorshipParetoChart({
  points,
  selectedTier,
  onSelectSponsor,
}: {
  points: readonly SponsorshipParetoDatum[];
  selectedTier: SponsorTier | null;
  onSelectSponsor: (sponsorId: string) => void;
}) {
  const chartId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const pointerGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrubbing: boolean;
  } | null>(null);
  const safeIndex = clamp(activeIndex, 0, Math.max(points.length - 1, 0));
  const activePoint = points[safeIndex];
  const maximumProjected = Math.max(1, ...points.map((point) => point.projectedAmount));
  const linePoints = useMemo(
    () => points.map((_, index) => {
      const point = paretoPoint(points, index);
      return `${point.x},${point.y}`;
    }).join(' '),
    [points],
  );
  const activePosition = activePoint ? paretoPoint(points, safeIndex) : { x: 0, y: 100 };

  useEffect(() => {
    if (!selectedTier) return;
    const firstMatchingIndex = points.findIndex((point) => point.tier === selectedTier);
    if (firstMatchingIndex >= 0) setActiveIndex(firstMatchingIndex);
  }, [points, selectedTier]);

  const setFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (points.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = clamp((event.clientX - bounds.left) / Math.max(bounds.width, 1), 0, 1);
    setActiveIndex(Math.round(ratio * (points.length - 1)));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrubbing: event.pointerType === 'mouse',
    };

    if (event.pointerType === 'mouse') setFromPointer(event);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') {
      setFromPointer(event);
      return;
    }

    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const horizontalDistance = Math.abs(event.clientX - gesture.startX);
    const verticalDistance = Math.abs(event.clientY - gesture.startY);
    if (!gesture.scrubbing) {
      if (horizontalDistance < 8 || horizontalDistance <= verticalDistance) return;
      gesture.scrubbing = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    setFromPointer(event);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const horizontalDistance = Math.abs(event.clientX - gesture.startX);
    const verticalDistance = Math.abs(event.clientY - gesture.startY);
    if (!gesture.scrubbing && horizontalDistance < 8 && verticalDistance < 8) {
      setFromPointer(event);
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    pointerGestureRef.current = null;
  };

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerGestureRef.current?.pointerId === event.pointerId) {
      pointerGestureRef.current = null;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (points.length === 0) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => clamp(current - 1, 0, points.length - 1));
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => clamp(current + 1, 0, points.length - 1));
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(points.length - 1);
    }
    if ((event.key === 'Enter' || event.key === ' ') && activePoint) {
      event.preventDefault();
      onSelectSponsor(activePoint.id);
    }
  };

  if (!activePoint) return null;

  const tooltipId = `${chartId}-tooltip`;
  return (
    <div className="fsi-pareto" aria-label="Concentração da carteira">
      <div className="fsi-pareto__header">
        <div>
          <p>100 registros · barras por valor projetado · curva de participação acumulada</p>
        </div>
        <div className="fsi-pareto__legend" aria-hidden="true">
          <span data-series="projected">Projetado</span>
          <span data-series="cumulative">Acumulado</span>
        </div>
      </div>

      <div
        className="fsi-pareto__plot fsi-focusable"
        role="slider"
        tabIndex={0}
        aria-label="Percorrer patrocinadores por concentração"
        aria-valuemin={1}
        aria-valuemax={points.length}
        aria-valuenow={safeIndex + 1}
        aria-valuetext={`${activePoint.name}, ${formatBRL(activePoint.projectedAmount)}, ${formatPercentage(activePoint.cumulativeSharePercentage, 2)} acumulado`}
        aria-describedby={`${chartId}-instructions ${tooltipId}`}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onDoubleClick={() => onSelectSponsor(activePoint.id)}
        onKeyDown={handleKeyDown}
      >
        <span id={`${chartId}-instructions`} className="sr-only">
          Use as setas para percorrer os patrocinadores. Pressione Enter para abrir o detalhe.
        </span>
        <div className="fsi-pareto__grid" aria-hidden="true">
          <span style={{ '--fsi-y': '20%' } as FinancialChartStyle}><i>80%</i></span>
          <span style={{ '--fsi-y': '50%' } as FinancialChartStyle}><i>50%</i></span>
          <span style={{ '--fsi-y': '80%' } as FinancialChartStyle}><i>20%</i></span>
        </div>
        <div className="fsi-pareto__bars" aria-hidden="true">
          {points.map((point, index) => (
            <span
              key={point.id}
              data-active={index === safeIndex || undefined}
              data-dimmed={Boolean(selectedTier && point.tier !== selectedTier) || undefined}
              style={{
                '--fsi-height': `${clamp((point.projectedAmount / maximumProjected) * 100, point.projectedAmount > 0 ? 1.5 : 0, 100)}%`,
              } as FinancialChartStyle}
            />
          ))}
        </div>
        <svg className="fsi-pareto__curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={linePoints} />
          <line x1={activePosition.x} x2={activePosition.x} y1="0" y2="100" />
          <circle cx={activePosition.x} cy={activePosition.y} r="1.6" vectorEffect="non-scaling-stroke" />
        </svg>
        <span
          className="fsi-pareto__cursor"
          style={{ '--fsi-x': `${activePosition.x}%` } as FinancialChartStyle}
          aria-hidden="true"
        />
        <FinancialIntelligenceTooltip
          id={tooltipId}
          as="span"
          classPrefix="fsi-tooltip"
          className="fsi-pareto__tooltip"
          edge={activePosition.x > 70 ? 'right' : activePosition.x < 30 ? 'left' : 'center'}
          style={{ '--fsi-x': `${activePosition.x}%` } as FinancialChartStyle}
          eyebrow={`#${safeIndex + 1} · ${activePoint.tier}`}
          title={activePoint.name}
          rows={[
            { label: 'Projetado', value: formatBRL(activePoint.projectedAmount) },
            { label: 'Consolidado', value: formatBRL(activePoint.consolidatedAmount) },
            { label: 'Participação', value: formatPercentage(activePoint.sharePercentage, 2), tone: 'positive' },
            { label: 'Acumulado', value: formatPercentage(activePoint.cumulativeSharePercentage, 2) },
          ]}
          footer="Enter abre o detalhe"
        />
      </div>

      <div className="fsi-pareto__axis" aria-hidden="true">
        <span>Maior valor</span>
        <span>Cauda da carteira</span>
      </div>

      <button
        type="button"
        className="fsi-pareto__active-action"
        onClick={() => onSelectSponsor(activePoint.id)}
      >
        <span><small>Patrocinador em foco</small><strong>{activePoint.name}</strong></span>
        <span>Ver composição <ArrowUpRight aria-hidden="true" /></span>
      </button>

      <table className="sr-only">
        <caption>Patrocinadores ordenados por valor projetado</caption>
        <thead><tr><th>Posição</th><th>Patrocinador</th><th>Categoria</th><th>Projetado</th><th>Consolidado</th><th>Participação acumulada</th></tr></thead>
        <tbody>
          {points.map((point, index) => (
            <tr key={point.id}>
              <td>{index + 1}</td><th scope="row">{point.name}</th><td>{point.tier}</td>
              <td>{formatBRL(point.projectedAmount)}</td><td>{formatBRL(point.consolidatedAmount)}</td>
              <td>{formatPercentage(point.cumulativeSharePercentage, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SponsorshipConcentrationBand({
  top5Share,
  top10Share,
  top20Share,
  sponsorCount,
}: {
  top5Share: number;
  top10Share: number;
  top20Share: number;
  sponsorCount: number;
}) {
  const bands = [
    { label: 'Top 5', value: top5Share },
    { label: 'Top 10', value: top10Share },
    { label: 'Top 20', value: top20Share },
  ];

  return (
    <dl className="fsi-concentration-band" aria-label="Indicadores de concentração da carteira">
      {bands.map((band) => (
        <div key={band.label}>
          <dt>{band.label}</dt>
          <dd>{formatPercentage(band.value, 2)}</dd>
          <span aria-hidden="true"><i style={{ '--fsi-width': `${clamp(band.value, 0, 100)}%` } as FinancialChartStyle} /></span>
        </div>
      ))}
      <div className="fsi-concentration-band__coverage">
        <dt>Cobertura</dt>
        <dd>{sponsorCount}</dd>
        <p>registros preservados</p>
      </div>
    </dl>
  );
}

export function SponsorshipDeltaSignal({ projected, consolidated }: { projected: number; consolidated: number }) {
  const delta = consolidated - projected;
  if (delta === 0) {
    return (
      <span className="fsi-delta" data-neutral="true">
        <CheckCircle2 aria-hidden="true" />
        Sem diferença
      </span>
    );
  }

  const isPositive = delta > 0;
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="fsi-delta" data-positive={isPositive || undefined}>
      <Icon aria-hidden="true" />
      {isPositive ? 'Acima' : 'Lacuna'} de {formatBRL(Math.abs(delta))}
    </span>
  );
}
