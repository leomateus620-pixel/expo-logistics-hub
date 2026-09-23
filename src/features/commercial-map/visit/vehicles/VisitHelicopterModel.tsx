import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { Group, Mesh } from 'three';
import {
  addBox, addCylinder, addPart, addPlane, addSphere, addTube, finishParts,
  getVisitVehicleMaterials, VISIT_VEHICLE_METRE, visitVehicleNoPick,
  type GeometryParts,
} from './VisitVehicleVisuals';
import { disposeVisitVehicleAsset, loadVisitVehicleAsset, type VisitHelicopterAssetRig } from './VisitVehicleAssetAdapter';
import { useVisitStore } from '../useVisitStore';

export interface VisitHelicopterVisualPose {
  position: { x: number; y: number; z: number };
  yaw: number;
  /** Visual attitude in radians. No mesh movement feeds back into collision. */
  pitch: number;
  roll: number;
  mainRotorAngle: number;
  tailRotorAngle: number;
  visible: boolean;
}
export interface VisitHelicopterModelHandle { update(pose: VisitHelicopterVisualPose): void }
export interface VisitHelicopterModelProps { /** Optional final GLB, authored to VisitVehicleAssetAdapter's rig contract. */ assetUrl?: string }

interface LoftStation { z: number; centerY: number; halfWidth: number; halfHeight: number }
/** Small indexed cross-section shell rather than many overlapping spheres. */
function loft(stations: readonly LoftStation[], arcStart = 0, arcEnd = Math.PI * 2, segments = 16, offset = 0) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let i = 0; i < stations.length; i++) {
    const station = stations[i];
    for (let j = 0; j <= segments; j++) {
      const angle = arcStart + (arcEnd - arcStart) * j / segments;
      positions.push((station.halfWidth + offset) * Math.cos(angle), station.centerY + (station.halfHeight + offset) * Math.sin(angle), station.z);
      uvs.push(j / segments, i / (stations.length - 1));
      if (i === 0 || j === 0) continue;
      const a = (i - 1) * (segments + 1) + j - 1;
      const b = i * (segments + 1) + j - 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildHelicopterBody() {
  const parts: GeometryParts = {};
  const hull: LoftStation[] = [
    { z: -2.22, centerY: 1.46, halfWidth: .06, halfHeight: .11 },
    { z: -2.09, centerY: 1.46, halfWidth: .31, halfHeight: .31 },
    { z: -1.91, centerY: 1.47, halfWidth: .57, halfHeight: .56 },
    { z: -1.35, centerY: 1.53, halfWidth: .95, halfHeight: .81 },
    { z: -.40, centerY: 1.57, halfWidth: 1.17, halfHeight: .86 },
    { z: .55, centerY: 1.55, halfWidth: 1.13, halfHeight: .79 },
    { z: 1.27, centerY: 1.57, halfWidth: .76, halfHeight: .58 },
    { z: 1.75, centerY: 1.68, halfWidth: .32, halfHeight: .29 },
  ];
  // A real opening remains behind the transparent canopy. An opaque full hull
  // made the windscreen look like a painted, featureless dark patch.
  addPart(parts, 'green', loft(hull, Math.PI, Math.PI * 2, 18), [0, 0, 0]);
  addPart(parts, 'green', loft(hull.slice(0, 3), 0, Math.PI, 18), [0, 0, 0]);
  addPart(parts, 'green', loft(hull.slice(5), 0, Math.PI, 18), [0, 0, 0]);
  addSphere(parts, 'green', [0, 1.41, -2.14], [.27, .27, .24], 12, 8);
  addPart(parts, 'light', loft(hull.slice(2, 7), Math.PI * 1.23, Math.PI * 1.77, 12, .016), [0, 0, 0]);
  addPart(parts, 'glass', loft(hull.slice(1, 6), .07, Math.PI - .07, 18, .035), [0, 0, 0]);
  addBox(parts, 'darkGreen', [0, .86, -.54], [1.69, .12, 2.65], .08);
  addBox(parts, 'black', [0, 1.06, -1.42], [1.45, .18, .28], .055, [-.10, 0, 0]);
  // Seats, headrests, floor and instrument binnacle remain visible through glass.
  addBox(parts, 'black', [0, 1.08, -.16], [1.69, .08, 2.05], .025);
  for (const z of [-.69, .31]) for (const side of [-1, 1]) {
    addBox(parts, 'seatDark', [side * .43, 1.29, z], [.56, .16, .50], .06);
    addBox(parts, 'seatDark', [side * .43, 1.59, z + .20], [.53, .59, .15], .055, [-.08, 0, 0]);
    addBox(parts, 'black', [side * .43, 1.96, z + .22], [.33, .18, .11], .045);
  }
  addBox(parts, 'black', [0, 1.39, -1.23], [1.44, .29, .28], .055, [-.17, 0, 0]);
  addBox(parts, 'blue', [0, 2.45, .62], [1.14, .28, 1.17], .12);
  addBox(parts, 'darkGreen', [0, 2.54, .85], [.74, .13, .64], .06);
  // Framed, segmented canopy with a split front screen and two side doors.
  addTube(parts, 'black', [[0, 1.49, -2.06], [0, 1.78, -1.78], [0, 2.22, -1.34], [0, 2.39, -.82]], .022, 12);
  addTube(parts, 'black', [[-.56, 1.46, -1.86], [-.93, 1.55, -1.37], [-1.13, 1.59, -.42], [-1.08, 1.59, .52]], .026, 14);
  addTube(parts, 'black', [[.56, 1.46, -1.86], [.93, 1.55, -1.37], [1.13, 1.59, -.42], [1.08, 1.59, .52]], .026, 14);
  addTube(parts, 'black', [[-.91, 2.10, -1.30], [0, 2.35, -1.29], [.91, 2.10, -1.30]], .027, 12);
  addTube(parts, 'black', [[-1.09, 2.01, -.35], [0, 2.43, -.31], [1.09, 2.01, -.35]], .027, 12);
  // Tapered boom and T-tail. The x/z geometry stays below the main rotor disc.
  addCylinder(parts, 'green', [0, 1.71, 2.80], .18, .36, 2.80, 10, [Math.PI / 2, 0, 0]);
  addBox(parts, 'green', [0, 1.99, 4.00], [.16, .98, .77], .045, [.10, 0, 0]);
  addBox(parts, 'darkGreen', [0, 2.17, 3.93], [1.45, .10, .49], .035);
  addBox(parts, 'blue', [0, 2.44, 4.07], [.14, .17, .56], .025);
  for (const side of [-1, 1]) {
    // Landing skids remain separate visually from the cabin and have a broad stance.
    addTube(parts, 'black', [[side * .88, .21, -1.56], [side * .90, .15, -1.30], [side * .90, .15, 1.43], [side * .88, .21, 1.61]], .072, 16);
    addTube(parts, 'chrome', [[side * .90, .19, -.75], [side * .77, .78, -.57], [side * .67, 1.02, -.52]], .052, 8);
    addTube(parts, 'chrome', [[side * .90, .19, .88], [side * .75, .77, .65], [side * .64, 1.04, .57]], .052, 8);
    addTube(parts, 'black', [[side * .93, 1.43, -1.37], [side * 1.07, 2.07, -.99], [side * 1.15, 2.03, -.31]], .026, 10);
    addTube(parts, 'black', [[side * 1.12, 1.28, .72], [side * 1.14, 1.93, .57]], .026, 6);
    addTube(parts, 'black', [[side * 1.12, 1.49, -.40], [side * 1.15, 1.49, .60]], .020, 8);
    addBox(parts, 'chrome', [side * 1.18, 1.47, .13], [.04, .035, .15], .009);
    addTube(parts, 'yellow', [[side * 1.06, .80, -.30], [side * 1.08, .82, .45], [side * .82, .89, 1.16], [side * .30, 1.10, 2.25]], .042, 12);
    addTube(parts, 'blue', [[side * 1.08, .91, -.45], [side * 1.10, .93, .40], [side * .83, 1.04, 1.13], [side * .30, 1.18, 2.32]], .065, 12);
    addPlane(parts, 'brand', [side * 1.186, 1.31, .09], [1.66, .39], [0, side * Math.PI / 2, 0]);
    addBox(parts, 'light', [side * .49, 1.02, -1.74], [.13, .12, .05], .017, [0, side * .25, 0]);
    addBox(parts, 'black', [side * .50, 1.91, -.74], [.05, .08, .15], .012);
  }
  addSphere(parts, 'light', [0, 1.03, -2.04], [.12, .12, .035], 9, 6);
  addBox(parts, 'black', [0, 2.76, -.30], [.28, .19, .32], .025);
  addCylinder(parts, 'chrome', [0, 2.80, -.30], .19, .24, .18, 10);
  addCylinder(parts, 'black', [0, 2.91, -.30], .115, .115, .17, 10);
  addCylinder(parts, 'black', [.06, 1.83, 4.20], .12, .12, .16, 10, [0, 0, Math.PI / 2]);
  return finishParts(parts);
}

function mainBlade() {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const stations = [
    [.24, .22, .040, .000], [.43, .26, .040, .005], [1.10, .21, .032, .015],
    [2.25, .16, .023, .028], [3.50, .12, .014, .055], [3.75, .065, .009, .070],
  ];
  for (const [radius, chord, thickness, sweep] of stations) {
    positions.push(radius, thickness / 2, sweep - chord / 2, radius, thickness / 2, sweep + chord / 2,
      radius, -thickness / 2, sweep - chord / 2, radius, -thickness / 2, sweep + chord / 2);
    const u = radius / 3.75;
    uvs.push(u, 0, u, 1, u, 0, u, 1);
  }
  for (let i = 0; i < stations.length - 1; i++) {
    const a = i * 4, b = (i + 1) * 4;
    indices.push(a, b, a + 1, a + 1, b, b + 1,
      a + 2, a + 3, b + 2, a + 3, b + 3, b + 2,
      a, a + 2, b, a + 2, b + 2, b,
      a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
  }
  indices.push(0, 1, 2, 1, 3, 2);
  const last = (stations.length - 1) * 4;
  indices.push(last, last + 2, last + 1, last + 1, last + 2, last + 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildHelicopterMainRotor() {
  const parts: GeometryParts = {};
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    const c = Math.cos(angle), s = Math.sin(angle);
    addPart(parts, 'black', mainBlade(), [0, .035, 0], [0, -angle, 0]);
    addBox(parts, 'yellow', [c * 3.64, .038, s * 3.64], [.18, .018, .11], .003, [0, -angle, 0]);
    addTube(parts, 'chrome', [[c * .10, -.08, s * .10], [c * .44, -.02, s * .44]], .025, 5);
  }
  addCylinder(parts, 'chrome', [0, .01, 0], .20, .24, .17, 12);
  addCylinder(parts, 'black', [0, .14, 0], .10, .10, .13, 12);
  return finishParts(parts);
}

function buildHelicopterTailRotor() {
  const parts: GeometryParts = {};
  for (const side of [-1, 1]) {
    addBox(parts, 'light', [0, side * .34, side * .025], [.038, .54, .115], .014, [side * .10, 0, 0]);
    addBox(parts, 'yellow', [0, side * .54, side * .025], [.040, .09, .118], .008, [side * .10, 0, 0]);
    addBox(parts, 'blue', [0, side * .60, side * .025], [.042, .035, .120], .006);
  }
  addCylinder(parts, 'black', [0, 0, 0], .12, .12, .12, 10, [0, 0, Math.PI / 2]);
  addCylinder(parts, 'chrome', [.07, 0, 0], .045, .045, .04, 8, [0, 0, Math.PI / 2]);
  return finishParts(parts);
}

let cachedBody: ReturnType<typeof buildHelicopterBody> | undefined;
let cachedMainRotor: ReturnType<typeof buildHelicopterMainRotor> | undefined;
let cachedTailRotor: ReturnType<typeof buildHelicopterTailRotor> | undefined;

/** Static fallback budget; both rotors are transformed as whole groups. */
// eslint-disable-next-line react-refresh/only-export-components -- geometry audit is a pure, stable test hook
export function auditVisitHelicopterFallback() {
  const groups = [cachedBody ??= buildHelicopterBody(), cachedMainRotor ??= buildHelicopterMainRotor(),
    cachedTailRotor ??= buildHelicopterTailRotor()];
  let triangles = 0, drawCalls = 0;
  for (const group of groups) for (const geometry of Object.values(group)) {
    if (!geometry) continue;
    triangles += (geometry.index?.count ?? geometry.attributes.position?.count ?? 0) / 3;
    drawCalls++;
  }
  return { triangles: Math.round(triangles), drawCalls, textures: 1 };
}

/** Exterior scene component: all flight physics stay in VisitHelicopterController. */
export const VisitHelicopterModel = forwardRef<VisitHelicopterModelHandle, VisitHelicopterModelProps>(function VisitHelicopterModel({ assetUrl }, ref) {
  const root = useRef<Group>(null);
  const fuselage = useRef<Group>(null);
  const fallback = useRef<Group>(null);
  const mainRotor = useRef<Group>(null);
  const tailRotor = useRef<Group>(null);
  const assetRig = useRef<VisitHelicopterAssetRig | null>(null);
  const body = cachedBody ??= buildHelicopterBody();
  const main = cachedMainRotor ??= buildHelicopterMainRotor();
  const tail = cachedTailRotor ??= buildHelicopterTailRotor();
  const materials = getVisitVehicleMaterials();
  const invalidate = useThree(state => state.invalidate);
  const vehicleShadows = useVisitStore(state => state.qualityPreset !== 'PERFORMANCE');
  useEffect(() => {
    if (!assetUrl) return;
    const modelGroup = fuselage.current;
    const fallbackGroup = fallback.current;
    if (!modelGroup) return;
    let active = true;
    void loadVisitVehicleAsset(assetUrl, 'helicopter').then(rig => {
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
    if (fuselage.current) { fuselage.current.rotation.x = pose.pitch; fuselage.current.rotation.z = pose.roll; }
    if (mainRotor.current) mainRotor.current.rotation.y = pose.mainRotorAngle;
    if (tailRotor.current) tailRotor.current.rotation.x = pose.tailRotorAngle;
    if (assetRig.current) {
      assetRig.current.mainRotor.rotation.y = pose.mainRotorAngle;
      assetRig.current.tailRotor.rotation.x = pose.tailRotorAngle;
    }
  } }), []);
  return <group ref={root} name="VisitHelicopter" visible={false} dispose={null}>
    <group ref={fuselage} scale={VISIT_VEHICLE_METRE}>
      <group ref={fallback}>
      {Object.entries(body).map(([name, geometry]) => geometry &&
        <mesh key={name} geometry={geometry} material={materials[name as keyof typeof materials]} raycast={visitVehicleNoPick} castShadow={vehicleShadows && name !== 'glass' && name !== 'brand'} receiveShadow={name !== 'glass' && name !== 'brand'}/>)}
      <group ref={mainRotor} position={[0, 3.04, -.30]}>
        {Object.entries(main).map(([name, geometry]) => geometry &&
          <mesh key={name} geometry={geometry} material={materials[name as keyof typeof materials]} raycast={visitVehicleNoPick} castShadow={vehicleShadows}/>)}
      </group>
      <group ref={tailRotor} position={[.18, 1.83, 4.20]}>
        {Object.entries(tail).map(([name, geometry]) => geometry &&
          <mesh key={name} geometry={geometry} material={materials[name as keyof typeof materials]} raycast={visitVehicleNoPick} castShadow={vehicleShadows}/>)}
      </group>
      </group>
    </group>
  </group>;
});
