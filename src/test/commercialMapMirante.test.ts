import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';
import {
  MIRANTE_ARENA_PUBLIC_IDENTIFIER,
  MIRANTE_OFFICIAL_NAME,
  MIRANTE_PUBLIC_IDENTIFIER,
  MIRANTE_RENDER_BUDGET,
  createMiranteFurniturePlan,
  createMiranteLayout,
  miranteArenaFacingDirection,
  miranteArenaFacingRadians,
  miranteStructuralBayPositions,
  miranteVisualHeight,
} from '@/features/commercial-map/utils/mirante';

const mirante = OFFICIAL_REFERENCE_ENTITIES.find(
  (candidate) => candidate.publicIdentifier === MIRANTE_PUBLIC_IDENTIFIER,
)!;
const arena = OFFICIAL_REFERENCE_ENTITIES.find(
  (candidate) => candidate.publicIdentifier === MIRANTE_ARENA_PUBLIC_IDENTIFIER,
)!;

function everyNumberIsFinite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(everyNumberIsFinite);
  if (value && typeof value === 'object') {
    return Object.values(value).every(everyNumberIsFinite);
  }
  return true;
}

describe('fonte de verdade arquitetônica do Espaço Mirante', () => {
  it('preserva integralmente o contrato cartográfico oficial de D3', () => {
    const before = JSON.stringify(mirante);
    const bounds = strategicLandmarkBounds(mirante);
    const height = miranteVisualHeight(bounds);
    const layout = createMiranteLayout(bounds, height);

    expect(mirante).toMatchObject({
      id: 'reference:2026:d3',
      publicIdentifier: MIRANTE_PUBLIC_IDENTIFIER,
      name: MIRANTE_OFFICIAL_NAME,
      classification: 'ATTRACTION',
      layerId: 'reference:structures',
      verificationStatus: 'NEEDS_REVIEW',
      geometry: {
        elevation: 0,
        extrusionHeight: 0.92,
        rotation: 0,
        geometryVersion: 1,
      },
      metadata: {
        sourceRevision: '2026.2',
        cartographicConfidence: 'official_visual_reference',
        officialMeasurements: false,
      },
    });
    expect(bounds.width).toBeCloseTo(2.4, 8);
    expect(bounds.depth).toBeCloseTo(8.5090909, 6);
    expect(bounds.centerX).toBeCloseTo(15.1636364, 6);
    expect(bounds.centerZ).toBeCloseTo(-7.4181818, 6);
    expect(layout.width).toBeCloseTo(bounds.width, 8);
    expect(layout.depth).toBeCloseTo(bounds.depth, 8);
    expect(JSON.stringify(mirante)).toBe(before);
  });

  it('resolve o asset pelo identificador público mesmo quando o id vem do banco', () => {
    const persistedMirante = { ...mirante, id: 'db:uuid:espaco-mirante' };

    expect(resolveStrategicLandmarkKind(persistedMirante)).toBe('mirante-pavilion');
    expect(strategicLandmarkVisualHeight(persistedMirante)).toBeCloseTo(
      miranteVisualHeight(strategicLandmarkBounds(persistedMirante)),
      8,
    );
  });

  it('deriva uma altura visual próxima de 2,3 sem tratá-la como medida real', () => {
    const bounds = strategicLandmarkBounds(mirante);
    const height = miranteVisualHeight(bounds);

    expect(height).toBeGreaterThanOrEqual(2.28);
    expect(height).toBeLessThanOrEqual(2.32);
    expect(height).toBeGreaterThan(mirante.geometry.extrusionHeight);
  });

  it('orienta câmera e hospitalidade positivamente do Mirante para a Arena', () => {
    const miranteBounds = strategicLandmarkBounds(mirante);
    const arenaBounds = strategicLandmarkBounds(arena);
    const direction = miranteArenaFacingDirection(miranteBounds, arenaBounds);
    const deltaX = arenaBounds.centerX - miranteBounds.centerX;
    const deltaZ = arenaBounds.centerZ - miranteBounds.centerZ;
    const dotProduct = direction[0] * deltaX + direction[1] * deltaZ;

    expect(Math.hypot(...direction)).toBeCloseTo(1, 10);
    expect(direction[0]).toBeGreaterThan(0);
    expect(dotProduct).toBeGreaterThan(0);
    expect(miranteArenaFacingRadians(miranteBounds, arenaBounds)).toBeCloseTo(1.32528, 4);
  });

  it('mantém plataforma, base, cobertura e estrutura finitas e apoiadas', () => {
    const bounds = strategicLandmarkBounds(mirante);
    const layout = createMiranteLayout(bounds, miranteVisualHeight(bounds));
    const bays = miranteStructuralBayPositions(layout);

    expect(everyNumberIsFinite(layout)).toBe(true);
    expect(layout.platform.width).toBe(layout.width);
    expect(layout.platform.depth).toBe(layout.depth);
    expect(layout.base.width).toBeLessThan(layout.platform.width);
    expect(layout.base.depth).toBeLessThan(layout.platform.depth);
    expect(layout.platform.centerY + layout.platform.thickness / 2).toBeCloseTo(
      layout.platform.topY,
      10,
    );
    expect(layout.structure.columnCenterY - layout.structure.columnHeight / 2).toBeCloseTo(
      layout.platform.topY,
      10,
    );
    expect(layout.structure.columnCenterY + layout.structure.columnHeight / 2).toBeCloseTo(
      layout.roof.eaveY,
      10,
    );
    expect(layout.roof.ridgeY - layout.roof.eaveY).toBeCloseTo(layout.roof.rise, 10);
    expect(layout.roof.width).toBeGreaterThan(layout.platform.width);
    expect(layout.roof.depth).toBeGreaterThan(layout.platform.depth);

    expect(bays).toHaveLength(layout.structure.bayCount + 1);
    expect(bays[0]).toBeGreaterThan(-layout.depth / 2);
    expect(bays.at(-1)).toBeLessThan(layout.depth / 2);
    expect(bays.every((value, index) => (
      Number.isFinite(value) && (index === 0 || value > bays[index - 1])
    ))).toBe(true);
  });

  it('mantém o corredor longitudinal oeste livre e o mobiliário contido', () => {
    const bounds = strategicLandmarkBounds(mirante);
    const layout = createMiranteLayout(bounds, miranteVisualHeight(bounds));
    const plan = createMiranteFurniturePlan(layout);
    const westAisleProtectedX = layout.aisle.maxX + layout.aisle.furnitureClearance;

    expect(plan.tables).toHaveLength(layout.furniture.rowCount);
    expect(plan.chairs).toHaveLength(layout.furniture.rowCount * 3);
    expect(new Set(plan.all.map((pose) => pose.id)).size).toBe(plan.all.length);
    expect(plan.chairs.filter((pose) => pose.facing === 'arena')).toHaveLength(
      layout.furniture.rowCount * 2,
    );

    plan.all.forEach((pose) => {
      const halfX = pose.dimensions[0] / 2;
      const halfZ = pose.dimensions[2] / 2;

      expect(everyNumberIsFinite(pose)).toBe(true);
      expect(pose.dimensions.every((value) => value > 0)).toBe(true);
      expect(pose.position[0] - halfX).toBeGreaterThan(westAisleProtectedX);
      expect(pose.position[0] + halfX).toBeLessThan(
        layout.width / 2 - layout.railings.inset,
      );
      expect(pose.position[2] - halfZ).toBeGreaterThan(-layout.depth / 2);
      expect(pose.position[2] + halfZ).toBeLessThan(layout.depth / 2);
      expect(pose.position[1] - pose.dimensions[1] / 2).toBeCloseTo(
        layout.platform.topY,
        10,
      );
    });
  });

  it('mantém rampa e escada no lado leste e fora dos grupos de hospitalidade', () => {
    const bounds = strategicLandmarkBounds(mirante);
    const layout = createMiranteLayout(bounds, miranteVisualHeight(bounds));
    const plan = createMiranteFurniturePlan(layout);
    const furnitureMaxX = Math.max(
      ...plan.all.map((pose) => pose.position[0] + pose.dimensions[0] / 2),
    );

    expect(layout.access.ramp.start[0]).toBeGreaterThan(layout.access.eastEdgeX);
    expect(layout.access.ramp.endpoint[0]).toBeGreaterThan(layout.access.eastEdgeX);
    expect(layout.access.stairs.start[0]).toBeGreaterThan(layout.access.eastEdgeX);
    expect(layout.access.stairs.endpoint[0]).toBe(layout.access.eastEdgeX);
    expect(layout.access.ramp.start[2]).toBeGreaterThanOrEqual(layout.access.clearMinZ - 1e-10);
    expect(layout.access.ramp.endpoint[2]).toBeLessThanOrEqual(layout.access.clearMaxZ);
    expect(layout.access.stairs.endpoint[2]).toBeLessThanOrEqual(layout.access.clearMaxZ);
    expect(layout.access.ramp.start[0] - layout.access.ramp.width / 2).toBeGreaterThan(
      furnitureMaxX,
    );
    expect(layout.access.stairs.endpoint[0] - furnitureMaxX).toBeGreaterThan(
      layout.aisle.furnitureClearance,
    );
    expect(layout.access.ramp.slope).toBeLessThanOrEqual(1 / 12 + 1e-10);
    expect(layout.access.ramp.run).toBeGreaterThanOrEqual(layout.access.ramp.rise * 12);
    expect(layout.access.stairs.stepCount).toBeGreaterThanOrEqual(3);
    expect(layout.access.stairs.stepRise * layout.access.stairs.stepCount).toBeCloseTo(
      layout.platform.topY,
      10,
    );
  });

  it('fixa limites mensuráveis por nível de detalhe', () => {
    expect(MIRANTE_RENDER_BUDGET.overview).toMatchObject({
      maxDrawCalls: 5,
      maxTriangles: 5_000,
      maxTextures: 0,
      furnitureGroups: 0,
    });
    expect(MIRANTE_RENDER_BUDGET.medium.maxDrawCalls).toBeLessThan(
      MIRANTE_RENDER_BUDGET.selected.maxDrawCalls,
    );
    expect(MIRANTE_RENDER_BUDGET.selected.maxTriangles).toBeLessThan(
      MIRANTE_RENDER_BUDGET.interior.maxTriangles,
    );
    expect(MIRANTE_RENDER_BUDGET.reduced.maxTriangles).toBeLessThanOrEqual(35_000);
    expect(MIRANTE_RENDER_BUDGET.reduced.maxShadowCasters).toBe(0);
    expect(MIRANTE_RENDER_BUDGET.surfaceTextureSize).toBeLessThanOrEqual(256);
    expect(MIRANTE_RENDER_BUDGET.interior.maxRenderableNodes).toBeLessThanOrEqual(45);
  });
});
