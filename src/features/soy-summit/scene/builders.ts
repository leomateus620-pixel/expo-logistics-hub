import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Static meshes are merged per material and room, never one draw call per brick. */
export class Architecture {
  private batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  constructor(readonly group = new THREE.Group()) {}
  add(geometry: THREE.BufferGeometry, material: THREE.Material, position: number[], rotation = [0, 0, 0]) {
    if (geometry.index) { const indexed = geometry;geometry = indexed.toNonIndexed();indexed.dispose(); }
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
    geometry.applyMatrix4(transform);
    const tileSize = material.userData.tileSize as number | undefined;
    if (tileSize) {
      const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        if (Math.abs(normals.getY(i)) > .7) uv.setXY(i, x / tileSize, z / tileSize);
        else if (Math.abs(normals.getX(i)) > .7) uv.setXY(i, z / tileSize, y / tileSize);
        else uv.setXY(i, x / tileSize, y / tileSize);
      }
    }
    const list = this.batches.get(material) ?? [];list.push(geometry);this.batches.set(material, list);
  }
  box(size: number[], position: number[], material: THREE.Material, rotation = [0, 0, 0]) {
    this.add(new THREE.BoxGeometry(...size), material, position, rotation);
  }
  cylinder(a: number[], b: number[], radius: number, material: THREE.Material, endRadius = radius, sides = 10) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const geometry = new THREE.CylinderGeometry(endRadius, radius, delta.length(), sides);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    this.add(geometry, material, start.add(end).multiplyScalar(.5).toArray());
  }
  finish() {
    for (const [material, list] of this.batches) {
      const merged = mergeGeometries(list);list.forEach(g => g.dispose());
      if (!merged) throw new Error('Não foi possível preparar a geometria.');
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;mesh.receiveShadow = true;this.group.add(mesh);
    }
    this.batches.clear();return this.group;
  }
}

export function railing(a: Architecture, start: number[], end: number[], material: THREE.Material, height = .95) {
  const from = new THREE.Vector3(...start), to = new THREE.Vector3(...end);
  const count = Math.max(1, Math.ceil(from.distanceTo(to) / 1.8));
  for (let i = 0; i <= count; i++) {
    const p = from.clone().lerp(to, i / count);
    a.cylinder(p.toArray(), p.clone().add(new THREE.Vector3(0, height, 0)).toArray(), .027, material);
    a.cylinder([p.x, p.y + .015, p.z], [p.x, p.y + .045, p.z], .085, material);
  }
  for (const y of [.55, height]) a.cylinder(from.clone().add(new THREE.Vector3(0, y, 0)).toArray(), to.clone().add(new THREE.Vector3(0, y, 0)).toArray(), .032, material);
}

export function ramp(a: Architecture, x: number, startZ: number, endZ: number, width: number, rise: number, material: THREE.Material) {
  const length = Math.hypot(startZ - endZ, rise);
  a.box([width, .1, length], [x, rise / 2 - .05, (startZ + endZ) / 2], material, [Math.atan2(rise, startZ - endZ), 0, 0]);
}

export function label(text: string, width: number, height: number, color = '#193b31', background = '#f2eee2') {
  const canvas = document.createElement('canvas');canvas.width = 1024;canvas.height = Math.round(1024 * height / width);
  const c = canvas.getContext('2d')!;c.fillStyle = background;c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = color;c.textAlign = 'center';c.textBaseline = 'middle';c.font = `600 ${Math.min(canvas.height * .52, 1024 / text.length * 1.55)}px Arial`;
  c.fillText(text, 512, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);texture.colorSpace = THREE.SRGBColorSpace;texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}
