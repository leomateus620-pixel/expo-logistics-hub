import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Point = readonly [number, number, number];
type Pose = { x: number; y: number; z: number; phase: number };
type GeometryParts = ReturnType<typeof createGeometryParts>;

const COLORS = {
  sleigh: '#99192b',
  lacquer: '#c42537',
  shadowRed: '#4f1326',
  velvet: '#c91e31',
  hat: '#e7323d',
  sack: '#931c33',
  leather: '#6f202a',
  harness: '#bd222b',
  ribbon: '#f9c365',
  gold: '#ffc963',
  lightGold: '#ffe4a0',
  pine: '#23634c',
  cream: '#f3e9db',
  white: '#fff9ef',
  furShadow: '#ded0be',
  skin: '#eea67d',
  skinLight: '#ffc19c',
  pink: '#ed8b86',
  mouth: '#471720',
  tongue: '#ec7375',
  belt: '#331d21',
  hoof: '#332124',
  fur: '#a45e2e',
  shoulder: '#b5743c',
  furDark: '#784627',
  chest: '#ead6b3',
  muzzle: '#cb9f70',
  antler: '#8c5531',
  tips: '#d0a474',
  nose: '#372326',
  pupil: '#241821',
  iris: '#70402a',
} as const;

const HERD: Pose[] = [
  { x: 6.15, y: .14, z: 2.25, phase: 0.4 },
  { x: 7.8, y: .46, z: -2.22, phase: 2.55 },
  { x: 12.62, y: .68, z: .05, phase: 4.6 },
];

const UP = new THREE.Vector3(0, 1, 0);
const HANDS: Point[] = [[1.02, 1.46, .62], [1.02, 1.46, -.62]];
const BRIDLE: Point[] = [[1.62, .99, .31], [1.62, .99, -.31]];
const LEAD_TRACES: Point[] = [[.91, .38, .441], [.91, .38, -.441]];
const TRACES: Point[] = [[-.65, .05, .43], [-.65, .05, -.43]];
const HITCH: Point[] = [[1.72, -.21, .67], [1.72, -.21, -.67]];
const REIN_SEGMENTS = 10;

function vector(point: Point) {
  return new THREE.Vector3(...point);
}

function curve(points: readonly Point[]) {
  return new THREE.CatmullRomCurve3(points.map(vector), false, 'centripetal');
}

function createGeometryParts(reduced: boolean) {
  const matte: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];
  const spheres = [
    new THREE.SphereGeometry(1, reduced ? 6 : 8, reduced ? 4 : 6),
    new THREE.SphereGeometry(1, reduced ? 8 : 12, reduced ? 6 : 8),
    new THREE.SphereGeometry(1, reduced ? 12 : 16, reduced ? 8 : 11),
  ];

  function add(geometry: THREE.BufferGeometry, color: string, metallic = false) {
    geometry.deleteAttribute('uv');
    const position = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    // ExtrudeGeometry starts unindexed. Index its original faces so it can
    // share the draw with the indexed, cached primitives.
    if (!geometry.index) {
      const indices = Uint16Array.from({ length: position.count }, (_, i) => i);
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    }
    const base = new THREE.Color(color);
    const vertexColors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const shading = .84 + .16 * (normals.getY(i) * .5 + .5);
      vertexColors[i * 3] = base.r * shading;
      vertexColors[i * 3 + 1] = base.g * shading;
      vertexColors[i * 3 + 2] = base.b * shading;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
    (metallic ? metal : matte).push(geometry);
  }

  function orb(color: string, position: Point, scale: Point, roll = 0, metallic = false, yaw = 0) {
    const largestAxis = Math.max(...scale);
    const sphere = spheres[largestAxis > .38 ? 2 : largestAxis > .14 ? 1 : 0];
    add(sphere.clone().scale(...scale).rotateZ(roll).rotateY(yaw).translate(...position), color, metallic);
  }

  function box(color: string, position: Point, size: Point, roll = 0) {
    add(new THREE.BoxGeometry(...size).rotateZ(roll).translate(...position), color);
  }

  function tube(
    color: string, points: readonly Point[], radius: number,
    { metallic = false, taper = 1, segments = 16 }: { metallic?: boolean; taper?: number; segments?: number } = {},
  ) {
    const path = curve(points);
    const longitudinal = reduced ? Math.max(4, Math.ceil(segments * .67)) : segments;
    const radial = reduced ? 5 : 8;
    const geometry = new THREE.TubeGeometry(path, longitudinal, radius, radial);
    if (taper !== 1) {
      const positions = geometry.getAttribute('position');
      const center = new THREE.Vector3();
      const point = new THREE.Vector3();
      for (let ring = 0; ring <= longitudinal; ring++) {
        const t = ring / longitudinal;
        path.getPointAt(t, center);
        for (let slice = 0; slice <= radial; slice++) {
          const index = ring * (radial + 1) + slice;
          point.fromBufferAttribute(positions, index).lerp(center, t * (1 - taper));
          positions.setXYZ(index, point.x, point.y, point.z);
        }
      }
    }
    add(geometry, color, metallic);
  }

  function bar(color: string, a: Point, b: Point, radius: number, tip = radius, metallic = false) {
    const from = vector(a);
    const to = vector(b);
    const direction = to.clone().sub(from);
    const geometry = new THREE.CylinderGeometry(tip, radius, direction.length(), reduced ? 6 : 10);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()));
    add(geometry.translate(...from.lerp(to, .5).toArray()), color, metallic);
  }

  function finish() {
    function join(parts: THREE.BufferGeometry[]) {
      if (!parts.length) return null;
      const geometry = mergeGeometries(parts);
      parts.forEach(part => part.dispose());
      if (!geometry) throw new Error('Não foi possível preparar a geometria do voo de Natal.');
      return geometry;
    }

    spheres.forEach(sphere => sphere.dispose());
    return { matte: join(matte), metal: join(metal) };
  }

  return { add, orb, box, tube, bar, finish };
}

