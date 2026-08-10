import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { ArrowDown, ArrowUp, Equal, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  FinancialScenarioSummary,
  ScenarioBridge,
  ScenarioBridgeStep,
  ScenarioContribution,
} from '@/features/financial-management/selectors/financialSelectors';
import type { ScenarioId } from '@/features/financial-management/types';
import {
  formatBRL,
  formatCompactBRL,
  formatPercentage,
} from '@/features/financial-management/utils/financialFormatters';
import { FinancialIntelligenceTooltip } from './FinancialIntelligenceTooltip';

function scenarioResult(summary: FinancialScenarioSummary) {
  return summary.negativeResult > 0
    ? -Math.abs(summary.negativeResult)
    : summary.investmentCapacity;
}

function resultLabel(value: number) {
  if (value < 0) return 'Déficit';
  if (value > 0) return 'Capacidade';
  return 'Equilíbrio';
}

function resultTone(value: number): 'positive' | 'negative' | 'neutral' {
  if (value < 0) return 'negative';
  if (value > 0) return 'positive';
  return 'neutral';
}

function formatSignedBRL(value: number) {
  if (value > 0) return `+${formatBRL(value)}`;
  if (value < 0) return `−${formatBRL(Math.abs(value))}`;
  return formatBRL(0);
}

function useDismissibleChartTooltip<Key extends string>() {
  const [activeKey, setActiveKey] = useState<Key | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (activeKey === null) return undefined;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setActiveKey(null);
    };
    const handlePointerDown = (event: Event) => {
      const target = event.target;
      const root = rootRef.current;
      if (
        root
        && target instanceof Element
        && root.contains(target)
        && target.closest('[data-scenario-tooltip-trigger]')
      ) {
        return;
      }
      setActiveKey(null);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [activeKey]);

  return { activeKey, rootRef, setActiveKey };
}

export interface ScenarioComparisonChartProps {
  data: readonly FinancialScenarioSummary[];
  selectedScenarioId: ScenarioId;
  onSelect: (scenarioId: ScenarioId) => void;
}

/**
 * Two coordinated scales keep the large revenue/commitment amounts legible
 * without flattening the much smaller capacity or deficit signal.
 */
