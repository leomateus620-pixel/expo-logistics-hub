import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  LIVESTOCK_PAVILION_OFFICIAL_NAME,
  LIVESTOCK_PAVILION_PUBLIC_IDENTIFIER,
  LIVESTOCK_PAVILION_RENDER_BUDGET,
  createLivestockPavilionLayout,
  livestockPavilionBayPositions,
} from '@/features/commercial-map/utils/livestockPavilion';
import {
  strategicLandmarkBounds,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';

const entity = OFFICIAL_REFERENCE_ENTITIES.find(
  (candidate) => candidate.publicIdentifier === LIVESTOCK_PAVILION_PUBLIC_IDENTIFIER,
)!;

describe('fonte de verdade arquitetônica do pavilhão de pecuária', () => {
  it('deriva o modelo do único footprint oficial de B9 sem mutar os dados', () => {
    const before = JSON.stringify(entity);
    const bounds = strategicLandmarkBounds(entity);
    const height = strategicLandmarkVisualHeight(entity)!;
    const layout = createLivestockPavilionLayout(bounds, height);

    expect(entity.id).toBe('reference:2026:b9');
    expect(entity.name).toBe(LIVESTOCK_PAVILION_OFFICIAL_NAME);
    expect(layout.width).toBeCloseTo(bounds.width, 8);
    expect(layout.depth).toBeCloseTo(bounds.depth, 8);
    expect(layout.height).toBe(height);
    expect(JSON.stringify(entity)).toBe(before);
  });

  it('expressa três trechos espaciais sem atribuir números não comprovados', () => {
    const bounds = strategicLandmarkBounds(entity);
    const layout = createLivestockPavilionLayout(bounds, strategicLandmarkVisualHeight(entity)!);

    expect(layout.sections.map((section) => section.key)).toEqual(['west', 'central', 'east']);
    expect(layout.sections).toHaveLength(3);
    expect(layout.sections[0].minX).toBeGreaterThanOrEqual(-bounds.width / 2);
    expect(layout.sections[2].maxX).toBeLessThanOrEqual(bounds.width / 2);
    expect(layout.sections[0].maxX).toBeLessThan(layout.sections[1].minX);
    expect(layout.sections[1].maxX).toBeLessThan(layout.sections[2].minX);
    expect(layout.corridorWidth + layout.stallDepth * 2).toBeCloseTo(layout.depth, 8);
  });

  it('mantém todos os ritmos estruturais dentro de cada trecho', () => {
    const bounds = strategicLandmarkBounds(entity);
    const layout = createLivestockPavilionLayout(bounds, strategicLandmarkVisualHeight(entity)!);

    layout.sections.forEach((section) => {
      const bays = livestockPavilionBayPositions(section);
      expect(bays).toHaveLength(section.bayCount + 1);
      expect(bays[0]).toBeGreaterThanOrEqual(section.minX);
      expect(bays.at(-1)).toBeLessThanOrEqual(section.maxX);
      expect(bays.every((value, index) => index === 0 || value > bays[index - 1])).toBe(true);
    });
  });

  it('mantém o orçamento de detalhe compatível com carregamento sob demanda', () => {
    expect(LIVESTOCK_PAVILION_RENDER_BUDGET.mediumCattlePerSection * 3).toBe(9);
    expect(LIVESTOCK_PAVILION_RENDER_BUDGET.focusedCattlePerSection * 3).toBe(15);
    expect(LIVESTOCK_PAVILION_RENDER_BUDGET.interiorCattlePerSection * 3).toBe(18);
    expect(LIVESTOCK_PAVILION_RENDER_BUDGET.reducedInteriorCattlePerSection * 3).toBe(9);
    expect(LIVESTOCK_PAVILION_RENDER_BUDGET.identityTextureWidth).toBeLessThanOrEqual(512);
    expect(LIVESTOCK_PAVILION_RENDER_BUDGET.identityTextureHeight).toBeLessThanOrEqual(128);
  });
});