function scroll(centerX: number, centerY: number, z: number, initial: number, direction: number, radius: number) {
  return Array.from({ length: 15 }, (_, i): Point => {
    const t = i / 14;
    const angle = initial + direction * t * Math.PI * 1.42;
    const r = radius * (1 - t * .77);
    return [centerX + Math.cos(angle) * r, centerY + Math.sin(angle) * r, z];
  });
}

function buildSleigh(b: GeometryParts, reduced: boolean) {
  // Two beveled side shells joined by the curved footwell, seat and chest.
  const profile = new THREE.Shape();
  profile.moveTo(-3.66, 1.19);
  profile.bezierCurveTo(-3.9, .79, -3.76, -.16, -3.19, -.53);
  profile.bezierCurveTo(-2.34, -.99, -.45, -.94, .78, -.65);
  profile.bezierCurveTo(1.48, -.52, 1.94, -.12, 1.93, .32);
  profile.bezierCurveTo(1.95, .69, 1.71, .89, 1.44, .69);
  profile.bezierCurveTo(1.07, .3, .68, .02, .03, .02);
  profile.bezierCurveTo(-1.44, .02, -2.62, .65, -3.2, 1.25);
  profile.bezierCurveTo(-3.41, 1.45, -3.61, 1.38, -3.66, 1.19);
  for (const side of [-1, 1]) {
    const outside = side * 1.11;
    const z = (offset: number) => side * offset;
    b.add(new THREE.ExtrudeGeometry(profile, {
      depth: .13, bevelEnabled: true, bevelThickness: .115, bevelSize: .11,
      bevelSegments: reduced ? 2 : 3, curveSegments: reduced ? 6 : 12,
    }).translate(0, 0, outside - .065), COLORS.sleigh);
    b.tube(COLORS.gold, [
      [-3.58, 1.19, z(1.18)], [-3.31, 1.37, z(1.22)], [-2.65, .88, z(1.25)],
      [-1.8, .44, z(1.27)], [-.86, .15, z(1.27)], [.04, .11, z(1.25)],
      [.7, .21, z(1.24)], [1.16, .56, z(1.19)], ...scroll(1.55, .58, z(1.17), 2.55, -1, .36),
    ], .092, { metallic: true, segments: 49 });
    b.tube(COLORS.gold, [
      [-3.65, .77, z(1.21)], [-3.55, .13, z(1.25)], [-3.09, -.51, z(1.24)],
      [-2.09, -.75, z(1.25)], [-.82, -.77, z(1.24)], [.55, -.62, z(1.26)],
      [1.4, -.38, z(1.24)], [1.81, .09, z(1.18)],
    ], .047, { metallic: true, segments: 22 });
    b.tube(COLORS.gold, [
      ...scroll(-3.65, -1.24, z(1.04), .35, 1, .48).reverse(),
      [-3.11, -1.64, z(1.04)], [-1.82, -1.71, z(1.08)], [-.42, -1.69, z(1.08)],
      [1, -1.58, z(1.08)], [1.82, -1.29, z(1.06)], [2.17, -.83, z(1.05)],
      ...scroll(2.11, -.64, z(1.05), .04, 1, .26),
    ], .105, { metallic: true, segments: 56 });
    b.tube(COLORS.gold, [
      [-2.94, -1.64, z(1.04)], [-2.52, -1.45, z(1.05)],
      [-2.01, -.73, z(1.08)], [-1.77, -.62, z(1.1)],
    ], .115, { metallic: true, segments: 12 });
    b.tube(COLORS.gold, [
      [-.61, -1.66, z(1.08)], [-.22, -1.43, z(1.09)],
      [.26, -.78, z(1.08)], [.64, -.58, z(1.08)],
    ], .115, { metallic: true, segments: 12 });

    const cx = -2.12;
    const cy = -.31;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const edge = (angle: number, radius: number): Point =>
        [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, z(1.303)];
      const end = edge(a, .29);
      b.bar(COLORS.lightGold, [cx, cy, z(1.303)], end, .019, .014, true);
      for (const twig of [-1, 1]) {
        b.bar(COLORS.lightGold, edge(a, .16), edge(a + twig * .29, .25), .012, .008, true);
      }
    }
    for (const x of [-2.7, -1.5, -1.04, -.65]) {
      b.orb(COLORS.gold, [x, -.33, z(1.305)], [.055, .055, .03], 0, true);
    }
  }

  b.orb(COLORS.lacquer, [-.84, -.25, 0], [2.66, .56, 1.12], .02);
  b.orb(COLORS.lacquer, [1.58, .14, 0], [.38, .39, 1.15], .22);
  b.orb(COLORS.shadowRed, [-1.07, .24, 0], [1.62, .22, 1]);
  b.orb(COLORS.velvet, [-.82, .43, 0], [.95, .21, .94]);
  b.orb(COLORS.shadowRed, [-1.77, .79, 0], [.32, .65, .96], .19);
  b.orb(COLORS.velvet, [-1.62, .84, 0], [.26, .6, .86], .19);

  b.orb(COLORS.sack, [-2.59, 1.18, .17], [.76, 1.06, .84], .26);
  b.orb(COLORS.sack, [-2.88, .97, .49], [.56, .85, .48], .39);
  b.orb(COLORS.shadowRed, [-3.01, 1.86, .24], [.35, .56, .33], .53);
  b.orb(COLORS.velvet, [-3.33, 2.17, .31], [.43, .19, .29], -.23);
  b.tube(COLORS.ribbon, [
    [-3.11, 1.93, -.06], [-3.33, 1.95, .1], [-3.33, 1.86, .36],
    [-3.14, 1.86, .56], [-2.95, 1.93, .41], [-2.93, 1.97, .16], [-3.11, 1.93, -.06],
  ], .037, { metallic: true, segments: 18 });
  b.tube(COLORS.ribbon, [
    [-3.14, 1.89, .55], [-3.46, 2.02, .56], [-3.56, 1.89, .64],
    [-3.41, 1.82, .64], [-3.14, 1.89, .55], [-2.98, 1.72, .67], [-3.03, 1.59, .67],
  ], .033, { metallic: true, segments: 16 });
  b.box(COLORS.pine, [-2.24, .96, -.61], [.72, .64, .57], -.18);
  b.box(COLORS.ribbon, [-2.24, .96, -.61], [.18, .66, .6], -.18);
  b.box(COLORS.ribbon, [-2.24, .96, -.61], [.75, .66, .12], -.18);
  b.box(COLORS.lacquer, [-2.6, .85, .8], [.57, .52, .55], .18);
  b.box(COLORS.lightGold, [-2.6, .85, .8], [.12, .54, .58], .18);
  b.box(COLORS.lightGold, [-2.6, .85, .8], [.59, .54, .11], .18);
}

