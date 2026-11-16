import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { CHOPP_TRUCK_CAB_AXIS_X, type resolveChoppTruckTransform } from '../../utils/choppTruck';
import { buildChoppTruckService } from './ChoppTruckService';
import { createChoppTruckReflectionTexture } from './choppTruckReflection';

type Vector = [number, number, number];
type Paint = 'wall' | 'roof' | 'dark' | 'glass' | 'trim' | 'white' | 'green';
type Finish = 'lamp' | 'inner-metal' | 'stainless' | 'beer' | 'reflector';
type Surface = Paint | Finish;
type BoxOptions = { bevel?: number; service?: boolean; tilt?: number };

const NO_RAYCAST = () => undefined;
const CONTACT_PLANE = new THREE.PlaneGeometry(1, 1);
const SIGN_PLANE = new THREE.PlaneGeometry(0.47, 0.104);
const CASTING_SURFACES = new Set<Surface>(['wall', 'roof', 'dark', 'stainless']);

export function createChoppTruckBatches(serviceYaw: number, serviceOrigin: readonly [number, number], detailed: boolean) {
  const pieces = new Map<Surface, THREE.BufferGeometry[]>();
  function add(surface: Surface, piece: THREE.BufferGeometry, position: Vector, service = false) {
    piece.translate(...position);
    // Work in the authored chassis frame. Its X mirror places the cab to the
    // west while the finished opening still uses the positive service yaw.
    if (service) {
      piece.rotateY(serviceYaw * CHOPP_TRUCK_CAB_AXIS_X)
        .translate(serviceOrigin[0] * CHOPP_TRUCK_CAB_AXIS_X, 0, serviceOrigin[1]);
    }
    const geometry = piece.index ? piece.toNonIndexed() : piece;
    if (piece !== geometry) piece.dispose();
    const list = pieces.get(surface) ?? [];
    list.push(geometry);
    pieces.set(surface, list);
  }
  function box(surface: Surface, size: Vector, position: Vector, { bevel = 0, service = false, tilt = 0 }: BoxOptions = {}) {
    const largeBevel = bevel >= 0.009 && (detailed || Math.max(...size) >= 0.19);
    const piece = largeBevel ? new RoundedBoxGeometry(...size, 1, bevel) : new THREE.BoxGeometry(...size);
    if (tilt !== 0) piece.rotateZ(tilt);
    add(surface, piece, position, service);
  }
  function cylinder(surface: Surface, radius: number, depth: number, position: Vector) {
    const piece = new THREE.CylinderGeometry(radius, radius, depth, detailed ? 14 : 10);
    add(surface, piece.rotateX(Math.PI / 2), position);
  }
  function cabPanel(surface: Surface, outline: THREE.Shape, depth: number, z: number, bevel: number) {
    const piece = new THREE.ExtrudeGeometry(outline, {
      depth: depth - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      curveSegments: detailed ? 5 : 3,
    });
    add(surface, piece, [0, 0, z - depth / 2 + bevel]);
  }

  // Three axles under the trailer and the steer/tandem axles of the tractor.
  const trackCenter = -0.171;
  box('dark', [2.017, 0.075, 0.392], [0, 0.209, trackCenter]);
  const tireShape = [
    [0, -0.043], [0.092, -0.043], [0.106, -0.023],
    [0.106, 0.023], [0.092, 0.043], [0, 0.043],
  ].map(([radius, z]) => new THREE.Vector2(radius, z));
  const axles = [-0.896, -0.672, -0.448, 0.286, 0.511, 0.877];
  for (const x of axles) {
    cylinder('dark', 0.024, 0.48, [x, 0.106, trackCenter]);
    for (const side of [-1, 1]) {
      const z = trackCenter + side * 0.254;
      add('dark', new THREE.LatheGeometry(tireShape, detailed ? 14 : 10).rotateX(Math.PI / 2), [x, 0.106, z]);
      add('stainless', new THREE.RingGeometry(0.041, 0.059, detailed ? 16 : 10).rotateY(side < 0 ? Math.PI : 0),
        [x, 0.106, z + side * 0.047]);
      cylinder('stainless', 0.024, 0.016, [x, 0.106, z + side * 0.055]);
      if (detailed) for (const [dx, dy] of [[0.039, 0], [-0.039, 0], [0, 0.039], [0, -0.039]]) {
        box('trim', [0.009, 0.009, 0.005], [x + dx, 0.106 + dy, z + side * 0.056]);
      }
    }
  }
  for (const side of [-1, 1]) {
    const z = trackCenter + side * 0.247;
    box('wall', [0.653, 0.073, 0.083], [-0.672, 0.239, z], { bevel: 0.013 });
    box('dark', [0.436, 0.053, 0.081], [0.398, 0.221, z]);
    box('trim', [0.221, 0.104, 0.115], [0.672, 0.183, z], { bevel: 0.02 });
    box('stainless', [0.19, 0.011, 0.082], [0.66, 0.244, z + side * 0.035]);
    add('dark', new THREE.TorusGeometry(0.119, 0.013, 3, detailed ? 16 : 10, Math.PI), [0.877, 0.106, z]);
    for (const x of [-0.975, 0.24, 0.77]) {
      box('dark', [0.017, 0.107, 0.087], [x, 0.104, z]);
    }
  }

  // Tall modern tractor cab. Separate trim around the raked glazing and floor.
  const cab = new THREE.Shape();
  cab.moveTo(0.556, 0.228);
  cab.lineTo(0.55, 0.711);
  cab.quadraticCurveTo(0.565, 0.776, 0.631, 0.79);
  cab.lineTo(0.809, 0.813);
  cab.quadraticCurveTo(0.877, 0.817, 0.909, 0.766);
  cab.lineTo(0.996, 0.595);
  cab.quadraticCurveTo(1.022, 0.559, 1.021, 0.512);
  cab.lineTo(1.027, 0.249);
  cab.quadraticCurveTo(1.016, 0.226, 0.97, 0.228);
  cab.lineTo(0.932, 0.228);
  cab.quadraticCurveTo(0.876, 0.285, 0.812, 0.229);
  cab.closePath();
  cabPanel('wall', cab, 0.562, trackCenter, 0.012);

  const deflector = new THREE.Shape();
  deflector.moveTo(0.554, 0.766);
  deflector.lineTo(0.554, 0.844);
  deflector.quadraticCurveTo(0.582, 0.864, 0.626, 0.865);
  deflector.quadraticCurveTo(0.74, 0.864, 0.861, 0.805);
  deflector.lineTo(0.818, 0.775);
  deflector.closePath();
  cabPanel('wall', deflector, 0.513, trackCenter, 0.01);

  box('dark', [0.029, 0.204, 0.493], [0.968, 0.69, trackCenter], { bevel: 0.009, tilt: 0.477 });
  box('glass', [0.022, 0.178, 0.465], [0.98, 0.69, trackCenter], { bevel: 0.008, tilt: 0.477 });
  box('dark', [0.012, 0.012, 0.414], [1.02, 0.614, trackCenter]);
  if (detailed) {
    box('dark', [0.01, 0.011, 0.14], [1.012, 0.632, trackCenter - 0.105]);
    box('dark', [0.01, 0.011, 0.14], [1.012, 0.632, trackCenter + 0.105]);
  }
  const doorGlass = new THREE.Shape();
  doorGlass.moveTo(0.651, 0.532);
  doorGlass.lineTo(0.654, 0.707);
  doorGlass.quadraticCurveTo(0.655, 0.739, 0.685, 0.745);
  doorGlass.lineTo(0.851, 0.755);
  doorGlass.quadraticCurveTo(0.879, 0.755, 0.898, 0.729);
  doorGlass.lineTo(0.975, 0.59);
  doorGlass.quadraticCurveTo(0.981, 0.57, 0.955, 0.562);
  doorGlass.lineTo(0.68, 0.526);
  doorGlass.closePath();
  for (const side of [-1, 1]) {
    const z = trackCenter + side * 0.282;
    cabPanel('dark', doorGlass, 0.012, z, 0.003);
    cabPanel('glass', doorGlass, 0.009, z + side * 0.008, 0.002);
    box('dark', [0.292, 0.01, 0.01], [0.819, 0.53, z + side * 0.005], { tilt: 0.119 });
    box('dark', [0.064, 0.019, 0.016], [0.702, 0.501, z + side * 0.005]);
    box('dark', [0.031, 0.018, 0.075], [0.951, 0.612, z + side * 0.031]);
    box('roof', [0.055, 0.096, 0.047], [0.953, 0.616, z + side * 0.061], { bevel: 0.01 });
    box('white', [0.022, 0.043, 0.105], [1.028, 0.302, trackCenter + side * 0.192], { bevel: 0.006 });
    box('lamp', [0.023, 0.011, 0.084], [1.03, 0.327, trackCenter + side * 0.193]);
    if (detailed) {
      box('inner-metal', [0.007, 0.235, 0.006], [0.652, 0.409, z - side * 0.002]);
      box('inner-metal', [0.158, 0.007, 0.006], [0.727, 0.29, z - side * 0.002]);
    }
  }
  box('dark', [0.022, 0.163, 0.274], [1.027, 0.417, trackCenter], { bevel: 0.01 });
  for (const y of [0.362, 0.394, 0.426, 0.458, 0.49]) {
    box('stainless', [0.008, 0.01, 0.251], [1.042, y, trackCenter]);
  }
  box('wall', [0.036, 0.038, 0.518], [1.031, 0.259, trackCenter], { bevel: 0.011 });

  // Long straight trailer rails, bright tall coachwork, two upward hinged hatches.
  box('wall', [1.555, 0.032, 0.357], [-0.249, 0.303, -0.321], { bevel: 0.01 });
  box('wall', [1.549, 0.614, 0.046], [-0.247, 0.623, -0.493], { bevel: 0.013 });
  box('roof', [1.55, 0.029, 0.54], [-0.249, 0.9455, -0.224], { bevel: 0.009 });
  box('roof', [0.89, 0.013, 0.112], [-0.235, 0.949, -0.24], { bevel: 0.008 });
  box('wall', [0.032, 0.601, 0.552], [-1.016, 0.623, -0.231], { bevel: 0.011 });
  box('wall', [0.034, 0.6, 0.479], [0.513, 0.62, -0.265], { bevel: 0.012 });
  box('stainless', [0.02, 0.057, 0.533], [-1.033, 0.247, -0.208]);
  for (const side of [-1, 1]) {
    box('reflector', [0.008, 0.025, 0.062], [-1.044, 0.277, -0.208 + side * 0.222]);
  }
  for (const x of [-0.958, -0.787, -0.615, -0.443, -0.271, -0.099, 0.073, 0.245, 0.417]) {
    box('reflector', [0.032, 0.011, 0.006], [x, 0.302, -0.503]);
  }
  if (detailed) for (const x of [-0.742, -0.394, -0.041, 0.299]) {
    box('inner-metal', [0.005, 0.538, 0.004], [x, 0.618, -0.517]);
  }

  const service = { service: true };
  box('wall', [1.392, 0.031, 0.144], [-0.004, 0.302, -0.092], service);
  box('stainless', [1.392, 0.017, 0.02], [-0.004, 0.304, -0.017], service);
  for (const x of [-0.618, -0.43, -0.239, -0.048, 0.14, 0.33, 0.522, 0.645]) {
    box('reflector', [0.023, 0.008, 0.006], [x, 0.303, -0.006], service);
  }
  box('stainless', [1.392, 0.036, 0.037], [-0.004, 0.329, 0.022], service);
  box('stainless', [1.392, 0.05, 0.046], [-0.004, 0.865, -0.013], service);
  for (const x of [-0.68, 0, 0.675]) {
    box('stainless', [0.031, 0.524, 0.054], [x, 0.592, 0.008], { ...service, bevel: 0.007 });
  }
  for (const side of [-1, 1]) {
    const x = side * 0.344;
    const awningWidth = 0.644;
    add('wall', new THREE.BoxGeometry(awningWidth, 0.023, 0.232).rotateX(-0.19), [x, 0.896, 0.092], true);
    box('stainless', [awningWidth, 0.023, 0.026], [x, 0.914, 0.202], service);
    box('inner-metal', [awningWidth, 0.017, 0.026], [x, 0.878, 0.005], service);
    for (const rib of detailed ? [-0.27, -0.15, -0.057, 0.057, 0.15, 0.27] : [-0.23, 0, 0.23]) {
      add('stainless', new THREE.BoxGeometry(0.009, 0.011, 0.208).rotateX(-0.19), [x + rib, 0.885, 0.09], true);
    }
    for (const support of [-0.284, 0.284]) {
      add('stainless', new THREE.BoxGeometry(0.012, 0.198, 0.013).rotateX(0.92), [x + support, 0.819, 0.084], true);
    }
    box('lamp', [0.269, 0.008, 0.014], [x, 0.881, 0.145], service);
  }
  box('green', [0.488, 0.107, 0.018], [0, 0.883, 0.214], { ...service, bevel: 0.007 });

  buildChoppTruckService({ add, box, detailed });
  for (const x of [-0.524, 0.524]) {
    add('beer', new THREE.CylinderGeometry(0.02, 0.017, 0.065, detailed ? 10 : 8), [x, 0.338, 0.101], true);
    add('white', new THREE.CylinderGeometry(0.021, 0.02, 0.009, detailed ? 10 : 8), [x, 0.374, 0.101], true);
  }

  return [...pieces].map(([surface, parts]) => {
    const geometry = mergeGeometries(parts)!;
    parts.forEach((part) => part.dispose());
    return { surface, geometry };
  });
}

function createSignTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#124132';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#c9b07a';
  ctx.lineWidth = 4;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  ctx.fillStyle = '#fff3d8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 70px sans-serif';
  ctx.fillText('CHOPP', canvas.width / 2, 53);
  ctx.font = '700 24px sans-serif';
  ctx.fillText('FENASOJA', canvas.width / 2, 99);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createContactTexture() {
  const size = 32;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot(2 * (x + 0.5) / size - 1, 2 * (y + 0.5) / size - 1);
      const index = (x + y * size) * 4;
      pixels.set([22, 25, 18, Math.round(130 * Math.max(0, 1 - radius ** 2) ** 2)], index);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export const ChoppTruck = memo(function ChoppTruck({
  transform,
  materials,
  detailed,
  reducedGraphics,
}: {
  transform: ReturnType<typeof resolveChoppTruckTransform>;
  materials: Record<Paint, THREE.MeshStandardMaterial>;
  detailed: boolean;
  reducedGraphics: boolean;
}) {
  const night = useCommercialMapStore((state) => state.nightModeActive);
  const { scale, serviceYaw, localServiceOrigin } = transform;
  const geometry = useMemo(
    () => createChoppTruckBatches(serviceYaw, localServiceOrigin, detailed && !reducedGraphics),
    [detailed, localServiceOrigin, reducedGraphics, serviceYaw],
  );
  const textures = useMemo(() => ({
    sign: createSignTexture(),
    contact: createContactTexture(),
    reflection: createChoppTruckReflectionTexture(),
  }), []);
  useEffect(() => () => geometry.forEach(({ geometry }) => geometry.dispose()), [geometry]);
  useEffect(() => () => {
    textures.sign?.dispose();
    textures.contact.dispose();
    textures.reflection.dispose();
  }, [textures]);
  const finishes: Record<Finish, THREE.MeshStandardMaterialParameters> = {
    lamp: { color: '#f5e0b9', emissive: '#f5c477', emissiveIntensity: night ? 1.6 : 0.4 },
    stainless: {
      color: '#e4e8e6', metalness: 0.75, roughness: 0.22,
      emissive: '#b8bcac', emissiveIntensity: night ? 0.18 : 0.04,
      envMap: textures.reflection, envMapIntensity: night ? 0.48 : 0.95,
    },
    'inner-metal': { color: '#adb3af', metalness: 0.31, roughness: 0.43, emissive: '#bdad87', emissiveIntensity: night ? 0.18 : 0 },
    beer: { color: '#d59331', roughness: 0.3, metalness: 0.08, emissive: '#a56a21', emissiveIntensity: night ? 0.32 : 0.06 },
    reflector: { color: '#997064', roughness: 0.42, emissive: '#c24526', emissiveIntensity: night ? 0.38 : 0.09 },
  };

  return (
    <group name="chopp-truck-model" scale={scale}>
      <mesh geometry={CONTACT_PLANE} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, -0.109]}
        scale={[2.10, 0.84, 1]} raycast={NO_RAYCAST}>
        <meshBasicMaterial map={textures.contact} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <group name="chopp-truck-chassis" scale={[CHOPP_TRUCK_CAB_AXIS_X, 1, 1]}>
        {geometry.map(({ surface, geometry }) => (
          <mesh key={surface} geometry={geometry} raycast={NO_RAYCAST}
            castShadow={!reducedGraphics && CASTING_SURFACES.has(surface)} receiveShadow>
            {surface in finishes
              ? <meshStandardMaterial {...finishes[surface as Finish]} />
              : <primitive attach="material" object={materials[surface as Paint]} />}
          </mesh>
        ))}
      </group>
      <group rotation={[0, serviceYaw, 0]} position={[localServiceOrigin[0], 0, localServiceOrigin[1]]}>
        <mesh geometry={SIGN_PLANE} position={[0, 0.883, 0.225]} raycast={NO_RAYCAST}>
          <meshBasicMaterial color={night ? '#fff0d4' : '#ffffff'} map={textures.sign} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
});
