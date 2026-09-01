import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  ARENA_FRONT_LAYOUT,
  PARK_ENVIRONMENT_FEATURES,
  shouldRenderArenaAccess,
  sourceBoundsToLocal,
} from '@/features/commercial-map/data/parkEnvironment';
import { ARENA_TERRAIN_TOP_ELEVATION } from '@/features/commercial-map/data/arenaTerrain';
import {
  ARENA_ACCESS_REFERENCE,
  ARENA_ACCESS_RENDER_BUDGET,
  ARENA_ACCESS_STRUCTURE_ID,
  createArenaAccessLayout,
} from '@/features/commercial-map/utils/arenaAccessStructure';
import { strategicLandmarkBounds } from '@/features/commercial-map/utils/landmarks';

function officialEntity(publicIdentifier: string) {
  const entity = OFFICIAL_REFERENCE_ENTITIES.find(
    (candidate) => candidate.publicIdentifier === publicIdentifier,
  );
  if (!entity) throw new Error(`Entidade oficial ausente: ${publicIdentifier}`);
  return entity;
}

describe('conexão coberta entre Mirante e escadaria da Arena', () => {
  it('fica ao sul de D3, a oeste e em frente aos degraus sem ocupar a escadaria', () => {
    const access = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.accessCanopy.sourceBounds);
    const stairs = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.stairs.sourceBounds);
    const mirante = strategicLandmarkBounds(officialEntity('D3'));
    const overlapWithMiranteOnX = Math.min(access.maxX, mirante.maxX)
      - Math.max(access.minX, mirante.minX);
    const overlapWithStairsOnZ = Math.min(access.maxZ, stairs.maxZ)
      - Math.max(access.minZ, stairs.minZ);

    expect(access.minZ).toBeGreaterThan(mirante.maxZ);
    expect(overlapWithMiranteOnX).toBeGreaterThan(0);
    expect(access.maxX).toBeLessThan(stairs.minX);
    expect(overlapWithStairsOnZ).toBeGreaterThan(0);
    expect(ARENA_FRONT_LAYOUT.accessCanopy.longAxis).toBe('z');
    expect(ARENA_FRONT_LAYOUT.accessCanopy.arenaSide).toBe('east');
    expect(ARENA_FRONT_LAYOUT.accessCanopy.sideWallEnd).toBe('south');
  });

  it('forma dez V estruturais repetidos nas duas faces e apoia todos na plataforma', () => {
    const bounds = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.accessCanopy.sourceBounds);
    const layout = createArenaAccessLayout(bounds, ARENA_TERRAIN_TOP_ELEVATION);
    const supports = layout.segments.filter((segment) => segment.role === 'V_SUPPORT');

    expect(layout.structure.bayCount).toBe(5);
    expect(layout.structure.bayBoundaries).toHaveLength(layout.structure.bayCount + 1);
    expect(supports).toHaveLength(layout.structure.bayCount * 2 * 2);

    [layout.structure.frontX, layout.structure.rearX].forEach((faceX, faceIndex) => {
      for (let bay = 0; bay < layout.structure.bayCount; bay += 1) {
        const pair = supports.filter((support) => (
          support.id.startsWith(`arena-access:v:${faceIndex}:${bay}:`)
        ));
        expect(pair).toHaveLength(2);
        expect(pair[0].start).toEqual(pair[1].start);
        expect(pair[0].start[0]).toBeCloseTo(faceX, 12);
        expect(pair[0].start[1]).toBeCloseTo(layout.platform.topY, 12);
        expect(pair.map((support) => support.end[2]).sort((a, b) => a - b)).toEqual([
          layout.structure.bayBoundaries[bay],
          layout.structure.bayBoundaries[bay + 1],
        ]);
        pair.forEach((support) => {
          expect(support.end[1]).toBeGreaterThan(support.start[1]);
          expect(support.thickness).toBeGreaterThan(0);
        });
      }
    });

    expect(layout.segments.some((segment) => segment.role === 'ROOF_TRUSS')).toBe(true);
    expect(layout.segments.some((segment) => segment.role === 'LONGITUDINAL_TRUSS')).toBe(true);
  });

  it('permanece apresentação não comercial, não selecionável e sem entidade duplicada', () => {
    const feature = PARK_ENVIRONMENT_FEATURES.find(
      (candidate) => candidate.id === ARENA_ACCESS_STRUCTURE_ID,
    );

    expect(ARENA_ACCESS_REFERENCE).toMatchObject({
      createsMapEntity: false,
      selectable: false,
      placementStatus: 'FIELD_REVIEW_RECOMMENDED',
    });
    expect(feature).toMatchObject({
      id: ARENA_ACCESS_STRUCTURE_ID,
      classification: 'NON_COMMERCIAL_STRUCTURE',
      isSellable: false,
      contributesToCommercialMetrics: false,
    });
    expect(OFFICIAL_REFERENCE_ENTITIES.some((entity) => (
      entity.id === ARENA_ACCESS_STRUCTURE_ID
      || entity.publicIdentifier === ARENA_ACCESS_STRUCTURE_ID
    ))).toBe(false);

    const d1 = officialEntity('D1');
    const d3 = officialEntity('D3');
    expect(shouldRenderArenaAccess([d1, d3])).toBe(true);
    expect(shouldRenderArenaAccess([d1])).toBe(true);
    expect(shouldRenderArenaAccess([d3])).toBe(false);
  });

  it('respeita o budget estático nas qualidades completa e reduzida', () => {
    const bounds = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.accessCanopy.sourceBounds);

    [false, true].forEach((reducedGraphics) => {
      const layout = createArenaAccessLayout(
        bounds,
        ARENA_TERRAIN_TOP_ELEVATION,
        reducedGraphics,
      );
      expect(layout.diagnostics.primaryDrawCalls)
        .toBeLessThanOrEqual(ARENA_ACCESS_RENDER_BUDGET.maxPrimaryDrawCalls);
      expect(layout.diagnostics.segmentCount)
        .toBeLessThanOrEqual(ARENA_ACCESS_RENDER_BUDGET.maxSegments);
      expect(layout.diagnostics.boxCount)
        .toBeLessThanOrEqual(ARENA_ACCESS_RENDER_BUDGET.maxBoxes);
      expect(layout.diagnostics.shadowCasterBatches)
        .toBeLessThanOrEqual(ARENA_ACCESS_RENDER_BUDGET.maxShadowCasterBatches);
    });
    expect(ARENA_ACCESS_RENDER_BUDGET.textures).toBe(0);
    expect(ARENA_ACCESS_RENDER_BUDGET.animatedObjects).toBe(0);
  });
});
