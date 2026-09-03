import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BR344_BR472_CROSSING_SOURCE_X,
  BR344_CARTOGRAPHIC_FINISH,
  BR344_CROSS_SECTION,
  BR344_HUB_SOURCE_BOUNDS,
  BR344_HUB_SOURCE_HEIGHT,
  BR344_INTEGRATOR_CONTRACT,
  BR344_LOCAL_POLYLINE,
  BR344_NE_CLOVERLEAF_HANDOFF,
  BR344_NORTH_OFFSET_FACTOR,
  BR344_OFFSETS,
  BR344_PUBLIC_IDENTIFIER,
  BR344_PUBLISHED_NE_HANDOFF_SOURCE,
  BR344_RENDER_BUDGET,
  BR344_SCENE_SUPPORT_POINTS,
  BR344_SOURCE_NODES,
  BR344_SOURCE_POLYLINE,
  BR344_SOURCE_Y,
  br344FocusBounds,
  br344FootprintPolygon,
  br344HubLocalBounds,
  br344LocalPointToSource,
  br344SourcePointToLocal,
} from '@/features/commercial-map/highways/br344';
import {
  br344GeometryFacesPlusY,
  br344LocalLength,
  buildBr344MainlineGeometries,
  disposeBr344MainlineGeometries,
} from '@/features/commercial-map/highways/br344/br344Geometry';
import { officialPdfPointToLocal } from '@/features/commercial-map/data/officialReference2026';
import { br472MainlineXAt } from '@/features/commercial-map/data/regional-highways';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

const FORBIDDEN_TOUCH = [
  'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
  'src/features/commercial-map/data/rearParkRoadNetwork.ts',
  'src/features/commercial-map/data/annexSpatialCorrections.ts',
  'src/features/commercial-map/data/officialReference2026.ts',
] as const;

const SLICE_FILES = [
  'src/features/commercial-map/highways/br344/br344Mainline.ts',
  'src/features/commercial-map/highways/br344/br344Geometry.ts',
  'src/features/commercial-map/highways/br344/Br344Mainline.tsx',
  'src/features/commercial-map/highways/br344/index.ts',
] as const;

