import {
  PARK_ACCESS_ROAD_CURB_WIDTH_METERS,
  PARK_ACCESS_SOURCE_MANIFEST,
  PARK_ACCESS_SPATIAL_PLAN,
  PARK_ACCESS_WORKING_MAP_UNITS_PER_METER,
  parkAccessHeadingBetween,
  parkAccessMetersToLocal,
  parkAccessSourcePointToLocal,
  type ParkAccessPoint,
} from '@/features/commercial-map/data/parkAccessSpatialPlan';
import {
  OFFICIAL_REFERENCE_DATA,
  OFFICIAL_REFERENCE_ENTITIES,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';

function distance(first: ParkAccessPoint, second: ParkAccessPoint) {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

function segmentFootprint(
  from: ParkAccessPoint,
  to: ParkAccessPoint,
  width: number,
): readonly ParkAccessPoint[] {
  const deltaX = to[0] - from[0];
  const deltaZ = to[1] - from[1];
  const length = Math.hypot(deltaX, deltaZ);
  const halfWidth = width / 2;
  const offsetX = length > 0 ? (-deltaZ / length) * halfWidth : 0;
  const offsetZ = length > 0 ? (deltaX / length) * halfWidth : 0;
  const corners = [
    [from[0] + offsetX, from[1] + offsetZ],
    [to[0] + offsetX, to[1] + offsetZ],
    [to[0] - offsetX, to[1] - offsetZ],
    [from[0] - offsetX, from[1] - offsetZ],
  ] as const satisfies readonly ParkAccessPoint[];
  return [...corners, corners[0]];
}

function expectClosedFinitePolygon(polygon: readonly ParkAccessPoint[]) {
  expect(polygon.length).toBeGreaterThanOrEqual(4);
  polygon.forEach(([x, z]) => {
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(z)).toBe(true);
  });
  expect(polygon.at(-1)).toEqual(polygon[0]);
}

function ringBoundsCenter(ring: readonly (readonly [number, number])[]): ParkAccessPoint {
  const xs = ring.map(([x]) => x);
  const zs = ring.map(([, z]) => z);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...zs) + Math.max(...zs)) / 2,
  ];
}

const GEOMETRY_EPSILON = 1e-7;

function openPolygon(polygon: readonly ParkAccessPoint[]) {
  const first = polygon[0];
  const last = polygon.at(-1);
  return first && last
    && Math.abs(first[0] - last[0]) <= GEOMETRY_EPSILON
    && Math.abs(first[1] - last[1]) <= GEOMETRY_EPSILON
    ? polygon.slice(0, -1)
    : [...polygon];
}

function cross(
  first: ParkAccessPoint,
  second: ParkAccessPoint,
  third: ParkAccessPoint,
) {
  return (second[0] - first[0]) * (third[1] - first[1])
    - (second[1] - first[1]) * (third[0] - first[0]);
}

function pointOnSegment(
  point: ParkAccessPoint,
  from: ParkAccessPoint,
  to: ParkAccessPoint,
) {
  return Math.abs(cross(from, to, point)) <= GEOMETRY_EPSILON
    && point[0] >= Math.min(from[0], to[0]) - GEOMETRY_EPSILON
    && point[0] <= Math.max(from[0], to[0]) + GEOMETRY_EPSILON
    && point[1] >= Math.min(from[1], to[1]) - GEOMETRY_EPSILON
    && point[1] <= Math.max(from[1], to[1]) + GEOMETRY_EPSILON;
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
  if (((firstSide > GEOMETRY_EPSILON && secondSide < -GEOMETRY_EPSILON)
      || (firstSide < -GEOMETRY_EPSILON && secondSide > GEOMETRY_EPSILON))
    && ((thirdSide > GEOMETRY_EPSILON && fourthSide < -GEOMETRY_EPSILON)
      || (thirdSide < -GEOMETRY_EPSILON && fourthSide > GEOMETRY_EPSILON))) {
    return true;
  }
  return (Math.abs(firstSide) <= GEOMETRY_EPSILON
      && pointOnSegment(secondFrom, firstFrom, firstTo))
    || (Math.abs(secondSide) <= GEOMETRY_EPSILON
      && pointOnSegment(secondTo, firstFrom, firstTo))
    || (Math.abs(thirdSide) <= GEOMETRY_EPSILON
      && pointOnSegment(firstFrom, secondFrom, secondTo))
    || (Math.abs(fourthSide) <= GEOMETRY_EPSILON
      && pointOnSegment(firstTo, secondFrom, secondTo));
}

function polygonsIntersect(
  firstPolygon: readonly ParkAccessPoint[],
  secondPolygon: readonly ParkAccessPoint[],
) {
  const first = openPolygon(firstPolygon);
  const second = openPolygon(secondPolygon);
  const edgesIntersect = first.some((from, firstIndex) => second.some((otherFrom, secondIndex) => (
    segmentsIntersect(
      from,
      first[(firstIndex + 1) % first.length],
      otherFrom,
      second[(secondIndex + 1) % second.length],
    )
  )));
  return edgesIntersect
    || pointInPolygon(first[0], second)
    || pointInPolygon(second[0], first);
}

function polygonFullyInside(
  candidatePolygon: readonly ParkAccessPoint[],
  containerPolygon: readonly ParkAccessPoint[],
) {
  const candidate = openPolygon(candidatePolygon);
  return candidate.every((from, index) => {
    const to = candidate[(index + 1) % candidate.length];
    return [0, 0.25, 0.5, 0.75, 1].every((progress) => pointInPolygon([
      from[0] + (to[0] - from[0]) * progress,
      from[1] + (to[1] - from[1]) * progress,
    ], containerPolygon));
  });
}

function officialFootprints(identifiers: readonly string[]) {
  return identifiers.map((identifier) => {
    // Inventário cartográfico completo: pegadas de blocos não permanentes
    // continuam reservadas para que o solo liberado não seja pavimentado.
    const entity = OFFICIAL_REFERENCE_ENTITIES
      .find((candidate) => candidate.publicIdentifier === identifier);
    expect(entity, identifier).toBeDefined();
    return {
      identifier,
      polygon: entity!.geometry.coordinates[0] as readonly ParkAccessPoint[],
    };
  });
}

