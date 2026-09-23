import { useEffect, useMemo, type RefObject } from 'react';
import {
  BufferGeometry, CanvasTexture, CatmullRomCurve3, CylinderGeometry, DoubleSide,
  Float32BufferAttribute, Group, MeshStandardMaterial, Quaternion, SphereGeometry,
  SRGBColorSpace, TorusGeometry, TubeGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Color = 'bean' | 'pod' | 'podEdge' | 'brown' | 'tuft' | 'shirt' | 'shorts' | 'glove' | 'shoe' | 'sole' | 'eye' | 'pupil' | 'mouth' | 'tongue';
type Parts = Record<Color, BufferGeometry[]>;
const PALETTE: Record<Color, string> = {
  bean: '#f7b43d', pod: '#eda42a', podEdge: '#cc821c', brown: '#603920',
  tuft: '#6b391e', shirt: '#f7f7f3', shorts: '#075cc5', glove: '#fafafa',
  shoe: '#008e57', sole: '#006f48', eye: '#fffdf7', pupil: '#151b1b',
  mouth: '#2d1114', tongue: '#c43149',
};
const HEAD = { y: 1.274, rx: .375, ry: .381, rz: .317 };
const NO_PICK = () => undefined;
const UP = new Vector3(0, 1, 0);
const colors = Object.keys(PALETTE) as Color[];
const parts = (): Parts => Object.fromEntries(colors.map(color => [color, []])) as Parts;

function sphere(p: Parts, color: Color, xyz: [number, number, number], size: [number, number, number], turn = 0, segments = 18) {
  const g = new SphereGeometry(1, segments, 12);
  g.scale(...size);
  if (turn) g.rotateZ(turn);
  g.translate(...xyz);
  p[color].push(g);
}

function link(p: Parts, color: Color, a: [number, number, number], b: [number, number, number], radius: number) {
  const from = new Vector3(...a), to = new Vector3(...b);
  const delta = to.clone().sub(from);
  const g = new CylinderGeometry(radius, radius, delta.length(), 9);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(UP, delta.normalize()));
  g.translate(...from.clone().add(to).multiplyScalar(.5).toArray());
  p[color].push(g);
  sphere(p, color, a, [radius, radius, radius], 0, 9);
  sphere(p, color, b, [radius, radius, radius], 0, 9);
}

function ring(p: Parts, color: Color, xyz: [number, number, number], radius: number, tube: number) {
  const g = new TorusGeometry(radius, tube, 5, 18);
  g.rotateX(Math.PI / 2);
  g.translate(...xyz);
  p[color].push(g);
}

