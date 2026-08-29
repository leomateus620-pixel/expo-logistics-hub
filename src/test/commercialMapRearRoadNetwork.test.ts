import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import {
  EXPORURAL_GEOMETRY_REVISION,
  EXPORURAL_LOT_REFERENCES,
  EXPORURAL_ROAD_IDENTIFIERS,
} from '@/features/commercial-map/data/exporuralReference2026';
import {
  ETHNIC_QUARTER_SOURCE_BOUNDS,
  GENERATED_REAR_ROAD_SEGMENTS,
  OFFICIAL_GATE_5_ACCESS_POINT,
  OFFICIAL_GATE_5_CENTER,
  PROTECTED_ROAD_IDENTIFIERS,
  REAR_PARK_ROAD_NETWORK,
  REAR_ROAD_NODES,
  REMOVED_REAR_ROAD_IDENTIFIERS,
  REPLACED_OFFICIAL_ROAD_IDENTIFIERS,
  roadGraphHasPath,
  rearRoadCorridors,
  rearRoadLocalPath,
  rearRoadLocalWidth,
} from '@/features/commercial-map/data/rearParkRoadNetwork';
import {
  REAR_ENVIRONMENT_BUDGET,
  REAR_STRUCTURE_EXCLUSIONS,
  REAR_TERRAIN_PATCHES,
  buildRearPoleInstances,
  buildRearTreeInstances,
  sourceBoundsToLocal,
} from '@/features/commercial-map/data/rearParkEnvironment';
import {
  REAR_ROAD_BUDGET,
  buildRearRoadNetworkGeometries,
  disposeRearRoadNetworkGeometries,
  distanceToPath,
  sampleRearRoadCenterline,
} from '@/features/commercial-map/utils/rearRoadNetwork';
import {
  REAR_CALIBRATED_AXES,
  REAR_SATELLITE_REFERENCES,
  rearCalibrationDiagnostics,
  projectSatellitePixelToLocal,
} from '@/features/commercial-map/utils/rearSpatialCalibration';
import {
  buildEntityExplorerIndex,
  filterAndSortEntityExplorerItems,
} from '@/features/commercial-map/utils/entityExplorer';
import { isSelectableMapClassification } from '@/features/commercial-map/utils/interaction';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';

type Point2 = readonly [number, number];

