import * as THREE from 'three';
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { Coordinate, PolygonGeometry } from '../types';
import { isSelfIntersecting, polygonAreaMapUnits, segmentsIntersect, withoutClosingPoint } from './geometry';
import { distanceToSegment, pointInPolygon } from './spatialSurface';

export interface ExternalLotFrame {
  polygons: MultiPolygon;
  inset: number;
  width: number;
  /** The area inside the inner offset, excluding cadastral holes. */
  centerArea: number;
  sourceArea: number;
}

type LotGeometry = Pick<PolygonGeometry, 'coordinates'>;
const frames = new WeakMap<LotGeometry, ExternalLotFrame | null>();
const ARC_STEPS = 24;
const cross = (a: Coordinate, b: Coordinate) => a[0] * b[1] - a[1] * b[0];
const subtract = (a: Coordinate, b: Coordinate): Coordinate => [a[0] - b[0], a[1] - b[1]];
const signedArea = (ring: Coordinate[]) => ring.reduce((sum, a, i) => sum + cross(a, ring[(i + 1) % ring.length]), 0) / 2;
const area = (polygons: MultiPolygon) => polygons.reduce((sum, coordinates) => sum + polygonAreaMapUnits({ coordinates }), 0);

function validRings(coordinates: Coordinate[][]): Coordinate[][] | null {
  if (!coordinates.length) return null;
  const rings = coordinates.map(ring => withoutClosingPoint(ring).filter((p, i, points) => !i || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]));
  if (rings.some(ring => ring.length < 3 || ring.some(p => p.length !== 2 || !p.every(Number.isFinite))
    || Math.abs(signedArea(ring)) < 1e-12 || isSelfIntersecting(ring))) return null;
  for (let i = 1; i < rings.length; i++) {
    if (!pointInPolygon(rings[i][0], rings[0])) return null;
    for (let j = 0; j < i; j++) {
      if (j > 0 && (pointInPolygon(rings[i][0], rings[j]) || pointInPolygon(rings[j][0], rings[i]))) return null;
      for (let a = 0; a < rings[i].length; a++) for (let b = 0; b < rings[j].length; b++) {
        if (segmentsIntersect(rings[i][a], rings[i][(a + 1) % rings[i].length], rings[j][b], rings[j][(b + 1) % rings[j].length])) return null;
      }
    }
  }
  return rings;
}

/** Collinear cadastral junctions are irrelevant to a width measurement. This
 * copy is used ONLY for measuring spans; offsets keep every original vertex. */
function measurementRing(ring: Coordinate[]) {
  return ring.filter((p, i) => {
    const before = subtract(p, ring[(i + ring.length - 1) % ring.length]);
    const after = subtract(ring[(i + 1) % ring.length], p);
    return Math.abs(cross(before, after)) > 1e-10 * Math.max(1, Math.hypot(...before) * Math.hypot(...after))
      || before[0] * after[0] + before[1] * after[1] < 0;
  });
}

/** Measure passages BETWEEN substantial opposing boundaries, rather than
 * treating a tiny corner bevel/raster facet as the width of the entire parcel.
 * Adjacent sides describe a corner, not a neck. Holes and long narrow arms still
 * constrain the width, including when those sides contain redundant junctions.
 * The erosion below remains constrained by ALL original edges and cutouts. */
