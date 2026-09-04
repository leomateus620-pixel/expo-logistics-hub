import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommercialMapRendererStatus } from '@/features/commercial-map/components/CommercialMapRendererStatus';
import {
  COMMERCIAL_MAP_RENDER_HEALTH_EVENT,
  COMMERCIAL_MAP_RENDER_RETRY_EVENT,
  publishCommercialMapRenderHealth,
  readCommercialMapRenderHealth,
  type CommercialMapRenderHealth,
} from '@/features/commercial-map/utils/renderingHealth';

function createCanvas() {
  const canvas = document.createElement('canvas');
  canvas.className = 'commercial-map-canvas';
  document.body.append(canvas);
  return canvas;
}

function health(overrides: Partial<CommercialMapRenderHealth> = {}): CommercialMapRenderHealth {
  return {
    status: 'ready', path: 'post', presentedFrames: 1, contextLosses: 0, lastErrorCode: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  document.querySelectorAll('canvas').forEach((canvas) => canvas.remove());
  vi.restoreAllMocks();
});

describe('Commercial Map lightweight rendering health', () => {
  it('publishes a JSON snapshot and bubbles transitions from the originating canvas', () => {
    const canvas = createCanvas();
    const listener = vi.fn();
    window.addEventListener(COMMERCIAL_MAP_RENDER_HEALTH_EVENT, listener, { once: true });
    const snapshot = health();
    publishCommercialMapRenderHealth(canvas, snapshot);
    expect(readCommercialMapRenderHealth(canvas)).toEqual(snapshot);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].target).toBe(canvas);
    expect(listener.mock.calls[0][0].detail).toEqual(snapshot);
  });

  it('throttles only stable frame counters and immediately publishes failures and recovery', () => {
    const canvas = createCanvas();
    const listener = vi.fn();
    canvas.addEventListener(COMMERCIAL_MAP_RENDER_HEALTH_EVENT, listener);
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    publishCommercialMapRenderHealth(canvas, health());
    now.mockReturnValue(500);
    publishCommercialMapRenderHealth(canvas, health({ presentedFrames: 20 }));
    expect(listener).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1000);
    publishCommercialMapRenderHealth(canvas, health({ presentedFrames: 40 }));
    expect(listener).toHaveBeenCalledTimes(2);
    publishCommercialMapRenderHealth(canvas, health({ status: 'failed', path: 'suspended' }));
    publishCommercialMapRenderHealth(canvas, health({ status: 'recovering', path: 'suspended' }));
    publishCommercialMapRenderHealth(canvas, health());
    expect(listener).toHaveBeenCalledTimes(5);
    publishCommercialMapRenderHealth(canvas, health());
    expect(listener).toHaveBeenCalledTimes(5);
  });

  it('rejects malformed or incomplete stored health snapshots', () => {
    const canvas = createCanvas();
    expect(readCommercialMapRenderHealth(null)).toBeNull();
    for (const value of ['broken', '{}', 'null', JSON.stringify(health({ presentedFrames: -1 }))]) {
      canvas.dataset.commercialMapRenderHealth = value;
      expect(readCommercialMapRenderHealth(canvas)).toBeNull();
    }
  });
});

describe('Commercial Map renderer recovery notice', () => {
  it('stays hidden when ready and when no renderer has published a state', () => {
    const canvas = createCanvas();
    render(<CommercialMapRendererStatus />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => publishCommercialMapRenderHealth(canvas, health()));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('reads failures published before mount and retries only the current canvas without reload', () => {
    const canvas = createCanvas();
    publishCommercialMapRenderHealth(canvas, health({ status: 'failed', path: 'suspended' }));
    const retry = vi.fn();
    canvas.addEventListener(COMMERCIAL_MAP_RENDER_RETRY_EVENT, retry);
    render(<CommercialMapRendererStatus />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar mapa' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(retry.mock.calls[0][0].target).toBe(canvas);
    act(() => publishCommercialMapRenderHealth(canvas, health({ status: 'recovering', path: 'suspended' })));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Recuperando a imagem do mapa');
    act(() => publishCommercialMapRenderHealth(canvas, health()));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.querySelector('canvas')).toBe(canvas);
  });

  it('shows passive fallback/context messages without offering concurrent recovery', () => {
    const canvas = createCanvas();
    render(<CommercialMapRendererStatus />);
    act(() => publishCommercialMapRenderHealth(canvas, health({ status: 'degraded', path: 'direct' })));
    expect(screen.getByRole('status')).toHaveTextContent('A navegação continua disponível');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    act(() => publishCommercialMapRenderHealth(canvas, health({ status: 'context-lost', path: 'suspended', contextLosses: 1 })));
    expect(screen.getByRole('status')).toHaveTextContent('Aguardando restauração');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('ignores another WebGL canvas and detaches its listener on unmount', () => {
    createCanvas();
    const otherCanvas = document.createElement('canvas');
    document.body.append(otherCanvas);
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(<CommercialMapRendererStatus />);
    act(() => publishCommercialMapRenderHealth(otherCanvas, health({ status: 'failed', path: 'suspended' })));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    view.unmount();
    expect(remove).toHaveBeenCalledWith(COMMERCIAL_MAP_RENDER_HEALTH_EVENT, expect.any(Function));
  });
});
