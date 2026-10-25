import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EXPORURAL_SCENE_CORRECTIONS } from '../../data/exporuralSceneCorrections';

const NO_RAYCAST = () => undefined;
type Materials = Record<'concrete' | 'base' | 'metal' | 'dark', THREE.MeshStandardMaterial>;
type Bucket = keyof Materials;
const Y = new THREE.Vector3(0, 1, 0);

/** Four static merged batches. The electrical layer owns shared materials;
 * this component owns/disposes only its geometries. No animation or raycast. */
function buildAssemblyGeometry(reduced: boolean) {
  const parts: Record<Bucket, THREE.BufferGeometry[]> = { concrete: [], base: [], metal: [], dark: [] };
  const add = (bucket: Bucket, geometry: THREE.BufferGeometry, x: number, y: number, z: number) => {
    geometry.translate(x, y, z); parts[bucket].push(geometry);
  };
  const box = (bucket: Bucket, x: number, y: number, z: number, w: number, h: number, d: number) =>
    add(bucket, new THREE.BoxGeometry(w, h, d), x, y, z);
  const bar = (bucket: Bucket, a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
    const g = new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), reduced ? 5 : 8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, b.clone().sub(a).normalize()));
    const middle = a.clone().add(b).multiplyScalar(.5); add(bucket, g, middle.x, middle.y, middle.z);
  };
  const tube = (bucket: Bucket, points: number[][], radius: number) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p as [number, number, number])));
    add(bucket, new THREE.TubeGeometry(curve, reduced ? 8 : 20, radius, reduced ? 4 : 6, false), 0, 0, 0);
  };
  for (const [x, z, height] of [[-.2, 0, 1.68], [.2, 0, 1.68], [0, .105, .84]]) {
    // Rectangular concrete mast, tapered toward the top, with recessed slots.
    const shaft = new THREE.BoxGeometry(.072, height, .076);
    const pos = shaft.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const taper = pos.getY(i) > 0 ? .78 : 1;
      pos.setX(i, pos.getX(i) * taper); pos.setZ(i, pos.getZ(i) * taper);
    }
    add('concrete', shaft, x, height / 2, z);
    box('base', x, .13, z, .073, .26, .077);
    box('dark', x, .48, z + .0382, .039, .27, .001);
    box('concrete', x, .48, z + .039, .022, .23, .0015);
    if (!reduced) for (let y = .69; y < height - .04; y += .055) {
      const hole = new THREE.CircleGeometry(.005, 7);
      add('dark', hole, x, y, z + .0385 * (1 - y / height * .18));
    }
  }
  // Steel platform, parallel rails, and three triangular support brackets.
  box('metal', 0, .82, .025, .66, .032, .29);
  for (const z of [-.09, .13]) box('dark', 0, .803, z, .69, .018, .024);
  for (const x of [-.2, 0, .2]) {
    bar('metal', new THREE.Vector3(x, .57, .015), new THREE.Vector3(x, .805, .15), .012);
    bar('metal', new THREE.Vector3(x, .57, .015), new THREE.Vector3(x, .805, -.105), .012);
    box('metal', x, .575, .012, .09, .025, .1);
  }
  // The compact tank stays between the tall masts, with a visible fin bank.
  box('metal', 0, 1.025, .005, .265, .34, .205);
  box('metal', 0, 1.203, .005, .283, .022, .222);
  for (const x of [-.09, .09]) box('dark', x, .852, .005, .035, .045, .19);
  for (let x = -.112; x < .12; x += reduced ? .028 : .018) {
    tube('metal', [[x, .89, .099], [x, .92, .142], [x, 1.14, .142], [x, 1.18, .099]], .007);
  }
  // Three porcelain bushings on the tank and three conductors at each mast.
  const insulator = (x: number, y: number, z: number, height: number) => {
    add('dark', new THREE.CylinderGeometry(.009, .011, height, 8), x, y + height / 2, z);
    for (let n = 0; n < 5; n++) add('dark', new THREE.CylinderGeometry(.019, .012, .009, 10), x, y + n * height / 5, z);
  };
  for (const x of [-.09, 0, .09]) {
    insulator(x, 1.219, .004, .11);
    tube('dark', [[x, 1.33, .004], [x, 1.41, -.015], [x, 1.51, -.08], [x < 0 ? -.2 : .2, 1.60, -.15]], .003);
  }
  for (const x of [-.2, .2]) {
    box('metal', x, 1.54, 0, .035, .027, .42);
    for (const z of [-.15, 0, .15]) insulator(x, 1.552, z, .048);
  }
  box('metal', 0, 1.48, -.016, .43, .03, .045);
  // Curved street-light arm, kept inside the recorded plan envelope.
  tube('metal', [[.2, 1.25, .025], [.24, 1.40, .10], [.29, 1.49, .19], [.31, 1.50, .23]], .009);
  box('base', .31, 1.495, .24, .055, .015, .105);
  box('dark', .31, 1.485, .24, .043, .004, .085);

  return Object.fromEntries(Object.entries(parts).map(([key, geometries]) => {
    const merged = mergeGeometries(geometries, false)!;
    geometries.forEach(g => g.dispose()); merged.computeBoundingSphere();
    return [key, merged];
  })) as Record<Bucket, THREE.BufferGeometry>;
}

export const ExporuralTransformerAssembly = memo(function ExporuralTransformerAssembly({
  groundElevation, materials, reducedGraphics, castShadow,
}: { groundElevation: number; materials: Materials; reducedGraphics: boolean; castShadow: boolean }) {
  const geometries = useMemo(() => buildAssemblyGeometry(reducedGraphics), [reducedGraphics]);
  useEffect(() => () => Object.values(geometries).forEach(geometry => geometry.dispose()), [geometries]);
  const { position, id } = EXPORURAL_SCENE_CORRECTIONS.transformer;
  return <group name={id} position={[position[0], groundElevation, position[1]]} dispose={null}>
    {(Object.keys(geometries) as Bucket[]).map(key => <mesh key={key} name={`${id}-${key}`}
      geometry={geometries[key]} material={materials[key]} castShadow={castShadow} receiveShadow
      raycast={NO_RAYCAST} />)}
  </group>;
});
