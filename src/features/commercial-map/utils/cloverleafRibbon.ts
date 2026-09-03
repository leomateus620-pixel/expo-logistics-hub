import * as THREE from 'three';

/**
 * Shared presentation-mesh primitives for the NE / SE cloverleafs.
 * Ribbons are C1-sampled (arc or cubic Bezier) so gore joins stay tangent
 * to the mainline instead of kinking into overlapping jewellery.
 */

export type Point2 = readonly [number, number];

export interface ElevatedSample {
  x: number;
  z: number;
  y: number;
}

export interface RibbonAccumulator {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export function createRibbonAccumulator(): RibbonAccumulator {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function smoothstep(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

export function smootherstep(t: number) {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function hypot2(dx: number, dz: number) {
  return Math.hypot(dx, dz);
}

export function headingOf(dx: number, dz: number) {
  return Math.atan2(dx, dz);
}

export function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function sampleLine2(
  from: Point2,
  to: Point2,
  spacing: number,
): Point2[] {
  const length = hypot2(to[0] - from[0], to[1] - from[1]);
  const count = Math.max(2, Math.ceil(length / Math.max(spacing, 0.06)) + 1);
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    return [lerp(from[0], to[0], t), lerp(from[1], to[1], t)] as Point2;
  });
}

export function sampleArc2(
  center: Point2,
  radius: number,
  startAngle: number,
  sweep: number,
  spacing: number,
): Point2[] {
  const arcLength = Math.abs(sweep) * Math.max(radius, 1e-4);
  const count = Math.max(8, Math.ceil(arcLength / Math.max(spacing, 0.06)) + 1);
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    const angle = startAngle + sweep * t;
    return [
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
    ] as Point2;
  });
}

export function sampleCubicBezier2(
  p0: Point2,
  p1: Point2,
  p2: Point2,
  p3: Point2,
  spacing: number,
): Point2[] {
  const rough = hypot2(p1[0] - p0[0], p1[1] - p0[1])
    + hypot2(p2[0] - p1[0], p2[1] - p1[1])
    + hypot2(p3[0] - p2[0], p3[1] - p2[1]);
  const count = Math.max(10, Math.ceil(rough / Math.max(spacing, 0.06)) + 1);
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    const u = 1 - t;
    const uu = u * u;
    const tt = t * t;
    return [
      uu * u * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + tt * t * p3[0],
      uu * u * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + tt * t * p3[1],
    ] as Point2;
  });
}

export function concatenatePaths(paths: readonly (readonly Point2[])[]): Point2[] {
  const result: Point2[] = [];
  paths.forEach((path) => {
    path.forEach((point) => {
      const previous = result[result.length - 1];
      if (previous && hypot2(point[0] - previous[0], point[1] - previous[1]) < 1e-5) return;
      result.push(point);
    });
  });
  return result;
}

