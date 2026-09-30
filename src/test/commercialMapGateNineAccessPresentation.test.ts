import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from 'three';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import { createExporural2028Preview } from '@/features/commercial-map/data/exporuralReference2028';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import {
  GATE_NINE_ACCESS_FOOTPRINT, GATE_NINE_NEIGHBOR_ROAD_IDENTIFIER, GATE_NINE_PARALLEL_HANDOFF_Z,
  GATE_NINE_VERGE_WIDTH, buildGateNineAccessPresentation, gateNineRasterPointToLocal,
} from '@/features/commercial-map/utils/gateNineRoadPresentation';
import { buildRoadNetworkGeometries, disposeRoadNetworkGeometries, findRoadConnections } from '@/features/commercial-map/utils/roadInfrastructure';
import { VisitGroundingSystem, buildVisitGroundSurfaces } from '@/features/commercial-map/visit/VisitGroundingSystem';
import type { Coordinate, MapEntity } from '@/features/commercial-map/types';

const data = createExporural2028Preview();
const neighbor = data.entities.find(entity => entity.publicIdentifier === GATE_NINE_NEIGHBOR_ROAD_IDENTIFIER)!;
const area = (polygons: MultiPolygon) => polygons.reduce((total, rings) => total + rings.reduce((sum, ring, index) => {
  const signed = ring.reduce((value, a, i) => { const b = ring[(i + 1) % ring.length]; return value + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
  return sum + Math.abs(signed) * (index === 0 ? 1 : -1);
}, 0), 0);
function span(ring: readonly (readonly [number, number])[], z: number) {
  const xs: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
  }
  return xs.sort((a, b) => a - b);
}
function heights(geometry: BufferGeometry | null, [x, z]: Coordinate) {
  if (!geometry) return [];
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  const ray = new Raycaster(new Vector3(x, 1, z), new Vector3(0, -1, 0));
  const values = ray.intersectObject(mesh).map(hit => hit.point.y);
  material.dispose();
  return values;
}

describe('separate Gate 9 access presentation', () => {
  it('reads the registered wide access while preserving all cadastral inputs and owners', () => {
    const before = JSON.stringify(data);
    const presentation = buildGateNineAccessPresentation(data.entities)!;
    expect(presentation).not.toBeNull();
    expect(presentation.roadEntity.id).toBe(data.entities.find(entity => entity.publicIdentifier === 'A9')!.id);
    expect(presentation.roadEntity.metadata.presentationOnly).toBe(true);
    expect(presentation.roadEntity.isSellable).toBe(false);
    expect(presentation.roadEntity.layerId).toBe(neighbor.layerId);
    expect(presentation.roadEntity.geometry.extrusionHeight).toBe(neighbor.geometry.extrusionHeight);
    expect(presentation.roadEntity.geometry).not.toBe(neighbor.geometry);
    expect(JSON.stringify(data)).toBe(before);
    expect(gateNineRasterPointToLocal([552, 320])).toEqual([13.79607313, -37.389455578]);
    expect(area(polygonClipping.difference(presentation.footprint, GATE_NINE_ACCESS_FOOTPRINT))).toBeLessThan(1e-8);
    expect(presentation.footprint.flat(2).every(point => point[1] <= -26.549361325 + 1e-8)).toBe(true);
  });

  it('paves both separate lanes without bridges, curbs or gutters filling the green middle strip', () => {
    const presentation = buildGateNineAccessPresentation(data.entities)!;
    const z = gateNineRasterPointToLocal([530, 450])[1];
    const accessEdge = Math.max(...span(presentation.footprint[0][0], z));
    const neighborEdge = Math.min(...span(neighbor.geometry.coordinates[0], z));
    const midpoint: Coordinate = [(accessEdge + neighborEdge) / 2, z];
    expect(neighborEdge - accessEdge).toBeGreaterThanOrEqual(GATE_NINE_VERGE_WIDTH - 1e-6);
    expect(area(presentation.separation)).toBeGreaterThan(0);
    expect(presentation.separation.flat(2).every(point => point[1] <= GATE_NINE_PARALLEL_HANDOFF_Z + 1e-8)).toBe(true);
    const roads = [neighbor, presentation.roadEntity];
    expect(findRoadConnections(roads)).toEqual([]);
    for (const reducedGraphics of [false, true]) {
      const network = buildRoadNetworkGeometries(roads, { reducedGraphics });
      try {
        expect(heights(network.asphalt, gateNineRasterPointToLocal([530, 350]))).toContainEqual(expect.closeTo(0.032, 6));
        expect(heights(network.asphalt, gateNineRasterPointToLocal([565, 350]))).toContainEqual(expect.closeTo(0.032, 6));
        for (const key of ['asphalt', 'intersections', 'curbs', 'gutters'] as const) expect(heights(network[key], midpoint), key).toEqual([]);
      } finally { disposeRoadNetworkGeometries(network); }
    }
  });

  it('meets the lower road without changing its footprint or covering any current lot or building', () => {
    const presentation = buildGateNineAccessPresentation(data.entities)!;
    const before = JSON.stringify(neighbor.geometry);
    expect(area(polygonClipping.intersection(presentation.footprint, [neighbor.geometry.coordinates]))).toBeLessThan(1e-8);
    const together = polygonClipping.union(presentation.footprint, [neighbor.geometry.coordinates]);
    expect(together).toHaveLength(1);
    for (const entity of data.entities.filter(entity => entity.classification === 'SELLABLE_LOT'
      || ['PAVILION', 'BUILDING', 'SERVICE', 'RESTROOM', 'RESTAURANT'].includes(entity.classification))) {
      expect(area(polygonClipping.intersection(presentation.footprint, [entity.geometry.coordinates])), entity.publicIdentifier).toBeLessThan(1e-8);
    }
    expect(JSON.stringify(neighbor.geometry)).toBe(before);
    const cutArea = presentation.groundCuts.reduce((sum, cut) => sum + area([[cut.polygon.map(point => [point[0], point[1]])]]), 0);
    expect(cutArea).toBeCloseTo(area(presentation.footprint), 7);
  });

  it('uses the same asphalt support in Visit Mode and keeps the middle below the pavement', () => {
    const presentation = buildGateNineAccessPresentation(data.entities)!;
    const surfaces = buildVisitGroundSurfaces(data.entities, true, data.entities, null, presentation);
    const ground = new VisitGroundingSystem(surfaces);
    for (const y of [350, 450, 580]) {
      const [x, z] = gateNineRasterPointToLocal([530, y]);
      expect(ground.heightAt(x, z), `A9 grid y=${y}`).toBeCloseTo(0.032, 6);
    }
    const scoped = data.entities.filter(entity => ['A9', GATE_NINE_NEIGHBOR_ROAD_IDENTIFIER].includes(entity.publicIdentifier));
    const isolatedGround = new VisitGroundingSystem(buildVisitGroundSurfaces(scoped, false));
    const [isolatedX, isolatedZ] = gateNineRasterPointToLocal([530, 450]);
    expect(isolatedGround.heightAt(isolatedX, isolatedZ)).toBeCloseTo(0.032, 6);
    const cutZ = gateNineRasterPointToLocal([530, 450])[1];
    const west = Math.max(...span(presentation.footprint[0][0], cutZ));
    const east = Math.min(...span(neighbor.geometry.coordinates[0], cutZ));
    expect(ground.heightAt((west + east) / 2, cutZ)).toBeLessThan(0.032);
  }, 20_000);

  it('fails closed for missing or fragmented owners instead of inventing map entities', () => {
    expect(buildGateNineAccessPresentation(data.entities.filter(entity => entity.publicIdentifier !== 'A9'))).toBeNull();
    expect(buildGateNineAccessPresentation(data.entities.filter(entity => entity !== neighbor))).toBeNull();
    expect(buildGateNineAccessPresentation(OFFICIAL_REFERENCE_DATA.entities)).toBeNull();
    const malformed: MapEntity = { ...neighbor, geometry: { ...neighbor.geometry, coordinates: [[[Number.NaN, 0], [0, 0], [1, 1]]] } };
    expect(buildGateNineAccessPresentation(data.entities.map(entity => entity === neighbor ? malformed : entity))).toBeNull();
  });
});
