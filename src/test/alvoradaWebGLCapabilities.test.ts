import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  degradeAlvoradaQualityProfile,
  getAlvoradaQualityProfile,
  getAlvoradaWebGLTier,
} from '@/features/alvorada/capabilities';

const originalMatchMedia = window.matchMedia;

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
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    });
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

  it('trata viewport portrait como mobile e desliga os custos críticos', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });

    const mobile = getAlvoradaQualityProfile('hardware');

    expect(mobile).toMatchObject({
      antialias: false,
      bloom: false,
      buildingCount: 3000,
      cloudCount: 5,
      level: 'medium',
      mobile: true,
      postprocessing: false,
      shadows: false,
      terrainSegments: 72,
      treeCount: 900,
    });
    expect(mobile.dpr).toEqual([0.85, 1.25]);
  });

  it('degrada qualidade em no máximo dois passos e estabiliza no tier baixo', () => {
    const high = {
      ...getAlvoradaQualityProfile('hardware'),
      level: 'high' as const,
      mobile: false,
    };
    const medium = degradeAlvoradaQualityProfile(high);
    const low = degradeAlvoradaQualityProfile(medium);

    expect(medium.level).toBe('medium');
    expect(medium.shadows).toBe(false);
    expect(medium.bloom).toBe(false);
    expect(medium.buildingCount).toBeLessThanOrEqual(5400);
    expect(low.level).toBe('low');
    expect(low.postprocessing).toBe(false);
    expect(low.antialias).toBe(false);
    expect(low.buildingCount).toBeLessThanOrEqual(2600);
    expect(degradeAlvoradaQualityProfile(low)).toBe(low);
  });
});
