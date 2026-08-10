import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  BookOpenCheck,
  Calculator,
  ChartNoAxesCombined,
  Handshake,
  PiggyBank,
  ReceiptText,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getModuleRoute,
  type CommissionModule,
} from '@/modules/commissions/commissionRegistry';
import { financialScenarios } from '@/features/financial-management/data/financial2026Data';
import {
  selectScenarioBridge,
  selectScenarioContributions,
  selectScenarioSummaries,
} from '@/features/financial-management/selectors/financialSelectors';
import type { ScenarioId } from '@/features/financial-management/types';
import {
  FinancialKpiCard,
  FinancialKpiGrid,
} from '@/features/financial-management/components/FinancialPrimitives';
import {
  ScenarioComparisonChart,
  ScenarioContributionsChart,
  ScenarioWaterfallChart,
} from './ScenarioIntelligenceCharts';
import {
  formatBRL,
  formatCompactBRL,
} from '@/features/financial-management/utils/financialFormatters';
import '@/styles/financial-scenario-intelligence.css';

export interface ScenarioIntelligenceViewProps {
  module: CommissionModule;
}

const SCENARIO_ORDER: readonly ScenarioId[] = ['realistic', 'pessimistic', 'optimistic'];

function scenarioResult(investmentCapacity: number, negativeResult: number) {
  return negativeResult > 0 ? -Math.abs(negativeResult) : investmentCapacity;
}

