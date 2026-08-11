import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAlvoradaQualityProfile,
  getAlvoradaWebGLTier,
} from '@/features/alvorada/capabilities';

function webglContext() {
  const loseContext = vi.fn();
  const context = {
    getExtension: vi.fn((name: string) => (
      name === 'WEBGL_lose_context' ? { loseContext } : null
    )),
  } as unknown as WebGL2RenderingContext;

  return { context, loseContext };
}

describe('probe de compatibilidade WebGL da Alvorada', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'WebGL2RenderingContext', {
      configurable: true,
      value: function WebGL2RenderingContext() {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'WebGL2RenderingContext');
  });

  it('classifica hardware quando o contexto de alto desempenho é aceito', () => {
    const { context, loseContext } = webglContext();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context);

    expect(getAlvoradaWebGLTier()).toBe('hardware');
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledWith('webgl2', {
      failIfMajorPerformanceCaveat: true,
      powerPreference: 'high-performance',
    });
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('classifica compatible quando apenas o contexto WebGL2 conservador funciona', () => {
    const { context, loseContext } = webglContext();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(context);

    expect(getAlvoradaWebGLTier()).toBe('compatible');
    expect(getContext).toHaveBeenCalledTimes(2);
    expect(getContext).toHaveBeenNthCalledWith(2, 'webgl2', {
      powerPreference: 'default',
    });
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('classifica unavailable quando nenhum contexto WebGL2 pode ser criado', () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);

    expect(getAlvoradaWebGLTier()).toBe('unavailable');
    expect(getContext).toHaveBeenCalledTimes(2);
  });

  it('reduz o perfil visual no renderer compatible sem impedir a cena', () => {
    const hardware = getAlvoradaQualityProfile('hardware');
    const compatible = getAlvoradaQualityProfile('compatible');

    expect(compatible.buildingCount).toBeLessThan(hardware.buildingCount);
    expect(compatible.treeCount).toBeLessThan(hardware.treeCount);
    expect(compatible.cloudCount).toBeLessThan(hardware.cloudCount);
    expect(compatible.shadows).toBe(false);
    expect(compatible.antialias).toBe(false);
    expect(compatible.dpr[1]).toBeLessThan(hardware.dpr[1]);
    expect(compatible.terrainSegments).toBeLessThan(hardware.terrainSegments);
    expect(compatible.postprocessing).toBe(false);
    expect(compatible.bloom).toBe(false);
    expect(compatible.level).toBe('low');
  });
});
