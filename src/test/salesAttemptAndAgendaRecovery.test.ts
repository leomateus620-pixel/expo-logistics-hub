import { beforeEach, describe, expect, it } from 'vitest';
import { clearSaleAttempt, markSaleAttemptUncertain, peekSaleAttempt, resolveSaleAttempt, saleAttemptScope } from '@/features/commercial-map/sales/saleAttemptStore';
import { classifySalesError } from '@/features/commercial-map/sales/salesErrors';
import { isStructuralCronogramaReadError } from '@/hooks/useCronogramaEventos';

beforeEach(() => sessionStorage.clear());

describe('tentativa de venda recuperável', () => {
  it('reutiliza a mesma chave para o mesmo conjunto de espaços até a confirmação', () => {
    let n = 0;
    const key = () => `k${++n}`;
    const scope = saleAttemptScope(['b', 'a'], 'RENOVACAO');
    expect(scope).toBe(saleAttemptScope(['a', 'b'], 'RENOVACAO'));
    const first = resolveSaleAttempt(scope, key);
    markSaleAttemptUncertain(first.key);
    const again = resolveSaleAttempt(scope, key);
    expect(again.key).toBe(first.key);
    expect(again.uncertain).toBe(true);
    clearSaleAttempt(first.key);
    expect(peekSaleAttempt()).toBeNull();
    expect(resolveSaleAttempt(scope, key).key).not.toBe(first.key);
  });

  it('outro conjunto de espaços recebe chave nova', () => {
    const a = resolveSaleAttempt(saleAttemptScope(['a'], 'S'));
    const b = resolveSaleAttempt(saleAttemptScope(['a', 'c'], 'S'));
    expect(a.key).not.toBe(b.key);
  });

  it('timeout de gateway é resultado indeterminado; regra comercial não', () => {
    expect(classifySalesError('upstream request timeout', null)).toBe('NETWORK');
    expect(classifySalesError('LOT_NOT_SELLABLE', 'P0001')).toBe('BUSINESS');
  });
});

describe('Agenda: leitura x gravação', () => {
  it('só estrutura ausente é indisponibilidade comprovada', () => {
    expect(isStructuralCronogramaReadError({ code: '42P01', message: 'relation does not exist' })).toBe(true);
    expect(isStructuralCronogramaReadError(new Error('Failed to fetch'))).toBe(false);
    expect(isStructuralCronogramaReadError({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false);
  });
});
