import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ARVOREDO_FIXTURE_DIMENSIONS,
  RESTAURANT_FRONTAGE_LAYOUT,
  type ArvoredoFixture,
  type ArvoredoPlantBed,
} from '../../utils/restaurantFrontage';
import { FRONTAGE_NO_RAYCAST, FrontageInstances, type FrontageInstance } from './RestaurantFrontageInstances';

type Point3 = [number, number, number];

const LOG = new THREE.CylinderGeometry(0.47, 0.5, 1, 8);
const GLOBE = new THREE.SphereGeometry(0.5, 12, 8);
const SIGN = new THREE.PlaneGeometry(1, 1);
const UP = new THREE.Vector3(0, 1, 0);
const GROUND = RESTAURANT_FRONTAGE_LAYOUT.slab.topElevation;
const WOOD_TINTS = ['#fff1d7', '#eee1c8', '#d4c6af', '#b9aa92'].map((color) => new THREE.Color(color));
const OCHRE_TINTS = ['#fff0cc', '#eddfc1', '#ffe6ac'].map((color) => new THREE.Color(color));
const LEAF_TINTS = ['#577639', '#6c8737', '#3a643b', '#7c9b41'].map((color) => new THREE.Color(color));

function createCanopyGeometry() {
  const shape = new THREE.Shape();
  const curve = [[-0.5, 0.012], [-0.3, 0.041], [0, 0.056], [0.3, 0.041], [0.5, 0.012]];
  curve.forEach(([x, y], i) => i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y));
  curve.slice().reverse().forEach(([x, y]) => shape.lineTo(x, y - 0.012));
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1 })
    .translate(0, 0, -0.5)
    .rotateY(Math.PI / 2);
}

