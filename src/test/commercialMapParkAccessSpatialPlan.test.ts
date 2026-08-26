import {
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
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';

function distance(first: ParkAccessPoint, second: ParkAccessPoint) {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
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
    const entity = OFFICIAL_REFERENCE_DATA.entities
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
      [684, 3306],
      [1274, 4040],
      [3935, 4219],
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

  it('preserves A1, A2 and A3 as official anchors without swapping gates 2 and 3', () => {
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
    (['gate1', 'gate2', 'gate3'] as const).forEach((key) => {
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

  it('makes A1 the seam between Tupareendi arrival and the Costeiros service road', () => {
    const approach = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces
      .find((surface) => surface.id === 'gate-1-approach')!;
    const service = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces
      .find((surface) => surface.id === 'costeiros-service-road')!;
    const gate1 = PARK_ACCESS_SPATIAL_PLAN.anchors.gate1.point;

    expect(approach.centerline.at(-1)).toEqual(gate1);
    expect(service.centerline[0]).toEqual(gate1);
    expect(approach.connects).toContain('AV-TUPARENDI');
    expect(service.connects).toContain('sede-costeiros');

    const buildingXs = PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.buildingPolygon.map(([x]) => x);
    const roadNearBuildingXs = service.centerline.slice(1, 5).map(([x]) => x);
    expect(Math.min(...buildingXs)).toBeGreaterThan(Math.max(...roadNearBuildingXs));
    expect(PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.serviceRoadIds)
      .toEqual(['costeiros-service-road', 'costeiros-field-spur']);
  });

  it('provides a dimensionally consistent, explicitly reviewable roundabout', () => {
    const roundabout = PARK_ACCESS_SPATIAL_PLAN.roundabout;
    expect(roundabout.outerRadius).toBe(parkAccessMetersToLocal(18));
    expect(roundabout.islandRadius).toBe(parkAccessMetersToLocal(10.5));
    expect(roundabout.circulatingWidth)
      .toBeCloseTo(roundabout.outerRadius - roundabout.islandRadius, 4);
    expect(roundabout.confidence).toBe('DIMENSIONALLY_INFERRED');
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
    PARK_ACCESS_SPATIAL_PLAN.roundabout.splitterIslands
      .forEach((island) => expectClosedFinitePolygon(island.polygon));
    expectClosedFinitePolygon(PARK_ACCESS_SPATIAL_PLAN.woodlandPath.surfacePolygon);
    expectClosedFinitePolygon(PARK_ACCESS_SPATIAL_PLAN.woodlandPath.clearancePolygon);
    expectClosedFinitePolygon(PARK_ACCESS_SPATIAL_PLAN.woodlandMass.polygon);
    expectClosedFinitePolygon(PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.buildingPolygon);
    expectClosedFinitePolygon(PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.yardPolygon);
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

    const gate1Trace = roads.get('gate-1-approach')!.sourcePdfCenterline;
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
      .toBeGreaterThan(roadById.get('gate-1-approach')!.elevation);
    expect(roadById.get('gate-3-arrival')!.elevation)
      .toBeGreaterThan(roadById.get('benvenuto-four-lane-axis')!.elevation);
    expect(PARK_ACCESS_SPATIAL_PLAN.roundabout.elevation)
      .not.toBe(roadById.get('benvenuto-four-lane-axis')!.elevation);
  });

  it('keeps protected commercial geometry read-only and uncertainty visible', () => {
    expect(PARK_ACCESS_SPATIAL_PLAN.protectedCommercialGeometry.policy)
      .toContain('no lot, pavilion, commercial module');
    expect(PARK_ACCESS_SPATIAL_PLAN.protectedCommercialGeometry.identifiers)
      .toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
    expect(PARK_ACCESS_SPATIAL_PLAN.openQuestions.length).toBeGreaterThanOrEqual(6);
    expect(PARK_ACCESS_SOURCE_MANIFEST.every((source) => source.metricUse !== undefined)).toBe(true);
    PARK_ACCESS_SOURCE_MANIFEST.forEach((source) => {
      expect(source.file).not.toMatch(/^[a-z]:[\\/]/i);
      expect(source.file).not.toMatch(/[\\/]Users[\\/]/i);
    });
  });
});
