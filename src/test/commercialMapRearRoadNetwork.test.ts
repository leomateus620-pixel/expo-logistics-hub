import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_REFERENCE_DATA,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';
import {
  GENERATED_REAR_ROAD_SEGMENTS,
  OFFICIAL_GATE_5_ACCESS_POINT,
  OFFICIAL_GATE_5_CENTER,
  OFFICIAL_GATE_5_ENTITY_ID,
  PROTECTED_ROAD_IDENTIFIERS,
  REAR_CONTEXTUAL_LABELS,
  REAR_PARK_ROAD_NETWORK,
  REAR_ROAD_IDENTITIES,
  REAR_ROAD_NODES,
  REPLACED_OFFICIAL_ROAD_IDENTIFIERS,
  rearContextualLabelAnchorForOfficialOwner,
  rearRoadFocusBoundsForOfficialOwner,
  rearRoadIdentityCountByName,
  rearRoadLocalPath,
  rearRoadLocalWidth,
  roadGraphHasPath,
  roadGraphPath,
} from '@/features/commercial-map/data/rearParkRoadNetwork';
import {
  REAR_ROAD_EXCLUSION_BOUNDARIES,
  REAR_ROAD_EXCLUSION_COUNTS,
} from '@/features/commercial-map/data/rearRoadExclusions';
import {
  REAR_ENVIRONMENT_BUDGET,
  REAR_ENVIRONMENT_REFERENCE_POINTS,
  REAR_TERRAIN_PATCHES,
  buildRearPoleInstances,
  buildRearTreeInstances,
} from '@/features/commercial-map/data/rearParkEnvironment';
import { ARENA_FRONT_LAYOUT } from '@/features/commercial-map/data/parkEnvironment';
import {
  REAR_ROAD_BUDGET,
  REAR_ROAD_JUNCTION_ELEVATION_LIFT,
  buildRearRoadCorridorFootprints,
  buildRearRoadNetworkGeometries,
  disposeRearRoadNetworkGeometries,
  pointIsInsideAnyRearRoadCorridor,
  rearRoadFootprintIntersectsPolygon,
  rearRoadTerrainElevationAt,
  resolveRearRoadOwnerAtLocalPoint,
  sampleRearRoadCenterline,
} from '@/features/commercial-map/utils/rearRoadNetwork';
import {
  REAR_ATTACHMENT_5_REFERENCE,
  REAR_ATTACHMENT_5_REFERENCE_POINTS,
  REAR_CALIBRATED_AXES,
  REAR_OFFICIAL_ANCHORS,
  REAR_SATELLITE_TOPOLOGY,
  projectRearAttachment5InteriorPercentToOfficialSource,
  projectRearAttachment5PointToLocal,
  projectRearAttachment5PointToOfficialSource,
  rearAttachment5ReferencePointById,
} from '@/features/commercial-map/utils/rearSpatialCalibration';
import {
  buildEntityExplorerIndex,
  filterAndSortEntityExplorerItems,
} from '@/features/commercial-map/utils/entityExplorer';
import { isSelectableMapClassification } from '@/features/commercial-map/utils/interaction';

type Point2 = readonly [number, number];

function officialEntity(identifier: string) {
  const matches = OFFICIAL_REFERENCE_DATA.entities.filter((entity) => (
    entity.publicIdentifier.toLocaleUpperCase('pt-BR') === identifier
  ));
  expect(matches, `entidade oficial ${identifier}`).toHaveLength(1);
  return matches[0];
}

function pointDistance(start: Point2, end: Point2) {
  return Math.hypot(end[0] - start[0], end[1] - start[1]);
}

function polylineDistance(points: readonly Point2[]) {
  return points.slice(1).reduce(
    (distance, point, index) => distance + pointDistance(points[index], point),
    0,
  );
}

function isNonDecreasing(values: readonly number[], tolerance = 1e-6) {
  return values.slice(1).every((value, index) => value + tolerance >= values[index]);
}

function sourceSpan(points: readonly Point2[]) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    x: Math.max(...xs) - Math.min(...xs),
    y: Math.max(...ys) - Math.min(...ys),
  };
}

function degree(nodeId: keyof typeof REAR_ROAD_NODES) {
  return REAR_PARK_ROAD_NETWORK.filter((road) => road.from === nodeId || road.to === nodeId).length;
}

