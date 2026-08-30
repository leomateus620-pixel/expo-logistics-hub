import { Suspense, useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MapPanelBoundary } from '@/features/commercial-map/components/panels/MapPanelBoundary';

describe('isolamento de carregamento e falha dos detalhes', () => {
  it('não desmonta o canvas durante suspensão, resolução ou falha do painel', async () => {
    const mounted = vi.fn();
    const unmounted = vi.fn();
    let ready = false;
    let resolve!: () => void;
    const pending = new Promise<void>((done) => { resolve = done; });
    function CanvasProbe() {
      useEffect(() => { mounted(); return unmounted; }, []);
      return <canvas data-testid="map" />;
    }
    function Details({ broken }: { broken: boolean }) {
      if (!ready) throw pending;
      if (broken) throw new Error('detail asset unavailable');
      return <p>Detalhes carregados</p>;
    }
    const view = (broken = false, id = 'one') => (
      <>
        <CanvasProbe />
        <MapPanelBoundary resetKey={id}>
          <Suspense fallback={<p>Carregando detalhes</p>}><Details broken={broken} /></Suspense>
        </MapPanelBoundary>
      </>
    );
    const rendered = render(view());
    const canvas = screen.getByTestId('map');
    expect(screen.getByText('Carregando detalhes')).toBeInTheDocument();
    await act(async () => { ready = true; resolve(); await pending; });
    expect(screen.getByText('Detalhes carregados')).toBeInTheDocument();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      rendered.rerender(view(true));
      expect(screen.getByText('Detalhes indisponíveis')).toBeInTheDocument();
      expect(screen.getByTestId('map')).toBe(canvas);
      rendered.rerender(view(false, 'two'));
      expect(screen.getByText('Detalhes carregados')).toBeInTheDocument();
      expect(mounted).toHaveBeenCalledTimes(1);
      expect(unmounted).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      rendered.unmount();
    }
    expect(unmounted).toHaveBeenCalledTimes(1);
  });
});
