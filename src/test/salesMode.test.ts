import { describe, expect, it } from 'vitest';
import { buildInstallmentSchedule, buildInstallmentScheduleFromDates, installmentsSum } from '@/features/commercial-map/sales/salesInstallments';
import { summarizeCart } from '@/features/commercial-map/sales/salesPricing';
import type { SalesSelectionEntry } from '@/features/commercial-map/sales/salesTypes';
import { isValidCnpj, isValidCpf, isValidDocument, isValidPhoneBr } from '@/features/commercial-map/sales/salesValidation';
import type { LotPricing2028 } from '@/features/commercial-map/utils/lotPricing2028';

function pricing(overrides: Partial<LotPricing2028> & { lotId: string }): LotPricing2028 {
  return {
    publicIdentifier: overrides.lotId,
    pavilion: null,
    block: null,
    lotNumber: null,
    cornerConfirmed: false,
    cornerStatus: null,
    officialAreaSqm: 5,
    areaValidationStatus: 'CALCULATED',
    renovacaoPricePerSqm: 50,
    renovacaoTotal: 250,
    renovacaoRuleLabel: 'Regra teste',
    segundaPricePerSqm: 55,
    segundaTotal: 275,
    segundaRuleLabel: 'Regra teste',
    resolutionStatus: 'OK',
    ...overrides,
  };
}

function entry(lotId: string): SalesSelectionEntry {
  return { lotId, publicIdentifier: lotId, displayName: lotId, context: null };
}

describe('resumo do carrinho de vendas', () => {
  it('soma item a item nas duas etapas, com matemática exata', () => {
    const index = new Map([
      ['a', pricing({ lotId: 'a' })],
      ['b', pricing({ lotId: 'b', officialAreaSqm: 3, renovacaoTotal: 150, segundaTotal: 165 })],
    ]);
    const renovacao = summarizeCart([entry('a'), entry('b')], index, 'RENOVACAO');
    expect(renovacao.valueTotal).toBe(400);
    expect(renovacao.areaTotal).toBe(8);
    expect(renovacao.ready).toBe(true);

    const segunda = summarizeCart([entry('a'), entry('b')], index, 'SEGUNDA_ETAPA');
    expect(segunda.valueTotal).toBe(440);
  });

  it('bloqueia a venda quando o espaço está excluído de preço (Pavilhão 7)', () => {
    const index = new Map([['p7', pricing({ lotId: 'p7', resolutionStatus: 'EXCLUIDO', renovacaoTotal: null, segundaTotal: null })]]);
    const summary = summarizeCart([entry('p7')], index, 'RENOVACAO');
    expect(summary.valueTotal).toBe(0);
    expect(summary.blockingCount).toBe(1);
    expect(summary.ready).toBe(false);
    expect(summary.lines[0].pendingReason).toBe('Valor ainda não definido');
  });

  it('não fica pronto com carrinho vazio', () => {
    expect(summarizeCart([], new Map(), 'RENOVACAO').ready).toBe(false);
  });
});

describe('cronograma de parcelas', () => {
  it('fecha exatamente o total mesmo com divisão inexata', () => {
    const schedule = buildInstallmentSchedule(100, 3, '2028-01-31');
    expect(schedule.map((item) => item.amount)).toEqual([33.33, 33.33, 33.34]);
    expect(installmentsSum(schedule)).toBe(100);
  });

  it('avança os vencimentos mês a mês respeitando o fim do mês', () => {
    const schedule = buildInstallmentSchedule(300, 3, '2028-01-31');
    expect(schedule.map((item) => item.dueDate)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
  });

  it('à vista gera uma única parcela com o total', () => {
    const schedule = buildInstallmentSchedule(18900, 1, '2028-05-10');
    expect(schedule).toHaveLength(1);
    expect(schedule[0].amount).toBe(18900);
  });

  it('aceita até 36 vencimentos personalizados e preserva a soma exata', () => {
    const dueDates = Array.from({ length: 30 }, (_, index) => `2028-${String((index % 12) + 1).padStart(2, '0')}-10`);
    const schedule = buildInstallmentScheduleFromDates(1000, dueDates);
    expect(schedule).toHaveLength(30);
    expect(schedule.map((item) => item.dueDate)).toEqual(dueDates);
    expect(installmentsSum(schedule)).toBe(1000);
  });
});

describe('validação do expositor', () => {
  it('valida CPF e CNPJ reais e rejeita inválidos', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCnpj('04.252.011/0001-10')).toBe(true);
    expect(isValidDocument('5299822472')).toBe(false);
  });

  it('exige celular com DDD', () => {
    expect(isValidPhoneBr('(55) 99999-9999')).toBe(true);
    expect(isValidPhoneBr('99999999')).toBe(false);
  });
});
