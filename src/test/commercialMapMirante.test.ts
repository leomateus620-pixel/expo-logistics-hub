import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  MIRANTE_COMPLEX,
  MIRANTE_COMPLEX_REVISION,
  miranteComplexSourceBoundsToLocal,
} from '@/features/commercial-map/data/miranteComplexReconstruction';
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
const reconstructedBounds = miranteComplexSourceBoundsToLocal(MIRANTE_COMPLEX.mirante.sourceBounds);

function everyNumberIsFinite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(everyNumberIsFinite);
  if (value && typeof value === 'object') {
    return Object.values(value).every(everyNumberIsFinite);
  }
  return true;
}

describe('fonte de verdade arquitetônica do Espaço Mirante', () => {
  it('preserva a identidade oficial e aplica a implantação satélite versionada', () => {
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
        extrusionHeight: MIRANTE_COMPLEX.mirante.extrusionHeight,
        rotation: 0,
        geometryVersion: 1,
      },
      metadata: {
        sourceRevision: '2026.3',
        reconstructionRevision: MIRANTE_COMPLEX_REVISION,
        cartographicConfidence: 'reference_registered_estimate',
        officialMeasurements: false,
      },
    });
    expect(bounds.width).toBeCloseTo(reconstructedBounds.width, 8);
    expect(bounds.depth).toBeCloseTo(reconstructedBounds.depth, 6);
    expect(bounds.centerX).toBeCloseTo(reconstructedBounds.centerX, 6);
    expect(bounds.centerZ).toBeCloseTo(reconstructedBounds.centerZ, 6);
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

  it('deriva uma altura de um pavimento alinhada ao terraço, sem tratá-la como medida real', () => {
    const bounds = strategicLandmarkBounds(mirante);
    const height = miranteVisualHeight(bounds);

    expect(height).toBeGreaterThan(MIRANTE_COMPLEX.levels.deck + 0.28);
    expect(height).toBeLessThan(0.7);
    expect(height).toBeCloseTo(mirante.geometry.extrusionHeight, 1);
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
    expect(miranteArenaFacingRadians(miranteBounds, arenaBounds)).toBeGreaterThan(1.2);
    expect(miranteArenaFacingRadians(miranteBounds, arenaBounds)).toBeLessThan(1.5);
  });

  it('mantém plataforma, base, cobertura e estrutura finitas e apoiadas no terraço', () => {
    const bounds = strategicLandmarkBounds(mirante);
    const layout = createMiranteLayout(bounds, miranteVisualHeight(bounds));
    const bays = miranteStructuralBayPositions(layout);

    expect(everyNumberIsFinite(layout)).toBe(true);
    expect(layout.platform.width).toBe(layout.width);
    expect(layout.platform.depth).toBeLessThan(layout.depth);
    expect(layout.platform.minZ).toBeGreaterThan(-layout.depth / 2);
    expect(layout.base.width).toBeLessThan(layout.platform.width);
    expect(layout.base.depth).toBeLessThan(layout.platform.depth);
    expect(layout.platform.topY).toBeCloseTo(MIRANTE_COMPLEX.levels.deck, 8);
    expect(layout.platform.topY).toBeCloseTo(layout.site.sidewalkY, 8);
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
    expect(bays[0]).toBeGreaterThan(layout.platform.minZ);
    expect(bays.at(-1)).toBeLessThan(layout.platform.maxZ);
    expect(bays.every((value, index) => (
      Number.isFinite(value) && (index === 0 || value > bays[index - 1])
    ))).toBe(true);
  });

  it('mantém o corredor longitudinal oeste livre e os bancos voltados à Arena', () => {
    const bounds = strategicLandmarkBounds(mirante);
    const layout = createMiranteLayout(bounds, miranteVisualHeight(bounds));
    const plan = createMiranteFurniturePlan(layout);
    const westAisleProtectedX = layout.aisle.maxX + layout.aisle.furnitureClearance;

    expect(plan.benches).toHaveLength(layout.furniture.benchCount);
    expect(plan.all).toHaveLength(layout.furniture.benchCount);
    expect(new Set(plan.all.map((pose) => pose.id)).size).toBe(plan.all.length);
    expect(plan.benches.every((pose) => pose.facing === 'arena')).toBe(true);

    plan.all.forEach((pose) => {
      const halfX = pose.dimensions[0] / 2;
      const halfZ = pose.dimensions[2] / 2;

      expect(everyNumberIsFinite(pose)).toBe(true);
      expect(pose.dimensions.every((value) => value > 0)).toBe(true);
      expect(pose.position[0] - halfX).toBeGreaterThan(westAisleProtectedX);
      expect(pose.position[0] + halfX).toBeLessThan(layout.width / 2 - layout.railings.inset);
      expect(pose.position[2] - halfZ).toBeGreaterThan(layout.platform.minZ);
      expect(pose.position[2] + halfZ).toBeLessThan(layout.platform.maxZ);
      expect(pose.position[1] - pose.dimensions[1] / 2).toBeCloseTo(layout.platform.topY, 10);
    });
  });

  it('implanta a escada de descida na ponta norte, em direção à Exporural', () => {
    const bounds = strategicLandmarkBounds(mirante);
    const layout = createMiranteLayout(bounds, miranteVisualHeight(bounds));
    const plan = createMiranteFurniturePlan(layout);
    const stairs = layout.access.descentStairs;
    const furnitureMinZ = Math.min(
      ...plan.all.map((pose) => pose.position[2] - pose.dimensions[2] / 2),
    );

    expect(layout.access.northEdgeZ).toBe(layout.platform.minZ);
    expect(layout.access.southEdgeZ).toBe(layout.platform.maxZ);
    expect(stairs.start[2]).toBe(layout.platform.minZ);
    expect(stairs.endpoint[2]).toBeLessThan(stairs.start[2]);
    expect(stairs.endpoint[1]).toBeLessThan(stairs.start[1]);
    expect(stairs.endpoint[1]).toBeCloseTo(MIRANTE_COMPLEX.levels.exporuralGround, 8);
    expect(stairs.stepCount).toBeGreaterThanOrEqual(4);
    expect(stairs.stepRise * stairs.stepCount).toBeCloseTo(stairs.rise, 10);
    expect(furnitureMinZ).toBeGreaterThan(layout.platform.minZ);
    expect(layout.railings.openSouthEnd).toBe(true);
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
