import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface AlvoradaReferenceAssetManifest {
  version: number;
  cityPanorama: {
    sourceSha256: string;
    desktop: string;
    portrait: string;
  };
  symbol: {
    sourceSha256: string;
    asset: string;
  };
}

const ALVORADA_ASSET_DIRECTORY = resolve('public/alvorada');
const MANIFEST_PATH = resolve(ALVORADA_ASSET_DIRECTORY, 'reference-assets.json');
const OFFICIAL_SYMBOL_SOURCE_SHA256 = 'cafa3155fc8f7e7d060dafc2ab5ff619e4c953565bc57821133b39a011b23811';

function loadManifest() {
  return JSON.parse(
    readFileSync(MANIFEST_PATH, 'utf8'),
  ) as AlvoradaReferenceAssetManifest;
}

function assetPath(file: string) {
  expect(file).toBe(basename(file));
  return resolve(ALVORADA_ASSET_DIRECTORY, file);
}

function webpDimensions(buffer: Buffer) {
  expect(buffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(buffer.subarray(8, 12).toString('ascii')).toBe('WEBP');
  expect(buffer.subarray(12, 16).toString('ascii')).toBe('VP8X');
  return {
    width: buffer.readUIntLE(24, 3) + 1,
    height: buffer.readUIntLE(27, 3) + 1,
  };
}

function pngDimensions(buffer: Buffer) {
  expect(buffer.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(buffer.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe('assets oficiais e panoramas da Alvorada', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('mantém manifesto versionado ligado aos três assets aprovados', () => {
    const manifest = loadManifest();

    expect(manifest.version).toBe(1);
    expect(manifest.cityPanorama).toEqual({
      sourceSha256: expect.stringMatching(/^[a-f\d]{64}$/),
      desktop: 'santa-rosa-horizon.webp',
      portrait: 'santa-rosa-horizon-portrait.webp',
    });
    expect(manifest.symbol).toEqual({
      sourceSha256: OFFICIAL_SYMBOL_SOURCE_SHA256,
      asset: 'fenasoja-symbol-official.png',
    });

    for (const file of [
      manifest.cityPanorama.desktop,
      manifest.cityPanorama.portrait,
      manifest.symbol.asset,
    ]) {
      expect(statSync(assetPath(file)).size).toBeGreaterThan(200_000);
    }
  });

  it('entrega panoramas WebP distintos e símbolo PNG quadrado em resolução útil', () => {
    const manifest = loadManifest();
    const desktop = readFileSync(assetPath(manifest.cityPanorama.desktop));
    const portrait = readFileSync(assetPath(manifest.cityPanorama.portrait));
    const symbol = readFileSync(assetPath(manifest.symbol.asset));
    const desktopSize = webpDimensions(desktop);
    const portraitSize = webpDimensions(portrait);
    const symbolSize = pngDimensions(symbol);

    expect(desktopSize.width).toBeGreaterThanOrEqual(1440);
    expect(desktopSize.height).toBeGreaterThanOrEqual(700);
    expect(portraitSize.width).toBeGreaterThanOrEqual(768);
    expect(portraitSize.height).toBeGreaterThanOrEqual(700);
    expect(portraitSize.width).toBeLessThan(desktopSize.width);
    expect(desktop.equals(portrait)).toBe(false);
    expect(symbolSize).toEqual({ width: 512, height: 512 });
  });

  it('mantém cidade e título 3D fora do runtime da intro', () => {
    const controller = readFileSync(
      resolve('src/features/alvorada/SceneController.tsx'),
      'utf8',
    );
    const camera = readFileSync(
      resolve('src/features/alvorada/CinematicCamera.tsx'),
      'utf8',
    );
    const capabilities = readFileSync(
      resolve('src/features/alvorada/capabilities.ts'),
      'utf8',
    );
    const brandHero = readFileSync(
      resolve('src/features/alvorada/AlvoradaBrandHero.tsx'),
      'utf8',
    );

    expect(existsSync(resolve(
      'src/features/alvorada/scenes/SantaRosaCinematicBackdrop.tsx',
    ))).toBe(false);
    expect(controller).not.toContain('SantaRosaCinematicBackdrop');
    expect(controller).not.toContain('santa-rosa-horizon');
    expect(controller).not.toContain('SantaRosaCity');
    expect(controller).not.toContain('FenasojaTitle3D');
    expect(camera).not.toContain('cityPosition');
    expect(camera).not.toContain('cityLook');
    expect(capabilities).not.toContain('santa-rosa-horizon');
    expect(capabilities).not.toContain('/alvorada/santa-rosa-roads.json');
    expect(capabilities).not.toContain('/alvorada/santa-rosa-city-v2.json');
    expect(capabilities).not.toContain('/alvorada/helvetiker-bold.typeface.json');
    expect(capabilities).not.toContain('/alvorada/fenasoja-symbol-official.png');
    expect(brandHero).toContain("import { FenasojaBrand } from '@/components/brand/FenasojaBrand'");
    expect(brandHero).toContain('<FenasojaBrand');
  });

  it('aquece somente os assets geográficos ainda presentes na jornada', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();

    const {
      streamAlvoradaSecondaryAssets,
      warmAlvoradaAssets,
    } = await import('@/features/alvorada/capabilities');
    warmAlvoradaAssets();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/alvorada/earth-day-2048.jpg',
      '/alvorada/earth-night-lights-2048.png',
      '/alvorada/earth-normal-2048.jpg',
      '/alvorada/earth-clouds-1024.png',
      '/alvorada/brazil-min.geojson',
      '/alvorada/rio-grande-do-sul-min.geojson',
      '/alvorada/santa-rosa-min.geojson',
    ]);
    expect(fetchMock.mock.calls.every(([, options]) => (
      (options as RequestInit).cache === 'force-cache'
    ))).toBe(true);

    streamAlvoradaSecondaryAssets();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/alvorada/earth-day-2048.jpg',
      '/alvorada/earth-night-lights-2048.png',
      '/alvorada/earth-normal-2048.jpg',
      '/alvorada/earth-clouds-1024.png',
      '/alvorada/brazil-min.geojson',
      '/alvorada/rio-grande-do-sul-min.geojson',
      '/alvorada/santa-rosa-min.geojson',
    ]);

    warmAlvoradaAssets();
    streamAlvoradaSecondaryAssets();
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });
});
