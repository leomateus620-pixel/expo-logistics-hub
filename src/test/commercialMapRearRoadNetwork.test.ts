import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_DATA, officialPdfPointToLocal } from '@/features/commercial-map/data/officialReference2026';
import {
  PROTECTED_ROAD_IDENTIFIERS,
  REAR_PARK_ROAD_NETWORK,
  RUA_BRASILIA_JOIN_POINT,
  rearRoadCorridors,
  rearRoadLocalPath,
} from '@/features/commercial-map/data/rearParkRoadNetwork';
import {
  REAR_ROAD_BUDGET,
  buildRearRoadNetworkGeometries,
  disposeRearRoadNetworkGeometries,
  distanceToPath,
  sampleRearRoadCenterline,
} from '@/features/commercial-map/utils/rearRoadNetwork';
import {
  REAR_STRUCTURE_EXCLUSIONS,
  buildRearPoleInstances,
  buildRearTreeInstances,
  sourceBoundsToLocal,
} from '@/features/commercial-map/data/rearParkEnvironment';

describe('área posterior do parque — BR-472 e Rua Brasília', () => {
  it('mantém uma única Rua Brasília, continuada a partir da via oficial', () => {
    const official = OFFICIAL_REFERENCE_DATA.entities.filter(
      (entity) => entity.name.toLowerCase().includes('brasília'),
    );
    expect(official).toHaveLength(1);

    const continuations = REAR_PARK_ROAD_NETWORK.filter(
      (road) => road.name.toLowerCase().includes('brasília'),
    );
    expect(continuations).toHaveLength(1);
    expect(continuations[0].connections).toContain('RUA-BRASILIA');

    const [joinX, joinZ] = officialPdfPointToLocal(RUA_BRASILIA_JOIN_POINT);
    const [startX, startZ] = rearRoadLocalPath(continuations[0])[0];
    expect(Math.hypot(startX - joinX, startZ - joinZ)).toBeLessThan(1e-6);

    // O ponto de emenda encosta na extremidade sul do polígono oficial.
    const officialSouthEdge = officialPdfPointToLocal([3964, 4210]);
    expect(Math.abs(joinZ - officialSouthEdge[1])).toBeLessThan(0.15);
  });

  it('não altera nenhuma coordenada das vias protegidas da Exporural', () => {
    const snapshot = JSON.stringify(
      OFFICIAL_REFERENCE_DATA.entities.filter(
        (entity) => PROTECTED_ROAD_IDENTIFIERS.includes(entity.publicIdentifier),
      ),
    );

    const network = buildRearRoadNetworkGeometries();
    try {
      const protectedEntities = OFFICIAL_REFERENCE_DATA.entities.filter(
        (entity) => PROTECTED_ROAD_IDENTIFIERS.includes(entity.publicIdentifier),
      );
      expect(protectedEntities.length).toBeGreaterThan(0);
      expect(JSON.stringify(protectedEntities)).toBe(snapshot);
      expect(
        REAR_PARK_ROAD_NETWORK.some((road) => PROTECTED_ROAD_IDENTIFIERS.includes(road.id)),
      ).toBe(false);
    } finally {
      disposeRearRoadNetworkGeometries(network);
    }
  });

  it('gera eixos contínuos e suaves, sem quinas duras', () => {
    REAR_PARK_ROAD_NETWORK.forEach((road) => {
      const samples = sampleRearRoadCenterline(rearRoadLocalPath(road), 12);
      expect(samples.length).toBeGreaterThan(road.sourcePath.length);
      for (let index = 0; index < samples.length - 1; index += 1) {
        const step = Math.hypot(
          samples[index + 1][0] - samples[index][0],
          samples[index + 1][1] - samples[index][1],
        );
        expect(step).toBeGreaterThan(0);
        expect(step).toBeLessThan(1.5);
      }
    });
  });

  it('respeita o orçamento gráfico e reduz custo no modo econômico', () => {
    const detailed = buildRearRoadNetworkGeometries();
    const reduced = buildRearRoadNetworkGeometries(undefined, { reducedGraphics: true });

    try {
      expect(detailed.highway).not.toBeNull();
      expect(detailed.parkAsphalt).not.toBeNull();
      expect(detailed.shoulders).not.toBeNull();
      expect(detailed.markings).not.toBeNull();
      expect(detailed.diagnostics.estimatedBaseDrawCalls)
        .toBeLessThanOrEqual(REAR_ROAD_BUDGET.maximumBaseDrawCalls);
      expect(detailed.diagnostics.triangleCount).toBeLessThan(REAR_ROAD_BUDGET.maximumTriangles);
      expect(reduced.diagnostics.triangleCount).toBeLessThan(detailed.diagnostics.triangleCount);
    } finally {
      disposeRearRoadNetworkGeometries(detailed);
      disposeRearRoadNetworkGeometries(reduced);
    }
  });

  it('não faz vias atravessarem estruturas oficiais protegidas', () => {
    const corridors = rearRoadCorridors();
    REAR_STRUCTURE_EXCLUSIONS.forEach((bounds) => {
      const box = sourceBoundsToLocal(bounds);
      corridors.forEach((corridor) => {
        const crossing = corridor.path.some(
          (point) => point[0] > box.minX && point[0] < box.maxX
            && point[1] > box.minZ && point[1] < box.maxZ,
        );
        if (crossing) {
          // Apenas as vias que declaram conexão com a avenida oficial podem
          // tangenciar o corredor da Avenida dos Imigrantes.
          expect(corridor.id).toMatch(/RUA-BRASILIA-CONTINUACAO|RUA-ETNIAS-TRANSVERSAL|RUA-CIRCULACAO-LOTES/);
        }
      });
    });
  });

  it('mantém vegetação e postes fora do asfalto e dentro do orçamento', () => {
    const corridors = rearRoadCorridors();
    const trees = buildRearTreeInstances();
    const reducedTrees = buildRearTreeInstances(true);

    expect(trees.length).toBeGreaterThan(80);
    expect(trees.length).toBeLessThanOrEqual(620);
    expect(reducedTrees.length).toBeLessThan(trees.length);
    expect(new Set(trees.map((tree) => tree.scale.toFixed(4))).size).toBeGreaterThan(40);

    trees.forEach((tree) => {
      corridors.forEach((corridor) => {
        expect(distanceToPath([tree.x, tree.z], corridor.path))
          .toBeGreaterThan(corridor.halfWidth);
      });
    });

    const poles = buildRearPoleInstances();
    expect(poles.length).toBeGreaterThan(0);
    expect(poles.length).toBeLessThanOrEqual(48);
    expect(buildRearPoleInstances(true)).toHaveLength(0);
  });
});
