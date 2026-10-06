import { describe, expect, it } from 'vitest';
import { resolveFinancialEdition } from '@/features/financial-management/operational/financialEditionSelection';
import { buildBudgetRows, executionStages, sponsorshipConfirmedCents, sponsorshipMoneyCents } from '@/features/financial-management/operational/financialOperationalMath';
import { describeFinancialError } from '@/features/financial-management/operational/financialOperationalApi';

const budget = (id: string, cap: number | null) => ({ id, edition_id: 'e', commission_id: 'c' + id, responsible_name: null, budget_cap_cents: cap, period_start: null, period_end: null, notes: null, version: 1, updated_at: '' });
const line = (budget_id: string, planned_cents: number, active = true) => ({ id: Math.random().toString(), budget_id, kind: 'operacional' as const, description: 'x', planned_cents, active, version: 1, notes: null });

describe('Financeiro 2028', () => {
  it('edição explícita na URL vence; padrão é o histórico 2026', () => {
    expect(resolveFinancialEdition('?edicao=2028', null)).toBe('2028');
    expect(resolveFinancialEdition('?edicao=2026', '2028')).toBe('2026');
    expect(resolveFinancialEdition('', '2028')).toBe('2028');
    expect(resolveFinancialEdition('?edicao=2099', null)).toBe('2026');
  });
  it('planejado deriva das linhas ativas em centavos; sem teto não vira zero', () => {
    const rows = buildBudgetRows([budget('a', 100000), budget('b', null)], [line('a', 33333), line('a', 66667), line('a', 5000, false), line('b', 10)]);
    expect(rows[0]).toMatchObject({ plannedCents: 100000, balanceCents: 0, utilizationPercentage: 100 });
    expect(rows[1]).toMatchObject({ plannedCents: 10, balanceCents: null, utilizationPercentage: null });
  });
  it('patrocínio soma só dinheiro; declarado e contrapartida ficam fora', () => {
    const s = { projected_free_cents: 200000, projected_rouanet_cents: 100000, confirmed_free_cents: 50000, confirmed_rouanet_cents: 1 };
    expect(sponsorshipMoneyCents(s)).toBe(300000);
    expect(sponsorshipConfirmedCents(s)).toBe(50001);
  });
  it('mensagens claras para erros do servidor', () => {
    expect(describeFinancialError(new Error('FINANCIAL_CONFLICT'))).toMatch(/outra pessoa/);
    expect(describeFinancialError(new Error('FINANCIAL_EDITION_READ_ONLY'))).toMatch(/histórica/);
    expect(describeFinancialError(new Error('FINANCIAL_FORBIDDEN: financial_confirm'))).toMatch(/confirmação/);
  });
});

describe('execução separada de liquidação', () => {
  it('despesa realizada sem pagamento fica toda em aberto', () => {
    expect(executionStages({ plannedCents: 50000, executedCents: 48000, settledCents: 0 }))
      .toMatchObject({ executedCents: 48000, settledCents: 0, openCents: 48000, headroomCents: 2000, inconsistent: false });
  });
  it('pagamento parcial reduz o saldo sem mudar o realizado', () => {
    expect(executionStages({ plannedCents: 50000, executedCents: 48000, settledCents: 20000 }))
      .toMatchObject({ executedCents: 48000, openCents: 28000 });
  });
  it('receita confirmada não é recebida', () => {
    expect(executionStages({ plannedCents: 70000, executedCents: 70000, settledCents: null })).toMatchObject({ settledCents: 0, openCents: 70000 });
  });
  it('liquidado acima do executado é inconsistente e não gera saldo negativo', () => {
    expect(executionStages({ executedCents: 0, settledCents: 20000 })).toMatchObject({ openCents: 0, inconsistent: true });
  });
});
