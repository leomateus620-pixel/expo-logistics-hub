import { describe, expect, it } from 'vitest';
import { budgetTotal, parseCurrencyDigits, sortActionsByTime } from '@/components/cronograma-eventos/workspace/planBuilderUtils';

describe('sortActionsByTime', () => {
  it('moves an action changed from 09:00 to 07:30 to the top', () => {
    const sorted = sortActionsByTime([
      { title: 'Recepção', startTime: '08:00' },
      { title: 'Abertura', startTime: '07:30' },
      { title: 'Encerramento', startTime: '11:00' },
    ]);
    expect(sorted.map((a) => a.title)).toEqual(['Abertura', 'Recepção', 'Encerramento']);
    expect(sorted.map((a) => a.sortOrder)).toEqual([0, 1, 2]);
  });
  it('keeps actions without time at the end', () => {
    const sorted = sortActionsByTime([{ title: 'Sem', startTime: '' }, { title: 'A', startTime: '10:00' }]);
    expect(sorted.map((a) => a.title)).toEqual(['A', 'Sem']);
  });
  it('is stable for equal times', () => {
    const sorted = sortActionsByTime([{ title: 'X', startTime: '09:00' }, { title: 'Y', startTime: '09:00' }]);
    expect(sorted.map((a) => a.title)).toEqual(['X', 'Y']);
  });
});

describe('budget', () => {
  it('sums item values', () => {
    expect(budgetTotal([{ item: 'Coffee', amount: 1200 }, { item: 'Som', amount: 800.5 }])).toBe(2000.5);
  });
  it('parses masked currency digits', () => {
    expect(parseCurrencyDigits('1.200,50')).toBe(1200.5);
  });
});
