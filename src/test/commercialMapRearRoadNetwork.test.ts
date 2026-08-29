import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_REFERENCE_DATA,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';
import {
  EXPORURAL_GEOMETRY_REVISION,
  EXPORURAL_LOT_REFERENCES,
  EXPORURAL_ROAD_IDENTIFIERS,
} from '@/features/commercial-map/data/exporuralReference2026';
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
  REMOVED_REAR_ROAD_IDENTIFIERS,
  REPLACED_OFFICIAL_ROAD_IDENTIFIERS,
  rearRoadIdentityCountByName,
  rearRoadLocalPath,
  rearRoadLocalWidth,
  roadGraphHasPath,
  roadGraphPath,
} from '@/features/commercial-map/data/rearParkRoadNetwork';
import {
  REAR_ENVIRONMENT_BUDGET,
  REAR_ENVIRONMENT_REFERENCE_POINTS,
  REAR_STRUCTURE_EXCLUSIONS,
  REAR_TERRAIN_PATCHES,
  buildRearPoleInstances,
  buildRearTreeInstances,
  sourceBoundsToLocal,
  sourcePolygonToLocal,
} from '@/features/commercial-map/data/rearParkEnvironment';
import {
  REAR_PARKING_ROWS,
} from '@/features/commercial-map/data/rearParking';
import {
  REAR_ROAD_BUDGET,
  buildRearRoadCorridorFootprints,
  buildRearRoadNetworkGeometries,
  disposeRearRoadNetworkGeometries,
  distanceToPath,
  pointIsInsideAnyRearRoadCorridor,
  pointIsInsidePolygon,
  rearRoadCorridorIntersectsPolygon,
  rearRoadFootprintIntersectsPolygon,
  sampleRearRoadCenterline,
} from '@/features/commercial-map/utils/rearRoadNetwork';
import { rearRoadLayerPresentation } from '@/features/commercial-map/utils/commercialLayerPresentation';
import {
  REAR_CALIBRATED_AXES,
  REAR_NORMALIZED_REFERENCE_POINTS,
  REAR_OFFICIAL_ANCHORS,
  REAR_SATELLITE_REFERENCES,
  projectRearNormalizedReferencePointToLocal,
  projectRearNormalizedReferencePointToOfficialSource,
  projectSatellitePixelToLocal,
  rearCalibrationDiagnostics,
  rearNormalizedReferencePointById,
  rearNormalizedReferencePointsByRole,
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

function officialEntity(identifier: string) {
  const entities = OFFICIAL_REFERENCE_DATA.entities.filter(
    (entity) => entity.publicIdentifier.toLocaleUpperCase('pt-BR') === identifier,
  );
  expect(entities, `entidade oficial ${identifier}`).toHaveLength(1);
  return entities[0];
}

function pointToSegmentDistance(point: Point2, start: Point2, end: Point2) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + dx * t), point[1] - (start[1] + dz * t));
}

function distanceToPolygonBoundary(point: Point2, polygon: readonly Point2[]) {
  return Math.min(...polygon.map((start, index) => (
    pointToSegmentDistance(point, start, polygon[(index + 1) % polygon.length])
  )));
}

function boundsPolygon(bounds: (typeof REAR_STRUCTURE_EXCLUSIONS)[number]): Point2[] {
  const local = sourceBoundsToLocal(bounds);
  return [
    [local.minX, local.minZ], [local.maxX, local.minZ],
    [local.maxX, local.maxZ], [local.minX, local.maxZ],
  ];
}

function axisToLocal(axis: readonly Point2[]) {
  return axis.map((point) => officialPdfPointToLocal(point));
}

function directedTangentDeltaDegrees(
  incomingStart: Point2,
  junction: Point2,
  outgoingEnd: Point2,
) {
  const incoming = Math.atan2(junction[1] - incomingStart[1], junction[0] - incomingStart[0]);
  const outgoing = Math.atan2(outgoingEnd[1] - junction[1], outgoingEnd[0] - junction[0]);
  const rawDelta = Math.abs(incoming - outgoing);
  return Math.min(rawDelta, Math.PI * 2 - rawDelta) * (180 / Math.PI);
}

