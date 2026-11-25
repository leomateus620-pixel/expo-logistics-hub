import { beforeEach, describe, expect, it } from 'vitest';
import { adoptVerifiedSessionAttempt, clearSaleAttempt, listSaleAttempts, previousSessionAttempt, startSaleAttempt } from '@/features/commercial-map/sales/saleAttemptStore';
import { classifySalesError } from '@/features/commercial-map/sales/salesErrors';
import { isStructuralCronogramaReadError } from '@/hooks/useCronogramaEventos';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('tentativa de venda recuperável', () => {
  const owner = { projectId: 'project-a', operatorId: 'operator-a' };

  it('preserva o envio original mesmo depois de abrir outra seleção e etapa', () => {
    const first = startSaleAttempt(owner, 'RENOVACAO', ['b', 'a']);
    const other = startSaleAttempt(owner, 'SEGUNDA_ETAPA', ['c']);
    expect(first.lotIds).toEqual(['a', 'b']);
    expect(listSaleAttempts(owner)).toEqual(expect.arrayContaining([first, other]));
    expect(other.key).not.toBe(first.key);
    clearSaleAttempt(first);
    expect(listSaleAttempts(owner)).toEqual([other]);
  });

  it('isola os envios entre projetos e operadores e nunca herda a chave de outro envio', () => {
    const first = startSaleAttempt(owner, 'RENOVACAO', ['a']);
    const changed = startSaleAttempt(owner, 'RENOVACAO', ['a']);
    expect(changed.key).not.toBe(first.key);
    expect(listSaleAttempts({ ...owner, projectId: 'project-b' })).toEqual([]);
    expect(listSaleAttempts({ ...owner, operatorId: 'operator-b' })).toEqual([]);
  });

  it('só registra no escopo atual a tentativa antiga depois da verificação', () => {
    const key = crypto.randomUUID();
    const lotId = crypto.randomUUID();
    sessionStorage.setItem('fenasoja.commercial-sale-attempt.v1', JSON.stringify({
      key, scope: `RENOVACAO|${lotId}`, startedAt: 1000,
    }));
    const candidate = previousSessionAttempt(owner);
    expect(candidate).toMatchObject({ ...owner, key, lotIds: [lotId] });
    expect(listSaleAttempts(owner)).toEqual([]);
    adoptVerifiedSessionAttempt(candidate!);
    expect(listSaleAttempts(owner)).toEqual([candidate]);
    expect(previousSessionAttempt(owner)).toBeNull();
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
