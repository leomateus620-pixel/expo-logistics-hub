import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FenasojaAlvoradaExperience from '@/features/alvorada/FenasojaAlvoradaExperience';

interface MockCanvasProps {
  initialElapsed: number;
  onContextLost: (elapsed: number) => void;
  onProgress: (elapsed: number) => void;
  onReady: () => void;
  onSequenceComplete: () => void;
  rendererTier: 'hardware' | 'compatible';
}

interface CanvasMount {
  id: number;
  props: MockCanvasProps;
}

const runtime = vi.hoisted(() => ({
  canvasMounts: [] as CanvasMount[],
  canvasUnmounts: [] as number[],
  nextCanvasId: 0,
  reducedMotion: false,
  renderError: false,
  rendererTier: 'hardware' as 'hardware' | 'compatible' | 'unavailable',
}));

vi.mock('@/features/alvorada/capabilities', () => ({
  getAlvoradaQualityProfile: (rendererTier: string) => ({
    antialias: rendererTier === 'hardware',
    buildingCount: 1,
    cloudCount: 1,
    dpr: [1, 1],
    mobile: false,
    shadowMapSize: 256,
    shadows: rendererTier === 'hardware',
    treeCount: 1,
  }),
  getAlvoradaWebGLTier: () => runtime.rendererTier,
}));

vi.mock('@/features/alvorada/AlvoradaCanvas', async () => {
  const React = await import('react');

  return {
    AlvoradaCanvas: (props: MockCanvasProps) => {
      const [id] = React.useState(() => {
        runtime.nextCanvasId += 1;
        return runtime.nextCanvasId;
      });
      const mountedProps = React.useRef(props);

      React.useEffect(() => {
        runtime.canvasMounts.push({ id, props: mountedProps.current });
        return () => {
          runtime.canvasUnmounts.push(id);
        };
      }, [id]);

      if (runtime.renderError) throw new Error('shader compilation failed');

      return (
        <div
          data-testid="mock-alvorada-canvas"
          data-canvas-id={id}
          data-initial-elapsed={props.initialElapsed}
          data-renderer-tier={props.rendererTier}
        />
      );
    },
  };
});

function currentCanvas() {
  const current = runtime.canvasMounts.at(-1);
  if (!current) throw new Error('Canvas Alvorada não montou no teste.');
  return current;
}

function advance(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden,
  });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
}

