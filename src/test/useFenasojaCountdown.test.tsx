import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFenasojaCountdown } from '@/hooks/useFenasojaCountdown';
import { FENASOJA_2028_OPENING_TIMESTAMP } from '@/lib/fenasoja-countdown';

function setDocumentVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  });
}

describe('useFenasojaCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setDocumentVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('recalcula a partir do relógio absoluto em cada fronteira de segundo', () => {
    const initialTime = FENASOJA_2028_OPENING_TIMESTAMP - 64_000;
    vi.setSystemTime(initialTime);

    const { result, unmount } = renderHook(() => useFenasojaCountdown());
    expect(result.current.snapshot).toMatchObject({ minutes: 1, seconds: 4 });

    act(() => {
      vi.advanceTimersByTime(1_012);
    });

    expect(result.current.snapshot).toMatchObject({ minutes: 1, seconds: 3 });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('suspende o timer oculto e reconcilia imediatamente ao retornar', () => {
    const initialTime = FENASOJA_2028_OPENING_TIMESTAMP - 300_000;
    vi.setSystemTime(initialTime);

    const { result } = renderHook(() => useFenasojaCountdown());
    expect(result.current.snapshot.minutes).toBe(5);

    act(() => {
      setDocumentVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    vi.setSystemTime(initialTime + 121_000);
    expect(result.current.snapshot.minutes).toBe(5);
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      setDocumentVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.snapshot).toMatchObject({ minutes: 2, seconds: 59 });
  });

  it('para de agendar trabalho depois da abertura', () => {
    vi.setSystemTime(FENASOJA_2028_OPENING_TIMESTAMP + 1_000);

    const { result } = renderHook(() => useFenasojaCountdown());

    expect(result.current.snapshot.phase).toBe('open');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recalcula o rollover de minuto a partir do timestamp absoluto', () => {
    const initialTime = FENASOJA_2028_OPENING_TIMESTAMP - 60_000;
    vi.setSystemTime(initialTime);

    const { result } = renderHook(() => useFenasojaCountdown());
    expect(result.current.snapshot).toMatchObject({ minutes: 1, seconds: 0 });

    act(() => {
      vi.advanceTimersByTime(1_012);
    });

    expect(result.current.snapshot).toMatchObject({ minutes: 0, seconds: 59 });
  });

  it('suspende fora do viewport e reconcilia ao reaparecer', () => {
    const initialTime = FENASOJA_2028_OPENING_TIMESTAMP - 180_000;
    vi.setSystemTime(initialTime);

    const { result, rerender } = renderHook(
      ({ enabled }) => useFenasojaCountdown(enabled),
      { initialProps: { enabled: true } },
    );
    expect(result.current.snapshot).toMatchObject({ minutes: 3, seconds: 0 });

    rerender({ enabled: false });
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(initialTime + 62_000);

    rerender({ enabled: true });
    expect(result.current.snapshot).toMatchObject({ minutes: 1, seconds: 58 });
  });
});
