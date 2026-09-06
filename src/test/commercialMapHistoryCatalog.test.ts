import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { getHistoryIdForEntity, hasPublishedHistory, PUBLISHED_HISTORY_BINDINGS } from '@/features/commercial-map/history/bindings';
import { getPublishedHistory, HISTORY_ENTRIES, HISTORY_SOURCES } from '@/features/commercial-map/history/catalog';
import { isLocalHistoryAsset, isPublishableHistoryImage, type HistoryImage } from '@/features/commercial-map/history/mediaTypes';
import { HISTORY_IMAGES } from '@/features/commercial-map/history/media';
import type { HistoricalDate } from '@/features/commercial-map/history/types';

const validImage: HistoryImage = {
  id: 'fixture', historyIds: ['P07'], src: '/history/test/fixture.webp', width: 1200, height: 800,
  variants: [{ src: '/history/test/fixture-640.webp', width: 640 }], thumbnailSrc: '/history/test/fixture-thumb.webp', fullSrc: '/history/test/fixture-full.webp',
  alt: 'Descrição da fixture', caption: 'Legenda da fixture', role: 'recent', captureDate: null,
  publicationDate: { value: '2026-05-03', precision: 'day' }, credit: 'Autoria da fixture', collection: 'Acervo da fixture',
  sourcePageUrl: 'https://example.invalid/source', originalImageUrl: 'https://example.invalid/source.jpg', bindingStatus: 'verified', verificationStatus: 'verified',
  permission: { status: 'authorized', label: 'Autorização da fixture', sourceUrl: 'https://example.invalid/license', authorizationOrigin: null },
};

function expectValidDate(date: HistoricalDate) {
  const patterns = { year: /^\d{4}$/, month: /^\d{4}-(0[1-9]|1[0-2])$/, day: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/ };
  expect(date.value).toMatch(patterns[date.precision]);
  if (date.precision === 'day') {
    const parsed = new Date(`${date.value}T12:00:00Z`);
    expect(parsed.toISOString().slice(0, 10)).toBe(date.value);
  }
}

describe('publicação editorial e vínculo ao inventário real', () => {
  it('resolve identificadores exatos em entidades persistidas com UUID sem depender do nome ou ID de referência', () => {
    for (const [publicIdentifier, historyId] of Object.entries(PUBLISHED_HISTORY_BINDINGS)) {
      expect(getHistoryIdForEntity({ id: 'f646bc6c-e394-41a7-9a24-c4e9ba9d5f55', publicIdentifier, isArchived: false })).toBe(historyId);
      expect(getHistoryIdForEntity({ id: `reference:2026:${publicIdentifier.toLowerCase()}`, publicIdentifier: ` ${publicIdentifier}`, isArchived: false })).toBeNull();
      expect(getHistoryIdForEntity({ id: `reference:2026:${publicIdentifier.toLowerCase()}`, publicIdentifier: `${publicIdentifier}-parecido`, isArchived: false })).toBeNull();
      expect(getHistoryIdForEntity({ id: 'uuid', publicIdentifier, isArchived: true })).toBeNull();
    }
    expect(getHistoryIdForEntity(null)).toBeNull();
    expect(getHistoryIdForEntity(undefined)).toBeNull();
    expect(getHistoryIdForEntity({ id: 'reference:2026:b10', publicIdentifier: 'Pavilhão 7', isArchived: false })).toBeNull();
    expect(hasPublishedHistory({ id: 'uuid', publicIdentifier: 'toString', isArchived: false })).toBe(false);
  });

  it('cada ação publicada aponta para texto aprovado e estruturas existentes sem criar entidades', () => {
    expect(Object.keys(PUBLISHED_HISTORY_BINDINGS).length).toBeGreaterThan(0);
    for (const [identifier, historyId] of Object.entries(PUBLISHED_HISTORY_BINDINGS)) {
      const entry = getPublishedHistory(historyId);
      expect(entry, `${identifier} deve ter história publicada`).not.toBeNull();
      expect(entry?.publicIdentifiers).toContain(identifier);
      const entity = OFFICIAL_REFERENCE_DATA.entities.find((candidate) => candidate.publicIdentifier === identifier && !candidate.isArchived);
      expect(entity, `${identifier} deve existir no inventário`).toBeDefined();
      expect(entry?.entityIds).toContain(entity?.id);
    }
    for (const entry of HISTORY_ENTRIES) {
      if (entry.publicationStatus !== 'published') continue;
      expect(entry.editorialStatus).toBe('verified');
      expect(entry.bindingStatus).toBe('verified');
      expect(entry.summary.trim().length).toBeGreaterThan(30);
      expect(entry.entityIds.length).toBeGreaterThan(0);
      expect(entry.publicIdentifiers.length).toBeGreaterThan(0);
      for (const identifier of entry.publicIdentifiers) expect(PUBLISHED_HISTORY_BINDINGS[identifier]).toBe(entry.id);
      for (const id of entry.entityIds) expect(OFFICIAL_REFERENCE_DATA.entities.some((entity) => entity.id === id)).toBe(true);
    }
    expect(getPublishedHistory('historia-inexistente')).toBeNull();
  });

  it('mantém IDs únicos, fontes acessíveis por referência, datas precisas e agrupamentos sem ciclos', () => {
    expect(new Set(HISTORY_ENTRIES.map((entry) => entry.id)).size).toBe(HISTORY_ENTRIES.length);
    expect(new Set(HISTORY_SOURCES.map((source) => source.id)).size).toBe(HISTORY_SOURCES.length);
    const sourceIds = new Set(HISTORY_SOURCES.map((source) => source.id));
    for (const source of HISTORY_SOURCES) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.publisher.trim()).not.toBe('');
      expectValidDate({ value: source.reviewedAt, precision: 'day' });
    }
    for (const entry of HISTORY_ENTRIES) {
      expect(entry.sourceIds.length).toBeGreaterThan(0);
      expect(new Set(entry.publicIdentifiers).size).toBe(entry.publicIdentifiers.length);
      expectValidDate({ value: entry.reviewedAt, precision: 'day' });
      for (const id of entry.sourceIds) expect(sourceIds.has(id)).toBe(true);
      for (const milestone of entry.milestones) {
        if (milestone.date) expectValidDate(milestone.date);
        expect(milestone.sourceIds.length).toBeGreaterThan(0);
        for (const id of milestone.sourceIds) {
          expect(sourceIds.has(id)).toBe(true);
          expect(entry.sourceIds).toContain(id);
        }
      }
      const seen = new Set([entry.id]);
      let parentId = entry.parentHistoryId;
      while (parentId) {
        expect(seen.has(parentId), `ciclo editorial em ${entry.id}`).toBe(false);
        seen.add(parentId);
        const parent = HISTORY_ENTRIES.find((candidate) => candidate.id === parentId);
        expect(parent, `grupo ${parentId} deve existir`).toBeDefined();
        parentId = parent?.parentHistoryId;
      }
    }
  });
});