export function ScenarioComparisonChart({
  data,
  selectedScenarioId,
  onSelect,
}: ScenarioComparisonChartProps) {
  const generatedId = useId().replace(/:/g, '');
  const {
    activeKey: activeId,
    rootRef,
    setActiveKey: setActiveId,
  } = useDismissibleChartTooltip<ScenarioId>();
  const financialMaximum = Math.max(
    1,
    ...data.flatMap((scenario) => [scenario.totalRevenue, scenario.totalCommitments]),
  );
  const resultMaximum = Math.max(1, ...data.map((scenario) => Math.abs(scenarioResult(scenario))));

  if (data.length === 0) return null;

  return (
    <figure
      ref={rootRef}
      className="scenario-comparison"
      aria-labelledby={`${generatedId}-comparison-title`}
    >
      <figcaption id={`${generatedId}-comparison-title`} className="sr-only">
        Comparação entre receita, compromissos e resultado dos três cenários financeiros
      </figcaption>

      <div className="scenario-comparison__legend" aria-hidden="true">
        <span data-series="revenue">Receita total</span>
        <span data-series="commitments">Compromissos</span>
        <span data-series="capacity">Capacidade</span>
        <span data-series="deficit">Déficit</span>
      </div>

      <div className="scenario-comparison__scale-guide" aria-label="Escalas da comparação">
        <span data-scale="financial">
          <small>Escala principal · começa em zero</small>
          <strong>Receita e compromissos até {formatCompactBRL(financialMaximum)}</strong>
        </span>
        <span data-scale="result">
          <small>Escala independente · centro em zero</small>
          <strong>−{formatCompactBRL(resultMaximum)} · 0 · +{formatCompactBRL(resultMaximum)}</strong>
        </span>
      </div>

      <div className="scenario-comparison__rows" role="list">
        {data.map((scenario, index) => {
          const result = scenarioResult(scenario);
          const tooltipId = `${generatedId}-${scenario.id}-comparison-tooltip`;
          const active = activeId === scenario.id;
          const selected = selectedScenarioId === scenario.id;
          const revenueWidth = (scenario.totalRevenue / financialMaximum) * 100;
          const commitmentsWidth = (scenario.totalCommitments / financialMaximum) * 100;
          const resultWidth = (Math.abs(result) / resultMaximum) * 50;

          return (
            <div
              key={scenario.id}
              className={cn('scenario-comparison__row', selected && 'is-selected')}
              data-scenario={scenario.id}
              data-result-tone={resultTone(result)}
              role="listitem"
              style={{ '--scenario-row-delay': `${index * 54}ms` } as CSSProperties}
            >
              <button
                type="button"
                className="scenario-comparison__target"
                data-scenario-tooltip-trigger
                aria-label={`${scenario.label}. Receita total ${formatBRL(scenario.totalRevenue)}. Compromissos ${formatBRL(scenario.totalCommitments)}. ${resultLabel(result)} ${formatBRL(Math.abs(result))}.`}
                aria-pressed={selected}
                aria-describedby={active ? tooltipId : undefined}
                onClick={() => onSelect(scenario.id)}
                onFocus={() => setActiveId(scenario.id)}
                onBlur={() => setActiveId(null)}
                onMouseEnter={() => setActiveId(scenario.id)}
                onMouseLeave={() => setActiveId(null)}
                onPointerDown={() => setActiveId(scenario.id)}
              >
                <span className="scenario-comparison__heading">
                  <span>
                    <small>{String(index + 1).padStart(2, '0')}</small>
                    <strong>{scenario.label}</strong>
                  </span>
                  <b data-tone={resultTone(result)}>
                    {result < 0 ? <ArrowDown aria-hidden="true" /> : result > 0 ? <ArrowUp aria-hidden="true" /> : <Equal aria-hidden="true" />}
                    {formatCompactBRL(Math.abs(result))}
                  </b>
                </span>

                <span className="scenario-comparison__financial-scale" aria-hidden="true">
                  <span className="scenario-comparison__financial-track">
                    <i
                      data-series="revenue"
                      style={{ '--scenario-bar-width': `${revenueWidth}%` } as CSSProperties}
                    />
                    <i
                      data-series="commitments"
                      style={{ '--scenario-bar-width': `${commitmentsWidth}%` } as CSSProperties}
                    />
                  </span>
                  <span className="scenario-comparison__scale-values">
                    <b>{formatCompactBRL(scenario.totalRevenue)}</b>
                    <b>{formatCompactBRL(scenario.totalCommitments)}</b>
                  </span>
                </span>

                <span className="scenario-comparison__result-scale" aria-hidden="true">
                  <span className="scenario-comparison__result-label">{resultLabel(result)}</span>
                  <span className="scenario-comparison__result-track">
                    <i className="scenario-comparison__zero" />
                    <i
                      className="scenario-comparison__result-bar"
                      data-direction={result < 0 ? 'negative' : 'positive'}
                      style={{ '--scenario-result-width': `${resultWidth}%` } as CSSProperties}
                    />
                  </span>
                  <strong>{formatCompactBRL(Math.abs(result))}</strong>
                </span>
              </button>

              {active && (
                <FinancialIntelligenceTooltip
                  id={tooltipId}
                  classPrefix="scenario-tooltip"
                  edge="right"
                  eyebrow="Comparação de cenário"
                  title={scenario.label}
                  rows={[
                    { label: 'Receita total', value: formatBRL(scenario.totalRevenue), tone: 'positive' },
                    { label: 'Compromissos', value: formatBRL(scenario.totalCommitments), tone: 'negative' },
                    { label: resultLabel(result), value: formatBRL(Math.abs(result)), tone: resultTone(result) },
                  ]}
                />
              )}
            </div>
          );
        })}
      </div>
    </figure>
  );
}

type WaterfallVisualKind = ScenarioBridgeStep['kind'] | 'reconciliation';

interface WaterfallVisualStep {
  key: string;
  label: string;
  kind: WaterfallVisualKind;
  amount: number;
  signedAmount: number;
  startAmount: number;
  endAmount: number;
  runningTotal: number;
}

function createWaterfallSteps(bridge: ScenarioBridge): WaterfallVisualStep[] {
  const resultStep = bridge.steps.find((step) => step.kind === 'result');
  const arithmeticSteps = bridge.steps.filter((step) => step.kind !== 'result');
  const reconciliationStep: WaterfallVisualStep = {
    key: 'source-reconciliation',
    label: 'Diferença literal da fonte',
    kind: 'reconciliation',
    amount: Math.abs(bridge.reconciliationDelta),
    signedAmount: bridge.reconciliationDelta,
    startAmount: bridge.computedResult,
    endAmount: bridge.literalResult,
    runningTotal: bridge.literalResult,
  };

  return [
    ...arithmeticSteps,
    reconciliationStep,
    ...(resultStep ? [resultStep] : []),
  ];
}

function bridgeStepTone(kind: WaterfallVisualKind, signedAmount: number) {
  if (kind === 'negative') return 'negative';
  if (kind === 'reconciliation') return signedAmount < 0 ? 'negative' : signedAmount > 0 ? 'attention' : 'neutral';
  if (kind === 'result') return signedAmount < 0 ? 'negative' : signedAmount > 0 ? 'result' : 'neutral';
  if (kind === 'subtotal') return 'subtotal';
  return 'positive';
}

