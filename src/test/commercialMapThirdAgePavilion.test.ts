import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import { PARK_ACCESS_SPATIAL_PLAN } from '@/features/commercial-map/data/parkAccessSpatialPlan';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkFocusDirection,
  strategicLandmarkSearchAliases,
  strategicLandmarkSupportsInterior,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';
import {
  THIRD_AGE_PAVILION_LAYOUT,
  THIRD_AGE_PAVILION_RENDER_BUDGET,
  thirdAgePavilionEntranceAlongFacadeRatio,
  thirdAgePavilionRenderDiagnostics,
} from '@/features/commercial-map/utils/thirdAgePavilion';

const pavilion = OFFICIAL_REFERENCE_ENTITIES.find(
  (entity) => entity.publicIdentifier === 'B22',
)!;

describe('Pavilhão da Terceira Idade B22', () => {
  it('substitui somente o visual genérico e preserva a identidade oficial', () => {
    const before = JSON.stringify(pavilion);

    expect(pavilion).toMatchObject({
      id: 'reference:2026:b22',
      publicIdentifier: 'B22',
      name: 'Pavilhão Terceira Idade',
      classification: 'PAVILION',
      layerId: 'reference:pavilions',
    });
    expect(resolveStrategicLandmarkKind(pavilion)).toBe('third-age-pavilion');
    expect(strategicLandmarkSupportsInterior(pavilion)).toBe(false);
    expect(JSON.stringify(pavilion)).toBe(before);
  });

  it('mantém footprint, orientação oeste, foco e envelope visual conservador', () => {
    const bounds = strategicLandmarkBounds(pavilion);

    expect(bounds.width).toBeCloseTo(4.1236, 4);
    expect(bounds.depth).toBeCloseTo(6.4582, 4);
    expect(strategicLandmarkFacingRadians(pavilion)).toBeCloseTo(-Math.PI / 2);
    expect(strategicLandmarkFocusDirection(pavilion)).toEqual([-0.92, 0.44, 0.28]);
    expect(strategicLandmarkVisualHeight(pavilion)).toBe(1.35);
    expect(strategicLandmarkVisualHeight(pavilion))
      .toBeLessThanOrEqual(THIRD_AGE_PAVILION_LAYOUT.maximumVisualHeight);
    expect(strategicLandmarkVisualHeight({
      ...pavilion,
      geometry: { ...pavilion.geometry, extrusionHeight: 2.4 },
    })).toBe(THIRD_AGE_PAVILION_LAYOUT.maximumVisualHeight);
  });

  it('acrescenta aliases arquitetônicos sem renomear a entidade', () => {
    const aliases = strategicLandmarkSearchAliases(pavilion);
    expect(aliases).toContain('Pavilhão da Terceira Idade');
    expect(aliases).toContain('Terceira Idade');
    expect(pavilion.name).toBe('Pavilhão Terceira Idade');
  });

  it('deriva a porta somente do threshold GIS compartilhado', () => {
    const setting = PARK_ACCESS_SPATIAL_PLAN.thirdAgePavilionSetting;
    const ratio = thirdAgePavilionEntranceAlongFacadeRatio(setting);

    expect(setting.officialEntityIdentifier).toBe('B22');
    expect(setting.accessRoadId).toBe('third-age-pavilion-access');
    expect(setting.sourcePdfAccessCenterline.at(-1)).toEqual(setting.sourcePdfThreshold);
    expect(setting.sourcePdfThreshold[0]).toBe(setting.sourcePdfFootprint[0][0]);
    expect(ratio).toBeCloseTo(-0.3986, 4);
    expect(Math.abs(ratio)).toBeLessThanOrEqual(0.42);
  });

  it('fica dentro do orçamento detalhado e reduzido', () => {
    const detailed = thirdAgePavilionRenderDiagnostics(true);
    const reduced = thirdAgePavilionRenderDiagnostics(false);

    expect(detailed).toMatchObject({
      primaryDrawCalls: 6,
      renderedTriangles: 168,
      shadowDrawCalls: 2,
      roofDetailCount: 5,
      withinBudget: true,
    });
    expect(reduced).toMatchObject({
      primaryDrawCalls: 5,
      renderedTriangles: 108,
      shadowDrawCalls: 2,
      roofDetailCount: 0,
      withinBudget: true,
    });
    expect(detailed.primaryDrawCalls)
      .toBeLessThanOrEqual(THIRD_AGE_PAVILION_RENDER_BUDGET.detailed.maximumPrimaryDrawCalls);
    expect(detailed.renderedTriangles)
      .toBeLessThanOrEqual(THIRD_AGE_PAVILION_RENDER_BUDGET.detailed.maximumRenderedTriangles);
    expect(reduced.primaryDrawCalls)
      .toBeLessThanOrEqual(THIRD_AGE_PAVILION_RENDER_BUDGET.reduced.maximumPrimaryDrawCalls);
    expect(reduced.renderedTriangles)
      .toBeLessThanOrEqual(THIRD_AGE_PAVILION_RENDER_BUDGET.reduced.maximumRenderedTriangles);
  });

  it('não adiciona animação contínua, timer nem coordenadas cartográficas duplicadas', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/features/commercial-map/components/canvas/ThirdAgePavilion.tsx',
    ), 'utf8');

    expect(source).toContain('PARK_ACCESS_SPATIAL_PLAN.thirdAgePavilionSetting');
    expect(source).not.toMatch(/useFrame|setInterval|setTimeout/);
    expect(source).not.toContain('mesh?.dispose()');
    expect(source).not.toContain('[742,');
    expect(source).not.toContain('[651,');
  });
});
