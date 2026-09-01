import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  CAMPEIRA_TRACK_CANONICAL_FOOTPRINT,
  CAMPEIRA_TRACK_GROUND_CONTACT,
  CAMPEIRA_TRACK_PUBLIC_IDENTIFIER,
  CAMPEIRA_TRACK_RENDER_BUDGET,
  campeiraPointIsInsideFootprint,
  campeiraTransformFootprintCorners,
  createCampeiraTrackPlan,
  resolveCampeiraTrackBounds,
  type CampeiraInstanceTransform,
  type CampeiraTrackPlan,
} from '@/features/commercial-map/utils/campeiraTrack';

function officialTrack() {
  const entity = OFFICIAL_REFERENCE_ENTITIES.find(
    (candidate) => candidate.publicIdentifier === CAMPEIRA_TRACK_PUBLIC_IDENTIFIER,
  );
  if (!entity) throw new Error('Entidade oficial PISTA-CAMPEIRA ausente.');
  return entity;
}

function allRepeatedTransforms(plan: CampeiraTrackPlan): readonly CampeiraInstanceTransform[] {
  return [
    ...plan.fence.posts,
    ...plan.fence.rails,
    ...plan.shelter.roof,
    ...plan.shelter.steel,
    ...plan.shelter.penPosts,
    ...plan.shelter.penRails,
  ];
}

