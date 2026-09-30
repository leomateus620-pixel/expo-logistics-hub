import * as THREE from 'three';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapEntity } from '../types';
import { COMMERCIAL_MAP_TREES, type CommercialMapTree } from '../data/commercialTrees';
import { GATE_NINE_COMMUNICATION_TOWER as spec } from '../data/gateNineCommunicationTower';
import { gateNineLightningPaths } from './gateNineLightning';

export interface GateNineCommunicationTowerPlan {
  ownerEntityId: string;
  position: readonly [number, number, number];
  footprint: readonly (readonly [number, number])[];
  maxHeight: number;
}
export function buildGateNineCommunicationTowerPlan(
  entities: readonly MapEntity[], trees: readonly Pick<CommercialMapTree, 'position' | 'trunkRadius' | 'isVisible'>[] = COMMERCIAL_MAP_TREES,
): GateNineCommunicationTowerPlan | null {
  const reservoir = entities.find(e => !e.isArchived && e.publicIdentifier === spec.ownerIdentifier);
  const ring = reservoir?.geometry.coordinates[0];
  if (!reservoir || !ring || ring.length < 3 || !ring.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))) return null;
  const minX = Math.min(...ring.map(p => p[0])), centerZ = (Math.min(...ring.map(p => p[1])) + Math.max(...ring.map(p => p[1]))) / 2;
  const obstacles = entities.filter(e => !e.isArchived && ['SELLABLE_LOT', 'INTERNAL_STAND', 'ROAD', 'PEDESTRIAN_PATH',
    'PAVILION', 'BUILDING', 'RESTAURANT', 'RESTROOM', 'SERVICE', 'EVENT_VENUE'].includes(e.classification));
  const half = spec.baseWidth / 2 + spec.foundationPadWidth / 2 + .035;
  for (const [west, south] of [[.72, 1.45], [1.12, 1.55], [.72, 2.05], [1.32, 2.15], [1.62, 1.35], [1.72, 2.45], [1.12, 2.75], [2.02, 2.55]]) {
    const x = minX - west, z = centerZ + south;
    const footprint: [number, number][] = [[x - half, z - half], [x + half, z - half], [x + half, z + half], [x - half, z + half], [x - half, z - half]];
    if (trees.some(tree => tree.isVisible && Math.hypot(Math.max(0, Math.abs(tree.position[0] - x) - half),
      Math.max(0, Math.abs(tree.position[1] - z) - half)) <= tree.trunkRadius + .025)) continue;
    const target: MultiPolygon = [[footprint]];
    if (obstacles.some(e => {
      const points = e.geometry.coordinates[0];
      if (!points?.length || Math.min(...points.map(p => p[0])) > x + half || Math.max(...points.map(p => p[0])) < x - half
        || Math.min(...points.map(p => p[1])) > z + half || Math.max(...points.map(p => p[1])) < z - half) return false;
      return polygonClipping.intersection(target, [e.geometry.coordinates]).length > 0;
    })) continue;
    return { ownerEntityId: reservoir.id, position: [x, spec.groundElevation, z], footprint, maxHeight: spec.groundElevation + spec.height };
  }
  return null;
}

