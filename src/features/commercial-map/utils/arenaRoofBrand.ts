import * as THREE from 'three';
import type { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARENA_CANONICAL_LAYOUT } from '../data/arenaCanonicalLayout';

export const ARENA_ROOF_BRAND = Object.freeze({
  symbol: '/alvorada/fenasoja-symbol-official.png',
  font: '/alvorada/helvetiker-bold.typeface.json',
  text: 'FENASOJA',
  maxTriangles: 18000,
  drawCalls: 3,
});

/** The same ellipse sampled by createArenaRoof, in canonical local units. */
export function arenaRoofHeightAt(x: number, width: number) {
  const spec = ARENA_CANONICAL_LAYOUT.architecture;
  return spec.springHeight + width * spec.riseToSpan * Math.sqrt(Math.max(0, 1 - (2 * x / width) ** 2));
}

export function arenaRoofBrandLayout(width: number, depth: number) {
  if (!(Number.isFinite(width) && Number.isFinite(depth) && width > 0 && depth > 0)) {
    throw new Error('Arena roof branding requires finite positive dimensions');
  }
  return {
    wordWidth: width * 0.88,
    symbolSize: Math.min(width * 0.26, depth * 0.22),
    symbolCenterV: depth * 0.14,
    wordCenterV: -depth * 0.105,
    relief: width * 0.014,
    bevel: width * 0.002,
    seating: width * 0.003,
  };
}

function finish(g: THREE.BufferGeometry) {
  g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}

function merge(parts: THREE.BufferGeometry[]) {
  const result = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  if (!result) throw new Error('Incompatible arena roof branding geometry');
  return finish(result);
}

/** Combine glyph groups by material so eight letters cost two draws. */
function extractMaterial(source: THREE.BufferGeometry, index: number) {
  return merge(source.groups.filter(group => group.materialIndex === index).map(group => {
    const piece = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const attr = source.getAttribute(name);
      piece.setAttribute(name, new THREE.Float32BufferAttribute(
        Array.from(attr.array.slice(group.start * attr.itemSize, (group.start + group.count) * attr.itemSize)), attr.itemSize,
      ));
    }
    return piece;
  }));
}

type Vertex = number[];
/** Subdivide only across the curved axis. Long font triangles must not cut
 * through the roof between their vertices when the flat artwork is conformed. */
export function conformArenaRoofGeometry(source: THREE.BufferGeometry, width: number, seating: number) {
  const input = source.index ? source.toNonIndexed() : source;
  const p = input.getAttribute('position'), n = input.getAttribute('normal'), uv = input.getAttribute('uv');
  const vertices: Vertex[] = [];
  const read = (i: number) => [p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), uv.getX(i), uv.getY(i)];
  const split = (a: Vertex, b: Vertex, c: Vertex) => {
    const edges = [[a, b, c], [b, c, a], [c, a, b]].sort((e, f) => Math.abs(f[0][0] - f[1][0]) - Math.abs(e[0][0] - e[1][0]));
    const [v0, v1, opposite] = edges[0];
    if (Math.abs(v0[0] - v1[0]) > width * 0.02) {
      const mid = v0.map((v, i) => (v + v1[i]) / 2);
      split(v0, mid, opposite); split(mid, v1, opposite);
    } else vertices.push(a, b, c);
  };
  for (let i = 0; i < p.count; i += 3) split(read(i), read(i + 1), read(i + 2));
  if (input !== source) input.dispose();
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  const normal = new THREE.Vector3();
  for (const [u, v, relief, nx, ny, nz, tx, ty] of vertices) {
    const slope = -4 * ARENA_CANONICAL_LAYOUT.architecture.riseToSpan * u / width / Math.sqrt(1 - (2 * u / width) ** 2);
    // Flat artwork X/Y becomes roof X/-Z. Its extrusion points up (+Y),
    // following the vault rather than standing vertically on supports.
    positions.push(u, arenaRoofHeightAt(u, width) + seating + relief, -v);
    normal.set(nx - slope * nz, nz, -ny).normalize();
    normals.push(normal.x, normal.y, normal.z); uvs.push(tx, ty);
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return finish(result);
}

export function createArenaRoofBrand(width: number, depth: number, font: Font) {
  const layout = arenaRoofBrandLayout(width, depth);
  const shapes = font.generateShapes(ARENA_ROOF_BRAND.text, 1);
  const flat = new THREE.ShapeGeometry(shapes, 5);
  flat.computeBoundingBox();
  const bounds = flat.boundingBox!;
  const scale = layout.wordWidth / (bounds.max.x - bounds.min.x);
  const center = bounds.getCenter(new THREE.Vector3());
  flat.dispose();
  const text = new THREE.ExtrudeGeometry(shapes, {
    depth: layout.relief / scale, steps: 1, curveSegments: 5,
    bevelEnabled: true, bevelThickness: layout.bevel / scale,
    bevelSize: layout.bevel / scale, bevelSegments: 1,
  });
  text.translate(-center.x, -center.y, 0).scale(scale, scale, scale);
  text.translate(0, layout.wordCenterV, 0);
  const caps = extractMaterial(text, 0), edges = extractMaterial(text, 1);
  text.dispose();
  const faces = conformArenaRoofGeometry(caps, width, layout.seating);
  const returns = conformArenaRoofGeometry(edges, width, layout.seating);
  caps.dispose(); edges.dispose();

  // A low relief backing seats the official emblem on the same roof surface.
  // It preserves the supplied square image, including its transparent gaps.
  const badge = new THREE.CylinderGeometry(layout.symbolSize * 0.515, layout.symbolSize * 0.515, layout.relief, 48);
  badge.rotateX(Math.PI / 2).translate(0, layout.symbolCenterV, layout.relief / 2);
  const badgeRelief = conformArenaRoofGeometry(badge, width, layout.seating);
  badge.dispose();
  const symbolPlane = new THREE.PlaneGeometry(layout.symbolSize, layout.symbolSize, 12, 12)
    .translate(0, layout.symbolCenterV, layout.relief + width * 0.001);
  const symbol = conformArenaRoofGeometry(symbolPlane, width, layout.seating);
  symbolPlane.dispose();
  const geometries = { faces, returns: merge([returns, badgeRelief]), symbol };
  return { ...geometries, layout, dispose: () => Object.values(geometries).forEach(g => g.dispose()) };
}