export function extendTangent(
  path: readonly Point2[],
  end: 'start' | 'finish',
  distance: number,
  spacing: number,
): Point2[] {
  if (path.length < 2 || distance <= 1e-5) return [...path];
  if (end === 'start') {
    const a = path[0];
    const b = path[1];
    const length = hypot2(b[0] - a[0], b[1] - a[1]) || 1;
    const ux = (a[0] - b[0]) / length;
    const uz = (a[1] - b[1]) / length;
    const extra = sampleLine2(
      [a[0] + ux * distance, a[1] + uz * distance],
      a,
      spacing,
    );
    return concatenatePaths([extra, path]);
  }
  const a = path[path.length - 2];
  const b = path[path.length - 1];
  const length = hypot2(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / length;
  const uz = (b[1] - a[1]) / length;
  const extra = sampleLine2(
    b,
    [b[0] + ux * distance, b[1] + uz * distance],
    spacing,
  );
  return concatenatePaths([path, extra]);
}

export function maxHeadingJump(path: readonly Point2[]) {
  if (path.length < 3) return 0;
  let worst = 0;
  let previous = headingOf(path[1][0] - path[0][0], path[1][1] - path[0][1]);
  for (let index = 1; index < path.length - 1; index += 1) {
    const next = headingOf(
      path[index + 1][0] - path[index][0],
      path[index + 1][1] - path[index][1],
    );
    worst = Math.max(worst, Math.abs(angleDelta(previous, next)));
    previous = next;
  }
  return worst;
}

export function elevatePoints(
  points: readonly Point2[],
  elevationAt: (x: number, z: number) => number,
): ElevatedSample[] {
  return points
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map((point) => ({
      x: point[0],
      z: point[1],
      y: elevationAt(point[0], point[1]),
    }));
}

function compactSamples(samples: readonly ElevatedSample[]): ElevatedSample[] {
  const compact: ElevatedSample[] = [];
  samples.forEach((sample) => {
    const previous = compact[compact.length - 1];
    if (previous && hypot2(sample.x - previous.x, sample.z - previous.z) < 1e-5) return;
    compact.push(sample);
  });
  return compact;
}

function pushUpwardTriangle(
  target: RibbonAccumulator,
  i0: number,
  i1: number,
  i2: number,
) {
  const x0 = target.positions[i0 * 3];
  const z0 = target.positions[i0 * 3 + 2];
  const x1 = target.positions[i1 * 3];
  const z1 = target.positions[i1 * 3 + 2];
  const x2 = target.positions[i2 * 3];
  const z2 = target.positions[i2 * 3 + 2];
  const cross = (z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0);
  if (Math.abs(cross) < 1e-12) return;
  if (cross >= 0) target.indices.push(i0, i1, i2);
  else target.indices.push(i0, i2, i1);
}

export function pushRibbon(
  target: RibbonAccumulator,
  samples: readonly ElevatedSample[],
  offsetFrom: number,
  offsetTo: number,
  uvRepeat: number,
  yBias = 0,
) {
  const path = compactSamples(samples);
  if (path.length < 2) return;
  const baseIndex = target.positions.length / 3;
  let distance = 0;
  for (let index = 0; index < path.length; index += 1) {
    const current = path[index];
    const previous = path[Math.max(0, index - 1)];
    const next = path[Math.min(path.length - 1, index + 1)];
    const dirX = next.x - previous.x;
    const dirZ = next.z - previous.z;
    const length = hypot2(dirX, dirZ) || 1;
    const normalX = -dirZ / length;
    const normalZ = dirX / length;
    if (index > 0) distance += hypot2(current.x - previous.x, current.z - previous.z);
    const v = distance / Math.max(uvRepeat, 0.001);
    const y = current.y + yBias;
    target.positions.push(
      current.x + normalX * offsetFrom,
      y,
      current.z + normalZ * offsetFrom,
      current.x + normalX * offsetTo,
      y,
      current.z + normalZ * offsetTo,
    );
    target.normals.push(0, 1, 0, 0, 1, 0);
    target.uvs.push(0, v, 1, v);
  }
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = baseIndex + index * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    pushUpwardTriangle(target, a, b, c);
    pushUpwardTriangle(target, b, d, c);
  }
}

export function pushDashedRibbon(
  target: RibbonAccumulator,
  samples: readonly ElevatedSample[],
  offset: number,
  halfThickness: number,
  dashLength: number,
  gapLength: number,
  yBias = 0,
) {
  let cursor = 0;
  let run: ElevatedSample[] = [];
  const flush = () => {
    if (run.length >= 2) {
      pushRibbon(target, run, offset - halfThickness, offset + halfThickness, 1, yBias);
    }
    run = [];
  };
  for (let index = 0; index < samples.length; index += 1) {
    if (index > 0) {
      cursor += hypot2(
        samples[index].x - samples[index - 1].x,
        samples[index].z - samples[index - 1].z,
      );
    }
    const phase = cursor % (dashLength + gapLength);
    if (phase <= dashLength) run.push(samples[index]);
    else flush();
  }
  flush();
}

