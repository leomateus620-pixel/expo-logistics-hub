import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { CylinderGeometry } from 'three';
import {
  addBox, addCylinder, addPart, addPlane, addTorus, addTube, finishParts,
  getVisitVehicleMaterials, VISIT_CART_DIMENSIONS, VISIT_VEHICLE_METRE,
  visitVehicleNoPick, type GeometryParts,
} from './VisitVehicleVisuals';
import { disposeVisitVehicleAsset, loadVisitVehicleAsset, type VisitCartAssetRig } from './VisitVehicleAssetAdapter';
import { useVisitStore } from '../useVisitStore';

export interface VisitCartVisualPose {
  position: { x: number; y: number; z: number };
  /** Same heading convention as VisitCharacterController: zero faces local -Z. */
  yaw: number;
  steering: number;
  /** Cumulative travel in map units, including reverse travel. */
  distance: number;
  speed: number;
  visible: boolean;
}
export interface VisitCartModelHandle { update(pose: VisitCartVisualPose): void }
export interface VisitCartModelProps { /** Optional final GLB, authored to VisitVehicleAssetAdapter's rig contract. */ assetUrl?: string }

function buildCartBody() {
  const parts: GeometryParts = {};
  // Lower chassis, faceted nose and broad molded side panels.
  addBox(parts, 'black', [0, .28, 0], [1.38, .22, 2.92], .08);
  addBox(parts, 'green', [0, .56, -.16], [1.45, .48, 2.55], .12);
  addBox(parts, 'green', [0, .91, -1.17], [1.40, .35, .98], .16, [-.08, 0, 0]);
  addBox(parts, 'darkGreen', [0, .77, -1.68], [1.18, .34, .2], .055);
  addBox(parts, 'green', [0, .58, 1.28], [1.32, .32, .38], .08);
  for (const side of [-1, 1]) {
    addBox(parts, 'green', [side * .665, .79, .24], [.18, .39, 1.92], .06);
    addBox(parts, 'black', [side * .78, .36, -1.12], [.10, .12, .86], .035);
    addBox(parts, 'black', [side * .78, .36, 1.09], [.10, .12, .80], .035);
    addTorus(parts, 'black', [side * .79, .39, -1.14], .42, .07, [0, Math.PI / 2, 0]);
    addTorus(parts, 'black', [side * .79, .39, 1.1], .42, .07, [0, Math.PI / 2, 0]);
    // Three restrained livery ribbons follow the lower body.
    addBox(parts, 'blue', [side * .76, .57, -.03], [.014, .075, 1.98], .008, [-.035, 0, 0]);
    addBox(parts, 'yellow', [side * .768, .49, -.20], [.015, .035, 1.53], .006);
    addBox(parts, 'lime', [side * .77, .46, .73], [.016, .045, .48], .006);
    addBox(parts, 'black', [side * .63, .97, 1.48], [.10, .22, .19], .035);
    addBox(parts, 'light', [side * .55, .84, -1.71], [.28, .16, .028], .025, [0, side * .13, 0]);
    addBox(parts, 'yellow', [side * .56, .57, 1.50], [.20, .09, .025], .016);
    // The pillar pairs stay slim so the four-seat cabin remains open.
    addTube(parts, 'black', [[side * .66, .94, -1.04], [side * .68, 1.47, -1.06], [side * .70, 1.96, -.99]], .035, 7);
    addTube(parts, 'black', [[side * .67, .87, 1.15], [side * .68, 1.47, 1.17], [side * .69, 1.94, 1.16]], .033, 7);
    addTube(parts, 'chrome', [[side * .72, .89, .94], [side * .72, .96, .67], [side * .72, .96, .31]], .026, 6);
    addPlane(parts, 'brand', [side * .765, .84, .25], [1.02, .26], [0, side * Math.PI / 2, 0]);
  }
  // Padded front and rear passenger seats, backrests and visible footwell.
  addBox(parts, 'black', [0, .80, .10], [1.15, .10, 1.64], .025);
  for (const z of [-.41, .73]) {
    addBox(parts, 'brown', [0, 1.03, z], [1.22, .18, .49], .075);
    addBox(parts, 'brown', [0, 1.35, z + .21], [1.22, .56, .14], .06, [-.08, 0, 0]);
    addBox(parts, 'seatDark', [0, 1.07, z + .24], [1.16, .06, .08], .025);
  }
  addBox(parts, 'black', [-.39, 1.20, -.90], [.10, .18, .11], .023);
  addTorus(parts, 'black', [-.39, 1.36, -.76], .19, .026, [.38, 0, 0]);
  addCylinder(parts, 'black', [-.39, 1.31, -.76], .036, .036, .06, 8, [Math.PI / 2, 0, 0]);
  // Windshield with a fine dark perimeter, roof liner, roof and colored tip.
  addPlane(parts, 'glass', [0, 1.52, -1.055], [1.31, .79], [-.10, Math.PI, 0]);
  addTube(parts, 'black', [[-.68, 1.95, -1.08], [-.68, 1.11, -1.08], [.68, 1.11, -1.08], [.68, 1.95, -1.08]], .024, 16);
  addBox(parts, 'black', [0, 1.94, .08], [1.66, .075, 2.46], .075);
  addBox(parts, 'green', [0, 2.03, .08], [1.75, .13, 2.59], .085);
  addBox(parts, 'blue', [.44, 2.094, -1.08], [.27, .012, .26], .005);
  addBox(parts, 'yellow', [.68, 2.095, -1.08], [.17, .012, .26], .005);
  addBox(parts, 'lime', [.81, 2.096, -1.08], [.07, .012, .26], .005);
  addPlane(parts, 'brand', [0, 1.087, -1.30], [.84, .215], [-Math.PI / 2 - .08, 0, 0]);
  // Bumper rails visually protect the front and carry no physics of their own.
  addTube(parts, 'black', [[-.70, .45, -1.77], [-.70, .63, -1.83], [.70, .63, -1.83], [.70, .45, -1.77]], .045, 12);
  addTube(parts, 'black', [[-.66, .43, -1.83], [0, .43, -1.88], [.66, .43, -1.83]], .044, 9);
  return finishParts(parts);
}