function buildSanta(b: GeometryParts) {
  b.orb(COLORS.velvet, [-.7, .94, 0], [.66, .58, .66], .04);
  b.orb(COLORS.velvet, [-.81, 1.5, 0], [.64, .91, .72], .1);
  b.orb(COLORS.velvet, [-.33, 1.45, 0], [.41, .65, .56], -.18);
  b.orb(COLORS.white, [-.06, 1.42, 0], [.115, .61, .16], -.1);
  b.orb(COLORS.belt, [-.67, 1.06, 0], [.67, .135, .67]);
  b.orb(COLORS.gold, [.002, 1.07, 0], [.075, .15, .17], 0, true);
  b.orb(COLORS.belt, [.06, 1.07, 0], [.039, .079, .096]);
  b.orb(COLORS.furShadow, [-.64, .77, 0], [.66, .13, .66]);
  for (const side of [-1, 1]) {
    b.orb(COLORS.white, [-.63, .82, side * .48], [.53, .15, .19]);
    b.orb(COLORS.velvet, [-.02, .71, side * .31], [.57, .25, .29], -.11);
    b.orb(COLORS.belt, [.52, .51, side * .31], [.45, .22, .23], .08);
    b.orb(COLORS.belt, [.47, .63, side * .31], [.23, .25, .23], .08);
    b.orb(COLORS.velvet, [-.51, 1.64, side * .55], [.47, .36, .34], -.62);
    b.orb(COLORS.velvet, [.25, 1.35, side * .6], [.47, .246, .26], .08);
    b.orb(COLORS.white, [.65, 1.4, side * .63], [.16, .218, .221], .18);
    b.orb(COLORS.furShadow, [.73, 1.41, side * .63], [.135, .193, .194], .18);
    b.orb(COLORS.white, [.87, 1.44, side * .62], [.2, .153, .161], .2);
    b.orb(COLORS.white, [.88, 1.55, side * .52], [.129, .097, .083], .45);
  }
  b.orb(COLORS.white, [-.74, 2.12, 0], [.52, .25, .5], .13);
}

