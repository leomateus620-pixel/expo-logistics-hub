import { describe, expect, it } from 'vitest';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import { ACCESS_JUNCTION } from '../features/commercial-map/data/accessJunctionReconstruction';
import { PARK_ACCESS_SPATIAL_PLAN } from '../features/commercial-map/data/parkAccessSpatialPlan';
import { PARK_ACCESS_INFRASTRUCTURE_INPUT } from '../features/commercial-map/utils/parkAccessSpatialPlanAdapter';
import { accessCircle, accessCorridor, accessPavementGeometry, unionAccessPavement } from '../features/commercial-map/utils/accessJunctionGeometry';
import { buildTerritoryRoadGeometry, TERRITORY_ROAD_Y } from '../features/commercial-map/utils/territorialRoadGeometry';
import { clipContextRoad, isProtectedCommercialMapRoad } from '../features/commercial-map/data/commercialMapSpatialBounds';
import { pointInPolygon } from '../features/commercial-map/utils/spatialSurface';
import { buildParkAccessRenderModel, disposeParkAccessRenderModel } from '../features/commercial-map/utils/parkAccessInfrastructure';

const input = PARK_ACCESS_INFRASTRUCTURE_INPUT;
const unionSurfaces = input.roadSurfaces.filter(surface => surface.junctionUnion);
const pavement = unionAccessPavement(unionSurfaces.map(surface => surface.polygon), input.roundabouts);
const area = (polygons: MultiPolygon) => polygons.reduce((total, rings) => total + rings.reduce((sum, ring, index) => {
  const signed = ring.slice(0, -1).reduce((a, p, i) => a + p[0] * ring[i + 1][1] - ring[i + 1][0] * p[1], 0) / 2;
  return sum + Math.abs(signed) * (index === 0 ? 1 : -1);
}, 0), 0);
const contains = (point: readonly [number, number], polygon: MultiPolygon[number]) =>
  pointInPolygon(point, polygon[0]) && !polygon.slice(1).some(hole => pointInPolygon(point, hole));