/** The two smooth husk flaps remain legible from all three supplied views. */
function pod(side: -1 | 1, edge = false) {
  const rows = 12, sides = 10, pos: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = 1.34 - .79 * t;
    const x = side * (.285 + .075 * Math.sin(Math.PI * t) + .020 * t);
    const z = .095 - .105 * Math.sin(Math.PI * t) + .100 * t;
    const width = (edge ? .022 : .057) * Math.pow(Math.sin(Math.PI * (.065 + .87 * t)), .65);
    for (let j = 0; j <= sides; j++) {
      const a = 2 * Math.PI * j / sides;
      pos.push(x + side * width * Math.cos(a), y, z + (edge ? -.034 : 0) + .037 * Math.sin(a));
      uv.push(j / sides, t);
      if (i < rows && j < sides) {
        const n = i * (sides + 1) + j;
        const stride = sides + 1;
        indices.push(n, n + stride, n + 1, n + 1, n + stride, n + stride + 1);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function faceZ(x: number, y: number, offset: number) {
  const nx = x / HEAD.rx, ny = (y - HEAD.y) / HEAD.ry;
  return -HEAD.rz * Math.sqrt(Math.max(.08, 1 - nx * nx - ny * ny)) - offset;
}

/** Mouth and teeth are curved onto the head, rather than floating decals. */
function faceOval(cx: number, cy: number, rx: number, ry: number, smile: number, offset: number) {
  const rows = 4, sides = 28, pos: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const radius = row / rows;
    for (let i = 0; i <= sides; i++) {
      const angle = i * Math.PI * 2 / sides;
      const x = cx + rx * radius * Math.cos(angle);
      const y = cy + ry * radius * Math.sin(angle) + smile * Math.pow((x - cx) / rx, 2);
      pos.push(x, y, faceZ(x, y, offset));
      uv.push(.5 + (x - cx) / (2 * rx), .5 + (y - cy) / (2 * ry));
      if (row < rows && i < sides) {
        const n = row * (sides + 1) + i;
        indices.push(n, n + 1, n + sides + 1, n + 1, n + sides + 2, n + sides + 1);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function eyebrow(p: Parts, side: -1 | 1) {
  const xs = [side * .076, side * .114, side * .153, side * .190];
  const ys = [1.520, 1.544, 1.546, 1.531];
  const points = xs.map((x, i) => new Vector3(x, ys[i], faceZ(x, ys[i], .017)));
  p.tuft.push(new TubeGeometry(new CatmullRomCurve3(points), 10, .010, 5, false));
}

function combine(p: Parts): Partial<Record<Color, BufferGeometry>> {
  const result: Partial<Record<Color, BufferGeometry>> = {};
  for (const key of colors) {
    const pieces = p[key];
    if (!pieces.length) continue;
    const merged = mergeGeometries(pieces, false);
    pieces.forEach(piece => piece.dispose());
    if (!merged) throw new Error('Could not merge Sojinha geometry: ' + key);
    result[key] = merged;
  }
  return result;
}

function bodyGeometry() {
  const p = parts();
  sphere(p, 'bean', [0, HEAD.y, 0], [HEAD.rx, HEAD.ry, HEAD.rz], 0, 24);
  sphere(p, 'tuft', [-.004, 1.649, .026], [.078, .085, .069], -.43);
  sphere(p, 'tuft', [.035, 1.688, .023], [.056, .068, .053], .31);
  for (const side of [-1, 1] as const) {
    p.pod.push(pod(side));
    p.podEdge.push(pod(side, true));
  }
  // Raised white eyes, dark pupils, glints, nose, cheeks, smiling mouth.
  for (const side of [-1, 1] as const) {
    const x = side * .125;
    sphere(p, 'eye', [x, 1.382, -.289], [.077, .105, .036]);
    sphere(p, 'pupil', [x - side * .003, 1.378, -.321], [.048, .071, .018]);
    sphere(p, 'eye', [x - .018, 1.420, -.339], [.017, .024, .008], 0, 10);
    eyebrow(p, side);
    for (let i = 0; i < 3; i++) {
      const fx = side * (.233 + (i % 2) * .027), fy = 1.445 - i * .028;
      sphere(p, 'podEdge', [fx, fy, faceZ(fx, fy, .005)], [.010, .011, .006], 0, 8);
    }
  }
  p.mouth.push(faceOval(0, 1.073, .195, .095, .074, .008));
  p.eye.push(faceOval(0, 1.129, .150, .022, .035, .011));
  p.tongue.push(faceOval(0, 1.014, .069, .026, .026, .012));
  sphere(p, 'bean', [0, 1.277, -.323], [.053, .050, .049], 0, 14);
  // Clothing and arms are static; the existing leg swing is unchanged.
  sphere(p, 'shirt', [0, .765, .005], [.284, .298, .220], 0, 22);
  ring(p, 'shirt', [0, 1.010, 0], .126, .026);
  for (const side of [-1, 1] as const) {
    sphere(p, 'shirt', [side * .282, .922, .012], [.124, .114, .122], side * .45);
    link(p, 'brown', [side * .365, .881, .012], [side * .476, .724, -.010], .075);
    ring(p, 'glove', [side * .484, .717, -.012], .078, .022);
    sphere(p, 'glove', [side * .539, .688, -.025], [.110, .071, .081], side * .13);
    for (let i = 0; i < 4; i++) {
      sphere(p, 'glove', [side * (.622 - (i === 0 || i === 3 ? .016 : 0)), .735 - i * .032, -.035], [.049, .023, .027], side * .15, 10);
    }
    sphere(p, 'glove', [side * .537, .607, -.089], [.037, .056, .033], side * .3, 10);
  }
  sphere(p, 'shorts', [0, .536, .008], [.297, .169, .225], 0, 20);
  for (const side of [-1, 1] as const) {
    sphere(p, 'shorts', [side * .141, .426, .013], [.148, .124, .183], 0, 16);
    ring(p, 'shorts', [side * .142, .360, .018], .134, .019);
  }
  return combine(p);
}

function legGeometry() {
  const p = parts();
  link(p, 'brown', [0, -.007, .014], [0, -.221, .018], .076);
  ring(p, 'shoe', [0, -.257, .017], .100, .029);
  sphere(p, 'shoe', [0, -.323, -.071], [.152, .079, .209], 0, 18);
  sphere(p, 'sole', [0, -.383, -.067], [.153, .019, .212], 0, 16);
  return combine(p);
}

let cachedShirtMark: CanvasTexture | null = null;
function shirtMark() {
  if (cachedShirtMark) return cachedShirtMark;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Sojinha shirt texture requires Canvas 2D');
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  c.font = '900 37px Arial, sans-serif';
  c.lineWidth = 7; c.strokeStyle = '#543411'; c.strokeText('SOJINHA', 128, 64);
  c.fillStyle = '#f9b43b'; c.fillText('SOJINHA', 128, 64);
  c.fillStyle = '#1598d4'; c.beginPath(); c.arc(128, 156, 76, Math.PI, 2 * Math.PI); c.fill();
  c.fillStyle = '#f5ab2c'; c.beginPath(); c.arc(128, 174, 67, Math.PI, 2 * Math.PI); c.fill();
  c.strokeStyle = '#fff'; c.lineWidth = 9; c.beginPath(); c.arc(128, 177, 57, Math.PI, 2 * Math.PI); c.stroke();
  c.fillStyle = '#168758'; c.beginPath(); c.arc(128, 188, 71, Math.PI, 2 * Math.PI); c.lineTo(199, 214); c.lineTo(57, 214); c.fill();
  c.strokeStyle = '#fff'; c.lineWidth = 6;
  for (const shift of [-37, 0, 37]) {
    c.beginPath(); c.moveTo(128 + shift, 245);
    c.quadraticCurveTo(128 + shift - 8, 199, 128 + shift + 22, 173); c.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  cachedShirtMark = texture;
  return cachedShirtMark;
}

function shirtLogoGeometry() {
  const rows = 10, columns = 10, pos: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const v = row / rows, y = .637 + v * .275;
    for (let column = 0; column <= columns; column++) {
      const u = column / columns, x = -.1625 + u * .325;
      const nx = x / .284, ny = (y - .765) / .298;
      const z = .005 - .220 * Math.sqrt(1 - nx * nx - ny * ny) - .006;
      pos.push(x, y, z);
      // A front-facing surface on -Z is seen with the world X axis reversed.
      // Mirror atlas U here so the SOJINHA wordmark reads correctly in scene.
      uv.push(1 - u, v);
      if (row < rows && column < columns) {
        const n = row * (columns + 1) + column, stride = columns + 1;
        indices.push(n, n + stride, n + 1, n + 1, n + stride, n + stride + 1);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

const MATERIALS = Object.fromEntries(colors.map(key => [key, new MeshStandardMaterial({
  color: PALETTE[key], roughness: key === 'eye' || key === 'glove' ? .55 : .82,
  metalness: 0, side: DoubleSide,
})])) as Record<Color, MeshStandardMaterial>;

interface Props { leftLeg: RefObject<Group | null>; rightLeg: RefObject<Group | null> }
/** Optimized Sojinha visual. Local forward is -Z; one merged mesh per color. */
export function VisitSojinhaModel({ leftLeg, rightLeg }: Props) {
  const body = useMemo(bodyGeometry, []);
  const leg = useMemo(legGeometry, []);
  const logo = useMemo(shirtMark, []);
  const logoShape = useMemo(shirtLogoGeometry, []);
  useEffect(() => () => {
    // These merged geometries are passed as mesh props, so R3F does not own
    // their lifetime. Release them once when this visit instance unmounts.
    for (const geometry of Object.values(body)) geometry?.dispose();
    for (const geometry of Object.values(leg)) geometry?.dispose();
    logoShape.dispose();
  }, [body, leg, logoShape]);
  const renderParts = (item: Partial<Record<Color, BufferGeometry>>) =>
    (Object.keys(item) as Color[]).map(key => <mesh key={key} geometry={item[key]} material={MATERIALS[key]} raycast={NO_PICK}/>);
  return <>
    {renderParts(body)}
    <mesh geometry={logoShape} raycast={NO_PICK}>
      <meshBasicMaterial map={logo} transparent depthWrite={false} toneMapped={false} side={DoubleSide}/>
    </mesh>
    <group ref={leftLeg} position={[-.143, .404, 0]}>{renderParts(leg)}</group>
    <group ref={rightLeg} position={[.143, .404, 0]}>{renderParts(leg)}</group>
  </>;
}
