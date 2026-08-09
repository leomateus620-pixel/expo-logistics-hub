import { describe, expect, it } from 'vitest';
import {
  calculateRevenueGap,
  calculateBudgetUtilization,
  classifyBudgetStatus,
  classifyRevenueConsolidationStatus,
  flattenCommissionExpenses,
  groupExpensesByCategory,
  groupExpensesByCommission,
  groupExpensesByFundingSource,
  groupRevenuesByCategory,
  groupRevenuesByFundingType,
  selectCommissionBudgets,
  selectExpenseDisplayAmount,
  selectExpenseLedgerTotal,
  selectGeneralBudgetSummaries,
  selectOverBudgetCommissions,
  selectRevenueReceiptStatus,
  selectRevenueTotals,
  selectScenarioSummaries,
  selectSponsorTierDistribution,
  selectSponsorTotals,
  sortExpensesForLedger,
} from '@/features/financial-management/selectors/financialSelectors';
import {
  excelSerialToDate,
  formatBRL,
  formatCompactBRL,
  formatExcelSerialDate,
  formatPercentage,
  roundCurrency,
} from '@/features/financial-management/utils/financialFormatters';
import type {
  CommissionBudgetSource,
  FinancialExpenseSourceRow,
  FinancialRevenue,
  FinancialScenario,
  Sponsor,
} from '@/features/financial-management/types';
import {
  commissionBudgetSources,
  financialScenarios,
  financialWorkbookTotals,
  generalBudgetItems,
  revenueSources,
  sponsors as workbookSponsors,
} from '@/features/financial-management/data/financial2026Data';

function expense(
  overrides: Partial<FinancialExpenseSourceRow> = {},
): FinancialExpenseSourceRow {
  return {
    id: 'expense-1',
    sourceRow: 10,
    description: 'Despesa sintética',
    category: 'Pessoal e Equipes',
    value2025: 0,
    value2026: 0,
    realizedAmount: 0,
    paidWithFreeResource: 0,
    municipalityPlanAmount: 0,
    rouanetAmount: 0,
    paidMarkerAmount: 0,
    ...overrides,
  };
}

function commission(
  overrides: Partial<CommissionBudgetSource> = {},
): CommissionBudgetSource {
  return {
    id: 'commission-1',
    sourceStartRow: 4,
    sourceLabel: 'COMISSÃO SINTÉTICA',
    commission: 'Comissão Sintética',
    budgetCap: 100,
    budgetedAmount: 0,
    expenses: [],
    ...overrides,
  };
}

function revenue(overrides: Partial<FinancialRevenue> = {}): FinancialRevenue {
  return {
    id: 'revenue-1',
    sourceRow: 5,
    source: 'Receita sintética',
    ecosystem: 'commercial',
    category: 'Eventos',
    fundingType: 'Recurso Livre',
    projectedAmount: 0,
    consolidatedAmount: 0,
    receivableAmount: 0,
    projectedFreeResource: 0,
    consolidatedFreeResource: 0,
    projectedRouanet: 0,
    consolidatedRouanet: 0,
    ...overrides,
  };
}

function sponsor(overrides: Partial<Sponsor> = {}): Sponsor {
  return {
    id: 'sponsor-1',
    sourceRow: 5,
    name: 'Patrocinador sintético',
    tier: 'Ouro',
    vehicleCredentials: 0,
    soySummitCredentials: 0,
    declaredValue: 0,
    projectedFreeResource: 0,
    consolidatedFreeResource: 0,
    receivableAmount: 0,
    projectedRouanet: 0,
    consolidatedRouanet: 0,
    ...overrides,
  };
}

function scenario(overrides: Partial<FinancialScenario> = {}): FinancialScenario {
  return {
    id: 'realistic',
    label: 'Realista',
    commercialization: 0,
    exporural: 0,
    externalArea: 0,
    agroindustryPavilion: 0,
    foodPoints: 0,
    parking: 0,
    commercialRevenue: 0,
    freeSponsorship: 0,
    rouanetSponsorship: 0,
    totalRevenue: 0,
    operatingExecution: 0,
    historicalObligations: 0,
    reserve: 0,
    investmentCapacity: 0,
    negativeResult: 0,
    ...overrides,
  };
}

