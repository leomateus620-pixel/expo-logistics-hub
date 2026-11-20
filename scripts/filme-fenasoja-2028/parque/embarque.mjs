import * as T from "three";
import { passengerOnCable } from "./passageiro.mjs";
import * as vehicleModule from "/src/features/commercial-map/visit/vehicles/VisitHelicopterModel.tsx?filme=09";
import {
  getVisitVehicleMaterials,
  VISIT_VEHICLE_METRE,
} from "/src/features/commercial-map/visit/vehicles/VisitVehicleVisuals.ts";

export async function prepareHelicopter(scene) {
  const materials = {};
  for (const [k, v] of Object.entries(getVisitVehicleMaterials())) materials[k] = v.clone();
  materials.green.color.set("#e8e5d1");
  materials.green.roughness = 0.4;
  materials.darkGreen.color.set("#1d5040");
  materials.blue.color.set("#234e42");
  materials.lime.color.set("#66806a");
  materials.yellow.color.set("#cda449");
  const heli = new T.Group();
  heli.name = "Helicoptero da visita — cena do filme";
  heli.scale.setScalar(VISIT_VEHICLE_METRE);
  const build = (parent, parts) => {
    for (const [k, g] of Object.entries(parts)) {
      const m = new T.Mesh(g, materials[k]);
      m.castShadow = k !== "glass";
      m.receiveShadow = true;
      parent.add(m);
    }
  };
  build(heli, vehicleModule.buildHelicopterBody());
  const rotor = new T.Group();
  rotor.position.set(0, 3.04, -0.3);
  build(rotor, vehicleModule.buildHelicopterMainRotor());
  heli.add(rotor);
  const tail = new T.Group();
  tail.position.set(0.18, 1.83, 4.2);
  build(tail, vehicleModule.buildHelicopterTailRotor());
  heli.add(tail);
  scene.add(heli);
  const posePassenger = await passengerOnCable(scene);
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const ropeMat = new T.MeshStandardMaterial({ color: "#ba9759", roughness: 0.88 });
  const rope = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 1, 8), ropeMat);
  scene.add(rope);
  const winch = new T.Mesh(new T.SphereGeometry(.15, 10, 8), materials.chrome);
  winch.scale.set(1.1, 1, .86);
  winch.position.set(1.17, 1.76, -.48);
  heli.add(winch);
  const foot = V(13.89, 0, 15.45);
  const anchor = V(0, 0, 0);
  const end = V(0, 0, 0);
  return function poseAt(s) {
    heli.position.set(foot.x + 0.015 * Math.sin(s * 2.2), 2.24 + 0.018 * Math.sin(s * 2.5), foot.z + 0.023 * Math.cos(s * 1.8));
    heli.rotation.set(0.018 * Math.sin(s), 0.49 + 0.012 * Math.sin(s * 0.7), -0.017 * Math.sin(s * 1.2));
    rotor.rotation.y = s * 2 * Math.PI * 6.48;
    tail.rotation.x = s * 2 * Math.PI * 32.8;
    heli.updateMatrixWorld(true);
    winch.getWorldPosition(anchor);
    posePassenger(anchor, s, end);
    const axis = anchor.clone().sub(end);
    rope.scale.y = axis.length();
    rope.position.copy(anchor).add(end).multiplyScalar(0.5);
    rope.quaternion.setFromUnitVectors(V(0, 1, 0), axis.normalize());
  };
}
