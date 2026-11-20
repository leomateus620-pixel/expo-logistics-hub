import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TwoBoneLimb } from "/src/lib/three/twoBoneLimb.ts";
import { VISIT_VEHICLE_METRE } from "/src/features/commercial-map/visit/vehicles/VisitVehicleVisuals.ts";

/** Usa o mesmo personagem que visita a sede. Mãos, tronco e joelhos respondem ao movimento do cabo. */
export async function passengerOnCable(scene) {
  const { scene: model } = await new GLTFLoader().loadAsync("/models/commission/cleo-rockenbach.glb");
  const bounds = new T.Box3().setFromObject(model);
  const height = 1.75 * VISIT_VEHICLE_METRE;
  const scale = height / (bounds.max.y - bounds.min.y);
  model.scale.multiplyScalar(scale);
  model.position.y -= bounds.min.y * scale;
  const body = new T.Group();
  body.name = "Cléo Rockenbach — embarque";
  body.add(model);
  scene.add(body);
  body.updateMatrixWorld(true);
  const bones = new Map();
  model.traverse((part) => {
    if (part.isBone) bones.set(part.name.replace(/^mixamorig[:_]?/, ""), part);
    if (part.isMesh) part.castShadow = true;
  });
  const limb = (side, names) => new TwoBoneLimb(...names.map((name) => bones.get(side + name)));
  const arms = ["Left", "Right"].map((side) => limb(side, ["Arm", "ForeArm", "Hand"]));
  const legs = ["Left", "Right"].map((side) => limb(side, ["UpLeg", "Leg", "Foot"]));
  const pose = [...bones.values()].map((bone) => [bone, bone.quaternion.clone()]);
  const target = new T.Vector3();
  const pole = new T.Vector3();
  function at(point, x, y, z) {
    return body.localToWorld(point.set(x, y, z).multiplyScalar(VISIT_VEHICLE_METRE));
  }
  return (anchor, seconds, attachment) => {
    const lift = T.MathUtils.smootherstep(seconds / 3.5, 0, 1);
    const sway = Math.sin(seconds * 2.3);
    body.position.set(anchor.x - 0.018, 0.28 + 0.94 * lift, anchor.z + 0.032 + sway * 0.013);
    body.rotation.set(0.08, -0.58 + 0.15 * lift, 0.032 * sway);
    for (const [bone, rest] of pose) bone.quaternion.copy(rest);
    body.updateMatrixWorld(true);
    const gripHeight = 1.61 + 0.08 * Math.sin(seconds * 1.8);
    arms[0].solve(at(target, 0.1, gripHeight, 0.19), at(pole, 0.52, 1.33, 0.13));
    arms[1].solve(at(target, 0.08, 1.23, 0.16), at(pole, -0.52, 1.13, 0.2));
    legs[0].solve(at(target, 0.14, 0.34 + 0.13 * lift, 0.26), at(pole, 0.23, 0.87, 0.89));
    legs[1].solve(at(target, -0.13, 0.17 + 0.09 * sway, 0.12), at(pole, -0.22, 0.79, 0.75));
    at(attachment, 0.08, 1.08, 0.15);
  };
}
