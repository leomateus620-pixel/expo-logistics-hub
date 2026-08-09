import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CommissionBudgetUtilizationChart,
  FundingSourceChart,
  RevenueComparisonChart,
  RevenueCompositionChart,
} from '@/features/financial-management/components/FinancialCharts';
import { FinancialKpiCard } from '@/features/financial-management/components/FinancialPrimitives';
import { RevenueLedger } from '@/features/financial-management/components/FinancialTables';
import { revenueSources } from '@/features/financial-management/data/financial2026Data';

const financialStyles = readFileSync(resolve('src/styles/financial-management.css'), 'utf8');
const financialPageSource = readFileSync(
  resolve('src/pages/commissions/FinancialManagementPage.tsx'),
  'utf8',
);

describe('experiência financeira flagship', () => {
  beforeEach(() => {
    let frameTime = performance.now();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameTime += 1_000;
      callback(frameTime);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('expõe comparação executiva completa por foco, sem perder semântica financeira', () => {
    const { container } = render(
      <RevenueComparisonChart
        data={[
          {
            id: 'sponsorship',
            label: 'Patrocínios',
            projectedAmount: 5_899_659,
            consolidatedAmount: 5_795_404,
          },
          {
            id: 'commercial',
            label: 'Comercial',
            projectedAmount: 5_806_944.51,
            consolidatedAmount: 5_506_139.34,
          },
        ]}
      />,
    );

    expect(container.querySelector('.financial-comparison')).toHaveAttribute(
      'data-force-motion',
      'true',
    );

    const sponsorship = screen.getByRole('group', { name: /Patrocínios.*Projetado.*Consolidado.*Lacuna/i });
    expect(sponsorship).toHaveAttribute('tabindex', '0');

    fireEvent.focus(sponsorship);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Patrocínios');
    expect(tooltip).toHaveTextContent('R$ 5.899.659,00');
    expect(tooltip).toHaveTextContent('R$ 5.795.404,00');
    expect(tooltip).toHaveTextContent('R$ 104.255,00');
    expect(tooltip).toHaveTextContent('98,2%');

    fireEvent.blur(sponsorship);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('ordena a composição, preserva rótulos integrais e oferece detalhe interativo', () => {
    const { container } = render(
      <RevenueCompositionChart
        data={[
          { id: 'parking', label: 'Bilheteria e estacionamentos', amount: 406_000 },
          { id: 'sponsorship', label: 'Patrocínios', amount: 5_899_659 },
          { id: 'external', label: 'Área externa', amount: 1_200_000 },
        ]}
      />,
    );

    const chart = container.querySelector('.financial-composition');
    expect(chart).toHaveAttribute('data-force-motion', 'true');

    const rows = within(chart as HTMLElement).getAllByRole('listitem');
    expect(rows[0]).toHaveAccessibleName(/1ª posição, Patrocínios/i);
    expect(rows[2]).toHaveAccessibleName(/3ª posição, Bilheteria e estacionamentos/i);

    fireEvent.focus(rows[2]);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Bilheteria e estacionamentos');
    expect(screen.getByRole('tooltip')).toHaveTextContent('R$ 406.000,00');
  });

  it('renderiza o orçamento executivo como bullet chart sem esconder excesso ou teto', () => {
    const { container } = render(
      <CommissionBudgetUtilizationChart
        forceMotion
        variant="executive"
        data={[
          {
            id: 'central',
            commission: 'Comissão Central',
            budgetCap: 3_500_000,
            budgetedAmount: 3_250_000,
            utilizationPercentage: 92.9,
            status: 'near-limit',
          },
          {
            id: 'marketing',
            commission: 'Marketing',
            budgetCap: 485_000,
            budgetedAmount: 535_769,
            utilizationPercentage: 110.5,
            status: 'over-budget',
          },
        ]}
      />,
    );

    const chart = container.querySelector('.financial-budget-bullets');
    expect(chart).toHaveAttribute('data-force-motion', 'true');
    expect(container.querySelector('.recharts-wrapper')).not.toBeInTheDocument();

    const marketing = screen.getByRole('group', {
      name: /Marketing.*Teto.*Orçado.*Utilização.*Excesso.*Acima do teto/i,
    });
    expect(marketing).toHaveAttribute('data-status', 'over-budget');
    expect(marketing.querySelector('.financial-budget-bullets__overrun-fill')).toBeInTheDocument();

    fireEvent.focus(marketing);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('R$ 485.000,00');
    expect(tooltip).toHaveTextContent('R$ 535.769,00');
    expect(tooltip).toHaveTextContent('R$ 50.769,00');
    expect(tooltip).toHaveTextContent('110,5%');
  });

  it('ranqueia as origens executivas com rótulo integral, valor e participação contextual', () => {
    const { container } = render(
      <FundingSourceChart
        forceMotion
        variant="executive"
        data={[
          { id: 'rouanet', fundingType: 'Lei Rouanet', amount: 150_000 },
          { id: 'free', fundingType: 'Recurso Livre', amount: 900_000 },
          {
            id: 'city',
            fundingType: 'Prefeitura / Plano de Trabalho',
            amount: 50_000,
          },
        ]}
      />,
    );

    const chart = container.querySelector('.financial-composition--funding');
    expect(chart).toHaveAttribute('data-force-motion', 'true');
    expect(container.querySelector('.recharts-wrapper')).not.toBeInTheDocument();

    const rows = within(chart as HTMLElement).getAllByRole('listitem');
    expect(rows[0]).toHaveAccessibleName(/1ª posição, Recurso Livre.*81,8%/i);
    expect(rows[2]).toHaveAccessibleName(
      /3ª posição, Prefeitura \/ Plano de Trabalho.*4,5%/i,
    );

    fireEvent.focus(rows[2]);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Prefeitura / Plano de Trabalho');
    expect(tooltip).toHaveTextContent('R$ 50.000,00');
    expect(tooltip).toHaveTextContent('4,5%');
  });

  it('mantém hierarquia, origem e valor exato nos KPIs animados', () => {
    render(
      <FinancialKpiCard
        label="Total projetado"
        value={11_706_603.51}
        priority="primary"
        animateValue
        sourceLabel="Receitas!K131"
      />,
    );

    const card = screen.getByRole('article');
    expect(card).toHaveAttribute('data-financial-priority', 'primary');
    expect(card).toHaveAttribute('data-financial-animate-value', 'true');
    expect(screen.getByRole('img', { name: 'Receitas!K131' })).toBeInTheDocument();
    expect(screen.getByText('Total projetado: R$ 11.706.603,51')).toHaveClass('sr-only');
  });

  it('realça a coluna decisória no ledger e preserva o disclosure móvel', () => {
    const { container } = render(
      <RevenueLedger revenues={revenueSources.slice(0, 2)} confirmedView />,
    );

    const ledger = container.querySelector('[data-financial-ledger="revenue"]');
    expect(ledger).toHaveAttribute('data-financial-primary-column', 'consolidated');
    expect(screen.getByRole('columnheader', { name: 'Consolidado' })).toHaveClass(
      'financial-table__number--primary',
    );

    const mobileCards = container.querySelectorAll('.financial-mobile-card--revenue');
    expect(mobileCards).toHaveLength(2);
    expect(mobileCards[0].querySelector('.financial-mobile-card__amount--primary')).toHaveAttribute(
      'data-financial-column',
      'consolidated',
    );
    expect(within(mobileCards[0] as HTMLElement).getByText('Ver detalhes')).toBeInTheDocument();
    expect(mobileCards[0].querySelector('[role="progressbar"]')).toHaveAttribute(
      'aria-valuetext',
      expect.stringContaining('consolidados de'),
    );
  });

  it('não inventa taxa de consolidação quando a fonte não tem projeção-base', () => {
    const zeroProjectionRevenue = revenueSources.find(
      (revenue) => revenue.source === 'Acisap (Ingresso Paulo Guedes)',
    );
    expect(zeroProjectionRevenue).toBeDefined();

    const { container } = render(
      <RevenueLedger revenues={[zeroProjectionRevenue!]} confirmedView />,
    );

    const progress = container.querySelector('.financial-mobile-card__consolidation-track');
    expect(progress).toHaveAttribute('aria-valuenow', '0');
    expect(progress).toHaveAttribute(
      'aria-valuetext',
      expect.stringContaining('Sem projeção-base'),
    );
    expect(container.querySelector('.financial-mobile-card__consolidation-label')).toHaveTextContent(
      'Sem projeção-base',
    );
  });

  it('estende o movimento integral às seis visões financeiras flagship', () => {
    expect(financialPageSource).toContain("view === 'dashboard'");
    expect(financialPageSource).toContain("view === 'receitas-projetadas'");
    expect(financialPageSource).toContain("view === 'receitas-confirmadas'");
    expect(financialPageSource).toContain("view === 'despesas-previstas'");
    expect(financialPageSource).toContain("view === 'despesas-realizadas'");
    expect(financialPageSource).toContain("view === 'orcamento-comissoes'");
    expect(financialPageSource).toContain("data-financial-motion={isFlagshipFinanceView ? 'full' : 'system'}");
    expect(financialPageSource).toContain('Planilha oficial · somente leitura');
    expect(financialPageSource).toContain('const revenueComposition = revenueCategoryGroups.map');
    expect(financialPageSource).not.toContain('revenueCategoryGroups.slice');
    expect(financialPageSource).not.toContain('.slice(0, 8)');
    expect(financialPageSource.match(/variant="executive"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(financialPageSource.match(/forceMotion/g)?.length ?? 0).toBeGreaterThanOrEqual(10);

    expect(financialStyles).toContain(
      ".financial-management-page:not([data-financial-motion='full']) *",
    );
    expect(financialStyles).toContain(
      ".financial-management-page[data-financial-motion='full'] .financial-page-header--executive",
    );
    expect(financialStyles).toContain('animation-duration: 420ms !important');
    expect(financialStyles).toContain('animation-duration: 440ms !important');
    expect(financialStyles).toContain('transition-duration: 180ms !important');
  });
});