function queryExplorer(query: string) {
  return filterAndSortEntityExplorerItems(
    buildEntityExplorerIndex(OFFICIAL_REFERENCE_DATA.entities, OFFICIAL_REFERENCE_DATA.lots),
    {
      query,
      statusFilters: [],
      classificationFilters: [],
      locationFilter: null,
      verificationFilters: [],
      sortOrder: 'relevance',
    },
  );
}

describe('área posterior — hierarquia dos anexos e seis âncoras', () => {
  it('registra o arquivo do anexo 5 e os percentuais exatos fornecidos', () => {
    expect(REAR_ATTACHMENT_5_REFERENCE).toEqual({
      filenames: [
        'IMG_9933.jpeg',
      ],
      pixelSize: [1179, 1250],
      origin: 'TOP_LEFT',
    });
    expect(REAR_ATTACHMENT_5_REFERENCE_POINTS.map((point) => [point.id, point.percent])).toEqual([
      [1, [80, 30]],
      [2, [53, 73]],
      [3, [53, 46]],
      [4, [55, 15]],
      [5, [38, 20]],
      [6, [62, 13]],
    ]);
    expect(rearAttachment5ReferencePointById(1).attachmentPixel).toEqual([943.2, 375]);
    expect(rearAttachment5ReferencePointById(2).attachmentPixel).toEqual([624.87, 912.5]);
    expect(rearAttachment5ReferencePointById(6).attachmentPixel).toEqual([730.98, 162.5]);
  });

  it('mantém os marcos rastreáveis e usa o satélite para P3/P4/P6', () => {
    expect(projectRearAttachment5PointToOfficialSource(1)).toEqual([5510, 4200]);
    expect(projectRearAttachment5PointToOfficialSource(2)).toEqual([3964, 3800]);
    expect(projectRearAttachment5PointToOfficialSource(3)).toEqual([3948, 2910]);
    expect(projectRearAttachment5PointToOfficialSource(4)).toEqual([5974, 3678]);
    expect(projectRearAttachment5PointToOfficialSource(5)[0]).toBeCloseTo(5987, 10);
    expect(projectRearAttachment5PointToOfficialSource(5)[1]).toBeCloseTo(2000, 10);
    expect(projectRearAttachment5PointToOfficialSource(6)).toEqual([6108, 3678]);
    expect(rearAttachment5ReferencePointById(2).calibration).toBe('satellite-override');
    expect(rearAttachment5ReferencePointById(3).calibration).toBe('satellite-override');
    expect(rearAttachment5ReferencePointById(4).calibration).toBe('satellite-override');
    expect(rearAttachment5ReferencePointById(5).calibration).toBe('interior-affine');
    expect(rearAttachment5ReferencePointById(6).calibration).toBe('satellite-override');
    expect(projectRearAttachment5InteriorPercentToOfficialSource([80, 30])[0]).toBeCloseTo(5510, 10);
    expect(projectRearAttachment5InteriorPercentToOfficialSource([80, 30])[1]).toBeCloseTo(4200, 10);

    const junction = projectRearAttachment5PointToOfficialSource(2);
    const approach = projectRearAttachment5PointToOfficialSource(4);
    const gate = projectRearAttachment5PointToOfficialSource(6);
    expect(REAR_CALIBRATED_AXES.brasiliaNorthToJunction.at(-1)).toEqual(junction);
    expect(REAR_CALIBRATED_AXES.brasiliaNorthToJunction[0][0]).toBeLessThan(junction[0]);
    expect(REAR_CALIBRATED_AXES.gate5InternalApproach[0]).toEqual(approach);
    expect(REAR_CALIBRATED_AXES.gate5InternalApproach.at(-1)).toEqual(gate);

    const point6Local = projectRearAttachment5PointToLocal(6);
    expect(point6Local[0]).toBeCloseTo(OFFICIAL_GATE_5_ACCESS_POINT[0], 10);
    expect(point6Local[1]).toBeCloseTo(OFFICIAL_GATE_5_ACCESS_POINT[1], 10);
    expect(pointDistance(point6Local, OFFICIAL_GATE_5_CENTER)).toBeGreaterThan(2);
    expect(pointDistance(point6Local, OFFICIAL_GATE_5_CENTER)).toBeLessThan(4);
  });

  it('registra as duas referências novas e prova acesso central + rampas do trevo', () => {
    expect(REAR_SATELLITE_TOPOLOGY.references).toEqual([
      { filename: '02-sat-arena-west-field.jpeg', pixelSize: [943, 1119] },
      { filename: '03-sat-portao5-br472.jpeg', pixelSize: [780, 737] },
    ]);
    expect(REAR_SATELLITE_TOPOLOGY.points.map(({ id, role }) => [id, role])).toEqual([
      [2, 'ubiretama-a5-handoff'],
      [1, 'gate-5'],
      [3, 'br472-exit-junction'],
    ]);
    expect(REAR_ENVIRONMENT_REFERENCE_POINTS).toEqual({
      approach: projectRearAttachment5PointToOfficialSource(4),
      gate5: REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
      br472Junction: REAR_OFFICIAL_ANCHORS.br472Junction,
    });
    expect(REAR_CALIBRATED_AXES.gate5InternalApproach[0]).toEqual(
      projectRearAttachment5PointToOfficialSource(4),
    );
    expect(REAR_CALIBRATED_AXES.gate5InternalApproach.at(-1)).toEqual(
      REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
    );
    [
      REAR_CALIBRATED_AXES.a5CenterAccess,
      REAR_CALIBRATED_AXES.a5NorthRamp,
      REAR_CALIBRATED_AXES.a5SouthRamp,
    ].forEach((axis) => expect(axis[0]).toEqual(REAR_OFFICIAL_ANCHORS.gate5VehicleAccess));
    expect(REAR_CALIBRATED_AXES.a5CenterAccess.at(-1)).toEqual(REAR_OFFICIAL_ANCHORS.br472Junction);
    expect(REAR_CALIBRATED_AXES.a5NorthRamp.at(-1)).toEqual(REAR_OFFICIAL_ANCHORS.br472NorthRampJunction);
    expect(REAR_CALIBRATED_AXES.a5SouthRamp.at(-1)).toEqual(REAR_OFFICIAL_ANCHORS.br472SouthRampJunction);
    expect(REAR_OFFICIAL_ANCHORS.br472NorthRampJunction[1])
      .toBeLessThan(REAR_OFFICIAL_ANCHORS.br472Junction[1]);
    expect(REAR_OFFICIAL_ANCHORS.br472SouthRampJunction[1])
      .toBeGreaterThan(REAR_OFFICIAL_ANCHORS.br472Junction[1]);
  });
});