export function pushRing(
  target: RibbonAccumulator,
  center: Point2,
  innerRadius: number,
  outerRadius: number,
  elevation: number,
  segments: number,
) {
  if (outerRadius <= innerRadius + 1e-5) return;
  const baseIndex = target.positions.length / 3;
  const tau = Math.PI * 2;
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * tau;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    target.positions.push(
      center[0] + cos * innerRadius,
      elevation,
      center[1] + sin * innerRadius,
      center[0] + cos * outerRadius,
      elevation,
      center[1] + sin * outerRadius,
    );
    target.normals.push(0, 1, 0, 0, 1, 0);
    target.uvs.push(index / segments, 0, index / segments, 1);
  }
  for (let index = 0; index < segments; index += 1) {
    const a = baseIndex + index * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    pushUpwardTriangle(target, a, c, b);
    pushUpwardTriangle(target, c, d, b);
  }
}

export function pushDisk(
  target: RibbonAccumulator,
  center: Point2,
  radius: number,
  elevation: number,
  segments: number,
) {
  if (radius <= 1e-5) return;
  const baseIndex = target.positions.length / 3;
  const tau = Math.PI * 2;
  target.positions.push(center[0], elevation, center[1]);
  target.normals.push(0, 1, 0);
  target.uvs.push(0.5, 0.5);
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * tau;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    target.positions.push(center[0] + cos * radius, elevation, center[1] + sin * radius);
    target.normals.push(0, 1, 0);
    target.uvs.push(0.5 + cos * 0.5, 0.5 + sin * 0.5);
    if (index > 0) target.indices.push(baseIndex, baseIndex + index + 1, baseIndex + index);
  }
}

