import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import {
  CLASSIFICATION_COLORS,
  DEFAULT_REFERENCE_LAYERS,
  ROAD_MATERIAL_COLORS,
  ROAD_SURFACE_PROFILE,
} from '@/features/commercial-map/constants';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import {
  ROAD_INFRASTRUCTURE,
  buildRoadBoundaryRuns,
  buildRoadNetworkGeometries,
  disposeRoadNetworkGeometries,
  findRoadConnections,
  isRoadInfrastructureEntity,
} from '@/features/commercial-map/utils/roadInfrastructure';

function triangleCount(geometry: BufferGeometry | null) {
  if (!geometry) return 0;
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
}

function rgb(hex: string) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

describe('infraestrutura viária do Mapa Comercial', () => {
  const circulation = OFFICIAL_REFERENCE_DATA.entities.filter(isRoadInfrastructureEntity);
  const roads = circulation.filter((entity) => entity.classification === 'ROAD');

  it('preserva o inventário cartográfico oficial sem criar vias artificiais', () => {
    expect(roads).toHaveLength(29);
    expect(circulation.filter((entity) => entity.classification === 'PEDESTRIAN_PATH')).toHaveLength(1);
    expect(circulation.every((entity) => entity.geometry.elevation === 0)).toBe(true);
    expect(roads.every((entity) => entity.geometry.extrusionHeight === ROAD_INFRASTRUCTURE.asphaltHeight)).toBe(true);
  });

  it('não deixa nenhum corredor livre entre quadras vizinhas sem via', () => {
    const bounds = (entity: (typeof OFFICIAL_REFERENCE_DATA)['entities'][number]) => {
      const ring = entity.geometry.coordinates[0];
      return {
        minX: Math.min(...ring.map(([x]) => x)),
        maxX: Math.max(...ring.map(([x]) => x)),
        minZ: Math.min(...ring.map(([, z]) => z)),
        maxZ: Math.max(...ring.map(([, z]) => z)),
      };
    };
    const roadBoxes = OFFICIAL_REFERENCE_DATA.entities.filter(isRoadInfrastructureEntity).map(bounds);
    const quadras = OFFICIAL_REFERENCE_DATA.entities
      .filter((entity) => entity.classification === 'QUADRA')
      .map((entity) => ({ id: entity.publicIdentifier, ...bounds(entity) }));
    const covered = (x: number, z: number) => roadBoxes.some((box) => (
      box.minX <= x && box.maxX >= x && box.minZ <= z && box.maxZ >= z
    ));
    const uncovered: string[] = [];

    quadras.forEach((first, index) => {
      quadras.slice(index + 1).forEach((second) => {
        const overlapX = Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX);
        const overlapZ = Math.min(first.maxZ, second.maxZ) - Math.max(first.minZ, second.minZ);
        const check = (samples: Array<[number, number]>) => {
          const hits = samples.filter(([x, z]) => covered(x, z)).length;
          if (hits / samples.length < 0.95) uncovered.push(`${first.id} | ${second.id}`);
        };

        if (overlapX >= 1) {
          const gap = second.minZ > first.maxZ
            ? [first.maxZ, second.minZ]
            : first.minZ > second.maxZ ? [second.maxZ, first.minZ] : null;
          if (!gap || gap[1] - gap[0] < 0.3 || gap[1] - gap[0] > 4) return;
          const z = (gap[0] + gap[1]) / 2;
          const x0 = Math.max(first.minX, second.minX);
          const x1 = Math.min(first.maxX, second.maxX);
          check(Array.from({ length: 41 }, (_, step) => [x0 + ((x1 - x0) * step) / 40, z]));
          return;
        }

        if (overlapZ >= 1) {
          const gap = second.minX > first.maxX
            ? [first.maxX, second.minX]
            : first.minX > second.maxX ? [second.maxX, first.minX] : null;
          if (!gap || gap[1] - gap[0] < 0.3 || gap[1] - gap[0] > 4) return;
          const x = (gap[0] + gap[1]) / 2;
          const z0 = Math.max(first.minZ, second.minZ);
          const z1 = Math.min(first.maxZ, second.maxZ);
          check(Array.from({ length: 41 }, (_, step) => [x, z0 + ((z1 - z0) * step) / 40]));
        }
      });
    });

    expect(uncovered).toEqual([]);
  });

  it('mantém os novos corredores dentro das faixas reservadas, sem invadir lotes', () => {
    const newCorridors = ['RUA-URUGUAI-LESTE', 'RUA-ARGENTINA-LESTE', 'RUA-MONTEVIDEU-SUL', 'RUA-INTERNA-OESTE', 'RUA-INTERNA-QUADRA-G', 'RUA-INTERNA-QUADRA-T', 'RUA-LESTE-EXPORURAL', 'RUA-UBIRETAMA-LATERAL-R55'];
    const box = (ring: readonly (readonly [number, number])[] | number[][]) => {
      const points = ring as number[][];
      return {
        minX: Math.min(...points.map(([x]) => x)),
        maxX: Math.max(...points.map(([x]) => x)),
        minZ: Math.min(...points.map(([, z]) => z)),
        maxZ: Math.max(...points.map(([, z]) => z)),
      };
    };
    const lots = OFFICIAL_REFERENCE_DATA.entities
      .filter((entity) => entity.classification === 'SELLABLE_LOT')
      .map((entity) => box(entity.geometry.coordinates[0]));

    newCorridors.forEach((identifier) => {
      const entity = OFFICIAL_REFERENCE_DATA.entities.find((item) => item.publicIdentifier === identifier);
      expect(entity, identifier).toBeDefined();
      expect(entity!.classification).toBe('ROAD');
      expect(entity!.geometry.elevation).toBe(0);
      expect(entity!.geometry.extrusionHeight).toBe(ROAD_INFRASTRUCTURE.asphaltHeight);
      const corridor = box(entity!.geometry.coordinates[0]);
      const invades = lots.some((lot) => (
        corridor.minX < lot.maxX - 0.01 && corridor.maxX > lot.minX + 0.01
        && corridor.minZ < lot.maxZ - 0.01 && corridor.maxZ > lot.minZ + 0.01
      ));
      expect(invades, `${identifier} não pode invadir lotes`).toBe(false);
    });
  });

  it('pavimenta as conexões reportadas sem pavimento', () => {
    const roadBoxes = circulation.map((entity) => {
      const ring = entity.geometry.coordinates[0] as unknown as number[][];
      return {
        minX: Math.min(...ring.map(([x]) => x)),
        maxX: Math.max(...ring.map(([x]) => x)),
        minZ: Math.min(...ring.map(([, z]) => z)),
        maxZ: Math.max(...ring.map(([, z]) => z)),
      };
    });
    const covered = (x: number, z: number) => roadBoxes.some((box) => (
      box.minX <= x && box.maxX >= x && box.minZ <= z && box.maxZ >= z
    ));

    ([
      ['eixo Q-E-13 → Q-R-02 ao lado do Mirante', 13.4, -9.6],
      ['eixo Q-E-13 → Q-R-02 na altura da Quadra E', 13.4, 5.4],
      ['corredor oeste das Quadras F e G', 2.4, -2.0],
      ['corredor interno da Quadra G', 5.1, -5.3],
      ['corredor Q-V-06 → Q-T-12', -34.2, -4.5],
      ['faixa leste Q-R-55 → Q-S-19', 56.8, -30.0],
      ['Rua Ubiretama ao lado do Q-R-55', 57.5, -23.0],
      ['encontro da Ubiretama com a Rua Gustavo Bessel', 57.5, -19.9],
    ] as const).forEach(([label, x, z]) => {
      expect(covered(x, z), label).toBe(true);
    });
  });



  it('usa asfalto cinza-escuro neutro e uma textura otimizada', () => {
    const [red, green, blue] = rgb(ROAD_MATERIAL_COLORS.asphalt);
    const circulationLayer = DEFAULT_REFERENCE_LAYERS.find((layer) => layer.key === 'circulation');

    (['asphalt', 'gutter', 'selected', 'selectionGlow', 'match'] as const).forEach((key) => {
      const [stateRed, stateGreen, stateBlue] = rgb(ROAD_MATERIAL_COLORS[key]);
      expect(stateRed, `${key} não pode puxar para marrom`).toBeLessThanOrEqual(stateGreen);
      expect(stateGreen, `${key} deve manter viés neutro/frio`).toBeLessThanOrEqual(stateBlue);
    });

    expect(red).toBeLessThanOrEqual(green);
    expect(green).toBeLessThanOrEqual(blue);
    expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeLessThanOrEqual(10);
    expect((red + green + blue) / 3).toBeGreaterThanOrEqual(70);
    expect((red + green + blue) / 3).toBeLessThanOrEqual(90);
    expect(CLASSIFICATION_COLORS.ROAD).toBe(ROAD_MATERIAL_COLORS.asphalt);
    expect(circulationLayer?.color).toBe(ROAD_MATERIAL_COLORS.asphalt);
    expect(ROAD_SURFACE_PROFILE.textureSize).toBeLessThanOrEqual(128);
    expect(ROAD_SURFACE_PROFILE.asphaltRoughness).toBeGreaterThanOrEqual(0.9);
    expect(ROAD_SURFACE_PROFILE.asphaltBumpScale).toBeLessThanOrEqual(0.008);
  });

  it('mantém somente a microfresta herdada fora da Exporural', () => {
    const byId = new Map(roads.map((entity) => [entity.id, entity.name]));
    const microGaps = findRoadConnections(roads)
      .filter((connection) => connection.kind === 'micro-gap')
      .map((connection) => [byId.get(connection.firstId), byId.get(connection.secondId)].sort().join(' + '))
      .sort();

    expect(microGaps).toEqual([
      'Rua Argentina + Rua Montevidéu',
    ]);
  });

  it('materializa o grafo contínuo de A8/A9 e das ruas internas da Exporural', () => {
    const byId = new Map(roads.map((entity) => [entity.id, entity.name]));
    const connections = new Set(findRoadConnections(roads)
      .filter((connection) => connection.kind === 'overlap')
      .map((connection) => [byId.get(connection.firstId), byId.get(connection.secondId)].sort().join(' + ')));

    [
      'Rua Bruno Schwartz + Rua Pastor Albert Lehenbauer',
      'Rua Johan Muller + Rua Pastor Albert Lehenbauer',
      'Rua Gustavo Bessel + Rua Pastor Albert Lehenbauer',
      'Rua 15 de Novembro + Rua Bruno Schwartz',
      'Rua 15 de Novembro + Rua Johan Muller',
      'Rua 15 de Novembro + Rua Gustavo Bessel',
      'Rua 15 de Novembro + Rua Emanuel Brachmann',
    ].forEach((edge) => expect(connections.has(edge), edge).toBe(true));
  });

  it('mantém acessos abertos e interrompe meios-fios nas interseções', () => {
    const runs = buildRoadBoundaryRuns(circulation);
    expect(runs.length).toBeGreaterThan(20);
    expect(runs.every((run) => run.from[0] !== run.to[0] || run.from[1] !== run.to[1])).toBe(true);
    expect(runs.every((run) => run.surfaceHeight > 0)).toBe(true);
  });

  it('gera uma rede mesclada dentro do orçamento gráfico e sem mutar os dados oficiais', () => {
    const sourceSnapshot = JSON.stringify(circulation);
    const detailed = buildRoadNetworkGeometries(circulation);
    const reduced = buildRoadNetworkGeometries(circulation, { reducedGraphics: true });

    try {
      expect(detailed.asphalt).not.toBeNull();
      expect(detailed.pedestrian).not.toBeNull();
      expect(detailed.intersections).not.toBeNull();
      expect(detailed.gutters).not.toBeNull();
      expect(detailed.curbs).not.toBeNull();
      expect(detailed.diagnostics).toMatchObject({
        roadCount: 29,
        pedestrianPathCount: 1,
        microGapCount: 1,
      });
      expect(detailed.diagnostics.estimatedBaseDrawCalls)
        .toBeLessThanOrEqual(ROAD_INFRASTRUCTURE.maximumBaseDrawCalls);

      const detailedTriangles = [
        detailed.asphalt,
        detailed.pedestrian,
        detailed.intersections,
        detailed.gutters,
        detailed.curbs,
      ].reduce((total, geometry) => total + triangleCount(geometry), 0);
      const reducedTriangles = [
        reduced.asphalt,
        reduced.pedestrian,
        reduced.intersections,
        reduced.gutters,
        reduced.curbs,
      ].reduce((total, geometry) => total + triangleCount(geometry), 0);

      expect(detailedTriangles).toBeLessThan(5_000);
      expect(reducedTriangles).toBeLessThan(detailedTriangles);
      expect(JSON.stringify(circulation)).toBe(sourceSnapshot);
    } finally {
      disposeRoadNetworkGeometries(detailed);
      disposeRoadNetworkGeometries(reduced);
    }
  });
});