describe('área posterior — identidade oficial e apresentação única do Portão 5', () => {
  it('mantém exatamente uma entidade A5, um nome oficial, uma busca e uma geometria selecionável', () => {
    const a5 = officialEntity('A5');
    expect(a5.id).toBe(OFFICIAL_GATE_5_ENTITY_ID);
    expect(a5.name).toBe('Portão 5 — saída de veículos de expositores e visitantes');
    expect(a5.classification).toBe('GATE');
    expect(isSelectableMapClassification(a5.classification)).toBe(true);
    expect(OFFICIAL_REFERENCE_DATA.entities.filter((entity) => entity.publicIdentifier === 'A5')).toHaveLength(1);
    expect(OFFICIAL_REFERENCE_DATA.entities.filter((entity) => (
      normalizedText(entity.name).startsWith('portao 5')
    ))).toHaveLength(1);

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

  it('termina a Rua Brasília na passagem física da borda A5 e abre o painel da entidade oficial', () => {
    const a5 = officialEntity('A5');
    const ring = a5.geometry.coordinates[0] as Point2[];
    expect(distanceToPolygonBoundary(OFFICIAL_GATE_5_ACCESS_POINT, ring)).toBeLessThan(1e-8);
    expect(Math.hypot(
      OFFICIAL_GATE_5_ACCESS_POINT[0] - OFFICIAL_GATE_5_CENTER[0],
      OFFICIAL_GATE_5_ACCESS_POINT[1] - OFFICIAL_GATE_5_CENTER[1],
    )).toBeGreaterThan(0.4);
    expect(REAR_ROAD_NODES['gate-5']).toMatchObject({
      officialEntityIdentifier: 'A5',
      sourcePoint: REAR_OFFICIAL_ANCHORS.gate5Entity,
      roadAccessSourcePoint: REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
      position: [OFFICIAL_GATE_5_ACCESS_POINT[0], 0, OFFICIAL_GATE_5_ACCESS_POINT[1]],
    });

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

  it('preserva o A5 e suaviza a tangência entre chegada interna e acesso externo', () => {
    const internal = axisToLocal(REAR_CALIBRATED_AXES.brasiliaContinuation);
    const external = axisToLocal(REAR_CALIBRATED_AXES.a5ExternalAccess);
    const gate = officialPdfPointToLocal(REAR_OFFICIAL_ANCHORS.gate5VehicleAccess);
    expect(internal.at(-1)).toEqual(gate);
    expect(external[0]).toEqual(gate);
    expect(directedTangentDeltaDegrees(internal.at(-2)!, gate, external[1])).toBeLessThanOrEqual(8);
    expect(projectRearNormalizedReferencePointToOfficialSource(6)).toEqual(REAR_OFFICIAL_ANCHORS.gate5Entity);
  });

  it('usa o sistema contextual existente com um texto exato por owner e sem Html permanente', () => {
    expect(REAR_CONTEXTUAL_LABELS).toEqual({
      'RUA-UBIRETAMA': 'RUA EXPORURAL',
      'RUA-BRASILIA': 'RUA BRASÍLIA',
      'RODOVIA-RS-472': 'BR-472',
      A5: 'PORTÃO 5',
    });
    expect(new Set(Object.values(REAR_CONTEXTUAL_LABELS)).size).toBe(4);
    const networkSource = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/components/canvas/RearParkRoadNetwork.tsx',
    ), 'utf8');
    const canvasSource = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    ), 'utf8');
    expect(networkSource).not.toContain('<Html');
    expect(networkSource).not.toContain('rear-park-road-labels');
    expect(networkSource).not.toContain('onClick=');
    expect(networkSource).not.toContain('selectedEntityId');
    expect(canvasSource).toContain('rearContextualLabelForOfficialOwner');
    expect(canvasSource).toContain('data-map-label-mode={mode}');
  });

  it('herda visibilidade, opacidade e fading da camada oficial sem criar seleção paralela', () => {
    const ownerIdentifiers = new Set(REAR_ROAD_IDENTITIES.map((road) => road.officialOwnerIdentifier));
    const owners = OFFICIAL_REFERENCE_DATA.entities.filter((entity) => (
      ownerIdentifiers.has(entity.publicIdentifier as typeof REAR_ROAD_IDENTITIES[number]['officialOwnerIdentifier'])
    ));
    const before = JSON.stringify(owners);
    expect(owners).toHaveLength(3);
    expect(new Set(owners.map((owner) => owner.layerId)).size).toBe(1);
    const circulationLayerId = owners[0].layerId;

    expect(rearRoadLayerPresentation(OFFICIAL_REFERENCE_DATA.entities, {}, {})).toEqual({
      visible: true,
      opacity: 1,
    });
    expect(rearRoadLayerPresentation(
      OFFICIAL_REFERENCE_DATA.entities,
      { [circulationLayerId]: false },
      {},
    )).toEqual({ visible: false, opacity: 0 });
    expect(rearRoadLayerPresentation(
      OFFICIAL_REFERENCE_DATA.entities,
      {},
      { [circulationLayerId]: 0.5 },
    )).toEqual({ visible: true, opacity: 0.5 });
    expect(rearRoadLayerPresentation(
      OFFICIAL_REFERENCE_DATA.entities,
      {},
      { [circulationLayerId]: 0.5 },
      true,
    )).toEqual({ visible: true, opacity: 0.34 });
    expect(rearRoadLayerPresentation([], {}, {})).toEqual({ visible: false, opacity: 0 });
    expect(JSON.stringify(owners)).toBe(before);

    const canvasSource = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    ), 'utf8');
    expect(canvasSource).toContain('visible={rearRoadPresentation.visible}');
    expect(canvasSource).toContain('opacity={rearRoadPresentation.opacity}');
  });

  it('não contém RearParkGate5, rearParkGate5 nem registro PORTAO-5 duplicado', () => {
    expect(existsSync(resolve(
      process.cwd(), 'src/features/commercial-map/components/canvas/RearParkGate5.tsx',
    ))).toBe(false);
    expect(existsSync(resolve(
      process.cwd(), 'src/features/commercial-map/data/rearParkGate5.ts',
    ))).toBe(false);
    const runtimeSources = [
      'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
      'src/features/commercial-map/data/rearParkRoadNetwork.ts',
    ].map((file) => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n');
    expect(runtimeSources).not.toContain('RearParkGate5');
    expect(runtimeSources).not.toContain('rearParkGate5');
    expect(runtimeSources).not.toContain("'PORTAO-5'");
  });
});

