import { memo, useId, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FinancialDistributionDonutChart, type FinancialDistributionDatum } from '../components/FinancialCharts';
import { formatBRL, formatCompactBRL, formatPercentage } from '../utils/financialFormatters';
import { FinancialComparisonHelp as Help } from './FinancialComparisonPrimitives';
import {
  expenseChartShare, expenseChartValue,
  type ExpenseChartDimension, type ExpenseChartModel, type ExpenseChartRow, type ExpenseChartSide,
  type ExpenseDimensionChartModel,
} from './financialExpenseChartAdapters';
import '@/styles/financial-expense-charts.css';

interface ChartStateProps {
  model: ExpenseChartModel | null;
  loading?: boolean;
  error?: boolean;
  filtered?: boolean;
}

const sideLabel = (side: ExpenseChartSide) => side === 'projetado' ? 'Projetado' : 'Realizado';
const dimensionLabel = (dimension: ExpenseChartDimension) => dimension === 'category' ? 'categoria' : 'comissão';
const barWidth = (value: number | null, maximum: number | null) => (
  value !== null && maximum !== null && maximum > 0 ? `${Math.min(100, value / maximum * 100)}%` : '0%'
);
const exactValue = (value: number | null) => value === null ? 'Não disponível' : formatBRL(value / 100);

function RowName({ row }: { row: ExpenseChartRow }) {
  return <span className="f28-expense-chart__name">{row.label}{row.archived && <small className="f28-expense-chart__archived">Arquivada</small>}</span>;
}

function ChartState({ loading, error, filtered }: Omit<ChartStateProps, 'model'>) {
  return <p className="f28-expense-chart__state" role={loading ? 'status' : undefined}>
    {loading ? 'Carregando distribuição…' : error ? 'Distribuição indisponível. Recarregue a consulta para tentar novamente.' : filtered ? 'Nenhum resultado para os filtros atuais.' : 'A distribuição aparecerá após o primeiro cadastro.'}
  </p>;
}

function ChartMoney({ row, side }: { row: ExpenseChartRow; side: ExpenseChartSide }) {
  const value = expenseChartValue(row, side);
  if (value === null) return <span className="f28-expense-chart__unavailable">Não disponível</span>;
  return <Popover>
    <PopoverTrigger asChild><button className="f28-expense-chart__money" type="button" aria-label={`${row.label}, ${sideLabel(side)}: ${exactValue(value)}. Ver valor exato`}>
      {formatCompactBRL(value / 100)}
    </button></PopoverTrigger>
    <PopoverContent className="f28-expense-chart__popover"><strong>{row.label}{row.archived ? ' · Arquivada' : ''}</strong><span>{sideLabel(side)} · {exactValue(value)}</span><small>{row.count} {row.count === 1 ? 'despesa no recorte' : 'despesas no recorte'}</small></PopoverContent>
  </Popover>;
}

