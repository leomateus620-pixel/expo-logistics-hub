// @vitest-environment jsdom

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventDrawer } from '@/components/cronograma-eventos/EventDrawer';
import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import {
  HARVEST_ANIMATION_DURATION_MS,
  HARVEST_REDUCED_MOTION_DURATION_MS,
  getHarvestEventKey,
  getHarvestResumeDelay,
  mergeHarvestCompletionSnapshots,
  useEventHarvestCompletion,
} from '@/hooks/useEventHarvestCompletion';

const event: CronogramaEvent = {
  id: 'seed-event',
  sourceKey: 'official-event',
  title: 'Preparar área de exposição',
  summary: 'Preparação operacional da área principal.',
  date: '2027-03-12',
  year: 2027,
  category: 'infraestrutura',
  status: 'planned',
  priority: 'high',
  kind: 'event',
};

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('harvest resume timing', () => {
  it('retoma a fase visual pelo relogio original sem reiniciar ao remontar o card', () => {
    const startedAt = Date.parse('2026-07-24T12:00:00Z');
    const fullMotionJob = {
      event,
      phase: 'harvesting' as const,
      reducedMotion: false,
      startedAt,
    };
    const reducedMotionJob = { ...fullMotionJob, reducedMotion: true };

    expect(getHarvestResumeDelay(fullMotionJob, startedAt + 2_150)).toBe(-2_150);
    expect(getHarvestResumeDelay(fullMotionJob, startedAt + 8_000)).toBe(-HARVEST_ANIMATION_DURATION_MS);
    expect(getHarvestResumeDelay(reducedMotionJob, startedAt + 8_000)).toBe(-HARVEST_REDUCED_MOTION_DURATION_MS);
  });
});

describe('orquestração da colheita de conclusão', () => {
  it('mantém o snapshot anterior até o watchdog liberar o evento persistido', () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    const onFinish = vi.fn();
    const { result } = renderHook(() => useEventHarvestCompletion());

    act(() => {
      expect(result.current.prepare(event)).toBe(true);
      expect(result.current.prepare(event)).toBe(false);
    });
    expect(result.current.jobs[getHarvestEventKey(event)]?.phase).toBe('preparing');

    const persistedEvent = { ...event, id: 'uuid-from-backend', status: 'completed' as const };
    const projected = mergeHarvestCompletionSnapshots([persistedEvent], result.current.jobs);
    expect(projected).toEqual([event]);

    let duration = 0;
    act(() => {
      duration = result.current.play(event, onFinish);
    });
    expect(duration).toBe(HARVEST_ANIMATION_DURATION_MS);
    expect(result.current.jobs[getHarvestEventKey(event)]?.phase).toBe('harvesting');

    act(() => vi.advanceTimersByTime(HARVEST_ANIMATION_DURATION_MS - 1));
    expect(result.current.jobs[getHarvestEventKey(event)]).toBeDefined();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.jobs[getHarvestEventKey(event)]).toBeUndefined();
    expect(onFinish).toHaveBeenCalledWith(event);
  });

  it('usa a transição compacta e devolve o foco antes de remover o card', () => {
    vi.useFakeTimers();
    setReducedMotion(true);
    const panel = document.createElement('section');
    panel.id = 'cronograma-view-panel';
    panel.tabIndex = 0;
    const card = document.createElement('button');
    card.dataset.harvestEventKey = getHarvestEventKey(event);
    document.body.append(panel, card);
    card.focus();
    const { result } = renderHook(() => useEventHarvestCompletion());

    act(() => {
      result.current.prepare(event);
    });
    let duration = 0;
    act(() => {
      duration = result.current.play(event);
    });
    expect(duration).toBe(HARVEST_REDUCED_MOTION_DURATION_MS);

    act(() => vi.advanceTimersByTime(HARVEST_REDUCED_MOTION_DURATION_MS));
    expect(panel).toHaveFocus();
    expect(result.current.jobs).toEqual({});
    panel.remove();
    card.remove();
  });

  it('cancela somente o evento que falhou e permite conclusões posteriores', () => {
    const secondEvent = { ...event, id: 'second', sourceKey: 'second-event', title: 'Segundo evento' };
    const { result } = renderHook(() => useEventHarvestCompletion());

    act(() => {
      result.current.prepare(event);
      result.current.prepare(secondEvent);
      result.current.cancel(event);
    });

    expect(result.current.jobs[getHarvestEventKey(event)]).toBeUndefined();
    expect(result.current.jobs[getHarvestEventKey(secondEvent)]).toBeDefined();
    act(() => result.current.cancel(secondEvent));
    act(() => {
      expect(result.current.prepare(event)).toBe(true);
    });
  });
});

describe('gatilho explícito no detalhe desktop', () => {
  it('bloqueia cliques repetidos, conclui uma vez e fecha somente após sucesso', async () => {
    let resolveCompletion: (() => void) | undefined;
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    const onComplete = vi.fn(() => completion);
    const onOpenChange = vi.fn();
    render(
      <EventDrawer
        event={event}
        open
        onOpenChange={onOpenChange}
        onSave={vi.fn()}
        onComplete={onComplete}
        canManage
      />,
    );

    const action = screen.getByRole('button', { name: 'Marcar concluído' });
    fireEvent.click(action);
    fireEvent.click(action);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(action).toBeDisabled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await act(async () => {
      resolveCompletion?.();
      await completion;
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('mantém o detalhe e exibe a falha quando o backend rejeita a conclusão', async () => {
    const onOpenChange = vi.fn();
    render(
      <EventDrawer
        event={event}
        open
        onOpenChange={onOpenChange}
        onSave={vi.fn()}
        onComplete={vi.fn().mockRejectedValue(new Error('Falha controlada na conclusão'))}
        canManage
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Marcar concluído' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha controlada na conclusão');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
