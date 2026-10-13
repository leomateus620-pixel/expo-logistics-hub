import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinancialExpenseAnalyses, FinancialExpenseRanking } from '@/features/financial-management/operational/FinancialExpenseCharts';
import { adaptExpenseComparison } from '@/features/financial-management/operational/financialExpenseChartAdapters';
import type { ExpenseComparison } from '@/features/financial-management/operational/financialExpensesApi';

vi.mock('@/features/financial-management/components/FinancialCharts', () => ({
  FinancialDistributionDonutChart: ({ title }: { title: string }) => <div aria-label={title} />,
}));
afterEach(cleanup);

const aggregate: ExpenseComparison = {
  totals: { count: 30, planned_cents: 100000, committed_cents: 100000, paid_cents: 25000, open_cents: 75000,
    deviation_cents: 0, deviation_pct: 0, comparison_state: 'comparavel', overdue_count: 0, overdue_cents: 0,
    realized_without_plan_count: 5, by_status: { prevista: 10, realizada: 20, cancelada: 0 } },
  by_category: [
    { id: 'a', name: 'Categoria personalizada', count: 25, planned_cents: 100000, committed_cents: 50000, paid_cents: 25000,
      deviation_cents: -50000, deviation_pct: -50, comparison_state: 'comparavel' },
    { id: null, name: 'Sem categoria', count: 5, planned_cents: 0, committed_cents: 50000, paid_cents: 0,
      deviation_cents: 50000, deviation_pct: null, comparison_state: 'sem_previsao' },
  ],
  by_commission: [{ id: 'c', name: 'Comissão de operação', count: 30, planned_cents: 100000, committed_cents: 100000,
    paid_cents: 25000, deviation_cents: 0, deviation_pct: 0, comparison_state: 'comparavel' }],
};

describe('gráficos operacionais de despesas', () => {
  it('usa escala comum para valores iguais entre lados e permite consultar valor exato por toque', async () => {
    const model = adaptExpenseComparison(aggregate);
    const result = render(<><FinancialExpenseRanking model={model} side="projetado" dimension="commission" /><FinancialExpenseRanking model={model} side="realizado" dimension="commission" /></>);
    const bars = result.container.querySelectorAll('.f28-expense-chart__track > span');
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveStyle({ width: '100%' });
    expect(bars[1]).toHaveStyle({ width: '100%' });
    const projected = result.container.querySelector('[data-side="projetado"]') as HTMLElement;
    await userEvent.setup().click(within(projected).getByRole('button', { name: /Projetado: R\$\s1\.000,00/ }));
    expect(screen.getByText('Projetado · R$ 1.000,00')).toBeInTheDocument();
  });

  it('mostra apenas o percentual e mantém a interpretação da escala no ícone de ajuda', async () => {
    const result = render(<FinancialExpenseRanking model={adaptExpenseComparison(aggregate)} side="projetado" dimension="commission" />);
    const percentage = result.container.querySelector('.f28-expense-ranking__share') as HTMLElement;
    expect(percentage).toHaveTextContent(/^100%$/);
    expect(percentage).toHaveAttribute('aria-label', '100% do total projetado');
    expect(result.container).not.toHaveTextContent('As barras usam a mesma escala');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Como ler projetado por comissão' }));
    expect(screen.getByText(/As barras usam a mesma escala monetária nos dois painéis/)).toHaveTextContent(/até R\$\s1\.000,00/);
    expect(screen.getByText(/O percentual indica a participação/)).toBeInTheDocument();
  });

  it('compara os mesmos grupos na mesma ordem, identifica sem previsão e nunca apresenta soma', async () => {
    const result = render(<FinancialExpenseAnalyses model={adaptExpenseComparison(aggregate)} />);
    await userEvent.setup().click(screen.getByText('Análises complementares'));
    await screen.findByRole('list', { name: 'Projetado e realizado por categoria' });
    const rows = result.container.querySelectorAll('.f28-expense-paired__list > li');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Categoria personalizada');
    expect(rows[1]).toHaveTextContent('Sem previsão');
    expect(within(rows[0] as HTMLElement).getByText('Projetado')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('Realizado')).toBeInTheDocument();
    expect(rows[0].querySelector('[data-side="projetado"] .f28-expense-chart__track > span')).toHaveStyle({ width: '100%' });
    expect(rows[0].querySelector('[data-side="realizado"] .f28-expense-chart__track > span')).toHaveStyle({ width: '50%' });
    expect(result.container).not.toHaveTextContent('economia');
    expect(result.container).not.toHaveTextContent('Total combinado');
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Comparar por' }), 'commission');
    expect(result.container.querySelectorAll('.f28-expense-paired__list > li')).toHaveLength(1);
    expect(result.container.querySelector('.f28-expense-paired__list')).toHaveTextContent('Comissão de operação');
  });

  it('monta gráficos complementares só na primeira abertura e preserva os nós ao recolher', async () => {
    const result = render(<FinancialExpenseAnalyses model={adaptExpenseComparison(aggregate)} />);
    const user = userEvent.setup();
    expect(result.container.querySelector('.f28-expense-analyses__body')).toBeNull();
    await user.click(screen.getByText('Análises complementares'));
    const list = await screen.findByRole('list', { name: 'Projetado e realizado por categoria' });
    const composition = result.container.querySelector('.f28-expense-composition');
    expect(composition).not.toBeNull();
    await user.click(screen.getByText('Análises complementares'));
    expect(result.container.querySelector('.f28-expense-analyses')).not.toHaveAttribute('open');
    expect(result.container.querySelector('.f28-expense-paired__list')).toBe(list);
    expect(result.container.querySelector('.f28-expense-composition')).toBe(composition);
    await user.click(screen.getByText('Análises complementares'));
    expect(result.container.querySelector('.f28-expense-paired__list')).toBe(list);
    expect(result.container.querySelector('.f28-expense-composition')).toBe(composition);
  });

  it('distingue fonte em carregamento, falha, recorte vazio e zero verdadeiro', () => {
    const result = render(<FinancialExpenseRanking model={null} side="projetado" dimension="category" loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    result.rerender(<FinancialExpenseRanking model={null} side="projetado" dimension="category" error />);
    expect(screen.getByText(/Distribuição indisponível/)).toBeInTheDocument();
    const empty = { ...aggregate, by_category: [] };
    result.rerender(<FinancialExpenseRanking model={adaptExpenseComparison(empty)} side="projetado" dimension="category" filtered />);
    expect(screen.getByText('Nenhum resultado para os filtros atuais.')).toBeInTheDocument();
    result.rerender(<FinancialExpenseRanking model={adaptExpenseComparison(aggregate)} side="projetado" dimension="category" />);
    expect(screen.getByRole('button', { name: /Sem categoria, Projetado: R\$\s0,00/ })).toBeInTheDocument();
    expect(result.container.querySelector('[data-unclassified] .f28-expense-chart__track > span')).toHaveStyle({ width: '0%' });
  });
});