export function ScenarioIntelligenceView({ module }: ScenarioIntelligenceViewProps) {
  const summaries = useMemo(() => selectScenarioSummaries(financialScenarios), []);
  const [selectedScenarioId, setSelectedScenarioId] = useState<ScenarioId>('realistic');
  const selectorRefs = useRef<Partial<Record<ScenarioId, HTMLButtonElement | null>>>({});
  const selectedScenario = summaries.find((scenario) => scenario.id === selectedScenarioId)
    ?? summaries[0];
  const selectedResult = scenarioResult(
    selectedScenario.investmentCapacity,
    selectedScenario.negativeResult,
  );
  const bridge = useMemo(
    () => selectScenarioBridge(selectedScenario),
    [selectedScenario],
  );
  const contributions = useMemo(
    () => selectScenarioContributions(selectedScenario),
    [selectedScenario],
  );

  const selectScenario = (scenarioId: ScenarioId, moveFocus = false) => {
    setSelectedScenarioId(scenarioId);
    if (moveFocus) {
      window.requestAnimationFrame(() => selectorRefs.current[scenarioId]?.focus());
    }
  };

  const handleSelectorKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentId: ScenarioId,
  ) => {
    const currentIndex = SCENARIO_ORDER.indexOf(currentId);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % SCENARIO_ORDER.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + SCENARIO_ORDER.length) % SCENARIO_ORDER.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = SCENARIO_ORDER.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    selectScenario(SCENARIO_ORDER[nextIndex], true);
  };

  return (
    <section
      className="scenario-intelligence"
      data-selected-scenario={selectedScenario.id}
      data-scenario-motion="always"
      aria-labelledby="scenario-intelligence-title"
    >
      <h2 id="scenario-intelligence-title" className="sr-only">
        Inteligência de cenários financeiros
      </h2>

      <section className="scenario-selector-shell" aria-labelledby="scenario-selector-title">
        <div className="scenario-intelligence__section-heading scenario-intelligence__section-heading--selector">
          <span className="scenario-intelligence__section-icon" aria-hidden="true">
            <SlidersHorizontal />
          </span>
          <div>
            <span>Contexto de decisão</span>
            <h2 id="scenario-selector-title">Cenário em análise</h2>
          </div>
        </div>

        <div
          className="scenario-selector"
          role="radiogroup"
          aria-label="Selecionar cenário financeiro"
          aria-controls="scenario-analytical-context"
        >
          {summaries.map((scenario, index) => {
            const result = scenarioResult(scenario.investmentCapacity, scenario.negativeResult);
            const selected = scenario.id === selectedScenario.id;
            return (
              <button
                key={scenario.id}
                ref={(node) => { selectorRefs.current[scenario.id] = node; }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                className={cn('scenario-selector__option', selected && 'is-selected')}
                data-scenario={scenario.id}
                data-result={result < 0 ? 'deficit' : 'capacity'}
                onClick={() => selectScenario(scenario.id)}
                onKeyDown={(event) => handleSelectorKeyDown(event, scenario.id)}
              >
                <span className="scenario-selector__index">{String(index + 1).padStart(2, '0')}</span>
                <span className="scenario-selector__identity">
                  <strong>{scenario.label}</strong>
                  <small>Receita {formatCompactBRL(scenario.totalRevenue)}</small>
                </span>
                <span className="scenario-selector__result">
                  <small>{result < 0 ? 'Déficit' : 'Capacidade'}</small>
                  <strong>{formatCompactBRL(Math.abs(result))}</strong>
                </span>
              </button>
            );
          })}
        </div>

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          Cenário {selectedScenario.label} selecionado. Receita total {formatBRL(selectedScenario.totalRevenue)}.
          {' '}{selectedResult < 0 ? 'Déficit' : 'Capacidade de investimento'} {formatBRL(Math.abs(selectedResult))}.
        </p>
      </section>

      <div id="scenario-analytical-context" className="scenario-intelligence__workspace">
        <FinancialKpiGrid
          columns={5}
          className="scenario-intelligence__kpis"
          aria-label={`Indicadores executivos do cenário ${selectedScenario.label}`}
        >
          <FinancialKpiCard
            label="Receita total"
            value={selectedScenario.totalRevenue}
            icon={TrendingUp}
            tone="consolidated"
            priority="primary"
            animateValue
            detail={`Cenário ${selectedScenario.label}`}
            sourceLabel={`PROJEÇÃO 2026 · ${selectedScenario.label}`}
            className="scenario-intelligence__kpi scenario-intelligence__kpi--revenue"
          />
          <FinancialKpiCard
            label="Compromissos"
            value={selectedScenario.totalCommitments}
            icon={ReceiptText}
            tone="gold"
            priority="primary"
            animateValue
            detail="Execução, obrigações e reserva"
            className="scenario-intelligence__kpi scenario-intelligence__kpi--commitments"
          />
          <FinancialKpiCard
            label={selectedResult < 0 ? 'Déficit projetado' : 'Capacidade de investimento'}
            value={Math.abs(selectedResult)}
            icon={selectedResult < 0 ? TrendingDown : PiggyBank}
            tone={selectedResult < 0 ? 'over-budget' : 'consolidated'}
            status={selectedResult < 0 ? 'over-budget' : 'consolidated'}
            statusLabel={selectedResult < 0 ? 'DÉFICIT' : 'CAPACIDADE'}
            priority="primary"
            animateValue
            detail="Valor literal da planilha"
            sourceLabel={`PROJEÇÃO 2026 · resultado ${selectedScenario.label}`}
            className="scenario-intelligence__kpi scenario-intelligence__kpi--result"
          />
          <FinancialKpiCard
            label="Receita comercial"
            value={selectedScenario.commercialRevenue}
            icon={Banknote}
            tone="projected"
            priority="secondary"
            animateValue
            detail="Seis fontes comerciais"
            className="scenario-intelligence__kpi scenario-intelligence__kpi--supporting"
          />
          <FinancialKpiCard
            label="Patrocínios"
            value={selectedScenario.sponsorshipRevenue}
            icon={Handshake}
            tone="projected"
            priority="secondary"
            animateValue
            detail={`${formatCompactBRL(selectedScenario.freeSponsorship)} Livre · ${formatCompactBRL(selectedScenario.rouanetSponsorship)} Rouanet`}
            className="scenario-intelligence__kpi scenario-intelligence__kpi--supporting"
          />
        </FinancialKpiGrid>

        <section className="scenario-intelligence__panel scenario-intelligence__panel--comparison" aria-labelledby="scenario-comparison-title">
          <div className="scenario-intelligence__section-heading">
            <span className="scenario-intelligence__section-icon" aria-hidden="true">
              <ChartNoAxesCombined />
            </span>
            <div>
              <span>Leitura comparativa</span>
              <h2 id="scenario-comparison-title">Receita, compromissos e resultado</h2>
            </div>
          </div>
          <ScenarioComparisonChart
            data={summaries}
            selectedScenarioId={selectedScenario.id}
            onSelect={selectScenario}
          />
        </section>

        <section className="scenario-intelligence__panel scenario-intelligence__panel--waterfall" aria-labelledby="scenario-waterfall-heading">
          <div className="scenario-intelligence__section-heading">
            <span className="scenario-intelligence__section-icon" aria-hidden="true">
              <Calculator />
            </span>
            <div>
              <span>Ponte financeira · {selectedScenario.label}</span>
              <h2 id="scenario-waterfall-heading">Como o resultado é formado</h2>
            </div>
          </div>
          <ScenarioWaterfallChart bridge={bridge} scenarioLabel={selectedScenario.label} />
        </section>

        <section className="scenario-intelligence__panel scenario-intelligence__panel--contributions" aria-labelledby="scenario-contributions-heading">
          <div className="scenario-intelligence__section-heading">
            <span className="scenario-intelligence__section-icon" aria-hidden="true">
              <TrendingUp />
            </span>
            <div>
              <span>Composição literal · {selectedScenario.label}</span>
              <h2 id="scenario-contributions-heading">Fontes e compromissos</h2>
            </div>
            <Link
              to={getModuleRoute(module, 'patrocinios')}
              className="scenario-intelligence__context-link"
            >
              Investigar Patrocínios
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          <ScenarioContributionsChart
            data={contributions}
            scenarioLabel={selectedScenario.label}
          />
        </section>
      </div>

      <details className="scenario-intelligence__methodology">
        <summary>
          <span><BookOpenCheck aria-hidden="true" /> Metodologia e qualidade da fonte</span>
          <ArrowRight aria-hidden="true" />
        </summary>
        <div>
          <p>
            Simulação local e somente leitura. Alternar o cenário não altera a planilha de referência nem qualquer dado do módulo.
          </p>
          <p>
            Os resultados literais da fonte foram preservados: o Realista registra uma diferença de <strong>−R$ 0,06</strong> e o Otimista de <strong>+R$ 0,04</strong> em relação à ponte aritmética. O Pessimista fecha sem diferença.
          </p>
        </div>
      </details>
    </section>
  );
}

export default ScenarioIntelligenceView;
