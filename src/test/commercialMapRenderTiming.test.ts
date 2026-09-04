import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebGLRenderer } from 'three';
import {
  beginCommercialMapRenderTiming,
  disposeCommercialMapRenderTiming,
  endCommercialMapRenderTiming,
  readCommercialMapRenderTiming,
  resetCommercialMapRenderTiming,
  setCommercialMapRenderTimingEnabled,
} from '@/features/commercial-map/utils/renderingTiming';

const renderers: WebGLRenderer[] = [];

function createRenderer(supported = true) {
  let activeQuery: WebGLQuery | null = null;
  const context = {
    CURRENT_QUERY: 0x8865,
    QUERY_RESULT_AVAILABLE: 0x8867,
    QUERY_RESULT: 0x8866,
    isContextLost: vi.fn(() => false),
    getExtension: vi.fn(() => supported ? { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb } : null),
    getParameter: vi.fn(() => false),
    getQuery: vi.fn(() => activeQuery),
    createQuery: vi.fn(() => ({} as WebGLQuery)),
    beginQuery: vi.fn((_target: number, query: WebGLQuery) => { activeQuery = query; }),
    endQuery: vi.fn(() => { activeQuery = null; }),
    getQueryParameter: vi.fn((_query: WebGLQuery, parameter: number): number | boolean => parameter === 0x8867 ? true : 12_500_000),
    deleteQuery: vi.fn(),
  };
  const renderer = {
    domElement: document.createElement('canvas'),
    getContext: vi.fn(() => context),
  } as unknown as WebGLRenderer;
  renderers.push(renderer);
  return { renderer, context };
}

function frame(renderer: WebGLRenderer, path: 'post' | 'direct' = 'post', presented = true) {
  const token = beginCommercialMapRenderTiming(renderer);
  endCommercialMapRenderTiming(token, path, presented);
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  setCommercialMapRenderTimingEnabled(false);
  renderers.splice(0).forEach(disposeCommercialMapRenderTiming);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('opt-in bounded Commercial Map CPU/GPU timing', () => {
  it('does not touch the renderer or allocate queries while disabled', () => {
    const { renderer, context } = createRenderer();
    expect(beginCommercialMapRenderTiming(renderer)).toBeNull();
    expect(renderer.getContext).not.toHaveBeenCalled();
    expect(context.createQuery).not.toHaveBeenCalled();
    expect(readCommercialMapRenderTiming(renderer.domElement)).toMatchObject({ enabled: false, gpuStatus: 'not-requested' });
  });

  it('measures CPU submission separately and leaves unsupported GPU timing explicitly unavailable', () => {
    const { renderer, context } = createRenderer(false);
    const now = vi.spyOn(performance, 'now').mockReturnValue(100);
    setCommercialMapRenderTimingEnabled(true);
    const token = beginCommercialMapRenderTiming(renderer);
    now.mockReturnValue(137.5);
    endCommercialMapRenderTiming(token, 'direct', true);
    expect(readCommercialMapRenderTiming(renderer.domElement)).toMatchObject({
      enabled: true, gpuStatus: 'unavailable', pendingQueries: 0,
      cpu: { samples: 1, averageMs: 37.5 }, gpu: { samples: 0, averageMs: null },
      paths: { direct: { cpu: { samples: 1 } }, post: { cpu: { samples: 0 } } },
    });
    expect(context.createQuery).not.toHaveBeenCalled();
  });

  it('reads GPU nanoseconds only after asynchronous availability and converts to milliseconds', () => {
    const { renderer, context } = createRenderer();
    setCommercialMapRenderTimingEnabled(true);
    context.getQueryParameter.mockReturnValue(false);
    frame(renderer);
    expect(context.getQueryParameter).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(context.getQueryParameter).toHaveBeenCalledWith(expect.anything(), context.QUERY_RESULT_AVAILABLE);
    expect(context.getQueryParameter).not.toHaveBeenCalledWith(expect.anything(), context.QUERY_RESULT);
    context.getQueryParameter.mockImplementation((_query, parameter) => parameter === context.QUERY_RESULT_AVAILABLE ? true : 12_500_000);
    vi.advanceTimersByTime(100);
    expect(readCommercialMapRenderTiming(renderer.domElement)).toMatchObject({
      gpuStatus: 'supported', pendingQueries: 0, gpu: { samples: 1, averageMs: 12.5 },
    });
    expect(context.deleteQuery).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds pending GPU queries and sample memory then discards disjoint results', () => {
    const { renderer, context } = createRenderer();
    setCommercialMapRenderTimingEnabled(true);
    for (let index = 0; index < 300; index += 1) frame(renderer);
    expect(context.createQuery).toHaveBeenCalledTimes(8);
    expect(readCommercialMapRenderTiming(renderer.domElement)).toMatchObject({
      cpu: { samples: 240 }, pendingQueries: 8, droppedGpuQueries: 292,
    });
    context.getParameter.mockReturnValue(true);
    vi.advanceTimersByTime(100);
    expect(context.getQueryParameter).not.toHaveBeenCalled();
    expect(readCommercialMapRenderTiming(renderer.domElement)).toMatchObject({
      pendingQueries: 0, disjointGpuQueries: 8, gpu: { samples: 0 },
    });
    expect(context.deleteQuery).toHaveBeenCalledTimes(8);
    resetCommercialMapRenderTiming();
    expect(readCommercialMapRenderTiming(renderer.domElement).cpu.samples).toBe(0);
  });

  it('does not issue cleanup GL calls for lost contexts or count unpresented frames', () => {
    const { renderer, context } = createRenderer();
    setCommercialMapRenderTimingEnabled(true);
    frame(renderer, 'direct', false);
    expect(readCommercialMapRenderTiming(renderer.domElement).cpu.samples).toBe(0);
    const token = beginCommercialMapRenderTiming(renderer);
    context.isContextLost.mockReturnValue(true);
    const deletesBeforeLoss = context.deleteQuery.mock.calls.length;
    const endsBeforeLoss = context.endQuery.mock.calls.length;
    endCommercialMapRenderTiming(token, 'post', false);
    expect(context.deleteQuery).toHaveBeenCalledTimes(deletesBeforeLoss);
    expect(context.endQuery).toHaveBeenCalledTimes(endsBeforeLoss);
    expect(readCommercialMapRenderTiming(renderer.domElement)).toMatchObject({
      gpuStatus: 'context-lost', pendingQueries: 0, cpu: { samples: 0 }, gpu: { samples: 0 },
    });
  });

  it('expires unavailable queries instead of polling forever', () => {
    const { renderer, context } = createRenderer();
    setCommercialMapRenderTimingEnabled(true);
    context.getQueryParameter.mockReturnValue(false);
    frame(renderer);
    vi.advanceTimersByTime(5200);
    expect(readCommercialMapRenderTiming(renderer.domElement)).toMatchObject({ pendingQueries: 0, droppedGpuQueries: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
