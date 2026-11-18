import polygonClipping from 'polygon-clipping';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_2026_CARTOGRAPHIC_LOT_GAP, OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  fitPublicCompanyFootprint,
  preparePublicSoldCompanyGeometry,
  type PublicSoldCompanyGeometry,
} from '@/features/commercial-map/public/publicSoldCompanyGeometry';
import type { Coordinate, MapEntity } from '@/features/commercial-map/types';

const rect = (x: number, z: number, width: number, depth: number): Coordinate[] => [
  [x, z], [x + width, z], [x + width, z + depth], [x, z + depth], [x, z],
];
const entity = (id: string, rings: Coordinate[][], elevation = 0) => ({
  id, geometry: { type: 'Polygon', coordinates: rings, elevation, extrusionHeight: .025 },
} as MapEntity);
const group = (entityIds: string[], key = 'group', tradeName: string | null = 'KF') => ({ key, entityIds, tradeName });
const addSegments = (geometry: PublicSoldCompanyGeometry) => Array.from({ length: geometry.contourPositions.length / 6 }, (_, index) => (
  geometry.contourPositions.slice(index * 6, index * 6 + 6)
));

function expectWholeFootprintInside(geometry: PublicSoldCompanyGeometry, aspectRatio: number) {
  const fit = fitPublicCompanyFootprint(geometry, aspectRatio);
  expect(fit).not.toBeNull();
  const { footprint, componentIndex } = fit!;
  expect(polygonClipping.difference([footprint], geometry.components[componentIndex].rings)).toEqual([]);
  return fit!;
}