function buildCartWheel() {
  const tireParts: GeometryParts = {};
  addCylinder(tireParts, 'rubber', [0, 0, 0], .34, .34, .17, 16, [0, 0, Math.PI / 2]);
  addTorus(tireParts, 'rubber', [- .091, 0, 0], .28, .065, [0, Math.PI / 2, 0]);
  addTorus(tireParts, 'rubber', [.091, 0, 0], .28, .065, [0, Math.PI / 2, 0]);
  const rim = new CylinderGeometry(.195, .195, .179, 12);
  rim.rotateZ(Math.PI / 2);
  return { tire: finishParts(tireParts).rubber!, rim };
}

let cachedBody: ReturnType<typeof buildCartBody> | undefined;
let cachedWheel: ReturnType<typeof buildCartWheel> | undefined;
const bodyGeometry = () => (cachedBody ??= buildCartBody());
const wheelGeometry = () => (cachedWheel ??= buildCartWheel());

/** Static fallback budget; wheels share two geometries and one logo texture. */
// eslint-disable-next-line react-refresh/only-export-components -- geometry audit is a pure, stable test hook
export function auditVisitCartFallback() {
  const body = bodyGeometry(), wheel = wheelGeometry();
  const triangles = (geometry: { index: { count: number } | null; attributes: { position?: { count: number } } }) =>
    (geometry.index?.count ?? geometry.attributes.position?.count ?? 0) / 3;
  return {
    triangles: Math.round(Object.values(body).reduce((sum, geometry) => sum + (geometry ? triangles(geometry) : 0), 0)
      + 4 * (triangles(wheel.tire) + 2 * triangles(wheel.rim))),
    drawCalls: Object.values(body).filter(Boolean).length + 12,
    textures: 1,
  };
}

