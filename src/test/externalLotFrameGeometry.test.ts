import { describe, expect, it } from 'vitest';
import polygonClipping from 'polygon-clipping';
import { createExternalLotFrameGeometry, deriveExternalLotFrame } from '@/features/commercial-map/utils/externalLotFrameGeometry';
import { createSoldCheckGeometry } from '@/features/commercial-map/utils/soldCheckGeometry';
import { lotPointClearance } from '@/features/commercial-map/utils/soldLotPresentation';
import { polygonAreaMapUnits } from '@/features/commercial-map/utils/geometry';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { createExporural2028Preview } from '@/features/commercial-map/data/exporuralReference2028';
import { buildCommercialMapSegmentIndex } from '@/features/commercial-map/data/commercialMapSegments';
import type { Coordinate } from '@/features/commercial-map/types';

const rectangle: Coordinate[] = [[0, 0], [10, 0], [10, 6], [0, 6]];
const fixtures: Record<string, Coordinate[][]> = {
  rectangle: [rectangle],
  tiny: [rectangle.map(([x, z]) => [x * .01, z * .01])],
  narrow: [rectangle.map(([x, z]) => [x, z * .035])],
  chamfer: [[[0, 1], [1, 0], [8, 0], [10, 2], [10, 5], [9, 6], [0, 6]]],
  concave: [[[0, 0], [8, 0], [8, 1], [1, 1], [1, 7], [8, 7], [8, 8], [0, 8]]],
  neck: [[[0, 0], [4, 0], [4, 1.9], [8, 1.9], [8, 0], [12, 0], [12, 4], [8, 4], [8, 2.1], [4, 2.1], [4, 4], [0, 4]]],
  hole: [rectangle, [[3, 2], [7, 2], [7, 4], [3, 4]]],
  closeHole: [rectangle, [[.15, .15], [9, .15], [9, 4], [.15, 4]]],
  rounded: [Array.from({ length: 48 }, (_, i): Coordinate => [5 + 5 * Math.cos(i * Math.PI / 24), 5 + 5 * Math.sin(i * Math.PI / 24)])],
};

