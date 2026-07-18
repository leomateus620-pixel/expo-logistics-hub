import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  LIVESTOCK_PAVILION_RENDER_BUDGET,
  type LivestockCattlePose,
} from '../../utils/livestockPavilion';

const NO_RAYCAST = () => undefined;
const CATTLE_BODY = new THREE.SphereGeometry(0.5, 12, 8);
const CATTLE_DETAIL = new THREE.SphereGeometry(0.5, 9, 7);
const CATTLE_HEAD = new THREE.SphereGeometry(0.5, 10, 7);
const CATTLE_LEG = new THREE.CylinderGeometry(0.5, 0.43, 1, 7);
const CATTLE_HOOF = new THREE.CylinderGeometry(0.52, 0.56, 1, 7);
const CATTLE_EAR = new THREE.ConeGeometry(0.5, 1, 6);
const CATTLE_HORN = new THREE.ConeGeometry(0.5, 1, 7);
const CATTLE_PATCH = new THREE.SphereGeometry(0.5, 8, 5);
const CATTLE_SHADOW = new THREE.CircleGeometry(0.5, 18);

type Vector3Tuple = [number, number, number];
type CattleMotionKind = 'breath' | 'head' | 'tail';

interface CattleMotion {
  kind: CattleMotionKind;
  phase: number;
  speed: number;
  amplitude: number;
}

interface CattleInstance {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
  color: string;
  motion?: CattleMotion;
}

interface ShadowInstance {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation: Vector3Tuple;
}

function rotatedOffset(rotationY: number, forward: number, lateral = 0) {
  return {
    x: Math.cos(rotationY) * forward + Math.sin(rotationY) * lateral,
    z: -Math.sin(rotationY) * forward + Math.cos(rotationY) * lateral,
  };
}

function setInstanceTransform(
  object: THREE.Object3D,
  item: CattleInstance,
  elapsed: number,
  motionEnabled: boolean,
) {
  object.position.set(...item.position);
  object.rotation.set(...(item.rotation ?? [0, 0, 0]));
  object.scale.set(...item.scale);

  if (motionEnabled && item.motion) {
    const wave = Math.sin(elapsed * item.motion.speed + item.motion.phase);
    if (item.motion.kind === 'breath') {
      object.scale.y *= 1 + wave * item.motion.amplitude;
      object.position.y += wave * item.motion.amplitude * 0.035;
    } else if (item.motion.kind === 'head') {
      object.rotation.z += wave * item.motion.amplitude;
      object.position.y += wave * item.motion.amplitude * 0.035;
    } else {
      object.rotation.x += wave * item.motion.amplitude;
      object.rotation.z += Math.sin(elapsed * item.motion.speed * 0.63 + item.motion.phase) * item.motion.amplitude * 0.35;
    }
  }
  object.updateMatrix();
}

