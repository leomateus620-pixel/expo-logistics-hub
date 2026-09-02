import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHURRASCARIA_ACCESS_CORRECTION,
  COMMERCIAL_MAP_ANNEX_CORRECTION_REVISION,
  ETNIAS_PARKING_CONNECTION_CORRECTION,
  EVENT_CENTER_QE12_ALIGNMENT,
  EXPORURAL_SMOOTH_CONCRETE_CORRECTION,
  PORTAO5_PARKING_ACCESS_CORRECTION,
  PORTAO5_PARKING_ACCESS_JUNCTIONS,
  RUA_BRASILIA_OFFICIAL_RESTORATION,
  annexSourceWidthToLocal,
  portao5ParkingAccessSourceAxis,
} from '@/features/commercial-map/data/annexSpatialCorrections';
import {
  EXPORURAL_GATE_ACCESS_ROAD_SURFACE_IDS,
  PARK_ACCESS_SOURCE_POINTS_PER_METER,
  PARK_ACCESS_SPATIAL_PLAN,
  type ParkAccessPoint,
} from '@/features/commercial-map/data/parkAccessSpatialPlan';
import {
  GENERATED_REAR_ROAD_SEGMENTS,
  REAR_PARK_ROAD_NETWORK,
  REAR_PARK_ROAD_REVISION,
  REAR_ROAD_NODES,
  REPLACED_OFFICIAL_ROAD_IDENTIFIERS,
  rearContextualLabelAnchorForOfficialOwner,
  rearRoadLocalPath,
  roadGraphPath,
} from '@/features/commercial-map/data/rearParkRoadNetwork';
import {
  OFFICIAL_REFERENCE_DATA,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';
import {
  REAR_CALIBRATED_AXES,
  REAR_OFFICIAL_ANCHORS,
  REAR_SPATIAL_CALIBRATION_REVISION,
  projectRearAttachment5PointToOfficialSource,
} from '@/features/commercial-map/utils/rearSpatialCalibration';
import {
  REAR_ROAD_BUDGET,
  buildRearRoadCorridorFootprints,
  buildRearRoadNetworkGeometries,
  disposeRearRoadNetworkGeometries,
  rearRoadFootprintIntersectsPolygon,
  sampleRearRoadCenterline,
} from '@/features/commercial-map/utils/rearRoadNetwork';

function officialEntity(identifier: string) {
  const matches = OFFICIAL_REFERENCE_DATA.entities.filter((entity) => (
    entity.publicIdentifier.toLocaleUpperCase('pt-BR') === identifier
  ));
  expect(matches, identifier).toHaveLength(1);
  return matches[0];
}

function headingDegrees(from: ParkAccessPoint, to: ParkAccessPoint) {
  return Math.atan2(to[0] - from[0], to[1] - from[1]) * (180 / Math.PI);
}

function wrappedDeltaDegrees(from: number, to: number) {
  let delta = to - from;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return Math.abs(delta);
}

function catmullRomMaxHeadingChangePer10m(path: readonly ParkAccessPoint[]) {
  const unique = sampleRearRoadCenterline(path, 12).filter((point, index, points) => (
    index === 0
    || Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]) > 1e-8
  ));
  if (unique.length < 3) return 0;
  const distances = [0];
  for (let index = 1; index < unique.length; index += 1) {
    distances[index] = distances[index - 1] + Math.hypot(
      unique[index][0] - unique[index - 1][0],
      unique[index][1] - unique[index - 1][1],
    );
  }
  const headings = unique.slice(0, -1).map((point, index) => headingDegrees(point, unique[index + 1]));
  const windowMeters = 1.5;
  let worst = 0;
  for (let start = 0; start < headings.length; start += 1) {
    let end = start + 1;
    while (end < distances.length - 1 && distances[end] - distances[start] < windowMeters) end += 1;
    if (distances[end] - distances[start] < windowMeters * 0.8) continue;
    worst = Math.max(
      worst,
      wrappedDeltaDegrees(headings[start], headings[Math.min(end, headings.length - 1)]),
    );
  }
  return worst;
}