describe('área posterior — identidades, seleção e busca sem duplicação', () => {
  it('usa somente os quatro nomes corretos e elimina toda identidade Rua Exporural', () => {
    expect(REAR_ROAD_IDENTITIES.map(({ id, name }) => [id, name])).toEqual([
      ['RUA-BRASILIA', 'Rua Brasília'],
      ['RUA-UBIRETAMA', 'Rua Ubiretama'],
      ['RUA-DAS-ETNIAS', 'Rua das Etnias'],
      ['RODOVIA-RS-472', 'BR-472'],
    ]);
    ['Rua Brasília', 'Rua Ubiretama', 'Rua das Etnias', 'BR-472'].forEach((name) => {
      expect(rearRoadIdentityCountByName(name)).toBe(1);
    });
    expect(rearRoadIdentityCountByName('Rua Exporural')).toBe(0);
    expect(JSON.stringify(REAR_PARK_ROAD_NETWORK)).not.toContain('Rua Exporural');
  });

  it('mantém um único A5 oficial e separa seu cadastro da passagem física P6', () => {
    const a5 = officialEntity('A5');
    expect(a5.id).toBe(OFFICIAL_GATE_5_ENTITY_ID);
    expect(a5.classification).toBe('GATE');
    expect(isSelectableMapClassification(a5.classification)).toBe(true);
    expect(OFFICIAL_REFERENCE_DATA.entities.filter((entity) => entity.publicIdentifier === 'A5')).toHaveLength(1);
    const officialEntityCenter = officialPdfPointToLocal(REAR_OFFICIAL_ANCHORS.gate5Entity);
    expect(OFFICIAL_GATE_5_CENTER[0]).toBeCloseTo(officialEntityCenter[0], 10);
    expect(OFFICIAL_GATE_5_CENTER[1]).toBeCloseTo(officialEntityCenter[1], 10);
    expect(OFFICIAL_GATE_5_ACCESS_POINT).toEqual(projectRearAttachment5PointToLocal(6));
    expect(pointDistance(OFFICIAL_GATE_5_CENTER, OFFICIAL_GATE_5_ACCESS_POINT)).toBeGreaterThan(2);
    expect(pointDistance(OFFICIAL_GATE_5_CENTER, OFFICIAL_GATE_5_ACCESS_POINT)).toBeLessThan(4);
    expect(REAR_ROAD_NODES['gate-5']).toMatchObject({
      sourcePoint: REAR_OFFICIAL_ANCHORS.gate5Entity,
      roadAccessSourcePoint: REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
      officialEntityIdentifier: 'A5',
    });
  });

  it('indexa o alias Rua das Etnias na entidade oficial sem alterar os dados', () => {
    const before = JSON.stringify(officialEntity('AV-IMIGRANTES'));
    const results = queryExplorer('Rua das Etnias');
    expect(results[0]?.entity.publicIdentifier).toBe('AV-IMIGRANTES');
    expect(queryExplorer('Rua Ubiretama')[0]?.entity.publicIdentifier).toBe('RUA-UBIRETAMA');
    expect(queryExplorer('BR-472')[0]?.entity.publicIdentifier).toBe('RODOVIA-RS-472');
    expect(JSON.stringify(officialEntity('AV-IMIGRANTES'))).toBe(before);
  });

  it('aplica rótulo/âncora contextuais e mantém Html fora da rede viária', () => {
    expect(REAR_CONTEXTUAL_LABELS).toEqual({
      'RUA-BRASILIA': 'RUA BRASÍLIA',
      'RUA-UBIRETAMA': 'RUA UBIRETAMA',
      'AV-IMIGRANTES': 'RUA DAS ETNIAS',
      'RODOVIA-RS-472': 'BR-472',
      A5: 'PORTÃO 5',
    });
    expect(rearContextualLabelAnchorForOfficialOwner('RUA-BRASILIA')).toEqual(
      officialPdfPointToLocal([3948, 2910]),
    );
    expect(rearRoadFocusBoundsForOfficialOwner('RUA-BRASILIA')).toMatchObject({
      minX: expect.any(Number), maxX: expect.any(Number), minZ: expect.any(Number), maxZ: expect.any(Number),
    });
    const networkSource = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/components/canvas/RearParkRoadNetwork.tsx',
    ), 'utf8');
    const canvasSource = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    ), 'utf8');
    expect(networkSource).not.toContain('<Html');
    expect(networkSource).toContain("onClick={interactive ? handleClick('park') : undefined}");
    expect(networkSource).toContain('raycast={interactive ? undefined : NO_RAYCAST}');
    expect(networkSource).toContain('resolveRearRoadOwnerAtLocalPoint');
    expect(canvasSource).toContain('rearContextualLabelAnchorForOfficialOwner');
    expect(canvasSource).toContain('data-map-label-mode={mode}');
  });

  it('resolve hit-tests das ribbons diretamente para as entidades oficiais', () => {
    const brasilia = REAR_PARK_ROAD_NETWORK.find((road) => road.id === 'brasilia-north-junction')!;
    const ubiretama = REAR_PARK_ROAD_NETWORK.find(
      (road) => road.id === 'ubiretama-junction-a5',
    )!;
    const highway = REAR_PARK_ROAD_NETWORK.find((road) => road.id === 'br472-north-ramp')!;
    const brasiliaPoint = rearRoadLocalPath(brasilia)[0];
    const ubiretamaPoint = officialPdfPointToLocal(REAR_CALIBRATED_AXES.ubiretamaJunctionToA5[3]);
    const highwayPoint = rearRoadLocalPath(highway)[1];
    expect(resolveRearRoadOwnerAtLocalPoint(brasiliaPoint, 'park')).toBe('RUA-BRASILIA');
    expect(ubiretama.officialOwnerIdentifier).toBe('RUA-UBIRETAMA');
    expect(resolveRearRoadOwnerAtLocalPoint(ubiretamaPoint, 'park')).toBe('RUA-UBIRETAMA');
    expect(resolveRearRoadOwnerAtLocalPoint(highwayPoint, 'highway')).toBe('RODOVIA-RS-472');
  });

  it('não reintroduz componente, entidade ou metadado legado do Portão 5', () => {
    expect(existsSync(resolve(process.cwd(), 'src/features/commercial-map/components/canvas/RearParkGate5.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/features/commercial-map/data/rearParkGate5.ts'))).toBe(false);
    const source = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/data/rearParkRoadNetwork.ts',
    ), 'utf8');
    expect(source).not.toContain('RearParkGate5');
    expect(source).not.toContain("'PORTAO-5'");
  });
});

