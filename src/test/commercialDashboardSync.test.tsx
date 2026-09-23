import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCommercialDashboardSync } from '@/features/commercial-map/dashboard/useCommercialDashboardSync';

const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');

function visibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
}

afterEach(() => {
  vi.useRealTimers();
  if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility);
});

describe('sincronização da Dashboard Comercial', () => {
  it('consulta a mesma query a cada 30 s somente aberta e visível; foco atualiza imediatamente', async () => {
    vi.useFakeTimers();
    visibility('visible');
    const refetch = vi.fn().mockResolvedValue({});
    const { rerender } = renderHook((props) => useCommercialDashboardSync(props), {
      initialProps: { open: false, enabled: true, isFetching: false, refetch },
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(refetch).not.toHaveBeenCalled();

    rerender({ open: true, enabled: true, isFetching: false, refetch });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(refetch).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(refetch).toHaveBeenCalledTimes(1);

    visibility('hidden');
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(refetch).toHaveBeenCalledTimes(1);

    visibility('visible');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(refetch).toHaveBeenCalledTimes(2);

    rerender({ open: true, enabled: true, isFetching: true, refetch });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(refetch).toHaveBeenCalledTimes(2);

    rerender({ open: false, enabled: true, isFetching: false, refetch });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('não inicia outra consulta enquanto a anterior permanece em andamento', async () => {
    vi.useFakeTimers();
    visibility('visible');
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const refetch = vi.fn().mockReturnValue(pending);
    renderHook(() => useCommercialDashboardSync({ open: true, enabled: true, isFetching: false, refetch }));

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(refetch).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await pending; });
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('libera a próxima atualização após uma falha de rede', async () => {
    vi.useFakeTimers();
    visibility('visible');
    const refetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
    renderHook(() => useCommercialDashboardSync({ open: true, enabled: true, isFetching: false, refetch }));

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(refetch).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(refetch).toHaveBeenCalledTimes(2);
  });
});