function rectanglesOverlap(
  a: { minX: number; maxX: number; minZ: number; maxZ: number },
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

describe('BR-344 mainline — isolated E–W highway slice', () => {
  it('keeps the slice in new files and does not touch forbidden park modules', () => {
    const canvas = read(FORBIDDEN_TOUCH[0]);
    const rearNetwork = read(FORBIDDEN_TOUCH[1]);
    const annex = read(FORBIDDEN_TOUCH[2]);
    const cadastre = read(FORBIDDEN_TOUCH[3]);

    expect(canvas).not.toMatch(/br344|Br344|BR-344|BR344/i);
    expect(rearNetwork).not.toMatch(/br344|Br344|BR-344|BR344/i);
    expect(annex).not.toMatch(/br344|Br344|BR-344|BR344/i);
    expect(cadastre).not.toMatch(/br344|Br344|BR-344|RODOVIA-BR-344/i);

    const slice = SLICE_FILES.map((file) => read(file)).join('\n');
    expect(slice).not.toMatch(/from ['"][^'"]*rearParkRoadNetwork/);
    expect(slice).not.toMatch(/from ['"][^'"]*annexSpatialCorrections/);
    expect(slice).not.toMatch(/from ['"][^'"]*CommercialMapCanvas/);
    expect(slice).not.toMatch(/from ['"][^'"]*CommercialPavilionInterior/);
    expect(slice).not.toContain('officialReference2024');
    expect(slice).toContain("from '../../data/officialReference2026'");
  });

  it('places a straight E–W centre-line 2–2.5× hub height north of the park', () => {
    expect(BR344_NORTH_OFFSET_FACTOR).toBeGreaterThanOrEqual(2);
    expect(BR344_NORTH_OFFSET_FACTOR).toBeLessThanOrEqual(2.5);

    const ys = BR344_SOURCE_POLYLINE.map(([, y]) => y);
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBe(BR344_SOURCE_Y);
    expect(BR344_SOURCE_Y).toBe(
      BR344_HUB_SOURCE_BOUNDS.north - BR344_NORTH_OFFSET_FACTOR * BR344_HUB_SOURCE_HEIGHT,
    );

    const gap = BR344_HUB_SOURCE_BOUNDS.north - BR344_SOURCE_Y;
    expect(gap / BR344_HUB_SOURCE_HEIGHT).toBeCloseTo(2.25, 8);

    const xs = BR344_SOURCE_POLYLINE.map(([x]) => x);
    expect(xs[0]).toBeLessThan(BR344_HUB_SOURCE_BOUNDS.west);
    expect(xs.at(-1)!).toBeGreaterThan(BR344_BR472_CROSSING_SOURCE_X);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));

    BR344_LOCAL_POLYLINE.forEach((local, index) => {
      const [x, z] = officialPdfPointToLocal(BR344_SOURCE_POLYLINE[index]);
      expect(local[0]).toBeCloseTo(x, 10);
      expect(local[1]).toBeCloseTo(z, 10);
      const roundTrip = br344LocalPointToSource(local);
      expect(roundTrip[0]).toBeCloseTo(BR344_SOURCE_POLYLINE[index][0], 6);
      expect(roundTrip[1]).toBeCloseTo(BR344_SOURCE_POLYLINE[index][1], 6);
    });

    const hub = br344HubLocalBounds();
    const highwayZ = BR344_LOCAL_POLYLINE[0][1];
    expect(highwayZ).toBeLessThan(hub.minZ);
    expect((hub.minZ - highwayZ) / hub.height).toBeCloseTo(2.25, 5);
  });

  it('hands the NE cloverleaf a named vertex on the current BR-472 X, with no ramps', () => {
    expect(BR344_SOURCE_NODES.neCloverleaf).toEqual([
      BR344_BR472_CROSSING_SOURCE_X,
      BR344_SOURCE_Y,
    ]);
    expect(BR344_NE_CLOVERLEAF_HANDOFF.sourcePoint).toEqual(BR344_SOURCE_NODES.neCloverleaf);
    expect(BR344_NE_CLOVERLEAF_HANDOFF.headingLocal).toEqual([1, 0]);
    expect(BR344_PUBLISHED_NE_HANDOFF_SOURCE).toEqual([6120, BR344_SOURCE_Y]);
    expect(BR344_BR472_CROSSING_SOURCE_X).toBeGreaterThan(BR344_HUB_SOURCE_BOUNDS.east);
    expect(BR344_NE_CLOVERLEAF_HANDOFF.localPoint[0]).toBeCloseTo(
      br472MainlineXAt(BR344_NE_CLOVERLEAF_HANDOFF.localPoint[1]),
      4,
    );

    const slice = SLICE_FILES.map((file) => read(file)).join('\n');
    expect(slice).not.toMatch(/a5-br472|loop ramp/i);
    expect(slice).not.toContain('RODOVIA-RS-472');
    expect(Object.keys(BR344_SOURCE_NODES)).toEqual([
      'westTerminus',
      'hubNorthWest',
      'hubNorthEast',
      'neCloverleaf',
      'eastTerminus',
    ]);
    expect(BR344_INTEGRATOR_CONTRACT.outOfScope).toEqual(expect.arrayContaining([
      'cloverleaf ramps',
      'BR-472',
      'park interior',
    ]));
    expect(BR344_PUBLIC_IDENTIFIER).toBe('RODOVIA-BR-344');
  });

  it('uses the Image 2 cartographic language: green carriageway, tan shoulders, yellow edges', () => {
    expect(BR344_CARTOGRAPHIC_FINISH.carriagewayColor).toMatch(/^#3d/i);
    expect(BR344_CARTOGRAPHIC_FINISH.shoulderColor).toMatch(/^#c/i);
    expect(BR344_CARTOGRAPHIC_FINISH.yellowEdgeColor).toMatch(/^#f5/i);

    expect(BR344_OFFSETS.northYellowOuter).toBeLessThan(BR344_OFFSETS.northShoulderOuter);
    expect(BR344_OFFSETS.northShoulderOuter).toBeLessThan(BR344_OFFSETS.northCarriagewayOuter);
    expect(BR344_OFFSETS.northCarriagewayInner).toBeLessThan(0);
    expect(BR344_OFFSETS.southCarriagewayInner).toBeGreaterThan(0);
    expect(BR344_OFFSETS.southYellowOuter).toBeGreaterThan(BR344_OFFSETS.southShoulderOuter);

    const pavement = BR344_CARTOGRAPHIC_FINISH.carriagewayWidthSource * 2
      + BR344_CARTOGRAPHIC_FINISH.medianWidthSource;
    const envelope = pavement + BR344_CARTOGRAPHIC_FINISH.shoulderWidthSource * 2;
    expect(pavement).toBe(70);
    expect(envelope).toBe(94);

    const component = read('src/features/commercial-map/highways/br344/Br344Mainline.tsx');
    expect(component).toContain('BR344_CARTOGRAPHIC_FINISH.carriagewayColor');
    expect(component).toContain('BR344_CARTOGRAPHIC_FINISH.shoulderColor');
    expect(component).toContain('BR344_CARTOGRAPHIC_FINISH.yellowEdgeColor');
    expect(component).toContain('name="br344-mainline"');
  });

  it('builds a dual-carriageway mesh that stays outside the hub and faces +Y', () => {
    const detailed = buildBr344MainlineGeometries();
    const reduced = buildBr344MainlineGeometries({ reducedGraphics: true });
    try {
      expect(detailed.carriageway).not.toBeNull();
      expect(detailed.shoulders).not.toBeNull();
      expect(detailed.median).not.toBeNull();
      expect(detailed.yellowEdges).not.toBeNull();
      expect(detailed.markings).not.toBeNull();
      expect(detailed.diagnostics.straightEastWest).toBe(true);
      expect(detailed.diagnostics.lengthLocal).toBeCloseTo(br344LocalLength(), 8);
      expect(detailed.diagnostics.triangleCount).toBeGreaterThan(800);
      expect(detailed.diagnostics.triangleCount).toBeLessThanOrEqual(BR344_RENDER_BUDGET.maximumTriangles);
      expect(detailed.diagnostics.estimatedBaseDrawCalls).toBeLessThanOrEqual(
        BR344_RENDER_BUDGET.maximumBaseDrawCalls,
      );

      expect(br344GeometryFacesPlusY(detailed.carriageway)).toBe(true);
      expect(br344GeometryFacesPlusY(detailed.shoulders)).toBe(true);
      expect(br344GeometryFacesPlusY(detailed.yellowEdges)).toBe(true);

      const hub = br344HubLocalBounds();
      const footprint = br344FootprintPolygon();
      const roadBox = {
        minX: Math.min(...footprint.map(([x]) => x)),
        maxX: Math.max(...footprint.map(([x]) => x)),
        minZ: Math.min(...footprint.map(([, z]) => z)),
        maxZ: Math.max(...footprint.map(([, z]) => z)),
      };
      expect(rectanglesOverlap(hub, roadBox)).toBe(false);

      const positions = detailed.carriageway!.getAttribute('position');
      let minZ = Number.POSITIVE_INFINITY;
      let maxZ = Number.NEGATIVE_INFINITY;
      for (let index = 0; index < positions.count; index += 1) {
        const z = positions.getZ(index);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        expect(positions.getY(index)).toBeGreaterThan(0.02);
        expect(z).toBeLessThan(hub.minZ);
      }
      expect(maxZ - minZ).toBeCloseTo(BR344_CROSS_SECTION.carriagewayWidth * 2 + BR344_CROSS_SECTION.medianWidth, 2);

      expect(reduced.shoulders).toBeNull();
      expect(reduced.markings).toBeNull();
      expect(reduced.carriageway).not.toBeNull();
      expect(reduced.yellowEdges).not.toBeNull();
      expect(reduced.diagnostics.triangleCount).toBeLessThan(detailed.diagnostics.triangleCount);
    } finally {
      disposeBr344MainlineGeometries(detailed);
      disposeBr344MainlineGeometries(reduced);
    }
  });

  it('exports scene support points and a focus box the integrator can drop in', () => {
    expect(BR344_SCENE_SUPPORT_POINTS.length).toBe(BR344_SOURCE_POLYLINE.length * 3);
    const focus = br344FocusBounds();
    expect(focus.width).toBeGreaterThan(100);
    expect(focus.centerZ).toBeCloseTo(br344SourcePointToLocal([0, BR344_SOURCE_Y])[1], 5);
    expect(BR344_INTEGRATOR_CONTRACT.mount).toContain('Br344Mainline');
    expect(BR344_NE_CLOVERLEAF_HANDOFF.notes).toMatch(/no ramps/i);
  });
});