function ColoredCattleInstances({
  geometry,
  material,
  items,
  animate,
  castShadow = false,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  items: CattleInstance[];
  animate: boolean;
  castShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const motionIndices = useMemo(
    () => items.flatMap((item, index) => item.motion ? [index] : []),
    [items],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    const color = new THREE.Color();
    items.forEach((item, index) => {
      setInstanceTransform(object, item, 0, false);
      mesh.setMatrixAt(index, object.matrix);
      mesh.setColorAt(index, color.set(item.color));
    });
    mesh.instanceMatrix.setUsage(motionIndices.length ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [items, motionIndices.length]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh || !animate || motionIndices.length === 0) return;
    const elapsed = clock.getElapsedTime();
    const object = new THREE.Object3D();
    motionIndices.forEach((index) => {
      const item = items[index];
      if (!item) return;
      setInstanceTransform(object, item, elapsed, true);
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow
      raycast={NO_RAYCAST}
    />
  );
}

function CattleContactShadows({
  items,
  material,
}: {
  items: ShadowInstance[];
  material: THREE.MeshBasicMaterial;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    items.forEach((item, index) => {
      object.position.set(...item.position);
      object.rotation.set(...item.rotation);
      object.scale.set(...item.scale);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [items]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[CATTLE_SHADOW, material, items.length]}
      renderOrder={1}
      raycast={NO_RAYCAST}
    />
  );
}

function motionFor(
  pose: LivestockCattlePose,
  kind: CattleMotionKind,
  amplitude: number,
): CattleMotion | undefined {
  if (!pose.animated) return undefined;
  return {
    kind,
    phase: pose.animationPhase + (kind === 'tail' ? 1.7 : kind === 'head' ? 0.6 : 0),
    speed: kind === 'breath' ? 1.15 : kind === 'head' ? 0.72 : 1.38,
    amplitude,
  };
}

export const LivestockCattle = memo(function LivestockCattle({
  poses,
  castShadow = false,
  animate = false,
}: {
  poses: LivestockCattlePose[];
  castShadow?: boolean;
  animate?: boolean;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const motionAllowed = useMemo(() => animate
    && poses.some((pose) => pose.animated)
    && (typeof window === 'undefined'
      || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches), [animate, poses]);
  const materials = useMemo(() => ({
    coat: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.88,
      metalness: 0,
      emissive: '#332c26',
      emissiveIntensity: 0.06,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.96,
      metalness: 0,
      emissive: '#171411',
      emissiveIntensity: 0.05,
    }),
    bone: new THREE.MeshStandardMaterial({
      color: '#e4d5ad',
      roughness: 0.82,
      metalness: 0,
    }),
    shadow: new THREE.MeshBasicMaterial({
      color: '#2b241d',
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  }), []);

  useEffect(() => {
    if (!motionAllowed || typeof window === 'undefined') return undefined;
    const interval = window.setInterval(
      () => invalidate(),
      Math.round(1000 / LIVESTOCK_PAVILION_RENDER_BUDGET.animationFps),
    );
    invalidate();
    return () => window.clearInterval(interval);
  }, [invalidate, motionAllowed]);

  useEffect(() => () => {
    materials.coat.dispose();
    materials.dark.dispose();
    materials.bone.dispose();
    materials.shadow.dispose();
  }, [materials]);

  const transforms = useMemo(() => {
    const bodies: CattleInstance[] = [];
    const shoulders: CattleInstance[] = [];
    const humps: CattleInstance[] = [];
    const necks: CattleInstance[] = [];
    const heads: CattleInstance[] = [];
    const muzzles: CattleInstance[] = [];
    const legs: CattleInstance[] = [];
    const hooves: CattleInstance[] = [];
    const ears: CattleInstance[] = [];
    const horns: CattleInstance[] = [];
    const tails: CattleInstance[] = [];
    const tailTufts: CattleInstance[] = [];
    const patches: CattleInstance[] = [];
    const shadows: ShadowInstance[] = [];

    poses.forEach((pose) => {
      const scale = pose.scale;
      const [x, baseY, z] = pose.position;
      const resting = pose.stance === 'resting';
      const feeding = pose.stance === 'feeding';
      const lengthRatio = pose.build === 'heavy' ? 1.08 : pose.build === 'compact' ? 0.92 : 1;
      const heightRatio = pose.build === 'heavy' ? 1.06 : pose.build === 'compact' ? 0.94 : 1;
      const widthRatio = pose.build === 'heavy' ? 1.08 : pose.build === 'compact' ? 0.92 : 1;
      const bodyLength = 0.78 * scale * lengthRatio;
      const bodyHeight = (resting ? 0.36 : 0.43) * scale * heightRatio;
      const bodyWidth = 0.37 * scale * widthRatio;
      const bodyY = baseY + (resting ? 0.23 : 0.43) * scale;
      const headForward = (feeding ? 0.58 : resting ? 0.49 : 0.53) * scale * lengthRatio;
      const muzzleForward = headForward + 0.16 * scale;
      const headY = baseY + (feeding ? 0.27 : resting ? 0.27 : 0.43) * scale;
      const muzzleY = headY - (feeding ? 0.08 : 0.055) * scale;
      const shoulderOffset = rotatedOffset(pose.rotationY, 0.2 * scale * lengthRatio);
      const neckOffset = rotatedOffset(pose.rotationY, 0.36 * scale * lengthRatio);
      const headOffset = rotatedOffset(pose.rotationY, headForward);
      const muzzleOffset = rotatedOffset(pose.rotationY, muzzleForward);
      const bodyMotion = motionFor(pose, 'breath', 0.018);
      const headMotion = motionFor(pose, 'head', feeding ? 0.045 : 0.075);
      const tailMotion = motionFor(pose, 'tail', 0.16);
      const headColor = pose.marking === 'white-face' ? pose.secondaryCoat : pose.coat;

      bodies.push({
        position: [x, bodyY, z],
        scale: [bodyLength, bodyHeight, bodyWidth],
        rotation: [0, pose.rotationY, 0],
        color: pose.coat,
        motion: bodyMotion,
      });
      shoulders.push({
        position: [x + shoulderOffset.x, bodyY + 0.015 * scale, z + shoulderOffset.z],
        scale: [0.42 * scale, bodyHeight * 1.04, bodyWidth * 1.04],
        rotation: [0, pose.rotationY, 0],
        color: pose.coat,
        motion: bodyMotion,
      });
      if (pose.build === 'heavy') {
        humps.push({
          position: [
            x + shoulderOffset.x * 0.88,
            bodyY + bodyHeight * 0.43,
            z + shoulderOffset.z * 0.88,
          ],
          scale: [0.32 * scale, 0.2 * scale, bodyWidth * 0.88],
          rotation: [0, pose.rotationY, 0],
          color: pose.coat,
          motion: bodyMotion,
        });
      }
      necks.push({
        position: [x + neckOffset.x, headY + 0.02 * scale, z + neckOffset.z],
        scale: [0.34 * scale, feeding ? 0.39 * scale : 0.34 * scale, 0.3 * scale],
        rotation: [0, pose.rotationY, feeding ? -0.48 : -0.18],
        color: headColor,
        motion: headMotion,
      });
      heads.push({
        position: [x + headOffset.x, headY, z + headOffset.z],
        scale: [0.32 * scale, 0.28 * scale, 0.24 * scale],
        rotation: [0, pose.rotationY + pose.headYaw, feeding ? -0.38 : -0.12],
        color: headColor,
        motion: headMotion,
      });
      muzzles.push({
        position: [x + muzzleOffset.x, muzzleY, z + muzzleOffset.z],
        scale: [0.17 * scale, 0.15 * scale, 0.2 * scale],
        rotation: [0, pose.rotationY + pose.headYaw, feeding ? -0.22 : 0],
        color: pose.marking === 'dark-points' ? pose.secondaryCoat : '#3b3029',
        motion: headMotion,
      });

      const legForwards = [-0.24, 0.23];
      const legSides = [-0.12, 0.12];
      legForwards.forEach((forward, forwardIndex) => {
        legSides.forEach((lateral, lateralIndex) => {
          const legOffset = rotatedOffset(
            pose.rotationY,
            forward * scale * lengthRatio,
            lateral * scale * widthRatio,
          );
          if (resting) {
            legs.push({
              position: [
                x + legOffset.x,
                baseY + 0.085 * scale,
                z + legOffset.z,
              ],
              scale: [0.072 * scale, 0.2 * scale, 0.072 * scale],
              rotation: [
                lateralIndex === 0 ? 0.16 : -0.16,
                pose.rotationY,
                forwardIndex === 0 ? 1.08 : -1.08,
              ],
              color: pose.coat,
            });
          } else {
            legs.push({
              position: [x + legOffset.x, baseY + 0.18 * scale, z + legOffset.z],
              scale: [0.072 * scale, 0.34 * scale, 0.072 * scale],
              rotation: [0, pose.rotationY, (forwardIndex + lateralIndex) % 2 ? 0.025 : -0.02],
              color: pose.coat,
              motion: bodyMotion,
            });
            hooves.push({
              position: [x + legOffset.x, baseY + 0.027 * scale, z + legOffset.z],
              scale: [0.085 * scale, 0.055 * scale, 0.105 * scale],
              rotation: [0, pose.rotationY, 0],
              color: pose.marking === 'dark-points' ? pose.secondaryCoat : '#292421',
            });
          }
        });
      });

      [-1, 1].forEach((side) => {
        const earOffset = rotatedOffset(
          pose.rotationY,
          headForward - 0.015 * scale,
          side * 0.14 * scale,
        );
        ears.push({
          position: [x + earOffset.x, headY + 0.135 * scale, z + earOffset.z],
          scale: [0.105 * scale, 0.145 * scale, 0.07 * scale],
          rotation: [Math.PI / 2, pose.rotationY + pose.headYaw, side * 0.62],
          color: pose.marking === 'dark-points' ? pose.secondaryCoat : headColor,
          motion: headMotion,
        });
        if (pose.horned) {
          const hornOffset = rotatedOffset(
            pose.rotationY,
            headForward + 0.015 * scale,
            side * 0.072 * scale,
          );
          horns.push({
            position: [x + hornOffset.x, headY + 0.18 * scale, z + hornOffset.z],
            scale: [0.055 * scale, 0.19 * scale, 0.055 * scale],
            rotation: [0, pose.rotationY + pose.headYaw, side * 0.54],
            color: '#e4d5ad',
            motion: headMotion,
          });
        }
      });

      const tailBase = rotatedOffset(pose.rotationY, -0.43 * scale * lengthRatio);
      const tailTip = rotatedOffset(pose.rotationY, -0.46 * scale * lengthRatio, 0.04 * scale);
      tails.push({
        position: [x + tailBase.x, bodyY - 0.1 * scale, z + tailBase.z],
        scale: [0.045 * scale, 0.32 * scale, 0.045 * scale],
        rotation: [0.08, pose.rotationY, 0.14],
        color: pose.coat,
        motion: tailMotion,
      });
      tailTufts.push({
        position: [x + tailTip.x, bodyY - 0.275 * scale, z + tailTip.z],
        scale: [0.09 * scale, 0.12 * scale, 0.09 * scale],
        rotation: [0, pose.rotationY, 0],
        color: pose.marking === 'dark-points' ? pose.secondaryCoat : '#2d2723',
        motion: tailMotion,
      });

      if (pose.marking === 'pied') {
        [-1, 1].forEach((side, patchIndex) => {
          const patchOffset = rotatedOffset(
            pose.rotationY,
            (patchIndex === 0 ? -0.08 : 0.16) * scale,
            side * bodyWidth * 0.5,
          );
          patches.push({
            position: [x + patchOffset.x, bodyY + 0.015 * scale, z + patchOffset.z],
            scale: [0.28 * scale, 0.18 * scale, 0.035 * scale],
            rotation: [0, pose.rotationY, patchIndex === 0 ? 0.22 : -0.18],
            color: pose.secondaryCoat,
            motion: bodyMotion,
          });
        });
      }

      shadows.push({
        position: [x, baseY + 0.008, z],
        scale: [bodyLength * 1.18, bodyWidth * 1.12, 1],
        rotation: [-Math.PI / 2, 0, -pose.rotationY],
      });
    });

    return {
      bodies,
      coatDetails: [...shoulders, ...humps, ...necks],
      ears,
      heads,
      hooves,
      horns,
      legAndTails: [...legs, ...tails],
      muzzles,
      patches,
      shadows,
      tailTufts,
    };
  }, [poses]);

  return (
    <group raycast={NO_RAYCAST}>
      <CattleContactShadows items={transforms.shadows} material={materials.shadow} />
      <ColoredCattleInstances geometry={CATTLE_BODY} material={materials.coat} items={transforms.bodies} animate={motionAllowed} castShadow={castShadow} />
      <ColoredCattleInstances geometry={CATTLE_DETAIL} material={materials.coat} items={transforms.coatDetails} animate={motionAllowed} castShadow={castShadow} />
      <ColoredCattleInstances geometry={CATTLE_HEAD} material={materials.coat} items={transforms.heads} animate={motionAllowed} castShadow={castShadow} />
      <ColoredCattleInstances geometry={CATTLE_HEAD} material={materials.dark} items={transforms.muzzles} animate={motionAllowed} />
      <ColoredCattleInstances geometry={CATTLE_LEG} material={materials.coat} items={transforms.legAndTails} animate={motionAllowed} />
      <ColoredCattleInstances geometry={CATTLE_HOOF} material={materials.dark} items={transforms.hooves} animate={false} />
      <ColoredCattleInstances geometry={CATTLE_EAR} material={materials.coat} items={transforms.ears} animate={motionAllowed} />
      <ColoredCattleInstances geometry={CATTLE_HORN} material={materials.bone} items={transforms.horns} animate={motionAllowed} />
      <ColoredCattleInstances geometry={CATTLE_DETAIL} material={materials.dark} items={transforms.tailTufts} animate={motionAllowed} />
      <ColoredCattleInstances geometry={CATTLE_PATCH} material={materials.coat} items={transforms.patches} animate={motionAllowed} />
    </group>
  );
});