function ringBounds(ring: readonly (readonly [number, number])[]) {
  return {
    minX: Math.min(...ring.map(([x]) => x)),
    maxX: Math.max(...ring.map(([x]) => x)),
    minZ: Math.min(...ring.map(([, z]) => z)),
    maxZ: Math.max(...ring.map(([, z]) => z)),
  };
}

function openPolygon(polygon: readonly ParkAccessPoint[]) {
  const first = polygon[0];
  const last = polygon.at(-1);
  return first && last && first[0] === last[0] && first[1] === last[1]
    ? polygon.slice(0, -1)
    : [...polygon];
}

function cross(first: ParkAccessPoint, second: ParkAccessPoint, third: ParkAccessPoint) {
  return (second[0] - first[0]) * (third[1] - first[1])
    - (second[1] - first[1]) * (third[0] - first[0]);
}

function pointOnSegment(point: ParkAccessPoint, from: ParkAccessPoint, to: ParkAccessPoint) {
  const epsilon = 1e-7;
  return Math.abs(cross(from, to, point)) <= epsilon
    && point[0] >= Math.min(from[0], to[0]) - epsilon
    && point[0] <= Math.max(from[0], to[0]) + epsilon
    && point[1] >= Math.min(from[1], to[1]) - epsilon
    && point[1] <= Math.max(from[1], to[1]) + epsilon;
}

function pointInPolygon(point: ParkAccessPoint, polygon: readonly ParkAccessPoint[]) {
  const ring = openPolygon(polygon);
  if (ring.some((from, index) => pointOnSegment(point, from, ring[(index + 1) % ring.length]))) {
    return true;
  }
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentX, currentZ] = ring[index];
    const [previousX, previousZ] = ring[previous];
    const crosses = (currentZ > point[1]) !== (previousZ > point[1]);
    if (crosses) {
      const intersectionX = ((previousX - currentX) * (point[1] - currentZ))
        / (previousZ - currentZ) + currentX;
      if (point[0] < intersectionX) inside = !inside;
    }
  }
  return inside;
}

function segmentsIntersect(
  firstFrom: ParkAccessPoint,
  firstTo: ParkAccessPoint,
  secondFrom: ParkAccessPoint,
  secondTo: ParkAccessPoint,
) {
  const firstSide = cross(firstFrom, firstTo, secondFrom);
  const secondSide = cross(firstFrom, firstTo, secondTo);
  const thirdSide = cross(secondFrom, secondTo, firstFrom);
  const fourthSide = cross(secondFrom, secondTo, firstTo);
  const firstStraddles = (firstSide > 0) !== (secondSide > 0);
  const secondStraddles = (thirdSide > 0) !== (fourthSide > 0);
  return (firstStraddles && secondStraddles)
    || (firstSide === 0 && pointOnSegment(secondFrom, firstFrom, firstTo))
    || (secondSide === 0 && pointOnSegment(secondTo, firstFrom, firstTo))
    || (thirdSide === 0 && pointOnSegment(firstFrom, secondFrom, secondTo))
    || (fourthSide === 0 && pointOnSegment(firstTo, secondFrom, secondTo));
}

function polygonsIntersect(
  firstPolygon: readonly ParkAccessPoint[],
  secondPolygon: readonly ParkAccessPoint[],
) {
  const first = openPolygon(firstPolygon);
  const second = openPolygon(secondPolygon);
  if (first.some((point) => pointInPolygon(point, secondPolygon))) return true;
  if (second.some((point) => pointInPolygon(point, firstPolygon))) return true;
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstFrom = first[firstIndex];
    const firstTo = first[(firstIndex + 1) % first.length];
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      if (segmentsIntersect(
        firstFrom,
        firstTo,
        second[secondIndex],
        second[(secondIndex + 1) % second.length],
      )) return true;
    }
  }
  return false;
}

