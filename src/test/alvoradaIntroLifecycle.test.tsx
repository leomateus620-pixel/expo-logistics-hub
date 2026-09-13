import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlvoradaIntro } from '@/features/alvorada/AlvoradaIntro';
import {
  ALVORADA_FALLBACK_NARRATIVE,
  ALVORADA_INTRO_BRAND_HOLD_MS,
  ALVORADA_INTRO_MAX_DURATION_MS,
  ALVORADA_INTRO_PREPARE_CEILING_MS,
  ALVORADA_INTRO_PREPARE_STALL_MS,
  ALVORADA_INTRO_STAGE_ORDER,
  ALVORADA_PHASES,
  type AlvoradaIntroStage,
} from '@/features/alvorada/timeline';
import type { AlvoradaPreparationEvent } from '@/features/alvorada/types';

interface MockCanvasProps {
  initialElapsed: number;
  onContextLost: (elapsed: number) => void;
  onPreparation?: (event: AlvoradaPreparationEvent) => void;
  onProgress: (elapsed: number) => void;
  onQualityDecline: () => void;
  onReady: () => void;
  quality: { level: string; mobile: boolean };
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
  resizeObservers: [] as Array<(entries: unknown[]) => void>,
  warmCalls: 0,
}));

vi.mock('@/features/alvorada/capabilities', () => ({
  degradeAlvoradaQualityProfile: (profile: { level: string }) => ({
    ...profile,
    level: profile.level === 'high' ? 'medium' : 'low',
  }),
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
    textureTier: 'desktop',
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
          data-quality={props.quality.level}
          data-mobile={props.quality.mobile}
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

function report(event: AlvoradaPreparationEvent) {
  act(() => currentCanvas().props.onPreparation?.(event));
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

function telemetryEvents() {
  return (window.__alvoradaIntroTelemetry?.events ?? []).map((event) => event.name);
}

/**
 * The invariant every scenario must satisfy: stages only move forward, one
 * at a time; `finished` is the only stage reachable from anywhere.
 */
function expectSequentialStages(stages: AlvoradaIntroStage[]) {
  const order: AlvoradaIntroStage[] = ['preparing', ...stages];
  for (let index = 1; index < order.length; index += 1) {
    const previous = ALVORADA_INTRO_STAGE_ORDER.indexOf(order[index - 1]);
    const next = ALVORADA_INTRO_STAGE_ORDER.indexOf(order[index]);
    if (order[index] === 'finished') {
      expect(next).toBeGreaterThan(previous);
      continue;
    }
    expect(next).toBe(previous + 1);
  }
}

const NARRATIVE_TO_ALVORADA_MS = ALVORADA_FALLBACK_NARRATIVE.globeMs
  + ALVORADA_FALLBACK_NARRATIVE.approachMs
  + ALVORADA_FALLBACK_NARRATIVE.santaRosaMs;

describe('ciclo de vida da introdução Alvorada embutida', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runtime.canvasMounts = [];
    runtime.canvasUnmounts = [];
    runtime.nextCanvasId = 0;
    runtime.renderError = false;
    runtime.rendererTier = 'hardware';
    runtime.resizeObservers = [];
    runtime.warmCalls = 0;
    delete window.__alvoradaIntroTelemetry;
    setDocumentHidden(false);
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => (
      window.setTimeout(() => callback(performance.now()), 16)
    )));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((handle: number) => {
      window.clearTimeout(handle);
    }));
    vi.stubGlobal('ResizeObserver', class ResizeObserverMock {
      constructor(callback: (entries: unknown[]) => void) {
        runtime.resizeObservers.push(callback);
      }

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
    const stages: AlvoradaIntroStage[] = [];

    render(<AlvoradaIntro onFinished={onFinished} onStageChange={(stage) => stages.push(stage)} />);
    const intro = screen.getByTestId('alvorada-intro');

    expect(intro).toHaveAttribute('data-stage', 'preparing');
    expect(intro).toHaveAttribute('data-renderer', 'webgl');
    expect(intro).toHaveAttribute('data-motion', 'cinematic');
    expect(screen.getByTestId('mock-alvorada-canvas')).toHaveAttribute('data-renderer-tier', 'hardware');
    expect(screen.getByTestId('mock-alvorada-canvas')).toHaveAttribute('data-initial-elapsed', '0');
    expect(screen.getByTestId('alvorada-preparing')).toHaveAttribute('data-active', 'true');
    expect(runtime.warmCalls).toBe(1);
    expect(document.querySelector('.alvorada-brand-hero--visible')).toBeNull();
    expect(document.querySelector('.alvorada-harvest')).toBeNull();

    report({ kind: 'context-created', detail: { webglVersion: 'webgl2' } });
    report({ kind: 'shader-compile-end', detail: { shaderPreparationMs: 420 } });
    report({ kind: 'first-frame', detail: { firstFrameMs: 610 } });
    act(() => currentCanvas().props.onReady());
    expect(intro).toHaveAttribute('data-stage', 'globe');
    expect(intro).toHaveAttribute('data-first-frame-ms', '610');
    expect(intro).toHaveAttribute('data-preparation-ms');
    expect(screen.getByTestId('alvorada-preparing')).not.toHaveAttribute('data-active');

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
    expectSequentialStages(stages);

    const events = telemetryEvents();
    expect(events).toEqual(expect.arrayContaining([
      'intro-mounted', 'assets-warm-start', 'context-created', 'shader-compile-end', 'first-frame',
      'renderer-ready', 'globe-start', 'approach-start', 'alvorada-start', 'finished',
    ]));
    expect(events).not.toContain('fallback-triggered');
    expect(events).not.toContain('stage-invariant-violation');
    expect(window.__alvoradaIntroTelemetry?.environment).toMatchObject({
      firstFrameMs: 610,
      rendererTier: 'hardware',
      shaderPreparationMs: 420,
      staticReason: null,
      webglVersion: 'webgl2',
    });

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
    expect(intro).not.toHaveAttribute('data-static-reason');
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

  describe('narrativa 2D quando não há renderizador WebGL utilizável', () => {
    it('movimento reduzido: percorre planeta → aproximação → alvorada em crossfade, sem WebGL', () => {
      const onFinished = vi.fn();
      const stages: AlvoradaIntroStage[] = [];
      render(<AlvoradaIntro motion="reduced" onFinished={onFinished} onStageChange={(stage) => stages.push(stage)} />);
      const intro = screen.getByTestId('alvorada-intro');

      expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
      expect(runtime.canvasMounts).toHaveLength(0);
      expect(runtime.warmCalls).toBe(0);
      expect(intro).toHaveAttribute('data-renderer', 'fallback');
      expect(intro).toHaveAttribute('data-static-reason', 'reduced-motion');
      expect(intro).toHaveAttribute('data-motion', 'reduced');
      expect(intro).toHaveAttribute('data-stage', 'globe');
      expect(screen.getByTestId('alvorada-narrative-fallback')).toHaveAttribute('data-reduced', 'true');
      expect(document.querySelector('.alvorada-brand-hero--visible')).toBeNull();

      advance(ALVORADA_FALLBACK_NARRATIVE.globeMs);
      expect(intro).toHaveAttribute('data-stage', 'approach');
      expect(document.querySelector('.alvorada-harvest')).toHaveAttribute('data-stage', 'territory');
      advance(ALVORADA_FALLBACK_NARRATIVE.approachMs);
      expect(intro).toHaveAttribute('data-stage', 'approach');
      expect(document.querySelector('.alvorada-harvest')).toHaveAttribute('data-stage', 'santa-rosa');
      advance(ALVORADA_FALLBACK_NARRATIVE.santaRosaMs);
      expect(intro).toHaveAttribute('data-stage', 'alvorada');
      expect(screen.getByRole('img', { name: /^Fenasoja 2028$/, hidden: true })).toBeVisible();

      advance(ALVORADA_INTRO_BRAND_HOLD_MS);
      expect(onFinished).not.toHaveBeenCalled();
      advance(700);
      expect(onFinished).toHaveBeenCalledTimes(1);
      expect(stages).toEqual(['globe', 'approach', 'alvorada', 'finished']);
    });

    it('WebGL indisponível: mesma narrativa com motivo explícito', () => {
      runtime.rendererTier = 'unavailable';
      const onFinished = vi.fn();
      const stages: AlvoradaIntroStage[] = [];
      render(<AlvoradaIntro onFinished={onFinished} onStageChange={(stage) => stages.push(stage)} />);
      const intro = screen.getByTestId('alvorada-intro');

      expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
      expect(intro).toHaveAttribute('data-static-reason', 'unsupported-webgl');
      expect(intro).toHaveAttribute('data-renderer', 'fallback');
      expect(intro).toHaveAttribute('data-stage', 'globe');
      expect(screen.getByTestId('alvorada-narrative-fallback')).not.toHaveAttribute('data-reduced');

      advance(NARRATIVE_TO_ALVORADA_MS);
      expect(intro).toHaveAttribute('data-stage', 'alvorada');
      advance(ALVORADA_INTRO_BRAND_HOLD_MS + 700);
      expect(onFinished).toHaveBeenCalledTimes(1);
      expect(stages).toEqual(['globe', 'approach', 'alvorada', 'finished']);
      expect(window.__alvoradaIntroTelemetry?.events.find((event) => event.name === 'fallback-triggered')?.detail)
        .toMatchObject({ reason: 'unsupported-webgl', stage: 'preparing' });
    });

    it('erro de renderização: cai na narrativa a partir do planeta, nunca direto na tela final', () => {
      runtime.renderError = true;
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const onFinished = vi.fn();
      const stages: AlvoradaIntroStage[] = [];

      render(<AlvoradaIntro onFinished={onFinished} onStageChange={(stage) => stages.push(stage)} />);
      const intro = screen.getByTestId('alvorada-intro');

      expect(intro).toHaveAttribute('data-renderer', 'fallback');
      expect(intro).toHaveAttribute('data-static-reason', 'render-error');
      expect(intro).toHaveAttribute('data-stage', 'globe');
      expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
      expect(document.querySelector('.alvorada-brand-hero--visible')).toBeNull();

      advance(NARRATIVE_TO_ALVORADA_MS);
      expect(intro).toHaveAttribute('data-stage', 'alvorada');
      expect(screen.getByRole('img', { name: /^Fenasoja 2028$/, hidden: true })).toBeVisible();
      advance(ALVORADA_INTRO_BRAND_HOLD_MS + 700);
      expect(onFinished).toHaveBeenCalledTimes(1);
      expectSequentialStages(stages);
    });

    it('perda de contexto durante a aproximação: continua a narrativa da etapa atual, sem remontar o Canvas', () => {
      const onFinished = vi.fn();
      const stages: AlvoradaIntroStage[] = [];
      render(<AlvoradaIntro onFinished={onFinished} onStageChange={(stage) => stages.push(stage)} />);
      const canvas = currentCanvas();
      act(() => canvas.props.onReady());
      act(() => canvas.props.onProgress(ALVORADA_PHASES.territory.start + 1));
      const intro = screen.getByTestId('alvorada-intro');
      expect(intro).toHaveAttribute('data-stage', 'approach');

      act(() => canvas.props.onContextLost(ALVORADA_PHASES.territory.start + 1));

      expect(intro).toHaveAttribute('data-renderer', 'fallback');
      expect(intro).toHaveAttribute('data-static-reason', 'context-lost');
      // The stage already shown is preserved; the narrative resumes from it.
      expect(intro).toHaveAttribute('data-stage', 'approach');
      expect(screen.getByTestId('alvorada-narrative-fallback')).toHaveAttribute('data-stage', 'approach');
      expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();
      expect(runtime.canvasMounts).toHaveLength(1);

      // Renderer callbacks from the released canvas are ignored afterwards.
      act(() => canvas.props.onProgress(0.2));
      act(() => canvas.props.onReady());
      expect(intro).toHaveAttribute('data-stage', 'approach');

      advance(ALVORADA_FALLBACK_NARRATIVE.approachMs + ALVORADA_FALLBACK_NARRATIVE.santaRosaMs);
      expect(intro).toHaveAttribute('data-stage', 'alvorada');
      advance(ALVORADA_INTRO_BRAND_HOLD_MS + 700);
      expect(onFinished).toHaveBeenCalledTimes(1);
      expect(stages).toEqual(['globe', 'approach', 'alvorada', 'finished']);
    });

    it('perda de contexto após a colheita cobrir o quadro não altera a apresentação', async () => {
      render(<AlvoradaIntro onFinished={vi.fn()} />);
      const canvas = currentCanvas();
      act(() => canvas.props.onReady());
      act(() => canvas.props.onProgress(ALVORADA_PHASES['brand-reveal'].start));
      await decodeAndCoverHarvest();
      act(() => canvas.props.onContextLost(ALVORADA_PHASES['brand-reveal'].start));
      const intro = screen.getByTestId('alvorada-intro');
      expect(intro).toHaveAttribute('data-renderer', 'released');
      expect(intro).not.toHaveAttribute('data-static-reason');
    });
  });

  describe('watchdog de preparação: lento não é quebrado', () => {
    it('sem nenhum progresso, um stall real leva à narrativa a partir do planeta, com motivo', () => {
      const onFinished = vi.fn();
      const stages: AlvoradaIntroStage[] = [];
      render(<AlvoradaIntro onFinished={onFinished} onStageChange={(stage) => stages.push(stage)} />);
      const intro = screen.getByTestId('alvorada-intro');

      advance(ALVORADA_INTRO_PREPARE_STALL_MS - 1);
      expect(intro).toHaveAttribute('data-stage', 'preparing');
      expect(screen.getByText('Preparando a Alvorada')).toBeInTheDocument();
      advance(1);
      expect(intro).toHaveAttribute('data-renderer', 'fallback');
      expect(intro).toHaveAttribute('data-static-reason', 'prepare-stall');
      expect(intro).toHaveAttribute('data-stage', 'globe');
      expect(screen.queryByTestId('mock-alvorada-canvas')).not.toBeInTheDocument();

      // A late ready from the disposed renderer is ignored.
      act(() => currentCanvas().props.onReady());
      expect(intro).toHaveAttribute('data-stage', 'globe');

      advance(NARRATIVE_TO_ALVORADA_MS + ALVORADA_INTRO_BRAND_HOLD_MS + 700);
      expect(onFinished).toHaveBeenCalledTimes(1);
      expect(stages).toEqual(['globe', 'approach', 'alvorada', 'finished']);
    });

    it('compilação/assets acima de 9 s com progresso real: continua preparando e começa pelo planeta', () => {
      const onFinished = vi.fn();
      const stages: AlvoradaIntroStage[] = [];
      render(<AlvoradaIntro onFinished={onFinished} onStageChange={(stage) => stages.push(stage)} />);
      const intro = screen.getByTestId('alvorada-intro');

      report({ kind: 'canvas-created' });
      advance(4_000);
      report({ kind: 'context-created', detail: { webglVersion: 'webgl2' } });
      advance(4_000);
      report({ kind: 'shader-compile-start' });
      advance(4_000);
      report({ kind: 'asset-progress' });
      advance(4_000);
      report({ kind: 'shader-compile-end', detail: { shaderPreparationMs: 8_000 } });
      // 16 s elapsed with progress: still preparing, no fallback, no final frame.
      expect(intro).toHaveAttribute('data-stage', 'preparing');
      expect(intro).toHaveAttribute('data-renderer', 'webgl');
      expect(intro).not.toHaveAttribute('data-static-reason');
      expect(document.querySelector('.alvorada-brand-hero--visible')).toBeNull();

      advance(2_000);
      report({ kind: 'first-frame', detail: { firstFrameMs: 18_000 } });
      act(() => currentCanvas().props.onReady());
      expect(intro).toHaveAttribute('data-stage', 'globe');
      expect(Number(intro.getAttribute('data-preparation-ms'))).toBeGreaterThanOrEqual(18_000);

      // The journey budget starts now, not at mount: 24 s are still available.
      act(() => currentCanvas().props.onProgress(ALVORADA_PHASES.territory.start + 0.2));
      advance(ALVORADA_INTRO_MAX_DURATION_MS - 1);
      expect(onFinished).not.toHaveBeenCalled();
      expect(intro).toHaveAttribute('data-stage', 'approach');
      advance(1);
      expect(onFinished).toHaveBeenCalledTimes(1);
      expectSequentialStages(stages);
      expect(telemetryEvents()).not.toContain('fallback-triggered');
    });

    it('progresso interrompido após começar: o stall conta a partir do último progresso', () => {
      render(<AlvoradaIntro onFinished={vi.fn()} />);
      const intro = screen.getByTestId('alvorada-intro');

      advance(ALVORADA_INTRO_PREPARE_STALL_MS - 500);
      report({ kind: 'context-created' });
      advance(ALVORADA_INTRO_PREPARE_STALL_MS - 1);
      expect(intro).toHaveAttribute('data-stage', 'preparing');
      advance(1);
      expect(intro).toHaveAttribute('data-static-reason', 'prepare-stall');
      expect(intro).toHaveAttribute('data-stage', 'globe');
    });

    it('progresso perpétuo sem primeiro quadro: o teto absoluto encerra a preparação com motivo', () => {
      render(<AlvoradaIntro onFinished={vi.fn()} />);
      const intro = screen.getByTestId('alvorada-intro');
      const step = ALVORADA_INTRO_PREPARE_STALL_MS / 2;
      for (let elapsed = 0; elapsed < ALVORADA_INTRO_PREPARE_CEILING_MS; elapsed += step) {
        expect(intro).toHaveAttribute('data-stage', 'preparing');
        report({ kind: 'asset-progress' });
        advance(step);
      }
      expect(intro).toHaveAttribute('data-static-reason', 'prepare-ceiling');
      expect(intro).toHaveAttribute('data-renderer', 'fallback');
      expect(intro).toHaveAttribute('data-stage', 'globe');
    });

    it('falha do asset crítico é um erro real; falha de asset secundário não é', () => {
      render(<AlvoradaIntro onFinished={vi.fn()} />);
      const intro = screen.getByTestId('alvorada-intro');

      report({ kind: 'asset-failed', detail: { critical: false, url: '/alvorada/earth-clouds-2048.webp' } });
      expect(intro).toHaveAttribute('data-renderer', 'webgl');
      expect(intro).toHaveAttribute('data-stage', 'preparing');

      report({ kind: 'asset-failed', detail: { critical: true, url: '/alvorada/earth-surface-4096.webp' } });
      expect(intro).toHaveAttribute('data-renderer', 'fallback');
      expect(intro).toHaveAttribute('data-static-reason', 'asset-failed');
      expect(intro).toHaveAttribute('data-stage', 'globe');
    });

    it('a narrativa assumida após um stall recebe o próprio orçamento, não o tempo gasto preparando', () => {
      const onFinished = vi.fn();
      const stages: AlvoradaIntroStage[] = [];
      render(<AlvoradaIntro onFinished={onFinished} onStageChange={(stage) => stages.push(stage)} />);
      const intro = screen.getByTestId('alvorada-intro');

      report({ kind: 'canvas-created' });
      advance(ALVORADA_INTRO_PREPARE_STALL_MS);
      expect(intro).toHaveAttribute('data-static-reason', 'prepare-stall');
      expect(intro).toHaveAttribute('data-stage', 'globe');

      // The narrative walks every stage on its own timings; none is cut short
      // by a journey budget that had been counting since mount.
      const { globeMs, approachMs, santaRosaMs } = ALVORADA_FALLBACK_NARRATIVE;
      advance(globeMs);
      expect(intro).toHaveAttribute('data-stage', 'approach');
      advance(approachMs + santaRosaMs);
      expect(intro).toHaveAttribute('data-stage', 'alvorada');
      advance(ALVORADA_INTRO_BRAND_HOLD_MS + 700 - 1);
      expect(onFinished).not.toHaveBeenCalled();
      advance(1);
      expect(onFinished).toHaveBeenCalledTimes(1);
      expectSequentialStages(stages);
    });
  });

  describe('invariante de etapas e callbacks do renderizador', () => {
    it('um progresso que pularia etapas passa por globo e aproximação e registra a violação', () => {
      const stages: AlvoradaIntroStage[] = [];
      render(<AlvoradaIntro onFinished={vi.fn()} onStageChange={(stage) => stages.push(stage)} />);
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      act(() => currentCanvas().props.onReady());
      // A clock that did not start at zero (the bug being guarded against).
      act(() => currentCanvas().props.onProgress(ALVORADA_PHASES['brand-reveal'].start + 0.3));

      expect(stages).toEqual(['globe', 'approach', 'alvorada']);
      expectSequentialStages(stages);
      expect(telemetryEvents()).toContain('stage-invariant-violation');
    });

    it('progresso antes de onReady é tratado como prontidão e nunca como salto', () => {
      const stages: AlvoradaIntroStage[] = [];
      render(<AlvoradaIntro onFinished={vi.fn()} onStageChange={(stage) => stages.push(stage)} />);
      act(() => currentCanvas().props.onProgress(0.1));
      expect(stages).toEqual(['globe']);
      expect(screen.getByTestId('alvorada-intro')).toHaveAttribute('data-stage', 'globe');
      expect(telemetryEvents()).toContain('stage-invariant-violation');
    });

    it('progresso fora de ordem nunca rebobina a etapa nem a fase', () => {
      render(<AlvoradaIntro onFinished={vi.fn()} />);
      const intro = screen.getByTestId('alvorada-intro');
      act(() => currentCanvas().props.onReady());
      act(() => currentCanvas().props.onProgress(ALVORADA_PHASES['santa-rosa'].start + 0.2));
      expect(intro).toHaveAttribute('data-stage', 'approach');
      expect(document.querySelector('.alvorada-harvest')).toHaveAttribute('data-stage', 'santa-rosa');

      act(() => currentCanvas().props.onProgress(ALVORADA_PHASES.territory.start + 0.1));
      expect(intro).toHaveAttribute('data-stage', 'approach');
      expect(document.querySelector('.alvorada-harvest')).toHaveAttribute('data-stage', 'santa-rosa');
      act(() => currentCanvas().props.onProgress(0));
      expect(intro).toHaveAttribute('data-stage', 'approach');
    });

    it('callbacks atrasados depois da conclusão são ignorados', () => {
      const onFinished = vi.fn();
      render(<AlvoradaIntro onFinished={onFinished} />);
      const canvas = currentCanvas();
      act(() => canvas.props.onReady());
      act(() => canvas.props.onProgress(ALVORADA_PHASES['brand-reveal'].start));
      advance(ALVORADA_INTRO_BRAND_HOLD_MS);
      expect(onFinished).toHaveBeenCalledTimes(1);

      act(() => canvas.props.onContextLost(ALVORADA_PHASES['brand-reveal'].start));
      report({ kind: 'first-frame' });
      act(() => canvas.props.onQualityDecline());
      const intro = screen.getByTestId('alvorada-intro');
      expect(intro).toHaveAttribute('data-stage', 'finished');
      expect(intro).not.toHaveAttribute('data-static-reason');
    });
  });

  describe('responsividade e qualidade não reiniciam a jornada', () => {
    it('redimensionamento durante a preparação não remonta o Canvas nem muda a etapa', () => {
      render(<AlvoradaIntro onFinished={vi.fn()} />);
      const intro = screen.getByTestId('alvorada-intro');
      const canvasId = currentCanvas().id;
      vi.spyOn(intro, 'getBoundingClientRect').mockReturnValue({
        width: 360, height: 420, top: 0, left: 0, right: 360, bottom: 420, x: 0, y: 0, toJSON: () => ({}),
      });
      act(() => runtime.resizeObservers.forEach((callback) => callback([])));

      expect(intro).toHaveAttribute('data-frame', 'portrait');
      expect(intro).toHaveAttribute('data-stage', 'preparing');
      expect(runtime.canvasMounts).toHaveLength(1);
      expect(runtime.canvasUnmounts).toEqual([]);
      expect(screen.getByTestId('mock-alvorada-canvas')).toHaveAttribute('data-canvas-id', String(canvasId));
      // A narrow card adopts the mobile framing without touching the budget.
      expect(screen.getByTestId('mock-alvorada-canvas')).toHaveAttribute('data-mobile', 'true');
      expect(intro).toHaveAttribute('data-quality', 'high');
    });

    it('rotação durante o globo não remonta, não reinicia e não avança', () => {
      const stages: AlvoradaIntroStage[] = [];
      render(<AlvoradaIntro onFinished={vi.fn()} onStageChange={(stage) => stages.push(stage)} />);
      const intro = screen.getByTestId('alvorada-intro');
      act(() => currentCanvas().props.onReady());
      act(() => currentCanvas().props.onProgress(0.6));
      const canvasId = currentCanvas().id;

      vi.spyOn(intro, 'getBoundingClientRect').mockReturnValue({
        width: 844, height: 300, top: 0, left: 0, right: 844, bottom: 300, x: 0, y: 0, toJSON: () => ({}),
      });
      act(() => {
        window.dispatchEvent(new Event('orientationchange'));
        runtime.resizeObservers.forEach((callback) => callback([]));
      });
      advance(200);

      expect(intro).toHaveAttribute('data-stage', 'globe');
      expect(intro).toHaveAttribute('data-frame', 'landscape');
      expect(runtime.canvasMounts).toHaveLength(1);
      expect(screen.getByTestId('mock-alvorada-canvas')).toHaveAttribute('data-canvas-id', String(canvasId));
      expect(stages).toEqual(['globe']);
      // The renderer keeps its own clock: the next progress continues from where it was.
      act(() => currentCanvas().props.onProgress(0.7));
      expect(intro).toHaveAttribute('data-stage', 'globe');
    });

    it('degradação de qualidade em runtime muda o perfil sem remontar nem pular etapas', () => {
      render(<AlvoradaIntro onFinished={vi.fn()} />);
      const intro = screen.getByTestId('alvorada-intro');
      act(() => currentCanvas().props.onReady());
      act(() => currentCanvas().props.onProgress(ALVORADA_PHASES.territory.start + 0.5));
      const canvasId = currentCanvas().id;
      expect(intro).toHaveAttribute('data-quality', 'high');

      act(() => currentCanvas().props.onQualityDecline());
      expect(intro).toHaveAttribute('data-quality', 'medium');
      act(() => currentCanvas().props.onQualityDecline());
      expect(intro).toHaveAttribute('data-quality', 'low');

      expect(intro).toHaveAttribute('data-stage', 'approach');
      expect(intro).toHaveAttribute('data-renderer', 'webgl');
      expect(runtime.canvasMounts).toHaveLength(1);
      expect(screen.getByTestId('mock-alvorada-canvas')).toHaveAttribute('data-canvas-id', String(canvasId));
      expect(telemetryEvents().filter((name) => name === 'quality-degraded')).toHaveLength(2);
    });
  });

  it('monta o WebGL no tier compatible com a mesma sequência', () => {
    runtime.rendererTier = 'compatible';
    render(<AlvoradaIntro onFinished={vi.fn()} />);
    expect(screen.getByTestId('mock-alvorada-canvas')).toHaveAttribute('data-renderer-tier', 'compatible');
    expect(screen.getByTestId('alvorada-intro')).toHaveAttribute('data-stage', 'preparing');
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