describe('área posterior — três vias canônicas e topologia correta', () => {
  it('declara uma única Rua Exporural, uma única Rua Brasília e uma única BR-472', () => {
    expect(REAR_ROAD_IDENTITIES).toHaveLength(3);
    expect(rearRoadIdentityCountByName('Rua Exporural')).toBe(1);
    expect(rearRoadIdentityCountByName('Rua Brasília')).toBe(1);
    expect(rearRoadIdentityCountByName('BR-472')).toBe(1);
    expect(new Set(REAR_ROAD_IDENTITIES.map((road) => road.id))).toEqual(new Set([
      'RUA-EXPORURAL', 'RUA-BRASILIA', 'RODOVIA-RS-472',
    ]));
  });

  it('forma Exporural → entroncamento 5 → Brasília → A5 → acesso → BR-472', () => {
    expect(roadGraphHasPath('exporural', 'brasilia')).toBe(true);
    expect(roadGraphHasPath('brasilia', 'A5')).toBe(true);
    expect(roadGraphHasPath('A5', 'br472')).toBe(true);
    expect(roadGraphHasPath('exporural', 'br472')).toBe(true);

    const path = roadGraphPath('exporural', 'br472');
    const junctionIndex = path.indexOf('exporural-brasilia-junction');
    const gateIndex = path.indexOf('gate-5');
    const brJunctionIndex = path.indexOf('a5-br-junction');
    expect(junctionIndex).toBeGreaterThan(0);
    expect(gateIndex).toBeGreaterThan(junctionIndex);
    expect(brJunctionIndex).toBeGreaterThan(gateIndex);
  });

  it('exclui completamente o Portão 3 dos segmentos novos e preserva sua entidade', () => {
    expect(officialEntity('A3').name).toBe('Portão 3 — entrada de veículos de expositores e visitantes');
    expect(Object.keys(REAR_ROAD_NODES)).not.toContain('A3');
    expect(REAR_PARK_ROAD_NETWORK.flatMap((road) => [
      road.from,
      road.to,
      road.officialOwnerIdentifier,
    ])).not.toContain('A3');

    const a3Polygon = officialEntity('A3').geometry.coordinates[0] as Point2[];
    buildRearRoadCorridorFootprints(GENERATED_REAR_ROAD_SEGMENTS, { includeShoulders: true })
      .forEach((footprint) => {
        expect(
          rearRoadFootprintIntersectsPolygon(footprint, a3Polygon),
          `${footprint.segmentId} não pode tocar A3`,
        ).toBe(false);
      });
  });

  it('preserva Rua Ubiretama e gera somente as extensões físicas ausentes da Rua Exporural', () => {
    const exporural = REAR_PARK_ROAD_NETWORK.filter((road) => road.roadId === 'RUA-EXPORURAL');
    expect(exporural).toHaveLength(3);
    expect(exporural.find((road) => road.id === 'exporural-official-axis')).toMatchObject({
      presentation: 'official-surface',
      officialOwnerIdentifier: 'RUA-UBIRETAMA',
    });
    const extensions = GENERATED_REAR_ROAD_SEGMENTS.filter((road) => road.roadId === 'RUA-EXPORURAL');
    expect(extensions.map((road) => road.id)).toEqual([
      'exporural-reference-1-official-north',
      'exporural-official-south-junction',
    ]);
    expect(extensions[0].to).toBe('exporural-official-north');
    expect(extensions[1].from).toBe('exporural-official-south');
  });

  it('materializa continuidade física P1 → via oficial → P10/P5 → Rua Brasília', () => {
    const officialPolygon = officialEntity('RUA-UBIRETAMA').geometry.coordinates[0] as Point2[];
    const northNode = REAR_ROAD_NODES['exporural-official-north'].position;
    const southNode = REAR_ROAD_NODES['exporural-official-south'].position;
    expect(distanceToPolygonBoundary([northNode[0], northNode[2]], officialPolygon)).toBeLessThan(1e-8);
    expect(distanceToPolygonBoundary([southNode[0], southNode[2]], officialPolygon)).toBeLessThan(1e-8);

    const footprints = buildRearRoadCorridorFootprints(GENERATED_REAR_ROAD_SEGMENTS, {
      includeShoulders: false,
    });
    const exporuralSouth = footprints.find((footprint) => (
      footprint.segmentId === 'exporural-official-south-junction'
    ))!;
    const brasiliaBefore = footprints.find((footprint) => (
      footprint.segmentId === 'brasilia-reference-3-exporural'
    ))!;
    const brasiliaAfter = footprints.find((footprint) => (
      footprint.segmentId === 'brasilia-exporural-a5'
    ))!;
    expect(rearRoadFootprintIntersectsPolygon(exporuralSouth, brasiliaBefore.polygon)).toBe(true);
    expect(rearRoadFootprintIntersectsPolygon(exporuralSouth, brasiliaAfter.polygon)).toBe(true);
  });

  it('mantém Rua Brasília em uma única cadeia sem apropriar a Avenida dos Imigrantes', () => {
    const brasilia = REAR_PARK_ROAD_NETWORK.filter((road) => road.roadId === 'RUA-BRASILIA');
    expect(brasilia).toHaveLength(3);
    expect(new Set(brasilia.map((road) => road.roadId))).toEqual(new Set(['RUA-BRASILIA']));
    expect(brasilia.every((road) => road.officialOwnerIdentifier === 'RUA-BRASILIA')).toBe(true);
    expect(brasilia.some((road) => road.from === 'exporural-brasilia-junction' && road.to === 'gate-5')).toBe(true);
    expect(officialEntity('RUA-BRASILIA')).toBeDefined();
  });

  it('retém as travas e substitui somente as apresentações contraditórias da Brasília e BR', () => {
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
    expect(REPLACED_OFFICIAL_ROAD_IDENTIFIERS).toEqual(['RUA-BRASILIA', 'RODOVIA-RS-472']);
    expect(PROTECTED_ROAD_IDENTIFIERS).toEqual(expect.arrayContaining([
      ...EXPORURAL_ROAD_IDENTIFIERS,
      'RUA-BRASILIA',
      'AV-IMIGRANTES',
      'RODOVIA-RS-472',
    ]));
  });

  it('respeita BR > Rua Brasília > acesso e conecta todos os endpoints físicos', () => {
    const highway = REAR_PARK_ROAD_NETWORK.find((road) => road.id === 'br472-junction-west')!;
    const access = REAR_PARK_ROAD_NETWORK.find((road) => road.id === 'a5-br472-access')!;
    const brasilia = REAR_PARK_ROAD_NETWORK.find((road) => road.id === 'brasilia-exporural-a5')!;
    expect(rearRoadLocalWidth(highway)).toBeGreaterThan(rearRoadLocalWidth(access));
    expect(rearRoadLocalWidth(brasilia)).toBeGreaterThan(rearRoadLocalWidth(access));
    [highway, access, brasilia].forEach((road) => {
      expect(road.controlPoints[0]).toEqual(REAR_ROAD_NODES[road.from].position);
      expect(road.controlPoints.at(-1)).toEqual(REAR_ROAD_NODES[road.to].position);
    });
  });
});

