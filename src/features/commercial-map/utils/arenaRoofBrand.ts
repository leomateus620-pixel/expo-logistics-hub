import * as THREE from 'three';
import type { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARENA_CANONICAL_LAYOUT } from '../data/arenaCanonicalLayout';

export const ARENA_ROOF_BRAND = Object.freeze({
  symbol: '/alvorada/fenasoja-symbol-official.png',
  font: '/alvorada/fenasoja-wordmark.typeface.json',
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
  // One centered lockup along the ridge: symbol first, then the UI wordmark.
  // The 90-degree artwork rotation happens BEFORE conforming to the vault.
  const length = Math.min(depth * 0.88, width * 2.2);
  const symbolSize = length * 0.22;
  const gap = length * 0.05;
  const wordWidth = length - symbolSize - gap;
  return {
    length,
    wordWidth,
    symbolSize,
    gap,
    symbolCenterU: -length / 2 + symbolSize / 2,
    wordCenterU: length / 2 - wordWidth / 2,
    rotation: Math.PI / 2,
    relief: width * 0.02,
    // Inter's compact UI tracking needs narrow chamfers, especially A–S/O–J.
    bevel: width * 0.00065,
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
  // Small optical height compensation for the usual inclined roof view.
  text.translate(-center.x, -center.y, 0).scale(scale, scale * 1.1, scale);
  text.translate(layout.wordCenterU, 0, 0).rotateZ(layout.rotation);
  const caps = extractMaterial(text, 0), edges = extractMaterial(text, 1);
  text.dispose();
  const faces = conformArenaRoofGeometry(caps, width, layout.seating);
  // Neutral silver face finish: bright upper edge and a darker lower face.
  // Vertex colors keep this in the existing face draw, without a texture/atlas.
  const facePositions = faces.getAttribute('position');
  const faceBounds = faces.boundingBox!;
  const silver = new THREE.Color('#959b9f'), pearl = new THREE.Color('#dde1e3'), highlight = new THREE.Color('#ffffff');
  const color = new THREE.Color(), colors: number[] = [];
  for (let i = 0; i < facePositions.count; i++) {
    const height = (faceBounds.max.x - facePositions.getX(i)) / (faceBounds.max.x - faceBounds.min.x);
    if (height < 0.5) color.copy(silver).lerp(pearl, height * 2);
    else color.copy(pearl).lerp(highlight, (height - 0.5) * 2);
    colors.push(color.r, color.g, color.b);
  }
  faces.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const returns = conformArenaRoofGeometry(edges, width, layout.seating);
  caps.dispose(); edges.dispose();

  // A low relief backing seats the official emblem on the same roof surface.
  // It preserves the supplied square image, including its transparent gaps.
  const badge = new THREE.CylinderGeometry(layout.symbolSize * 0.49, layout.symbolSize * 0.49, layout.relief, 48);
  badge.rotateX(Math.PI / 2).translate(layout.symbolCenterU, 0, layout.relief / 2).rotateZ(layout.rotation);
  const badgeRelief = conformArenaRoofGeometry(badge, width, layout.seating);
  badge.dispose();
  const symbolPlane = new THREE.PlaneGeometry(layout.symbolSize, layout.symbolSize, 12, 12)
    .translate(layout.symbolCenterU, 0, layout.relief + width * 0.001).rotateZ(layout.rotation);
  const symbol = conformArenaRoofGeometry(symbolPlane, width, layout.seating);
  symbolPlane.dispose();
  const geometries = { faces, returns: merge([returns, badgeRelief]), symbol };
  return { ...geometries, layout, dispose: () => Object.values(geometries).forEach(g => g.dispose()) };
}