describe('public sold company cadastral composition', () => {
  it('unites three adjacent parcels and removes both shared edges without changing input geometry', () => {
    const lots = [entity('a', [rect(0, 0, 5, 4)]), entity('b', [rect(5, 0, 5, 4)]), entity('c', [rect(10, 0, 5, 4)])];
    const original = JSON.stringify(lots);
    const [geometry] = preparePublicSoldCompanyGeometry([group(['c', 'a', 'b', 'a'])], lots);

    expect(geometry.entityIds).toEqual(['a', 'b', 'c']);
    expect(geometry.components).toHaveLength(1);
    expect(geometry.components[0].area).toBeCloseTo(60);
    expect(addSegments(geometry)).toHaveLength(4);
    expect(addSegments(geometry).filter(([x, , , toX]) => x === toX).map(([x]) => x).sort((a, b) => a - b)).toEqual([0, 15]);
    expectWholeFootprintInside(geometry, 1.8);
    expect(JSON.stringify(lots)).toBe(original);
  });

  it('keeps the other side of a road distinct and anchors the name inside the component with usable space', () => {
    const lots = [entity('main', [rect(0, 0, 8, 5)]), entity('remote', [rect(12, 0, 3, 4)]), entity('context', [rect(8, 0, 4, 5)])];
    // The context entity is out of scope even when it would bridge the gap.
    const [geometry] = preparePublicSoldCompanyGeometry([group(['main', 'remote', 'context'])], lots.slice(0, 2));
    expect(geometry.entityIds).toEqual(['main', 'remote']);
    expect(geometry.components.map(component => component.area)).toEqual([40, 12]);
    expect(addSegments(geometry)).toHaveLength(8);
    const fit = expectWholeFootprintInside(geometry, 2);
    expect(fit.componentIndex).toBe(0);
    expect(fit.anchor[0]).toBeGreaterThan(0);
    expect(fit.anchor[0]).toBeLessThan(8);
  });

  it('preserves the open notch in an L and fits the complete widened text rectangle', () => {
    const lots = [entity('long', [rect(0, 0, 12, 4)]), entity('arm', [rect(0, 4, 4, 8)])];
    const [geometry] = preparePublicSoldCompanyGeometry([group(['arm', 'long'])], lots);
    expect(geometry.components).toHaveLength(1);
    expect(geometry.components[0].area).toBe(80);
    expect(addSegments(geometry)).toHaveLength(6);
    expectWholeFootprintInside(geometry, 5.5);
    expectWholeFootprintInside(geometry, 2.6);
  });

  it('draws an enclosed hole and keeps even a full-width label out of it', () => {
    const lot = entity('courtyard', [rect(0, 0, 10, 10), rect(3, 3, 4, 4)]);
    const [geometry] = preparePublicSoldCompanyGeometry([group([lot.id])], [lot]);
    expect(geometry.components[0].rings).toHaveLength(2);
    expect(geometry.components[0].area).toBe(84);
    expect(addSegments(geometry)).toHaveLength(8);
    expectWholeFootprintInside(geometry, 1.5);
    expectWholeFootprintInside(geometry, 4.4);
  });

  it('fits a rotated narrow strip and keeps identical names in independent groups', () => {
    const rotate = ([x, z]: Coordinate): Coordinate => [(x - z) * Math.SQRT1_2, (x + z) * Math.SQRT1_2];
    const narrow = entity('narrow', [rect(0, 0, 12, 1.5).map(rotate)]);
    const neighbor = entity('same-name', [rect(50, 50, 5, 5)]);
    const geometries = preparePublicSoldCompanyGeometry([group(['narrow'], 'one'), group(['same-name'], 'two')], [neighbor, narrow]);
    expect(geometries.map(geometry => geometry.key)).toEqual(['one', 'two']);
    const fit = expectWholeFootprintInside(geometries[0], 7);
    expect(fit.width).toBeGreaterThan(6);
    expect(Math.abs(Math.sin(fit.angle - Math.PI / 4))).toBeLessThan(.01);
  });

  it('joins the documented inset between the four P-09–12 grid parcels without moving their outside outline', () => {
    const identifiers = ['Q-P-09', 'Q-P-10', 'Q-P-11', 'Q-P-12'];
    const lots = OFFICIAL_REFERENCE_ENTITIES.filter(lot => identifiers.includes(lot.publicIdentifier));
    expect(lots).toHaveLength(4);
    const before = JSON.stringify(lots.map(lot => lot.geometry));
    const points = lots.flatMap(lot => lot.geometry.coordinates[0]);
    const xs = points.map(p => p[0]);
    const zs = points.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);

    const [geometry] = preparePublicSoldCompanyGeometry([group(lots.map(lot => lot.id), 'p-grid', 'FOROESTE')], lots);
    expect(geometry.components).toHaveLength(1);
    expect(geometry.components[0].rings).toHaveLength(1);
    expect(geometry.components[0].area).toBeCloseTo((maxX - minX) * (maxZ - minZ), 10);
    expect(addSegments(geometry)).toHaveLength(4);
    const outer = geometry.components[0].rings[0];
    expect(outer).toHaveLength(4);
    expect(outer.every(([x, z]) => (x === minX || x === maxX) && (z === minZ || z === maxZ))).toBe(true);
    for (const aspectRatio of [2.2, 6]) {
      const fit = expectWholeFootprintInside(geometry, aspectRatio);
      expect(fit.angle).toBe(0);
      expect(fit.anchor[0]).toBeCloseTo((minX + maxX) / 2, 7);
      expect(fit.anchor[1]).toBeCloseTo((minZ + maxZ) / 2, 7);
    }
    const full = fitPublicCompanyFootprint(geometry, 2.2)!;
    const compact = fitPublicCompanyFootprint(geometry, 1.6, { fixedPlacement: full, maxMargin: .10 });
    expect(compact).toMatchObject({ anchor: full.anchor, angle: full.angle, componentIndex: full.componentIndex });
    expect(polygonClipping.difference([compact!.footprint], geometry.components[full.componentIndex].rings)).toEqual([]);
    expect(JSON.stringify(lots.map(lot => lot.geometry))).toBe(before);
  });

  it('keeps real gaps, unmatched sides and different quadras or companies separate', () => {
    const gap = OFFICIAL_2026_CARTOGRAPHIC_LOT_GAP.x;
    const parcel = (id: string, x: number, z: number, depth: number, parent: string, cartographicAreaOnly = true) => ({
      ...entity(id, [rect(x, z, 2, depth)]), parentEntityId: parent, metadata: { cartographicAreaOnly },
    });
    const left = parcel('left', 0, 0, 4, 'quadra');
    const right = parcel('right', 2 + gap, 0, 4, 'quadra');
    const neighbors = [
      parcel('road', 2 + gap + .005, 0, 4, 'quadra'),
      parcel('mismatch', 2 + gap, .1, 4, 'quadra'),
      parcel('quadra', 2 + gap, 0, 4, 'other-quadra'),
      parcel('measured', 2 + gap, 0, 4, 'quadra', false),
    ];
    neighbors.forEach(neighbor => {
      const [geometry] = preparePublicSoldCompanyGeometry([group([left.id, neighbor.id])], [left, neighbor]);
      expect(geometry.components).toHaveLength(2);
      geometry.components.forEach(component => expect(component.area).toBeCloseTo(8, 10));
    });
    const companies = preparePublicSoldCompanyGeometry([group([left.id], 'a'), group([right.id], 'b')], [left, right]);
    companies.forEach(company => expect(company.components[0].area).toBeCloseTo(8, 10));
  });

  it('uses the horizontal axis when a steeply turned box offers only a modest size gain', () => {
    const lot = entity('almost-square', [rect(0, 0, 5, 6)]);
    const [geometry] = preparePublicSoldCompanyGeometry([group([lot.id])], [lot]);
    expect(expectWholeFootprintInside(geometry, 3.6).angle).toBe(0);
  });

  it('keeps a nameless perimeter, ignores malformed records, and preserves different elevations on a shared outside edge', () => {
    const low = entity('low', [rect(0, 0, 4, 4)]);
    const high = entity('high', [rect(4, 0, 4, 4)], 2);
    const invalid = entity('invalid', [[[20, 20], [20, 20], [20, 20]]]);
    const [geometry] = preparePublicSoldCompanyGeometry([group(['low', 'high', 'invalid'], 'nameless', null)], [low, high, invalid]);
    expect(geometry.entityIds).toEqual(['high', 'low']);
    expect(geometry.components).toHaveLength(1);
    expect(fitPublicCompanyFootprint(geometry, 2)).toBeNull();
    expect(addSegments(geometry).filter(([, , z, , , endZ]) => z === 0 && endZ === 0).map(([, y]) => y).sort((a, b) => a - b)).toEqual([.097, 2.097]);
    expect(addSegments(geometry).some(([x, , , endX]) => x === 4 && endX === 4)).toBe(false);
  });
});
