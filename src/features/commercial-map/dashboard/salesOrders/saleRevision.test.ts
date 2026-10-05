import { describe, expect, it } from 'vitest';
import { previewRevision } from './saleRevision';

const inst = (n: number, amount: number, paid = false) => Array.from({ length: n }, (_, i) => ({ number: i + 1, amount, paid: paid && i === 0 }));

describe('previewRevision', () => {
  it('troca com mesmo preço mantém total e parcelas', () => {
    const r = previewRevision({ keptItemTotals: [2328, 2328, 2328, 2328], addedItemTotals: [2328], feesCents: 10700, installments: inst(17, 691), installmentCount: 17, originalTotal: 11747 });
    expect(r.total).toBe(11747);
    expect(r.schedule.every((i) => i.amount === 691)).toBe(true);
  });
  it('adicionar lote redistribui só parcelas em aberto, preservando a paga', () => {
    const r = previewRevision({ keptItemTotals: [1000], addedItemTotals: [500], feesCents: 0, installments: inst(3, 333.34, true), installmentCount: 3, originalTotal: 1000 });
    expect(r.schedule[0]).toEqual({ number: 1, amount: 333.34, paid: true });
    const sum = r.schedule.reduce((s, i) => s + Math.round(i.amount * 100), 0);
    expect(sum).toBe(150000);
  });
  it('aumenta quantidade de parcelas', () => {
    const r = previewRevision({ keptItemTotals: [1000], addedItemTotals: [], feesCents: 0, installments: inst(2, 500), installmentCount: 4, originalTotal: 1000 });
    expect(r.schedule).toHaveLength(4);
    expect(r.schedule.map((i) => i.amount)).toEqual([250, 250, 250, 250]);
  });
  it('sinaliza total abaixo do já recebido', () => {
    const r = previewRevision({ keptItemTotals: [100], addedItemTotals: [], feesCents: 0, installments: [{ number: 1, amount: 500, paid: true }, { number: 2, amount: 500, paid: false }], installmentCount: 2, originalTotal: 1000 });
    expect(r.belowPaid).toBe(true);
  });
});