function narrowSpan(rings: Coordinate[][], initial: number) {
  rings = rings.map(measurementRing);
  const directions = rings.map((ring, index) => Math.sign(signedArea(ring)) * (index === 0 ? 1 : -1));
  let result = initial;
  rings.forEach((ring, ringIndex) => {
    const direction = directions[ringIndex];
    ring.forEach((a, index) => {
      const b = ring[(index + 1) % ring.length], edge = subtract(b, a), length = Math.hypot(...edge);
      if (length < initial * .1) return;
      const normal: Coordinate = [-edge[1] / length * direction, edge[0] / length * direction];
      for (const t of [.2, .5, .8]) {
        const origin: Coordinate = [a[0] + edge[0] * t, a[1] + edge[1] * t];
        rings.forEach((other, otherIndex) => other.forEach((c, j) => {
          if (ringIndex === otherIndex && (index === j || (index + 1) % ring.length === j || (j + 1) % ring.length === index)) return;
          const segment = subtract(other[(j + 1) % other.length], c), delta = subtract(c, origin);
          const targetLength = Math.hypot(...segment);
          if (targetLength < 1e-10) return;
          const opposingNormal: Coordinate = [-segment[1] / targetLength * directions[otherIndex], segment[0] / targetLength * directions[otherIndex]];
          if (normal[0] * opposingNormal[0] + normal[1] * opposingNormal[1] > -.8) return;
          const denominator = cross(normal, segment);
          if (Math.abs(denominator) < 1e-10) return;
          const distance = cross(delta, segment) / denominator, u = cross(delta, normal) / denominator;
          if (distance > 1e-8 && u >= 0 && u <= 1) result = Math.min(result, distance);
        }));
      }
    });
  });
  return result;
}

function isConvex(ring: Coordinate[]) {
  const direction = Math.sign(signedArea(ring));
  return ring.every((a, i) => cross(subtract(ring[(i + 1) % ring.length], a), subtract(ring[(i + 2) % ring.length], ring[(i + 1) % ring.length])) * direction >= -1e-10);
}

/** Exact convex erosion by inward edge half-planes; this common fast path is
 * an offset, never a centroid scale or an approximate bounding rectangle. */
function erodeConvex(ring: Coordinate[], distance: number): MultiPolygon {
  let result = ring.map(p => [...p] as Coordinate);
  const direction = Math.sign(signedArea(ring));
  for (let i = 0; i < ring.length && result.length >= 3; i++) {
    const a = ring[i], edge = subtract(ring[(i + 1) % ring.length], a), length = Math.hypot(...edge);
    if (length < 1e-10) continue;
    const side = (p: Coordinate) => cross(edge, subtract(p, a)) * direction / length - distance;
    const clipped: Coordinate[] = [];
    result.forEach((p, index) => {
      const q = result[(index + 1) % result.length], dp = side(p), dq = side(q);
      if (dp >= 0) clipped.push(p);
      if ((dp >= 0) !== (dq >= 0)) {
        const t = dp / (dp - dq);
        clipped.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    });
    result = clipped;
  }
  return result.length >= 3 ? [[result]] : [];
}

/** A sufficiently convex corner's disk is already covered by its two strips.
 * Use the disk's circumscribed radius (not the ideal circle) for the proof,
 * and retain it if another boundary enters that local neighbourhood. This
 * removes only redundant boolean operands, preserving the exact offset. */
function redundantCornerDisk(rings: Coordinate[][], ringIndex: number, index: number, radius: number) {
  const ring = rings[ringIndex], a = ring[index];
  const before = subtract(a, ring[(index + ring.length - 1) % ring.length]);
  const after = subtract(ring[(index + 1) % ring.length], a);
  const direction = Math.sign(signedArea(ring)) * (ringIndex === 0 ? 1 : -1);
  if (cross(before, after) * direction <= 0) return false;
  const lengths = Math.hypot(...before) * Math.hypot(...after);
  if ((before[0] * after[0] + before[1] * after[1]) / lengths >= Math.cos(2 * Math.PI / ARC_STEPS) - 1e-12) return false;
  return rings.every((other, otherIndex) => other.every((b, j) => {
    if (ringIndex === otherIndex && (j === index || (j + 1) % ring.length === index)) return true;
    return distanceToSegment(a, b, other[(j + 1) % other.length]) > radius * (1 + 1e-10);
  }));
}

/** Euclidean erosion = P minus the radius-d neighbourhood of every boundary.
 * Unioning edge strips and circumscribed disks gives bounded round joins at
 * concavities, including holes. Disk error is conservative (< .9% of radius),
 * so no visible part can escape the requested inward clearance. Boolean
 * clipping resolves self-overlap and split components before triangulation. */
function erode(rings: Coordinate[][], distance: number): MultiPolygon {
  if (rings.length === 1 && isConvex(rings[0])) return erodeConvex(rings[0], distance);
  const neighbourhood: Polygon[] = [];
  const radius = distance / Math.cos(Math.PI / ARC_STEPS);
  rings.forEach((ring, ringIndex) => ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], edge = subtract(b, a), length = Math.hypot(...edge);
    if (length < 1e-10) return;
    const nx = -edge[1] / length * distance, nz = edge[0] / length * distance;
    neighbourhood.push([[[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]]]);
    if (!redundantCornerDisk(rings, ringIndex, i, radius)) neighbourhood.push([Array.from({ length: ARC_STEPS }, (_, j): Coordinate => {
      const angle = j * Math.PI * 2 / ARC_STEPS;
      return [a[0] + Math.cos(angle) * radius, a[1] + Math.sin(angle) * radius];
    })]);
  }));
  return polygonClipping.difference(rings, polygonClipping.union(neighbourhood[0], ...neighbourhood.slice(1)));
}

