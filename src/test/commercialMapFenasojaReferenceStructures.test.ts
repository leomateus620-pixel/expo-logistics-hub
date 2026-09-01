import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  ARENA_FRONT_LAYOUT,
  sourceBoundsToLocal,
} from '@/features/commercial-map/data/parkEnvironment';
import {
  COOPERATIVISM_FACING_RADIANS,
  COOPERATIVISM_FRONT_ANCHOR_IDENTIFIER,
  COOPERATIVISM_PUBLIC_IDENTIFIER,
  GASTRONOMIC_ALAMEDA_FACING_RADIANS,
  GASTRONOMIC_ALAMEDA_FLAGPOLE_COUNT,
  GASTRONOMIC_ALAMEDA_FRONT_ANCHOR,
  GASTRONOMIC_ALAMEDA_PUBLIC_IDENTIFIER,
  createCooperativismLayout,
  createGastronomicAlamedaLayout,
  fitRotatedStructureBounds,
  landmarkFrontVector,
} from '@/features/commercial-map/utils/fenasojaReferenceStructures';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';

function officialEntity(publicIdentifier: string) {
  const entity = OFFICIAL_REFERENCE_ENTITIES.find(
    (candidate) => candidate.publicIdentifier === publicIdentifier,
  );
  if (!entity) throw new Error(`Entidade oficial ausente: ${publicIdentifier}`);
  return entity;
}

function normalizedDirection(deltaX: number, deltaZ: number): readonly [number, number] {
  const length = Math.hypot(deltaX, deltaZ);
  return [deltaX / length, deltaZ / length];
}

