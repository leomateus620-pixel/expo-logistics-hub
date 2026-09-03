import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAP_REFERENCE_HEIGHT,
  MAP_REFERENCE_WIDTH,
} from '@/features/commercial-map/constants';
import {
  INTERCHANGE_ENVELOPES,
  br472MainlineXAt,
} from '@/features/commercial-map/data/regional-highways';
import {
  NE_CLOVERLEAF_BUDGET,
  NE_CLOVERLEAF_CENTER_LOCAL,
  NE_CLOVERLEAF_CENTER_SOURCE,
  NE_CLOVERLEAF_COLORS,
  NE_CLOVERLEAF_LAYOUT,
  NE_CLOVERLEAF_PUBLISHED_CENTER_SOURCE,
  NE_CLOVERLEAF_QUADRANTS,
  NE_CLOVERLEAF_REVISION,
  NE_CLOVERLEAF_ROUNDABOUT_CENTERS,
  NE_CLOVERLEAF_SCENE_SUPPORT_POINTS,
  NE_CLOVERLEAF_STUBS,
  neCloverleafClearanceFromPark,
  neCloverleafParkBounds,
} from '@/features/commercial-map/data/neCloverleafBr344Br472';
import {
  buildNeCloverleafGeometries,
  disposeNeCloverleafGeometries,
  neCloverleafBr344Elevation,
  neCloverleafBr472Elevation,
  sampleNeCloverleafInnerRamp,
  sampleNeCloverleafOuterRamp,
} from '@/features/commercial-map/utils/neCloverleafGeometry';

function collectPositions(geometries: Array<{ getAttribute: (name: string) => { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number } | undefined } | null>) {
  const points: Array<{ x: number; y: number; z: number }> = [];
  geometries.forEach((geometry) => {
    const positions = geometry?.getAttribute('position');
    if (!positions) return;
    for (let index = 0; index < positions.count; index += 1) {
      points.push({
        x: positions.getX(index),
        y: positions.getY(index),
        z: positions.getZ(index),
      });
    }
  });
  return points;
}