/** Presentation-only offsets, cached by the immutable cadastral geometry.
 * No status, camera or hover input can rebuild this geometry. Invalid rings
 * omit only the frame; callers keep contextual status and lot interaction. */
export function deriveExternalLotFrame(geometry: LotGeometry): ExternalLotFrame | null {
  if (frames.has(geometry)) return frames.get(geometry)!;
  let result: ExternalLotFrame | null = null;
  try {
    const rings = validRings(geometry.coordinates);
    if (rings) {
      const outer = rings[0], xs = outer.map(p => p[0]), zs = outer.map(p => p[1]);
      const span = narrowSpan(rings, Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)));
      const sourceArea = polygonAreaMapUnits({ coordinates: rings });
      // 35% wider inward than the initial 4% proposal; the cadastral gap stays.
      let inset = span * .0075, width = span * .054;
      for (let attempt = 0; attempt < 6 && width > 1e-7; attempt++, inset *= .5, width *= .5) {
        const outerOffset = erode(rings, inset), innerOffset = erode(rings, inset + width);
        const centerArea = area(innerOffset);
        if (!innerOffset.length || centerArea < sourceArea * .75) continue;
        // Erosion is nested even for concave parcels. If both results have
        // one ring, a hole represents the difference exactly without another
        // boolean sweep. Split cores and cadastral holes use the general path.
        const polygons = outerOffset.length === 1 && innerOffset.length === 1
          && outerOffset[0].length === 1 && innerOffset[0].length === 1
          ? [[outerOffset[0][0], innerOffset[0][0]]] : polygonClipping.difference(outerOffset, innerOffset);
        if (polygons.length) result = { polygons, inset, width, centerArea, sourceArea };
        break;
      }
    }
  } catch {
    // Malformed cadastral input must never take the whole map down.
  }
  frames.set(geometry, result);
  return result;
}

/** XZ top face at y=0; the renderer owns elevation, bevel and transient lift. */
export function createExternalLotFrameGeometry(geometry: LotGeometry): THREE.BufferGeometry | null {
  const frame = deriveExternalLotFrame(geometry);
  if (!frame) return null;
  const shapes = frame.polygons.map(([outer, ...holes]) => {
    const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
    shape.holes = holes.map(ring => new THREE.Path(ring.map(([x, z]) => new THREE.Vector2(x, -z))));
    return shape;
  });
  const buffer = new THREE.ShapeGeometry(shapes, 1);
  buffer.rotateX(-Math.PI / 2);
  buffer.computeBoundingBox();
  buffer.computeBoundingSphere();
  return buffer;
}
