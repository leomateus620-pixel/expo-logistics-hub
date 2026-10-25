import { afterEach, describe, expect, it, vi } from 'vitest';
import { Group, MeshStandardMaterial, PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { prepareSoyHarvestResources } from '@/features/commercial-map/harvest/prepareSoyHarvestResources';

afterEach(() => vi.useRealTimers());
function rendererFixture() {
  const globalError = vi.fn(), getUniforms = vi.fn(), material = new MeshStandardMaterial();
  const program = { program: {}, getUniforms };
  const context = { isContextLost: vi.fn(() => false), getProgramParameter: vi.fn(() => true) };
  const renderer = { debug: { onShaderError: globalError, checkShaderErrors: false },
    compile: vi.fn(() => new Set([material])), properties: { get: vi.fn(() => ({ currentProgram: program })) },
    getContext: () => context, extensions: { get: () => ({ COMPLETION_STATUS_KHR: 123 }) } } as unknown as WebGLRenderer;
  return { renderer, context, globalError, getUniforms };
}
describe('local shader preparation barrier', () => {
  it('prepares only the owned group and resolves after linking and first-use checks', async () => {
    vi.useFakeTimers(); const f = rendererFixture(), root = new Group(), camera = new PerspectiveCamera(), scene = new Scene();
    f.context.getProgramParameter.mockReturnValueOnce(false);
    const task = prepareSoyHarvestResources(f.renderer, root, camera, scene); let ready = false;
    task.promise.then(() => { ready = true; });
    expect(f.renderer.compile).toHaveBeenCalledWith(root, camera, scene);
    await vi.advanceTimersByTimeAsync(0); expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(10); await task.promise;
    expect(ready).toBe(true); expect(f.getUniforms).toHaveBeenCalledOnce();
    expect(f.renderer.debug.onShaderError).toBe(f.globalError); expect(f.renderer.debug.checkShaderErrors).toBe(false);
  });
  it('isolates local shader failures and restores the map callback in finally', async () => {
    vi.useFakeTimers(); const f = rendererFixture();
    f.getUniforms.mockImplementation(() => { f.renderer.debug.onShaderError?.({} as never, {} as never, {} as never, {} as never); });
    const task = prepareSoyHarvestResources(f.renderer, new Group(), new PerspectiveCamera(), new Scene());
    const result = expect(task.promise).rejects.toThrow('soy-local-shader-error');
    await vi.runAllTimersAsync(); await result;
    expect(f.globalError).not.toHaveBeenCalled(); expect(f.renderer.debug.onShaderError).toBe(f.globalError);
    expect(f.renderer.debug.checkShaderErrors).toBe(false);
  });
  it('cancels the polling timer before resources may be disposed and never completes late', async () => {
    vi.useFakeTimers(); const f = rendererFixture(); f.context.getProgramParameter.mockReturnValue(false);
    const task = prepareSoyHarvestResources(f.renderer, new Group(), new PerspectiveCamera(), new Scene());
    const result = expect(task.promise).rejects.toThrow('soy-preparation-cancelled');
    await vi.advanceTimersByTimeAsync(10); task.cancel(); await result;
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(16000); expect(f.getUniforms).not.toHaveBeenCalled();
  });
  it('bounds preparation on driver stalls and catches context loss locally', async () => {
    vi.useFakeTimers(); const f = rendererFixture(); f.context.getProgramParameter.mockReturnValue(false);
    const task = prepareSoyHarvestResources(f.renderer, new Group(), new PerspectiveCamera(), new Scene());
    const result = expect(task.promise).rejects.toThrow('soy-preparation-timeout');
    await vi.advanceTimersByTimeAsync(15020); await result; expect(vi.getTimerCount()).toBe(0);
    f.context.isContextLost.mockReturnValue(true);
    const lost = prepareSoyHarvestResources(f.renderer, new Group(), new PerspectiveCamera(), new Scene());
    const loss = expect(lost.promise).rejects.toThrow('soy-context-lost'); await vi.runAllTimersAsync(); await loss;
    expect(f.globalError).not.toHaveBeenCalled();
  });
});
