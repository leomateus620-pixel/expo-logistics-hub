import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Architecture, label } from './builders';
import { seededRandom, type Materials } from './materials';
import { VENUE } from '../venue-layout';

function ribbonWindow(a: Architecture, m: Materials, x: number, y: number, z: number, width: number, columns: number, side = false) {
  const local = new THREE.Group();
  const b = new Architecture(local);
  b.box([width + .18, .92, .23], [0, 0, 0], m.dark);
  b.box([width, .72, .04], [0, 0, .14], m.window);
  for (const yy of [-.4, 0, .4]) b.box([width + .12, .045, .17], [0, yy, .2], m.cream);
  for (let i = 0; i <= columns; i++) b.box([.045, .84, .16], [-width / 2 + width * i / columns, 0, .2], m.cream);
  b.finish();local.position.set(x, y, z);local.rotation.y = side ? Math.PI / 2 : 0;a.group.add(local);
}

export function createExterior(m: Materials) {
  const a = new Architecture();a.group.name = 'Exterior';
  // One front road and one left road receding alongside the venue. No geographic labels.
  a.box([125, .2, 125], [0, -.28, -15], m.green);
  a.box([110, .18, 10], [0, -.12, 19], m.asphalt);
  a.box([110, .18, 5], [0, -.09, 26.5], m.pavers);
  a.box([110, .2, .25], [0, -.03, 24.05], m.cream);
  a.box([9, .18, 70], [-25, -.12, -21], m.asphalt);
  a.box([48, .18, 15], [2, -.09, 6.5], m.pavers);
  a.box([5, .18, 54], [-18, -.09, -20], m.pavers);
  a.box([4.5, .16, 45], [20, -.08, -18], m.pavers);
  for (let x = -20; x < 28; x += 2) a.box([1.98, .2, .28], [x, -.03, 14.05], x % 8 === 0 ? m.blue : m.yellow);
  a.box([.25, .2, 50], [-20.55, -.03, -11], m.yellow);
  for (let x = -20; x < 26; x += 9) a.box([3, .012, .12], [x, -.015, 23], m.cream);
  for (let i = 0; i < 7; i++) a.box([.65, .012, 4.4], [-6.4 + i * 1.08, -.012, 17.1], m.cream);
  // Tactile strips are shallow, continuous and never camera-blocking geometry.
  a.box([42, .012, .36], [1, .016, 11.4], m.yellow);
  a.box([.36, .012, 11], [-4, .016, 5.5], m.yellow);
  a.box([.36, .012, 45], [-18, .016, -9], m.yellow);
  for (let i = 0; i < 4; i++) a.box([4, .013, .08], [22, .01, 7 + i * 1.8], m.cream);

  const silhouette = new THREE.Shape();silhouette.moveTo(-15, 4);silhouette.lineTo(-15, 12.5);
  silhouette.lineTo(-6, 10.8);silhouette.lineTo(-6, 4);silhouette.closePath();
  a.add(new THREE.ExtrudeGeometry(silhouette, { depth: 7.6, bevelEnabled: false, steps: 1 }), m.white, [0, 0, -7.6]);
  // Two adjacent front-facing planes: the mural volume advances in front of
  // the lower six-window wing. The six windows do NOT turn onto the long side.
  // Interpretation corrected by the requester, 03 Nov 2026 (23:07 reference).
  const corner = VENUE.facadeCornerX;
  a.box([corner + 6, 7, 3], [(corner - 6) / 2, 7.5, -1.5], m.white);
  a.box([.32, 4, 3.2], [corner - .16, 2, -1.5], m.white);
  a.box([.32, VENUE.sideWingRoof, 31], [corner - .16, VENUE.sideWingRoof / 2, -18.5], m.white);
  a.box([24, .3, 31], [0, VENUE.sideWingRoof - .15, -18.5], m.white);
  const wingCenter = corner + VENUE.frontWingWidth / 2;
  const wingFront = -VENUE.frontWingSetback;
  const wingBack = wingFront - VENUE.frontWingDepth;
  a.box([VENUE.frontWingWidth, VENUE.sideWingRoof, .32], [wingCenter, VENUE.sideWingRoof / 2, wingFront - .16], m.white);
  a.box([.32, VENUE.sideWingRoof, VENUE.frontWingDepth], [corner + VENUE.frontWingWidth - .16, VENUE.sideWingRoof / 2, (wingFront + wingBack) / 2], m.white);
  a.box([VENUE.frontWingWidth, VENUE.sideWingRoof, .32], [wingCenter, VENUE.sideWingRoof / 2, wingBack + .16], m.white);
  a.box([VENUE.frontWingWidth, .25, VENUE.frontWingDepth], [wingCenter, VENUE.sideWingRoof - .125, (wingFront + wingBack) / 2], m.white);
  a.box([corner + 15, .72, .36], [(corner - 15) / 2, 3.7, 0], m.white);
  // Front walls below the canopy, leaving the actual glass door opening.
  a.box([9.15, 3.35, .36], [-10.425, 1.675, 0], m.white);
  a.box([corner + 2.15, 3.35, .36], [(corner - 2.15) / 2, 1.675, 0], m.white);
  a.box([3.7, .38, .36], [-4, 3.2, 0], m.white);
  const canopyWidth = VENUE.canopyEndX + 15, canopyCenter = (VENUE.canopyEndX - 15) / 2;
  a.box([canopyWidth, .26, 2.3], [canopyCenter, 3.52, .8], m.white);
  a.box([canopyWidth - .2, .045, 2.15], [canopyCenter, 3.365, .8], m.cream);
  a.box([canopyWidth, .065, .08], [canopyCenter, 3.66, 1.94], m.metal);
  for (let i = 0; i < 6; i++) {
    const x = -13.5 + i * 3.3;
    a.cylinder([x, 3.65, 1.75], [x, 3.86, 2.03], .03, m.metal);
    a.box([.19, .12, .22], [x, 3.85, 2.05], m.metal, [.45, 0, 0]);
    a.box([.3, .035, .3], [x, 3.34, .8], m.light);
  }
  ribbonWindow(a, m, 4.2, 5.3, .01, 4.3, 7);ribbonWindow(a, m, 4.2, 9, .01, 4.3, 7);
  for (const x of [corner + 1.9, corner + 5.9]) for (const y of [1.3, 4.6, 7.7]) ribbonWindow(a, m, x, y, wingFront + .01, 3.25, 6);
  // Observable services, restrained in scale.
  a.box([.85, .62, .4], [.9, 8.2, .25], m.cream);
  a.cylinder([.9, 8.2, .46], [.9, 8.2, .49], .22, m.metal, .22, 24);
  a.cylinder([.55, 7.9, .3], [.55, 7.4, .3], .024, m.cream);
  // Exhibition cabinets: depth and mullions, abstract art without unreadable invented copy.
  a.box([5.8, 1, .55], [-10, .5, .5], m.cream);
  for (let i = 0; i < 6; i++) {
    const x = -12.4 + i * .96;
    a.box([.84, .77, .035], [x, .54, .8], m.glass);
    a.box([.04, .96, .57], [x + .45, .5, .52], m.white);
    a.box([.44, .54, .035], [x, .47, .65], i % 2 ? m.terracotta : m.yellow, [0, 0, .08]);
  }
  for (let i = 0; i < 4; i++) {
    a.box([1.05, 1.35, .09], [-12 + i * 1.35, 2.15, .29], m.dark);
    a.box([.87, 1.17, .025], [-12 + i * 1.35, 2.15, .35], [m.terracotta, m.window, m.yellow, m.green][i]);
    a.cylinder([-12.1 + i * 1.35, 1.78, .38], [-11.78 + i * 1.35, 2.48, .38], .05, m.yellow);
  }
  // Raised lateral planter with layered concrete benches.
  for (const [width, y, depth] of [[7, .16, 6], [6.6, .39, 5.6], [6.2, .6, 5.2]]) a.box([width, .2, depth], [19.5, y, 2], m.white);
  a.box([5.8, .1, 4.8], [19.5, .72, 2], m.green);
  for (const x of [-14, -6.6]) {
    a.box([.8, .65, .8], [x, .32, .95], m.green);
    for (let i = 0; i < 11; i++) a.cylinder([x, .65, .95], [x + Math.sin(i) * .7, 1.6 + (i % 3) * .1, .95 + Math.cos(i) * .6], .035, m.green, .005);
  }
  // Background mass is set back 18 m from the frontage, not attached to it.
  a.box([16, 22, 12], [25, 11, -24], m.white);
  for (const x of [18.1, 25, 31.9]) a.box([1.1, 22.2, 12.1], [x, 11.1, -24], m.terracotta);
  for (let floor = 0; floor < 7; floor++) for (let column = 0; column < 6; column++) {
    const x = 19.3 + column * 2.2, y = 2 + floor * 2.85;
    a.box([1.15, 1.35, .13], [x, y, -17.93], m.window);
    a.box([.55, .45, .32], [x + .56, y + .65, -17.8], m.cream);
  }
  a.box([16, 1.7, .2], [25, .85, -12], m.white);
  // Simple distant urban closure on the receding street, no undocumented visitable spaces.
  for (let i = 0; i < 6; i++) {
    a.box([7, 3 + i % 2, 7], [-35, (3 + i % 2) / 2, -4 - i * 10], i % 2 ? m.cream : m.terracotta);
    a.box([2, 1.4, .08], [-34, 1.7, -.45 - i * 10], m.window);
  }
  a.finish();
  const title = label('CENTRO CÍVICO CULTURAL ANTÔNIO CARLOS BORGES', 5.5, .26);
  title.position.set(3.1, 3.05, .205);a.group.add(title);
  const entranceTitle = label('ENTRADA PRINCIPAL', 2.5, .22);entranceTitle.position.set(-4, 3.08, .22);a.group.add(entranceTitle);
  return a.group;
}

