import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FenasojaAlvoradaExperience from '@/features/alvorada/FenasojaAlvoradaExperience';
import {
  ALVORADA_PHASES,
  ALVORADA_SEQUENCE_DURATION,
} from '@/features/alvorada/timeline';
import type { OrganizationalGraph } from '@/features/alvorada/organizational';

interface MockCanvasProps {
  initialElapsed: number;
  onContextLost: (elapsed: number) => void;
  onProgress: (elapsed: number) => void;
  onQualityDecline: () => void;
  onReady: () => void;
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
  orgError: null as Error | null,
  orgGraph: {
    people: {},
    nodes: [],
    edges: [],
    anomalies: [],
    rootNodeId: 'org:ccp',
    renderableNodeIds: [],
  } as OrganizationalGraph,
  orgLoading: false,
  reducedMotion: false,
  renderError: false,
  rendererTier: 'hardware' as 'hardware' | 'compatible' | 'unavailable',
}));

vi.mock('@/features/alvorada/organizational', () => ({
  useOrganizationalEcosystemData: () => ({
    graph: runtime.orgGraph,
    isLoading: runtime.orgLoading,
    error: runtime.orgError,
    refetch: vi.fn(),
  }),
}));

function emptyOrgGraph(): OrganizationalGraph {
  return {
    people: {},
    nodes: [],
    edges: [],
    anomalies: [],
    rootNodeId: 'org:ccp',
    renderableNodeIds: [],
  };
}

function interactiveOrgGraph(): OrganizationalGraph {
  return {
    people: {
      'person:fabiano': {
        id: 'person:fabiano',
        userId: 'fabiano-user',
        fullName: 'Fabiano Soltis',
        avatarUrl: null,
        roles: ['Presidente'],
        highestAuthorityLevel: 2,
        sourceIds: ['fabiano-user'],
      },
    },
    nodes: [
      {
        id: 'org:ccp',
        type: 'ccp',
        authorityLevel: 1,
        title: 'FENASOJA 2028',
        subtitle: 'CCP',
        personIds: [],
        parentIds: [],
        childIds: ['executive:fabiano'],
        commissionId: null,
        advisoryId: null,
        sortOrder: 0,
        isRenderable: true,
        responsibilities: [],
        metadata: {},
      },
      {
        id: 'executive:fabiano',
        type: 'executive',
        authorityLevel: 2,
        title: 'Fabiano Soltis',
        subtitle: 'Presidente',
        personIds: ['person:fabiano'],
        parentIds: ['org:ccp'],
        childIds: [],
        commissionId: 'central-id',
        advisoryId: null,
        sortOrder: 0,
        isRenderable: true,
        responsibilities: [],
        metadata: {},
      },
    ],
    edges: [{
      id: 'edge:ccp-fabiano',
      sourceId: 'org:ccp',
      targetId: 'executive:fabiano',
      authorityLevel: 2,
    }],
    anomalies: [],
    rootNodeId: 'org:ccp',
    renderableNodeIds: ['org:ccp', 'executive:fabiano'],
  };
}

