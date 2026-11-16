import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '../constants';
import { ETNIAS_SITE_METERS_TO_WORLD, etniasAdjacentSitePointToWorld } from '../data/etniasAdjacentSite';

/** Site metres, interpreted from the tower photograph and the existing map base. */
export const ETNIAS_RBS_TOWER = {
  center: [47.3, 76.8],
  height: 62,
  latticeHeight: 56.7,
  guyAnchors: [[33.1, 81.0], [59.4, 84.9], [48.8, 62.1]],
  measuredHeight: null,
} as const;

const MAST_BASE = 0.48;
const BAY_HEIGHTS = [MAST_BASE, 7.7, 14.7, 21.7, 28.7, 35.7, 42.7, 49.7, ETNIAS_RBS_TOWER.latticeHeight];
const LEG_ANGLES = [-5 * Math.PI / 6, -Math.PI / 6, Math.PI / 2];
const PAINT = ['#984c43', '#deded1'];
const STEEL = '#68716f';
const GALVANIZED = '#a3aaa6';
const CONCRETE = '#b8b4a7';
const UP = new THREE.Vector3(0, 1, 0);
const DISHES = [
  { y: 52.6, radius: 1.46, heading: 0.22, elevation: 0.13 },
  { y: 48.5, radius: 1.18, heading: 0.55, elevation: -0.1 },
  { y: 44.1, radius: 1.57, heading: -0.33, elevation: 0.21 },
];

type Parts = THREE.BufferGeometry[];

function addPart(parts: Parts, geometry: THREE.BufferGeometry, paint: string) {
  geometry.deleteAttribute('uv');
  const color = new THREE.Color(paint);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  parts.push(geometry);
}

function box(parts: Parts, color: string, size: [number, number, number], x: number, y: number, z: number) {
  addPart(parts, new THREE.BoxGeometry(...size).translate(x, y, z), color);
}

function member(parts: Parts, color: string, start: THREE.Vector3, end: THREE.Vector3, radius: number) {
  const direction = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 5, 1, true);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()));
  const center = start.clone().lerp(end, 0.5);
  addPart(parts, geometry.translate(center.x, center.y, center.z), color);
}

function atRadius(radius: number, height: number, heading: number) {
  return new THREE.Vector3(radius * Math.cos(heading), height, radius * Math.sin(heading));
}

function mastRadius(height: number) {
  return THREE.MathUtils.lerp(0.77, 0.49, height / ETNIAS_RBS_TOWER.latticeHeight);
}

function mastCorners(height: number) {
  return LEG_ANGLES.map((angle) => atRadius(mastRadius(height), height, angle));
}

function addLattice(parts: Parts) {
  box(parts, '#a39e91', [2.35, 0.52, 2.35], 0, -0.11, 0);
  box(parts, CONCRETE, [1.86, 0.29, 1.86], 0, 0.29, 0);
  for (const foot of mastCorners(MAST_BASE)) {
    box(parts, STEEL, [0.32, 0.055, 0.32], foot.x, 0.46, foot.z);
  }

  BAY_HEIGHTS.slice(1).forEach((top, index) => {
    const bottom = BAY_HEIGHTS[index];
    const color = PAINT[index % PAINT.length];
    const lower = mastCorners(bottom);
    const upper = mastCorners(top);
    lower.forEach((leg, side) => member(parts, color, leg, upper[side], 0.075));

    // Each painted section contains four triangular bays. The smaller tube on
    // the reverse diagonal is offset along the legs at the joint.
    for (let bay = 0; bay < 4; bay++) {
      const y0 = THREE.MathUtils.lerp(bottom, top, bay / 4);
      const y1 = THREE.MathUtils.lerp(bottom, top, (bay + 1) / 4);
      const from = mastCorners(y0);
      const to = mastCorners(y1);
      from.forEach((leg, side) => {
        const next = (side + 1) % from.length;
        member(parts, color, leg, from[next], 0.045);
        member(parts, color, leg, to[next], 0.040);
        member(parts, color, from[next].clone().lerp(to[next], 0.09), leg.clone().lerp(to[side], 0.91), 0.029);
      });
    }
  });
  const top = mastCorners(ETNIAS_RBS_TOWER.latticeHeight);
  top.forEach((leg, side) => member(parts, STEEL, leg, top[(side + 1) % top.length], 0.05));
}

function addGuys(tower: Parts, details: Parts) {
  const [centerX, centerZ] = ETNIAS_RBS_TOWER.center;
  const levels = [20.1, 35.5, 54.9];
  for (const [x, z] of ETNIAS_RBS_TOWER.guyAnchors) {
    const dx = x - centerX;
    const dz = z - centerZ;
    const heading = Math.atan2(dz, dx);
    box(tower, '#a9a69a', [0.96, 0.39, 0.96], dx, 0.03, dz);
    levels.forEach((height, index) => {
      const reach = index === 0 ? 0.85 : 1.48;
      const bracket = atRadius(reach, height, heading);
      member(tower, STEEL, atRadius(mastRadius(height) / 2, height, heading), bracket, 0.059);
      member(tower, STEEL, atRadius(mastRadius(height) / 2, height - 0.68, heading), bracket, 0.047);

      const offset = (index - 1) * 0.25;
      const eyeX = dx - Math.sin(heading) * offset;
      const eyeZ = dz + Math.cos(heading) * offset;
      const eye = new THREE.Vector3(eyeX, 0.39, eyeZ);
      box(details, STEEL, [0.09, 0.17, 0.09], eyeX, 0.3, eyeZ);
      member(details, '#9da49b', eye, bracket, 0.021);
    });
  }
}

