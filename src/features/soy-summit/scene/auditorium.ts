import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Architecture, label, railing } from './builders';
import type { Materials } from './materials';

export function createAuditorium(m: Materials) {
  const a = new Architecture();a.group.name = 'Auditório';
  a.box([24, .18, 27], [0, -.1, -21.5], m.wood);
  a.box([24, .35, 3], [0, .175, -9.45], m.wood);
  a.box([24.3, 7.8, .4], [0, 3.9, -35], m.cream);
  for (let row = 0; row < 13; row++) {
    const z = -11.4 - row * 1.15, level = Math.max(0, .35 - row * .027);
    a.box([24, level + .06, 1.15], [0, level / 2 - .03, z], m.wood);
    if (row % 4 === 0) for (const x of [-9.5, 0, 9.5]) a.box([x ? 2 : 2.2, .012, .055], [x, level + .007, z - .55], m.yellow);
  }
  for (const side of [-1, 1]) {
    a.box([.3, 7.8, 27], [side * 12.15, 3.9, -21.5], m.cream);
    a.box([.045, 2.35, 26.8], [side * 11.97, 1.18, -21.5], m.wood);
    a.box([.06, .05, 26.7], [side * 11.92, 2.37, -21.5], m.terracotta);
    for (let z = -11; z > -30; z -= 5) {
      a.box([.28, .6, .42], [side * 11.7, 3.3, z], m.dark);
      a.box([.42, .45, 1.3], [side * 11.65, 5.4, z - 1.5], m.cream);
    }
    railing(a, [side * 8.05, .35, -10.9], [side * 8.05, .03, -24.9], m.dark, .85);
    for (let i = 0; i < 4; i++) a.box([1.25, .16 * (i + 1), .36], [side * 9.2, .08 * (i + 1), -28.5 - i * .36], m.wood);
    railing(a, [side * 10, 0, -27.9], [side * 10, .65, -30], m.dark);
  }
  // Warm ceiling and practical fixtures; just two shadowless fill lights.
  a.box([24.2, .2, 27.3], [0, 7.8, -21.5], m.terracotta);
  for (const x of [-8, 0, 8]) for (let z = -11; z > -30; z -= 4) {
    a.cylinder([x, 7.67, z], [x, 7.72, z], .18, m.light, .18, 16);
  }
  for (const z of [-15, -24]) { const light = new THREE.PointLight('#ffdea9', 80, 30, 2);light.position.set(0, 6.6, z);a.group.add(light); }
  // Stage, proscenium and separate black backdrop retain architectural depth.
  a.box([21, .65, 5.8], [0, .325, -31.9], m.wood);
  a.box([19.7, 6.8, .24], [0, 4.05, -34.6], m.black);
  for (const x of [-10.5, 10.5]) a.box([1.25, 7.6, 2.4], [x, 3.8, -32.2], m.cream);
  a.box([21.8, .6, 1.8], [0, 7.05, -32], m.cream);
  for (const x of [-9.4, 9.4]) a.box([1.25, 6, 1.3], [x, 3.7, -33.6], m.black);
  for (let x = -9; x < 10; x += 1.5) a.box([.18, 5.9, .35], [x, 3.7, -34.25], m.black);
  a.cylinder([-9.7, 6.6, -32.8], [9.7, 6.6, -32.8], .065, m.dark);
  for (let x = -8; x <= 8; x += 4) a.box([.32, .3, .6], [x, 6.4, -32.8], m.dark);
  a.finish();
  const rear = new Architecture(a.group);
  rear.box([16.5, 7.8, .22], [0, 3.9, -8.13], m.wood);
  for (const x of [-9.5, 9.5]) {
    rear.box([2.4, 4.7, .22], [x, 5.5, -8.13], m.cream);
    const exit = label('SAÍDA · HALL', 1.2, .22, '#f6f1df', '#176246');exit.rotation.y = Math.PI;exit.position.set(x, 3.3, -8.27);a.group.add(exit);
  }
  for (const x of [-11.5, 11.5]) rear.box([1, 7.8, .22], [x, 3.9, -8.13], m.wood);
  rear.finish();

  // Explicitly illustrative inventory, NOT an official capacity or seat plan.
  const positions: THREE.Vector3[] = [];
  for (let row = 0; row < 12; row++) for (const side of [-1, 1]) for (let seat = 0; seat < 9; seat++) positions.push(new THREE.Vector3(side * (1.75 + seat * .66), .35 - row * .027, -12 - row * 1.15));
  const unit = new THREE.Object3D();
  const parts = [
    // Two bevel subdivisions retain the rounded silhouette at aisle distances;
    // extra hidden bevel faces on 216 chairs previously dominated the stage cost.
    { geometry: new RoundedBoxGeometry(.55, .72, .13, 2, .07), offset: [0, .79, .12], material: m.seat, rotation: -.11 },
    { geometry: new RoundedBoxGeometry(.54, .14, .5, 1, .055), offset: [0, .43, -.09], material: m.seat, rotation: 0 },
    { geometry: new THREE.BoxGeometry(.08, .46, .08), offset: [0, .23, .1], material: m.dark, rotation: 0 },
    { geometry: new THREE.BoxGeometry(.45, .06, .35), offset: [0, .045, .08], material: m.dark, rotation: 0 },
    ...[-.305, .305].map(x => ({ geometry: new RoundedBoxGeometry(.065, .08, .47, 1, .025), offset: [x, .66, -.04], material: m.dark, rotation: 0 })),
  ];
  for (const part of parts) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, positions.length);
    positions.forEach((p, i) => {
      unit.position.copy(p).add(new THREE.Vector3(...part.offset));unit.rotation.set(part.rotation, 0, 0);unit.updateMatrix();mesh.setMatrixAt(i, unit.matrix);
    });
    mesh.castShadow = true;mesh.receiveShadow = true;mesh.instanceMatrix.needsUpdate = true;mesh.computeBoundingSphere();a.group.add(mesh);
  }
  return a.group;
}
