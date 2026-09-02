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
  REPLACED_OFFICIAL_ROAD_IDENTIFIERS,
  rearContextualLabelAnchorForOfficialOwner,
  roadGraphPath,
} from '@/features/commercial-map/data/rearParkRoadNetwork';
import {
  OFFICIAL_REFERENCE_DATA,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';
import {
  REAR_CALIBRATED_AXES,
  REAR_SPATIAL_CALIBRATION_REVISION,
  projectRearAttachment5PointToOfficialSource,
} from '@/features/commercial-map/utils/rearSpatialCalibration';

function officialEntity(identifier: string) {
  const matches = OFFICIAL_REFERENCE_DATA.entities.filter((entity) => (
    entity.publicIdentifier.toLocaleUpperCase('pt-BR') === identifier
  ));
  expect(matches, identifier).toHaveLength(1);
  return matches[0];
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
    expect(COMMERCIAL_MAP_ANNEX_CORRECTION_REVISION).toBe('2026.9-annex-road-precision.1');
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
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.streetToCurve.at(-1)).toEqual([4980, 3460]);
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.curveToEtniasJunction[0]).toEqual([4980, 3460]);
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.curveToEtniasJunction.at(-1)).toEqual([5290, 3500]);
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.etniasToUbiretamaJunction[0]).toEqual([5290, 3500]);
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.etniasToUbiretamaJunction.at(-1)).toEqual([5700, 3588]);
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.gate5Approach[0]).toEqual([5700, 3588]);
    expect(PORTAO5_PARKING_ACCESS_CORRECTION.gate5Approach.at(-1)).toEqual([5940, 3678]);

    expect(ETNIAS_PARKING_CONNECTION_CORRECTION).toMatchObject({
      officialOwnerIdentifier: 'AV-IMIGRANTES',
      widthSource: 36,
      avenueEntry: [5260, 4200],
      parkingJunction: [5290, 3500],
    });
    expect([...ETNIAS_PARKING_CONNECTION_CORRECTION.sourceAxis]).toEqual([
      [5260, 4200], [5260, 4140], [5260, 3950], [5262, 3750], [5270, 3600], [5290, 3500],
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

  it('materializa o acesso ao Portão 5 com curva suavizada e preserva o trevo da BR-472', () => {
    expect(projectRearAttachment5PointToOfficialSource(3)).toEqual([4528, 3150]);
    expect(projectRearAttachment5PointToOfficialSource(2)).toEqual([4980, 3460]);
    expect(projectRearAttachment5PointToOfficialSource(4)).toEqual([5700, 3588]);
    expect(projectRearAttachment5PointToOfficialSource(6)).toEqual([5940, 3678]);
    expect(PORTAO5_PARKING_ACCESS_JUNCTIONS).toEqual({
      street: [4528, 3150],
      curve: [4980, 3460],
      etnias: [5290, 3500],
      ubiretama: [5700, 3588],
      gate5: [5940, 3678],
    });

    expect([...REAR_CALIBRATED_AXES.portao5StreetToCurve]).toEqual(
      [...PORTAO5_PARKING_ACCESS_CORRECTION.streetToCurve],
    );
    expect([...REAR_CALIBRATED_AXES.gate5InternalApproach]).toEqual(
      [...PORTAO5_PARKING_ACCESS_CORRECTION.gate5Approach],
    );

    const parking = GENERATED_REAR_ROAD_SEGMENTS.filter(
      (road) => road.roadId === 'ACESSO-PORTAO5-ESTACIONAMENTO',
    );
    expect(parking).toHaveLength(3);
    expect(parking.every((road) => road.officialOwnerIdentifier === 'A5')).toBe(true);
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
    expect(parkEnvironmentSource).not.toContain('EXPORURAL_SMOOTH_CONCRETE_CORRECTION');
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