export interface ScenarioWaterfallChartProps {
  bridge: ScenarioBridge;
  scenarioLabel: string;
}

export function ScenarioWaterfallChart({ bridge, scenarioLabel }: ScenarioWaterfallChartProps) {
  const generatedId = useId().replace(/:/g, '');
  const { activeKey, rootRef, setActiveKey } = useDismissibleChartTooltip<string>();
  const visualSteps = useMemo(() => createWaterfallSteps(bridge), [bridge]);
  const bounds = visualSteps.flatMap((step) => [0, step.startAmount, step.endAmount]);
  const minimum = Math.min(...bounds);
  const maximum = Math.max(...bounds);
  const range = Math.max(1, maximum - minimum);
  const zeroPosition = ((0 - minimum) / range) * 100;

  return (
    <figure
      ref={rootRef}
      className="scenario-waterfall"
      aria-labelledby={`${generatedId}-waterfall-title`}
    >
      <figcaption id={`${generatedId}-waterfall-title`} className="sr-only">
        Ponte financeira literal do cenário {scenarioLabel}
      </figcaption>

      <div className="scenario-waterfall__summary" aria-hidden="true">
        <span>Resultado calculado <strong>{formatBRL(bridge.computedResult)}</strong></span>
        <span data-kind={bridge.resultKind}>
          Resultado literal <strong>{formatBRL(bridge.literalResult)}</strong>
        </span>
      </div>

      <div
        className="scenario-waterfall__plot"
        role="list"
        style={{ '--scenario-zero-position': `${zeroPosition}%` } as CSSProperties}
      >
        <span className="scenario-waterfall__chart-area" aria-hidden="true">
          <span className="scenario-waterfall__zero-line" />
        </span>
        {visualSteps.map((step, index) => {
          const lower = Math.min(step.startAmount, step.endAmount);
          const upper = Math.max(step.startAmount, step.endAmount);
          const bottom = ((lower - minimum) / range) * 100;
          const height = ((upper - lower) / range) * 100;
          const end = ((step.endAmount - minimum) / range) * 100;
          const active = activeKey === step.key;
          const tooltipId = `${generatedId}-${step.key}-waterfall-tooltip`;
          const tone = bridgeStepTone(step.kind, step.signedAmount);
          const hasMovement = step.signedAmount !== 0;
          const tooltipEdge = index < 3 ? 'left' : index > 5 ? 'right' : 'center';
          const formattedMovement = step.kind === 'reconciliation'
            ? formatSignedBRL(step.signedAmount)
            : formatBRL(step.signedAmount);

          return (
            <div
              key={step.key}
              className="scenario-waterfall__step"
              role="listitem"
              data-kind={step.kind}
              data-tone={tone}
              style={{
                '--scenario-step-bottom': `${bottom}%`,
                '--scenario-step-height': `${height}%`,
                '--scenario-step-end': `${end}%`,
                '--scenario-step-delay': `${index * 56}ms`,
              } as CSSProperties}
            >
              <button
                type="button"
                className="scenario-waterfall__target"
                data-scenario-tooltip-trigger
                aria-label={`${step.label}. Movimento ${formattedMovement}. Saldo ${formatBRL(step.endAmount)}.`}
                aria-describedby={active ? tooltipId : undefined}
                onFocus={() => setActiveKey(step.key)}
                onBlur={() => setActiveKey(null)}
                onMouseEnter={() => setActiveKey(step.key)}
                onMouseLeave={() => setActiveKey(null)}
                onPointerDown={() => setActiveKey(step.key)}
              >
                <span className="scenario-waterfall__geometry" aria-hidden="true">
                  {step.kind === 'reconciliation' ? (
                    <span
                      className="scenario-waterfall__reconciliation-marker"
                      data-zero={!hasMovement || undefined}
                    />
                  ) : hasMovement ? (
                    <span className="scenario-waterfall__bar">
                      {step.signedAmount > 0 ? <Plus /> : <Minus />}
                    </span>
                  ) : null}
                  <span className="scenario-waterfall__connector" />
                </span>
                <span className="scenario-waterfall__step-copy">
                  <strong>{step.label}</strong>
                  <small>
                    {step.kind === 'reconciliation'
                      ? formatSignedBRL(step.signedAmount)
                      : formatCompactBRL(step.signedAmount)}
                  </small>
                </span>
              </button>

              {active && (
                <FinancialIntelligenceTooltip
                  id={tooltipId}
                  classPrefix="scenario-tooltip"
                  edge={tooltipEdge}
                  eyebrow="Ponte financeira"
                  title={step.label}
                  rows={step.kind === 'result' ? [
                    { label: 'Resultado calculado', value: formatBRL(bridge.computedResult) },
                    { label: 'Diferença literal', value: formatSignedBRL(bridge.reconciliationDelta), tone: resultTone(bridge.reconciliationDelta) },
                    { label: 'Resultado da fonte', value: formatBRL(bridge.literalResult), tone: resultTone(bridge.literalResult) },
                  ] : [
                    { label: 'Movimento', value: formattedMovement, tone: resultTone(step.signedAmount) },
                    { label: 'Antes', value: formatBRL(step.startAmount) },
                    { label: 'Depois', value: formatBRL(step.endAmount) },
                  ]}
                />
              )}
            </div>
          );
        })}
      </div>

      <p className="scenario-waterfall__reconciliation" data-has-difference={bridge.reconciliationDelta !== 0}>
        <Equal aria-hidden="true" />
        <span>
          Diferença literal preservada
          <strong>{formatSignedBRL(bridge.reconciliationDelta)}</strong>
        </span>
      </p>
    </figure>
  );
}

