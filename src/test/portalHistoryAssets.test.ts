import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FENASOJA_HISTORY_ARTS, selectHistoryArtworks } from '@/components/portal/history/artCatalog';

interface LockedAsset {
  path: string;
  kind: 'runtime' | 'consultation';
  year?: number;
  width?: number;
  height?: number;
  bytes: number;
  sha256: string;
}

const lock = JSON.parse(readFileSync(resolve('scripts/portal-history/assets-lock.json'), 'utf8')) as { files: LockedAsset[] };
const runtime = lock.files.filter((entry) => entry.kind === 'runtime');

describe('acervo autêntico do cabeçalho FENASOJA', () => {
  it('preserva os bytes canônicos e só publica as oito variantes WebP', () => {
    expect(readdirSync(resolve('public/portal/history')).sort()).toEqual(runtime.map((entry) => basename(entry.path)).sort());
    for (const entry of runtime) {
      const data = readFileSync(resolve(entry.path));
      expect(data.byteLength, entry.path).toBe(entry.bytes);
      expect(createHash('sha256').update(data).digest('hex'), entry.path).toBe(entry.sha256);
    }
  });

  it('preserva canvas 4:3 e transparência das molduras contain', () => {
    for (const entry of runtime) {
      const data = readFileSync(resolve(entry.path));
      expect(data.toString('ascii', 8, 12)).toBe('WEBP');
      expect(data.toString('ascii', 12, 16)).toBe('VP8X');
      expect(data[20] & 0x10).toBe(0x10);
      expect(data.readUIntLE(24, 3) + 1).toBe(entry.width);
      expect(data.readUIntLE(27, 3) + 1).toBe(entry.height);
      expect(entry.width! / entry.height!).toBe(4 / 3);
    }
  });

  it('restringe o catálogo de produção às campanhas fornecidas e à dupla mobile', () => {
    const manifest = JSON.parse(readFileSync(resolve('docs/portal-history/source/artes-manifest.json'), 'utf8'));
    expect(FENASOJA_HISTORY_ARTS.map((art) => art.year)).toEqual(manifest.editions.map((art: { year: number }) => art.year));
    expect(selectHistoryArtworks(2).map((art) => art.year)).toEqual([2014, 2016, 2018, 2024]);
    expect(selectHistoryArtworks(1).map((art) => art.year)).toEqual([2016, 2024]);
    expect(selectHistoryArtworks(0).map((art) => art.year)).toEqual([2016, 2024]);
    for (const art of FENASOJA_HISTORY_ARTS) {
      expect(art.src).toMatch(/^\/portal\/history\/fenasoja-\d{4}-320x240\.webp$/);
      expect(art.srcSet).toBe(`${art.src} 320w, /portal/history/fenasoja-${art.year}-640x480.webp 640w`);
      expect([art.width, art.height]).toEqual([320, 240]);
    }
  });
});
