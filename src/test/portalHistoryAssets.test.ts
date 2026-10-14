import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FENASOJA_EDITION_CATALOG, FENASOJA_HISTORY_ARTS } from '@/components/portal/history/artCatalog';

interface LockedAsset {
  path: string;
  kind: 'runtime' | 'consultation' | 'legacy-provenance';
  editionNumber?: number;
  year?: number;
  width?: number;
  height?: number;
  bytes: number;
  sha256: string;
  canonicalPath?: string;
}

const lock = JSON.parse(readFileSync(resolve('scripts/portal-history/assets-lock.json'), 'utf8')) as { files: LockedAsset[] };
const runtime = lock.files.filter((entry) => entry.kind === 'runtime');
const supplied = JSON.parse(readFileSync(resolve('docs/portal-history/source/catalogo-25-edicoes.json'), 'utf8'));

describe('acervo autêntico do cabeçalho FENASOJA', () => {
  it('preserva os bytes canônicos dos masters e só publica as 24 variantes WebP', () => {
    expect(runtime).toHaveLength(24);
    expect(readdirSync(resolve('public/portal/history')).sort()).toEqual(runtime.map((entry) => basename(entry.path)).sort());
    for (const entry of lock.files) {
      const data = readFileSync(resolve(entry.path));
      expect(data.byteLength, entry.path).toBe(entry.bytes);
      expect(createHash('sha256').update(data).digest('hex'), entry.path).toBe(entry.sha256);
      if (entry.canonicalPath) {
        expect(lstatSync(resolve(entry.path)).isSymbolicLink()).toBe(true);
        expect(realpathSync(resolve(entry.path))).toBe(realpathSync(resolve(entry.canonicalPath)));
      }
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

  it('documenta 25 edições e restringe a renderização às 12 peças recuperadas sem inventar lacunas', () => {
    expect(FENASOJA_EDITION_CATALOG).toHaveLength(25);
    expect(FENASOJA_HISTORY_ARTS).toHaveLength(12);
    expect(FENASOJA_HISTORY_ARTS.map((art) => art.year)).toEqual([1998, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2022, 2024, 2026]);
    expect(FENASOJA_HISTORY_ARTS.map((art) => art.editionNumber)).toEqual([12, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);
    expect(FENASOJA_HISTORY_ARTS).toEqual(FENASOJA_EDITION_CATALOG.filter((edition) => edition.status === 'recuperada'));
    expect(FENASOJA_EDITION_CATALOG.map((edition) => [edition.editionNumber, edition.year, edition.status]))
      .toEqual(supplied.editions.map((edition: { editionNumber: number; year: number; status: string }) => [edition.editionNumber, edition.year, edition.status]));
    const primaryChronology = JSON.parse(readFileSync(resolve('docs/portal-history/verified-chronology.json'), 'utf8'));
    expect(FENASOJA_EDITION_CATALOG.map((edition) => [edition.editionNumber, edition.year]))
      .toEqual(primaryChronology.editions.map((edition: { editionNumber: number; year: number }) => [edition.editionNumber, edition.year]));
    const pending = FENASOJA_EDITION_CATALOG.filter((edition) => edition.status === 'pendente');
    expect(pending).toHaveLength(13);
    for (const edition of pending) {
      expect(edition.src).toBeNull();
      expect(edition.source).toBeNull();
      expect(FENASOJA_HISTORY_ARTS.some((art) => art.id === edition.id)).toBe(false);
    }
    for (const art of FENASOJA_HISTORY_ARTS) {
      expect(art.id).toBe(`fenasoja-edicao-${art.editionNumber}`);
      expect(art.src).toBe(`/portal/history/fenasoja-edicao-${art.editionNumber}-${art.year}-256x192.webp`);
      expect(art.srcSet).toBe(`${art.src} 256w, /portal/history/fenasoja-edicao-${art.editionNumber}-${art.year}-512x384.webp 512w`);
      expect([art.width, art.height]).toEqual([256, 192]);
      const record = supplied.editions.find((edition: { editionNumber: number }) => edition.editionNumber === art.editionNumber);
      expect([art.source, art.publication, art.note]).toEqual([record.source, record.publication, record.note]);
      for (const variant of record.variants) {
        const file = runtime.find((entry) => basename(entry.path) === basename(variant.path));
        expect([file!.sha256, file!.bytes, file!.width, file!.height]).toEqual([variant.sha256, variant.bytes, variant.width, variant.height]);
      }
    }
  });

  it('preserva as peças representativas e as edições reagendadas com sua identificação documentada', () => {
    expect(FENASOJA_HISTORY_ARTS.find((art) => art.year === 2018)?.kind).toBe('branding-project');
    expect(FENASOJA_HISTORY_ARTS.find((art) => art.year === 2022)?.kind).toBe('program-cover');
    expect(FENASOJA_HISTORY_ARTS.find((art) => art.year === 2024)?.kind).toBe('advertisement');
    expect(FENASOJA_HISTORY_ARTS.find((art) => art.year === 2026)?.kind).toBe('institutional-banner');
    expect(FENASOJA_EDITION_CATALOG.some((edition) => edition.year === 2020)).toBe(false);
    expect(FENASOJA_EDITION_CATALOG.find((edition) => edition.editionNumber === 23)?.year).toBe(2022);
    expect(FENASOJA_EDITION_CATALOG.find((edition) => edition.editionNumber === 24)?.year).toBe(2024);
    expect(FENASOJA_EDITION_CATALOG.find((edition) => edition.editionNumber === 25)?.year).toBe(2026);
  });
});