export interface ScenarioContributionsChartProps {
  data: readonly ScenarioContribution[];
  scenarioLabel: string;
}

export function ScenarioContributionsChart({
  data,
  scenarioLabel,
}: ScenarioContributionsChartProps) {
  const generatedId = useId().replace(/:/g, '');
  const { activeKey, rootRef, setActiveKey } = useDismissibleChartTooltip<string>();
  const groups = [
    {
      direction: 'positive' as const,
      title: 'Receitas',
      eyebrow: '8 contribuições positivas',
      items: data.filter((item) => item.direction === 'positive'),
    },
    {
      direction: 'negative' as const,
      title: 'Compromissos',
      eyebrow: '3 contribuições negativas',
      items: data.filter((item) => item.direction === 'negative'),
    },
  ];

  return (
    <figure
      ref={rootRef}
      className="scenario-contributions"
      aria-labelledby={`${generatedId}-contributions-title`}
    >
      <figcaption id={`${generatedId}-contributions-title`} className="sr-only">
        Fontes positivas e compromissos do cenário {scenarioLabel}
      </figcaption>

      {groups.map((group) => {
        const maximum = Math.max(1, ...group.items.map((item) => item.amount));
        return (
          <section key={group.direction} className="scenario-contributions__group" data-direction={group.direction}>
            <header>
              <span>{group.eyebrow}</span>
              <h3>{group.title}</h3>
            </header>
            <div role="list" className="scenario-contributions__list">
              {group.items.map((item, index) => {
                const active = activeKey === item.key;
                const tooltipId = `${generatedId}-${item.key}-contribution-tooltip`;
                return (
                  <div
                    key={item.key}
                    role="listitem"
                    className="scenario-contributions__item"
                    style={{ '--scenario-contribution-delay': `${index * 38}ms` } as CSSProperties}
                  >
                    <button
                      type="button"
                      data-scenario-tooltip-trigger
                      aria-label={`${item.label}. ${formatBRL(item.amount)}. ${formatPercentage(item.sharePercentage)} do grupo.`}
                      aria-describedby={active ? tooltipId : undefined}
                      onFocus={() => setActiveKey(item.key)}
                      onBlur={() => setActiveKey(null)}
                      onMouseEnter={() => setActiveKey(item.key)}
                      onMouseLeave={() => setActiveKey(null)}
                      onPointerDown={() => setActiveKey(item.key)}
                    >
                      <span className="scenario-contributions__heading" aria-hidden="true">
                        <strong>{item.label}</strong>
                        <small>{formatCompactBRL(item.amount)}</small>
                      </span>
                      <span className="scenario-contributions__track" aria-hidden="true">
                        <i style={{ '--scenario-contribution-width': `${(item.amount / maximum) * 100}%` } as CSSProperties} />
                      </span>
                      <span className="scenario-contributions__share" aria-hidden="true">
                        {formatPercentage(item.sharePercentage)}
                      </span>
                    </button>

                    {active && (
                      <FinancialIntelligenceTooltip
                        id={tooltipId}
                        classPrefix="scenario-tooltip"
                        edge={group.direction === 'positive' ? 'left' : 'right'}
                        eyebrow={group.direction === 'positive' ? 'Fonte de receita' : 'Compromisso'}
                        title={item.label}
                        rows={[
                          { label: 'Valor', value: formatBRL(item.amount), tone: group.direction },
                          { label: 'Participação no grupo', value: formatPercentage(item.sharePercentage) },
                          { label: 'Impacto no resultado', value: formatBRL(item.signedAmount), tone: group.direction },
                        ]}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </figure>
  );
}
