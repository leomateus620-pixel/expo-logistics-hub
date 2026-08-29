import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_DATA, officialPdfPointToLocal } from '@/features/commercial-map/data/officialReference2026';
import {
  ETHNIC_QUARTER_SOURCE_BOUNDS,
  PROTECTED_ROAD_IDENTIFIERS,
  REAR_PARK_ROAD_NETWORK,
  REMOVED_REAR_ROAD_IDENTIFIERS,
  RUA_BRASILIA_JOIN_POINT,
  rearRoadCorridors,
  rearRoadLocalPath,
  rearRoadLocalWidth,
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
import { REAR_PARK_GATE_5, buildGate5Geometry } from '@/features/commercial-map/data/rearParkGate5';
import {
  REAR_CALIBRATION_LANDMARKS,
  rearReferenceTransform,
} from '@/features/commercial-map/utils/rearSpatialCalibration';

const ethnicBox = sourceBoundsToLocal(ETHNIC_QUARTER_SOURCE_BOUNDS);

describe('área posterior do parque — correção espacial (Portão 5 → Rua Brasília → BR-472)', () => {
  it('remove definitivamente as vias inventadas atrás das Etnias', () => {
    const ids = REAR_PARK_ROAD_NETWORK.map((road) => road.id);
    REMOVED_REAR_ROAD_IDENTIFIERS.forEach((removed) => {
      expect(ids).not.toContain(removed);
    });

    rearRoadCorridors().forEach((corridor) => {
      corridor.path.forEach((point) => {
        const insideEthnicQuarter = point[0] > ethnicBox.minX && point[0] < ethnicBox.maxX
          && point[1] > ethnicBox.minZ && point[1] < ethnicBox.maxZ;
        expect(insideEthnicQuarter).toBe(false);
      });
    });
  });

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
    expect(continuations[0].connections).toContain('PORTAO-5');
    expect(continuations[0].connections).toContain('ACESSO-BR-472');

    const [joinX, joinZ] = officialPdfPointToLocal(RUA_BRASILIA_JOIN_POINT);
    const [startX, startZ] = rearRoadLocalPath(continuations[0])[0];
    expect(Math.hypot(startX - joinX, startZ - joinZ)).toBeLessThan(1e-6);

    const officialSouthEdge = officialPdfPointToLocal([3964, 4210]);
    expect(Math.abs(joinZ - officialSouthEdge[1])).toBeLessThan(0.15);
  });

  it('encadeia Portão 5 → continuação → acesso → BR-472 sem fragmentos soltos', () => {
    const byId = new Map(REAR_PARK_ROAD_NETWORK.map((road) => [road.id, road]));
    const continuation = byId.get('RUA-BRASILIA-CONTINUACAO');
    const access = byId.get('ACESSO-BR-472');
    const highway = byId.get('BR-472');
    expect(continuation && access && highway).toBeTruthy();

    const gate = buildGate5Geometry();
    const continuationPath = rearRoadLocalPath(continuation!);
    expect(distanceToPath([gate.center[0], gate.center[1]], continuationPath))
      .toBeLessThan(rearRoadLocalWidth(continuation!));
    expect(REAR_PARK_GATE_5.connections).toContain('RUA-BRASILIA-CONTINUACAO');

    const continuationEnd = continuationPath[continuationPath.length - 1];
    const accessPath = rearRoadLocalPath(access!);
    expect(Math.hypot(continuationEnd[0] - accessPath[0][0], continuationEnd[1] - accessPath[0][1]))
      .toBeLessThan(1e-6);

    const accessEnd = accessPath[accessPath.length - 1];
    const highwayPath = rearRoadLocalPath(highway!);
    expect(distanceToPath(accessEnd, highwayPath)).toBeLessThan(rearRoadLocalWidth(highway!));

    // Nenhum eixo desconectado: toda via referencia outra via da rede ou oficial.
    REAR_PARK_ROAD_NETWORK.forEach((road) => {
      expect(road.connections.length).toBeGreaterThan(0);
    });
  });

  it('respeita a hierarquia de largura BR-472 > acesso > via interna', () => {
    const width = (id: string) => rearRoadLocalWidth(
      REAR_PARK_ROAD_NETWORK.find((road) => road.id === id)!,
    );
    expect(width('BR-472')).toBeGreaterThan(width('ACESSO-BR-472'));
    expect(width('ACESSO-BR-472')).toBeGreaterThan(width('RUA-BRASILIA-CONTINUACAO'));
  });

  it('mantém a BR-472 fora do parque e do quarteirão das Etnias', () => {
    const highway = REAR_PARK_ROAD_NETWORK.find((road) => road.id === 'BR-472')!;
    const path = rearRoadLocalPath(highway);
    const halfWidth = rearRoadLocalWidth(highway) / 2;

    const ethnicCorners: Array<[number, number]> = [
      [ethnicBox.minX, ethnicBox.minZ],
      [ethnicBox.maxX, ethnicBox.minZ],
      [ethnicBox.minX, ethnicBox.maxZ],
      [ethnicBox.maxX, ethnicBox.maxZ],
    ];
    ethnicCorners.forEach((corner) => {
      expect(distanceToPath(corner, path)).toBeGreaterThan(halfWidth + 1);
    });

    // A rodovia fica inteiramente ao sul do limite oficial do parque.
    const parkSouthEdge = officialPdfPointToLocal([3964, 5060])[1];
    path.forEach((point) => expect(point[1]).toBeGreaterThan(parkSouthEdge));
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

  it('calibra a área pelos cinco marcos fixos com resíduo desprezível', () => {
    expect(REAR_CALIBRATION_LANDMARKS).toHaveLength(5);
    const transform = rearReferenceTransform();
    expect(transform.maximumResidual).toBeLessThan(1e-6);
    expect(transform.scale).toBeGreaterThan(0);
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
          // Apenas a continuação oficial pode tangenciar o corredor da
          // Avenida dos Imigrantes, no ponto do Portão 5.
          expect(corridor.id).toBe('RUA-BRASILIA-CONTINUACAO');
        }
      });
    });
  });

  it('mantém vegetação e postes fora do asfalto, das Etnias e dentro do orçamento', () => {
    const corridors = rearRoadCorridors();
    const trees = buildRearTreeInstances();
    const reducedTrees = buildRearTreeInstances(true);

    expect(trees.length).toBeGreaterThan(80);
    expect(trees.length).toBeLessThanOrEqual(520);
    expect(reducedTrees.length).toBeLessThan(trees.length);
    expect(new Set(trees.map((tree) => tree.scale.toFixed(4))).size).toBeGreaterThan(40);

    trees.forEach((tree) => {
      expect(
        tree.x > ethnicBox.minX && tree.x < ethnicBox.maxX
        && tree.z > ethnicBox.minZ && tree.z < ethnicBox.maxZ,
      ).toBe(false);
      corridors.forEach((corridor) => {
        expect(distanceToPath([tree.x, tree.z], corridor.path))
          .toBeGreaterThan(corridor.halfWidth);
      });
    });

    const poles = buildRearPoleInstances();
    expect(poles.length).toBeGreaterThan(0);
    expect(poles.length).toBeLessThanOrEqual(32);
    expect(buildRearPoleInstances(true)).toHaveLength(0);
  });
});
