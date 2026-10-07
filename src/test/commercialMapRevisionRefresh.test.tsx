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
  const base = { projectId: 'p1', enabled: true, isFetching: false, hasError: false, intervalMs: 1000 };

  it('compara com a revisão do inventário carregado e recarrega uma vez por assinatura nova', async () => {
    vi.useFakeTimers();
    const revisions = ['r1', 'r1', 'r2', 'r2'];
    const fetchRevision = vi.fn(async () => revisions.shift() ?? 'r2');
    const refetch = vi.fn().mockResolvedValue({});
    renderHook(() => useCommercialMapRevision({ ...base, dataRevision: 'r1', refetch, fetchRevision }));
    await flush();
    expect(refetch).not.toHaveBeenCalled();
    await flush(1000);
    expect(refetch).not.toHaveBeenCalled();
    await flush(1000);
    expect(refetch).toHaveBeenCalledWith({ cancelRefetch: false });
    await flush(1000); // mesma assinatura nova ainda não carregada: não repete
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('falhas isoladas não recarregam; falhas seguidas marcam não confirmado e recuperam uma vez', async () => {
    vi.useFakeTimers();
    const fetchRevision = vi.fn().mockRejectedValue(new Error('timeout'));
    const refetch = vi.fn().mockResolvedValue({});
    const { result } = renderHook(() => useCommercialMapRevision({ ...base, dataRevision: 'r1', refetch, fetchRevision }));
    await flush();
    await flush(1000);
    expect(refetch).not.toHaveBeenCalled();
    expect(result.current.unconfirmed).toBe(false);
    await flush(1000);
    expect(result.current.unconfirmed).toBe(true);
    expect(refetch).toHaveBeenCalledTimes(1);
    await flush(1000);
    expect(refetch).toHaveBeenCalledTimes(1); // recuperação espaçada
  });

  it('não consulta enquanto o mapa completo está carregando ou sem projeto', async () => {
    vi.useFakeTimers();
    const fetchRevision = vi.fn().mockResolvedValue('r1');
    renderHook(() => useCommercialMapRevision({ ...base, dataRevision: null, isFetching: true, refetch: vi.fn(), fetchRevision }));
    renderHook(() => useCommercialMapRevision({ ...base, projectId: null, dataRevision: null, refetch: vi.fn(), fetchRevision }));
    await flush(3000);
    expect(fetchRevision).not.toHaveBeenCalled();
  });
});