export function createTree(m: Materials) {
  const a = new Architecture();a.group.position.set(...VENUE.tree);
  const branches: number[][] = [[-.6, 5.2, .1], [-3.8, 8.5, -.3], [3.6, 8.8, 1.2], [1, 10.2, -2.3], [-5.1, 9.5, 1.7], [5.5, 9.6, -1.2], [-1.6, 11.5, 2.7]];
  const trunkCurve = new THREE.CatmullRomCurve3([[0, 0, 0], [-.08, 1.5, .03], [-.3, 3.2, .2], [-.48, 4.2, .14], branches[0]].map(p => new THREE.Vector3(...p)));
  const trunk = new THREE.TubeGeometry(trunkCurve, 20, .46, 12, false);
  const vertices = trunk.getAttribute('position');
  for (let ring = 0; ring <= 20; ring++) {
    const center = trunkCurve.getPointAt(ring / 20), scale = 1 - ring / 20 * .36;
    for (let j = 0; j <= 12; j++) { const i = ring * 13 + j;const p = new THREE.Vector3().fromBufferAttribute(vertices, i).sub(center).multiplyScalar(scale).add(center);vertices.setXYZ(i, p.x, p.y, p.z); }
  }
  trunk.computeVertexNormals();a.add(trunk, m.bark, [0, 0, 0]);
  for (let i = 1; i < branches.length; i++) {
    a.cylinder(i < 4 ? branches[0] : branches[i % 3 + 1], branches[i], .2, m.bark, .07, 10);
    for (let j = 0; j < 3; j++) a.cylinder(branches[i], [branches[i][0] + Math.sin(j * 2 + i) * 1.8, branches[i][1] + 1.2, branches[i][2] + Math.cos(j * 2 + i) * 1.8], .065, m.bark, .012, 7);
  }
  a.finish();
  // Compound sprigs use small leaflets instead of oversized flat blades.
  const shape = new THREE.Shape();shape.moveTo(-.12, 0);shape.quadraticCurveTo(0, .068, .12, 0);shape.quadraticCurveTo(0, -.058, -.12, 0);
  const leaflets: THREE.BufferGeometry[] = [];
  for (let pair = 0; pair < 4; pair++) for (const side of [-1, 1]) {
    const leaf = new THREE.ShapeGeometry(shape, 3);
    leaf.rotateZ(side * .58);leaf.rotateY(side * .18);leaf.translate(-.24 + pair * .16, side * .085, pair * .012);leaflets.push(leaf);
  }
  const leafGeometry = mergeGeometries(leaflets)!;leaflets.forEach(leaf => leaf.dispose());
  const leafMaterial = new THREE.MeshStandardMaterial({ color: '#a2c46b', side: THREE.DoubleSide, roughness: .92, emissive: '#213b11', emissiveIntensity: .025 });
  const foliage = new THREE.InstancedMesh(leafGeometry, leafMaterial, 6800);
  const random = seededRandom(319);const matrix = new THREE.Object3D();const color = new THREE.Color();
  for (let i = 0; i < 6800; i++) {
    const cluster = branches[1 + i % (branches.length - 1)];
    const theta = random() * Math.PI * 2, vertical = random() * 2 - 1, radius = Math.cbrt(random());
    matrix.position.set(cluster[0] + Math.cos(theta) * Math.sqrt(1 - vertical * vertical) * radius * 3.6,
      cluster[1] + .9 + vertical * radius * 1.7, cluster[2] + Math.sin(theta) * Math.sqrt(1 - vertical * vertical) * radius * 2.5);
    matrix.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    matrix.scale.setScalar(.8 + random() * .9);matrix.updateMatrix();foliage.setMatrixAt(i, matrix.matrix);
    color.setHSL(.22 + random() * .05, .48 + random() * .2, .22 + random() * .14);foliage.setColorAt(i, color);
  }
  foliage.instanceMatrix.needsUpdate = true;foliage.castShadow = true;foliage.receiveShadow = true;
  foliage.computeBoundingSphere();a.group.add(foliage);
  return { group: a.group, foliage };
}