describe('reconstrução rural da Pista Campeira', () => {
  it('deriva a apresentação do footprint oficial sem criar ou alterar a entidade', () => {
    const entity = officialTrack();
    const canonicalSnapshot = JSON.stringify(entity);
    const bounds = resolveCampeiraTrackBounds(entity);
    const plan = createCampeiraTrackPlan(bounds);

    expect(entity).toMatchObject({
      id: CAMPEIRA_TRACK_CANONICAL_FOOTPRINT.expectedReferenceEntityId,
      publicIdentifier: CAMPEIRA_TRACK_PUBLIC_IDENTIFIER,
      name: 'Pista Campeira',
      classification: CAMPEIRA_TRACK_CANONICAL_FOOTPRINT.classification,
    });
    expect(CAMPEIRA_TRACK_CANONICAL_FOOTPRINT).toMatchObject({
      geometryPolicy: 'PRESERVE_EXISTING_CANONICAL_ENTITY_GEOMETRY',
      createsMapEntities: false,
      createsSelectableObjects: false,
      mutatesOfficialGeometry: false,
    });
    expect(plan.layout.width).toBeCloseTo(bounds.width, 12);
    expect(plan.layout.depth).toBeCloseTo(bounds.depth, 12);
    expect(plan.layout.surface.maxX - plan.layout.surface.minX).toBeCloseTo(bounds.width, 12);
    expect(plan.layout.surface.maxZ - plan.layout.surface.minZ).toBeCloseTo(bounds.depth, 12);
    expect(JSON.stringify(entity)).toBe(canonicalSnapshot);
  });

  it('gera solo natural determinístico com grama, palha seca, terra e relevo aterrado nas bordas', () => {
    const bounds = resolveCampeiraTrackBounds(officialTrack());
    const first = createCampeiraTrackPlan(bounds);
    const second = createCampeiraTrackPlan(bounds);
    const covers = new Set(first.surface.vertices.map((vertex) => vertex.cover));
    const colors = new Set(first.surface.vertices.map((vertex) => (
      vertex.color.map((channel) => channel.toFixed(5)).join(':')
    )));
    const interiorY = first.surface.vertices
      .filter((vertex) => !vertex.boundary)
      .map((vertex) => vertex.position[1]);

    expect(first).toEqual(second);
    expect(covers).toEqual(new Set(['GRASS', 'DRY_GRASS', 'COMPACTED_SOIL']));
    expect(colors.size).toBeGreaterThan(40);
    expect(interiorY.some((value) => (
      Math.abs(value - first.layout.surface.baseY) > 1e-5
    ))).toBe(true);
    first.surface.vertices.forEach((vertex) => {
      expect(vertex.color.every((channel) => channel > 0 && channel < 0.7)).toBe(true);
      expect(vertex.position[1]).toBeGreaterThanOrEqual(
        first.layout.surface.baseY - first.layout.surface.reliefAmplitude - 1e-10,
      );
      expect(vertex.position[1]).toBeLessThanOrEqual(
        first.layout.surface.baseY + first.layout.surface.reliefAmplitude + 1e-10,
      );
      if (vertex.boundary) {
        expect(vertex.position[1]).toBeCloseTo(
          CAMPEIRA_TRACK_GROUND_CONTACT.surfaceBaseY,
          10,
        );
      }
    });
  });

  it('mantém a única abertura da cerca na borda EAST junto ao brete', () => {
    const bounds = resolveCampeiraTrackBounds(officialTrack());
    const plan = createCampeiraTrackPlan(bounds);
    const { layout, fence } = plan;
    const { opening } = fence;
    const eastX = layout.surface.maxX - layout.fence.inset;
    const eastRuns = layout.fence.runs.filter((run) => run.edge === 'EAST');
    const terminals = fence.posts.filter((post) => post.role === 'FENCE_OPENING_TERMINAL');
    const eastPostsInsideOpening = fence.posts.filter((post) => (
      Math.abs(post.position[0] - eastX) < 1e-8
      && post.position[2] > opening.minZ + 1e-8
      && post.position[2] < opening.maxZ - 1e-8
    ));

    expect(opening.edge).toBe('EAST');
    expect(opening.minZ).toBeLessThan(opening.maxZ);
    expect(opening.maxZ - opening.minZ).toBeCloseTo(opening.width, 12);
    expect((opening.minZ + opening.maxZ) / 2).toBeCloseTo(opening.centerZ, 12);
    expect(eastRuns).toHaveLength(2);
    expect(eastRuns.map((run) => run.id).sort()).toEqual([
      'fence:east-north',
      'fence:east-south',
    ]);
    expect(eastRuns.every((run) => (
      run.from[0] === eastX && run.to[0] === eastX
    ))).toBe(true);
    expect(eastRuns.flatMap((run) => [run.from[1], run.to[1]])).toContain(opening.minZ);
    expect(eastRuns.flatMap((run) => [run.from[1], run.to[1]])).toContain(opening.maxZ);
    expect(terminals).toHaveLength(2);
    expect(terminals.map((post) => post.position[2]).sort((a, b) => a - b)).toEqual([
      opening.minZ,
      opening.maxZ,
    ]);
    expect(terminals.every((post) => Math.abs(post.position[0] - eastX) < 1e-8)).toBe(true);
    expect(eastPostsInsideOpening).toHaveLength(0);
    expect(layout.handlingShelter.centerZ).toBeCloseTo(opening.centerZ, 12);
    expect(layout.handlingShelter.centerX).toBeLessThan(eastX);
  });

  it('contém superfície, cercas e o único abrigo dentro do envelope canônico', () => {
    const bounds = resolveCampeiraTrackBounds(officialTrack());
    const plan = createCampeiraTrackPlan(bounds);

    plan.surface.vertices.forEach((vertex) => {
      expect(campeiraPointIsInsideFootprint(
        plan.layout,
        [vertex.position[0], vertex.position[2]],
      ), `vértice fora do footprint: ${vertex.position.join(',')}`).toBe(true);
    });
    allRepeatedTransforms(plan).forEach((transform) => {
      campeiraTransformFootprintCorners(transform).forEach((corner) => {
        expect(
          campeiraPointIsInsideFootprint(plan.layout, corner),
          `${transform.id} extrapola o footprint em ${corner.join(',')}`,
        ).toBe(true);
      });
    });

    expect(plan.layout.handlingShelter.assetCount).toBe(1);
    expect(plan.shelter.assetCount).toBe(1);
    expect(plan.shelter.roof).toHaveLength(3);
    expect(plan.shelter.steel.length).toBeGreaterThan(0);
    expect(new Set(allRepeatedTransforms(plan).map((transform) => transform.id)).size)
      .toBe(allRepeatedTransforms(plan).length);
  });

  it('respeita budgets de triângulos, instâncias, batches e modo reduzido', () => {
    const bounds = resolveCampeiraTrackBounds(officialTrack());
    const full = createCampeiraTrackPlan(bounds, false);
    const reduced = createCampeiraTrackPlan(bounds, true);

    ([
      [full, CAMPEIRA_TRACK_RENDER_BUDGET.full],
      [reduced, CAMPEIRA_TRACK_RENDER_BUDGET.reduced],
    ] as const).forEach(([plan, budget]) => {
      const shelterMembers = plan.shelter.roof.length
        + plan.shelter.steel.length
        + plan.shelter.penPosts.length
        + plan.shelter.penRails.length;
      expect(plan.surface.segmentsX).toBe(budget.surfaceSegmentsX);
      expect(plan.surface.segmentsZ).toBe(budget.surfaceSegmentsZ);
      expect(plan.diagnostics.surfaceTriangles).toBe(plan.surface.triangleCount);
      expect(plan.diagnostics.surfaceTriangles).toBeLessThanOrEqual(budget.maxSurfaceTriangles);
      expect(plan.fence.posts.length).toBeLessThanOrEqual(budget.maxFencePosts);
      expect(plan.fence.rails.length).toBeLessThanOrEqual(budget.maxFenceRails);
      expect(shelterMembers).toBeLessThanOrEqual(budget.maxShelterMembers);
      expect(plan.diagnostics.repeatedInstances).toBeLessThanOrEqual(budget.maxRepeatedInstances);
      expect(plan.diagnostics.primaryDrawCalls).toBeLessThanOrEqual(budget.maxPrimaryDrawCalls);
      expect(plan.diagnostics.shadowCasterBatches).toBeLessThanOrEqual(
        budget.maxShadowCasterBatches,
      );
    });

    expect(reduced.surface.triangleCount).toBeLessThan(full.surface.triangleCount);
    expect(reduced.diagnostics.shadowCasterBatches).toBe(0);
    expect(CAMPEIRA_TRACK_RENDER_BUDGET.textures).toBe(0);
    expect(CAMPEIRA_TRACK_RENDER_BUDGET.animatedObjects).toBe(0);
  });
});