describe('anexos 1/2/4 — blueprint e fiação viária', () => {
  it('recria as constantes do blueprint sem inventar cadastro', () => {
    expect(COMMERCIAL_MAP_ANNEX_CORRECTION_REVISION).toBe('2026.9-anexo3-satellite.1');
    expect(REAR_PARK_ROAD_REVISION).toBe(COMMERCIAL_MAP_ANNEX_CORRECTION_REVISION);
    expect(REAR_SPATIAL_CALIBRATION_REVISION).toBe(COMMERCIAL_MAP_ANNEX_CORRECTION_REVISION);

    expect(CHURRASCARIA_ACCESS_CORRECTION).toMatchObject({
      id: 'ACESSO-CHURRASCARIA',
      officialOwnerIdentifier: 'RUA-EMANUEL-BRACHMANN',
      widthSource: 36,
      connections: { north: 'RUA-GUSTAVO-BESSEL', east: 'RUA-15-NOVEMBRO' },
    });
    expect([...CHURRASCARIA_ACCESS_CORRECTION.sourceAxis]).toEqual([
      [4875, 2059.5], [4875, 2260], [4875, 2295], [4884, 2330],
      [4915, 2351.5], [5100, 2351.5], [5207.5, 2351.5],
    ]);

    expect(PORTAO5_PARKING_ACCESS_CORRECTION.widthSource).toBe(36);
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.streetToCurve[0]).toEqual([4528, 3150]);
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.streetToCurve.at(-1)).toEqual([4856, 3248]);
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.curveToEtniasJunction[0]).toEqual([4856, 3248]);
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.curveToEtniasJunction.at(-1)).toEqual([5260, 3248]);
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.etniasToUbiretamaJunction[0]).toEqual([5260, 3248]);
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.etniasToUbiretamaJunction.at(-1)).toEqual([5548, 3248]);
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.gate5Approach[0]).toEqual([5548, 3248]);
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.gate5Approach.at(-1)).toEqual([5940, 3678]);

    expect(ETNIAS_PARKING_CONNECTION_CORRECTION).toMatchObject({
      officialOwnerIdentifier: 'AV-IMIGRANTES',
      widthSource: 36,
      avenueEntry: [5260, 4200],
      parkingJunction: [5260, 3248],
    });
    expect([...ETNIAS_PARKING_CONNECTION_CORRECTION.sourceAxis]).toEqual([
      [5260, 4200], [5260, 4140], [5260, 3950], [5262, 3750], [5262, 3480], [5260, 3248],
    ]);

    expect(RUA_BRASILIA_OFFICIAL_RESTORATION).toEqual({
      publicIdentifier: 'RUA-BRASILIA',
      sourceBounds: [3940, 2440, 3988, 4210],
      sourceAxis: [[3964, 2440], [3964, 3300], [3964, 4210]],
      connectsGateIdentifier: 'A3',
      presentation: 'official-surface',
    });

    expect(EXPORURAL_SMOOTH_CONCRETE_CORRECTION).toMatchObject({
      id: 'exporural-smooth-concrete-annex',
      officialOwnerIdentifier: 'C4',
      elevation: 0.06,
      concrete: '#c6c7c2',
      roughness: 0.94,
      tileWorldSize: 1.7,
    });
    expect(EVENT_CENTER_QE12_ALIGNMENT).toEqual({
      eventCenterIdentifier: 'C1',
      targetLotIdentifier: 'Q-E-12',
      eventCenterSourceCenter: [4255, 3307.5],
      targetSourceCenter: [3885, 3309.5],
      facingRadians: -1.565390974146972,
    });

    expect(JSON.stringify(CHURRASCARIA_ACCESS_CORRECTION)).not.toContain('RUA-15-DE-NOVEMBRO');
    expect(officialEntity('RUA-15-NOVEMBRO').name).toBe('Rua 15 de Novembro');
    expect(officialEntity('Q-E-12').publicIdentifier).toBe('Q-E-12');
    expect(officialEntity('C1').publicIdentifier).toBe('C1');
    expect(officialEntity('C4').publicIdentifier).toBe('C4');
    expect(officialEntity('A5').publicIdentifier).toBe('A5');
    expect(officialEntity('F')).toBeDefined();
  });

  it('mantém a fita oficial da Rua Brasília visível e sem malha paralela gerada', () => {
    expect(REPLACED_OFFICIAL_ROAD_IDENTIFIERS).toEqual(['RUA-UBIRETAMA', 'RODOVIA-RS-472']);
    expect(REPLACED_OFFICIAL_ROAD_IDENTIFIERS).not.toContain('RUA-BRASILIA');
    expect(GENERATED_REAR_ROAD_SEGMENTS.some((road) => road.roadId === 'RUA-BRASILIA')).toBe(false);

    const official = REAR_PARK_ROAD_NETWORK.find((road) => road.id === 'brasilia-official-axis');
    expect(official).toMatchObject({
      presentation: 'official-surface',
      officialOwnerIdentifier: 'RUA-BRASILIA',
      sourceControlPoints: RUA_BRASILIA_OFFICIAL_RESTORATION.sourceAxis,
    });

    const brasilia = officialEntity('RUA-BRASILIA');
    const bounds = ringBounds(brasilia.geometry.coordinates[0]);
    const localAxis = RUA_BRASILIA_OFFICIAL_RESTORATION.sourceAxis.map(officialPdfPointToLocal);
    localAxis.forEach(([x, z]) => {
      expect(x).toBeGreaterThanOrEqual(bounds.minX - 1e-6);
      expect(x).toBeLessThanOrEqual(bounds.maxX + 1e-6);
      expect(z).toBeGreaterThanOrEqual(bounds.minZ - 1e-6);
      expect(z).toBeLessThanOrEqual(bounds.maxZ + 1e-6);
    });
    expect(rearContextualLabelAnchorForOfficialOwner('RUA-BRASILIA')).toEqual(
      officialPdfPointToLocal([3964, 3300]),
    );

    const networkSource = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/data/rearParkRoadNetwork.ts',
    ), 'utf8');
    expect(networkSource).not.toMatch(/REPLACED_OFFICIAL_ROAD_IDENTIFIERS[\s\S]{0,200}'RUA-BRASILIA'/);

    const canvasSource = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    ), 'utf8');
    expect(canvasSource).toContain('Rua Brasília is intentionally retained');
  });

  it('materializa o acesso ao Portão 5 com curva leve e preserva o trevo da BR-472', () => {
    expect(projectRearAttachment5PointToOfficialSource(3)).toEqual([4528, 3150]);
    expect(projectRearAttachment5PointToOfficialSource(2)).toEqual([4856, 3248]);
    expect(projectRearAttachment5PointToOfficialSource(4)).toEqual([5548, 3248]);
    expect(projectRearAttachment5PointToOfficialSource(6)).toEqual([5940, 3678]);
    expect(PORTAO5_PARKING_ACCESS_JUNCTIONS).toEqual({
      street: [4528, 3150],
      curve: [4856, 3248],
      etnias: [5260, 3248],
      ubiretama: [5548, 3248],
      gate5: [5940, 3678],
    });
    expect(REAR_OFFICIAL_ANCHORS.gate5Entity).toEqual([5974, 3678]);

    expect([...REAR_CALIBRATED_AXES.portao5StreetToCurve]).toEqual(
      [...PORTAO5_PARKING_ACCESS_CORRECTION.streetToCurve],
    );
    expect([...REAR_CALIBRATED_AXES.gate5InternalApproach]).toEqual(
      [...PORTAO5_PARKING_ACCESS_CORRECTION.gate5Approach],
    );

    const parking = GENERATED_REAR_ROAD_SEGMENTS.filter(
      (road) => road.roadId === 'RUA-UBIRETAMA' && road.id !== 'ubiretama-north-junction',
    );
    expect(parking).toHaveLength(3);
    expect(parking.every((road) => road.officialOwnerIdentifier === 'RUA-UBIRETAMA')).toBe(true);
    expect(parking.every((road) => (
      Math.abs(road.width - annexSourceWidthToLocal(36)) < 1e-9
    ))).toBe(true);

    const access = REAR_PARK_ROAD_NETWORK.filter((road) => road.roadId === 'ACESSO-A5-BR472');
    expect(access.map((road) => road.id)).toEqual([
      'gate5-internal-approach',
      'a5-trevo-trunk',
      'a5-br472-north-ramp',
      'a5-br472-south-ramp',
    ]);
    expect(REAR_CALIBRATED_AXES.a5TrevoTrunk).toEqual([
      [5940, 3678], [5998, 3678], [6058, 3678],
    ]);
    expect(REAR_CALIBRATED_AXES.a5NorthRamp).toEqual([
      [6058, 3678], [6084, 3628], [6104, 3570], [6112, 3520],
    ]);
    expect(REAR_CALIBRATED_AXES.a5SouthRamp).toEqual([
      [6058, 3678], [6088, 3730], [6112, 3790], [6126, 3840],
    ]);
    expect(REAR_CALIBRATED_AXES.br472NorthToNorthRamp).toEqual([
      [6046, 1300], [6072, 2100], [6096, 2900], [6112, 3520],
    ]);
    expect(REAR_CALIBRATED_AXES.br472NorthRampToSouthRamp).toEqual([
      [6112, 3520], [6120, 3678], [6126, 3840],
    ]);
    expect(REAR_CALIBRATED_AXES.br472SouthRampToSouth).toEqual([
      [6126, 3840], [6136, 4100], [6146, 4400],
    ]);
    expect(REAR_CALIBRATED_AXES.br472NorthRampToSouthRamp[1]).toEqual([6120, 3678]);

    const generatedIds = GENERATED_REAR_ROAD_SEGMENTS.map((road) => road.id);
    expect(generatedIds).not.toContain('brasilia-brasil-parking');
    expect(generatedIds).not.toContain('brasilia-parking-gate');
    expect(portao5ParkingAccessSourceAxis()[0]).toEqual([4528, 3150]);
    expect(portao5ParkingAccessSourceAxis().at(-1)).toEqual([5940, 3678]);
  });

  it('cria a ligação das Etnias e restaura o caminho Brasília → A5 pelo cadastro', () => {
    expect(roadGraphPath('brasilia', 'A5')).toEqual([
      'brasilia-north',
      'brasilia-south',
      'etnias-west',
      'etnias-parking-avenue',
      'etnias-parking-junction',
      'ubiretama-portao5-junction',
      'gate-5',
    ]);
    const etnias = GENERATED_REAR_ROAD_SEGMENTS.find((road) => road.id === 'etnias-parking-connection');
    expect(etnias).toMatchObject({
      officialOwnerIdentifier: 'AV-IMIGRANTES',
      sourceControlPoints: REAR_CALIBRATED_AXES.etniasParkingConnection,
    });
    expect(REAR_CALIBRATED_AXES.etniasParkingConnection[0]).toEqual(
      ETNIAS_PARKING_CONNECTION_CORRECTION.avenueEntry,
    );
    expect(REAR_CALIBRATED_AXES.etniasParkingConnection.at(-1)).toEqual(
      ETNIAS_PARKING_CONNECTION_CORRECTION.parkingJunction,
    );
    expect(JSON.stringify({ roads: REAR_PARK_ROAD_NETWORK, nodes: {} })).not.toContain('A3');
  });

  it('desfaz o PR #110 e alinha Brasília / Ubiretama / Portão 5 ao satélite', () => {
    const axis = portao5ParkingAccessSourceAxis();
    expect(axis[0]).toEqual([4528, 3150]);
    expect(axis.at(-1)).toEqual([5940, 3678]);
    expect(axis.filter(([x]) => x === 4528)).toHaveLength(1);
    expect(axis.slice(1).every(([x], index) => x > axis[index][0])).toBe(true);

    const rejected = [
      [4528, 3248], [4528, 3360], [4528, 3438], [4528, 3480],
      [5260, 3661], [5129, 3656],
    ] as const;
    const rendered = GENERATED_REAR_ROAD_SEGMENTS.flatMap((road) => [...road.sourceControlPoints]);
    rejected.forEach((point) => {
      expect(
        rendered.some(([x, y]) => x === point[0] && y === point[1]),
        `regressão ${point.join(',')}`,
      ).toBe(false);
    });
    expect(axis.some(([x, y]) => y >= 3640 && y <= 3680 && x < 5600)).toBe(false);

    const curve = GENERATED_REAR_ROAD_SEGMENTS.find((road) => road.id === 'portao5-street-curve')!;
    expect(Math.abs(headingDegrees(axis[0], axis[1]))).toBeGreaterThan(50);
    expect(catmullRomMaxHeadingChangePer10m(rearRoadLocalPath(curve))).toBeLessThan(55);

    const arenaEast = 5385;
    const arenaSouth = 3130;
    expect(PORTAO5_PARKING_ACCESS_JUNCTIONS.ubiretama[0]).toBeGreaterThan(arenaEast);
    expect(PORTAO5_PARKING_ACCESS_JUNCTIONS.ubiretama[1]).toBeGreaterThan(arenaSouth);
    expect(PORTAO5_PARKING_ACCESS_JUNCTIONS.ubiretama[1]).toBeLessThan(3360);
    expect(axis.some(([x]) => x > arenaEast)).toBe(true);
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.gate5Approach.every(([x]) => x > arenaEast)).toBe(true);
    const southRibbon = [
      ...PORTAO5_PARKING_ACCESS_CORRECTION.curveToEtniasJunction,
      ...PORTAO5_PARKING_ACCESS_CORRECTION.etniasToUbiretamaJunction.slice(1),
    ];
    southRibbon.forEach(([, y]) => {
      expect(y).toBeGreaterThanOrEqual(arenaSouth);
      expect(Math.abs(y - 3248)).toBeLessThanOrEqual(20);
    });

    const ubiretama = REAR_CALIBRATED_AXES.ubiretamaNorthToJunction;
    expect(ubiretama.at(-1)).toEqual([5548, 3248]);
    expect(ubiretama.every(([x]) => x > arenaEast)).toBe(true);
    expect(REAR_ROAD_NODES['ubiretama-portao5-junction'].sourcePoint).toEqual([5548, 3248]);
    expect(ETNIAS_PARKING_CONNECTION_CORRECTION.parkingJunction).toEqual([5260, 3248]);
    expect(ETNIAS_PARKING_CONNECTION_CORRECTION.parkingJunction).not.toEqual([5260, 3661]);

    const brasilia = officialEntity('RUA-BRASILIA').geometry.coordinates[0] as ParkAccessPoint[];
    const ruaBrasil = officialEntity('RUA-BRASIL').geometry.coordinates[0] as ParkAccessPoint[];
    expect(polygonsIntersect(brasilia, ruaBrasil)).toBe(true);
    expect(RUA_BRASILIA_OFFICIAL_RESTORATION.sourceBounds).toEqual([3940, 2440, 3988, 4210]);
    expect(REPLACED_OFFICIAL_ROAD_IDENTIFIERS).not.toContain('RUA-BRASILIA');

    const arena = officialEntity('F').geometry.coordinates[0] as ParkAccessPoint[];
    const arenaBounds = ringBounds(arena);
    expect(arenaBounds.minX).toBeCloseTo(officialPdfPointToLocal([4900, 2690])[0], 8);
    expect(arenaBounds.maxX).toBeCloseTo(officialPdfPointToLocal([5385, 3130])[0], 8);
    const footprints = buildRearRoadCorridorFootprints(GENERATED_REAR_ROAD_SEGMENTS, {
      includeShoulders: true,
    });
    footprints.forEach((footprint) => {
      expect(rearRoadFootprintIntersectsPolygon(footprint, arena), footprint.segmentId).toBe(false);
    });

    const detailed = buildRearRoadNetworkGeometries();
    try {
      expect(detailed.diagnostics.estimatedBaseDrawCalls).toBeLessThanOrEqual(REAR_ROAD_BUDGET.maximumBaseDrawCalls);
      expect(detailed.diagnostics.triangleCount).toBeLessThan(REAR_ROAD_BUDGET.maximumTriangles);
    } finally {
      disposeRearRoadNetworkGeometries(detailed);
    }
  });

  it('pavimenta o L da Churrascaria contra as vias oficiais sem invadir C4 nem o concreto', () => {
    const road = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.find((surface) => (
      surface.id === 'acesso-churrascaria'
    ));
    expect(road).toBeDefined();
    expect(EXPORURAL_GATE_ACCESS_ROAD_SURFACE_IDS).toContain('acesso-churrascaria');
    expect(road).toMatchObject({
      kind: 'ASPHALT_ACCESS_ROAD',
      supportAware: false,
      connects: [
        'RUA-GUSTAVO-BESSEL',
        'RUA-15-NOVEMBRO',
        'RUA-EMANUEL-BRACHMANN',
      ],
    });
    expect(road!.widthMeters).toBeCloseTo(
      CHURRASCARIA_ACCESS_CORRECTION.widthSource / PARK_ACCESS_SOURCE_POINTS_PER_METER,
      8,
    );
    expect([...road!.sourcePdfCenterline]).toEqual([...CHURRASCARIA_ACCESS_CORRECTION.sourceAxis]);

    const [gustavo, novembro, emanuel, churrascaria] = [
      'RUA-GUSTAVO-BESSEL',
      'RUA-15-NOVEMBRO',
      'RUA-EMANUEL-BRACHMANN',
      'C4',
    ].map((identifier) => officialEntity(identifier).geometry.coordinates[0] as ParkAccessPoint[]);

    expect(polygonsIntersect(road!.polygon, gustavo)).toBe(true);
    expect(polygonsIntersect(road!.polygon, novembro)).toBe(true);
    expect(polygonsIntersect(road!.polygon, churrascaria)).toBe(false);

    const concrete = EXPORURAL_SMOOTH_CONCRETE_CORRECTION.sourcePolygon.map(officialPdfPointToLocal);
    expect(polygonsIntersect(road!.polygon, concrete)).toBe(false);
    expect(emanuel).toBeDefined();

    const eventCenterSource = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/utils/eventCenter.ts',
    ), 'utf8');
    const parkEnvironmentSource = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/data/parkEnvironment.ts',
    ), 'utf8');
    expect(eventCenterSource).not.toContain('annexSpatialCorrections');
    expect(parkEnvironmentSource).not.toContain("from './annexSpatialCorrections'");
    expect(parkEnvironmentSource).not.toContain('EVENT_CENTER_QE12_ALIGNMENT');
  });

  it('não cruza o cadastro da Arena F nem inventa overlay verde/vermelho', () => {
    const arena = ringBounds(officialEntity('F').geometry.coordinates[0]);
    const parkingAxis = portao5ParkingAccessSourceAxis().map(officialPdfPointToLocal);
    const halfWidth = annexSourceWidthToLocal(36) / 2;
    parkingAxis.forEach(([x, z]) => {
      const hits = x > arena.minX - halfWidth && x < arena.maxX + halfWidth
        && z > arena.minZ - halfWidth && z < arena.maxZ + halfWidth;
      expect(hits, `${x},${z}`).toBe(false);
    });

    const rearNetwork = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/data/rearParkRoadNetwork.ts',
    ), 'utf8');
    const parkAccess = readFileSync(resolve(
      process.cwd(), 'src/features/commercial-map/data/parkAccessSpatialPlan.ts',
    ), 'utf8');
    expect(rearNetwork).not.toMatch(/overlay|hint.?mesh|#00ff00|#ff0000/i);
    expect(parkAccess).not.toMatch(/green overlay|red overlay/i);
  });
});