export function pushBox(
  target: RibbonAccumulator,
  cx: number,
  y: number,
  cz: number,
  width: number,
  height: number,
  depth: number,
) {
  const hx = width / 2;
  const hy = height / 2;
  const hz = depth / 2;
  const faces: number[][] = [
    [-hx, hy, -hz, hx, hy, -hz, hx, hy, hz, -hx, hy, hz],
    [-hx, -hy, -hz, -hx, -hy, hz, hx, -hy, hz, hx, -hy, -hz],
    [-hx, -hy, hz, -hx, hy, hz, hx, hy, hz, -hx, -hy, hz],
    [-hx, -hy, -hz, hx, -hy, -hz, hx, hy, -hz, -hx, hy, -hz],
    [hx, -hy, -hz, hx, -hy, hz, hx, hy, hz, hx, hy, -hz],
    [-hx, -hy, -hz, -hx, hy, -hz, -hx, hy, hz, -hx, -hy, hz],
  ];
  const normals: Array<[number, number, number]> = [
    [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0],
  ];
  faces.forEach((face, faceIndex) => {
    const base = target.positions.length / 3;
    const n = normals[faceIndex];
    for (let corner = 0; corner < 4; corner += 1) {
      target.positions.push(
        cx + face[corner * 3],
        y + face[corner * 3 + 1],
        cz + face[corner * 3 + 2],
      );
      target.normals.push(...n);
      target.uvs.push(corner === 1 || corner === 2 ? 1 : 0, corner >= 2 ? 1 : 0);
    }
    if (faceIndex === 0) target.indices.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
    else target.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
}

export function accumulatorToGeometry(accumulator: RibbonAccumulator) {
  if (accumulator.indices.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(accumulator.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(accumulator.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(accumulator.uvs, 2));
  geometry.setIndex(accumulator.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function triangleCount(geometry: THREE.BufferGeometry | null) {
  if (!geometry) return 0;
  return (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3;
}

export function geometryBounds(geometries: readonly (THREE.BufferGeometry | null)[]) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  geometries.forEach((geometry) => {
    const positions = geometry?.getAttribute('position');
    if (!positions) return;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  });
  return { minX, maxX, minZ, maxZ };
}

/**
 * 270° inner cloverleaf loop tangent to two offset axis-aligned roads.
 * `signX` / `signZ` pick the quadrant (+X east, +Z south).
 */
export function cloverleafLoopSweep(signX: number, signZ: number) {
  const start = signZ > 0 ? Math.PI * 1.5 : Math.PI / 2;
  const sweep = signX === signZ ? Math.PI * 1.5 : -Math.PI * 1.5;
  return { start, sweep };
}

export function cloverleafLoopCenter(
  origin: Point2,
  signX: number,
  signZ: number,
  mergeOffset: number,
  radius: number,
): Point2 {
  return cloverleafLoopCenterXY(origin, signX, signZ, mergeOffset, mergeOffset, radius);
}

export function cloverleafLoopCenterXY(
  origin: Point2,
  signX: number,
  signZ: number,
  mergeX: number,
  mergeZ: number,
  radius: number,
): Point2 {
  return [
    origin[0] + signX * (mergeX + radius),
    origin[1] + signZ * (mergeZ + radius),
  ];
}

export function sampleCloverleafLoop(
  origin: Point2,
  signX: number,
  signZ: number,
  mergeOffset: number,
  radius: number,
  spacing: number,
  goreLength: number,
): Point2[] {
  return sampleCloverleafLoopXY(
    origin,
    signX,
    signZ,
    mergeOffset,
    mergeOffset,
    radius,
    spacing,
    goreLength,
  );
}

export function sampleCloverleafLoopXY(
  origin: Point2,
  signX: number,
  signZ: number,
  mergeX: number,
  mergeZ: number,
  radius: number,
  spacing: number,
  goreLength: number,
): Point2[] {
  const center = cloverleafLoopCenterXY(origin, signX, signZ, mergeX, mergeZ, radius);
  const { start, sweep } = cloverleafLoopSweep(signX, signZ);
  const arc = sampleArc2(center, radius, start, sweep, spacing);
  return extendTangent(
    extendTangent(arc, 'start', goreLength, spacing),
    'finish',
    goreLength,
    spacing,
  );
}

/**
 * Outer right-turn slip: cubic Bezier that stays outside the 270° leaf and
 * is tangent to both mainline offsets (C1 gore, no concentric jewellery ring).
 */
export function sampleCloverleafOuterSlip(
  origin: Point2,
  signX: number,
  signZ: number,
  mergeOffset: number,
  loopRadius: number,
  spacing: number,
): Point2[] {
  return sampleCloverleafOuterSlipXY(
    origin,
    signX,
    signZ,
    mergeOffset,
    mergeOffset,
    loopRadius,
    spacing,
  );
}

export function sampleCloverleafOuterSlipXY(
  origin: Point2,
  signX: number,
  signZ: number,
  mergeX: number,
  mergeZ: number,
  loopRadius: number,
  spacing: number,
): Point2[] {
  const alongX = mergeX + loopRadius * 2.08;
  const alongZ = mergeZ + loopRadius * 2.08;
  const handle = loopRadius * 0.7;
  const p0: Point2 = [origin[0] + signX * mergeX, origin[1] + signZ * alongZ];
  const p3: Point2 = [origin[0] + signX * alongX, origin[1] + signZ * mergeZ];
  const p1: Point2 = [p0[0], p0[1] + signZ * handle];
  const p2: Point2 = [p3[0] + signX * handle, p3[1]];
  return sampleCubicBezier2(p0, p1, p2, p3, spacing);
}

export function distanceToPoint(point: Point2, origin: Point2) {
  return hypot2(point[0] - origin[0], point[1] - origin[1]);
}

export function pathApproachesAxis(
  path: readonly Point2[],
  axis: 'x' | 'z',
  value: number,
  tolerance: number,
) {
  return path.some((point) => Math.abs((axis === 'x' ? point[0] : point[1]) - value) <= tolerance);
}