/** Complete horizontal ranking with a monetary scale shared between the two expense panels. */
export const FinancialExpenseRanking = memo(function FinancialExpenseRanking({ model, side, dimension, loading, error, filtered }: ChartStateProps & {
  side: ExpenseChartSide;
  dimension: ExpenseChartDimension;
}) {
  const id = useId();
  const data = model?.[dimension];
  return <section className="f28-expense-chart f28-expense-ranking" data-side={side} data-dimension={dimension} aria-labelledby={id}>
    <header className="f28-expense-chart__header"><h3 id={id}>{dimension === 'category' ? 'Ranking por categoria' : 'Distribuição por comissão'}</h3>{data && data.rows.length > 0 && <Help label={`Como ler ${sideLabel(side).toLocaleLowerCase('pt-BR')} por ${dimensionLabel(dimension)}`}><p>As barras usam a mesma escala monetária nos dois painéis: {data.maximumCents === null ? 'indisponível' : `até ${exactValue(data.maximumCents)}`}.</p><p>O percentual indica a participação de cada grupo no total {sideLabel(side).toLocaleLowerCase('pt-BR')}. Toque no valor para consultar a quantia exata.</p></Help>}</header>
    {!data || data.rows.length === 0 ? <ChartState loading={loading} error={error} filtered={filtered} /> : <>
      <ol className="f28-expense-ranking__list" aria-label={`${sideLabel(side)} por ${dimensionLabel(dimension)}`}>
        {data.rankings[side].map((row, index) => {
          const value = expenseChartValue(row, side);
          const percentage = expenseChartShare(row, side);
          return <li key={row.key} data-group={row.key} data-unclassified={row.unclassified || undefined}>
            <div className="f28-expense-ranking__heading"><span className="f28-expense-ranking__position" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><RowName row={row} /><ChartMoney row={row} side={side} /></div>
            <span className="f28-expense-ranking__share" aria-label={percentage === null ? 'Participação indisponível' : `${formatPercentage(percentage)} do total ${sideLabel(side).toLocaleLowerCase('pt-BR')}`}>{percentage === null ? '—' : formatPercentage(percentage)}</span>
            {value === null ? <span className="f28-expense-chart__unavailable">Valor do grupo não fornecido</span> : <div className="f28-expense-chart__track" aria-hidden="true"><span style={{ width: barWidth(value, data.maximumCents) }} /></div>}
          </li>;
        })}
      </ol>
    </>}
  </section>;
});

const COMPOSITION_COLORS: Record<ExpenseChartSide, readonly string[]> = {
  projetado: ['#4338ca', '#6366f1', '#818cf8', '#3730a3', '#a5b4fc', '#5b57a6', '#7068d0', '#9699d5'],
  realizado: ['#0f766e', '#0d9488', '#2dd4bf', '#115e59', '#5eead4', '#337f85', '#26928b', '#80c7bc'],
};

/** Uses the existing generic donut only after the adapter verifies the aggregate is complete. */
const ExpenseCategoryComposition = memo(function ExpenseCategoryComposition({ data, side }: {
  data: ExpenseDimensionChartModel;
  side: ExpenseChartSide;
}) {
  const donutData = useMemo<FinancialDistributionDatum[]>(() => !data.compositionReady[side] ? [] : data.rows.map((row, index) => ({
    id: row.key,
    label: `${row.label}${row.archived ? ' · Arquivada' : ''}`,
    // Conversion is exclusively at the presentation boundary, after completeness validation.
    value: (expenseChartValue(row, side) as number) / 100,
    color: COMPOSITION_COLORS[side][index % COMPOSITION_COLORS[side].length],
    detail: `${row.count} ${row.count === 1 ? 'despesa no recorte' : 'despesas no recorte'}`,
  })), [data.rows, data.compositionReady, side]);
  return <section className="f28-expense-composition" data-side={side}>
    <h4>{sideLabel(side)} por categoria</h4>
    {data.compositionReady[side] ? <FinancialDistributionDonutChart
      data={donutData}
      title={`Composição percentual do ${side === 'projetado' ? 'projetado' : 'realizado'} por categoria`}
      summary={`Categorias do mesmo recorte agregado. A participação usa somente o total ${side === 'projetado' ? 'projetado' : 'realizado'}, sem somar as séries.`}
      centerLabel={`Total ${side === 'projetado' ? 'projetado' : 'realizado'}`}
      centerValue={(data.totals[side] as number) / 100}
      sort="none"
      height={390}
      mobileHeight={390}
    /> : <p className="f28-expense-chart__state">{data.totals[side] === 0 ? 'Total zero no recorte. Não há composição percentual.' : 'Composição indisponível: a fonte precisa fornecer todos os valores por categoria.'}</p>}
  </section>;
});