describe('área posterior — topologia de satélite e rodovia independente', () => {
  it('materializa o cruzamento de quatro braços ao sul do campo, sem S ou dogleg', () => {
    const path = roadGraphPath('brasilia', 'A5');
    expect(path).toEqual([
      'brasilia-north',
      'brasilia-ubiretama-junction',
      'ubiretama-a5',
      'gate-5',
    ]);
    const junction = REAR_ROAD_NODES['brasilia-ubiretama-junction'].sourcePoint;
    expect(junction[0]).toBeCloseTo(3964, 10);
    expect(junction[1]).toBeCloseTo(3800, 10);
    expect(roadGraphHasPath('ubiretama', 'brasilia')).toBe(true);
    expect(degree('brasilia-ubiretama-junction')).toBe(4);
    expect(GENERATED_REAR_ROAD_SEGMENTS.filter((road) => road.roadId === 'RUA-BRASILIA')).toHaveLength(2);
    expect(GENERATED_REAR_ROAD_SEGMENTS.filter((road) => road.roadId === 'RUA-UBIRETAMA')).toHaveLength(1);
    expect(REAR_PARK_ROAD_NETWORK.some((road) => road.id === 'brasilia-point-3-ubiretama-4')).toBe(false);
    const brasiliaAxis = [
      ...REAR_CALIBRATED_AXES.brasiliaNorthToJunction,
      ...REAR_CALIBRATED_AXES.brasiliaJunctionToSouth.slice(1),
    ];
    const brasiliaSpan = sourceSpan(brasiliaAxis);
    expect(isNonDecreasing(brasiliaAxis.map(([, y]) => y))).toBe(true);
    expect(isNonDecreasing(brasiliaAxis.map(([x]) => x))).toBe(true);
    expect(brasiliaSpan.y).toBeGreaterThan(brasiliaSpan.x * 50);
    expect(polylineDistance(brasiliaAxis)).toBeLessThan(pointDistance(
      brasiliaAxis[0], brasiliaAxis.at(-1)!,
    ) * 1.01);

    const field = ARENA_FRONT_LAYOUT.footballField.sourceBounds;
    expect(junction[0]).toBeLessThan(field[0]);
    expect(junction[1]).toBeGreaterThan(field[3]);

    const ubiretamaAxis = REAR_CALIBRATED_AXES.ubiretamaJunctionToA5;
    const ubiretamaSpan = sourceSpan(ubiretamaAxis);
    expect(ubiretamaAxis[0]).toEqual(junction);
    expect(isNonDecreasing(ubiretamaAxis.map(([x]) => x))).toBe(true);
    expect(ubiretamaSpan.x).toBeGreaterThan(ubiretamaSpan.y * 15);
    expect(polylineDistance(ubiretamaAxis)).toBeLessThan(pointDistance(
      ubiretamaAxis[0], ubiretamaAxis.at(-1)!,
    ) * 1.001);

    const removedWrongPoints: readonly Point2[] = [
      [4522, 3218], [4535, 3280], [4535, 3455], [4492, 3466],
      [5920, 2780], [5885, 3000], [5750, 3235], [5350, 3252], [5000, 3240],
      [6190.975433526012, 3021.965317919075], [6266.926335827044, 3234.233541884527],
    ];
    const renderedSourcePoints = GENERATED_REAR_ROAD_SEGMENTS.flatMap(
      (road) => road.sourceControlPoints,
    );
    removedWrongPoints.forEach((removed) => {
      expect(renderedSourcePoints.some(
        (point) => pointDistance(point, removed) < 1e-6,
      ), `ponto removido ${removed.join(',')}`).toBe(false);
    });
  });

  it('termina Rua das Etnias em P1 e não cria ramo do término até o Portão 5', () => {
    expect(REAR_ROAD_NODES['etnias-terminus-1'].sourcePoint).toEqual(
      rearAttachment5ReferencePointById(1).officialSource,
    );
    expect(degree('etnias-terminus-1')).toBe(1);
    expect(REAR_PARK_ROAD_NETWORK.filter((road) => (
      road.from === 'etnias-terminus-1' || road.to === 'etnias-terminus-1'
    )).map((road) => road.id)).toEqual(['etnias-official-terminus-1']);
    expect(GENERATED_REAR_ROAD_SEGMENTS.some((road) => road.roadId === 'RUA-DAS-ETNIAS')).toBe(false);
  });

  it('mantém a BR-472 independente e entrega A5 em três ramais de trevo', () => {
    const highway = REAR_PARK_ROAD_NETWORK.filter((road) => road.roadId === 'RODOVIA-RS-472');
    const access = REAR_PARK_ROAD_NETWORK.filter((road) => road.roadId === 'ACESSO-A5-BR472');
    expect(highway).toHaveLength(4);
    expect(access).toHaveLength(4);
    expect(access.find((road) => road.id === 'gate5-internal-approach'))
      .toMatchObject({ from: 'ubiretama-a5', to: 'gate-5' });
    expect(access.filter((road) => road.from === 'gate-5').map((road) => road.to)).toEqual([
      'a5-br-junction',
      'br472-north-ramp-junction',
      'br472-south-ramp-junction',
    ]);
    expect(degree('gate-5')).toBe(4);
    expect(degree('br472-north-ramp-junction')).toBe(3);
    expect(degree('a5-br-junction')).toBe(3);
    expect(degree('br472-south-ramp-junction')).toBe(3);
    expect(rearRoadLocalWidth(highway[0])).toBeGreaterThan(rearRoadLocalWidth(access[0]));
    expect(roadGraphHasPath('A5', 'br472')).toBe(true);
    expect(roadGraphHasPath('brasilia', 'br472-south')).toBe(true);
    expect(highway.every((road) => road.category === 'federal-highway')).toBe(true);
    expect(access.every((road) => road.officialOwnerIdentifier === 'A5')).toBe(true);
    expect(JSON.stringify({ nodes: REAR_ROAD_NODES, roads: REAR_PARK_ROAD_NETWORK })).not.toContain('A3');
  });

  it('mantém a Brasília oficial e substitui somente Ubiretama e RS-472', () => {
    expect(REPLACED_OFFICIAL_ROAD_IDENTIFIERS).toEqual([
      'RUA-UBIRETAMA', 'RODOVIA-RS-472',
    ]);
    expect(REPLACED_OFFICIAL_ROAD_IDENTIFIERS).not.toContain('RUA-BRASILIA');
    expect(REPLACED_OFFICIAL_ROAD_IDENTIFIERS).not.toContain('AV-IMIGRANTES');
    expect(PROTECTED_ROAD_IDENTIFIERS).toEqual(expect.arrayContaining([
      'RUA-UBIRETAMA', 'RUA-BRASILIA', 'AV-IMIGRANTES', 'RODOVIA-RS-472',
    ]));
    const removedRearRoadIdentifiers = [
      'RUA-POSTERIOR-ETNIAS', 'RUA-ETNIAS-TRANSVERSAL', 'RUA-RETAGUARDA-ARENA',
      'RUA-CIRCULACAO-LOTES', 'ACESSO-ALCA-LESTE', 'RS-472-CONTINUACAO', 'RUA-EXPORURAL',
    ];
    const runtimeIds = REAR_PARK_ROAD_NETWORK.flatMap((road) => [road.id, road.roadId]);
    removedRearRoadIdentifiers.forEach((identifier) => expect(runtimeIds).not.toContain(identifier));
  });
});