function createLeafGeometry(palm: boolean) {
  const segments = palm ? 10 : 5;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const curve = palm ? 0.23 * Math.sin(t * Math.PI) - 0.25 * t * t : 0.68 * t - 0.40 * t * t;
    const edge = Math.sin(t * Math.PI) * (palm && i % 2 === 0 ? 0.28 : 1);
    vertices.push(t, curve - edge * 0.036, -edge, t, curve, 0, t, curve - edge * 0.036, edge);
    if (i < segments) {
      const v = 3 * i;
      indices.push(v, v + 3, v + 1, v + 1, v + 3, v + 4, v + 1, v + 4, v + 2, v + 2, v + 4, v + 5);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const CANOPY = createCanopyGeometry();
const PALM_FROND = createLeafGeometry(true);
const BROAD_LEAF = createLeafGeometry(false);

function yawQuaternion(yaw: number) {
  return new THREE.Quaternion().setFromAxisAngle(UP, yaw);
}

function placedItem(
  fixture: ArvoredoFixture,
  [x, y, z]: Point3,
  scale: Point3,
  tint?: THREE.Color,
): FrontageInstance {
  const rotation = yawQuaternion(fixture.yaw);
  const point = new THREE.Vector3(x, y, z).applyQuaternion(rotation);
  return {
    position: [fixture.center[0] + point.x, GROUND + point.y, fixture.center[1] + point.z],
    scale,
    rotation,
    tint,
  };
}

function beam(
  fixture: ArvoredoFixture,
  a: Point3,
  b: Point3,
  crossSection: number,
  tint: THREE.Color,
): FrontageInstance {
  const direction = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
  const center: Point3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const item = placedItem(fixture, center, [crossSection, direction.length(), crossSection], tint);
  item.rotation?.multiply(new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()));
  return item;
}

function buildFurniture(portal: ArvoredoFixture | null, benches: readonly ArvoredoFixture[], detailed: boolean) {
  const logs: FrontageInstance[] = [];
  const boards: FrontageInstance[] = [];
  const covers: FrontageInstance[] = [];
  const mounts: FrontageInstance[] = [];
  const globes: FrontageInstance[] = [];
  const { portal: portalSize, canopy } = ARVOREDO_FIXTURE_DIMENSIONS;
  if (portal) {
    const x = (portalSize.openingWidth + portalSize.postDiameter) / 2;
    for (const side of [-1, 1]) {
      for (const [index, z] of [-0.051, 0.052].entries()) {
        const height = portalSize.height - 0.035 * index;
        logs.push(placedItem(portal, [side * x, height / 2, z], [portalSize.postDiameter, height, portalSize.postDiameter], WOOD_TINTS[index + 1]));
      }
    }
    for (const [index, y] of [1.28, 1.40, 1.52].entries()) {
      logs.push(beam(portal, [-portal.width / 2, y, 0.042], [portal.width / 2, y, 0.042], 0.075, WOOD_TINTS[index]));
      for (const side of [-1, 1]) {
        logs.push(beam(portal, [side * x, y, -0.145], [side * x, y, 0.147], 0.058, WOOD_TINTS[(index + 2) % WOOD_TINTS.length]));
        if (detailed) mounts.push(placedItem(portal, [side * x, y, 0.147], [0.017, 0.017, 0.006]));
      }
    }
    if (detailed) for (const side of [-1, 1]) {
      mounts.push(placedItem(portal, [side * x, 0.93, 0.08], [0.039, 0.016, 0.086]));
      globes.push(placedItem(portal, [side * x, 0.873, 0.10], [0.092, 0.092, 0.092]));
    }
  }

  benches.forEach((fixture, index) => {
    const postX = fixture.width / 2 - 0.036;
    const postZ = -0.034;
    const support = canopy.height + 0.037;
    const seats = fixture.width > 0.9 || detailed ? 3 : 2;
    const seatLength = fixture.width - 0.04;
    const seatTop = 0.217;
    const backTop = 0.398;
    const backZ = -0.053;
    covers.push(placedItem(fixture, [0, canopy.height, 0], [fixture.width, 1, fixture.depth], OCHRE_TINTS[index % OCHRE_TINTS.length]));
    boards.push(placedItem(fixture, [0, support - 0.016, postZ], [fixture.width - 0.015, 0.035, 0.041], WOOD_TINTS[2]));
    for (const side of [-1, 1]) {
      const x = postX * side;
      const postHeight = support + 0.079 + (index % 2) * 0.016;
      logs.push(placedItem(fixture, [x, postHeight / 2, postZ], [0.061, postHeight, 0.061], WOOD_TINTS[index % WOOD_TINTS.length]));
      // The saddle runs under the curved surface and bears directly on the pole.
      boards.push(placedItem(fixture, [x, canopy.height + 0.017, 0], [0.036, 0.032, fixture.depth - 0.016], WOOD_TINTS[2]));
      if (detailed || side === -1) {
        const globeY = canopy.height - 0.22;
        mounts.push(placedItem(fixture, [x, globeY + 0.050, 0.01], [0.039, 0.016, 0.097]));
        mounts.push(placedItem(fixture, [x, globeY + 0.040, 0.057], [0.051, 0.026, 0.051]));
        globes.push(placedItem(fixture, [x, globeY, 0.057], [0.093, 0.093, 0.093]));
      }
    }

    const plankOffsets = detailed ? [-0.034, 0.012, 0.058] : [0.012];
    plankOffsets.forEach((z, plank) => {
      boards.push(placedItem(fixture, [0, seatTop - 0.009, z], [seatLength, 0.018, detailed ? 0.042 : 0.135], WOOD_TINTS[plank]));
    });
    for (const y of [seatTop - 0.036, seatTop + 0.026, backTop]) {
      boards.push(placedItem(fixture, [0, y, backZ], [seatLength, 0.026, 0.023], WOOD_TINTS[1]));
    }
    for (let i = 0; i <= seats; i += 1) {
      const x = -postX + 2 * postX * i / seats;
      boards.push(placedItem(fixture, [x, backTop / 2, backZ], [0.029, backTop, 0.032], WOOD_TINTS[2]));
      boards.push(placedItem(fixture, [x, seatTop / 2, 0.060], [0.029, seatTop, 0.035], WOOD_TINTS[3]));
      if (i === seats) continue;
      const next = x + 2 * postX / seats;
      const braceSize = detailed ? 0.018 : 0.023;
      boards.push(beam(fixture, [x, seatTop + 0.03, backZ], [next, backTop, backZ], braceSize, WOOD_TINTS[1]));
      boards.push(beam(fixture, [x, backTop, backZ], [next, seatTop + 0.03, backZ], braceSize, WOOD_TINTS[2]));
    }
  });
  return { logs, boards, covers, mounts, globes };
}

function buildPlantings(plantBeds: readonly ArvoredoPlantBed[], detailed: boolean) {
  const bases: FrontageInstance[] = [];
  const palmStems: FrontageInstance[] = [];
  const palmLeaves: FrontageInstance[] = [];
  const broadLeaves: FrontageInstance[] = [];
  plantBeds.forEach(({ center: [x, z], size, kind }, index) => {
    const palm = kind === 'palm-clump';
    bases.push({ position: [x, GROUND + 0.030, z], scale: [size[0], 0.06, size[1]] });
    const stems = palm ? (detailed ? 5 : 3) : 1;
    for (let stem = 0; stem < stems; stem += 1) {
      const angle = stem * 2.39996 + index * 0.78;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const height = palm ? 1.04 + (stem % 3) * 0.27 + (index === 0 ? 0.16 : 0) : 0.19;
      const flare = palm ? 0.10 + (stem % 2) * 0.045 : 0;
      const tip: Point3 = [x + dx * flare, GROUND + height, z + dz * flare];
      if (palm) {
        const bottom: Point3 = [x + dx * 0.045, GROUND + 0.05, z + dz * 0.045];
        const vec = new THREE.Vector3(...tip).sub(new THREE.Vector3(...bottom));
        palmStems.push({
          position: [(tip[0] + bottom[0]) / 2, (tip[1] + bottom[1]) / 2, (tip[2] + bottom[2]) / 2],
          scale: [0.025, vec.length(), 0.023],
          rotation: new THREE.Quaternion().setFromUnitVectors(UP, vec.normalize()),
          tint: WOOD_TINTS[stem % WOOD_TINTS.length],
        });
      }
      const count = palm ? (detailed ? 7 : 5) : (detailed ? 15 : 8);
      for (let leaf = 0; leaf < count; leaf += 1) {
        const yaw = angle + 2 * Math.PI * leaf / count;
        const leafScale = palm ? 0.33 + (leaf % 3) * 0.049 : 0.20 + (leaf % 4) * 0.03;
        const spread = palm ? 0 : 0.07;
        const rotation = yawQuaternion(yaw);
        rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), palm ? 0.26 : (leaf % 3) * 0.27));
        (palm ? palmLeaves : broadLeaves).push({
          position: [tip[0] + Math.cos(yaw) * spread, tip[1], tip[2] - Math.sin(yaw) * spread],
          scale: [leafScale, leafScale, palm ? 0.067 : 0.062],
          rotation,
          tint: LEAF_TINTS[(index + leaf + stem) % LEAF_TINTS.length],
        });
      }
    }
  });
  return { bases, palmStems, palmLeaves, broadLeaves };
}

