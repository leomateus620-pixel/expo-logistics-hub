import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerWelcomeSuggestions } from '../components/WorkerWelcomeSuggestions';
import { useWorkerWelcomeRotation } from '../useWorkerWelcome';
import { getWorker } from '../workerCatalog';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Sugestões de abertura', () => {
  it('troca a cada 60 segundos, preservando o conjunto antes do prazo', () => {
    const { result } = renderHook(() => useWorkerWelcomeRotation(false, 'team'));
    act(() => vi.advanceTimersByTime(59_999)); expect(result.current).toBe(0);
    act(() => vi.advanceTimersByTime(1)); expect(result.current).toBe(1);
    act(() => vi.advanceTimersByTime(60_000)); expect(result.current).toBe(2);
    act(() => vi.advanceTimersByTime(60_000)); expect(result.current).toBe(0);
  });
  it('pausa durante foco, hover ou digitação e exige um minuto livre ao retomar', () => {
    const { result, rerender } = renderHook(({ paused }) => useWorkerWelcomeRotation(paused, 'team'), { initialProps: { paused: false } });
    act(() => vi.advanceTimersByTime(30_000));
    rerender({ paused: true }); act(() => vi.advanceTimersByTime(180_000)); expect(result.current).toBe(0);
    rerender({ paused: false }); act(() => vi.advanceTimersByTime(59_999)); expect(result.current).toBe(0);
    act(() => vi.advanceTimersByTime(1)); expect(result.current).toBe(1);
  });
  it('não gira em aba oculta e reinicia o conjunto para outro bot', () => {
    const { result, rerender } = renderHook(({ scope }) => useWorkerWelcomeRotation(false, scope), { initialProps: { scope: 'agenda' } });
    act(() => vi.advanceTimersByTime(60_000)); expect(result.current).toBe(1);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    act(() => vi.advanceTimersByTime(120_000)); expect(result.current).toBe(1);
    rerender({ scope: 'mapa' }); expect(result.current).toBe(0);
  });
  it('mantém três perguntas completas, personaliza pelo bot e apenas entrega a seleção ao campo', () => {
    const onSelect = vi.fn(), onHoverChange = vi.fn();
    const worker = getWorker('agenda')!;
    const { rerender } = render(<WorkerWelcomeSuggestions worker={worker} cycle={0} onSelect={onSelect} onHoverChange={onHoverChange} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText('Com Agenda')).toBeInTheDocument();
    const first = screen.getByRole('button', { name: worker.examples[0] });
    first.focus(); expect(first).toHaveFocus(); fireEvent.click(first);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(worker.examples[0]);
    fireEvent.mouseEnter(screen.getByLabelText('Sugestões para começar')); expect(onHoverChange).toHaveBeenLastCalledWith(true);
    fireEvent.mouseLeave(screen.getByLabelText('Sugestões para começar')); expect(onHoverChange).toHaveBeenLastCalledWith(false);
    rerender(<WorkerWelcomeSuggestions worker={worker} cycle={1} onSelect={onSelect} onHoverChange={onHoverChange} />);
    expect(screen.getByRole('button', { name: 'Qual o percentual de Reserva Legal no RS?' })).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