describe('gate independente de fotografia histórica', () => {
  it('publica somente mídias aprovadas com arquivos locais existentes, procedência e correspondência editorial', () => {
    expect(new Set(HISTORY_IMAGES.map((image) => image.id)).size).toBe(HISTORY_IMAGES.length);
    for (const entry of HISTORY_ENTRIES) {
      if (!getPublishedHistory(entry.id)) continue;
      for (const id of entry.imageIds) {
        const image = HISTORY_IMAGES.find((candidate) => candidate.id === id);
        expect(image, `fotografia ${id} de ${entry.id}`).toBeDefined();
        expect(isPublishableHistoryImage(image!, entry.id)).toBe(true);
      }
    }
    for (const image of HISTORY_IMAGES) {
      expect(image.caption.trim()).not.toBe('');
      expect(image.alt.trim()).not.toBe('');
      expect(image.sourcePageUrl).toMatch(/^https:\/\//);
      expect(image.originalImageUrl).toMatch(/^https:\/\//);
      expect(image.historyIds.length).toBeGreaterThan(0);
      for (const id of image.historyIds) expect(getPublishedHistory(id)?.imageIds).toContain(image.id);
      if (image.captureDate) expectValidDate(image.captureDate);
      if (image.publicationDate) expectValidDate(image.publicationDate);
      for (const src of [image.src, image.fullSrc, image.thumbnailSrc, ...image.variants.map((variant) => variant.src)]) {
        expect(isLocalHistoryAsset(src)).toBe(true);
        expect(existsSync(resolve(process.cwd(), 'public', src.slice(1))), `arquivo ${src}`).toBe(true);
      }
    }
  });

  it('aceita foto autorizada para o lugar exato mesmo sem data de captura e não altera a data publicada', () => {
    const input = structuredClone(validImage);
    expect(isPublishableHistoryImage(input, 'P07')).toBe(true);
    expect(input.captureDate).toBeNull();
    expect(input.publicationDate).toEqual({ value: '2026-05-03', precision: 'day' });
    expect(isPublishableHistoryImage(input, 'OUTRO-LUGAR')).toBe(false);
  });

  it.each<Partial<HistoryImage>>([
    { bindingStatus: 'pending' }, { verificationStatus: 'pending' }, { width: 0 }, { height: 0 },
    { src: 'https://example.invalid/foto.jpg' }, { thumbnailSrc: '//example.invalid/foto.jpg' },
    { fullSrc: '/history/../secret.jpg' }, { variants: [{ src: '/history/test/fixture.webp', width: 0 }] },
    { permission: { ...validImage.permission, status: 'pending' } },
    { permission: { ...validImage.permission, status: 'restricted' } },
    { permission: { ...validImage.permission, sourceUrl: null, authorizationOrigin: null } },
  ])('bloqueia mídia não publicável: %j', (change) => {
    expect(isPublishableHistoryImage({ ...validImage, ...change }, 'P07')).toBe(false);
  });

  it.each(['https://example.invalid/foto.jpg', '//example.invalid/foto.jpg', 'data:image/png;base64,AA==', '/history/../../foto.png', '/history/foto.svg', '/history/foto.png?remote=true', '/other/foto.webp'])('recusa caminho externo ou fora do acervo: %s', (src) => {
    expect(isLocalHistoryAsset(src)).toBe(false);
  });
});
