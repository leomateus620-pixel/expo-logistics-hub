import { describe, expect, it } from 'vitest';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import { OFFICIAL_REFERENCE_DATA, officialPdfPointToLocal } from '../features/commercial-map/data/officialReference2026';
import { createExporural2028Preview } from '../features/commercial-map/data/exporuralReference2028';
import {
  EXPORURAL_SOUTH_ROAD_CANDIDATE, EXPORURAL_SOUTH_ROAD_SOURCE,
  buildExporuralSouthRoadPresentation, createExporuralSouthRoadPresentationResolver,
  isExporuralSouthRoadPresentationEntity, withExporuralSouthRoadPresentation,
} from '../features/commercial-map/utils/exporuralSouthRoadPresentation';
import { buildRoadBoundaryRuns, buildRoadNetworkGeometries, disposeRoadNetworkGeometries, findRoadConnections } from '../features/commercial-map/utils/roadInfrastructure';
import { pointInPolygon } from '../features/commercial-map/utils/spatialSurface';
import type { Coordinate, MapEntity } from '../features/commercial-map/types';
import { buildVisitGroundSurfaces, VisitGroundingSystem } from '../features/commercial-map/visit/VisitGroundingSystem';
import { COMMERCIAL_MAP_TREES } from '../features/commercial-map/data/commercialTrees';
import { buildRearTreeInstances } from '../features/commercial-map/data/rearParkEnvironment';
import { TERRITORY_TREES } from '../features/commercial-map/data/territorialEnvironment';

const preview = createExporural2028Preview();
// Actual persisted geometry from the authorized 568.78 m² migration. The preview
// fixture predates this parcel; it must be protected just like numbered lots.
const unnumbered: MapEntity = {
  ...preview.entities.find(entity => entity.publicIdentifier === 'Q-R-04')!,
  id: 'test:known-persisted-unnumbered-area', publicIdentifier: 'EXPORURAL-AREA-56878', isSellable: true,
  geometry: { ...preview.entities.find(entity => entity.publicIdentifier === 'Q-R-04')!.geometry, coordinates: [[
    [24.68837516, -13.450066446], [21.747534344, -12.896686115], [18.525656934, -12.040628063],
    [18.475592803, -11.57], [16.38, -11.57], [16.38, -11.69], [14.073937134, -11.69],
    [14.061813005, -13.096302304], [14.149275247, -13.301302308], [14.399055627, -13.454521817],
    [24.68837516, -13.450066446],
  ]] },
  metadata: { areaCode: 'EXPORURAL', entityType: 'EXPORURAL_COMMERCIAL_LOT', block: 'R', lotNumber: null, officialAreaSqm: 568.78 },
};
const entities = [...preview.entities, unnumbered];
const owner = entities.find(entity => entity.publicIdentifier === 'RUA-EMANUEL-BRACHMANN')!;
const west = entities.find(entity => entity.publicIdentifier === 'RUA-PASTOR-ALBERT-LEHENBAUER')!;
const asPolygon = (entity: MapEntity): MultiPolygon => [entity.geometry.coordinates];
const area = (polygons: MultiPolygon) => polygons.reduce((total, rings) => total + rings.reduce((sum, ring, index) => {
  let signed = 0;
  for (let i = 1; i < ring.length; i++) signed += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
  return sum + Math.abs(signed) / 2 * (index ? -1 : 1);
}, 0), 0);
const contains = (polygons: MultiPolygon, point: readonly [number, number]) => polygons.some(rings =>
  pointInPolygon(point, rings[0]) && !rings.slice(1).some(hole => pointInPolygon(point, hole)));