describe('área posterior — exclusões espaciais, profundidade e ambiente', () => {
  it('separa a pista e os acostamentos da BR de toda a rede antes do portão', () => {
    const footprints = buildRearRoadCorridorFootprints();
    const highways = footprints.filter((footprint) => footprint.roadId === 'RODOVIA-RS-472');
    const internal = footprints.filter((footprint) => {
      const road = GENERATED_REAR_ROAD_SEGMENTS.find((candidate) => candidate.id === footprint.segmentId)!;
      return road.roadId !== 'RODOVIA-RS-472' && road.from !== 'gate-5';
    });
    highways.forEach((highway) => internal.forEach((road) => {
      expect(rearRoadFootprintIntersectsPolygon(highway, road.polygon), road.segmentId).toBe(false);
    }));
  });

  it('audita edifícios, lotes, Arena e estacionamentos no mesmo overlay', () => {
    expect(REAR_ROAD_EXCLUSION_COUNTS.officialEntities).toBeGreaterThan(110);
    expect(REAR_ROAD_EXCLUSION_COUNTS.arenaSurfaceZones).toBeGreaterThanOrEqual(8);
    expect(REAR_ROAD_EXCLUSION_COUNTS.rearParkingRows).toBeGreaterThan(0);
    expect(REAR_ROAD_EXCLUSION_COUNTS.electricalNodes).toBeGreaterThan(150);
    expect(REAR_ROAD_EXCLUSION_COUNTS.total).toBe(REAR_ROAD_EXCLUSION_BOUNDARIES.length);
    ['official:F', 'official:C1', 'official:D3', 'official:EST-EXP-VIS', 'official:EST-VIS']
      .forEach((id) => expect(REAR_ROAD_EXCLUSION_BOUNDARIES.some((boundary) => boundary.id === id)).toBe(true));
    expect(REAR_ROAD_EXCLUSION_BOUNDARIES.some((boundary) => boundary.id.startsWith('rear-parking-row:'))).toBe(true);
    expect(REAR_ROAD_EXCLUSION_BOUNDARIES.some((boundary) => boundary.id === 'arena-zone:football-field')).toBe(true);
  });

  it('não cruza nenhuma exclusão não autorizada com pista ou acostamento', () => {
    const footprints = buildRearRoadCorridorFootprints(GENERATED_REAR_ROAD_SEGMENTS, {
      includeShoulders: true,
    });
    const collisions = footprints.flatMap((footprint) => (
      REAR_ROAD_EXCLUSION_BOUNDARIES
        .filter((boundary) => !boundary.allowRoadContact)
        .filter((boundary) => rearRoadFootprintIntersectsPolygon(footprint, boundary.polygon))
        .map((boundary) => `${footprint.segmentId}:${boundary.id}`)
    ));
    expect(collisions).toEqual([]);
  });

  it('descola os patches reais do cruzamento e do trevo para eliminar z-fighting', () => {
    const detailed = buildRearRoadNetworkGeometries();
    try {
      expect(REAR_ROAD_JUNCTION_ELEVATION_LIFT).toBeGreaterThan(0);
      expect(REAR_ROAD_JUNCTION_ELEVATION_LIFT).toBeLessThan(0.004);
      expect(detailed.diagnostics.junctionCount).toBeGreaterThanOrEqual(5);

      const crossing = REAR_ROAD_NODES['brasilia-ubiretama-junction'].position;
      const positions = detailed.parkAsphalt!.getAttribute('position');
      const yAtCenter: number[] = [];
      for (let index = 0; index < positions.count; index += 1) {
        if (Math.hypot(positions.getX(index) - crossing[0], positions.getZ(index) - crossing[2]) < 1e-5) {
          yAtCenter.push(positions.getY(index));
        }
      }
      expect(yAtCenter.some((y) => Math.abs(y - (
        0.032 + rearRoadTerrainElevationAt(crossing[0], crossing[2]) + REAR_ROAD_JUNCTION_ELEVATION_LIFT
      )) < 1e-5)).toBe(true);
    } finally {
      disposeRearRoadNetworkGeometries(detailed);
    }
  });

  it('orienta todas as faces para +Y, de acordo com as normais do piso', () => {
    const network = buildRearRoadNetworkGeometries();
    try {
      [network.highway, network.parkAsphalt, network.shoulders, network.markings].forEach((geometry) => {
        expect(geometry).not.toBeNull();
        const positions = geometry!.getAttribute('position');
        const normals = geometry!.getAttribute('normal');
        const indices = geometry!.getIndex();
        let invertedFaces = 0;
        for (let index = 0; index < (indices?.count ?? positions.count); index += 3) {
          const a = indices?.getX(index) ?? index;
          const b = indices?.getX(index + 1) ?? index + 1;
          const c = indices?.getX(index + 2) ?? index + 2;
          const abX = positions.getX(b) - positions.getX(a);
          const abZ = positions.getZ(b) - positions.getZ(a);
          const acX = positions.getX(c) - positions.getX(a);
          const acZ = positions.getZ(c) - positions.getZ(a);
          if (abZ * acX - abX * acZ < -1e-9) invertedFaces += 1;
          expect(normals.getY(a)).toBeGreaterThan(0);
        }
        expect(invertedFaces).toBe(0);
      });
    } finally {
      disposeRearRoadNetworkGeometries(network);
    }
  });

  it('gera curvas estáveis, materiais consolidados e orçamento controlado', () => {
    GENERATED_REAR_ROAD_SEGMENTS.forEach((road) => {
      const samples = sampleRearRoadCenterline(rearRoadLocalPath(road), 8);
      expect(samples.length).toBeGreaterThan(road.controlPoints.length);
      expect(samples.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z))).toBe(true);
    });
    const detailed = buildRearRoadNetworkGeometries();
    const reduced = buildRearRoadNetworkGeometries(undefined, { reducedGraphics: true });
    try {
      expect(detailed.diagnostics.estimatedBaseDrawCalls).toBeLessThanOrEqual(REAR_ROAD_BUDGET.maximumBaseDrawCalls);
      expect(detailed.diagnostics.triangleCount).toBeLessThan(REAR_ROAD_BUDGET.maximumTriangles);
      expect(reduced.diagnostics.triangleCount).toBeLessThan(detailed.diagnostics.triangleCount);
      expect(detailed.highway).not.toBeNull();
      expect(detailed.parkAsphalt).not.toBeNull();
      expect(detailed.shoulders).not.toBeNull();
      expect(detailed.markings).not.toBeNull();
    } finally {
      disposeRearRoadNetworkGeometries(detailed);
      disposeRearRoadNetworkGeometries(reduced);
    }
  });

  it('restaura terreno/vegetação fora das novas faixas e mantém instâncias determinísticas', () => {
    expect(REAR_TERRAIN_PATCHES).toHaveLength(1);
    expect(REAR_TERRAIN_PATCHES[0].sourcePolygon.length).toBeGreaterThanOrEqual(10);
    const first = buildRearTreeInstances();
    const second = buildRearTreeInstances();
    const reduced = buildRearTreeInstances(true);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(60);
    expect(first.length).toBeLessThanOrEqual(REAR_ENVIRONMENT_BUDGET.maximumTreeInstances);
    expect(reduced.length).toBeLessThan(first.length);
    first.forEach((tree) => {
      expect(pointIsInsideAnyRearRoadCorridor([tree.x, tree.z], REAR_PARK_ROAD_NETWORK)).toBe(false);
    });
    expect(buildRearPoleInstances().length).toBeGreaterThan(0);
    expect(buildRearPoleInstances(true)).toEqual([]);
  });
});

