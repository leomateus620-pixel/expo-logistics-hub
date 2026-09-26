import { describe, expect, it } from 'vitest';
import { splitCents, parseMoneyInputToCents } from '@/features/commercial-map/sales/salesMoney';
import { buildDraftSchedule, draftsSumCents, monthlyDueDates, redistribute } from '@/features/commercial-map/sales/salesInstallments';
import { paymentErrors } from '@/features/commercial-map/sales/components/SalesPaymentForm';
import { feesTotalCents } from '@/features/commercial-map/sales/salesTypes';
import { matchesExhibitor } from '@/features/commercial-map/sales/exhibitorService';

describe('checkout: parcelas, taxas e expositores', () => {
  it('sequência mensal no dia 5 a partir de 05/12/2026 sem pular janeiro', () => {
    expect(monthlyDueDates(4)).toEqual(['2026-12-05', '2027-01-05', '2027-02-05', '2027-03-05']);
  });
  it('divide centavos de forma exata e determinística', () => {
    expect(splitCents(100000, 3)).toEqual([33334, 33333, 33333]);
    expect(splitCents(100000, 3).reduce((a, b) => a + b, 0)).toBe(100000);
  });
  it('exemplo integrado: 10.000 + 100 + 200 + 50 = 10.350 em 3 × 3.450', () => {
    const fees = { adminCents: 10000, ppciCents: 20000, cleaningCents: 5000 };
    const total = 1_000_000 + feesTotalCents(fees);
    expect(total).toBe(1_035_000);
    const schedule = buildDraftSchedule(total, monthlyDueDates(3));
    expect(schedule.map((i) => i.amountCents)).toEqual([345000, 345000, 345000]);
    expect(schedule.map((i) => i.dueDate)).toEqual(['2026-12-05', '2027-01-05', '2027-02-05']);
  });
  it('taxas cobradas uma vez, independente da quantidade de lotes', () => {
    expect(feesTotalCents({ adminCents: 10000, ppciCents: 0, cleaningCents: 0 })).toBe(10000);
  });
  it('redistribui preservando datas personalizadas', () => {
    const drafts = [{ dueDate: '2026-12-10', amountCents: 1 }, { dueDate: '2027-02-20', amountCents: 1 }];
    const out = redistribute(1001, drafts);
    expect(out.map((d) => d.dueDate)).toEqual(['2026-12-10', '2027-02-20']);
    expect(draftsSumCents(out)).toBe(1001);
  });
  it('bloqueia divergência e PIX com mais de uma parcela', () => {
    const base = { countInput: '2', manualAmounts: true };
    expect(paymentErrors({ ...base, paymentMethod: 'BOLETO_PARCELADO', installments: [{ dueDate: '2026-12-05', amountCents: 500 }, { dueDate: '2027-01-05', amountCents: 400 }] }, 1000).sum).toMatch(/Faltam/);
    expect(paymentErrors({ ...base, paymentMethod: 'PIX', installments: [{ dueDate: '2026-12-05', amountCents: 500 }, { dueDate: '2027-01-05', amountCents: 500 }] }, 1000).count).not.toBeNull();
    expect(Object.values(paymentErrors({ ...base, paymentMethod: 'BOLETO_AVISTA', installments: [{ dueDate: '2026-12-05', amountCents: 1000 }] }, 1000)).every((e) => e === null)).toBe(true);
  });
  it('máscara monetária em centavos e busca por documento com/sem máscara', () => {
    expect(parseMoneyInputToCents('1.234,56')).toBe(123456);
    const item = { id: '1', name: 'BOTOLI', documentNumber: '048.675.580-01', phone: '(55) 99969-9631', email: 'a@b.com' };
    expect(matchesExhibitor(item, '04867558001')).toBe(true);
    expect(matchesExhibitor(item, '048.675')).toBe(true);
    expect(matchesExhibitor(item, 'botoli')).toBe(true);
  });
});
