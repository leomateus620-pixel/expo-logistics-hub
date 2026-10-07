import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { refreshSession: vi.fn().mockResolvedValue({}) } } }));

import { classifyCommercialMapFailure, commercialMapRetryDelay, shouldRetryCommercialMap } from '@/features/commercial-map/queries/commercialMapRetryPolicy';
import { boundedSignal, measureCommercialMapOperation } from '@/features/commercial-map/utils/commercialMapOperation';
import { commercialMapBootProgress } from '@/features/commercial-map/components/CommercialMapBootLoader';

describe('classificação de falhas da abertura', () => {
  it.each([
    [{ code: '57014', message: 'canceling statement due to statement timeout' }, 'timeout'],
    [new TypeError('Failed to fetch'), 'network'],
    [{ status: 503, message: 'Service Unavailable' }, 'temporary'],
    [{ status: 429, message: 'too many' }, 'temporary'],
    [{ message: 'MAP_PERMISSION_DENIED' }, 'denied'],
    [{ code: '42501', message: 'permission denied' }, 'denied'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'session'],
    [{ code: '42P01', message: 'relation does not exist' }, 'configuration'],
    [new DOMException('x', 'AbortError'), 'aborted'],
  ])('%o → %s', (error, kind) => { expect(classifyCommercialMapFailure(error)).toBe(kind); });

  it('repete transitórias com limite e nunca repete negação/configuração', () => {
    const timeout = { code: '57014', message: 'timeout' };
    expect([0, 1, 2, 3].every((n) => shouldRetryCommercialMap(n, timeout))).toBe(true);
    expect(shouldRetryCommercialMap(4, timeout)).toBe(false);
    expect(shouldRetryCommercialMap(0, { message: 'MAP_PERMISSION_DENIED' })).toBe(false);
    expect(shouldRetryCommercialMap(0, { code: '42P01', message: 'x' })).toBe(false);
  });

  it('sessão expirada: uma renovação e uma nova tentativa', () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const jwt = { code: 'PGRST301', message: 'JWT expired' };
    expect(shouldRetryCommercialMap(0, jwt, refresh)).toBe(true);
    expect(shouldRetryCommercialMap(1, jwt, refresh)).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('intervalo progressivo com variação e Retry-After respeitado', () => {
    expect(commercialMapRetryDelay(1, {}, () => 0.5)).toBe(1000);
    expect(commercialMapRetryDelay(3, {}, () => 0.5)).toBe(4000);
    expect(commercialMapRetryDelay(1, {}, () => 0)).toBe(800);
    expect(commercialMapRetryDelay(1, { retryAfter: '3' })).toBe(3000);
  });
});

describe('marcadores da etapa de dados', () => {
  it('falha encerra a medição mas não marca sucesso; cancelamento não é falha', async () => {
    const marks: Array<[string, Record<string, unknown> | undefined]> = [];
    const record = (stage: string, detail?: Record<string, unknown>) => { marks.push([stage, detail]); };
    await expect(measureCommercialMapOperation(record, 'essential-data', async () => { throw new Error('timeout'); })).rejects.toThrow();
    expect(marks.map(([s]) => s)).toEqual(['essential-data:start', 'essential-data:end']);
    expect(marks[1][1]?.failed).toBe(true);
    marks.length = 0;
    await expect(measureCommercialMapOperation(record, 'essential-data', async () => { throw new DOMException('x', 'AbortError'); })).rejects.toThrow();
    expect(marks.map(([s]) => s)).toEqual(['essential-data:start', 'essential-data:aborted']);
    marks.length = 0;
    await measureCommercialMapOperation(record, 'essential-data', async () => 1);
    expect(marks.map(([s]) => s)).toContain('essential-data:ok');
  });

  it('o carregador só conclui "Dados comerciais" com resultado válido', () => {
    const base = { startedAt: 0, preparationAttempt: 0, interactive: false, commercialMapReady: false, failed: false };
    expect(commercialMapBootProgress({ ...base, marks: { 'essential-data:end': 1 } }).progress).toBe(0);
    expect(commercialMapBootProgress({ ...base, marks: { 'essential-data:ok': 1 } }).progress).toBe(23);
  });

  it('limite próprio cancela a verificação sem cancelar o sinal da consulta', async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const bounded = boundedSignal(parent.signal, 8000);
    await vi.advanceTimersByTimeAsync(8000);
    expect(bounded.signal.aborted).toBe(true);
    expect(parent.signal.aborted).toBe(false);
    bounded.dispose();
    vi.useRealTimers();
  });
});

describe('primeira consulta falha e a seguinte funciona', () => {
  it('a consulta segue pendente durante a recuperação e termina com dados', async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    let calls = 0;
    const observer = new QueryObserver(client, {
      queryKey: ['commercial-map', 'test'],
      queryFn: async () => { calls += 1; if (calls === 1) throw { code: '57014', message: 'timeout' }; return 'ok'; },
      retry: shouldRetryCommercialMap,
      retryDelay: (n, e) => commercialMapRetryDelay(n, e, () => 0.5),
    });
    const states: string[] = [];
    const unsubscribe = observer.subscribe((r) => states.push(r.status));
    await vi.advanceTimersByTimeAsync(0);
    expect(observer.getCurrentResult().status).toBe('pending');
    expect(observer.getCurrentResult().failureCount).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(observer.getCurrentResult().data).toBe('ok');
    expect(states).not.toContain('error');
    expect(calls).toBe(2);
    unsubscribe();
    vi.useRealTimers();
  });
});