function buildSantaHead(b: GeometryParts, reduced: boolean) {
  b.orb(COLORS.furShadow, [-.16, .25, 0], [.43, .42, .5], .12);
  b.orb(COLORS.skin, [.015, .42, 0], [.46, .53, .43], .08);
  b.orb(COLORS.skinLight, [.259, .41, 0], [.232, .379, .368], .08);
  b.orb(COLORS.white, [.253, .079, 0], [.409, .38, .444], -.22);
  b.orb(COLORS.furShadow, [.16, -.111, 0], [.35, .333, .381], -.38);
  b.orb(COLORS.white, [.295, -.186, 0], [.35, .369, .371], -.28);
  b.orb(COLORS.mouth, [.566, .249, 0], [.095, .106, .157]);
  b.orb(COLORS.tongue, [.63, .197, 0], [.036, .039, .082]);
  b.orb(COLORS.white, [.627, .289, 0], [.039, .024, .105]);
  b.orb(COLORS.pink, [.541, .45, 0], [.179, .139, .157], -.11);
  b.orb(COLORS.skinLight, [.646, .491, .021], [.078, .049, .093], -.11);

  for (const side of [-1, 1]) {
    const z = (offset: number) => side * offset;
    b.orb(COLORS.skin, [-.01, .365, z(.42)], [.127, .166, .102], -.15);
    b.orb(COLORS.pink, [.017, .362, z(.488)], [.073, .111, .047]);
    b.orb(COLORS.pink, [.34, .351, z(.277)], [.183, .118, .138], -.29);
    b.orb(COLORS.skinLight, [.379, .388, z(.29)], [.114, .065, .104], -.11);
    b.orb(COLORS.skin, [.385, .533, z(.209)], [.118, .131, .125], .08);
    b.orb(COLORS.white, [.444, .537, z(.211)], [.082, .095, .104], -.1, false, -side * .22);
    b.orb('#5892ac', [.51, .534, z(.237)], [.033, .069, .063], 0, false, -side * .18);
    b.orb(COLORS.pupil, [.531, .537, z(.243)], [.024, .046, .043], 0, false, -side * .18);
    b.orb(COLORS.white, [.55, .565, z(.228)], [.013, .019, .016]);
    b.tube(COLORS.white, [
      [.41, .649, z(.111)], [.43, .685, z(.207)], [.37, .657, z(.298)], [.324, .618, z(.32)],
    ], .051, { taper: .38, segments: 9 });
    b.tube(COLORS.white, [
      [.605, .372, z(.064)], [.596, .345, z(.154)], [.523, .321, z(.266)], [.412, .373, z(.37)],
    ], .079, { taper: .29, segments: 12 });
    const strands = reduced ? 2 : 4;
    for (let i = 0; i < strands; i++) {
      const step = i * .068;
      b.tube(i % 2 ? COLORS.cream : COLORS.white, [
        [.48 - step, .179 + step, z(.17 + step)],
        [.52 - step, -.016 + step, z(.18 + step)],
        [.416 - step, -.215 + step, z(.163 + step)],
        [.276 - step, -.364 + step, z(.087 + step)],
      ], .066, { taper: .21, segments: 10 });
    }
  }
  b.orb(COLORS.furShadow, [-.05, .786, 0], [.49, .148, .507], .14);
  b.orb(COLORS.white, [-.047, .811, 0], [.494, .146, .505], .12);
  for (let i = 0; i < (reduced ? 9 : 15); i++) {
    const angle = i * Math.PI * 2 / (reduced ? 9 : 15);
    b.orb(COLORS.white, [-.047 + Math.cos(angle) * .385, .809, Math.sin(angle) * .398], [.137, .124, .136]);
  }
}