describe('área posterior — estabilidade de ciclo de vida e overlay de QA', () => {
  it('mantém Canvas e árvores estáveis durante seleção comum', () => {
    const page = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/CommercialMapPage.tsx',
    ), 'utf8');
    const canvas = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    ), 'utf8');
    expect(page).not.toContain('key={areaScope}');
    expect(canvas).toContain('rearRoadCompatibleSceneTrees');
    expect(canvas).toContain('selectedLunarTreeEntity');
    expect(canvas).toContain('[rearRoadCompatibleSceneTrees, selectedLunarTreeEntity]');
    expect(canvas).not.toMatch(/presentedSceneTrees[\s\S]{0,1200}\[.*selectedEntity\]/);
  });

  it('mantém a rede montada ao ocultar a camada e não recria texturas por interação', () => {
    const source = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/components/canvas/RearParkRoadNetwork.tsx',
    ), 'utf8');
    expect(source).toContain('visible={interactive}');
    expect(source).toContain('raycast={interactive ? undefined : NO_RAYCAST}');
    expect(source).not.toContain('if (!visible || presentedOpacity <= 0.015) return null');
    expect(source).toContain('useMemo(');
    expect(source).toContain('[maximumAnisotropy]');
    const utilitySource = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/utils/rearRoadNetwork.ts',
    ), 'utf8');
    expect(utilitySource).toContain('rearRoadHitCenterlineCache');
  });

  it('expõe centerlines/controles/exclusões somente em DEV com query explícita', () => {
    const overlay = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/components/canvas/RearRoadValidationOverlay.tsx',
    ), 'utf8');
    const canvas = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    ), 'utf8');
    expect(canvas).toContain('const RearRoadValidationOverlay = import.meta.env.DEV');
    expect(canvas).toContain("await import('./RearRoadValidationOverlay')");
    expect(canvas).not.toContain("from './RearRoadValidationOverlay'");
    expect(canvas).toContain("has('rearRoadDebug')");
    expect(overlay).toContain('REAR_ROAD_EXCLUSION_BOUNDARIES');
    expect(overlay).toContain('REAR_ATTACHMENT_5_REFERENCE_POINTS');
    expect(overlay).toContain('REAR_SATELLITE_TOPOLOGY');
  });
});