describe('registered southern Expo Rural road to the C4 side access', () => {
  it('uses the documented corridor and replaces only the existing road presentation owner', () => {
    const before = JSON.stringify({ entities, lots: preview.lots });
    const plan = buildExporuralSouthRoadPresentation(entities)!;
    expect(plan).not.toBeNull();
    expect(EXPORURAL_SOUTH_ROAD_SOURCE.documentedWidthMeters).toBe(6);
    expect(plan.roadEntity).toMatchObject({ id: owner.id, publicIdentifier: owner.publicIdentifier,
      isSellable: false, metadata: { presentationOnly: true, exporuralSouthRoadPresentation: true } });
    expect(isExporuralSouthRoadPresentationEntity(plan.roadEntity)).toBe(true);
    expect(plan.roadEntity.geometry.id).toBeNull();
    const presented = withExporuralSouthRoadPresentation(entities, plan);
    expect(presented).toHaveLength(entities.length);
    expect(new Set(presented.map(entity => entity.id)).size).toBe(entities.length);
    for (let i = 0; i < entities.length; i++) {
      expect(presented[i]).toBe(entities[i].id === owner.id ? plan.roadEntity : entities[i]);
    }
    expect(withExporuralSouthRoadPresentation(entities, null)).toBe(entities);
    expect(JSON.stringify({ entities, lots: preview.lots })).toBe(before);
  });

  it('connects both road owners along the free strip and leaves the park below it uncovered', () => {
    const plan = buildExporuralSouthRoadPresentation(entities)!;
    expect(plan.footprint).toHaveLength(1);
    expect(polygonClipping.union(plan.footprint, asPolygon(west))).toHaveLength(1);
    for (const point of [[4020, 2337], [4400, 2337], [4700, 2340], [4870, 2345]] as const) {
      expect(contains(plan.footprint, officialPdfPointToLocal(point)), point.join(',')).toBe(true);
    }
    expect(contains(plan.footprint, officialPdfPointToLocal([4600, 2460]))).toBe(false);
    expect(area(polygonClipping.intersection(plan.connectorFootprint, asPolygon(owner)))).toBeLessThan(1e-9);
    expect(area(polygonClipping.intersection(plan.connectorFootprint, asPolygon(west)))).toBeLessThan(1e-9);
  });

  it('never covers numbered lots, the unnumbered 568.78 m² parcel, C4 or its existing restroom', () => {
    const plan = buildExporuralSouthRoadPresentation(entities)!;
    const protectedEntities = entities.filter(entity => entity.isSellable
      || ['SELLABLE_LOT', 'INTERNAL_STAND', 'PAVILION', 'BUILDING', 'RESTAURANT', 'RESTROOM', 'ADMINISTRATION', 'ATTRACTION'].includes(entity.classification));
    expect(protectedEntities).toContain(unnumbered);
    for (const entity of protectedEntities) {
      expect(area(polygonClipping.intersection(plan.connectorFootprint, asPolygon(entity))), entity.publicIdentifier).toBeLessThan(1e-9);
    }
    // The user's third annotation follows this precise northern commercial edge.
    expect(area(polygonClipping.intersection(plan.footprint, asPolygon(unnumbered)))).toBeLessThan(1e-9);
  });

  it('preserves every portion of Emanuel outside the new registered trace', () => {
    const plan = buildExporuralSouthRoadPresentation(entities)!;
    const previousOutside = polygonClipping.difference(asPolygon(owner), EXPORURAL_SOUTH_ROAD_CANDIDATE);
    const presentedOutside = polygonClipping.difference(plan.footprint, EXPORURAL_SOUTH_ROAD_CANDIDATE);
    expect(area(polygonClipping.xor(previousOutside, presentedOutside))).toBeLessThan(1e-9);
    expect(area(polygonClipping.difference(asPolygon(owner), plan.footprint))).toBeLessThan(1e-9);
    expect(plan.roadEntity.geometry.elevation).toBe(owner.geometry.elevation);
    expect(plan.roadEntity.geometry.extrusionHeight).toBe(owner.geometry.extrusionHeight);
  });

  it('cuts only the recovered corridor, with triangulation respecting a protected hole', () => {
    const hole: MapEntity = { ...unnumbered, id: 'test:protected-obstacle', publicIdentifier: 'TEST-PROTECTED-OBSTACLE',
      classification: 'BUILDING', isSellable: false, geometry: { ...unnumbered.geometry, coordinates: [[
        [20, -14.1], [20.15, -14.1], [20.15, -13.9], [20, -13.9], [20, -14.1],
      ]] } };
    const plan = buildExporuralSouthRoadPresentation([...entities, hole])!;
    expect(plan).not.toBeNull();
    expect(plan.connectorFootprint[0]).toHaveLength(2);
    const cuts: MultiPolygon = plan.groundCuts.map(cut => [
      [...cut.polygon, cut.polygon[0]].map(point => [point[0], point[1]] as Coordinate),
    ]);
    const receivers = polygonClipping.union(cuts[0], ...cuts.slice(1));
    expect(area(polygonClipping.xor(receivers, plan.connectorFootprint))).toBeLessThan(1e-8);
    expect(area(polygonClipping.intersection(receivers, asPolygon(hole)))).toBeLessThan(1e-9);
    expect(area(polygonClipping.difference(receivers, EXPORURAL_SOUTH_ROAD_CANDIDATE))).toBeLessThan(1e-9);
  });

  it('fails closed when subdivision or an obstruction removes the continuous corridor', () => {
    expect(buildExporuralSouthRoadPresentation(OFFICIAL_REFERENCE_DATA.entities)).toBeNull();
    expect(buildExporuralSouthRoadPresentation(entities.filter(entity => entity !== owner))).toBeNull();
    expect(buildExporuralSouthRoadPresentation(entities.map(entity => entity === west ? { ...entity, isArchived: true } : entity))).toBeNull();
    const obstruction: MapEntity = { ...unnumbered, id: 'test:closing-obstacle', classification: 'BUILDING', isSellable: false,
      geometry: { ...unnumbered.geometry, coordinates: [[[20, -14.5], [20.2, -14.5], [20.2, -13.2], [20, -13.2], [20, -14.5]]] } };
    expect(buildExporuralSouthRoadPresentation([...entities, obstruction])).toBeNull();
    const invalid: MapEntity = { ...owner, geometry: { ...owner.geometry, coordinates: [[[NaN, 0], [1, 0], [1, 1]]] } };
    expect(buildExporuralSouthRoadPresentation(entities.map(entity => entity === owner ? invalid : entity))).toBeNull();
  });

  it('keeps the same geometry resources through unrelated and commercial status refreshes', () => {
    const resolve = createExporuralSouthRoadPresentationResolver();
    const plan = resolve(entities);
    expect(resolve(entities.map(entity => ({ ...entity, name: `${entity.name} updated`, metadata: { ...entity.metadata, status: 'SOLD' } })))).toBe(plan);
    const modified = entities.map(entity => entity === unnumbered ? { ...entity,
      geometry: { ...entity.geometry, coordinates: entity.geometry.coordinates.map(ring => ring.map(p => [p[0], p[1] + .01] as [number, number])) } } : entity);
    expect(resolve(modified)).not.toBe(plan);
  });

  it.each([false, true])('grounds visits on the rendered connector height, context=%s', includeContext => {
    const plan = buildExporuralSouthRoadPresentation(entities)!;
    const ground = new VisitGroundingSystem(buildVisitGroundSurfaces(entities, includeContext));
    expect(ground.surfaces.some(surface => surface.id === owner.id)).toBe(true);
    for (const point of [[4020, 2337], [4400, 2337], [4700, 2340]] as const) {
      const [x, z] = officialPdfPointToLocal(point);
      expect(contains(plan.connectorFootprint, [x, z])).toBe(true);
      expect(ground.heightAt(x, z), point.join(',')).toBeCloseTo(plan.roadEntity.geometry.elevation + .032, 6);
    }
  }, 15000);

  it('requires no tree inventory reduction: no existing canonical or procedural trunk is in the recovered strip', () => {
    const plan = buildExporuralSouthRoadPresentation(entities)!;
    expect(COMMERCIAL_MAP_TREES.filter(tree => contains(plan.connectorFootprint, tree.position)).map(tree => tree.id)).toEqual([]);
    expect(buildRearTreeInstances(false).filter(tree => contains(plan.connectorFootprint, [tree.x, tree.z]))).toEqual([]);
    expect(TERRITORY_TREES.filter(tree => contains(plan.connectorFootprint, tree.center))).toEqual([]);
  });

  it.each([.2, .36])('retains the original Emanuel curb runs beyond the western continuation, step=%s', boundaryStep => {
    const plan = buildExporuralSouthRoadPresentation(entities)!;
    const roads = entities.filter(entity => entity.classification === 'ROAD');
    const before = buildRoadBoundaryRuns(roads, boundaryStep).filter(run => run.entityId === owner.id
      && !contains(EXPORURAL_SOUTH_ROAD_CANDIDATE, run.from) && !contains(EXPORURAL_SOUTH_ROAD_CANDIDATE, run.to));
    const after = buildRoadBoundaryRuns([...withExporuralSouthRoadPresentation(roads, plan)], boundaryStep).filter(run => run.entityId === owner.id);
    expect(before.length).toBeGreaterThan(0);
    for (const run of before) expect(after).toContainEqual(run);
  });

  it.each([false, true])('uses the existing asphalt batch and preserves original junction aprons, reduced=%s', reducedGraphics => {
    const plan = buildExporuralSouthRoadPresentation(entities)!;
    const presented = withExporuralSouthRoadPresentation(entities, plan).filter(entity => entity.classification === 'ROAD');
    // The new polygon joins its mouths directly. Legacy aprons keep the old
    // coordinates so the enlarged AABB cannot cover the unnumbered parcel.
    expect(findRoadConnections(presented)).toEqual(findRoadConnections(entities.filter(entity => entity.classification === 'ROAD')));
    const geometry = buildRoadNetworkGeometries([plan.roadEntity], { reducedGraphics });
    try {
      expect(geometry.asphalt).not.toBeNull();
      expect(geometry.diagnostics.roadCount).toBe(1);
      expect(geometry.diagnostics.estimatedBaseDrawCalls).toBeLessThanOrEqual(5);
      const positions = geometry.asphalt!.getAttribute('position');
      let topArea = 0;
      for (let i = 0; i < positions.count; i += 3) {
        if (![i, i + 1, i + 2].every(index => Math.abs(positions.getY(index) - .032) < 1e-6)) continue;
        const ring = [i, i + 1, i + 2].map(index => [positions.getX(index), positions.getZ(index)] as [number, number]);
        ring.push(ring[0]);
        const triangle: MultiPolygon = [[ring]];
        topArea += area(triangle);
        expect(area(polygonClipping.intersection(triangle, asPolygon(unnumbered)))).toBeLessThan(1e-6);
      }
      expect(topArea).toBeCloseTo(area(plan.footprint), 4);
    } finally { disposeRoadNetworkGeometries(geometry); }
  });
});
