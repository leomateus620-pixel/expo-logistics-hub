import * as THREE from 'three';
import {
  BR344_CROSS_SECTION,
  BR344_ELEVATION,
  BR344_LOCAL_POLYLINE,
  BR344_OFFSETS,
  br344TerrainElevationAt,
} from './br344Mainline';
import { NE_CLOVERLEAF_STUBS } from '../../data/neCloverleafBr344Br472';

export interface Br344MainlineBuildOptions {
  reducedGraphics?: boolean;
}

export interface Br344MainlineGeometries {
  carriageway: THREE.BufferGeometry | null;
  shoulders: THREE.BufferGeometry | null;
  median: THREE.BufferGeometry | null;
  yellowEdges: THREE.BufferGeometry | null;
  markings: THREE.BufferGeometry | null;
  diagnostics: {
    sampleCount: number;
    triangleCount: number;
    estimatedBaseDrawCalls: number;
    lengthLocal: number;
    straightEastWest: true;
  };
}

interface RibbonAccumulator {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

function createAccumulator(): RibbonAccumulator {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

/**
 * Axis-aligned E–W ribbon. U runs across the strip (0→1), V along the road
 * in world units so a unit tile matches RearParkRoadNetwork’s UV contract.
 */
function pushEastWestRibbon(
  target: RibbonAccumulator,
  xStart: number,
  xEnd: number,
  zCenter: number,
  offsetFrom: number,
  offsetTo: number,
  elevation: number,
  divisions: number,
) {
  if (!(xEnd > xStart) || divisions < 1) return;
  const baseIndex = target.positions.length / 3;
  const span = xEnd - xStart;
  const z0 = zCenter + offsetFrom;
  const z1 = zCenter + offsetTo;

  for (let step = 0; step <= divisions; step += 1) {
    const t = step / divisions;
    const x = xStart + span * t;
    const y0 = elevation + br344TerrainElevationAt(x, z0);
    const y1 = elevation + br344TerrainElevationAt(x, z1);
    target.positions.push(x, y0, z0, x, y1, z1);
    target.normals.push(0, 1, 0, 0, 1, 0);
    target.uvs.push(0, span * t, 1, span * t);
  }

  for (let step = 0; step < divisions; step += 1) {
    const a = baseIndex + step * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    target.indices.push(a, b, c, b, d, c);
  }
}

function pushEastWestDashes(
  target: RibbonAccumulator,
  xStart: number,
  xEnd: number,
  zCenter: number,
  offset: number,
  halfThickness: number,
  elevation: number,
  dashLength: number,
  gapLength: number,
  samplesPerDash: number,
) {
  const period = dashLength + gapLength;
  let cursor = xStart;
  while (cursor < xEnd) {
    const dashEnd = Math.min(cursor + dashLength, xEnd);
    const width = dashEnd - cursor;
    if (width > 1e-4) {
      const divisions = Math.max(1, Math.ceil(width * samplesPerDash));
      pushEastWestRibbon(
        target,
        cursor,
        dashEnd,
        zCenter,
        offset - halfThickness,
        offset + halfThickness,
        elevation,
        divisions,
      );
    }
    cursor += period;
  }
}

function toGeometry(accumulator: RibbonAccumulator) {
  if (accumulator.indices.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(accumulator.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(accumulator.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(accumulator.uvs, 2));
  geometry.setIndex(accumulator.indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function triangleCount(geometry: THREE.BufferGeometry | null) {
  if (!geometry) return 0;
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
}

export function br344LocalLength() {
  const west = BR344_LOCAL_POLYLINE[0][0];
  const east = BR344_LOCAL_POLYLINE[BR344_LOCAL_POLYLINE.length - 1][0];
  return east - west;
}

export function buildBr344MainlineGeometries(
  { reducedGraphics = false }: Br344MainlineBuildOptions = {},
): Br344MainlineGeometries {
  const carriageway = createAccumulator();
  const shoulders = createAccumulator();
  const median = createAccumulator();
  const yellowEdges = createAccumulator();
  const markings = createAccumulator();

  const xStart = BR344_LOCAL_POLYLINE[0][0];
  const xEnd = BR344_LOCAL_POLYLINE[BR344_LOCAL_POLYLINE.length - 1][0];
  const zCenter = BR344_LOCAL_POLYLINE[0][1];
  const length = xEnd - xStart;
  const samplesPerWorldUnit = reducedGraphics ? 1.15 : 3.2;
  const gapWest = NE_CLOVERLEAF_STUBS.br344West.axis[0];
  const gapEast = NE_CLOVERLEAF_STUBS.br344East.axis[0];
  const spans: Array<readonly [number, number]> = [];
  if (gapWest - xStart > 0.4) spans.push([xStart, gapWest]);
  if (xEnd - gapEast > 0.4) spans.push([gapEast, xEnd]);
  if (spans.length === 0) spans.push([xStart, xEnd]);

  spans.forEach(([spanStart, spanEnd]) => {
    const spanLength = spanEnd - spanStart;
    const divisions = Math.max(2, Math.ceil(spanLength * samplesPerWorldUnit));

    pushEastWestRibbon(
      carriageway,
      spanStart,
      spanEnd,
      zCenter,
      BR344_OFFSETS.northCarriagewayOuter,
      BR344_OFFSETS.northCarriagewayInner,
      BR344_ELEVATION.pavement,
      divisions,
    );
    pushEastWestRibbon(
      carriageway,
      spanStart,
      spanEnd,
      zCenter,
      BR344_OFFSETS.southCarriagewayInner,
      BR344_OFFSETS.southCarriagewayOuter,
      BR344_ELEVATION.pavement,
      divisions,
    );

    pushEastWestRibbon(
      median,
      spanStart,
      spanEnd,
      zCenter,
      BR344_OFFSETS.northCarriagewayInner,
      BR344_OFFSETS.southCarriagewayInner,
      BR344_ELEVATION.median,
      Math.max(2, Math.ceil(divisions * 0.45)),
    );

    if (!reducedGraphics) {
      pushEastWestRibbon(
        shoulders,
        spanStart,
        spanEnd,
        zCenter,
        BR344_OFFSETS.northShoulderOuter,
        BR344_OFFSETS.northShoulderInner,
        BR344_ELEVATION.shoulder,
        divisions,
      );
      pushEastWestRibbon(
        shoulders,
        spanStart,
        spanEnd,
        zCenter,
        BR344_OFFSETS.southShoulderInner,
        BR344_OFFSETS.southShoulderOuter,
        BR344_ELEVATION.shoulder,
        divisions,
      );
    }

    pushEastWestRibbon(
      yellowEdges,
      spanStart,
      spanEnd,
      zCenter,
      BR344_OFFSETS.northYellowOuter,
      BR344_OFFSETS.northYellowInner,
      BR344_ELEVATION.yellow,
      Math.max(2, Math.ceil(divisions * 0.55)),
    );
    pushEastWestRibbon(
      yellowEdges,
      spanStart,
      spanEnd,
      zCenter,
      BR344_OFFSETS.southYellowInner,
      BR344_OFFSETS.southYellowOuter,
      BR344_ELEVATION.yellow,
      Math.max(2, Math.ceil(divisions * 0.55)),
    );

    if (!reducedGraphics) {
      const dashSamples = 1.4;
      pushEastWestDashes(
        markings,
        spanStart,
        spanEnd,
        zCenter,
        BR344_OFFSETS.northLaneDash,
        BR344_CROSS_SECTION.laneDashWidth / 2,
        BR344_ELEVATION.markings,
        1.6,
        2.4,
        dashSamples,
      );
      pushEastWestDashes(
        markings,
        spanStart,
        spanEnd,
        zCenter,
        BR344_OFFSETS.southLaneDash,
        BR344_CROSS_SECTION.laneDashWidth / 2,
        BR344_ELEVATION.markings,
        1.6,
        2.4,
        dashSamples,
      );
    }
  });

  const geometries = {
    carriageway: toGeometry(carriageway),
    shoulders: toGeometry(shoulders),
    median: toGeometry(median),
    yellowEdges: toGeometry(yellowEdges),
    markings: toGeometry(markings),
  };

  const triangles = (
    triangleCount(geometries.carriageway)
    + triangleCount(geometries.shoulders)
    + triangleCount(geometries.median)
    + triangleCount(geometries.yellowEdges)
    + triangleCount(geometries.markings)
  );

  const estimatedBaseDrawCalls = [
    geometries.carriageway,
    geometries.shoulders,
    geometries.median,
    geometries.yellowEdges,
    geometries.markings,
  ].filter(Boolean).length;

  return {
    ...geometries,
    diagnostics: {
      sampleCount: spans.reduce((total, [start, end]) => (
        total + Math.max(2, Math.ceil((end - start) * samplesPerWorldUnit)) + 1
      ), 0),
      triangleCount: triangles,
      estimatedBaseDrawCalls,
      lengthLocal: length,
      straightEastWest: true,
    },
  };
}

export function disposeBr344MainlineGeometries(network: Br344MainlineGeometries) {
  network.carriageway?.dispose();
  network.shoulders?.dispose();
  network.median?.dispose();
  network.yellowEdges?.dispose();
  network.markings?.dispose();
}

export function br344GeometryFacesPlusY(geometry: THREE.BufferGeometry | null) {
  if (!geometry?.index) return true;
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  for (let i = 0; i < index.count; i += 3) {
    const ax = position.getX(index.getX(i));
    const ay = position.getY(index.getX(i));
    const az = position.getZ(index.getX(i));
    const bx = position.getX(index.getX(i + 1));
    const by = position.getY(index.getX(i + 1));
    const bz = position.getZ(index.getX(i + 1));
    const cx = position.getX(index.getX(i + 2));
    const cy = position.getY(index.getX(i + 2));
    const cz = position.getZ(index.getX(i + 2));
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny < -1e-8) return false;
  }
  return true;
}
