import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { memorialCollection, historicalEditions, historicalDocument, epilogue, pieceAssets } from './catalog';

describe('Memorial historical acquisition contract', () => {
  it('keeps exactly 25 chronological editions, one attached document and an unnumbered epilogue', () => {
    expect(historicalEditions.map(piece => piece.year)).toEqual([1966,1974,1976,1979,1981,1984,1987,1990,1992,1994,1996,1998,2000,2002,2004,2006,2008,2010,2012,2014,2016,2018,2022,2024,2026]);
    expect(historicalEditions.map(piece => piece.edition)).toEqual(Array.from({ length: 25 }, (_,index) => index+1));
    expect(memorialCollection).toHaveLength(27);
    expect(new Set(memorialCollection.map(piece => piece.id)).size).toBe(27);
    expect(epilogue.edition).toBeUndefined();
    expect(historicalDocument.parentId).toBe('fenasoja-2022');
  });

  it('uses the photographed identity while preserving the swapped 2012/2014 origin filenames', () => {
    expect(historicalEditions.find(piece => piece.year === 2012)?.sourceFile).toBe('20a_Fenasoja_2014.jpeg');
    expect(historicalEditions.find(piece => piece.year === 2014)?.sourceFile).toBe('19a_Fenasoja_2012.jpeg');
    expect(historicalDocument.sourceFile).toBe('23a_Fenasoja_2020_Placa_Historica.jpeg');
    expect(historicalDocument.engravedPeriod?.replace(/\s+/g,' ')).toBe('DE 28 DE ABRIL A 08 DE MAIO 2020');
  });

  for (const piece of memorialCollection.filter(piece => piece.sourceFile)) {
    it(`${piece.id}: preserves the original bytes and links its own clean artwork and reviewed inscriptions`, () => {
      const media = resolve('public/memorial-voluntariado');
      const original = readFileSync(resolve(media,'originals',piece.sourceFile!));
      const asset = pieceAssets(piece) as ReturnType<typeof pieceAssets> & { art: boolean; artSha256: string };
      expect(createHash('sha256').update(original).digest('hex')).toBe(asset.originalSha256);
      expect(asset.art).toBe(true);
      const artwork = readFileSync(resolve(media,'art',`${piece.id}.webp`));
      expect(createHash('sha256').update(artwork).digest('hex')).toBe(asset.artSha256);
      expect(existsSync(resolve(media,'thumbnails',`${piece.id}-240.webp`))).toBe(true);
      expect(existsSync(resolve(media,'faces',`${piece.id}.webp`))).toBe(true);
      const transcript = JSON.parse(readFileSync(resolve('src/features/memorial/transcriptions',piece.transcriptionFile!), 'utf8').replace(/^\uFEFF/,''));
      expect(['partial','verified']).toContain(transcript.status);
      expect(transcript.sections.length).toBeGreaterThan(0);
      for (const section of transcript.sections) for (const line of section.lines) {
        expect(['verified','unreadable']).toContain(line.status);
        expect(line.name.trim().length).toBeGreaterThan(0);
        if (line.status === 'unreadable') expect(line.name).toBe('Trecho ilegível na fotografia');
        expect(line.sourceRegion).toHaveLength(4);
        expect(line.sourceRegion.every((value: number) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
      }
      expect(JSON.stringify(transcript)).not.toMatch(/user_id|auth\.uid|commission_id|UNREVIEWED_DRAFT/);
    });
  }
});