describe('formatadores financeiros pt-BR', () => {
  it('arredonda moeda simetricamente a centavos e formata BRL completo', () => {
    expect(roundCurrency(1.005)).toBe(1.01);
    expect(roundCurrency(-1.005)).toBe(-1.01);
    expect(roundCurrency(Number.NaN)).toBe(0);
    expect(formatBRL(1234.5)).toMatch(/^R\$\s*1\.234,50$/);
    expect(formatBRL(-0)).toMatch(/^R\$\s*0,00$/);
  });

  it('formata BRL compacto e percentual em pontos percentuais', () => {
    expect(formatCompactBRL(1_200_000)).toMatch(/R\$\s*1,2\s*mi/i);
    expect(formatPercentage(95.25)).toBe('95,3%');
    expect(formatPercentage(-12.5)).toBe('-12,5%');
    expect(formatPercentage(Number.POSITIVE_INFINITY)).toBe('0%');
    expect(formatPercentage(12.34, Number.NaN)).toBe('12,3%');
  });

  it('converte serial de data Excel sem deslocamento de fuso', () => {
    const date = excelSerialToDate(45292);
    expect(date?.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(formatExcelSerialDate(45292.75)).toBe('01/01/2024');
    expect(formatExcelSerialDate('2026-08-08')).toBe('08/08/2026');
    expect(formatExcelSerialDate(0)).toBe('—');
    expect(formatExcelSerialDate('-1')).toBe('—');
    expect(formatExcelSerialDate('Recebido em conferência')).toBe('Recebido em conferência');
  });
});

describe('totais de receita', () => {
  it('mantém A Receber explícito separado da lacuna de consolidação', () => {
    const totals = selectRevenueTotals([
      revenue({
        id: 'positive',
        projectedAmount: 100,
        consolidatedAmount: 50,
        receivableAmount: 7,
      }),
      revenue({
        id: 'negative',
        projectedAmount: -20,
        consolidatedAmount: -10,
        receivableAmount: -2,
      }),
    ]);

    expect(totals).toEqual({
      projectedAmount: 80,
      consolidatedAmount: 40,
      explicitReceivableAmount: 5,
      consolidationGapAmount: 40,
      consolidationRate: 50,
    });
    expect(totals.explicitReceivableAmount).not.toBe(totals.consolidationGapAmount);
  });

  it('não divide por zero nem mascara consolidado e lacuna negativos', () => {
    const totals = selectRevenueTotals([
      revenue({ projectedAmount: 0, consolidatedAmount: 10, receivableAmount: 3 }),
    ]);

    expect(totals.consolidationRate).toBe(0);
    expect(totals.consolidationGapAmount).toBe(-10);
    expect(totals.explicitReceivableAmount).toBe(3);
  });

  it('separa o estado de consolidação da situação de recebimento', () => {
    const consolidatedWithReceivable = revenue({
      projectedAmount: 100,
      consolidatedAmount: 100,
      receivableAmount: 50,
    });

    expect(calculateRevenueGap(consolidatedWithReceivable)).toBe(0);
    expect(classifyRevenueConsolidationStatus(consolidatedWithReceivable)).toBe('consolidated');
    expect(selectRevenueReceiptStatus(consolidatedWithReceivable)).toEqual({
      status: 'receivable',
      label: 'A receber informado',
    });
  });
});

describe('orçamentos e despesas por comissão', () => {
  it('achata despesas sem mutar as fontes e arredonda campos monetários', () => {
    const sourceExpense = expense({
      value2026: 10.005,
      realizedAmount: -2.005,
      paidWithFreeResource: 3.005,
    });
    const source = commission({
      id: 'marketing',
      commission: 'Marketing',
      budgetCap: 100.005,
      budgetedAmount: 10.005,
      expenses: [sourceExpense],
    });

    const [flattened] = flattenCommissionExpenses([source]);

    expect(flattened).toMatchObject({
      commissionId: 'marketing',
      commission: 'Marketing',
      commissionBudgetCap: 100.01,
      commissionBudgetedAmount: 10.01,
      value2026: 10.01,
      realizedAmount: -2.01,
      paidWithFreeResource: 3.01,
    });
    expect(flattened).not.toBe(sourceExpense);
    expect(sourceExpense.value2026).toBe(10.005);
  });

  it('aplica os três thresholds visuais e reserva vermelho para excesso real', () => {
    expect(classifyBudgetStatus(100, 79.99)).toBe('normal');
    expect(classifyBudgetStatus(100, 80)).toBe('attention');
    expect(classifyBudgetStatus(100, 94.99)).toBe('attention');
    expect(classifyBudgetStatus(100, 95)).toBe('near-limit');
    expect(classifyBudgetStatus(100, 100)).toBe('near-limit');
    expect(classifyBudgetStatus(100, 100.01)).toBe('over-budget');
  });

  it('trata teto zero e negativo sem NaN ou Infinity', () => {
    expect(calculateBudgetUtilization(0, 0)).toBe(0);
    expect(calculateBudgetUtilization(0, 1)).toBe(0);
    expect(classifyBudgetStatus(0, 0)).toBe('no-budget-cap');
    expect(classifyBudgetStatus(0, 1)).toBe('over-budget');
    expect(classifyBudgetStatus(-100, -120)).toBe('normal');
    expect(classifyBudgetStatus(-100, -50)).toBe('over-budget');
  });

  it('preserva as âncoras explícitas ao derivar saldo, utilização e realizado', () => {
    const budgets = selectCommissionBudgets([
      commission({
        id: 'normal',
        budgetCap: 100,
        budgetedAmount: 80,
        expenses: [
          expense({
            id: 'n-1',
            value2025: 2_600,
            value2026: 0,
            realizedAmount: 20.005,
          }),
          expense({ id: 'n-2', value2025: 100, value2026: 200, realizedAmount: -1.005 }),
        ],
      }),
      commission({ id: 'over', budgetCap: 50, budgetedAmount: 60 }),
      commission({ id: 'zero-over', budgetCap: 0, budgetedAmount: 1 }),
    ]);

    expect(budgets[0]).toMatchObject({
      budgetedAmount: 80,
      remainingAmount: 20,
      utilizationPercentage: 80,
      realizedAmount: 19,
      status: 'attention',
      expenseCount: 2,
    });
    expect(selectOverBudgetCommissions(budgets).map((budget) => budget.id)).toEqual([
      'over',
      'zero-over',
    ]);
    expect(budgets[0].budgetedAmount).not.toBe(2_900);
    expect(budgets[0].realizedAmount).not.toBe(2_900);
  });

  it('usa métricas independentes para os livros previsto e realizado', () => {
    const rows = flattenCommissionExpenses([
      commission({
        expenses: [
          expense({ id: 'planned', value2025: 100, value2026: 200, realizedAmount: 10 }),
          expense({ id: 'realized', value2025: 0, value2026: 20, realizedAmount: 90 }),
        ],
      }),
    ]);

    expect(selectExpenseDisplayAmount(rows[0], 'planning')).toBe(300);
    expect(selectExpenseDisplayAmount(rows[0], 'realized')).toBe(10);
    expect(selectExpenseLedgerTotal(rows, 'planning')).toBe(320);
    expect(selectExpenseLedgerTotal(rows, 'realized')).toBe(100);
    expect(sortExpensesForLedger(rows, 'planning', 'value')[0].id).toBe('planned');
    expect(sortExpensesForLedger(rows, 'realized', 'value')[0].id).toBe('realized');
  });
});

describe('agrupamentos financeiros', () => {
  const sources = [
    commission({
      id: 'commission-a',
      commission: 'Comissão A',
      budgetCap: 500,
      budgetedAmount: 222,
      expenses: [
        expense({
          id: 'a-1',
          category: 'Pessoal e Equipes',
          value2025: 100,
          value2026: 30,
          realizedAmount: 20,
          paidWithFreeResource: 10,
          municipalityPlanAmount: 5,
          paidMarkerAmount: 100,
        }),
      ],
    }),
    commission({
      id: 'commission-b',
      commission: 'Comissão B',
      budgetCap: 50,
      budgetedAmount: 60,
      expenses: [
        expense({
          id: 'b-1',
          category: 'Pessoal e Equipes',
          value2025: -10,
          value2026: -5,
          realizedAmount: -2,
          paidWithFreeResource: -2,
          rouanetAmount: 7,
        }),
        expense({
          id: 'b-2',
          category: 'Investimentos',
          value2026: 40,
          realizedAmount: 0,
        }),
      ],
    }),
  ];
  const expenses = flattenCommissionExpenses(sources);

  it('agrupa despesas por categoria e comissão preservando negativos', () => {
    expect(groupExpensesByCategory(expenses)).toEqual([
      {
        key: 'Pessoal e Equipes',
        label: 'Pessoal e Equipes',
        expenseCount: 2,
        value2025Amount: 90,
        value2026Amount: 25,
        realizedAmount: 18,
      },
      {
        key: 'Investimentos',
        label: 'Investimentos',
        expenseCount: 1,
        value2025Amount: 0,
        value2026Amount: 40,
        realizedAmount: 0,
      },
    ]);
    expect(groupExpensesByCommission(expenses).map((group) => ({
      key: group.key,
      value2025Amount: group.value2025Amount,
      value2026Amount: group.value2026Amount,
      budgetedAmount: group.budgetedAmount,
      status: group.status,
    }))).toEqual([
      {
        key: 'commission-a',
        value2025Amount: 100,
        value2026Amount: 30,
        budgetedAmount: 222,
        status: 'normal',
      },
      {
        key: 'commission-b',
        value2025Amount: -10,
        value2026Amount: 35,
        budgetedAmount: 60,
        status: 'over-budget',
      },
    ]);
  });

  it('agrupa somente fontes de funding, sem confundir marcador de pago', () => {
    expect(groupExpensesByFundingSource(expenses)).toEqual([
      {
        key: 'free-resource',
        label: 'Recurso Livre',
        amount: 8,
        registeredSharePercentage: 40,
      },
      {
        key: 'municipality-plan',
        label: 'Prefeitura / Plano de Trabalho',
        amount: 5,
        registeredSharePercentage: 25,
      },
      {
        key: 'rouanet',
        label: 'Lei Rouanet',
        amount: 7,
        registeredSharePercentage: 35,
      },
    ]);
  });

  it('agrupa receitas por categoria e funding com A Receber explícito', () => {
    const revenues = [
      revenue({
        id: 'event-free',
        category: 'Eventos',
        fundingType: 'Recurso Livre',
        projectedAmount: 100,
        consolidatedAmount: 70,
        receivableAmount: 5,
      }),
      revenue({
        id: 'event-rouanet',
        category: 'Eventos',
        fundingType: 'Lei Rouanet',
        projectedAmount: 50,
        consolidatedAmount: 10,
        receivableAmount: 2,
      }),
      revenue({
        id: 'other-free',
        category: 'Outras receitas',
        fundingType: 'Recurso Livre',
        projectedAmount: -10,
        consolidatedAmount: 0,
        receivableAmount: -1,
      }),
    ];

    expect(groupRevenuesByCategory(revenues)[0]).toMatchObject({
      key: 'Eventos',
      revenueCount: 2,
      projectedAmount: 150,
      consolidatedAmount: 80,
      explicitReceivableAmount: 7,
      consolidationGapAmount: 70,
    });
    expect(groupRevenuesByFundingType(revenues)[0]).toMatchObject({
      key: 'Recurso Livre',
      projectedAmount: 90,
      explicitReceivableAmount: 4,
    });
  });
});

describe('patrocinadores e cenários', () => {
  it('totaliza patrocinadores e distribui tiers sem inferir A Receber', () => {
    const sponsors = [
      sponsor({
        id: 'gold-1',
        tier: 'Ouro',
        declaredValue: 100,
        projectedFreeResource: 70,
        consolidatedFreeResource: 50,
        receivableAmount: 10,
        projectedRouanet: 30,
        consolidatedRouanet: 20,
        vehicleCredentials: 2,
        soySummitCredentials: 1,
        inKindContribution: 'Estrutura',
      }),
      sponsor({
        id: 'gold-2',
        tier: 'Ouro',
        declaredValue: -20,
        projectedFreeResource: -10,
        consolidatedFreeResource: -5,
        receivableAmount: -1,
        vehicleCredentials: 1,
      }),
      sponsor({
        id: 'silver-1',
        tier: 'Prata',
        declaredValue: 50,
        projectedFreeResource: 20,
        consolidatedFreeResource: 20,
        receivableAmount: 3,
        projectedRouanet: 10,
        consolidatedRouanet: 0,
        soySummitCredentials: 2,
        inKindContribution: 5,
      }),
    ];

    expect(selectSponsorTotals(sponsors)).toEqual({
      sponsorCount: 3,
      declaredValue: 130,
      projectedFreeResource: 80,
      consolidatedFreeResource: 65,
      explicitReceivableAmount: 12,
      projectedRouanet: 40,
      consolidatedRouanet: 20,
      totalProjectedAmount: 120,
      totalConsolidatedAmount: 85,
      vehicleCredentials: 3,
      soySummitCredentials: 3,
      inKindContributionCount: 2,
    });

    const distribution = selectSponsorTierDistribution(sponsors);
    expect(distribution.map((item) => item.tier)).toEqual(['Ouro', 'Prata']);
    expect(distribution[0]).toMatchObject({
      sponsorCount: 2,
      totalProjectedAmount: 90,
      sponsorSharePercentage: 66.67,
      projectedSharePercentage: 75,
      explicitReceivableAmount: 9,
    });
  });

  it('resume cenários com patrocínio e compromissos calculados em centavos', () => {
    const summaries = selectScenarioSummaries([
      scenario({
        id: 'realistic',
        label: 'Realista',
        commercialization: 100.005,
        commercialRevenue: 150,
        freeSponsorship: 50.005,
        rouanetSponsorship: 20.005,
        totalRevenue: 220.005,
        operatingExecution: 120.005,
        historicalObligations: 30.005,
        reserve: -5.005,
        investmentCapacity: 75.005,
        negativeResult: 0,
      }),
      scenario({ id: 'pessimistic', label: 'Pessimista', negativeResult: -10.005 }),
      scenario({ id: 'optimistic', label: 'Otimista', investmentCapacity: 100.005 }),
    ]);

    expect(summaries.map((item) => item.id)).toEqual([
      'realistic',
      'pessimistic',
      'optimistic',
    ]);
    expect(summaries[0]).toMatchObject({
      commercialization: 100.01,
      sponsorshipRevenue: 70.02,
      totalRevenue: 220.01,
      totalCommitments: 145.01,
      investmentCapacity: 75.01,
    });
    expect(summaries[1].negativeResult).toBe(-10.01);
    expect(summaries[2].investmentCapacity).toBe(100.01);
  });
});

describe('reconciliação da base Fenasoja 2026', () => {
  it('reconcilia os totais oficiais de receitas sem inferir A Receber', () => {
    const totals = selectRevenueTotals(revenueSources);

    expect(totals.projectedAmount).toBe(financialWorkbookTotals.projectedRevenue);
    expect(totals.consolidatedAmount).toBe(financialWorkbookTotals.consolidatedRevenue);
    expect(totals.consolidationGapAmount).toBe(405_060.17);
    expect(totals.explicitReceivableAmount).toBe(900_531.5);
    expect(totals.explicitReceivableAmount).not.toBe(totals.consolidationGapAmount);
  });

  it('usa os cabeçalhos oficiais para teto e orçado por comissão', () => {
    const budgets = selectCommissionBudgets(commissionBudgetSources);
    const totalCap = roundCurrency(budgets.reduce((total, budget) => total + budget.budgetCap, 0));
    const totalBudgeted = roundCurrency(budgets.reduce((total, budget) => total + budget.budgetedAmount, 0));

    expect(totalCap).toBe(financialWorkbookTotals.coreCommissionBudgetCap);
    expect(totalBudgeted).toBe(financialWorkbookTotals.coreCommissionBudgeted);
    expect(selectOverBudgetCommissions(budgets).map((budget) => budget.commission)).toEqual([
      'Marketing',
      'Inovação e Experiência',
      'Gastronomia',
    ]);
    expect(budgets.find((budget) => budget.commission === 'Indústria, Comércio e Serviços')?.status)
      .toBe('no-budget-cap');
  });

  it('preserva a quebra de reconciliação de R$ 2.600,00 da linha 14', () => {
    const expenses = flattenCommissionExpenses(commissionBudgetSources);
    const periodTotal = roundCurrency(expenses.reduce(
      (total, item) => total + item.value2025 + item.value2026,
      0,
    ));
    const sourceTotal = roundCurrency(expenses.reduce(
      (total, item) => total + item.realizedAmount,
      0,
    ));
    const sourceRow14 = expenses.find((item) => item.sourceRow === 14);

    expect(periodTotal).toBe(8_519_650.14);
    expect(sourceTotal).toBe(8_517_050.14);
    expect(roundCurrency(periodTotal - sourceTotal)).toBe(2_600);
    expect(sourceRow14).toMatchObject({ value2025: 0, value2026: 2_600, realizedAmount: 0 });
  });

  it('mantém tiers e situações de patrocínio estritamente explícitos', () => {
    const financialRows = workbookSponsors.filter((item) => [
      item.declaredValue,
      item.projectedFreeResource,
      item.consolidatedFreeResource,
      item.receivableAmount,
      item.projectedRouanet,
      item.consolidatedRouanet,
    ].some((amount) => amount !== 0));

    expect(workbookSponsors).toHaveLength(100);
    expect(financialRows).toHaveLength(54);
    expect(workbookSponsors.find((item) => item.sourceRow === 47)?.tier).toBe('Não classificado');
    expect(workbookSponsors.find((item) => item.sourceRow === 62)?.receivableNote).toBe('pago');
    expect(workbookSponsors.find((item) => item.sourceRow === 75)?.receivableNote).toBe('pago');
    const unijui = workbookSponsors.find((item) => item.sourceRow === 75);
    expect(unijui?.inKindContribution).toBeUndefined();
    expect(unijui).toMatchObject({
      sourceQualityFlag: {
        code: 'DATE_LIKE_VALUE_IN_CONTRIBUTION_COLUMN',
        cell: 'Q75',
        rawValue: 46183,
      },
    });
  });

  it('separa obrigações históricas de investimentos no orçamento geral', () => {
    const summaries = selectGeneralBudgetSummaries(generalBudgetItems);

    expect(generalBudgetItems).toHaveLength(32);
    expect(summaries).toEqual([
      {
        kind: 'historical-obligation',
        itemCount: 7,
        budgetCap: 1_324_000,
        budgetedAmount: 1_324_000,
        remainingAmount: 0,
      },
      {
        kind: 'investment',
        itemCount: 25,
        budgetCap: 869_736.61,
        budgetedAmount: 734_736.71,
        remainingAmount: 134_999.9,
      },
    ]);
  });

  it('preserva fonte sem identificação e capacidades literais dos cenários', () => {
    expect(revenueSources.find((item) => item.sourceRow === 123)?.source)
      .toBe('Fonte não identificada — linha 123');
    expect(financialScenarios.map((scenario) => scenario.investmentCapacity)).toEqual([
      1_595_583.2,
      0,
      2_405_483.3,
    ]);
    expect(financialScenarios[1].negativeResult).toBe(436_533.4);
  });
});