function buildHat(b: GeometryParts, reduced: boolean) {
  b.orb(COLORS.hat, [-.074, .954, 0], [.441, .315, .438], -.13);
  b.orb(COLORS.hat, [-.296, 1.14, .066], [.384, .268, .312], .36);
  b.tube(COLORS.hat, [
    [-.3, 1.149, .058], [-.53, 1.16, .16], [-.72, 1.055, .294], [-.77, .884, .445],
  ], .237, { taper: .09, segments: 16 });
  b.orb(COLORS.furShadow, [-.789, .857, .456], [.15, .147, .151]);
  b.orb(COLORS.white, [-.798, .875, .469], [.142, .146, .151]);
  if (!reduced) {
    b.orb(COLORS.white, [-.827, .835, .551], [.085, .084, .088]);
    b.orb(COLORS.cream, [-.715, .81, .448], [.08, .082, .084]);
  }
}

function buildReindeer(b: GeometryParts, reduced: boolean) {
  b.orb(COLORS.fur, [-.13, .01, 0], [1.1, .49, .444], .03);
  b.orb(COLORS.furDark, [-.34, .252, 0], [.89, .274, .38], .015);
  b.orb(COLORS.shoulder, [-.73, .034, 0], [.552, .479, .445], -.08);
  b.orb(COLORS.shoulder, [.555, .06, 0], [.536, .536, .466], -.15);
  b.orb(COLORS.chest, [.22, -.281, 0], [.792, .205, .375], .04);
  b.orb(COLORS.fur, [.843, .485, 0], [.357, .745, .343], -.46);
  b.orb(COLORS.shoulder, [.954, .599, 0], [.297, .632, .314], -.405);
  b.orb(COLORS.chest, [1.078, .397, 0], [.217, .558, .267], -.315);
  b.orb(COLORS.muzzle, [1.048, .75, 0], [.215, .286, .25], -.47);
  b.orb(COLORS.furDark, [1.262, 1.101, 0], [.409, .363, .304], -.08);
  b.orb(COLORS.shoulder, [1.411, 1.083, 0], [.359, .288, .282], -.22);
  b.orb(COLORS.muzzle, [1.666, .969, 0], [.365, .185, .237], -.175);
  b.orb(COLORS.chest, [1.683, .868, 0], [.294, .118, .195], -.105);
  b.orb(COLORS.nose, [1.966, .989, 0], [.152, .11, .201], -.08);
  b.orb(COLORS.furDark, [2.051, 1.025, .035], [.059, .036, .097], -.1);
  b.orb(COLORS.fur, [-1.255, .268, 0], [.384, .142, .153], -.62);
  b.orb(COLORS.chest, [-1.353, .212, 0], [.256, .093, .108], -.61);

  const band: Point[] = [];
  const girth: Point[] = [];
  for (let i = 0; i <= 24; i++) {
    const angle = i / 24 * Math.PI * 2;
    band.push([.846 - Math.cos(angle) * .277, .45 + Math.cos(angle) * .345, Math.sin(angle) * .366]);
    girth.push([-.48 + Math.cos(angle) * .13, Math.cos(angle) * .466, Math.sin(angle) * .452]);
  }
  b.tube(COLORS.harness, band, .097, { segments: 30 });
  b.tube(COLORS.leather, girth, .079, { segments: 30 });

  for (const side of [-1, 1]) {
    const z = (offset: number) => side * offset;
    b.orb(COLORS.fur, [1.048, 1.361, z(.318)], [.297, .134, .151], -.37, false, -side * .48);
    b.orb(COLORS.chest, [1.004, 1.398, z(.402)], [.193, .088, .075], -.36, false, -side * .41);
    b.orb(COLORS.furDark, [1.434, 1.154, z(.228)], [.169, .137, .09], -.18);
    b.orb(COLORS.chest, [1.457, 1.151, z(.264)], [.127, .086, .07], -.2);
    b.orb(COLORS.nose, [1.465, 1.161, z(.31)], [.085, .071, .04], -.2);
    b.orb(COLORS.white, [1.492, 1.192, z(.34)], [.024, .024, .013]);
    b.tube(COLORS.furDark, [[1.73, .881, z(.186)], [1.843, .879, z(.164)], [1.925, .916, z(.127)]], .02, {
      taper: .6, segments: 8,
    });
    b.tube(COLORS.harness, [
      [1.29, 1.33, z(.183)], [1.33, 1.23, z(.31)], [1.49, 1.082, z(.312)], BRIDLE[side === 1 ? 0 : 1],
      [1.793, .962, z(.213)], [1.78, .894, z(.192)],
    ], .032, { segments: 16 });
    const ring = new THREE.TorusGeometry(.087, .025, 6, reduced ? 10 : 16);
    b.add(ring.translate(...BRIDLE[side === 1 ? 0 : 1]), COLORS.gold, true);
    for (const i of [4, 6, 8, 10]) {
      const [x, y, w] = band[i];
      b.orb(COLORS.gold, [x + .045, y, z(w + .077)], [.056, .053, .047], 0, true);
    }
    const hardwareSide = side === 1 ? 0 : 1;
    b.orb(COLORS.gold, TRACES[hardwareSide], [.087, .091, .077], 0, true);
    b.orb(COLORS.gold, LEAD_TRACES[hardwareSide], [.066, .08, .062], 0, true);
    // Tapered tines stay readable from both sides and have distinct fork silhouettes.
    b.tube(COLORS.antler, [
      [1.247, 1.332, z(.151)], [1.185, 1.565, z(.237)], [1.006, 1.742, z(.364)],
      [.798, 1.889, z(.51)], [.667, 2.159, z(.62)], [.722, 2.419, z(.646)],
    ], .108, { taper: .3, segments: 20 });
    b.tube(COLORS.antler, [
      [1.085, 1.699, z(.334)], [1.296, 1.784, z(.43)], [1.528, 1.918, z(.469)], [1.649, 2.105, z(.481)],
    ], .079, { taper: .24, segments: 14 });
    b.tube(COLORS.antler, [
      [.846, 1.854, z(.489)], [.815, 2.022, z(.623)], [.962, 2.194, z(.775)], [1.05, 2.329, z(.799)],
    ], .067, { taper: .22, segments: 13 });
    b.tube(COLORS.antler, [
      [.705, 2.071, z(.594)], [.484, 2.209, z(.638)], [.418, 2.407, z(.696)],
    ], .061, { taper: .2, segments: 10 });
    b.tube(COLORS.antler, [
      [1.382, 1.828, z(.444)], [1.501, 1.903, z(.598)], [1.533, 2.063, z(.651)],
    ], .051, { taper: .18, segments: 10 });
    if (!reduced) {
      b.tube(COLORS.tips, [
        [.685, 2.224, z(.63)], [.696, 2.343, z(.643)], [.724, 2.425, z(.646)],
      ], .036, { taper: .22, segments: 7 });
      b.tube(COLORS.tips, [
        [1.548, 1.94, z(.474)], [1.618, 2.033, z(.479)], [1.65, 2.112, z(.483)],
      ], .03, { taper: .17, segments: 7 });
    }
  }
}