describe('reconstrução arquitetônica de B28 e D1', () => {
  it('mantém B28 horizontal e orienta o frontão para Q-M-08 no eixo +Z', () => {
    const entity = officialEntity(COOPERATIVISM_PUBLIC_IDENTIFIER);
    const canonicalSnapshot = JSON.stringify(entity);
    const bounds = strategicLandmarkBounds(entity);
    const visualHeight = strategicLandmarkVisualHeight(entity);

    expect(visualHeight).not.toBeNull();
    const layout = createCooperativismLayout(bounds, visualHeight!);
    const front = landmarkFrontVector(COOPERATIVISM_FACING_RADIANS);

    expect(entity).toMatchObject({
      id: 'reference:2026:b28',
      publicIdentifier: 'B28',
      name: 'Espaço do Cooperativismo',
      classification: 'BUILDING',
    });
    expect(COOPERATIVISM_FRONT_ANCHOR_IDENTIFIER).toBe('Q-M-08');
    expect(resolveStrategicLandmarkKind(entity)).toBe('cooperativism-space');
    expect(strategicLandmarkFacingRadians(entity)).toBe(COOPERATIVISM_FACING_RADIANS);
    expect(Math.hypot(...front)).toBeCloseTo(1, 12);
    expect(front[0]).toBeCloseTo(0, 12);
    expect(front[1]).toBeCloseTo(1, 12);

    expect(layout.width).toBeCloseTo(bounds.width, 10);
    expect(layout.depth).toBeCloseTo(bounds.depth, 10);
    expect(layout.width / layout.depth).toBeGreaterThan(2);
    expect(layout.wall.frontZ).toBeGreaterThan(0);
    expect(layout.roof.ridgeY).toBeGreaterThan(layout.roof.eaveY);
    expect(layout.roof.angle).toBeGreaterThan(0.45);
    expect(layout.roof.width).toBeGreaterThan(layout.width);
    expect(layout.roof.depth).toBeGreaterThan(layout.depth);
    expect(layout.facade.entranceCenterY - layout.facade.entranceHeight / 2)
      .toBeCloseTo(layout.foundation.topY, 10);
    expect(JSON.stringify(entity)).toBe(canonicalSnapshot);
  });

  it('mantém D1 reta no eixo oficial e orienta sua fachada para leste, diante da Arena', () => {
    const entity = officialEntity(GASTRONOMIC_ALAMEDA_PUBLIC_IDENTIFIER);
    const canonicalSnapshot = JSON.stringify(entity);
    const bounds = strategicLandmarkBounds(entity);
    const stairs = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.stairs.sourceBounds);
    const facadeDirection = landmarkFrontVector(GASTRONOMIC_ALAMEDA_FACING_RADIANS);
    const expectedDirection = normalizedDirection(
      stairs.centerX - bounds.centerX,
      stairs.centerZ - bounds.centerZ,
    );
    const facingDot = facadeDirection[0] * expectedDirection[0]
      + facadeDirection[1] * expectedDirection[1];

    expect(GASTRONOMIC_ALAMEDA_FRONT_ANCHOR).toBe('ARENA_FRONT_STAIRS');
    expect(resolveStrategicLandmarkKind(entity)).toBe('gastronomic-alameda');
    expect(strategicLandmarkFacingRadians(entity)).toBe(GASTRONOMIC_ALAMEDA_FACING_RADIANS);
    expect(Math.hypot(...facadeDirection)).toBeCloseTo(1, 12);
    expect(GASTRONOMIC_ALAMEDA_FACING_RADIANS).toBe(Math.PI / 2);
    expect(facadeDirection[0]).toBeCloseTo(1, 12);
    expect(facadeDirection[1]).toBeCloseTo(0, 12);
    // The exact stair centroid is slightly north-east, but the real facade is
    // straight. It still faces the Arena sector with less than 15° residual.
    expect(facingDot).toBeGreaterThan(Math.cos(Math.PI / 12));
    const fitted = fitRotatedStructureBounds(bounds, GASTRONOMIC_ALAMEDA_FACING_RADIANS);
    expect(fitted.width).toBeCloseTo(bounds.depth, 10);
    expect(fitted.depth).toBeCloseTo(bounds.width, 10);
    expect(JSON.stringify(entity)).toBe(canonicalSnapshot);
  });

  it('mantém os 17 mastros de D1 alinhados, separados do acesso central e dentro da fachada', () => {
    const entity = officialEntity(GASTRONOMIC_ALAMEDA_PUBLIC_IDENTIFIER);
    const canonicalBounds = strategicLandmarkBounds(entity);
    const fittedBounds = fitRotatedStructureBounds(
      canonicalBounds,
      GASTRONOMIC_ALAMEDA_FACING_RADIANS,
    );
    const visualHeight = strategicLandmarkVisualHeight(entity);

    expect(visualHeight).not.toBeNull();
    const layout = createGastronomicAlamedaLayout(fittedBounds, visualHeight!);
    const positions = layout.flagpoles.positionsX;
    const heights = layout.flagpoles.heights;

    expect(GASTRONOMIC_ALAMEDA_FLAGPOLE_COUNT).toBe(17);
    expect(layout.flagpoles.count).toBe(GASTRONOMIC_ALAMEDA_FLAGPOLE_COUNT);
    expect(positions).toHaveLength(GASTRONOMIC_ALAMEDA_FLAGPOLE_COUNT);
    expect(heights).toHaveLength(GASTRONOMIC_ALAMEDA_FLAGPOLE_COUNT);
    expect(new Set(positions.map((position) => position.toFixed(8))).size).toBe(17);
    expect(positions.every((position, index) => (
      index === 0 || position > positions[index - 1]
    ))).toBe(true);
    expect(positions.some((position) => position < 0)).toBe(true);
    expect(positions.some((position) => position > 0)).toBe(true);
    expect(positions.every((position) => Math.abs(position) > layout.access.stairWidth / 2))
      .toBe(true);
    expect(positions.every((position) => (
      Math.abs(position) + layout.flagpoles.radius <= layout.platform.width / 2
    ))).toBe(true);
    expect(heights.every((height) => (
      height >= layout.flagpoles.minimumHeight
      && height <= layout.flagpoles.maximumHeight
    ))).toBe(true);
    expect(layout.flagpoles.lineZ).toBeGreaterThan(layout.building.frontZ);
    expect(layout.flagpoles.lineZ).toBeLessThan(layout.platform.frontZ);
  });
});