describe('recuperação WebGL da experiência Alvorada', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runtime.canvasMounts = [];
    runtime.canvasUnmounts = [];
    runtime.nextCanvasId = 0;
    runtime.reducedMotion = false;
    runtime.renderError = false;
    runtime.rendererTier = 'hardware';
    setDocumentHidden(false);

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion') && runtime.reducedMotion,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => (
      window.setTimeout(() => callback(performance.now()), 16)
    )));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((handle: number) => {
      window.clearTimeout(handle);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'hidden');
  });

  it('mantém WebGL montado com movimento reduzido e não encerra antes de dois segundos', () => {
    runtime.reducedMotion = true;
    const onComplete = vi.fn();

    render(<FenasojaAlvoradaExperience onComplete={onComplete} />);

    expect(screen.getByTestId('mock-alvorada-canvas')).toHaveAttribute(
      'data-renderer-tier',
      'hardware',
    );
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'loading',
    );

    act(() => currentCanvas().props.onReady());
    advance(2100);

    expect(screen.getByTestId('mock-alvorada-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'webgl',
    );
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('monta a experiência WebGL com o tier compatible reduzido', () => {
    runtime.rendererTier = 'compatible';

    render(<FenasojaAlvoradaExperience onComplete={vi.fn()} />);

    expect(screen.getByTestId('mock-alvorada-canvas')).toHaveAttribute(
      'data-renderer-tier',
      'compatible',
    );
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'loading',
    );
  });

  it('mantém o fallback indisponível por toda a sequência de 8,6 segundos', () => {
    runtime.rendererTier = 'unavailable';
    const onComplete = vi.fn();

    render(<FenasojaAlvoradaExperience onComplete={onComplete} />);

    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-fallback-reason',
      'unsupported-webgl',
    );

    advance(8599);
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'O Nascer da Alvorada' })).toBeInTheDocument();

    advance(1);
    expect(screen.getByTestId('alvorada-experience')).toHaveClass('alvorada-overlay--leaving');
    expect(onComplete).not.toHaveBeenCalled();

    advance(399);
    expect(onComplete).not.toHaveBeenCalled();
    advance(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('remove o loader imediatamente quando a renderização lança erro', () => {
    runtime.renderError = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(<FenasojaAlvoradaExperience onComplete={vi.fn()} />);

    expect(screen.getByTestId('alvorada-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'fallback',
    );
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-fallback-reason',
      'render-error',
    );
    expect(screen.queryByText('Preparando a Alvorada')).not.toBeInTheDocument();
  });

  it('remonta uma única vez após 500ms mais um frame e retoma o elapsed exato', () => {
    render(<FenasojaAlvoradaExperience onComplete={vi.fn()} />);
    const firstCanvas = currentCanvas();

    act(() => {
      firstCanvas.props.onReady();
      firstCanvas.props.onProgress(3.25);
      firstCanvas.props.onContextLost(3.25);
      firstCanvas.props.onContextLost(3.25);
    });

    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'recovering',
    );
    expect(screen.getByTestId('alvorada-fallback')).toHaveAccessibleName(
      'Recuperando a Alvorada de Santa Rosa',
    );
    expect(screen.getByTestId('alvorada-fallback').querySelector(
      '.alvorada-fallback__title',
    )).not.toBeInTheDocument();
    expect(runtime.canvasUnmounts).toEqual([firstCanvas.id]);

    advance(500);
    expect(runtime.canvasMounts).toHaveLength(1);
    advance(15);
    expect(runtime.canvasMounts).toHaveLength(1);
    advance(1);

    expect(runtime.canvasMounts).toHaveLength(2);
    const retryCanvas = currentCanvas();
    expect(retryCanvas.id).not.toBe(firstCanvas.id);
    expect(retryCanvas.props.initialElapsed).toBe(3.25);
    expect(screen.getByTestId('mock-alvorada-canvas')).toHaveAttribute(
      'data-initial-elapsed',
      '3.25',
    );
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'loading',
    );

    act(() => retryCanvas.props.onReady());
    advance(3000);
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'webgl',
    );
  });

  it('degrada no segundo context loss sem montar um terceiro Canvas', () => {
    render(<FenasojaAlvoradaExperience onComplete={vi.fn()} />);
    const firstCanvas = currentCanvas();

    act(() => firstCanvas.props.onContextLost(2.75));
    advance(516);
    const retryCanvas = currentCanvas();
    act(() => retryCanvas.props.onReady());
    act(() => retryCanvas.props.onContextLost(2.9));

    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'fallback',
    );
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-fallback-reason',
      'context-lost',
    );
    expect(screen.getByTestId('alvorada-fallback')).toBeInTheDocument();

    advance(4000);
    expect(runtime.canvasMounts).toHaveLength(2);
    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
  });

  it('encerra a única recuperação que não fica pronta e respeita o tempo restante', () => {
    const onComplete = vi.fn();
    render(<FenasojaAlvoradaExperience onComplete={onComplete} />);

    act(() => currentCanvas().props.onContextLost(6.9));
    advance(516);
    expect(runtime.canvasMounts).toHaveLength(2);
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'loading',
    );

    advance(2999);
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'loading',
    );
    advance(1);
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'fallback',
    );
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-fallback-reason',
      'context-lost',
    );

    advance(1699);
    expect(onComplete).not.toHaveBeenCalled();
    advance(1);
    expect(screen.getByTestId('alvorada-experience')).toHaveClass(
      'alvorada-overlay--leaving',
    );
    advance(400);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(runtime.canvasMounts).toHaveLength(2);
  });

  it('aplica o piso de um segundo no fallback de uma falha próxima ao fim', () => {
    const onComplete = vi.fn();
    render(<FenasojaAlvoradaExperience onComplete={onComplete} />);

    act(() => currentCanvas().props.onContextLost(8.2));
    advance(516);
    const retryCanvas = currentCanvas();
    act(() => retryCanvas.props.onReady());
    act(() => retryCanvas.props.onContextLost(8.4));
    act(() => retryCanvas.props.onContextLost(8.4));

    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'fallback',
    );
    advance(999);
    expect(onComplete).not.toHaveBeenCalled();
    advance(1);
    expect(screen.getByTestId('alvorada-experience')).toHaveClass(
      'alvorada-overlay--leaving',
    );
    advance(400);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('fecha por Escape durante recovering sem executar o retry pendente', () => {
    const onComplete = vi.fn();
    render(<FenasojaAlvoradaExperience onComplete={onComplete} />);

    act(() => currentCanvas().props.onContextLost(1.4));
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'recovering',
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    advance(400);
    expect(onComplete).toHaveBeenCalledTimes(1);
    advance(1000);
    expect(runtime.canvasMounts).toHaveLength(1);
  });

  it('pausa fallback e watchdog enquanto a aba está oculta', () => {
    runtime.rendererTier = 'unavailable';
    const fallbackComplete = vi.fn();
    const fallbackRender = render(
      <FenasojaAlvoradaExperience onComplete={fallbackComplete} />,
    );

    advance(4000);
    setDocumentHidden(true);
    advance(10_000);
    expect(fallbackComplete).not.toHaveBeenCalled();
    expect(screen.getByTestId('alvorada-experience')).not.toHaveClass(
      'alvorada-overlay--leaving',
    );

    setDocumentHidden(false);
    advance(4599);
    expect(fallbackComplete).not.toHaveBeenCalled();
    advance(1);
    expect(screen.getByTestId('alvorada-experience')).toHaveClass(
      'alvorada-overlay--leaving',
    );
    fallbackRender.unmount();

    runtime.rendererTier = 'hardware';
    render(<FenasojaAlvoradaExperience onComplete={vi.fn()} />);
    act(() => currentCanvas().props.onContextLost(2));
    advance(516);
    advance(1000);
    setDocumentHidden(true);
    advance(5000);
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'loading',
    );

    setDocumentHidden(false);
    advance(1999);
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'loading',
    );
    advance(1);
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'fallback',
    );
  });

  it('contém foco e Tab, fecha por Escape uma vez e limpa timers ao desmontar', () => {
    const onComplete = vi.fn();
    const { unmount } = render(<FenasojaAlvoradaExperience onComplete={onComplete} />);
    const close = screen.getByRole('button', { name: 'Fechar O Nascer da Alvorada' });

    advance(16);
    expect(close).toHaveFocus();

    close.blur();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(close);
    expect(screen.getByTestId('alvorada-experience')).toHaveClass('alvorada-overlay--leaving');
    advance(399);
    expect(onComplete).not.toHaveBeenCalled();
    advance(1);
    expect(onComplete).toHaveBeenCalledTimes(1);

    unmount();
    advance(10_000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('cancela fallback e exit pendentes quando desmonta antes da conclusão', () => {
    runtime.rendererTier = 'unavailable';
    const onComplete = vi.fn();
    const { unmount } = render(<FenasojaAlvoradaExperience onComplete={onComplete} />);

    unmount();
    advance(10_000);

    expect(onComplete).not.toHaveBeenCalled();
  });
});
