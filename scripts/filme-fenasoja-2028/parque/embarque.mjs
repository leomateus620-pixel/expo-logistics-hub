import * as T from "three";
import * as vehicleModule from "/src/features/commercial-map/visit/vehicles/VisitHelicopterModel.tsx?filme=09";
import {
  getVisitVehicleMaterials,
  VISIT_VEHICLE_METRE,
} from "/src/features/commercial-map/visit/vehicles/VisitVehicleVisuals.ts";

export function prepareHelicopter(scene) {
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
  const navy = new T.MeshStandardMaterial({ color: "#223041", roughness: 0.89 }),
    pants = new T.MeshStandardMaterial({ color: "#35383a", roughness: 0.92 }),
    skin = new T.MeshStandardMaterial({ color: "#b58266", roughness: 0.79 }),
    ropeMat = new T.MeshStandardMaterial({ color: "#ba9759", roughness: 0.88 });
  function segment(parent, a, b, r, m, rb = r) {
    const axis = new T.Vector3().subVectors(b, a);
    const o = new T.Mesh(new T.CylinderGeometry(r, rb, axis.length(), 8), m);
    o.position.copy(a).addScaledVector(axis, 0.5);
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), axis.normalize());
    parent.add(o);
    return o;
  }
  function eq(th, sc, mat, parent, pos) {
    const o = new T.Mesh(new T.SphereGeometry(th, 10, 8), mat);
    o.scale.fromArray(sc);
    o.position.fromArray(pos);
    parent.add(o);
    return o;
  }
  const person = new T.Group();
  const V = (x, y, z) => new T.Vector3(x, y, z);
  eq(0.118, [0.82, 1, 0.87], skin, person, [0, 0.78, 0]);
  eq(0.224, [0.83, 1.15, 0.59], navy, person, [0, 0.47, 0]);
  for (const k of [-1, 1]) {
    segment(person, V(k * 0.08, 0.34, 0), V(k * 0.09, 0.05, 0.07), 0.088, pants, 0.064);
    segment(person, V(k * 0.09, 0.05, 0.07), V(k * 0.11, -0.16, 0.02), 0.06, pants, 0.048);
    segment(person, V(k * 0.14, 0.63, 0), V(k * 0.21, 0.43, 0.06), 0.052, navy, 0.047);
    segment(person, V(k * 0.21, 0.43, 0.06), V(k * 0.13, 0.54, 0.16), 0.047, skin, 0.04);
  }
  person.scale.setScalar(VISIT_VEHICLE_METRE * 1.56);
  scene.add(person);
  const rope = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 1, 8), ropeMat);
  scene.add(rope);
  const winch = eq(0.15, [1.1, 1, 0.86], materials.chrome, heli, [1.17, 1.76, -0.48]);
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
    person.position.set(anchor.x - 0.03, 0.46 + s * 0.19, anchor.z + 0.032 * Math.sin(s * 1.15));
    person.rotation.y = -0.64 + 0.12 * Math.sin(s);
    end.copy(person.position);
    end.y += 0.14;
    const axis = anchor.clone().sub(end);
    rope.scale.y = axis.length();
    rope.position.copy(anchor).add(end).multiplyScalar(0.5);
    rope.quaternion.setFromUnitVectors(V(0, 1, 0), axis.normalize());
  };
}