describe('área posterior — separação e áreas protegidas', () => {
  it('mantém a BR-472 fora da Rua Exporural e de todas as sete ruas oficiais', () => {
    const highways = GENERATED_REAR_ROAD_SEGMENTS.filter((road) => road.roadId === 'RODOVIA-RS-472');
    expect(highways).toHaveLength(2);
    EXPORURAL_ROAD_IDENTIFIERS.forEach((identifier) => {
      const polygon = officialEntity(identifier).geometry.coordinates[0] as Point2[];
      highways.forEach((highway) => {
        expect(
          rearRoadCorridorIntersectsPolygon(highway, polygon),
          `${highway.id} não pode cobrir ${identifier}`,
        ).toBe(false);
      });
    });
  });

  it('não atravessa Etnias, Arena, campo, Centro de Eventos, Portão 3 ou lotes da Exporural', () => {
    const pavementFootprints = buildRearRoadCorridorFootprints(
      GENERATED_REAR_ROAD_SEGMENTS,
      { includeShoulders: false },
    );
    const protectedPolygons = [0, 1, 2, 3, 6].map((index) => (
      boundsPolygon(REAR_STRUCTURE_EXCLUSIONS[index])
    ));
    const lotIdentifiers = new Set(EXPORURAL_LOT_REFERENCES.map((reference) => (
      `Q-${reference.block}-${reference.lotNumber}`
    )));
    const exporuralLots = OFFICIAL_REFERENCE_DATA.entities.filter((entity) => (
      lotIdentifiers.has(entity.publicIdentifier)
    ));
    expect(exporuralLots).toHaveLength(95);

    pavementFootprints.forEach((footprint) => {
      protectedPolygons.forEach((polygon) => {
        expect(rearRoadFootprintIntersectsPolygon(footprint, polygon)).toBe(false);
      });
      exporuralLots.forEach((lot) => {
        expect(rearRoadFootprintIntersectsPolygon(
          footprint,
          lot.geometry.coordinates[0] as Point2[],
        )).toBe(false);
      });
    });
  });

  it('passa ao lado dos dois estacionamentos oficiais sem atravessar superfícies, acostamentos, fileiras ou vagas', () => {
    const pavementFootprints = buildRearRoadCorridorFootprints(
      GENERATED_REAR_ROAD_SEGMENTS,
      { includeShoulders: false },
    );
    const fullCorridorFootprints = buildRearRoadCorridorFootprints(
      GENERATED_REAR_ROAD_SEGMENTS,
      { includeShoulders: true },
    );
    const officialParkingPolygons = ['EST-EXP-VIS', 'EST-VIS'].map((identifier) => ({
      identifier,
      polygon: officialEntity(identifier).geometry.coordinates[0] as Point2[],
    }));

    const protectedParkingCorridors = fullCorridorFootprints.filter((footprint) => {
      const roadId = REAR_PARK_ROAD_NETWORK.find((segment) => (
        segment.id === footprint.segmentId
      ))?.roadId;
      return roadId === 'RUA-BRASILIA' || roadId === 'ACESSO-A5-BR472';
    });
    const brasiliaFootprints = protectedParkingCorridors.filter((footprint) => (
      REAR_PARK_ROAD_NETWORK.find((segment) => segment.id === footprint.segmentId)?.roadId === 'RUA-BRASILIA'
    ));
    expect(brasiliaFootprints).toHaveLength(3);
    expect(protectedParkingCorridors.some((footprint) => (
      footprint.segmentId === 'a5-br472-access'
    ))).toBe(true);
    protectedParkingCorridors.forEach((footprint) => {
      officialParkingPolygons.forEach(({ identifier, polygon }) => {
        expect(
          rearRoadFootprintIntersectsPolygon(footprint, polygon),
          `${footprint.segmentId} não pode usar ${identifier} como superfície viária`,
        ).toBe(false);
      });
    });
    pavementFootprints.forEach((footprint) => {
      REAR_PARKING_ROWS.forEach((row) => {
        expect(rearRoadFootprintIntersectsPolygon(footprint, row.polygon)).toBe(false);
      });
    });
  });

  it('preserva por snapshot a geometria oficial da Rua Ubiretama, os 95 lotes e revisão da Exporural', () => {
    const before = JSON.stringify({
      geometry: officialEntity('RUA-UBIRETAMA').geometry,
      lots: EXPORURAL_LOT_REFERENCES,
      roads: EXPORURAL_ROAD_IDENTIFIERS,
    });
    expect(EXPORURAL_GEOMETRY_REVISION).toBe('2026.4-exporural.1');
    const geometries = buildRearRoadNetworkGeometries();
    try {
      expect(JSON.stringify({
        geometry: officialEntity('RUA-UBIRETAMA').geometry,
        lots: EXPORURAL_LOT_REFERENCES,
        roads: EXPORURAL_ROAD_IDENTIFIERS,
      })).toBe(before);
    } finally {
      disposeRearRoadNetworkGeometries(geometries);
    }
  });
});

