import * as THREE from 'three';
import { Architecture, label, railing, ramp } from './builders';
import type { Materials } from './materials';

export function createHall(m: Materials) {
  const a = new Architecture();a.group.name = 'Hall';
  a.box([24, .14, 8], [0, -.075, -4], m.floor);
  a.box([.25, 3.8, 8], [-12.1, 1.9, -4], m.white);
  a.box([.25, 3.8, 8], [12.1, 1.9, -4], m.white);
  a.box([16.5, 3.8, .3], [0, 1.9, -8], m.white);
  for (const sign of [-1, 1]) {
    a.box([1.25, 3.8, .3], [sign * 11.45, 1.9, -8], m.white);
    a.box([2.4, .65, .3], [sign * 9.5, 3.475, -8], m.white);
    ramp(a, sign * 9.5, -3, -7, 2.4, .35, m.floor);
    a.box([2.4, .35, 1], [sign * 9.5, .175, -7.5], m.floor);
    for (const side of [-1, 1]) {
      const x = sign * 9.5 + side * 1.2;
      railing(a, [x, .07, -3.8], [x, .35, -7.7], m.metal);
      a.box([.45, 3.5, .45], [sign * 9.5 + side * 1.5, 1.75, -7.6], m.wood);
    }
    const signLabel = label(`AUDITÓRIO · ${sign < 0 ? 'ESQUERDA' : 'DIREITA'}`, 1.8, .23);
    signLabel.position.set(sign * 9.5, 3.1, -7.81);a.group.add(signLabel);
    a.box([2.35, .012, .32], [sign * 9.5, .36, -7.15], m.metal);
  }
  for (const offset of [-.07, 0, .07]) {
    a.box([.023, .007, 2.8], [-4 + offset, .006, -1.4], m.metal);
    a.box([18.9, .007, .023], [0, .006, -3 + offset], m.metal);
    for (const x of [-9.5, 9.5]) a.box([.023, .007, 4.02], [x + offset, .18, -5], m.metal, [Math.atan(.35 / 4), 0, 0]);
  }
  for (const x of [-9.5, -4, 9.5]) for (let row = 0; row < 5; row++) for (let column = 0; column < 5; column++) {
    a.cylinder([x - .16 + column * .08, .003, -3.16 + row * .08], [x - .16 + column * .08, .008, -3.16 + row * .08], .013, m.metal, .012, 6);
  }
  // Modular ceiling, recessed perimeter cove and warm practical lamps.
  a.box([24.3, .13, 8.25], [0, 3.85, -4], m.cream);
  for (let x = -12; x <= 12; x += 1.2) a.box([.018, .015, 7.8], [x, 3.773, -4], m.metal);
  for (let z = -7.9; z < 0; z += 1.2) a.box([24, .015, .018], [0, 3.773, z], m.metal);
  for (const z of [-.7, -7.2]) {
    a.box([23.8, .3, .52], [0, 3.48, z], m.white);
    a.box([23.6, .035, .07], [0, 3.66, z + (z < -4 ? .28 : -.28)], m.light);
  }
  for (let x = -10; x <= 10; x += 2.5) for (const z of [-1.2, -6.8]) {
    a.cylinder([x, 3.68, z], [x, 3.74, z], .09, m.metal, .09, 14);
    a.cylinder([x, 3.67, z], [x, 3.68, z], .065, m.light, .065, 14);
  }
  for (const x of [-7, 0, 7]) {
    const light = new THREE.PointLight('#ffdeb0', 18, 12, 2);light.position.set(x, 3.35, -4.8);a.group.add(light);
  }
  // Other observed doors remain closed; they are not extra audience entrances.
  a.box([.09, 2.4, 1.6], [11.94, 1.2, -1.9], m.wood);
  a.cylinder([11.85, 1, -1.5], [11.85, 1.35, -1.5], .022, m.metal);
  const service = label('ACESSO RESTRITO', 1.3, .19);service.rotation.y = -Math.PI / 2;service.position.set(11.87, 2.55, -1.9);a.group.add(service);
  const welcome = label('SOY SUMMIT 2027', 2.2, .35);welcome.position.set(1, 2, -7.82);a.group.add(welcome);
  a.finish();return a.group;
}
