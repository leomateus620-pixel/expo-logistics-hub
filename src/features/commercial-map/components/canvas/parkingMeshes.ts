import * as THREE from 'three';
import { LineMaterial, LineSegments2, LineSegmentsGeometry } from 'three-stdlib';
import { EXPORURAL_MAP_UNITS_PER_METER } from '../../data/exporuralReference2026';
import { openParkingPolygon, type ParkingPoint, type ParkingPolygon } from '../../utils/parkingGeometry';

const NO_RAYCAST = () => undefined;
const TEXTURE_WORLD_SIZE = 6 * EXPORURAL_MAP_UNITS_PER_METER;

function shape(polygon: ParkingPolygon) {
  const path = new THREE.Shape();
  polygon.forEach(([x, z], i) => i ? path.lineTo(x, -z) : path.moveTo(x, -z));
  path.closePath();
  return path;
}

/** Exact boundary triangulation; no bounding rectangle or raster ground plane. */
export function createParkingSurfaceGeometry(polygons: readonly ParkingPolygon[], y: number) {
  const geometry = new THREE.ShapeGeometry(polygons.filter((polygon) => polygon.length >= 3).map(shape));
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  const position = geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  const alpha = new Float32Array(position.count).fill(1);
  for (let i = 0; i < position.count; i += 1) {
    uv[i * 2] = position.getX(i) / TEXTURE_WORLD_SIZE;
    uv[i * 2 + 1] = position.getZ(i) / TEXTURE_WORLD_SIZE;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('parkingAlpha', new THREE.BufferAttribute(alpha, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Narrow natural shoulder, with an optical fade instead of an invented raised curb. */
export function createParkingFeatherGeometry(polygons: readonly ParkingPolygon[], y: number, width = 0.075) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const alphas: number[] = [];
  const indices: number[] = [];
  for (const inputPolygon of polygons) {
    const polygon = openParkingPolygon(inputPolygon);
    if (polygon.length < 3) continue;
    const signedArea = polygon.reduce((sum, a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      return sum + a[0] * b[1] - b[0] * a[1];
    }, 0);
    const sign = signedArea >= 0 ? 1 : -1;
    const offset = positions.length / 3;
    polygon.forEach((point, i) => {
      const prev = polygon[(i + polygon.length - 1) % polygon.length];
      const next = polygon[(i + 1) % polygon.length];
      const n1 = new THREE.Vector2(point[1] - prev[1], prev[0] - point[0]).normalize().multiplyScalar(sign);
      const n2 = new THREE.Vector2(next[1] - point[1], point[0] - next[0]).normalize().multiplyScalar(sign);
      const outward = n1.clone().add(n2).normalize();
      const miter = Math.min(width * 1.75, width / Math.max(0.2, outward.dot(n2)));
      const outer: ParkingPoint = [point[0] + outward.x * miter, point[1] + outward.y * miter];
      for (const p of [point, outer]) {
        positions.push(p[0], y, p[1]);
        uvs.push(p[0] / TEXTURE_WORLD_SIZE, p[1] / TEXTURE_WORLD_SIZE);
      }
      alphas.push(1, 0);
      const a = offset + i * 2;
      const b = offset + ((i + 1) % polygon.length) * 2;
      if (sign > 0) indices.push(a, b, a + 1, b, b + 1, a + 1);
      else indices.push(a, a + 1, b, b, a + 1, b + 1);
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('parkingAlpha', new THREE.Float32BufferAttribute(alphas, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** One instanced line batch per spatial sector, not one mesh per stall. */
export function createParkingLineBatch(
  polygons: readonly ParkingPolygon[],
  y: number,
  { color = '#eee7d3', width = 0.95, opacity = 0.84, closed = true } = {},
) {
  const segments = new Map<string, readonly [ParkingPoint, ParkingPoint]>();
  for (const polygon of polygons) {
    const count = closed ? polygon.length : polygon.length - 1;
    for (let i = 0; i < count; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-5) continue;
      const aKey = `${a[0].toFixed(4)},${a[1].toFixed(4)}`;
      const bKey = `${b[0].toFixed(4)},${b[1].toFixed(4)}`;
      segments.set(aKey < bKey ? `${aKey}:${bKey}` : `${bKey}:${aKey}`, [a, b]);
    }
  }
  const positions = [...segments.values()].flatMap(([a, b]) => [a[0], y, a[1], b[0], y, b[1]]);
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions.length ? positions : [0, y, 0, 0, y, 0]);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new LineMaterial({
    color: new THREE.Color(color).getHex(),
    linewidth: width,
    worldUnits: false,
    alphaToCoverage: true,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  material.toneMapped = false;
  const object = new LineSegments2(geometry, material);
  object.name = 'rear-parking-instanced-markings';
  object.raycast = NO_RAYCAST;
  object.frustumCulled = true;
  object.renderOrder = 4;
  object.visible = positions.length > 0;
  return {
    object,
    material,
    segmentCount: segments.size,
    dispose() { geometry.dispose(); material.dispose(); },
  };
}

export function createParkingArrowGeometry() {
  const outline = new THREE.Shape();
  // Unit direction is -Z after rotation; proportions are presentation-only.
  outline.moveTo(-0.08, -0.42);
  outline.lineTo(0.08, -0.42);
  outline.lineTo(0.08, 0.08);
  outline.lineTo(0.23, 0.08);
  outline.lineTo(0, 0.42);
  outline.lineTo(-0.23, 0.08);
  outline.lineTo(-0.08, 0.08);
  outline.closePath();
  const geometry = new THREE.ShapeGeometry(outline);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