function createPortalSign() {
  const canvas = document.createElement('canvas');
  canvas.width = 416;
  canvas.height = 190;
  const context = canvas.getContext('2d');
  if (context) {
    const paint = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    paint.addColorStop(0, '#75433c');
    paint.addColorStop(1, '#603330');
    context.fillStyle = paint;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#9a6b62';
    context.lineWidth = 2;
    context.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    context.fillStyle = '#f1e8d6';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '700 33px Arial, sans-serif';
    context.fillText('CALÇADA DO', canvas.width / 2, 55);
    context.font = 'italic 700 73px Arial, sans-serif';
    context.fillText('Arvoredo', canvas.width / 2, 118);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function RestaurantFrontageFurniture({
  portal,
  benches,
  plantBeds,
  night,
  reducedGraphics,
  vegetationVisible,
}: {
  portal: ArvoredoFixture | null;
  benches: readonly ArvoredoFixture[];
  plantBeds: readonly ArvoredoPlantBed[];
  night: boolean;
  reducedGraphics: boolean;
  vegetationVisible: boolean;
}) {
  const [near, setNear] = useState(false);
  const nearRef = useRef(false);
  const target = portal?.center ?? benches[0]?.center;
  useFrame(({ camera }) => {
    if (!target || reducedGraphics) return;
    const distance = Math.hypot(camera.position.x - target[0], camera.position.y, camera.position.z - target[1]);
    const next = distance < ARVOREDO_FIXTURE_DIMENSIONS.detailDistance + (nearRef.current ? 2 : 0);
    if (next !== nearRef.current) {
      nearRef.current = next;
      setNear(next);
    }
  });
  const detailed = near && !reducedGraphics;
  const pieces = useMemo(() => buildFurniture(portal, benches, detailed), [benches, detailed, portal]);
  const plants = useMemo(() => buildPlantings(plantBeds, detailed), [detailed, plantBeds]);
  const invalidate = useThree((state) => state.invalidate);
  const { materials, texture } = useMemo(() => {
    const texture = createPortalSign();
    return {
      texture,
      materials: {
        logs: new THREE.MeshStandardMaterial({ color: '#705c47', roughness: 0.96 }),
        boards: new THREE.MeshStandardMaterial({ color: '#71573a', roughness: 0.92 }),
        covers: new THREE.MeshStandardMaterial({ color: '#b77c2d', roughness: 0.84 }),
        mounts: new THREE.MeshStandardMaterial({ color: '#49423c', roughness: 0.82 }),
        globes: new THREE.MeshStandardMaterial({ color: '#f3eddc', roughness: 0.56, emissive: '#ffe1a5', emissiveIntensity: 0 }),
        plaque: new THREE.MeshStandardMaterial({ map: texture, roughness: 0.88 }),
        slab: new THREE.MeshStandardMaterial({ color: '#655347', roughness: 0.95 }),
        leaves: new THREE.MeshStandardMaterial({ color: '#d5dbab', roughness: 0.93, side: THREE.DoubleSide }),
      },
    };
  }, []);
  useEffect(() => () => {
    texture.dispose();
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials, texture]);
  useEffect(() => {
    materials.globes.emissiveIntensity = night ? 0.46 : 0;
    invalidate();
  }, [invalidate, materials.globes, night]);

  const signWidth = 0.78;
  const signHeight = 0.34;
  const signY = 1.414;
  const signBacking = useMemo(
    () => portal ? [placedItem(portal, [0, signY, 0.088], [signWidth, signHeight, 0.034], WOOD_TINTS[2])] : [],
    [portal],
  );
  return (
    <group name="restaurant-frontage:arvoredo-fixtures" userData={{ presentationOnly: true }} dispose={null}>
      <FrontageInstances name="restaurant-frontage:arvoredo-logs" items={pieces.logs} geometry={LOG} material={materials.logs} castShadow={!reducedGraphics} />
      <FrontageInstances name="restaurant-frontage:arvoredo-bench-wood" items={pieces.boards} material={materials.boards} castShadow={detailed} />
      <FrontageInstances name="restaurant-frontage:bench-canopies" items={pieces.covers} geometry={CANOPY} material={materials.covers} castShadow={!reducedGraphics} receiveShadow />
      <FrontageInstances name="restaurant-frontage:lamp-mounts" items={pieces.mounts} material={materials.mounts} />
      <FrontageInstances name="restaurant-frontage:lamp-globes" items={pieces.globes} geometry={GLOBE} material={materials.globes} />
      <FrontageInstances name="restaurant-frontage:portal-backing" items={signBacking} material={materials.logs} />
      {portal && (
        <mesh
          name="restaurant-frontage:portal-sign"
          position={[
            portal.center[0] + 0.107 * Math.sin(portal.yaw),
            GROUND + signY,
            portal.center[1] + 0.107 * Math.cos(portal.yaw),
          ]}
          rotation={[0, portal.yaw, 0]}
          scale={[signWidth, signHeight, 1]}
          geometry={SIGN}
          material={materials.plaque}
          raycast={FRONTAGE_NO_RAYCAST}
          receiveShadow
          dispose={null}
        />
      )}
      <FrontageInstances name="restaurant-frontage:plant-beds" items={plants.bases} material={materials.slab} receiveShadow />
      {vegetationVisible && (
        <>
          <FrontageInstances name="restaurant-frontage:palm-stems" items={plants.palmStems} geometry={LOG} material={materials.logs} />
          <FrontageInstances name="restaurant-frontage:palm-fronds" items={plants.palmLeaves} geometry={PALM_FROND} material={materials.leaves} />
          <FrontageInstances name="restaurant-frontage:broad-leaves" items={plants.broadLeaves} geometry={BROAD_LEAF} material={materials.leaves} />
        </>
      )}
    </group>
  );
}