type MaterialKey = 'steel' | 'concrete' | 'antenna';
export interface TowerPart { key: MaterialKey; geometry: THREE.BufferGeometry }
/** Steel members are merged by material. Antennas and dimensions are interpreted details. */
export function buildGateNineCommunicationTowerGeometry(): TowerPart[] {
  const buckets: Record<MaterialKey, THREE.BufferGeometry[]> = { steel: [], concrete: [], antenna: [] };
  const add = (key: MaterialKey, geometry: THREE.BufferGeometry) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.clearGroups(); buckets[key].push(flat);
  };
  const box = (key: MaterialKey, size: readonly [number, number, number], position: readonly [number, number, number]) =>
    add(key, new THREE.BoxGeometry(...size).translate(...position));
  const beam = (a: readonly [number, number, number], b: readonly [number, number, number], radius = .012) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
    const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 6);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    const center = start.add(end).multiplyScalar(.5);
    geometry.translate(center.x, center.y, center.z); add('steel', geometry);
  };
  const corners = (y: number) => {
    const half = (spec.baseWidth + (spec.topWidth - spec.baseWidth) * y / spec.latticeHeight) / 2;
    return [[-half, y, -half], [half, y, -half], [half, y, half], [-half, y, half]] as const;
  };
  const bottom = corners(.07), top = corners(spec.latticeHeight);
  for (let i = 0; i < 4; i++) {
    beam(bottom[i], top[i], .022);
    // Embed each pedestal below the external authored floor (-.08), while
    // retaining its upper bearing face and plate height next to the tanks.
    box('concrete', [spec.foundationPadWidth, spec.foundationPadHeight, spec.foundationPadWidth],
      [bottom[i][0], spec.foundationPadTop - spec.foundationPadHeight / 2, bottom[i][2]]);
    box('steel', [.095, .012, .095], [bottom[i][0], .07, bottom[i][2]]);
    for (const dx of [-.031, .031]) for (const dz of [-.031, .031]) beam(
      [bottom[i][0] + dx, .07, bottom[i][2] + dz], [bottom[i][0] + dx, .094, bottom[i][2] + dz], .007,
    );
  }
  for (let level = 0; level < spec.latticeLevels; level++) {
    const a = corners(.07 + (spec.latticeHeight - .07) * level / spec.latticeLevels);
    const b = corners(.07 + (spec.latticeHeight - .07) * (level + 1) / spec.latticeLevels);
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      beam(a[side], a[next], .012);
      beam(a[side], b[next], .011); beam(a[next], b[side], .011);
    }
  }
  for (let side = 0; side < 4; side++) beam(top[side], top[(side + 1) % 4], .012);
  // Ladder follows the taper with a narrow safety cage above the climb guard.
  const faceZ = (y: number) => -(spec.baseWidth + (spec.topWidth - spec.baseWidth) * y / spec.latticeHeight) / 2;
  for (let y = .2; y < spec.latticeHeight - .35; y += .05) {
    const z = faceZ(y) - .045;
    beam([-.031, y, z], [.031, y, z], .005);
  }
  for (const x of [-.035, .035]) beam([x, .15, faceZ(.15) - .045],
    [x, spec.latticeHeight - .28, faceZ(spec.latticeHeight - .28) - .045], .006);
  for (let y = 2.15; y < 7.45; y += .18) {
    const z = faceZ(y) - .079;
    const hoop = new THREE.TorusGeometry(.057, .004, 4, 12, Math.PI * 1.35);
    hoop.rotateX(Math.PI / 2); hoop.translate(0, y, z); add('steel', hoop);
  }
  for (const angle of [Math.PI * .25, Math.PI * .8, Math.PI * 1.25]) {
    const x = Math.cos(angle) * .057, dz = Math.sin(angle) * .057;
    beam([x, 2.15, faceZ(2.15) - .079 + dz], [x, 7.37, faceZ(7.37) - .079 + dz], .004);
  }
  for (const y of [6.55, 7.22]) for (let side = 0; side < 3; side++) {
    const angle = side * Math.PI * 2 / 3, x = Math.cos(angle) * .25, z = Math.sin(angle) * .25;
    beam([0, y, 0], [x, y, z], .012);
    const antenna = new THREE.BoxGeometry(.075, .42, .07);
    antenna.rotateY(-angle); antenna.translate(x, y + .1, z); add('antenna', antenna);
  }
  for (const [y, angle] of [[5.55, .35], [6.07, 2.55]]) {
    const dish = new THREE.SphereGeometry(.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    dish.scale(1, .3, 1); dish.rotateX(Math.PI / 2); dish.rotateY(angle);
    dish.translate(Math.sin(angle) * .29, y, Math.cos(angle) * .29); add('antenna', dish);
    beam([0, y, 0], [Math.sin(angle) * .26, y, Math.cos(angle) * .26], .013);
  }
  // Keep the terminal legible at overview distance so the cloud channel reads
  // as connected to the mast instead of ending above a subpixel steel member.
  beam([0, spec.latticeHeight, 0], [0, spec.height, 0], .022);
  return (Object.keys(buckets) as MaterialKey[]).map(key => {
    const geometry = mergeGeometries(buckets[key])!;
    buckets[key].forEach(part => part.dispose()); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return { key, geometry };
  });
}

export function buildGateNineLightningGeometry() {
  const paths = gateNineLightningPaths(spec.height);
  return [.011, .035, .11].map((radius, layer) => {
    const pieces = paths.map((points, index) => {
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 1; i < points.length; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(...points[i - 1]), new THREE.Vector3(...points[i])));
      const geometry = new THREE.TubeGeometry(path, index ? 20 : 100, radius * (index ? .47 : 1), layer === 0 ? 5 : 6, false);
      const flat = geometry.toNonIndexed(); geometry.dispose(); return flat;
    });
    const geometry = mergeGeometries(pieces)!;
    pieces.forEach(piece => piece.dispose()); geometry.computeBoundingSphere(); return geometry;
  });
}