function buildThigh(b: GeometryParts) {
  b.orb(COLORS.fur, [0, -.22, 0], [.208, .395, .154], -.06);
  b.bar(COLORS.fur, [0, -.13, 0], [0, -.716, 0], .135, .094);
  b.orb(COLORS.shoulder, [0, -.7, 0], [.11, .143, .105]);
}

function buildCannon(b: GeometryParts) {
  b.bar(COLORS.fur, [0, .025, 0], [0, -.465, 0], .099, .065);
  b.bar(COLORS.chest, [0, -.33, 0], [.005, -.585, 0], .072, .065);
  b.orb(COLORS.hoof, [.043, -.603, 0], [.118, .123, .09], .36);
  b.orb(COLORS.hoof, [.038, -.66, 0], [.119, .064, .093], .19);
}

function makeSurface(metallic: boolean, reduced: boolean) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: metallic ? (reduced ? .46 : .28) : .73,
    metalness: metallic ? (reduced ? .28 : .49) : .025,
    emissive: '#fff0df',
    emissiveIntensity: metallic ? .19 : .12,
  });
  // Keep the colored fill on the rig; adding a scene light would change all map materials.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float festiveFill = 0.67 + 0.56 * max(0.0, dot(normal, vec3(-0.37, 0.74, 0.56)));
      totalEmissiveRadiance *= diffuseColor.rgb * festiveFill;`,
    );
  };
  return material;
}

function fixedPart(
  target: THREE.Group, geometry: THREE.BufferGeometry | null, material: THREE.Material,
) {
  if (!geometry) return;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.raycast = () => undefined;
  target.add(mesh);
}

/** The formation is modeled in local units with +X forward and +Y up. */
export function createChristmasModel(reduced: boolean) {
  const root = new THREE.Group();
  root.name = 'commercial-map-christmas-formation';
  const geometries = new Set<THREE.BufferGeometry>();
  const matte = makeSurface(false, reduced);
  const metal = makeSurface(true, reduced);
  const reinSurface = new THREE.MeshStandardMaterial({
    color: '#ffc66b', roughness: .46, metalness: .24, emissive: '#7c4c16', emissiveIntensity: .3,
  });
  const create = (build: (parts: GeometryParts, reduced: boolean) => void) => {
    const parts = createGeometryParts(reduced);
    build(parts, reduced);
    const result = parts.finish();
    if (result.matte) geometries.add(result.matte);
    if (result.metal) geometries.add(result.metal);
    return result;
  };
  const add = (target: THREE.Group, geometry: ReturnType<typeof create>) => {
    fixedPart(target, geometry.matte, matte);
    fixedPart(target, geometry.metal, metal);
  };
  const group = (parent: THREE.Group, point: Point) => {
    const child = new THREE.Group();
    child.position.set(...point);
    parent.add(child);
    return child;
  };
  const instanced = (geometry: THREE.BufferGeometry | null, material: THREE.Material, count: number) => {
    if (!geometry) throw new Error('Geometria ausente no rig do voo de Natal.');
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.raycast = () => undefined;
    root.add(mesh);
    return mesh;
  };

  add(root, create(buildSleigh));
  const santa = group(root, [0, 0, 0]);
  add(santa, create(buildSanta));
  const head = group(santa, [-.68, 2.16, 0]);
  head.scale.setScalar(1.08);
  add(head, create(buildSantaHead));
  const hat = group(head, [0, 0, 0]);
  add(hat, create(buildHat));

  const animal = create(buildReindeer);
  const bodies = instanced(animal.matte, matte, HERD.length);
  const harnesses = instanced(animal.metal, metal, HERD.length);
  const thighs = instanced(create(buildThigh).matte, matte, HERD.length * 4);
  const cannons = instanced(create(buildCannon).matte, matte, HERD.length * 4);
  const reinsGeometry = new THREE.CylinderGeometry(1, 1, 1, reduced ? 4 : 6);
  geometries.add(reinsGeometry);
  const reins = instanced(reinsGeometry, reinSurface, 6 * REIN_SEGMENTS);
  const traceColor = new THREE.Color('#a6683c');
  const reinColor = new THREE.Color('#ffffff');
  for (let i = 0; i < reins.count; i++) reins.setColorAt(i, i < 4 * REIN_SEGMENTS ? reinColor : traceColor);

  const animalTransforms = HERD.map(() => new THREE.Object3D());
  const leg = new THREE.Object3D();
  const lower = new THREE.Object3D();
  const wire = new THREE.Object3D();
  const sleighTransform = new THREE.Matrix4();
  const legWorld = new THREE.Matrix4();
  const lowerWorld = new THREE.Matrix4();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const sampleA = new THREE.Vector3();
  const sampleB = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let nightActive: boolean | undefined;

  function connect(index: number, a: Point, aMatrix: THREE.Matrix4, b: Point, bMatrix: THREE.Matrix4, seconds: number) {
    from.set(...a).applyMatrix4(aMatrix);
    to.set(...b).applyMatrix4(bMatrix);
    const sag = Math.min(.25, from.distanceTo(to) * .043);
    sampleA.copy(from);
    for (let i = 0; i < REIN_SEGMENTS; i++) {
      const t = (i + 1) / REIN_SEGMENTS;
      const bow = 4 * t * (1 - t);
      sampleB.lerpVectors(from, to, t);
      sampleB.y -= bow * sag;
      sampleB.z += bow * Math.sin(seconds * 7.2 + index) * .035;
      direction.subVectors(sampleB, sampleA);
      const length = direction.length();
      wire.position.lerpVectors(sampleA, sampleB, .5);
      wire.quaternion.setFromUnitVectors(UP, direction.normalize());
      const radius = index < 4 ? .023 : .033;
      wire.scale.set(radius, length + .011, radius);
      wire.updateMatrix();
      reins.setMatrixAt(index * REIN_SEGMENTS + i, wire.matrix);
      sampleA.copy(sampleB);
    }
  }

  function update(seconds: number, night: boolean) {
    if (night !== nightActive) {
      nightActive = night;
      matte.emissiveIntensity = night ? .52 : .12;
      metal.emissiveIntensity = night ? .55 : .19;
      reinSurface.emissiveIntensity = night ? .54 : .3;
    }
    const rhythm = seconds * 9.8;
    santa.rotation.z = .045 * Math.sin(seconds * 3.6);
    santa.updateMatrix();
    head.rotation.y = -.31 + .1 * Math.sin(seconds * 2);
    head.rotation.z = .04 * Math.sin(seconds * 4.2);
    hat.rotation.x = .048 * Math.sin(seconds * 6.1);
    hat.rotation.z = .045 * Math.sin(seconds * 7.7 - .4);

    HERD.forEach((pose, i) => {
      const stride = rhythm + pose.phase;
      const animalTransform = animalTransforms[i];
      animalTransform.position.set(
        pose.x + .12 * Math.cos(stride), pose.y + .13 * Math.sin(stride), pose.z,
      );
      animalTransform.rotation.z = .092 * Math.cos(stride + .38);
      animalTransform.rotation.y = .045 * Math.sin(stride * .49);
      animalTransform.updateMatrix();
      bodies.setMatrixAt(i, animalTransform.matrix);
      harnesses.setMatrixAt(i, animalTransform.matrix);

      for (let legIndex = 0; legIndex < 4; legIndex++) {
        const front = legIndex < 2;
        const side = legIndex % 2 === 0 ? 1 : -1;
        const phase = stride + (front ? 0 : Math.PI * .84) + (side === 1 ? 0 : .67);
        const swing = Math.sin(phase);
        const fold = Math.max(0, -Math.cos(phase));
        leg.position.set(front ? .626 : -.768, -.207, side * .311);
        leg.rotation.set(side * .103, 0, front ? .21 + .84 * swing : -.28 - .79 * swing);
        leg.scale.set(front ? .8 : 1.15, front ? .97 : 1.09, front ? .8 : 1.09);
        leg.updateMatrix();
        legWorld.multiplyMatrices(animalTransform.matrix, leg.matrix);
        thighs.setMatrixAt(i * 4 + legIndex, legWorld);

        lower.position.set(0, -.714, 0);
        lower.rotation.set(0, 0, front ? -.27 - 1.07 * fold : .27 + .99 * fold);
        lower.updateMatrix();
        lowerWorld.multiplyMatrices(legWorld, lower.matrix);
        cannons.setMatrixAt(i * 4 + legIndex, lowerWorld);
      }
    });

    const near = animalTransforms[0].matrix;
    const far = animalTransforms[1].matrix;
    const lead = animalTransforms[2].matrix;
    connect(0, HANDS[0], santa.matrix, BRIDLE[0], near, seconds);
    connect(1, HANDS[1], santa.matrix, BRIDLE[1], far, seconds);
    connect(2, LEAD_TRACES[0], near, BRIDLE[0], lead, seconds);
    connect(3, LEAD_TRACES[1], far, BRIDLE[1], lead, seconds);
    connect(4, HITCH[0], sleighTransform, TRACES[0], near, seconds);
    connect(5, HITCH[1], sleighTransform, TRACES[1], far, seconds);
    bodies.instanceMatrix.needsUpdate = true;
    harnesses.instanceMatrix.needsUpdate = true;
    thighs.instanceMatrix.needsUpdate = true;
    cannons.instanceMatrix.needsUpdate = true;
    reins.instanceMatrix.needsUpdate = true;
  }

  update(0, false);
  return {
    root,
    update,
    dispose() {
      for (const mesh of [bodies, harnesses, thighs, cannons, reins]) mesh.dispose();
      geometries.forEach(geometry => geometry.dispose());
      for (const material of [matte, metal, reinSurface]) material.dispose();
      root.clear();
    },
  };
}
