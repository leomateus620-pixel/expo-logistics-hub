import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAlvoradaTexture, releaseAlvoradaTexture, resetAlvoradaTexturesForTests } from '@/features/alvorada/alvoradaTextures';

vi.mock('@/features/alvorada/alvoradaAssets', () => ({ loadAlvoradaAsset: vi.fn(async () => new Blob(['pixels'])) }));

describe('shared canonical texture ownership', () => {
  let close: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    resetAlvoradaTexturesForTests();
    close = vi.fn();
    vi.stubGlobal('ImageBitmap', class {});
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2048, height: 1024, close })));
  });
  afterEach(() => { resetAlvoradaTexturesForTests(); vi.unstubAllGlobals(); });
  it('does not close the bitmap when just one of two mounted consumers unmounts', async () => {
    const first = await loadAlvoradaTexture('/alvorada/test.webp');
    const second = await loadAlvoradaTexture('/alvorada/test.webp');
    expect(first).toBe(second);
    const dispose = vi.spyOn(first, 'dispose');
    releaseAlvoradaTexture('/alvorada/test.webp');
    await Promise.resolve(); await Promise.resolve();
    expect(close).not.toHaveBeenCalled(); expect(dispose).not.toHaveBeenCalled();
    releaseAlvoradaTexture('/alvorada/test.webp');
    await Promise.resolve(); await Promise.resolve();
    expect(close).toHaveBeenCalledTimes(1); expect(dispose).toHaveBeenCalledTimes(1);
  });
  it('reacquires across StrictMode effect cleanup/setup without decoding or closing again', async () => {
    const first = await loadAlvoradaTexture('/alvorada/test.webp');
    releaseAlvoradaTexture('/alvorada/test.webp');
    const next = loadAlvoradaTexture('/alvorada/test.webp');
    expect(await next).toBe(first);
    await Promise.resolve();
    expect(close).not.toHaveBeenCalled(); expect(createImageBitmap).toHaveBeenCalledTimes(1);
    releaseAlvoradaTexture('/alvorada/test.webp'); await Promise.resolve(); await Promise.resolve();
  });
});