describe('área posterior — calibração dos dez pontos', () => {
  it('usa os anexos novos nas dimensões reais e mantém resíduo inferior a 2%', () => {
    expect(REAR_SATELLITE_REFERENCES['annex-4']).toMatchObject({
      filename: 'E9A49EC4-3EF4-4807-B145-ADBACF1476B9.jpeg',
      pixelSize: [1536, 864],
    });
    expect(REAR_SATELLITE_REFERENCES['annex-5']).toMatchObject({
      filename: 'A278B223-C14D-4618-99FC-AD060FFF7DF5.jpeg',
      pixelSize: [1536, 961],
    });
    (['annex-4', 'annex-5'] as const).forEach((referenceId) => {
      expect(REAR_SATELLITE_REFERENCES[referenceId].controls).toHaveLength(10);
      expect(rearCalibrationDiagnostics(referenceId).normalizedMaximumResidual).toBeLessThan(0.02);
    });

    for (const controlId of ['gate-5', 'br472-junction', 'football-field']) {
      const control4 = REAR_SATELLITE_REFERENCES['annex-4'].controls.find((control) => control.id === controlId)!;
      const control5 = REAR_SATELLITE_REFERENCES['annex-5'].controls.find((control) => control.id === controlId)!;
      const local4 = projectSatellitePixelToLocal('annex-4', control4.satellitePixel);
      const local5 = projectSatellitePixelToLocal('annex-5', control5.satellitePixel);
      expect(Math.hypot(local4[0] - local5[0], local4[1] - local5[1])).toBeLessThan(0.58);
    }
  });

  it('registra percentuais, pixels e papéis sem transformar P8/P9 em vias', () => {
    expect(REAR_NORMALIZED_REFERENCE_POINTS).toHaveLength(10);
    expect(rearNormalizedReferencePointById(1)).toMatchObject({
      percent: [68, 43], satellitePixel: [1044.48, 371.52], role: 'exporural-axis',
    });
    expect(rearNormalizedReferencePointById(10)).toMatchObject({
      percent: [41, 60], satellitePixel: [629.76, 518.4], role: 'exporural-axis',
    });
    const point2 = rearNormalizedReferencePointById(2);
    expect(point2).toMatchObject({ percent: [71, 71], role: 'br472-axis' });
    expect(point2.satellitePixel[0]).toBeCloseTo(1090.56, 8);
    expect(point2.satellitePixel[1]).toBeCloseTo(613.44, 8);
    const point7 = rearNormalizedReferencePointById(7);
    expect(point7).toMatchObject({ percent: [21, 96], role: 'br472-axis' });
    expect(point7.satellitePixel[0]).toBeCloseTo(322.56, 8);
    expect(point7.satellitePixel[1]).toBeCloseTo(829.44, 8);
    expect(REAR_ROAD_NODES['br472-east'].sourcePoint).toEqual(
      projectRearNormalizedReferencePointToOfficialSource(2),
    );
    expect(REAR_ROAD_NODES['br472-west'].sourcePoint).toEqual(
      projectRearNormalizedReferencePointToOfficialSource(7),
    );
    expect(rearNormalizedReferencePointsByRole('environment').map((point) => point.id)).toEqual([8, 9]);
  });

  it('reconcilia P1/P10, P2/P7 e P3/P4/P5 com as exclusões físicas oficiais', () => {
    const exporuralAxis = axisToLocal([
      ...REAR_CALIBRATED_AXES.exporuralNorthExtension,
      ...REAR_CALIBRATED_AXES.exporuralOfficial.slice(1),
      ...REAR_CALIBRATED_AXES.exporuralSouthExtension.slice(1),
    ]);
    const br472Axis = axisToLocal([
      ...[...REAR_CALIBRATED_AXES.br472JunctionToWest].reverse(),
      ...[...REAR_CALIBRATED_AXES.br472EastToJunction].reverse().slice(1),
    ]);
    const brasiliaAxis = axisToLocal([
      ...REAR_CALIBRATED_AXES.brasiliaOfficialToP3,
      ...REAR_CALIBRATED_AXES.brasiliaContinuation.slice(1),
    ]);
    [1, 10].forEach((id) => expect(distanceToPath(
      projectRearNormalizedReferencePointToLocal(id as 1 | 10), exporuralAxis,
    )).toBeLessThan(0.01));
    [2, 7].forEach((id) => expect(distanceToPath(
      projectRearNormalizedReferencePointToLocal(id as 2 | 7), br472Axis,
    )).toBeLessThan(0.01));

    const brasiliaWidth = REAR_PARK_ROAD_NETWORK.find((road) => (
      road.id === 'brasilia-reference-3-exporural'
    ))!.width;
    expect(distanceToPath(
      projectRearNormalizedReferencePointToLocal(3),
      brasiliaAxis,
    )).toBeLessThanOrEqual(brasiliaWidth / 2);

    const point4Source = projectRearNormalizedReferencePointToOfficialSource(4);
    const point5Source = projectRearNormalizedReferencePointToOfficialSource(5);
    const point4Clearance = REAR_CALIBRATED_AXES.brasiliaContinuation.find((point) => (
      Math.abs(point[0] - point4Source[0]) < 1e-8
    ))!;
    const calibratedJunction = REAR_CALIBRATED_AXES.exporuralSouthExtension.at(-1)!;
    expect(point4Clearance[0]).toBeCloseTo(point4Source[0], 8);
    expect(calibratedJunction[0]).toBeCloseTo(point5Source[0], 8);
    expect(point4Clearance[1]).toBeGreaterThan(point4Source[1]);
    expect(calibratedJunction[1]).toBeGreaterThan(point5Source[1]);
    expect(REAR_CALIBRATED_AXES.brasiliaContinuation).toContain(calibratedJunction);

    const officialParkingPolygons = ['EST-EXP-VIS', 'EST-VIS'].map((identifier) => (
      officialEntity(identifier).geometry.coordinates[0] as Point2[]
    ));
    [point4Clearance, calibratedJunction].forEach((sourcePoint) => {
      const local = officialPdfPointToLocal(sourcePoint);
      officialParkingPolygons.forEach((polygon) => {
        expect(pointIsInsidePolygon(local, polygon)).toBe(false);
      });
      expect(distanceToPath(local, brasiliaAxis)).toBeLessThan(0.01);
    });
    expect(distanceToPath(officialPdfPointToLocal(calibratedJunction), exporuralAxis)).toBeLessThan(0.01);
  });

  it('faz P6 coincidir com o A5 e mantém P8/P9 ambientais fora de pista e acostamento', () => {
    expect(projectRearNormalizedReferencePointToOfficialSource(6)).toEqual(REAR_OFFICIAL_ANCHORS.gate5Entity);
    const point6Local = projectRearNormalizedReferencePointToLocal(6);
    expect(point6Local[0]).toBeCloseTo(OFFICIAL_GATE_5_CENTER[0], 10);
    expect(point6Local[1]).toBeCloseTo(OFFICIAL_GATE_5_CENTER[1], 10);
    expect(REAR_ENVIRONMENT_REFERENCE_POINTS.point8).toEqual(projectRearNormalizedReferencePointToOfficialSource(8));
    expect(REAR_ENVIRONMENT_REFERENCE_POINTS.point9).toEqual(projectRearNormalizedReferencePointToOfficialSource(9));

    const terrain = sourcePolygonToLocal(REAR_TERRAIN_PATCHES[0].sourcePolygon);
    ([8, 9] as const).forEach((id) => {
      const local = projectRearNormalizedReferencePointToLocal(id);
      expect(pointIsInsidePolygon(local, terrain)).toBe(true);
      expect(pointIsInsideAnyRearRoadCorridor(local)).toBe(false);
    });
  });
});