vi.mock('@/features/alvorada/capabilities', () => ({
  degradeAlvoradaQualityProfile: (profile: unknown) => profile,
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
    runtime.orgError = null;
    runtime.orgGraph = emptyOrgGraph();
    runtime.orgLoading = false;
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
    vi.stubGlobal('ResizeObserver', class ResizeObserverMock {
      disconnect() {}

      observe() {}

      unobserve() {}
    });
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'hidden');
  });

  it('mantém WebGL montado com movimento reduzido e não encurta a jornada', () => {
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

    act(() => currentCanvas().props.onProgress(ALVORADA_SEQUENCE_DURATION));
    advance(60_000);
    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
    expect(screen.getByTestId('alvorada-experience').querySelector(
      '.alvorada-overlay__canvas',
    )).toHaveAttribute('data-renderer', 'released');
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

  it('mantém o fallback indisponível aberto indefinidamente até o X', () => {
    runtime.rendererTier = 'unavailable';
    const onComplete = vi.fn();

    render(<FenasojaAlvoradaExperience onComplete={onComplete} />);

    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-fallback-reason',
      'unsupported-webgl',
    );
    expect(screen.getByTestId('alvorada-fallback').querySelector('img')).toBeNull();

    advance(120_000);
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'O Nascer da Alvorada' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar O Nascer da Alvorada' }));
    advance(399);
    expect(onComplete).not.toHaveBeenCalled();
    advance(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('avança o fallback pela mesma timeline e pausa enquanto a aba está oculta', () => {
    runtime.rendererTier = 'unavailable';
    render(<FenasojaAlvoradaExperience onComplete={vi.fn()} />);
    const experience = screen.getByTestId('alvorada-experience');

    expect(experience).toHaveAttribute('data-stage', 'dawn');
    advance(1599);
    setDocumentHidden(true);
    advance(20_000);
    expect(experience).toHaveAttribute('data-stage', 'dawn');

    setDocumentHidden(false);
    advance(1);
    expect(experience).toHaveAttribute('data-stage', 'territory');
    advance(2800);
    expect(experience).toHaveAttribute('data-stage', 'santa-rosa');
    advance(1400);
    expect(experience).toHaveAttribute('data-stage', 'brand-reveal');
    advance(1600);
    expect(experience).toHaveAttribute('data-stage', 'brand-hold');
    expect(screen.getByRole('img', { name: /Fenasoja 2028, Edição 2028/ })).toBeVisible();
    advance(2000);
    expect(experience).toHaveAttribute('data-stage', 'org-transition');
    advance(2000);
    expect(experience).toHaveAttribute('data-stage', 'org-ready');
    expect(experience.querySelector('.alvorada-overlay__canvas')).toHaveAttribute(
      'data-renderer',
      'released',
    );
  });

  it('transiciona a marca para o grafo quando os dados chegam após liberar o Canvas', () => {
    runtime.orgLoading = true;
    const onComplete = vi.fn();
    const view = render(<FenasojaAlvoradaExperience onComplete={onComplete} />);
    const canvas = currentCanvas();
    const orgTransitionDurationMs =
      (ALVORADA_PHASES['org-transition'].end - ALVORADA_PHASES['org-transition'].start) * 1000;

    act(() => {
      canvas.props.onReady();
      canvas.props.onProgress(ALVORADA_SEQUENCE_DURATION);
    });

    const experience = screen.getByTestId('alvorada-experience');
    expect(experience).toHaveAttribute('data-stage', 'brand-hold');
    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
    expect(experience.querySelector('.alvorada-overlay__canvas')).toHaveAttribute(
      'data-renderer',
      'released',
    );
    expect(runtime.canvasMounts).toHaveLength(1);
    expect(runtime.canvasUnmounts).toEqual([canvas.id]);
    expect(screen.getByText('Sincronizando a estrutura organizacional registrada')).toBeVisible();
    expect(screen.getByRole('img', { name: /Fenasoja 2028, Edição 2028/ })).toBeVisible();

    runtime.orgLoading = false;
    view.rerender(<FenasojaAlvoradaExperience onComplete={onComplete} />);
    expect(experience).toHaveAttribute('data-stage', 'org-transition');
    expect(experience.querySelector('.org-ecosystem')).toHaveAttribute('data-active', 'true');
    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
    expect(runtime.canvasMounts).toHaveLength(1);
    expect(runtime.canvasUnmounts).toEqual([canvas.id]);

    advance(orgTransitionDurationMs - 1);
    expect(experience).toHaveAttribute('data-stage', 'org-transition');
    advance(1);
    expect(experience).toHaveAttribute('data-stage', 'org-ready');
    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
    expect(runtime.canvasMounts).toHaveLength(1);
    expect(runtime.canvasUnmounts).toEqual([canvas.id]);
    expect(screen.getByRole('status')).toHaveTextContent('Estrutura em preparação');
  });

  it('remove o loader no render-error e não fecha o fallback automaticamente', () => {
    runtime.renderError = true;
    const onComplete = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(<FenasojaAlvoradaExperience onComplete={onComplete} />);

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

    advance(120_000);
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'O Nascer da Alvorada' })).toBeInTheDocument();
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

  it('degrada no segundo context loss sem montar terceiro Canvas nem auto-fechar', () => {
    const onComplete = vi.fn();
    render(<FenasojaAlvoradaExperience onComplete={onComplete} />);
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

    advance(120_000);
    expect(runtime.canvasMounts).toHaveLength(2);
    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('degrada a recuperação sem ready após o watchdog e permanece aberta', () => {
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

    advance(120_000);
    expect(onComplete).not.toHaveBeenCalled();
    expect(runtime.canvasMounts).toHaveLength(2);
    expect(screen.getByRole('dialog', { name: 'O Nascer da Alvorada' })).toBeInTheDocument();
  });

  it('libera o WebGL no quadro organizacional e permanece aberto até fechamento explícito', () => {
    const onComplete = vi.fn();
    render(<FenasojaAlvoradaExperience onComplete={onComplete} />);
    const canvas = currentCanvas();

    act(() => {
      canvas.props.onReady();
      canvas.props.onProgress(ALVORADA_SEQUENCE_DURATION);
    });
    advance(120_000);

    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'webgl',
    );
    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
    expect(screen.getByTestId('alvorada-experience').querySelector(
      '.alvorada-overlay__canvas',
    )).toHaveAttribute('data-renderer', 'released');
    expect(screen.getByRole('status')).toHaveTextContent('Estrutura em preparação');
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    advance(400);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('ignora context loss terminal, libera o Canvas uma vez e permanece aberto', () => {
    const onComplete = vi.fn();
    render(<FenasojaAlvoradaExperience onComplete={onComplete} />);
    const firstCanvas = currentCanvas();

    act(() => {
      firstCanvas.props.onReady();
      firstCanvas.props.onProgress(ALVORADA_SEQUENCE_DURATION);
      firstCanvas.props.onContextLost(ALVORADA_SEQUENCE_DURATION);
    });
    advance(120_000);

    expect(screen.getByTestId('alvorada-experience')).toHaveAttribute(
      'data-renderer-state',
      'webgl',
    );
    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
    expect(runtime.canvasMounts).toHaveLength(1);
    expect(runtime.canvasUnmounts).toEqual([firstCanvas.id]);
    expect(onComplete).not.toHaveBeenCalled();
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

  it('pausa o watchdog de recuperação enquanto a aba está oculta', () => {
    const onComplete = vi.fn();
    render(<FenasojaAlvoradaExperience onComplete={onComplete} />);
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
    advance(120_000);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('só fecha por X ou Escape, contém foco e ignora interações no fundo', () => {
    const onComplete = vi.fn();
    const { unmount } = render(<FenasojaAlvoradaExperience onComplete={onComplete} />);
    const dialog = screen.getByRole('dialog', { name: 'O Nascer da Alvorada' });
    const close = screen.getByRole('button', { name: 'Fechar O Nascer da Alvorada' });

    expect(screen.getAllByRole('button')).toHaveLength(1);
    advance(16);
    expect(close).toHaveFocus();

    fireEvent.click(dialog);
    advance(10_000);
    expect(onComplete).not.toHaveBeenCalled();

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

  it('inclui controles do grafo no ciclo de foco e prioriza Escape contextual', () => {
    runtime.orgGraph = interactiveOrgGraph();
    const onComplete = vi.fn();
    render(<FenasojaAlvoradaExperience onComplete={onComplete} />);
    const canvas = currentCanvas();

    act(() => {
      canvas.props.onReady();
      canvas.props.onProgress(ALVORADA_SEQUENCE_DURATION);
    });
    advance(16);

    const close = screen.getByRole('button', { name: 'Fechar O Nascer da Alvorada' });
    const search = screen.getByRole('combobox', { name: 'Buscar pessoa, comissão ou assessoria' });
    act(() => close.focus());
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();

    const rootNode = screen.getByRole('button', { name: /Autoridade 01.*CCP/i });
    act(() => rootNode.focus());
    fireEvent.click(rootNode);
    expect(screen.getByRole('complementary', { name: /Detalhes de FENASOJA 2028/i })).toBeVisible();
    fireEvent.keyDown(rootNode, { key: 'Escape' });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'O Nascer da Alvorada' })).toBeInTheDocument();

    act(() => search.focus());
    fireEvent.change(search, { target: { value: 'Fabiano' } });
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.keyDown(search, { key: 'Escape' });
    advance(400);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('cancela recuperação e saída pendentes ao desmontar', () => {
    const recoveryComplete = vi.fn();
    const recoveryRender = render(
      <FenasojaAlvoradaExperience onComplete={recoveryComplete} />,
    );
    act(() => currentCanvas().props.onContextLost(4.75));
    recoveryRender.unmount();
    advance(10_000);
    expect(runtime.canvasMounts).toHaveLength(1);
    expect(recoveryComplete).not.toHaveBeenCalled();

    runtime.rendererTier = 'unavailable';
    const exitComplete = vi.fn();
    const exitRender = render(
      <FenasojaAlvoradaExperience onComplete={exitComplete} />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    exitRender.unmount();
    advance(10_000);
    expect(exitComplete).not.toHaveBeenCalled();
  });
});