function normalizedText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function pointInPolygon(point: Point2, polygon: readonly Point2[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [xi, zi] = polygon[index];
    const [xj, zj] = polygon[previous];
    const intersects = ((zi > point[1]) !== (zj > point[1]))
      && point[0] < ((xj - xi) * (point[1] - zi)) / ((zj - zi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToPolygon(point: Point2, polygon: readonly Point2[]) {
  if (pointInPolygon(point, polygon)) return 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSquared));
    nearest = Math.min(nearest, Math.hypot(point[0] - (a[0] + dx * t), point[1] - (a[1] + dz * t)));
  }
  return nearest;
}

function officialEntity(identifier: string) {
  const entities = OFFICIAL_REFERENCE_DATA.entities.filter(
    (entity) => entity.publicIdentifier.toLocaleUpperCase('pt-BR') === identifier,
  );
  expect(entities, `entidade oficial ${identifier}`).toHaveLength(1);
  return entities[0];
}

const ethnicBounds = sourceBoundsToLocal(ETHNIC_QUARTER_SOURCE_BOUNDS);

describe('área posterior — identidade oficial do Portão 5', () => {
  it('mantém exatamente uma entidade A5, um nome oficial e uma entrada de busca', () => {
    const a5 = officialEntity('A5');
    expect(a5.name).toBe('Portão 5 — saída de veículos de expositores e visitantes');
    expect(a5.classification).toBe('GATE');
    expect(isSelectableMapClassification(a5.classification)).toBe(true);

    const namedGate5 = OFFICIAL_REFERENCE_DATA.entities.filter((entity) => (
      normalizedText(entity.name).startsWith('portao 5')
    ));
    expect(namedGate5).toHaveLength(1);

    const search = filterAndSortEntityExplorerItems(
      buildEntityExplorerIndex(OFFICIAL_REFERENCE_DATA.entities, OFFICIAL_REFERENCE_DATA.lots),
      {
        query: 'A5',
        statusFilters: [],
        classificationFilters: [],
        locationFilter: null,
        verificationFilters: [],
        sortOrder: 'relevance',
      },
    );
    expect(search).toHaveLength(1);
    expect(search[0].entity.id).toBe(a5.id);
  });

  it('usa a borda da geometria A5 como endpoint físico e abre o painel dessa entidade', () => {
    const a5 = officialEntity('A5');
    const ring = a5.geometry.coordinates[0];
    expect(ring.some(([x, z]) => Math.hypot(
      x - OFFICIAL_GATE_5_ACCESS_POINT[0], z - OFFICIAL_GATE_5_ACCESS_POINT[1],
    ) < 1e-8)).toBe(true);
    expect(Math.hypot(
      OFFICIAL_GATE_5_ACCESS_POINT[0] - OFFICIAL_GATE_5_CENTER[0],
      OFFICIAL_GATE_5_ACCESS_POINT[1] - OFFICIAL_GATE_5_CENTER[1],
    )).toBeGreaterThan(0.4);
    expect(REAR_ROAD_NODES['gate-5'].officialEntityIdentifier).toBe('A5');
    expect(REAR_ROAD_NODES['gate-5'].position).toEqual([
      OFFICIAL_GATE_5_ACCESS_POINT[0], 0, OFFICIAL_GATE_5_ACCESS_POINT[1],
    ]);

    const previous = useCommercialMapStore.getState();
    useCommercialMapStore.setState({ lunarLaunchPhase: 'idle', lunarLaunchReturning: false });
    useCommercialMapStore.getState().setSelectedEntityId(a5.id);
    expect(useCommercialMapStore.getState().selectedEntityId).toBe(a5.id);
    expect(useCommercialMapStore.getState().activePanel).toBe('details');
    useCommercialMapStore.setState({
      selectedEntityId: previous.selectedEntityId,
      activePanel: previous.activePanel,
      lunarLaunchPhase: previous.lunarLaunchPhase,
      lunarLaunchReturning: previous.lunarLaunchReturning,
    });
  });

  it('remove o componente Lovable duplicado e seus identificadores de runtime', () => {
    const runtimeSources = [
      'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
      'src/features/commercial-map/data/rearParkRoadNetwork.ts',
    ].map((file) => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n');
    expect(runtimeSources).not.toContain('RearParkGate5');
    expect(runtimeSources).not.toContain('rearParkGate5');
    expect(runtimeSources).not.toContain('PORTAO-5');
  });
});

describe('área posterior — topologia e proteção espacial', () => {
  it('forma o caminho BR-472 → Rua Brasília → A5 e exclui completamente o Portão 3', () => {
    expect(roadGraphHasPath('br472', 'A5')).toBe(true);
    expect(roadGraphHasPath('brasilia', 'A5')).toBe(true);

    const serializedGraph = JSON.stringify({ nodes: REAR_ROAD_NODES, roads: REAR_PARK_ROAD_NETWORK });
    expect(serializedGraph).not.toMatch(/port[aã]o-?3|\bA3\b/i);
    expect(REAR_PARK_ROAD_NETWORK.some((road) => road.from === 'gate-5' || road.to === 'gate-5')).toBe(true);

    const a3Ring = officialEntity('A3').geometry.coordinates[0] as Point2[];
    GENERATED_REAR_ROAD_SEGMENTS.forEach((road) => {
      const clearance = road.width / 2 + road.shoulderWidth;
      sampleRearRoadCenterline(rearRoadLocalPath(road), 8).forEach((point) => {
        expect(distanceToPolygon(point, a3Ring)).toBeGreaterThan(clearance);
      });
    });
  });

  it('mantém uma única cadeia semântica Rua Brasília, sem paralela inventada', () => {
    const official = OFFICIAL_REFERENCE_DATA.entities.filter(
      (entity) => entity.publicIdentifier === 'RUA-BRASILIA',
    );
    expect(official).toHaveLength(1);

    const brasilia = REAR_PARK_ROAD_NETWORK.filter((road) => road.roadId === 'RUA-BRASILIA');
    expect(brasilia.length).toBeGreaterThanOrEqual(3);
    expect(new Set(brasilia.map((road) => road.roadId))).toEqual(new Set(['RUA-BRASILIA']));
    expect(brasilia.filter((road) => road.presentation === 'generated-surface')).toHaveLength(1);
    expect(brasilia.some((road) => road.from === 'gate-5')).toBe(true);
    expect(brasilia.some((road) => road.to === 'brasilia-arena')).toBe(true);
  });

  it('retém todas as travas contra as vias removidas', () => {
    expect(REMOVED_REAR_ROAD_IDENTIFIERS).toEqual([
      'RUA-POSTERIOR-ETNIAS',
      'RUA-ETNIAS-TRANSVERSAL',
      'RUA-RETAGUARDA-ARENA',
      'RUA-CIRCULACAO-LOTES',
      'ACESSO-ALCA-LESTE',
      'RS-472-CONTINUACAO',
    ]);
    const ids = REAR_PARK_ROAD_NETWORK.flatMap((road) => [road.id, road.roadId]);
    REMOVED_REAR_ROAD_IDENTIFIERS.forEach((identifier) => expect(ids).not.toContain(identifier));
  });

  it('substitui somente a superfície genérica da BR e preserva as demais vias oficiais', () => {
    expect(REPLACED_OFFICIAL_ROAD_IDENTIFIERS).toEqual(['RODOVIA-RS-472']);
    expect(PROTECTED_ROAD_IDENTIFIERS).toEqual(expect.arrayContaining([
      ...EXPORURAL_ROAD_IDENTIFIERS,
      'RUA-BRASILIA',
      'AV-IMIGRANTES',
      'RODOVIA-RS-472',
    ]));
    expect(REAR_PARK_ROAD_NETWORK.filter((road) => road.roadId === 'RODOVIA-RS-472')).toHaveLength(2);
  });

  it('respeita BR > acesso > Rua Brasília e conecta exatamente os nós declarados', () => {
    const highway = REAR_PARK_ROAD_NETWORK.find((road) => road.id === 'br472-west-junction')!;
    const access = REAR_PARK_ROAD_NETWORK.find((road) => road.id === 'a5-br472-access')!;
    const brasilia = REAR_PARK_ROAD_NETWORK.find((road) => road.id === 'brasilia-a5-perimeter')!;
    expect(rearRoadLocalWidth(highway)).toBeGreaterThan(rearRoadLocalWidth(access));
    expect(rearRoadLocalWidth(access)).toBeGreaterThan(rearRoadLocalWidth(brasilia));
    [highway, access, brasilia].forEach((road) => {
      expect(road.controlPoints[0]).toEqual(REAR_ROAD_NODES[road.from].position);
      expect(road.controlPoints.at(-1)).toEqual(REAR_ROAD_NODES[road.to].position);
    });
  });

  it('mantém a BR-472 fora do volume de exclusão das Etnias', () => {
    const highwayCorridors = rearRoadCorridors().filter((corridor) => corridor.roadId === 'RODOVIA-RS-472');
    const ethnicCorners: Point2[] = [
      [ethnicBounds.minX, ethnicBounds.minZ],
      [ethnicBounds.maxX, ethnicBounds.minZ],
      [ethnicBounds.maxX, ethnicBounds.maxZ],
      [ethnicBounds.minX, ethnicBounds.maxZ],
    ];
    highwayCorridors.forEach((corridor) => {
      ethnicCorners.forEach((corner) => {
        expect(distanceToPath(corner, corridor.path)).toBeGreaterThan(corridor.halfWidth);
      });
      corridor.path.forEach((point) => expect(pointInPolygon(point, ethnicCorners)).toBe(false));
    });
  });

  it('não atravessa Arena, C1, campo, estacionamento ou lotes protegidos', () => {
    const protectedPolygons: Point2[][] = REAR_STRUCTURE_EXCLUSIONS
      .filter((_, index) => index !== 4 && index !== 5)
      .map((bounds) => {
        const local = sourceBoundsToLocal(bounds);
        return [
          [local.minX, local.minZ], [local.maxX, local.minZ],
          [local.maxX, local.maxZ], [local.minX, local.maxZ],
        ];
      });
    protectedPolygons.push(officialEntity('EST-VIS').geometry.coordinates[0] as Point2[]);
    GENERATED_REAR_ROAD_SEGMENTS.forEach((road) => {
      const samples = sampleRearRoadCenterline(rearRoadLocalPath(road), 8);
      const clearance = road.width / 2;
      protectedPolygons.forEach((polygon, protectedIndex) => {
        const minimumDistance = Math.min(...samples.map((point) => distanceToPolygon(point, polygon)));
        expect(
          minimumDistance,
          `${road.id} deve manter clearance do volume protegido ${protectedIndex}`,
        ).toBeGreaterThan(clearance);
      });
    });
  });

  it('não muta a geometria nem as ruas oficiais da Exporural', () => {
    expect(EXPORURAL_GEOMETRY_REVISION).toBe('2026.4-exporural.1');
    const snapshot = JSON.stringify({ lots: EXPORURAL_LOT_REFERENCES, roads: EXPORURAL_ROAD_IDENTIFIERS });
    const geometries = buildRearRoadNetworkGeometries();
    try {
      expect(JSON.stringify({ lots: EXPORURAL_LOT_REFERENCES, roads: EXPORURAL_ROAD_IDENTIFIERS })).toBe(snapshot);
      expect(REAR_PARK_ROAD_NETWORK.some((road) => (
        (EXPORURAL_ROAD_IDENTIFIERS as readonly string[]).includes(road.roadId)
      ))).toBe(false);
    } finally {
      disposeRearRoadNetworkGeometries(geometries);
    }
  });
});

describe('área posterior — calibração, geometria e orçamento', () => {
  it('resolve ambos os satélites com dez controles e resíduo inferior a 2% da diagonal', () => {
    (['annex-4', 'annex-5'] as const).forEach((referenceId) => {
      expect(REAR_SATELLITE_REFERENCES[referenceId].controls).toHaveLength(10);
      const diagnostics = rearCalibrationDiagnostics(referenceId);
      expect(diagnostics.normalizedMaximumResidual).toBeLessThan(0.02);
      expect(diagnostics.rootMeanSquareResidual).toBeLessThan(diagnostics.maximumResidual);
    });

    for (const controlId of ['gate-5', 'br472-junction', 'football-field']) {
      const control4 = REAR_SATELLITE_REFERENCES['annex-4'].controls.find((control) => control.id === controlId)!;
      const control5 = REAR_SATELLITE_REFERENCES['annex-5'].controls.find((control) => control.id === controlId)!;
      const local4 = projectSatellitePixelToLocal('annex-4', control4.satellitePixel);
      const local5 = projectSatellitePixelToLocal('annex-5', control5.satellitePixel);
      expect(Math.hypot(local4[0] - local5[0], local4[1] - local5[1])).toBeLessThan(0.58);
    }
  });

  it('consome no grafo os eixos centrais reconciliados, sem coordenadas dispersas', () => {
    expect(REAR_PARK_ROAD_NETWORK.find((road) => road.id === 'br472-west-junction')?.sourceControlPoints)
      .toBe(REAR_CALIBRATED_AXES.br472WestToJunction);
    expect(REAR_PARK_ROAD_NETWORK.find((road) => road.id === 'brasilia-a5-perimeter')?.sourceControlPoints)
      .toBe(REAR_CALIBRATED_AXES.brasiliaA5Perimeter);
    REAR_PARK_ROAD_NETWORK.flatMap((road) => road.sourceControlPoints).forEach(([x, z]) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(7152.61);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(5735.29);
    });
  });

  it('amostra Catmull-Rom por comprimento com passos uniformes e sem quinas', () => {
    GENERATED_REAR_ROAD_SEGMENTS.forEach((road) => {
      const samples = sampleRearRoadCenterline(rearRoadLocalPath(road), 10);
      expect(samples.length).toBeGreaterThan(road.controlPoints.length);
      const steps = samples.slice(1).map((point, index) => Math.hypot(
        point[0] - samples[index][0], point[1] - samples[index][1],
      ));
      expect(Math.min(...steps)).toBeGreaterThan(0);
      expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(1.35);
    });
  });

  it('gera ribbons, acostamentos, marcações e junções dentro do orçamento', () => {
    const detailed = buildRearRoadNetworkGeometries();
    const reduced = buildRearRoadNetworkGeometries(undefined, { reducedGraphics: true });
    try {
      expect(detailed.highway).not.toBeNull();
      expect(detailed.parkAsphalt).not.toBeNull();
      expect(detailed.shoulders).not.toBeNull();
      expect(detailed.markings).not.toBeNull();
      expect(detailed.diagnostics.junctionCount).toBeGreaterThanOrEqual(2);
      expect(detailed.diagnostics.estimatedBaseDrawCalls).toBeLessThanOrEqual(REAR_ROAD_BUDGET.maximumBaseDrawCalls);
      expect(detailed.diagnostics.triangleCount).toBeLessThan(REAR_ROAD_BUDGET.maximumTriangles);
      expect(reduced.diagnostics.triangleCount).toBeLessThan(detailed.diagnostics.triangleCount);
    } finally {
      disposeRearRoadNetworkGeometries(detailed);
      disposeRearRoadNetworkGeometries(reduced);
    }
  });

  it('usa um único terreno irregular e vegetação localizada, sem invadir vias', () => {
    expect(REAR_TERRAIN_PATCHES).toHaveLength(1);
    expect(REAR_TERRAIN_PATCHES[0].sourcePolygon.length).toBeGreaterThanOrEqual(10);
    const edgeAngles = REAR_TERRAIN_PATCHES[0].sourcePolygon.map((point, index, polygon) => {
      const next = polygon[(index + 1) % polygon.length];
      return Math.atan2(next[1] - point[1], next[0] - point[0]).toFixed(2);
    });
    expect(new Set(edgeAngles).size).toBeGreaterThan(6);

    const trees = buildRearTreeInstances();
    const reducedTrees = buildRearTreeInstances(true);
    expect(trees.length).toBeGreaterThan(80);
    expect(trees.length).toBeLessThanOrEqual(REAR_ENVIRONMENT_BUDGET.maximumTreeInstances);
    expect(reducedTrees.length).toBeLessThan(trees.length);
    expect(new Set(trees.map((tree) => tree.scale.toFixed(4))).size).toBeGreaterThan(40);
    const corridors = rearRoadCorridors(true);
    trees.forEach((tree) => corridors.forEach((corridor) => {
      expect(distanceToPath([tree.x, tree.z], corridor.path)).toBeGreaterThan(corridor.halfWidth);
    }));

    expect(buildRearPoleInstances().length).toBeGreaterThan(0);
    expect(buildRearPoleInstances().length).toBeLessThanOrEqual(REAR_ENVIRONMENT_BUDGET.maximumPoleInstances);
    expect(buildRearPoleInstances(true)).toHaveLength(0);
  });
});
