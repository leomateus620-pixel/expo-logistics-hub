import { act, renderHook } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleCommercialMapRefresh } from '@/features/commercial-map/queries/commercialMapRefresh';
import { useCommercialMapRevision } from '@/features/commercial-map/hooks/useCommercialMapRevision';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

afterEach(() => { vi.useRealTimers(); });

describe('recarga agrupada do Mapa Comercial', () => {
  it('agrupa pedidos próximos numa única recarga sem cancelar a carga em andamento', async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const a = scheduleCommercialMapRefresh(client);
    const b = scheduleCommercialMapRefresh(client);
    scheduleCommercialMapRefresh(client);
    expect(a).toBe(b);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    await a;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['commercial-map'] }, { cancelRefetch: false });
  });
});

describe('verificação leve de versão', () => {
  const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

  it('só recarrega o mapa completo quando a assinatura muda', async () => {
    vi.useFakeTimers();
    const revisions = ['r1', 'r1', 'r2'];
    const fetchRevision = vi.fn(async () => revisions.shift() ?? 'r2');
    const refetch = vi.fn().mockResolvedValue({});
    renderHook(() => useCommercialMapRevision({ projectId: 'p1', enabled: true, isFetching: false, hasError: false,
      refetch, intervalMs: 1000, fetchRevision }));
    await flush();
    expect(fetchRevision).toHaveBeenCalledTimes(1);
    expect(refetch).not.toHaveBeenCalled();
    await flush(1000);
    expect(refetch).not.toHaveBeenCalled();
    await flush(1000);
    expect(refetch).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('tenta a recarga completa quando a última carga falhou, e ignora falha da verificação', async () => {
    vi.useFakeTimers();
    const fetchRevision = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('r1');
    const refetch = vi.fn().mockResolvedValue({});
    renderHook(() => useCommercialMapRevision({ projectId: 'p1', enabled: true, isFetching: false, hasError: true,
      refetch, intervalMs: 1000, fetchRevision }));
    await flush();
    expect(refetch).not.toHaveBeenCalled();
    await flush(1000);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('não consulta enquanto o mapa completo está carregando ou desativado', async () => {
    vi.useFakeTimers();
    const fetchRevision = vi.fn().mockResolvedValue('r1');
    renderHook(() => useCommercialMapRevision({ projectId: 'p1', enabled: true, isFetching: true, hasError: false,
      refetch: vi.fn(), intervalMs: 1000, fetchRevision }));
    renderHook(() => useCommercialMapRevision({ projectId: null, enabled: true, isFetching: false, hasError: false,
      refetch: vi.fn(), intervalMs: 1000, fetchRevision }));
    await flush(3000);
    expect(fetchRevision).not.toHaveBeenCalled();
  });
});
