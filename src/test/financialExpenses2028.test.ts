import { describe, expect, it } from 'vitest';
import { centsToInput, deviation, parseCents } from '@/features/financial-management/operational/financialExpensesApi';

describe('Despesas 2028 — conversões e desvio', () => {
  it('converte valores em centavos inteiros e diferencia vazio de zero', () => {
    expect(parseCents('')).toBeNull();
    expect(parseCents('0')).toBe(0);
    expect(parseCents('1.234,56')).toBe(123456);
    expect(parseCents('R$ 10,5')).toBe(1050);
    expect(() => parseCents('1,234')).toThrow();
    expect(() => parseCents('-5')).toThrow();
    expect(() => parseCents('99999999999999999')).toThrow();
    expect(centsToInput(123456)).toBe('1.234,56');
    expect(centsToInput(null)).toBe('');
  });

  it('desvio = realizado − projetado, sem percentual quando não há previsão', () => {
    expect(deviation(100000, 120000)).toEqual({ cents: 20000, pct: 20, state: 'comparavel' });
    expect(deviation(100000, 80000)).toEqual({ cents: -20000, pct: -20, state: 'comparavel' });
    expect(deviation(null, 50000)).toEqual({ cents: null, pct: null, state: 'sem_previsao' });
    expect(deviation(0, 50000)).toEqual({ cents: 50000, pct: null, state: 'sem_previsao' });
    expect(deviation(100000, null).state).toBe('sem_realizado');
  });
});