function deviationLabel(row: ExpenseChartRow): string {
  if (row.comparisonState === 'sem_previsao') return 'Sem previsão';
  if (row.deviationCents === null) return 'Desvio indisponível';
  return `${row.deviationCents > 0 ? '+' : ''}${exactValue(row.deviationCents)}${row.deviationPct === null ? '' : ` · ${row.deviationPct > 0 ? '+' : ''}${formatPercentage(row.deviationPct)}`}`;
}

const ExpensePairedComparison = memo(function ExpensePairedComparison({ data }: { data: ExpenseDimensionChartModel }) {
  return <div className="f28-expense-paired">
    <ol className="f28-expense-paired__list" aria-label={`Projetado e realizado por ${dimensionLabel(data.dimension)}`}>
      {data.rows.map(row => <li key={row.key} data-group={row.key}>
        <div className="f28-expense-paired__heading"><RowName row={row} /><span className="f28-expense-paired__deviation" data-overrun={row.deviationCents !== null && row.deviationCents > 0 || undefined}>{deviationLabel(row)}</span></div>
        {(['projetado', 'realizado'] as const).map(side => <div key={side} className="f28-expense-paired__series" data-side={side}>
          <span className="f28-expense-paired__label">{sideLabel(side)}</span>
          {expenseChartValue(row, side) === null ? <span className="f28-expense-chart__unavailable">Valor não fornecido</span> : <div className="f28-expense-chart__track" aria-hidden="true"><span style={{ width: barWidth(expenseChartValue(row, side), data.maximumCents) }} /></div>}
          <ChartMoney row={row} side={side} />
        </div>)}
      </li>)}
    </ol>
  </div>;
});

/** Complementary analyses are opt-in; the main category and commission rankings remain visible. */
export const FinancialExpenseAnalyses = memo(function FinancialExpenseAnalyses({ model, loading, error, filtered }: ChartStateProps) {
  const [dimension, setDimension] = useState<ExpenseChartDimension>('category');
  const [visited, setVisited] = useState(false);
  const id = useId();
  return <details className="f28-expense-analyses" onToggle={event => { if (event.currentTarget.open) setVisited(true); }}>
    <summary><strong>Análises complementares</strong><ChevronDown aria-hidden="true" /></summary>
    {visited && <div className="f28-expense-analyses__body">
      {!model || model.category.rows.length === 0 ? <ChartState loading={loading} error={error} filtered={filtered} /> : <>
        <section className="f28-expense-analyses__comparison" aria-labelledby={`${id}-comparison`}>
          <header className="f28-expense-chart__header"><h3 id={`${id}-comparison`}>Projetado × Realizado</h3><Help label="Como interpretar o desvio"><strong>Desvio = realizado − projetado</strong><p>Positivo: compromisso acima da previsão. Negativo: pode representar projeções ainda não realizadas.</p><p>Sem previsão: o percentual de comparação não está disponível. Realizado representa compromisso; pago representa liquidação.</p><p>Os painéis comparam os mesmos grupos na mesma ordem e escala monetária: {model[dimension].maximumCents === null ? 'indisponível' : `até ${exactValue(model[dimension].maximumCents)}`}.</p></Help></header>
          <label className="f28-expense-analyses__dimension">Comparar por<select value={dimension} onChange={event => setDimension(event.target.value as ExpenseChartDimension)}><option value="category">Categoria</option><option value="commission">Comissão</option></select></label>
          <ExpensePairedComparison data={model[dimension]} />
        </section>
        <section className="f28-expense-analyses__composition" aria-labelledby={`${id}-composition`}><header className="f28-expense-chart__header"><h3 id={`${id}-composition`}>Composição percentual por categoria</h3><Help label="Como ler a composição por categoria"><p>A participação considera somente o total de cada lado, sem somar projetado e realizado. Os grupos e valores pertencem ao mesmo recorte agregado.</p></Help></header><div className="f28-expense-analyses__compositions"><ExpenseCategoryComposition data={model.category} side="projetado" /><ExpenseCategoryComposition data={model.category} side="realizado" /></div></section>
      </>}
    </div>}
  </details>;
});
