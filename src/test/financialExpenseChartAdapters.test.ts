import { describe, expect, it } from 'vitest';
import { adaptExpenseComparison } from '@/features/financial-management/operational/financialExpenseChartAdapters';
import type { ExpenseCategory, ExpenseComparison, ExpenseGroupComparison } from '@/features/financial-management/operational/financialExpensesApi';

const group = (id: string | null, name: string, planned: number, committed: number): ExpenseGroupComparison => ({
  id, name, count: 2, planned_cents: planned, committed_cents: committed, paid_cents: 123,
  deviation_cents: committed - planned, deviation_pct: planned > 0 ? (committed - planned) / planned * 100 : null,
  comparison_state: planned > 0 ? 'comparavel' : 'sem_previsao',
});
function aggregate(groups: ExpenseGroupComparison[], planned = 100000, committed = 110000): ExpenseComparison {
  return {
    totals: { count: 50, planned_cents: planned, committed_cents: committed, paid_cents: 30000, open_cents: 80000,
      deviation_cents: committed - planned, deviation_pct: 10, comparison_state: 'comparavel',
      overdue_count: 2, overdue_cents: 5000, realized_without_plan_count: 1,
      by_status: { prevista: 12, realizada: 35, cancelada: 3 } },
    by_category: groups,
    by_commission: [group('com-a', 'Comissão personalizada', planned, committed)],
  };
}

describe('adapters gráficos das despesas de 2028', () => {
  it('usa centavos e os totais do servidor como denominadores, preservando o recorte integral', () => {
    const result = adaptExpenseComparison(aggregate([group('a', 'Área customizada', 25000, 55000)]))!;
    expect(result.category.totals).toEqual({ projetado: 100000, realizado: 110000 });
    expect(result.category.rows[0].plannedCents).toBe(25000);
    expect(result.category.rows[0].plannedShare).toBe(25);
    expect(result.category.rows[0].committedShare).toBe(50);
    expect(result.category.rows[0].deviationCents).toBe(30000);
    expect(result.category.compositionReady).toEqual({ projetado: false, realizado: false });
    expect(result.commission.compositionReady).toEqual({ projetado: true, realizado: true });
  });

  it('compartilha a escala monetária e ordena a comparação pelo maior valor, nunca pela soma das séries', () => {
    const source = aggregate([group('a', 'Dupla intermediária', 60000, 60000), group('b', 'Maior série', 100000, 0)]);
    const result = adaptExpenseComparison(source)!;
    expect(result.category.maximumCents).toBe(100000);
    expect(result.category.rows.map(row => row.id)).toEqual(['b', 'a']);
    expect(result.category.rankings.projetado.map(row => row.id)).toEqual(['b', 'a']);
    expect(result.category.rankings.realizado.map(row => row.id)).toEqual(['a', 'b']);
    // The adapter never mutates the aggregate cached by React Query.
    expect(source.by_category.map(row => row.id)).toEqual(['a', 'b']);
  });

  it('mantém nomes personalizados, categorias arquivadas vinculadas e grupos sem classificação', () => {
    const archived: ExpenseCategory = { id: 'custom', name: 'Nome antigo da lista', active: false,
      parent_id: null, sort_order: 1, icon: null, color: null, version: 3, usage_count: 2 };
    const result = adaptExpenseComparison(aggregate([group('custom', 'Produção cultural especial', 10000, 20000), group(null, 'Sem categoria', 5000, 0)]), [archived])!;
    expect(result.category.rows[0]).toMatchObject({ label: 'Produção cultural especial', archived: true, unclassified: false });
    expect(result.category.rows[1]).toMatchObject({ id: null, label: 'Sem categoria', unclassified: true });
    expect(result.commission.rows[0].label).toBe('Comissão personalizada');
  });

  it('não transforma ausência da consulta ou de valores em zero monetário', () => {
    expect(adaptExpenseComparison(undefined)).toBeNull();
    expect(adaptExpenseComparison(null)).toBeNull();
    const source = aggregate([group('a', 'Campo ausente', 100, 200)]);
    // Protect presentation against an incomplete/invalid RPC response without pretending a zero.
    source.by_category[0].planned_cents = undefined as unknown as number;
    source.by_category[0].committed_cents = Number.NaN;
    source.totals.planned_cents = undefined as unknown as number;
    const result = adaptExpenseComparison(source)!;
    expect(result.category.maximumCents).toBeNull();
    expect(result.category.rows[0]).toMatchObject({ plannedCents: null, committedCents: null, plannedShare: null, committedShare: null });
    expect(result.category.totals.projetado).toBeNull();
    expect(result.category.compositionReady.projetado).toBe(false);
  });

  it('preserva zero verdadeiro e percentual indisponível quando não existe previsão', () => {
    const source = aggregate([group('a', 'Realizada direta', 0, 50000)], 0, 50000);
    source.by_category[0].deviation_pct = 100;
    const result = adaptExpenseComparison(source)!;
    expect(result.category.rows[0]).toMatchObject({ plannedCents: 0, committedCents: 50000,
      plannedShare: null, committedShare: 100, deviationPct: null, comparisonState: 'sem_previsao' });
    expect(result.category.compositionReady).toEqual({ projetado: false, realizado: true });
    const zero = adaptExpenseComparison(aggregate([group('z', 'Valor zero', 0, 0)], 0, 0))!;
    expect(zero.category.maximumCents).toBe(0);
    expect(zero.category.rows[0].plannedCents).toBe(0);
    expect(zero.category.rows[0].plannedShare).toBeNull();
  });

  it('mantém o desvio negativo do servidor sem inferir economia e separa comissão de categoria', () => {
    const result = adaptExpenseComparison(aggregate([group('a', 'Compromisso parcial', 100000, 20000)]))!;
    expect(result.category.rows[0].deviationCents).toBe(-80000);
    expect(result.category.rows[0].deviationPct).toBe(-80);
    expect(result.category.rows[0].key).not.toBe(result.commission.rows[0].key);
    expect(result.category.maximumCents).toBe(100000);
    expect(result.commission.maximumCents).toBe(110000);
  });
});