describe('registered Gate 1 and Tuparendi junction ownership', () => {
  it('fits the existing closed OSM ring, rather than treating an eastern lane node as its centre', () => {
    expect(Math.hypot(ACCESS_JUNCTION.center[0] + 48.8727, ACCESS_JUNCTION.center[1] - 26.4)).toBeGreaterThan(2);
    ACCESS_JUNCTION.registeredRing.forEach(point => {
      expect(Math.abs(Math.hypot(point[0] - ACCESS_JUNCTION.center[0], point[1] - ACCESS_JUNCTION.center[1]) - ACCESS_JUNCTION.centerlineRadius)).toBeLessThan(.1);
    });
    expect(ACCESS_JUNCTION.outerRadius - ACCESS_JUNCTION.islandRadius).toBeCloseTo(1.52);
    expect(PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout.sourcePdfCenter).toEqual([341, 3718]);
  });

  it('forms one connected pavement from Gate 1 through both circles to every retained arterial seam', () => {
    expect(pavement).toHaveLength(1);
    const probes = [PARK_ACCESS_SPATIAL_PLAN.anchors.gate1.point, ACCESS_JUNCTION.gate1AvenueJoin,
      ...ACCESS_JUNCTION.approaches.flatMap(road => [road.points[0], road.points.at(-1)!])];
    probes.forEach(point => {
      // Boundary endpoints are tested with a small footprint as point-in-polygon
      // is deliberately undefined on polygon edges.
      const probe: MultiPolygon = [[accessCircle(point, .02, 8)]];
      expect(area(polygonClipping.intersection(pavement, probe))).toBeGreaterThan(.0001);
    });
    const link = input.roadSurfaces.find(surface => surface.id === 'gate-1-roundabout-tupareendi-link')!;
    const angles = link.centerline!.slice(1).map((p, i) => Math.atan2(p[1] - link.centerline![i][1], p[0] - link.centerline![i][0]));
    angles.slice(1).forEach((angle, i) => expect(Math.abs(angle - angles[i])).toBeLessThan(.35));
  });

  it('subtracts both complete islands and retains the source-defined western divider', () => {
    input.roundabouts.forEach(roundabout => {
      const island: MultiPolygon = [[accessCircle(roundabout.center, roundabout.islandRadius + roundabout.curbWidth)]];
      expect(area(polygonClipping.intersection(pavement, island))).toBeLessThan(1e-8);
      expect(pavement.some(polygon => contains(roundabout.center, polygon))).toBe(false);
    });
    const divider = ACCESS_JUNCTION.westDividerControls;
    const centroid = [divider.reduce((sum, p) => sum + p[0], 0) / 3, divider.reduce((sum, p) => sum + p[1], 0) / 3] as const;
    expect(pavement.some(polygon => contains(centroid, polygon))).toBe(false);
    expect(input.roundabouts[0].splitterIslands).toEqual([]);
  });

  it('triangulates only the union once, without hidden overlapping approach asphalt', () => {
    const geometry = accessPavementGeometry(pavement, ACCESS_JUNCTION.elevation)!;
    try {
      const position = geometry.getAttribute('position');
      const uv = geometry.getAttribute('uv');
      for (let index = 0; index < position.count; index += 1) {
        expect(uv.getX(index)).toBe(position.getX(index));
        expect(uv.getY(index)).toBe(position.getZ(index));
      }
      const indices = geometry.index!;
      let trianglesArea = 0;
      for (let i = 0; i < indices.count; i += 3) {
        const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
        trianglesArea += Math.abs((position.getX(b) - position.getX(a)) * (position.getZ(c) - position.getZ(a))
          - (position.getZ(b) - position.getZ(a)) * (position.getX(c) - position.getX(a))) / 2;
      }
      expect(trianglesArea).toBeCloseTo(area(pavement), 3);
      expect(ACCESS_JUNCTION.elevation).toBe(TERRITORY_ROAD_Y);
    } finally { geometry.dispose(); }
  });

  it('keeps exactly the same canonical asphalt boundary in detailed and economy modes', () => {
    // Isolate the actual renderer's junction layer from support-aware roads:
    // architectural LOD can vary, but this shared ownership edge cannot.
    const junctionInput = { ...input, roadSurfaces: unionSurfaces, sidewalkSurfaces: [], curbSegments: [],
      parkingBays: [], markingSegments: [], gates: [], costeiros: null };
    const detailed = buildParkAccessRenderModel(junctionInput);
    const economy = buildParkAccessRenderModel(junctionInput, { reducedGraphics: true });
    try {
      expect(Array.from(economy.geometries.asphalt!.getAttribute('position').array))
        .toEqual(Array.from(detailed.geometries.asphalt!.getAttribute('position').array));
      expect(Array.from(economy.geometries.asphalt!.index!.array))
        .toEqual(Array.from(detailed.geometries.asphalt!.index!.array));
      expect(economy.diagnostics.withinBudget).toBe(true);
    } finally { disposeParkAccessRenderModel(detailed); disposeParkAccessRenderModel(economy); }
  });

  it('cuts old territory pavement and paint at the transferred owner boundary', () => {
    const model = buildTerritoryRoadGeometry();
    try {
      const owner = polygonClipping.union([[accessCircle(ACCESS_JUNCTION.center, ACCESS_JUNCTION.outerRadius)]],
        [[accessCircle(PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout.center, PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout.outerRadius)]],
        ...ACCESS_JUNCTION.approaches.map(road => [[accessCorridor(road.points, road.width)]] as MultiPolygon));
      expect(area(polygonClipping.intersection(model.footprint, owner))).toBeLessThan(1e-7);
      const sidewalk = input.sidewalkSurfaces.find(surface => surface.id === 'gate-1-west-sidewalk')!;
      const mini = PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout;
      expect(area(polygonClipping.intersection([[accessCircle(mini.center, mini.outerRadius)]],
        [[sidewalk.polygon.map(point => [point[0], point[1]])]]))).toBeLessThan(1e-7);
    } finally { Object.values(model).forEach(value => { if (value && typeof value === 'object' && 'dispose' in value) value.dispose(); }); }
  });

  it('retains both roundabouts and their approach IDs even outside future context bounds', () => {
    for (const id of [...ACCESS_JUNCTION.unionRoadIds, ...ACCESS_JUNCTION.approaches.map(road => road.id), 'gate-1-mini-roundabout', 'roundabout-tupareendi']) {
      expect(isProtectedCommercialMapRoad({ id }), id).toBe(true);
      const distant = { id, points: [[-500, 500], [-490, 500]] as const };
      expect(clipContextRoad(distant)).toEqual([distant]);
    }
  });
});
