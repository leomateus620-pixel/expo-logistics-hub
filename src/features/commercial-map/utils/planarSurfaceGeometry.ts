import * as THREE from 'three';
type LocalPoint = readonly [number, number];

type Vertex = number[];
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export interface PlanarSurfaceCut extends Bounds {
  polygon: LocalPoint[];
}

const EPSILON = 1e-8;
const SEAM_BLEND = 0.35;

function boundsOf(points: readonly LocalPoint[]): Bounds {
  return {
    minX: Math.min(...points.map(([x]) => x)),
    maxX: Math.max(...points.map(([x]) => x)),
    minZ: Math.min(...points.map(([, z]) => z)),
    maxZ: Math.max(...points.map(([, z]) => z)),
  };
}

function overlaps(a: Bounds, b: Bounds, margin = 0) {
  return a.minX <= b.maxX + margin && a.maxX >= b.minX - margin
    && a.minZ <= b.maxZ + margin && a.maxZ >= b.minZ - margin;
}

function signedArea(polygon: readonly LocalPoint[]) {
  return polygon.reduce((area, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

/** Convex subtraction preserves/interpolates UVs and vertex colors at the cut. */
function subtractConvex(polygon: Vertex[], cut: PlanarSurfaceCut): Vertex[][] {
  const orientation = Math.sign(signedArea(cut.polygon));
  let inside = polygon;
  const outside: Vertex[][] = [];
  for (let edge = 0; edge < cut.polygon.length && inside.length >= 3; edge += 1) {
    const a = cut.polygon[edge];
    const b = cut.polygon[(edge + 1) % cut.polygon.length];
    const side = (vertex: Vertex) => orientation
      * ((b[0] - a[0]) * (vertex[2] - a[1]) - (b[1] - a[1]) * (vertex[0] - a[0]));
    const nextInside: Vertex[] = [];
    const nextOutside: Vertex[] = [];
    inside.forEach((current, index) => {
      const next = inside[(index + 1) % inside.length];
      const currentSide = side(current);
      const nextSide = side(next);
      (currentSide >= 0 ? nextInside : nextOutside).push(current);
      if ((currentSide >= 0) !== (nextSide >= 0)) {
        const t = currentSide / (currentSide - nextSide);
        const intersection = current.map((value, channel) => value + (next[channel] - value) * t);
        nextInside.push(intersection);
        nextOutside.push(intersection);
      }
    });
    if (nextOutside.length >= 3) outside.push(nextOutside);
    inside = nextInside;
  }
  return outside;
}

function distanceToCutEdge(x: number, z: number, cut: PlanarSurfaceCut) {
  let distance = Infinity;
  cut.polygon.forEach((a, index) => {
    const b = cut.polygon[(index + 1) % cut.polygon.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    distance = Math.min(distance, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  });
  return distance;
}

/**
 * Real polygon cut, not centroid rejection or an artificial asphalt lift.
 * Removes terrain/pedestrian triangles inside the carriageway AND shoulder.
 * The narrow outside seam grades to the shoulder while retaining the existing
 * terrain elsewhere. Used only during memoized geometry construction.
 * Mutates the supplied geometry; its owner retains the normal disposal contract.
 */
export function clipPlanarSurfaceGeometry(
  geometry: THREE.BufferGeometry,
  surfaceCuts: readonly PlanarSurfaceCut[],
  seamElevation?: (cut: PlanarSurfaceCut, x: number, z: number) => number,
) {
  const sourcePosition = geometry.getAttribute('position');
  if (!sourcePosition || sourcePosition.count === 0) return geometry;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const bounds = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
  const cuts = surfaceCuts.filter((cut) => overlaps(bounds, cut, SEAM_BLEND));
  if (cuts.length === 0) return geometry;

  const names = Object.keys(geometry.attributes).filter((name) => name !== 'normal');
  const attributes = names.map((name) => geometry.getAttribute(name));
  // Position must be first for planar clipping; THREE geometries satisfy this,
  // but sorting here makes the utility safe for custom BufferGeometry callers.
  const positionIndex = names.indexOf('position');
  [names[0], names[positionIndex]] = [names[positionIndex], names[0]];
  [attributes[0], attributes[positionIndex]] = [attributes[positionIndex], attributes[0]];
  const outputs = attributes.map(() => [] as number[]);
  const sourceIndex = geometry.getIndex();
  const count = sourceIndex?.count ?? sourcePosition.count;
  const readVertex = (index: number): Vertex => attributes.flatMap((attribute) => (
    Array.from({ length: attribute.itemSize }, (_, component) => attribute.getComponent(index, component))
  ));

  for (let index = 0; index < count; index += 3) {
    const triangle = [0, 1, 2].map((offset) => readVertex(sourceIndex?.getX(index + offset) ?? index + offset));
    const triangleBounds = boundsOf(triangle.map((vertex) => [vertex[0], vertex[2]]));
    const nearbyCuts = cuts.filter((cut) => overlaps(triangleBounds, cut, SEAM_BLEND));
    let pieces = [triangle];
    nearbyCuts.filter((cut) => overlaps(triangleBounds, cut)).forEach((cut) => {
      pieces = pieces.flatMap((piece) => subtractConvex(piece, cut));
    });
    pieces.forEach((piece) => {
      for (let fan = 1; fan < piece.length - 1; fan += 1) {
        // Test the same Float32 positions sent to WebGL. Tiny clipped slivers
        // can otherwise collapse only after upload and acquire zero normals.
        const vertices = [piece[0], piece[fan], piece[fan + 1]].map((vertex) => vertex.map(Math.fround));
        const area = signedArea(vertices.map((vertex) => [vertex[0], vertex[2]]));
        if (Math.abs(area) < EPSILON) continue;
        // XZ surface fronts point +Y (clockwise in the planar projection).
        // Normalize the final Float32 fan, including numerical edge slivers.
        if (area > 0) [vertices[1], vertices[2]] = [vertices[2], vertices[1]];
        vertices.forEach((source) => {
          const vertex = [...source];
          if (seamElevation) nearbyCuts.forEach((cut) => {
            const distance = distanceToCutEdge(vertex[0], vertex[2], cut);
            if (distance >= SEAM_BLEND) return;
            const blend = THREE.MathUtils.smoothstep(distance, 0, SEAM_BLEND);
            const seam = seamElevation(cut, vertex[0], vertex[2]);
            vertex[1] = Math.min(vertex[1], seam + (source[1] - seam) * blend);
          });
          let channel = 0;
          attributes.forEach((attribute, attributeIndex) => {
            for (let component = 0; component < attribute.itemSize; component += 1) {
              outputs[attributeIndex].push(vertex[channel++]);
            }
          });
        });
      }
    });
  }
  geometry.setIndex(null);
  names.forEach((name, index) => geometry.setAttribute(
    name, new THREE.Float32BufferAttribute(outputs[index], attributes[index].itemSize),
  ));
  geometry.deleteAttribute('normal');
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