/** Presentation only. The controller owns movement and collision; no React frame state. */
export const VisitCartModel = forwardRef<VisitCartModelHandle, VisitCartModelProps>(function VisitCartModel({ assetUrl }, ref) {
  const root = useRef<Group>(null);
  const suspended = useRef<Group>(null);
  const fallback = useRef<Group>(null);
  const assetRig = useRef<VisitCartAssetRig | null>(null);
  const wheelSpins = useRef<(Group | null)[]>([null, null, null, null]);
  const wheelSteers = useRef<(Group | null)[]>([null, null]);
  const materials = getVisitVehicleMaterials();
  const body = bodyGeometry();
  const wheel = wheelGeometry();
  const invalidate = useThree(state => state.invalidate);
  const vehicleShadows = useVisitStore(state => state.qualityPreset !== 'PERFORMANCE');
  useEffect(() => {
    if (!assetUrl) return;
    const modelGroup = suspended.current;
    const fallbackGroup = fallback.current;
    if (!modelGroup) return;
    let active = true;
    void loadVisitVehicleAsset(assetUrl, 'cart').then(rig => {
      if (!active) { disposeVisitVehicleAsset(rig); return; }
      modelGroup.add(rig.scene);
      assetRig.current = rig;
      rig.scene.traverse(object => { if ((object as Mesh).isMesh) (object as Mesh).castShadow = vehicleShadows; });
      if (fallbackGroup) fallbackGroup.visible = false;
      invalidate();
    }).catch(error => { if (active && root.current) root.current.userData.assetError = String(error); });
    return () => {
      active = false;
      const rig = assetRig.current;
      assetRig.current = null;
      if (rig) { modelGroup.remove(rig.scene); disposeVisitVehicleAsset(rig); }
      if (fallbackGroup) fallbackGroup.visible = true;
    };
  // The asset load is session scoped; quality changes update shadows below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetUrl, invalidate]);
  useEffect(() => {
    assetRig.current?.scene.traverse(object => { if ((object as Mesh).isMesh) (object as Mesh).castShadow = vehicleShadows; });
    invalidate();
  }, [vehicleShadows, invalidate]);
  useImperativeHandle(ref, () => ({ update(pose) {
    const group = root.current;
    if (!group) return;
    group.visible = pose.visible;
    if (!pose.visible) return;
    group.position.set(pose.position.x, pose.position.y, pose.position.z);
    group.rotation.y = -pose.yaw;
    if (suspended.current) {
      suspended.current.rotation.z = Math.max(-.035, Math.min(.035, -pose.speed * pose.steering * .22));
      suspended.current.rotation.x = Math.max(-.02, Math.min(.02, -pose.speed * .07));
    }
    for (const front of wheelSteers.current) if (front) front.rotation.y = -pose.steering;
    const spin = pose.distance / VISIT_CART_DIMENSIONS.wheelRadius;
    for (const wheelGroup of wheelSpins.current) if (wheelGroup) wheelGroup.rotation.x = spin;
    const rig = assetRig.current;
    if (rig) {
      for (const front of rig.wheelSteer) front.rotation.y = -pose.steering;
      for (const wheelNode of rig.wheelSpin) wheelNode.rotation.x = spin;
    }
  } }), []);
  return <group ref={root} name="VisitCart" visible={false} dispose={null}>
    <group scale={VISIT_VEHICLE_METRE} ref={suspended}>
      <group ref={fallback}>
      {Object.entries(body).map(([name, geometry]) => geometry &&
        <mesh key={name} geometry={geometry} material={materials[name as keyof typeof materials]} raycast={visitVehicleNoPick} castShadow={vehicleShadows && name !== 'glass' && name !== 'brand'} receiveShadow={name !== 'glass' && name !== 'brand'}/>)}
      {([-1, 1] as const).flatMap((side, sideIndex) => ([-1.14, 1.1] as const).map((z, axleIndex) => {
        const index = sideIndex * 2 + axleIndex;
        const front = axleIndex === 0;
        return <group key={`${side}:${z}`} position={[side * .78, .39, z]} ref={front ? node => { wheelSteers.current[sideIndex] = node; } : undefined}>
          <group ref={node => { wheelSpins.current[index] = node; }}>
            <mesh geometry={wheel.tire} material={materials.rubber} raycast={visitVehicleNoPick} castShadow={vehicleShadows}/>
            <mesh geometry={wheel.rim} material={materials.black} raycast={visitVehicleNoPick} castShadow={vehicleShadows}/>
            <mesh geometry={wheel.rim} material={materials.chrome} scale={[.1, .62, .62]} raycast={visitVehicleNoPick}/>
          </group>
        </group>;
      }))}
      </group>
    </group>
  </group>;
});
