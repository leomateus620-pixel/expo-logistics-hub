import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ hq: vi.fn(async () => undefined), boot: vi.fn(), defaultRecord: vi.fn(), Canvas: () => null, Page: () => null }));
vi.mock('@/features/commercial-map/components/canvas/headquarters/headquartersPreparationResource', () => ({ preloadHeadquartersGeometry: mocks.hq }));
vi.mock('@/features/commercial-map/components/canvas/CommercialMapCanvas', () => ({ CommercialMapCanvas: mocks.Canvas }));
vi.mock('@/pages/CommercialMapPage', () => ({ default: mocks.Page }));
vi.mock('@/features/commercial-map/utils/performanceDiagnostics', () => ({ captureCommercialMapStageRecorder: () => mocks.defaultRecord, beginCommercialMapBoot: mocks.boot }));
import { awaitCommercialMapRequest } from '@/features/commercial-map/utils/commercialMapOperation';

afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); mocks.hq.mockClear(); mocks.boot.mockClear(); mocks.defaultRecord.mockClear(); });

describe('shared prewarm resources', () => {
  it('imports route code without starting a boot, mounting a page, or creating WebGL', async () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const { loadCommercialMapRouteModule, commercialMapRouteModuleState } = await import('@/features/commercial-map/utils/loadCommercialMapRouteModule');
    expect(commercialMapRouteModuleState()).toBe('cold');
    const pending = loadCommercialMapRouteModule();
    expect(loadCommercialMapRouteModule()).toBe(pending);
    expect(commercialMapRouteModuleState()).toBe('prefetched');
    expect((await pending).default).toBe(mocks.Page);
    expect(commercialMapRouteModuleState()).toBe('cached');
    expect(mocks.boot).not.toHaveBeenCalled(); expect(context).not.toHaveBeenCalled();
  });

  it('reports cached renderer readiness to the real boot while keeping prewarm completion separate', async () => {
    const { preloadCommercialMapCanvas } = await import('@/features/commercial-map/utils/preloadCanvas');
    const prewarm = vi.fn(), route = vi.fn();
    const pending = preloadCommercialMapCanvas({ prepareHeadquarters: false, recordStage: prewarm });
    expect(preloadCommercialMapCanvas({ prepareHeadquarters: false, recordStage: prewarm })).toBe(pending);
    await pending;
    expect(preloadCommercialMapCanvas({ recordStage: route })).toBe(pending);
    await pending;
    expect(route.mock.calls).toEqual([
      ['renderer-module-requested', { source: 'cached' }], ['renderer-module-ready', { source: 'cached' }],
    ]);
    expect(mocks.hq).toHaveBeenCalledTimes(1); expect(mocks.hq).toHaveBeenCalledWith(route);
    expect(mocks.defaultRecord).not.toHaveBeenCalled();
  });

  it('attaches the QueryClient abort signal to PostgREST and rejects a late non-abortable response', async () => {
    const controller = new AbortController();
    const transport = { then: Promise.resolve('private-data').then.bind(Promise.resolve('private-data')), abortSignal: vi.fn(() => Promise.resolve('private-data')) };
    expect(await awaitCommercialMapRequest(transport, controller.signal)).toBe('private-data');
    expect(transport.abortSignal).toHaveBeenCalledWith(controller.signal);
    let release!: (value: string) => void;
    const pending = awaitCommercialMapRequest(new Promise<string>(resolve => { release = resolve; }), controller.signal);
    controller.abort(); release('revoked-data');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