function addReflectors(tower: Parts, details: Parts) {
  for (const { y, radius, heading, elevation } of DISHES) {
    const center = atRadius(radius * 0.58 + 0.67, y, heading);
    const facing = atRadius(Math.cos(elevation), Math.sin(elevation), heading);
    const rotation = new THREE.Quaternion().setFromUnitVectors(UP, facing);
    const point = (x: number, dy: number, z: number) => new THREE.Vector3(x, dy, z).applyQuaternion(rotation).add(center);
    const attach = (geometry: THREE.BufferGeometry, color: string) => {
      geometry.applyQuaternion(rotation).translate(center.x, center.y, center.z);
      addPart(tower, geometry, color);
    };

    // Closed shallow paraboloid with a rolled rim. The back and front profiles
    // are both modeled so the reflector reads from the road and from the field.
    const profile = [[0, -0.045], [0.45, 0.015], [0.75, 0.115], [1, 0.265],
      [1, 0.31], [0.75, 0.157], [0.45, 0.057], [0, 0]];
    attach(new THREE.LatheGeometry(profile.map(([r, t]) => new THREE.Vector2(r * radius, t * radius)), 24), '#aeb4b1');
    attach(new THREE.TorusGeometry(radius, 0.038, 5, 24).rotateX(-Math.PI / 2).translate(0, 0.287 * radius, 0), GALVANIZED);

    const hub = point(0, -0.06, 0);
    member(tower, STEEL, atRadius(mastRadius(y) / 2, y + 0.15, heading), hub, 0.107);
    member(tower, STEEL, atRadius(mastRadius(y) / 2, y - 0.85, heading), hub, 0.066);
    const feed = point(0, 0.71 * radius, 0);
    member(tower, GALVANIZED, feed, point(0, 0.94 * radius, 0), 0.087);
    for (let spoke = 0; spoke < 6; spoke++) {
      const angle = spoke * Math.PI / 3;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      const middle = point(x * radius * 0.63, radius * 0.03, z * radius * 0.63);
      member(details, STEEL, hub, middle, 0.034);
      member(details, STEEL, middle, point(x * radius, 0.252 * radius, z * radius), 0.034);
      if (spoke % 2 === 0) member(details, GALVANIZED, point(x * radius, 0.32 * radius, z * radius), feed, 0.032);
    }
  }
}

function addAntennaDetails(tower: Parts, details: Parts) {
  const { height, latticeHeight } = ETNIAS_RBS_TOWER;
  member(tower, STEEL, new THREE.Vector3(0, latticeHeight - 0.4, 0), new THREE.Vector3(0, height - 2.7, 0), 0.089);
  member(tower, GALVANIZED, new THREE.Vector3(0, height - 2.7, 0), new THREE.Vector3(0, height, 0), 0.055);
  const ring = new THREE.TorusGeometry(0.62, 0.055, 5, 18);
  ring.rotateY(0.35).translate(0, height - 0.68, 0);
  addPart(tower, ring, GALVANIZED);

  // Side-mounted antenna array on the lower half of the structure.
  const heading = 0.98;
  member(tower, STEEL, atRadius(2, 22.6, heading), atRadius(2, 27.6, heading), 0.056);
  for (const y of [22.8, 25.1, 27.4]) {
    member(tower, STEEL, atRadius(mastRadius(y) / 2, y, heading), atRadius(2.32, y, heading), 0.045);
    member(details, GALVANIZED, atRadius(2, y - 0.21, heading), atRadius(2, y + 0.21, heading), 0.052);
    member(details, GALVANIZED, atRadius(2.32, y - 0.14, heading), atRadius(2.32, y + 0.14, heading), 0.033);
  }

  const ladderZ = (y: number) => -mastRadius(y) / 2 - 0.11;
  for (const x of [-0.18, 0.18]) {
    member(details, STEEL, new THREE.Vector3(x, 1.3, ladderZ(1.3)),
      new THREE.Vector3(x, latticeHeight - 0.6, ladderZ(latticeHeight - 0.6)), 0.025);
  }
  for (let y = 1.35; y < latticeHeight - 0.6; y += 0.42) {
    const z = ladderZ(y);
    member(details, GALVANIZED, new THREE.Vector3(-0.18, y, z), new THREE.Vector3(0.18, y, z), 0.02);
  }
}

export function buildEtniasRbsTowerGeometry() {
  const tower: Parts = [];
  const towerDetails: Parts = [];
  addLattice(tower);
  addGuys(tower, towerDetails);
  addReflectors(tower, towerDetails);
  addAntennaDetails(tower, towerDetails);

  const [x, z] = etniasAdjacentSitePointToWorld(ETNIAS_RBS_TOWER.center);
  const toWorld = (parts: Parts, name: string) => {
    const merged = mergeGeometries(parts)!;
    parts.forEach((geometry) => geometry.dispose());
    merged.name = name;
    merged.scale(ETNIAS_SITE_METERS_TO_WORLD, ETNIAS_SITE_METERS_TO_WORLD, ETNIAS_SITE_METERS_TO_WORLD);
    merged.translate(x, COMMERCIAL_MAP_GROUND_ELEVATION, z);
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  };
  return {
    tower: toWorld(tower, 'rbs-tower'),
    towerDetails: toWorld(towerDetails, 'rbs-tower-details'),
  };
}