function hexChannels(color: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  expect(match).not.toBeNull();
  const value = Number.parseInt(match![1], 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

describe('NE cloverleaf BR-344 × BR-472', () => {
  it('sits far north-east of the park on the BR-472 bearing, with only short stubs', () => {
    const park = neCloverleafParkBounds();
    expect(park).toEqual({
      minX: -MAP_REFERENCE_WIDTH / 2,
      maxX: MAP_REFERENCE_WIDTH / 2,
      minZ: -MAP_REFERENCE_HEIGHT / 2,
      maxZ: MAP_REFERENCE_HEIGHT / 2,
    });
    expect(NE_CLOVERLEAF_PUBLISHED_CENTER_SOURCE).toEqual([5936, -2100]);
    expect(NE_CLOVERLEAF_CENTER_LOCAL[0]).toBeCloseTo(INTERCHANGE_ENVELOPES.neCloverleaf.center[0], 6);
    expect(NE_CLOVERLEAF_CENTER_LOCAL[1]).toBeCloseTo(INTERCHANGE_ENVELOPES.neCloverleaf.center[1], 6);
    expect(NE_CLOVERLEAF_CENTER_LOCAL[0]).toBeCloseTo(
      br472MainlineXAt(NE_CLOVERLEAF_CENTER_LOCAL[1]),
      4,
    );
    expect(NE_CLOVERLEAF_CENTER_SOURCE[1]).toBeLessThan(900);
    expect(NE_CLOVERLEAF_CENTER_LOCAL[1]).toBeLessThan(park.minZ - NE_CLOVERLEAF_BUDGET.minimumParkClearance);
    expect(NE_CLOVERLEAF_CENTER_LOCAL[0]).toBeGreaterThan(40);
    expect(neCloverleafClearanceFromPark(NE_CLOVERLEAF_CENTER_LOCAL))
      .toBeGreaterThan(NE_CLOVERLEAF_BUDGET.minimumParkClearance);
    expect(NE_CLOVERLEAF_LAYOUT.stubLength).toBeLessThanOrEqual(NE_CLOVERLEAF_BUDGET.maximumStubLength);
    expect(NE_CLOVERLEAF_STUBS.br472North.owner).toBe('BR-472');
    expect(NE_CLOVERLEAF_STUBS.br344West.owner).toBe('BR-344');
    expect(Math.hypot(
      NE_CLOVERLEAF_STUBS.br472North.axis[0] - NE_CLOVERLEAF_CENTER_LOCAL[0],
      NE_CLOVERLEAF_STUBS.br472North.axis[1] - NE_CLOVERLEAF_CENTER_LOCAL[1],
    )).toBeCloseTo(NE_CLOVERLEAF_LAYOUT.stubLength, 6);
  });

  it('places four small yellow roundabouts in the four quadrants', () => {
    expect(NE_CLOVERLEAF_QUADRANTS).toHaveLength(4);
    const yellow = hexChannels(NE_CLOVERLEAF_COLORS.roundabout);
    expect(yellow.r).toBeGreaterThan(200);
    expect(yellow.g).toBeGreaterThan(170);
    expect(yellow.b).toBeLessThan(80);
    expect(yellow.r).toBeGreaterThan(yellow.b + 80);
    expect(yellow.g).toBeGreaterThan(yellow.b + 80);

    const centers = Object.values(NE_CLOVERLEAF_ROUNDABOUT_CENTERS);
    expect(centers).toHaveLength(4);
    centers.forEach((center) => {
      expect(Math.abs(center[0] - NE_CLOVERLEAF_CENTER_LOCAL[0]))
        .toBeCloseTo(NE_CLOVERLEAF_LAYOUT.quadrantOffset, 6);
      expect(Math.abs(center[1] - NE_CLOVERLEAF_CENTER_LOCAL[1]))
        .toBeCloseTo(NE_CLOVERLEAF_LAYOUT.quadrantOffset, 6);
      expect(neCloverleafClearanceFromPark(center)).toBeGreaterThan(30);
    });
    expect(NE_CLOVERLEAF_LAYOUT.roundaboutOuterRadius)
      .toBeLessThan(NE_CLOVERLEAF_LAYOUT.quadrantOffset * 0.4);
    expect(NE_CLOVERLEAF_LAYOUT.roundaboutIslandRadius)
      .toBeLessThan(NE_CLOVERLEAF_LAYOUT.roundaboutOuterRadius);
  });

  it('feeds each roundabout with inner connectors and one sweeping outer loop', () => {
    NE_CLOVERLEAF_QUADRANTS.forEach(({ id }) => {
      const rab = NE_CLOVERLEAF_ROUNDABOUT_CENTERS[id];
      const [from344, from472] = sampleNeCloverleafInnerRamp(id, 0.16);
      expect(from344.length).toBeGreaterThan(6);
      expect(from472.length).toBeGreaterThan(6);
      [from344, from472].forEach((path) => {
        const end = path[path.length - 1];
        expect(Math.hypot(end[0] - rab[0], end[1] - rab[1]))
          .toBeLessThanOrEqual(NE_CLOVERLEAF_LAYOUT.roundaboutOuterRadius + 0.08);
        path.forEach((point) => {
          expect(Number.isFinite(point[0])).toBe(true);
          expect(Number.isFinite(point[1])).toBe(true);
        });
      });
      const loop = sampleNeCloverleafOuterRamp(id, 0.22);
      expect(loop.length).toBeGreaterThan(24);
      const reach = Math.max(
        ...loop.map((point) => Math.hypot(
          point[0] - NE_CLOVERLEAF_CENTER_LOCAL[0],
          point[1] - NE_CLOVERLEAF_CENTER_LOCAL[1],
        )),
      );
      expect(reach).toBeGreaterThan(NE_CLOVERLEAF_LAYOUT.quadrantOffset + 2);
    });
  });

  it('builds a gap-free overpass mesh that never enters the park and never z-fights', () => {
    const detailed = buildNeCloverleafGeometries();
    const reduced = buildNeCloverleafGeometries({ reducedGraphics: true });
    try {
      expect(detailed.highway).not.toBeNull();
      expect(detailed.roundabouts).not.toBeNull();
      expect(detailed.shoulders).not.toBeNull();
      expect(detailed.markings).not.toBeNull();
      expect(detailed.islands).not.toBeNull();
      expect(detailed.diagnostics.roundaboutCount).toBe(4);
      expect(detailed.diagnostics.rampCount).toBe(12);
      expect(detailed.diagnostics.stubCarriagewayCount).toBe(4);
      expect(detailed.diagnostics.revision).toBe(NE_CLOVERLEAF_REVISION);
      expect(detailed.diagnostics.withinBudget).toBe(true);
      expect(detailed.diagnostics.triangleCount).toBeLessThan(NE_CLOVERLEAF_BUDGET.maximumTriangles);
      expect(detailed.diagnostics.estimatedBaseDrawCalls)
        .toBeLessThanOrEqual(NE_CLOVERLEAF_BUDGET.maximumBaseDrawCalls);
      expect(reduced.diagnostics.triangleCount).toBeLessThan(detailed.diagnostics.triangleCount);

      const park = neCloverleafParkBounds();
      const vertices = collectPositions([
        detailed.highway,
        detailed.shoulders,
        detailed.roundabouts,
        detailed.islands,
        detailed.curbs,
        detailed.markings,
        detailed.bridge,
      ]);
      expect(vertices.length).toBeGreaterThan(800);
      vertices.forEach((vertex) => {
        expect(Number.isFinite(vertex.x)).toBe(true);
        expect(Number.isFinite(vertex.y)).toBe(true);
        expect(Number.isFinite(vertex.z)).toBe(true);
        expect(vertex.x).toBeGreaterThan(park.maxX * 0.2);
        expect(vertex.z).toBeLessThan(park.minZ - 20);
        expect(
          vertex.x >= park.minX
          && vertex.x <= park.maxX
          && vertex.z >= park.minZ
          && vertex.z <= park.maxZ,
        ).toBe(false);
      });

      const crossing = vertices.filter((vertex) => (
        Math.hypot(vertex.x - NE_CLOVERLEAF_CENTER_LOCAL[0], vertex.z - NE_CLOVERLEAF_CENTER_LOCAL[1]) < 1.6
      ));
      const br344Deck = crossing.filter((vertex) => vertex.y > 0.35);
      const br472Under = crossing.filter((vertex) => vertex.y < 0.12);
      expect(br344Deck.length).toBeGreaterThan(8);
      expect(br472Under.length).toBeGreaterThan(8);
      expect(neCloverleafBr344Elevation(NE_CLOVERLEAF_CENTER_LOCAL[0])
        - neCloverleafBr472Elevation()).toBeGreaterThan(0.4);
      expect(detailed.diagnostics.overpassClearance).toBeGreaterThan(0.4);

      const rab = NE_CLOVERLEAF_ROUNDABOUT_CENTERS.nw;
      const roundaboutY: number[] = [];
      const roundaboutPositions = detailed.roundabouts!.getAttribute('position');
      for (let index = 0; index < roundaboutPositions.count; index += 1) {
        if (Math.hypot(
          roundaboutPositions.getX(index) - rab[0],
          roundaboutPositions.getZ(index) - rab[1],
        ) < NE_CLOVERLEAF_LAYOUT.roundaboutOuterRadius + 0.05) {
          roundaboutY.push(roundaboutPositions.getY(index));
        }
      }
      expect(Math.min(...roundaboutY)).toBeGreaterThan(LRoundaboutFloor());
    } finally {
      disposeNeCloverleafGeometries(detailed);
      disposeNeCloverleafGeometries(reduced);
    }
  });

  it('orients pavement faces to +Y and keeps scene-support points at the stubs', () => {
    const network = buildNeCloverleafGeometries();
    try {
      [network.highway, network.shoulders, network.roundabouts, network.markings].forEach((geometry) => {
        expect(geometry).not.toBeNull();
        const positions = geometry!.getAttribute('position');
        const normals = geometry!.getAttribute('normal');
        const indices = geometry!.getIndex();
        let inverted = 0;
        for (let index = 0; index < (indices?.count ?? 0); index += 3) {
          const a = indices!.getX(index);
          const b = indices!.getX(index + 1);
          const c = indices!.getX(index + 2);
          const abX = positions.getX(b) - positions.getX(a);
          const abZ = positions.getZ(b) - positions.getZ(a);
          const acX = positions.getX(c) - positions.getX(a);
          const acZ = positions.getZ(c) - positions.getZ(a);
          if (abZ * acX - abX * acZ < -1e-7) inverted += 1;
          expect(normals.getY(a)).toBeGreaterThan(0);
        }
        expect(inverted).toBe(0);
      });
      expect(NE_CLOVERLEAF_SCENE_SUPPORT_POINTS.length).toBeGreaterThanOrEqual(8);
      expect(NE_CLOVERLEAF_SCENE_SUPPORT_POINTS.some((point) => (
        point.position[0] === NE_CLOVERLEAF_CENTER_LOCAL[0]
        && point.position[1] === NE_CLOVERLEAF_CENTER_LOCAL[1]
      ))).toBe(true);
    } finally {
      disposeNeCloverleafGeometries(network);
    }
  });

  it('keeps the cloverleaf in isolated new files and does not touch forbidden surfaces', () => {
    const canvas = readFileSync(resolve(
      process.cwd(),
      'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    ), 'utf8');
    const rearRoads = readFileSync(resolve(
      process.cwd(),
      'src/features/commercial-map/data/rearParkRoadNetwork.ts',
    ), 'utf8');
    const component = readFileSync(resolve(
      process.cwd(),
      'src/features/commercial-map/components/canvas/NeCloverleafInterchange.tsx',
    ), 'utf8');
    const geometry = readFileSync(resolve(
      process.cwd(),
      'src/features/commercial-map/utils/neCloverleafGeometry.ts',
    ), 'utf8');

    const network = readFileSync(resolve(
      process.cwd(),
      'src/features/commercial-map/components/canvas/RegionalHighwayNetwork.tsx',
    ), 'utf8');

    expect(canvas).not.toContain('NeCloverleafInterchange');
    expect(canvas).not.toContain('neCloverleafBr344Br472');
    expect(network).toContain('NeCloverleafInterchange');
    expect(rearRoads).not.toContain('NE_CLOVERLEAF');
    expect(component).toContain('NE_CLOVERLEAF_COLORS.roundabout');
    expect(component).toContain('YELLOW_ROUNDABOUT_TEXTURE');
    expect(component).toContain('raycast={NO_RAYCAST}');
    expect(component).toContain('polygonOffset');
    expect(geometry).not.toContain('CommercialMapCanvas');
    expect(geometry).not.toContain('RUA-BRASILIA');
    expect(geometry).not.toContain('RUA-UBIRETAMA');
    expect(geometry).not.toContain('a5-trevo');
  });
});

function LRoundaboutFloor() {
  return NE_CLOVERLEAF_LAYOUT.atGradeElevation + 0.008;
}
