import { useRef } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seededRandom, useMascotActive, useMascotLife } from '../mascot/useMascotLife';

// Isolate the hook's timers from Motion's shared animation-frame scheduler.
vi.mock('motion/react', () => ({ useMotionValue: () => ({ set: vi.fn() }), useSpring: (value: unknown) => value }));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); Object.defineProperty(document, 'hidden', { configurable: true, value: false }); });

function ActivityProbe({ paused = false }: { paused?: boolean }) { const ref = useRef<HTMLDivElement>(null); const active = useMascotActive(ref, paused); return <div ref={ref} data-testid="active">{String(active)}</div>; }
function LifeProbe() { const ref = useRef<HTMLSpanElement>(null); const { blinking } = useMascotLife(ref, { seed: 'agenda', paused: false, interactive: false }); return <span ref={ref} data-testid="blink">{String(blinking)}</span>; }

describe('vida dos mascotes', () => {
  it('seeds iguais reproduzem o ritmo, seeds diferentes o dessincronizam', () => { const first = seededRandom('agenda'); const same = seededRandom('agenda'); const other = seededRandom('arena'); const values = [first(), first(), first()]; expect(values).toEqual([same(), same(), same()]); expect(values).not.toEqual([other(), other(), other()]); expect(values.every(value => value >= 0 && value < 1)).toBe(true); });
  it('limita o orçamento global a doze mascotes ativos', () => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
    render(<>{Array.from({ length: 15 }, (_, index) => <ActivityProbe key={index} />)}</>);
    expect(screen.getAllByTestId('active').filter(element => element.textContent === 'true')).toHaveLength(12);
  });
  it('pausa fora da tela, em aba oculta e por pedido explícito', () => {
    let notify: IntersectionObserverCallback;
    vi.stubGlobal('IntersectionObserver', class { constructor(callback: IntersectionObserverCallback) { notify = callback; } observe() {} disconnect() {} });
    const { rerender } = render(<ActivityProbe />);
    expect(screen.getByTestId('active')).toHaveTextContent('true');
    act(() => notify([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(screen.getByTestId('active')).toHaveTextContent('false');
    act(() => notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    act(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(screen.getByTestId('active')).toHaveTextContent('false');
    act(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(screen.getByTestId('active')).toHaveTextContent('true');
    rerender(<ActivityProbe paused />); expect(screen.getByTestId('active')).toHaveTextContent('false');
  });
  it('primeira piscada fica entre três e seis segundos e limpa seus timers', () => {
    vi.useFakeTimers(); vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
    const expectedDelay = 3000 + seededRandom('agenda')() * 3000;
    const { unmount } = render(<LifeProbe />);
    act(() => vi.advanceTimersByTime(Math.floor(expectedDelay) - 1)); expect(screen.getByTestId('blink')).toHaveTextContent('false');
    act(() => vi.advanceTimersByTime(2)); expect(screen.getByTestId('blink')).toHaveTextContent('true');
    act(() => vi.advanceTimersByTime(140)); expect(screen.getByTestId('blink')).toHaveTextContent('false');
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });
});