describe('área posterior — ribbons, ambiente e orçamento', () => {
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

  it('gera ribbons, acostamentos, faixas e patches de junção dentro do orçamento', () => {
    const detailed = buildRearRoadNetworkGeometries();
    const reduced = buildRearRoadNetworkGeometries(undefined, { reducedGraphics: true });
    try {
      expect(detailed.highway).not.toBeNull();
      expect(detailed.parkAsphalt).not.toBeNull();
      expect(detailed.shoulders).not.toBeNull();
      expect(detailed.markings).not.toBeNull();
      expect(detailed.diagnostics.junctionCount).toBeGreaterThanOrEqual(3);
      expect(detailed.diagnostics.estimatedBaseDrawCalls).toBeLessThanOrEqual(REAR_ROAD_BUDGET.maximumBaseDrawCalls);
      expect(detailed.diagnostics.triangleCount).toBeLessThan(REAR_ROAD_BUDGET.maximumTriangles);
      expect(reduced.diagnostics.triangleCount).toBeLessThan(detailed.diagnostics.triangleCount);
      [detailed.highway, detailed.parkAsphalt, detailed.shoulders, detailed.markings].forEach((geometry) => {
        const positions = geometry?.getAttribute('position');
        expect(positions && Array.from(positions.array).every(Number.isFinite)).toBe(true);
      });
    } finally {
      disposeRearRoadNetworkGeometries(detailed);
      disposeRearRoadNetworkGeometries(reduced);
    }
  });

  it('usa um terreno irregular único, vegetação localizada e nenhum elemento sobre as vias', () => {
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
    trees.forEach((tree) => {
      expect(pointIsInsideAnyRearRoadCorridor([tree.x, tree.z], REAR_PARK_ROAD_NETWORK)).toBe(false);
    });

    expect(buildRearPoleInstances().length).toBeGreaterThan(0);
    expect(buildRearPoleInstances().length).toBeLessThanOrEqual(REAR_ENVIRONMENT_BUDGET.maximumPoleInstances);
    expect(buildRearPoleInstances(true)).toHaveLength(0);
  });
});