describe('external lot presentation offsets', () => {
  for (const [name, coordinates] of Object.entries(fixtures)) it(`contains the entire frame and triangulation in ${name}, with free grass`, () => {
    const original = JSON.stringify(coordinates), input = { coordinates };
    const frame = deriveExternalLotFrame(input)!;
    expect(frame, name).not.toBeNull();
    expect(frame.centerArea / frame.sourceArea).toBeGreaterThanOrEqual(.75);
    expect(polygonClipping.difference(frame.polygons, coordinates)).toEqual([]);
    for (const polygon of frame.polygons) for (const ring of polygon) for (const point of ring) {
      expect(lotPointClearance(point, coordinates), `${name}: ${point}`).toBeGreaterThanOrEqual(frame.inset - 1e-7);
    }
    const geometry = createExternalLotFrameGeometry(input)!;
    const positions = geometry.getAttribute('position'), indices = geometry.index!;
    let triangleArea = 0;
    for (let i = 0; i < indices.count; i += 3) {
      const vertices = [0, 1, 2].map(j => {
        const n = indices.getX(i + j);
        return [positions.getX(n), positions.getZ(n)] as Coordinate;
      });
      triangleArea += polygonAreaMapUnits({ coordinates: [vertices] });
      // Interior samples catch triangles crossing a concavity or cadastral hole.
      for (const weights of [[1 / 3, 1 / 3, 1 / 3], [.7, .15, .15], [.15, .7, .15], [.15, .15, .7]]) {
        const point = vertices.reduce<Coordinate>((p, v, j) => [p[0] + v[0] * weights[j], p[1] + v[1] * weights[j]], [0, 0]);
        expect(lotPointClearance(point, coordinates)).toBeGreaterThan(frame.inset - 1e-5);
      }
    }
    const frameArea = frame.polygons.reduce((sum, rings) => sum + polygonAreaMapUnits({ coordinates: rings }), 0);
    expect(triangleArea).toBeCloseTo(frameArea, 4);
    expect(JSON.stringify(coordinates)).toBe(original);
    expect(deriveExternalLotFrame(input)).toBe(frame);
    geometry.dispose();
  });

  it('keeps a narrow connecting passage grassy instead of filling it with status', () => {
    const coordinates = fixtures.neck, frame = deriveExternalLotFrame({ coordinates })!;
    expect(frame.width).toBeLessThan(.02);
    expect(frame.inset + frame.width).toBeLessThan(.1);
    expect(frame.polygons.some(rings => lotPointClearance([6, 2], rings) > 0)).toBe(false);
  });

  it('preserves the full conservative offset when pruning redundant convex-corner disks', () => {
    // Deliberately unoptimized reference: subtract every boundary capsule.
    // Nearby nonincident edges and hole corners must keep their vertex disks.
    const erosion = (rings: Coordinate[][], d: number) => {
      const capsules = rings.flatMap(ring => ring.flatMap((a, i) => {
        const b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
        const length = Math.hypot(dx, dz), nx = -dz / length * d, nz = dx / length * d;
        const radius = d / Math.cos(Math.PI / 24);
        return [
          [[[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]] as Coordinate[]],
          [Array.from({ length: 24 }, (_, j): Coordinate => [a[0] + Math.cos(j * Math.PI / 12) * radius, a[1] + Math.sin(j * Math.PI / 12) * radius])],
        ];
      }));
      return polygonClipping.difference(rings, polygonClipping.union(capsules[0], ...capsules.slice(1)));
    };
    for (const rings of [fixtures.concave, fixtures.neck, fixtures.hole, fixtures.closeHole]) {
      const frame = deriveExternalLotFrame({ coordinates: rings })!;
      const reference = polygonClipping.difference(erosion(rings, frame.inset), erosion(rings, frame.inset + frame.width));
      const difference = polygonClipping.xor(frame.polygons, reference);
      expect(difference.reduce((sum, coordinates) => sum + polygonAreaMapUnits({ coordinates }), 0)).toBeLessThan(1e-9);
    }
  });

  it('measures actual passages independently of redundant cadastral junctions and tiny corner bevels', () => {
    const coordinates = fixtures.neck;
    const dense = coordinates.map(ring => ring.flatMap((a, i) => {
      const b = ring[(i + 1) % ring.length];
      return Array.from({ length: 16 }, (_, j): Coordinate => [a[0] + (b[0] - a[0]) * j / 16, a[1] + (b[1] - a[1]) * j / 16]);
    }));
    const original = JSON.stringify(dense);
    const frame = deriveExternalLotFrame({ coordinates: dense })!;
    expect(frame).not.toBeNull();
    expect(frame.width).toBeCloseTo(deriveExternalLotFrame({ coordinates })!.width, 8);
    expect(frame.polygons.some(rings => lotPointClearance([6, 2], rings) > 0)).toBe(false);
    expect(JSON.stringify(dense)).toBe(original);
    const bevel: Coordinate[][] = [[[0, 0], [9.99, 0], [10, .01], [10, 6], [0, 6]]];
    const bevelFrame = deriveExternalLotFrame({ coordinates: bevel })!;
    expect(bevelFrame.width).toBeGreaterThan(deriveExternalLotFrame({ coordinates: [rectangle] })!.width * .9);
    expect(polygonClipping.difference(bevelFrame.polygons, bevel)).toEqual([]);
  });

  it('keeps about 75–90% of a regular lot as its central grass surface', () => {
    const frame = deriveExternalLotFrame({ coordinates: [rectangle] })!;
    expect(frame.centerArea / frame.sourceArea).toBeGreaterThan(.75);
    expect(frame.centerArea / frame.sourceArea).toBeLessThan(.9);
  });

  it('accepts reversed and explicitly closed rings without changing the footprint', () => {
    const source = fixtures.hole, reversed = source.map(r => [...r].reverse()), closed = source.map(r => [...r, r[0]]);
    const first = deriveExternalLotFrame({ coordinates: source })!;
    for (const coordinates of [reversed, closed]) {
      const other = deriveExternalLotFrame({ coordinates })!;
      expect(other.centerArea).toBeCloseTo(first.centerArea, 8);
      expect(polygonClipping.xor(first.polygons, other.polygons).reduce((sum, rings) => sum + polygonAreaMapUnits({ coordinates: rings }), 0)).toBeLessThan(1e-8);
    }
  });

  it('omits invalid frames without a fallback colour or geometry mutation', () => {
    const invalid: Coordinate[][][] = [[], [[[0, 0], [1, 1], [2, 2]]], [[[0, 0], [4, 4], [0, 4], [4, 0]]],
      [[[NaN, 0], [1, 1], [2, 0]]], [rectangle, [[12, 0], [13, 0], [12, 1]]],
      [rectangle, [[0, 2], [2, 2], [2, 4], [0, 4]]]];
    for (const coordinates of invalid) {
      const input = { coordinates };
      expect(deriveExternalLotFrame(input)).toBeNull();
      expect(createExternalLotFrameGeometry(input)).toBeNull();
    }
  });

  it('fits the canonical external lot inventory, including curved ExpoRural corners', () => {
    const segments = buildCommercialMapSegmentIndex(OFFICIAL_REFERENCE_DATA.entities, OFFICIAL_REFERENCE_DATA.lots);
    const lots = OFFICIAL_REFERENCE_DATA.entities.filter(entity => entity.classification === 'SELLABLE_LOT' && segments.has(entity.id));
    expect(lots.length).toBeGreaterThan(200);
    for (const entity of lots) {
      const frame = deriveExternalLotFrame(entity.geometry);
      expect(frame, entity.publicIdentifier).not.toBeNull();
      expect(frame!.centerArea / frame!.sourceArea, entity.publicIdentifier).toBeGreaterThanOrEqual(.75);
      const escaped = polygonClipping.difference(frame!.polygons, entity.geometry.coordinates);
      expect(escaped.reduce((sum, coordinates) => sum + polygonAreaMapUnits({ coordinates }), 0), entity.publicIdentifier).toBeLessThan(1e-8);
    }
  });

  it('renders a contained, readable frame for every actual ExpoRural 2028 lot, including raster facets and cutouts', () => {
    const lots = createExporural2028Preview().entities.filter(entity => entity.classification === 'SELLABLE_LOT' && entity.metadata.previewOnly);
    expect(lots).toHaveLength(100);
    for (const entity of lots) {
      const original = JSON.stringify(entity.geometry), frame = deriveExternalLotFrame(entity.geometry);
      expect(frame, entity.publicIdentifier).not.toBeNull();
      const ring = entity.geometry.coordinates[0], xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
      const shortDimension = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
      // Tiny raster facets used to collapse 51 real frames below 1% of the lot.
      // All 100 actual shapes have enough interior space for at least 2%.
      expect(frame!.width / shortDimension, entity.publicIdentifier).toBeGreaterThan(.02);
      expect(frame!.centerArea / frame!.sourceArea, entity.publicIdentifier).toBeGreaterThanOrEqual(.75);
      expect(frame!.centerArea / frame!.sourceArea, entity.publicIdentifier).toBeLessThan(.92);
      const escaped = polygonClipping.difference(frame!.polygons, entity.geometry.coordinates);
      expect(escaped.reduce((sum, coordinates) => sum + polygonAreaMapUnits({ coordinates }), 0), entity.publicIdentifier).toBeLessThan(1e-8);
      const geometry = createExternalLotFrameGeometry(entity.geometry)!;
      const positions = geometry.getAttribute('position'), indices = geometry.index!;
      expect(indices.count, entity.publicIdentifier).toBeGreaterThan(0);
      for (let i = 0; i < indices.count; i += 3) {
        const vertices = [0, 1, 2].map(j => { const n = indices.getX(i + j); return [positions.getX(n), positions.getZ(n)] as Coordinate; });
        const center = vertices.reduce<Coordinate>((p, v) => [p[0] + v[0] / 3, p[1] + v[1] / 3], [0, 0]);
        expect(lotPointClearance(center, entity.geometry.coordinates), entity.publicIdentifier).toBeGreaterThan(frame!.inset - 1e-5);
      }
      expect(JSON.stringify(entity.geometry)).toBe(original);
      geometry.dispose();
    }
  });
});

describe('external sold confirmation geometry', () => {
  it('uses one bounded, flat, vertex-coloured shared model without texture or groups', () => {
    const geometry = createSoldCheckGeometry(), positions = geometry.getAttribute('position');
    expect(geometry.groups).toHaveLength(0);
    expect(positions.count / 3).toBeLessThan(32);
    expect(geometry.getAttribute('color').count).toBe(positions.count);
    for (let i = 0; i < positions.count; i++) {
      expect(Math.hypot(positions.getX(i), positions.getZ(i))).toBeLessThan(.57);
      expect(Math.abs(positions.getY(i))).toBeLessThan(.004);
    }
    geometry.dispose();
  });
});
