import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlvoradaIntro } from '@/features/alvorada/AlvoradaIntro';
import {
  ALVORADA_INTRO_BRAND_HOLD_MS,
  ALVORADA_INTRO_MAX_DURATION_MS,
  ALVORADA_INTRO_PREPARE_TIMEOUT_MS,
  ALVORADA_PHASES,
} from '@/features/alvorada/timeline';

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
  renderError: false,
  rendererTier: 'hardware' as 'hardware' | 'compatible' | 'unavailable',
  warmCalls: 0,
}));

vi.mock('@/features/alvorada/capabilities', () => ({
  degradeAlvoradaQualityProfile: (profile: unknown) => profile,
  getAlvoradaQualityProfile: (rendererTier: string) => ({
    antialias: rendererTier === 'hardware',
    buildingCount: 1,
    cloudCount: 1,
    dpr: [1, 1],
    level: 'high',
    mobile: false,
    postprocessing: false,
    bloom: false,
    shadowMapSize: 256,
    shadows: rendererTier === 'hardware',
    terrainSegments: 8,
    treeCount: 1,
  }),
  getAlvoradaWebGLTier: () => runtime.rendererTier,
  warmAlvoradaAssets: () => {
    runtime.warmCalls += 1;
  },
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
      mountedProps.current = props;

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

function coverHarvest() {
  const harvest = document.querySelector<HTMLImageElement>('.alvorada-harvest img');
  if (!harvest) throw new Error('A colheita não está montada.');
  const backdrop = harvest.closest<HTMLElement>('.alvorada-harvest')!;
  backdrop.setAttribute('data-decoded', 'true');
  backdrop.style.opacity = '1';
  return { backdrop, harvest };
}

async function decodeAndCoverHarvest() {
  const harvest = document.querySelector<HTMLImageElement>('.alvorada-harvest img')!;
  Object.defineProperty(harvest, 'decode', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  await act(async () => fireEvent.load(harvest));
  const { backdrop } = coverHarvest();
  const fadeEnd = new Event('transitionend', { bubbles: true });
  Object.defineProperty(fadeEnd, 'propertyName', { value: 'opacity' });
  act(() => {
    fireEvent(backdrop, fadeEnd);
  });
}

describe('ciclo de vida da introdução Alvorada embutida', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runtime.canvasMounts = [];
    runtime.canvasUnmounts = [];
    runtime.nextCanvasId = 0;
    runtime.renderError = false;
    runtime.rendererTier = 'hardware';
    runtime.warmCalls = 0;
    setDocumentHidden(false);

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

  it('avança preparando → globo → aproximação → alvorada pelos eventos do renderizador', () => {
    const onFinished = vi.fn();
    const stages: string[] = [];

    render(<AlvoradaIntro onFinished={onFinished} onStageChange={(stage) => stages.push(stage)} />);
    const intro = screen.getByTestId('alvorada-intro');

    expect(intro).toHaveAttribute('data-stage', 'preparing');
    expect(intro).toHaveAttribute('data-renderer', 'webgl');
    expect(screen.getByTestId('mock-alvorada-canvas')).toHaveAttribute('data-renderer-tier', 'hardware');
    expect(runtime.warmCalls).toBe(1);
    expect(document.querySelector('.alvorada-brand-hero--visible')).toBeNull();
    expect(document.querySelector('.alvorada-harvest')).toBeNull();

    act(() => currentCanvas().props.onReady());
    expect(intro).toHaveAttribute('data-stage', 'globe');

    act(() => currentCanvas().props.onProgress(ALVORADA_PHASES.territory.start));
    expect(intro).toHaveAttribute('data-stage', 'approach');
    act(() => currentCanvas().props.onProgress(ALVORADA_PHASES['santa-rosa'].start));
    expect(intro).toHaveAttribute('data-stage', 'approach');
    expect(document.querySelector('.alvorada-harvest')).toHaveAttribute('data-stage', 'santa-rosa');
    expect(onFinished).not.toHaveBeenCalled();

    act(() => currentCanvas().props.onProgress(ALVORADA_PHASES['brand-reveal'].start));
    expect(intro).toHaveAttribute('data-stage', 'alvorada');
    expect(screen.getByRole('img', { name: /^Fenasoja 2028$/, hidden: true })).toBeVisible();
    expect(screen.getAllByText('2028')).toHaveLength(1);

    advance(ALVORADA_INTRO_BRAND_HOLD_MS - 1);
    expect(onFinished).not.toHaveBeenCalled();
    advance(1);
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(intro).toHaveAttribute('data-stage', 'finished');
    expect(stages).toEqual(['globe', 'approach', 'alvorada', 'finished']);

    // Late progress or timers never re-open a finished intro.
    act(() => currentCanvas().props.onProgress(ALVORADA_PHASES['org-ready'].start));
    advance(60_000);
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(intro).toHaveAttribute('data-stage', 'finished');
  });

  it('nunca entra nas fases organizacionais: a colheita e a marca permanecem no quadro', () => {
    render(<AlvoradaIntro onFinished={vi.fn()} />);
    act(() => currentCanvas().props.onReady());
    act(() => currentCanvas().props.onProgress(ALVORADA_PHASES['org-transition'].start + 0.5));

    expect(document.querySelector('.alvorada-harvest')).toHaveAttribute('data-stage', 'brand-hold');
    expect(document.querySelector('.alvorada-brand-hero')).toHaveAttribute('data-stage', 'brand-hold');
    expect(document.querySelector('.alvorada-brand-hero--handoff')).toBeNull();
  });

  it('libera o WebGL quando a colheita cobre o quadro durante a alvorada', async () => {
    const onFinished = vi.fn();
    render(<AlvoradaIntro onFinished={onFinished} />);
    const canvas = currentCanvas();
    act(() => canvas.props.onReady());
    act(() => canvas.props.onProgress(ALVORADA_PHASES['brand-reveal'].start));
    const intro = screen.getByTestId('alvorada-intro');
    expect(screen.getByTestId('mock-alvorada-canvas')).toBeInTheDocument();

    await decodeAndCoverHarvest();

    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
    expect(runtime.canvasUnmounts).toEqual([canvas.id]);
    expect(intro).toHaveAttribute('data-renderer', 'released');
    expect(screen.getByRole('img', { name: /^Fenasoja 2028$/, hidden: true })).toBeVisible();

    advance(ALVORADA_INTRO_BRAND_HOLD_MS);
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(runtime.canvasMounts).toHaveLength(1);
  });

  it('pausa a permanência da alvorada com a aba oculta e retoma sem saltos', () => {
    const onFinished = vi.fn();
    render(<AlvoradaIntro onFinished={onFinished} />);
    act(() => currentCanvas().props.onReady());
    act(() => currentCanvas().props.onProgress(ALVORADA_PHASES['brand-reveal'].start));

    advance(ALVORADA_INTRO_BRAND_HOLD_MS - 500);
    setDocumentHidden(true);
    advance(60_000);
    expect(onFinished).not.toHaveBeenCalled();

    setDocumentHidden(false);
    advance(499);
    expect(onFinished).not.toHaveBeenCalled();
    advance(1);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('apresenta a alvorada estática sem WebGL quando o movimento é reduzido', () => {
    const onFinished = vi.fn();
    render(<AlvoradaIntro motion="static" onFinished={onFinished} />);
    const intro = screen.getByTestId('alvorada-intro');

    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
    expect(runtime.canvasMounts).toHaveLength(0);
    expect(intro).toHaveAttribute('data-stage', 'alvorada');
    expect(intro).toHaveAttribute('data-renderer', 'static');
    expect(intro).toHaveAttribute('data-static-reason', 'reduced-motion');
    expect(document.querySelector('.alvorada-harvest')).toHaveAttribute('data-stage', 'brand-reveal');
    expect(screen.getByRole('img', { name: /^Fenasoja 2028$/, hidden: true })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Alvorada de Santa Rosa', hidden: true })).toBeInTheDocument();
    expect(runtime.warmCalls).toBe(0);

    advance(ALVORADA_INTRO_BRAND_HOLD_MS);
    expect(onFinished).not.toHaveBeenCalled();
    advance(700);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('cai para a alvorada estática quando o WebGL está indisponível', () => {
    runtime.rendererTier = 'unavailable';
    const onFinished = vi.fn();
    render(<AlvoradaIntro onFinished={onFinished} />);
    const intro = screen.getByTestId('alvorada-intro');

    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
    expect(intro).toHaveAttribute('data-static-reason', 'unsupported-webgl');
    expect(intro).toHaveAttribute('data-stage', 'alvorada');
    advance(ALVORADA_INTRO_BRAND_HOLD_MS + 700);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('monta o WebGL no tier compatible com a mesma sequência', () => {
    runtime.rendererTier = 'compatible';
    render(<AlvoradaIntro onFinished={vi.fn()} />);
    expect(screen.getByTestId('mock-alvorada-canvas')).toHaveAttribute('data-renderer-tier', 'compatible');
    expect(screen.getByTestId('alvorada-intro')).toHaveAttribute('data-stage', 'preparing');
  });

  it('converte um erro de renderização em alvorada estática e conclui normalmente', () => {
    runtime.renderError = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onFinished = vi.fn();

    render(<AlvoradaIntro onFinished={onFinished} />);
    const intro = screen.getByTestId('alvorada-intro');

    expect(intro).toHaveAttribute('data-renderer', 'static');
    expect(intro).toHaveAttribute('data-static-reason', 'render-error');
    expect(intro).toHaveAttribute('data-stage', 'alvorada');
    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Fenasoja 2028$/, hidden: true })).toBeVisible();

    advance(ALVORADA_INTRO_BRAND_HOLD_MS + 700);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('trata a perda do contexto WebGL como alvorada estática, sem remontar o Canvas', () => {
    const onFinished = vi.fn();
    render(<AlvoradaIntro onFinished={onFinished} />);
    const canvas = currentCanvas();
    act(() => canvas.props.onReady());
    act(() => canvas.props.onProgress(ALVORADA_PHASES.territory.start + 1));
    const intro = screen.getByTestId('alvorada-intro');
    expect(intro).toHaveAttribute('data-stage', 'approach');

    act(() => canvas.props.onContextLost(ALVORADA_PHASES.territory.start + 1));

    expect(intro).toHaveAttribute('data-renderer', 'static');
    expect(intro).toHaveAttribute('data-static-reason', 'context-lost');
    expect(intro).toHaveAttribute('data-stage', 'alvorada');
    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
    expect(runtime.canvasMounts).toHaveLength(1);

    // Renderer callbacks from the released canvas are ignored afterwards.
    act(() => canvas.props.onProgress(0.2));
    expect(intro).toHaveAttribute('data-stage', 'alvorada');

    advance(ALVORADA_INTRO_BRAND_HOLD_MS + 700);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('aplica o tempo máximo de preparação quando o primeiro quadro nunca chega', () => {
    const onFinished = vi.fn();
    render(<AlvoradaIntro onFinished={onFinished} />);
    const intro = screen.getByTestId('alvorada-intro');

    advance(ALVORADA_INTRO_PREPARE_TIMEOUT_MS - 1);
    expect(intro).toHaveAttribute('data-stage', 'preparing');
    advance(1);
    expect(intro).toHaveAttribute('data-stage', 'alvorada');
    expect(intro).toHaveAttribute('data-renderer', 'static');
    expect(intro).toHaveAttribute('data-static-reason', 'prepare-timeout');
    expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();

    // A late ready from a disposed renderer is ignored.
    act(() => currentCanvas().props.onReady());
    expect(intro).toHaveAttribute('data-stage', 'alvorada');

    advance(ALVORADA_INTRO_BRAND_HOLD_MS + 700);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('garante a contagem pelo tempo máximo total mesmo com o relógio da cena travado', () => {
    const onFinished = vi.fn();
    render(<AlvoradaIntro onFinished={onFinished} />);
    act(() => currentCanvas().props.onReady());
    act(() => currentCanvas().props.onProgress(ALVORADA_PHASES.territory.start + 0.5));

    advance(ALVORADA_INTRO_MAX_DURATION_MS - 1);
    expect(onFinished).not.toHaveBeenCalled();
    advance(1);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('respeita uma permanência configurável da alvorada', () => {
    const onFinished = vi.fn();
    render(<AlvoradaIntro brandHoldMs={1200} onFinished={onFinished} />);
    act(() => currentCanvas().props.onReady());
    act(() => currentCanvas().props.onProgress(ALVORADA_PHASES['brand-reveal'].start));

    advance(1199);
    expect(onFinished).not.toHaveBeenCalled();
    advance(1);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('não captura gestos: a camada é decorativa e não recebe ponteiro', () => {
    render(<AlvoradaIntro onFinished={vi.fn()} />);
    const intro = screen.getByTestId('alvorada-intro');
    expect(intro).toHaveAttribute('aria-hidden', 'true');
    expect(intro.querySelector('button')).toBeNull();
  });
});
