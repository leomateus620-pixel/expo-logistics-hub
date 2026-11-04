import * as THREE from 'three';
import { Architecture } from './builders';
import type { Materials } from './materials';

export function createDoors(m: Materials) {
  const group = new THREE.Group();
  const doors = new Map<string, THREE.Group[]>();
  for (const [name, x, z, width, height, floor] of [
    ['main', -4, 0, 3.6, 2.95, 0], ['left', -9.5, -8, 2.3, 2.6, .35], ['right', 9.5, -8, 2.3, 2.6, .35],
  ] as const) {
    const pair: THREE.Group[] = [];
    const frame = new Architecture(group);
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();pivot.position.set(x + side * width / 2, floor, z);
      const a = new Architecture(pivot);const center = -side * width / 4;
      a.box([width / 2 - .08, height, .065], [center, height / 2, 0], name === 'main' ? m.glass : m.wood);
      for (const yy of [.04, height - .04]) a.box([width / 2, .06, .09], [center, yy, 0], name === 'main' ? m.dark : m.wood);
      for (const xx of [0, -side * (width / 2 - .03)]) a.box([.06, height, .09], [xx, height / 2, 0], name === 'main' ? m.dark : m.wood);
      const handleX = -side * (width / 2 - .17);
      a.cylinder([handleX, .9, .1], [handleX, 1.45, .1], .024, m.metal);
      a.finish();pair.push(pivot);group.add(pivot);
      frame.box([.08, height + .1, .22], [x + side * (width / 2 + .04), floor + height / 2, z], name === 'main' ? m.dark : m.wood);
    }
    frame.box([width + .15, .1, .22], [x, floor + height + .04, z], name === 'main' ? m.dark : m.wood);
    frame.finish();doors.set(name, pair);
  }
  return { group, setOpen(name: string, openness: number) {
    doors.get(name)?.forEach((pivot, i) => { pivot.rotation.y = (i === 0 ? -1 : 1) * openness * Math.PI * .49; });
  } };
}