describe('park access spatial plan', () => {
  it('reuses the official isotropic PDF-to-local transformation', () => {
    const samples = [
      [341, 3718],
      [684, 3306],
      [1214, 3137],
      [1640, 3143.5],
      [1274, 4040],
      [3935, 4219],
      [3276, 941],
      [3267, 1703],
      [2418, 3833],
    ] as const;

    samples.forEach((sample) => {
      const expected = officialPdfPointToLocal(sample);
      const projected = parkAccessSourcePointToLocal(sample);
      expect(projected[0]).toBeCloseTo(expected[0], 4);
      expect(projected[1]).toBeCloseTo(expected[1], 4);
    });

    expect(PARK_ACCESS_SPATIAL_PLAN.coordinateFrame.sourceToLocalScale[0])
      .toBeCloseTo(PARK_ACCESS_SPATIAL_PLAN.coordinateFrame.sourceToLocalScale[1], 9);
    expect(PARK_ACCESS_WORKING_MAP_UNITS_PER_METER).toBe(0.15);
    expect(PARK_ACCESS_SPATIAL_PLAN.coordinateFrame.calibrationScope).toContain('field-reviewable');
  });

  it('preserves A1, A2, A3, A6, A7 and A10 as official anchors without swapping gates', () => {
    expect(PARK_ACCESS_SPATIAL_PLAN.anchors.gate1).toMatchObject({
      officialEntityIdentifier: 'A1',
      sourcePdfPoint: [684, 3306],
      confidence: 'OFFICIAL_ANCHOR',
    });
    expect(PARK_ACCESS_SPATIAL_PLAN.anchors.gate2).toMatchObject({
      officialEntityIdentifier: 'A2',
      sourcePdfPoint: [1274, 4040],
      confidence: 'OFFICIAL_ANCHOR',
    });
    expect(PARK_ACCESS_SPATIAL_PLAN.anchors.gate3).toMatchObject({
      officialEntityIdentifier: 'A3',
      sourcePdfPoint: [3935, 4219],
      confidence: 'OFFICIAL_ANCHOR',
    });
    expect(PARK_ACCESS_SPATIAL_PLAN.anchors.gate6).toMatchObject({
      officialEntityIdentifier: 'A6',
      sourcePdfPoint: [3276, 941],
      confidence: 'OFFICIAL_ANCHOR',
    });
    expect(PARK_ACCESS_SPATIAL_PLAN.anchors.gate7).toMatchObject({
      officialEntityIdentifier: 'A7',
      sourcePdfPoint: [3267, 1703],
      confidence: 'OFFICIAL_ANCHOR',
    });
    expect(PARK_ACCESS_SPATIAL_PLAN.anchors.gate10).toMatchObject({
      officialEntityIdentifier: 'A10',
      sourcePdfPoint: [1214, 3137],
      confidence: 'OFFICIAL_ANCHOR',
    });

    expect(PARK_ACCESS_SPATIAL_PLAN.gates.gate2.sourceIds)
      .toContain('gate-composite-lower-gate-2');
    expect(PARK_ACCESS_SPATIAL_PLAN.gates.gate2.sourceIds)
      .not.toContain('gate-composite-upper-gate-3');
    expect(PARK_ACCESS_SPATIAL_PLAN.gates.gate3.sourceIds)
      .toContain('gate-composite-upper-gate-3');
    expect(PARK_ACCESS_SPATIAL_PLAN.gates.gate3.sourceIds)
      .not.toContain('gate-composite-lower-gate-2');

    const upper = PARK_ACCESS_SOURCE_MANIFEST.find((source) => source.id === 'gate-composite-upper-gate-3');
    const lower = PARK_ACCESS_SOURCE_MANIFEST.find((source) => source.id === 'gate-composite-lower-gate-2');
    expect(upper?.interpretation).toContain('imagem superior = Portão 3');
    expect(lower?.interpretation).toContain('imagem inferior = Portão 2');

    const officialEntities = new Map(OFFICIAL_REFERENCE_DATA.entities
      .map((entity) => [entity.publicIdentifier, entity]));
    (['gate1', 'gate2', 'gate3', 'gate6', 'gate7', 'gate10'] as const).forEach((key) => {
      const anchor = PARK_ACCESS_SPATIAL_PLAN.anchors[key];
      const entity = officialEntities.get(anchor.officialEntityIdentifier!);
      expect(entity?.classification).toBe('GATE');
      const officialCenter = ringBoundsCenter(entity!.geometry.coordinates[0]);
      expect(distance(anchor.point, officialCenter)).toBeLessThan(0.0002);
    });

    const pavilion14 = officialEntities.get('B2')!;
    const pavilion14Ring = pavilion14.geometry.coordinates[0];
    const officialNorthWest = [
      Math.min(...pavilion14Ring.map(([x]) => x)),
      Math.min(...pavilion14Ring.map(([, z]) => z)),
    ] as const;
    expect(PARK_ACCESS_SPATIAL_PLAN.anchors.pavilion14NorthWest.point[0])
      .toBeCloseTo(officialNorthWest[0], 4);
    expect(PARK_ACCESS_SPATIAL_PLAN.anchors.pavilion14NorthWest.point[1])
      .toBeCloseTo(officialNorthWest[1], 4);

    const thirdAgePavilion = officialEntities.get('B22')!;
    expect(PARK_ACCESS_SPATIAL_PLAN.anchors.thirdAgePavilion).toMatchObject({
      officialEntityIdentifier: 'B22',
      sourcePdfPoint: [836.5, 3686],
      confidence: 'OFFICIAL_ANCHOR',
    });
    expect(distance(
      PARK_ACCESS_SPATIAL_PLAN.anchors.thirdAgePavilion.point,
      ringBoundsCenter(thirdAgePavilion.geometry.coordinates[0]),
    )).toBeLessThan(0.0002);
    expect(PARK_ACCESS_SPATIAL_PLAN.anchors.ruaBrasilSeam).toMatchObject({
      officialEntityIdentifier: 'RUA-BRASIL',
      sourcePdfPoint: [1640, 3143.5],
      confidence: 'OFFICIAL_ANCHOR',
    });
  });

  it('defines the Benvenuto axis as four coherent 3.5 m lanes ending at A3', () => {
    expect(PARK_ACCESS_SPATIAL_PLAN.dimensions).toMatchObject({
      vehicleLaneMeters: 3.5,
      benvenutoLaneCount: 4,
      benvenutoCarriagewayMeters: 14,
    });
    expect(PARK_ACCESS_SPATIAL_PLAN.gates.gate3.lanes).toBe(4);

    const road = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces
      .find((surface) => surface.id === 'benvenuto-four-lane-axis');
    expect(road).toBeDefined();
    expect(road?.kind).toBe('ARTERIAL_FOUR_LANE');
    expect(road?.widthMeters).toBe(14);
    expect(road?.centerline.at(-1)).toEqual(PARK_ACCESS_SPATIAL_PLAN.anchors.gate3.point);
    expect(road?.connects).toContain('roundabout-tupareendi');
    expect(road?.mergedApronIds).toEqual([
      'benvenuto-parking-apron-west',
      'benvenuto-parking-apron-east',
    ]);
    expect(PARK_ACCESS_SPATIAL_PLAN.parkingBays).toHaveLength(43);
  });

  it('contains every complete parking bay in segmented asphalt without paving B23 or B11', () => {
    const road = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces
      .find((surface) => surface.id === 'benvenuto-four-lane-axis')!;
    const aprons = PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.parkingAprons;
    const protectedFootprints = officialFootprints(
      PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.parkingProtectedFootprintIdentifiers,
    );
    const hardNotches = protectedFootprints
      .filter(({ identifier }) => identifier === 'B11' || identifier === 'B23');

    aprons.forEach((apron) => {
      expectClosedFinitePolygon(apron.polygon);
      expect(apron.roadSurfaceId).toBe(road.id);
      expect(polygonFullyInside(apron.polygon, road.polygon), apron.id).toBe(true);
      hardNotches.forEach(({ identifier, polygon }) => {
        expect(polygonsIntersect(apron.polygon, polygon), `${apron.id}/${identifier}`).toBe(false);
      });
    });
    hardNotches.forEach(({ identifier, polygon }) => {
      expect(
        polygonsIntersect(PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.parkingCutout, polygon),
        `parking-cutout/${identifier}`,
      ).toBe(false);
      expect(polygonsIntersect(road.polygon, polygon), `merged-asphalt/${identifier}`).toBe(false);
    });

    expect(new Set(PARK_ACCESS_SPATIAL_PLAN.parkingBays.map((bay) => bay.id)).size)
      .toBe(PARK_ACCESS_SPATIAL_PLAN.parkingBays.length);
    PARK_ACCESS_SPATIAL_PLAN.parkingBays.forEach((bay) => {
      expectClosedFinitePolygon(bay.polygon);
      expect(polygonFullyInside(bay.polygon, road.polygon), `${bay.id}/merged-asphalt`).toBe(true);
      expect(aprons.some((apron) => polygonFullyInside(bay.polygon, apron.polygon)), bay.id)
        .toBe(true);
      expect(
        polygonFullyInside(
          bay.polygon,
          PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.parkingCutout,
        ),
        `${bay.id}/parking-cutout`,
      ).toBe(true);
      protectedFootprints.forEach(({ identifier, polygon }) => {
        expect(polygonsIntersect(bay.polygon, polygon), `${bay.id}/${identifier}`).toBe(false);
      });
    });
  });

  it('keeps the Gate 2 woodland path continuous and outside Pavilion 14', () => {
    const path = PARK_ACCESS_SPATIAL_PLAN.woodlandPath;
    expect(path.centerline[0]).toEqual(PARK_ACCESS_SPATIAL_PLAN.anchors.gate2.point);
    expect(path.connects).toEqual(['A2', 'B2']);
    expect(path.widthMeters).toBe(3);
    expect(path.clearancePolygon.length).toBeGreaterThan(path.centerline.length);

    const pavilion14NorthWest = PARK_ACCESS_SPATIAL_PLAN.anchors.pavilion14NorthWest.point;
    expect(distance(path.centerline.at(-1)!, pavilion14NorthWest)).toBeLessThan(1.2);
    expect(Math.max(...path.surfacePolygon.map(([x]) => x))).toBeLessThan(pavilion14NorthWest[0]);
    expect(PARK_ACCESS_SPATIAL_PLAN.woodlandMass.protectedFootprintIdentifiers)
      .toEqual(expect.arrayContaining(['B1', 'B2', 'B22', 'C2', 'C3', 'G']));
  });

  it('keeps the A1-A10-Rua Brasil axis continuous, asphalt and support-aware', () => {
    const roads = new Map(PARK_ACCESS_SPATIAL_PLAN.roadSurfaces
      .map((surface) => [surface.id, surface]));
    const road = roads.get('gate-1-gate-10-rua-brasil-asphalt')!;

    expect(roads.has('costeiros-field-spur')).toBe(false);
    expect(roads.has('gate-1-gate-10-rua-brasil-cobblestone')).toBe(false);
    expect(road).toBeDefined();
    expect(road.kind).toBe('ASPHALT_ACCESS_ROAD');
    expect(road.supportAware).toBe(true);
    expect(road.widthMeters).toBe(6);
    expect(road.widthReviewRangeMeters).toEqual([5.5, 7]);
    expect(road.elevation).toBe(0.044);
    expect(road.connects).toEqual(['A1', 'A10', 'RUA-BRASIL']);
    expect(road.sourcePdfCenterline).toEqual([
      [684, 3306],
      [760, 3260],
      [910, 3198],
      [1060, 3154],
      [1214, 3137],
      [1395, 3138],
      [1545, 3141],
      [1640, 3143.5],
      [1650, 3143.5],
    ]);
    expect(road.centerline[0]).toEqual(PARK_ACCESS_SPATIAL_PLAN.anchors.gate1.point);
    expect(road.centerline[4]).toEqual(PARK_ACCESS_SPATIAL_PLAN.anchors.gate10.point);
    expect(road.centerline[7]).toEqual(PARK_ACCESS_SPATIAL_PLAN.anchors.ruaBrasilSeam.point);

    const [thirdAgeFootprint] = officialFootprints(['B22']);
    const [ruaBrasil] = officialFootprints(['RUA-BRASIL']);
    const [testDrive] = officialFootprints(['TEST-DRIVE']);
    expect(polygonsIntersect(road.polygon, thirdAgeFootprint.polygon)).toBe(false);
    expect(polygonsIntersect(road.polygon, ruaBrasil.polygon)).toBe(true);
    expect(polygonsIntersect(road.polygon, testDrive.polygon)).toBe(true);
    expect(road.sourceIds).toEqual(expect.arrayContaining([
      'annex-17-current-map-overview',
      'annex-18-current-map-gate-1',
      'annex-19-current-map-gate-10',
      'annex-20-satellite-gate-1-roundabout',
      'annex-21-site-plan-gate-1-motorhome',
    ]));
  });

  it('links A6 to A7 and both Exporural frontage roads without invading adjacent footprints', () => {
    const roads = new Map(PARK_ACCESS_SPATIAL_PLAN.roadSurfaces
      .map((surface) => [surface.id, surface]));
    const gateAxis = roads.get('gate-6-gate-7-asphalt')!;
    const johanLink = roads.get('gate-7-johan-muller-link')!;
    const gustavoLink = roads.get('gate-7-gustavo-bessel-link')!;

    expect(gateAxis).toMatchObject({
      kind: 'ASPHALT_ACCESS_ROAD',
      widthMeters: 6,
      widthReviewRangeMeters: [5.5, 6.5],
      supportAware: true,
      connects: ['A6', 'A7', 'gate-7-junction'],
    });
    expect(gateAxis.sourcePdfCenterline).toEqual([
      [3276, 941],
      [3278, 1050],
      [3268, 1175],
      [3244, 1305],
      [3222, 1435],
      [3218, 1545],
      [3234, 1635],
      [3267, 1703],
    ]);
    expect(gateAxis.centerline[0]).toEqual(PARK_ACCESS_SPATIAL_PLAN.anchors.gate6.point);
    expect(gateAxis.centerline.at(-1)).toEqual(PARK_ACCESS_SPATIAL_PLAN.anchors.gate7.point);

    expect(johanLink).toMatchObject({
      kind: 'ASPHALT_ACCESS_ROAD',
      widthMeters: 5.2,
      widthReviewRangeMeters: [5, 6],
      supportAware: true,
    });
    expect(johanLink.connects).toEqual(expect.arrayContaining([
      'A7',
      'gate-7-junction',
      'RUA-JOHAN-MULLER',
    ]));
    expect(johanLink.centerline.at(-1))
      .toEqual(PARK_ACCESS_SPATIAL_PLAN.anchors.gate7JohanMullerSeam.point);

    expect(gustavoLink).toMatchObject({
      kind: 'ASPHALT_ACCESS_ROAD',
      widthMeters: 6,
      widthReviewRangeMeters: [5.5, 6.5],
      supportAware: true,
    });
    expect(gustavoLink.connects).toEqual(expect.arrayContaining([
      'A7',
      'gate-7-junction',
      'RUA-GUSTAVO-BESSEL',
    ]));
    expect(gustavoLink.centerline[0]).toEqual(PARK_ACCESS_SPATIAL_PLAN.anchors.gate7.point);
    expect(gustavoLink.centerline[1]).toEqual(PARK_ACCESS_SPATIAL_PLAN.anchors.gate7Junction.point);
    expect(gustavoLink.centerline.at(-1))
      .toEqual(PARK_ACCESS_SPATIAL_PLAN.anchors.gate7GustavoBesselSeam.point);
    expect(johanLink.centerline).toContainEqual(PARK_ACCESS_SPATIAL_PLAN.anchors.gate7Junction.point);
    expect(distance(gateAxis.centerline.at(-1)!, gustavoLink.centerline[0])).toBe(0);

    expect(polygonsIntersect(gateAxis.polygon, johanLink.polygon)).toBe(true);
    expect(polygonsIntersect(gateAxis.polygon, gustavoLink.polygon)).toBe(true);
    expect(polygonsIntersect(johanLink.polygon, gustavoLink.polygon)).toBe(true);

    const [johanMuller, gustavoBessel] = officialFootprints([
      'RUA-JOHAN-MULLER',
      'RUA-GUSTAVO-BESSEL',
    ]);
    expect(polygonsIntersect(johanLink.polygon, johanMuller.polygon)).toBe(true);
    expect(polygonsIntersect(gustavoLink.polygon, gustavoBessel.polygon)).toBe(true);

    officialFootprints(['PISTA-CAMPEIRA', 'Q-R-15']).forEach(({ identifier, polygon }) => {
      expect(polygonsIntersect(gustavoLink.polygon, polygon), `gate-7-south/${identifier}`)
        .toBe(false);
    });
    [gateAxis, johanLink, gustavoLink].forEach((surface) => {
      expect(surface.sourceIds).toContain('annex-23-satellite-gates-6-7');
      expect(surface.sourcePdfCurbCenterlines).toHaveLength(2);
      expect(surface.curbCenterlines).toHaveLength(2);
      surface.curbCenterlines!.forEach((centerline) => {
        expect(centerline.at(-1), `${surface.id}/open-curb-run`)
          .not.toEqual(centerline[0]);
      });
      const junctionClearance = Math.min(...surface.curbCenterlines!.flatMap((centerline) => (
        centerline.map((point) => distance(point, PARK_ACCESS_SPATIAL_PLAN.anchors.gate7Junction.point))
      )));
      expect(junctionClearance, `${surface.id}/curb-mouth`)
        .toBeGreaterThan(parkAccessMetersToLocal(8));
    });
    const gustavoMouthClearance = Math.min(...gustavoLink.curbCenterlines!.flatMap((centerline) => (
      centerline.map((point) => distance(
        point,
        PARK_ACCESS_SPATIAL_PLAN.anchors.gate7GustavoBesselSeam.point,
      ))
    )));
    expect(gustavoMouthClearance).toBeGreaterThan(parkAccessMetersToLocal(3));

    const curbWidth = parkAccessMetersToLocal(PARK_ACCESS_ROAD_CURB_WIDTH_METERS);
    expect(PARK_ACCESS_ROAD_CURB_WIDTH_METERS).toBe(0.5);
    expect(curbWidth).toBeCloseTo(0.075, 8);
    const protectedFootprints = officialFootprints(['PISTA-CAMPEIRA', 'Q-R-08', 'Q-R-15']);
    [gateAxis, johanLink, gustavoLink].forEach((surface) => {
      surface.curbCenterlines!.forEach((centerline, curbIndex) => {
        centerline.slice(0, -1).forEach((from, segmentIndex) => {
          const footprint = segmentFootprint(from, centerline[segmentIndex + 1], curbWidth);
          protectedFootprints.forEach(({ identifier, polygon }) => {
            expect(
              polygonsIntersect(footprint, polygon),
              `${surface.id}/curb-${curbIndex + 1}-${segmentIndex + 1}/${identifier}`,
            ).toBe(false);
          });
        });
      });
    });
  });

  it('keeps the motorhome road distinct, stone/gravel and explicitly above AREA-MOTORHOME', () => {
    const serviceRoad = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces
      .find((surface) => surface.id === 'costeiros-service-road')!;
    const setting = PARK_ACCESS_SPATIAL_PLAN.motorhomeSetting;
    const [officialMotorhome] = officialFootprints(['AREA-MOTORHOME']);

    expect(serviceRoad.kind).toBe('STONE_GRAVEL_ACCESS_ROAD');
    expect(serviceRoad.supportAware).toBe(true);
    expect(serviceRoad.widthMeters).toBe(7);
    expect(serviceRoad.elevation).toBe(0.041);
    expect(serviceRoad.connects).toEqual(expect.arrayContaining([
      'A1',
      'AREA-MOTORHOME',
      'sede-costeiros',
    ]));
    expect(serviceRoad.sourcePdfCenterline[0]).toEqual([684, 3306]);
    expect(serviceRoad.sourcePdfCenterline.at(-1)).toEqual([1650, 1600]);
    expect(serviceRoad.sourcePdfCenterline)
      .not.toEqual(PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.find(
        (surface) => surface.id === 'gate-1-gate-10-rua-brasil-asphalt',
      )!.sourcePdfCenterline);

    expect(setting).toMatchObject({
      id: 'motorhome-setting',
      officialEntityIdentifier: 'AREA-MOTORHOME',
      accessRoadId: 'costeiros-service-road',
      protectedFootprintIdentifiers: ['AREA-MOTORHOME'],
      clearances: {
        footprintMeters: 0,
        roadTreeTrunkMeters: 2,
        canopyMeters: 0.75,
      },
    });
    expect(setting.sourcePdfFootprint).toEqual([
      [760, 1780],
      [1630, 1780],
      [1630, 2400],
      [760, 2400],
      [760, 1780],
    ]);
    expect(setting.sourcePdfAccessCenterline).toBe(serviceRoad.sourcePdfCenterline);
    expect(setting.accessCenterline).toEqual(serviceRoad.centerline);
    expect(setting.sourcePdfAccessPolygon).toBe(serviceRoad.sourcePdfPolygon);
    expect(setting.accessPolygon).toBe(serviceRoad.polygon);
    expect(polygonsIntersect(serviceRoad.polygon, setting.footprint)).toBe(true);
    expect(pointInPolygon(serviceRoad.centerline[6], setting.footprint)).toBe(true);
    setting.footprint.forEach((point, index) => {
      expect(point[0]).toBeCloseTo(officialMotorhome.polygon[index][0], 4);
      expect(point[1]).toBeCloseTo(officialMotorhome.polygon[index][1], 4);
    });
    expect(serviceRoad.sourceIds).toEqual(expect.arrayContaining([
      'annex-17-current-map-overview',
      'annex-21-site-plan-gate-1-motorhome',
      'annex-22-aerial-motorhome-road',
    ]));
  });

  it('shares the protected B22 footprint, clipped access and vegetation clearances', () => {
    const setting = PARK_ACCESS_SPATIAL_PLAN.thirdAgePavilionSetting;
    const access = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces
      .find((surface) => surface.id === setting.accessRoadId)!;
    const [officialB22] = officialFootprints(['B22']);

    expect(setting).toMatchObject({
      officialEntityIdentifier: 'B22',
      sourcePdfCenter: [836.5, 3686],
      accessRoadId: 'third-age-pavilion-access',
      sourcePdfThreshold: [742, 3568],
      widthMeters: 4,
      protectedFootprintIdentifiers: ['B22'],
      clearances: {
        footprintMeters: 0,
        roadTreeTrunkMeters: 2,
        pavilionAccessTreeTrunkMeters: 1.5,
        canopyMeters: 0.45,
      },
    });
    expect(setting.sourcePdfFootprint).toEqual([
      [742, 3538],
      [931, 3538],
      [931, 3834],
      [742, 3834],
      [742, 3538],
    ]);
    expect(setting.sourcePdfAccessCenterline).toEqual([
      [629, 3332],
      [651, 3450],
      [700, 3485],
      [735, 3530],
      [742, 3568],
    ]);
    expect(access.kind).toBe('COBBLESTONE_ACCESS_ROAD');
    expect(access.supportAware).toBe(true);
    expect(access.connects).toEqual(['gate-1-local-access', 'B22']);
    expect(access.widthMeters).toBe(4);
    expect(access.elevation).toBe(0.039);
    expect(access.sourcePdfPolygon).toEqual(setting.sourcePdfAccessPolygon);
    expect(access.polygon).toEqual(setting.accessPolygon);
    expect(setting.accessCenterline.at(-1)).toEqual(setting.threshold);
    expect(Math.max(...setting.sourcePdfAccessPolygon.map(([x]) => x))).toBe(742);
    expect(Math.max(...setting.sourcePdfAccessClearancePolygon.map(([x]) => x))).toBe(742);
    expect(Math.max(...setting.accessPolygon.map(([x]) => x)))
      .toBeLessThanOrEqual(Math.min(...officialB22.polygon.map(([x]) => x)) + 0.0001);
    expectClosedFinitePolygon(setting.footprint);
    expectClosedFinitePolygon(setting.accessPolygon);
    expectClosedFinitePolygon(setting.accessClearancePolygon);
    setting.footprint.forEach((point, index) => {
      expect(point[0]).toBeCloseTo(officialB22.polygon[index][0], 4);
      expect(point[1]).toBeCloseTo(officialB22.polygon[index][1], 4);
    });

    const localAccess = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces
      .find((surface) => surface.id === 'gate-1-local-access')!;
    expect(localAccess.sourcePdfCenterline).toContainEqual(setting.sourcePdfAccessCenterline[0]);
  });

  it('makes A1 a local asphalt seam and links only the mini-roundabout to AV-TUPARENDI', () => {
    const localAccess = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces
      .find((surface) => surface.id === 'gate-1-local-access')!;
    const tupareendiLink = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces
      .find((surface) => surface.id === 'gate-1-roundabout-tupareendi-link')!;
    const service = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces
      .find((surface) => surface.id === 'costeiros-service-road')!;
    const gate10Axis = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces
      .find((surface) => surface.id === 'gate-1-gate-10-rua-brasil-asphalt')!;
    const gate1 = PARK_ACCESS_SPATIAL_PLAN.anchors.gate1.point;

    expect(PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.some(
      (surface) => surface.id === 'gate-1-approach',
    )).toBe(false);
    expect(localAccess.kind).toBe('ASPHALT_ACCESS_ROAD');
    expect(localAccess.centerline.at(-1)).toEqual(gate1);
    expect(localAccess.sourcePdfCenterline).toEqual([
      [350, 3690],
      [393, 3620],
      [471, 3512],
      [562, 3404],
      [629, 3332],
      [684, 3306],
    ]);
    expect(localAccess.connects).toEqual([
      'gate-1-mini-roundabout',
      'A1',
      'third-age-pavilion-access',
    ]);
    expect(tupareendiLink.kind).toBe('ASPHALT_ACCESS_ROAD');
    expect(tupareendiLink.sourcePdfCenterline[0]).toEqual([341, 3718]);
    expect(tupareendiLink.sourcePdfCenterline.at(-1)).toEqual([600, 3890]);
    expect(tupareendiLink.connects).toEqual(['gate-1-mini-roundabout', 'AV-TUPARENDI']);
    expect(service.centerline[0]).toEqual(gate1);
    expect(gate10Axis.centerline[0]).toEqual(gate1);
    expect(PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.some((surface) => (
      surface.connects.includes('A1') && surface.connects.includes('roundabout-tupareendi')
    ))).toBe(false);
    expect(service.connects).toContain('sede-costeiros');

    const buildingXs = PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.buildingPolygon.map(([x]) => x);
    const roadNearBuildingXs = service.centerline.slice(1, 5).map(([x]) => x);
    expect(Math.min(...buildingXs)).toBeGreaterThan(Math.max(...roadNearBuildingXs));
    expect(PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.serviceRoadIds)
      .toEqual(['costeiros-service-road']);
  });

  it('keeps the A1 mini-roundabout dimensionally separate from the large roundabout', () => {
    const roundabouts = new Map(PARK_ACCESS_SPATIAL_PLAN.roundabouts
      .map((roundabout) => [roundabout.id, roundabout]));
    const main = roundabouts.get('roundabout-tupareendi')!;
    const gate1Mini = roundabouts.get('gate-1-mini-roundabout')!;

    expect(roundabouts.size).toBe(2);
    expect(PARK_ACCESS_SPATIAL_PLAN.roundabout).toBe(main);
    expect(PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout).toBe(gate1Mini);
    expect(main.sourcePdfCenter).toEqual([1110, 4185]);
    expect(main.outerRadius).toBe(parkAccessMetersToLocal(18));
    expect(main.islandRadius).toBe(parkAccessMetersToLocal(10.5));
    expect(main.circulatingWidth)
      .toBeCloseTo(main.outerRadius - main.islandRadius, 4);
    expect(main.approachRoadIds).toEqual(['benvenuto-four-lane-axis']);
    expect(main.confidence).toBe('DIMENSIONALLY_INFERRED');

    expect(gate1Mini.sourcePdfCenter).toEqual([341, 3718]);
    expect(gate1Mini.center).toEqual(parkAccessSourcePointToLocal([341, 3718]));
    expect(gate1Mini.outerRadiusMeters).toBe(14);
    expect(gate1Mini.islandRadiusMeters).toBe(7.5);
    expect(gate1Mini.circulatingWidthMeters).toBe(6.5);
    expect(gate1Mini.approachRoadIds).toEqual([
      'gate-1-local-access',
      'gate-1-roundabout-tupareendi-link',
    ]);
    expect(gate1Mini.confidence).toBe('FIELD_REVIEW_REQUIRED');
    expect(distance(main.center, gate1Mini.center))
      .toBeGreaterThan(main.outerRadius + gate1Mini.outerRadius);
    expect(PARK_ACCESS_SPATIAL_PLAN.anchors.gate1Roundabout.point).toEqual(gate1Mini.center);
    expect(PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.some((surface) => (
      surface.connects.includes('A1') && surface.connects.includes(main.id)
    ))).toBe(false);
    expect(PARK_ACCESS_SPATIAL_PLAN.openQuestions.some((question) => question.includes('raio externo')))
      .toBe(true);
  });

  it('exports closed finite surfaces with traceable evidence', () => {
    PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.forEach((surface) => {
      expectClosedFinitePolygon(surface.polygon);
      expect(surface.sourceIds.length).toBeGreaterThan(0);
      expect(surface.notes.length).toBeGreaterThan(20);
    });
    PARK_ACCESS_SPATIAL_PLAN.sidewalkSurfaces.forEach((surface) => {
      expectClosedFinitePolygon(surface.polygon);
      expect(surface.sourceIds.length).toBeGreaterThan(0);
    });
    PARK_ACCESS_SPATIAL_PLAN.roundabouts.forEach((roundabout) => {
      roundabout.splitterIslands.forEach((island) => expectClosedFinitePolygon(island.polygon));
    });
    expectClosedFinitePolygon(PARK_ACCESS_SPATIAL_PLAN.woodlandPath.surfacePolygon);
    expectClosedFinitePolygon(PARK_ACCESS_SPATIAL_PLAN.woodlandPath.clearancePolygon);
    expectClosedFinitePolygon(PARK_ACCESS_SPATIAL_PLAN.woodlandMass.polygon);
    expectClosedFinitePolygon(PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.buildingPolygon);
    expectClosedFinitePolygon(PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.yardPolygon);
    expectClosedFinitePolygon(PARK_ACCESS_SPATIAL_PLAN.thirdAgePavilionSetting.footprint);
    expectClosedFinitePolygon(PARK_ACCESS_SPATIAL_PLAN.thirdAgePavilionSetting.accessPolygon);
    expectClosedFinitePolygon(PARK_ACCESS_SPATIAL_PLAN.thirdAgePavilionSetting.accessClearancePolygon);
    expectClosedFinitePolygon(PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.parkingCutout);
  });

  it('notches north-side sidewalks around every nearby official footprint and keeps A2/A3 clear', () => {
    const northSidewalks = PARK_ACCESS_SPATIAL_PLAN.sidewalkSurfaces
      .filter((surface) => surface.segmentOf === 'benvenuto-north-sidewalk');
    const nearbyFootprints = officialFootprints(
      PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.parkingProtectedFootprintIdentifiers,
    );

    expect(northSidewalks.map((surface) => surface.id)).toEqual([
      'benvenuto-north-sidewalk',
      'benvenuto-north-sidewalk-b3',
      'benvenuto-north-sidewalk-b5',
    ]);
    northSidewalks.forEach((surface) => {
      expect(surface.adjacentOfficialIdentifiers?.length).toBeGreaterThan(0);
      nearbyFootprints.forEach(({ identifier, polygon }) => {
        expect(polygonsIntersect(surface.polygon, polygon), `${surface.id}/${identifier}`)
          .toBe(false);
      });
      expect(pointInPolygon(PARK_ACCESS_SPATIAL_PLAN.anchors.gate2.point, surface.polygon))
        .toBe(false);
      expect(pointInPolygon(PARK_ACCESS_SPATIAL_PLAN.anchors.gate3.point, surface.polygon))
        .toBe(false);
    });
    expect(PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.sidewalkOmissions
      .map(({ officialIdentifier }) => officialIdentifier))
      .toEqual(['B4', 'B6', 'B11']);
  });

  it('keeps the street-side tree band wholly outside roofs, sidewalks and parking asphalt', () => {
    const segments = PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.treeBand.segments;
    const protectedFootprints = officialFootprints([
      ...PARK_ACCESS_SPATIAL_PLAN.protectedCommercialGeometry.identifiers,
      'B11',
      'B23',
    ]);

    expect(segments.map((segment) => segment.protectedIdentifier))
      .toEqual(['B5']);
    expect(PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.treeBand.omittedOfficialIdentifiers)
      .toEqual(['B1', 'B2', 'B3', 'B4', 'B6']);
    expect(PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.treeBand.omissionReason)
      .toContain('menos de 0,75 m');
    segments.forEach((segment) => {
      expectClosedFinitePolygon(segment.polygon);
      protectedFootprints.forEach(({ identifier, polygon }) => {
        expect(polygonsIntersect(segment.polygon, polygon), `${segment.id}/${identifier}`)
          .toBe(false);
      });
      PARK_ACCESS_SPATIAL_PLAN.sidewalkSurfaces.forEach((sidewalk) => {
        expect(polygonsIntersect(segment.polygon, sidewalk.polygon), `${segment.id}/${sidewalk.id}`)
          .toBe(false);
      });
      expect(polygonsIntersect(
        segment.polygon,
        PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.parkingCutout,
      ), `${segment.id}/parking-cutout`).toBe(false);
      PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.parkingAprons.forEach((apron) => {
        expect(polygonsIntersect(segment.polygon, apron.polygon), `${segment.id}/${apron.id}`)
          .toBe(false);
      });

      const ownFootprint = protectedFootprints
        .find(({ identifier }) => identifier === segment.protectedIdentifier)!.polygon;
      expect(Math.min(...segment.centerline.map(([, z]) => z)))
        .toBeGreaterThan(Math.max(...ownFootprint.map(([, z]) => z)));
      expect(segment.confidence).toBe('ANNEX_RELATIVE_TRACE');
    });
  });

  it('notches the Gate 3 arrival around B11/B42-02 and derives every approach heading from its trace', () => {
    const roads = new Map(PARK_ACCESS_SPATIAL_PLAN.roadSurfaces
      .map((road) => [road.id, road]));
    const gate3Arrival = roads.get('gate-3-arrival')!;
    officialFootprints(['B11', 'B42-02']).forEach(({ identifier, polygon }) => {
      expect(polygonsIntersect(gate3Arrival.polygon, polygon), `gate-3-arrival/${identifier}`)
        .toBe(false);
    });
    expect(pointInPolygon(PARK_ACCESS_SPATIAL_PLAN.anchors.gate3.point, gate3Arrival.polygon))
      .toBe(true);
    gate3Arrival.centerline.forEach((point) => {
      expect(pointInPolygon(point, gate3Arrival.polygon)).toBe(true);
    });
    expect(gate3Arrival.notes).toContain('B42-02');

    const gate1Trace = roads.get('gate-1-local-access')!.sourcePdfCenterline;
    const gate3Trace = roads.get('benvenuto-four-lane-axis')!.sourcePdfCenterline;
    const gate2Trace = PARK_ACCESS_SPATIAL_PLAN.woodlandPath.sourcePdfCenterline;
    expect(PARK_ACCESS_SPATIAL_PLAN.gates.gate1.approachHeadingRadians).toBeCloseTo(
      parkAccessHeadingBetween(gate1Trace.at(-2)!, gate1Trace.at(-1)!),
      10,
    );
    expect(PARK_ACCESS_SPATIAL_PLAN.gates.gate2.approachHeadingRadians).toBeCloseTo(
      parkAccessHeadingBetween(gate2Trace[0], gate2Trace[1]),
      10,
    );
    expect(PARK_ACCESS_SPATIAL_PLAN.gates.gate2.approachHeadingRadians * 180 / Math.PI)
      .toBeCloseTo(-53.13, 2);
    expect(PARK_ACCESS_SPATIAL_PLAN.gates.gate3.approachHeadingRadians).toBeCloseTo(
      parkAccessHeadingBetween(gate3Trace.at(-2)!, gate3Trace.at(-1)!),
      10,
    );
  });

  it('uses distinct deterministic elevations whenever road polygons overlap', () => {
    const roads = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces;
    for (let firstIndex = 0; firstIndex < roads.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < roads.length; secondIndex += 1) {
        const first = roads[firstIndex];
        const second = roads[secondIndex];
        if (polygonsIntersect(first.polygon, second.polygon)) {
          expect(first.elevation, `${first.id}/${second.id}`).not.toBe(second.elevation);
        }
      }
    }

    const roadById = new Map(roads.map((road) => [road.id, road]));
    expect(roadById.get('gate-1-apron')!.elevation)
      .toBeGreaterThan(roadById.get('gate-1-local-access')!.elevation);
    expect(roadById.get('gate-3-arrival')!.elevation)
      .toBeGreaterThan(roadById.get('benvenuto-four-lane-axis')!.elevation);
    PARK_ACCESS_SPATIAL_PLAN.roundabouts.forEach((roundabout) => {
      expect(roundabout.elevation)
        .not.toBe(roadById.get('benvenuto-four-lane-axis')!.elevation);
    });
  });

  it('registers the current annexes in revision .5 without leaking local paths', () => {
    expect(PARK_ACCESS_SPATIAL_PLAN.revision).toBe('2026.8-park-access-annexes.5');
    const currentSources = PARK_ACCESS_SOURCE_MANIFEST.filter(
      (source) => /^annex-(17|18|19|20|21|22)-/.test(source.id),
    );
    expect(currentSources.map(({ id, file }) => [id, file])).toEqual([
      [
        'annex-17-current-map-overview',
        'attachment:1351704b-b70f-45ae-ac54-064b870b8ad0.png',
      ],
      [
        'annex-18-current-map-gate-1',
        'attachment:454bebad-04cc-4e38-a60c-01191a4b69f2.png',
      ],
      [
        'annex-19-current-map-gate-10',
        'attachment:c5c5f3ad-8d14-4090-8270-f07b9ccbde30.png',
      ],
      [
        'annex-20-satellite-gate-1-roundabout',
        'attachment:WhatsApp Image 2026-08-26 at 17.31.03 (1).jpeg',
      ],
      [
        'annex-21-site-plan-gate-1-motorhome',
        'attachment:Imagem do Codex 26 de ago. de 2026, 19_41_35 (1).png',
      ],
      [
        'annex-22-aerial-motorhome-road',
        'attachment:WhatsApp Image 2026-08-26 at 19.41.21 (1).jpeg',
      ],
    ]);
    currentSources.forEach((source) => {
      expect(source.file).toMatch(/^attachment:/);
      expect(source.role.length).toBeGreaterThan(30);
      expect(source.interpretation.length).toBeGreaterThan(30);
      expect(source.metricUse).toBeDefined();
    });
    expect(PARK_ACCESS_SOURCE_MANIFEST.find(
      (source) => source.id === 'annex-23-satellite-gates-6-7',
    )).toMatchObject({
      file: 'docs/refs-portoes-6-7.jpeg',
      metricUse: 'RELATIVE_ONLY',
    });
  });

  it('keeps protected commercial geometry read-only and uncertainty visible', () => {
    expect(PARK_ACCESS_SPATIAL_PLAN.protectedCommercialGeometry.policy)
      .toContain('no lot, pavilion, commercial module');
    expect(PARK_ACCESS_SPATIAL_PLAN.protectedCommercialGeometry.identifiers)
      .toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
    expect(PARK_ACCESS_SPATIAL_PLAN.thirdAgePavilionSetting.protectedFootprintIdentifiers)
      .toEqual(['B22']);
    expect(PARK_ACCESS_SPATIAL_PLAN.openQuestions.length).toBeGreaterThanOrEqual(10);
    expect(PARK_ACCESS_SPATIAL_PLAN.openQuestions.some((question) => question.includes('5,5 m e 7 m')))
      .toBe(true);
    expect(PARK_ACCESS_SPATIAL_PLAN.openQuestions.some((question) => question.includes('B22')))
      .toBe(true);
    expect(PARK_ACCESS_SOURCE_MANIFEST.every((source) => source.metricUse !== undefined)).toBe(true);
    PARK_ACCESS_SOURCE_MANIFEST.forEach((source) => {
      expect(source.file).not.toMatch(/^[a-z]:[\\/]/i);
      expect(source.file).not.toMatch(/[\\/]Users[\\/]/i);
    });
  });
});
