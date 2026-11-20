import * as THREE from "three";
import { TwoBoneLimb } from "@/lib/three/twoBoneLimb";
import {
  sampleHeadquartersVisitor,
  type HeadquartersVisitor,
  type VisitorPose,
} from "./visitorPaths";

const noRaycast = () => undefined;
const strideMeters = 1.14;
const stance = 0.63;
const axisX = new THREE.Vector3(1, 0, 0);
const axisY = new THREE.Vector3(0, 1, 0);

function conversationGesture(role: HeadquartersVisitor, seconds: number) {
  const partnerOffset = role === "forecourt-conversation-right" ? 3.5 : 0;
  const turn = ((seconds + partnerOffset) % 7) / 7;
  return THREE.MathUtils.smoothstep(turn, 0.04, 0.14) *
    (1 - THREE.MathUtils.smoothstep(turn, 0.30, 0.48)) *
    (0.72 + 0.28 * Math.sin(seconds * 4.1 + partnerOffset));
}

export class VisitorRig {
  readonly group = new THREE.Group();
  private readonly rest: { bone: THREE.Bone; rotation: THREE.Quaternion }[] = [];
  private readonly hands: TwoBoneLimb[];
  private readonly feet: TwoBoneLimb[];
  private readonly wrists: { idle: THREE.Quaternion; gesture: THREE.Quaternion }[];
  private readonly ankles: number[];
  private readonly head: THREE.Bone;
  private readonly shoulders: THREE.Bone;
  private readonly pose: VisitorPose = { x: 0, y: 0, z: 0, yaw: 0, distance: 0, gait: 0 };
  private readonly target = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly heading = new THREE.Quaternion();
  private readonly orientation = new THREE.Quaternion();
  private readonly motion = new THREE.Quaternion();
  private readonly suits = new Map<THREE.Material, THREE.Material>();
  private readonly skeletons = new Set<THREE.Skeleton>();
  private readonly stature: number;
  private initialized = false;

  constructor(
    readonly role: HeadquartersVisitor,
    model: THREE.Group,
    height: number,
    suitTint: readonly [number, number, number] | undefined,
    shadow: THREE.Mesh,
  ) {
    this.group.name = `B12:visitor:${role}`;
    this.group.raycast = noRaycast;
    this.group.userData.role = role;
    const bounds = new THREE.Box3().setFromObject(model);
    const standingHeight = bounds.max.y - bounds.min.y;
    if (!Number.isFinite(standingHeight) || standingHeight <= 0)
      throw new Error("B12 visitor model has no standing bounds");
    const scale = height / standingHeight;
    this.stature = height / 1.75;
    model.scale.multiplyScalar(scale);
    model.position.y -= bounds.min.y * scale;
    this.group.add(model, shadow);
    this.group.updateMatrixWorld(true);

    const bones = new Map<string, THREE.Bone>();
    model.traverse((object) => {
      if ((object as THREE.Bone).isBone) {
        const bone = object as THREE.Bone;
        bones.set(bone.name.replace(/^mixamorig[:_]?/, ""), bone);
        this.rest.push({ bone, rotation: bone.quaternion.clone() });
      }
      const mesh = object as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.raycast = noRaycast;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      if (!mesh.isSkinnedMesh) return;
      // The clothing, body and accessories from this GLB share one rig.
      // SkeletonUtils cloned each binding, so reuse its bone texture per actor.
      const shared = this.skeletons.values().next().value;
      if (shared && shared !== mesh.skeleton && shared.bones.length === mesh.skeleton.bones.length &&
          shared.bones.every((bone, index) => bone === mesh.skeleton.bones[index])) {
        mesh.skeleton.dispose();
        mesh.skeleton = shared;
      }
      this.skeletons.add(mesh.skeleton);
      mesh.computeBoundingSphere();
      if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.40 / scale;
      const tintSuit = (material: THREE.Material) => {
        if (!suitTint || !material.name.includes("elegantsuit") || !(material as THREE.MeshStandardMaterial).isMeshStandardMaterial)
          return material;
        let tinted = this.suits.get(material);
        if (!tinted) {
          const clone = (material as THREE.MeshStandardMaterial).clone();
          clone.color.multiply(new THREE.Color().setRGB(...suitTint));
          tinted = clone;
          this.suits.set(material, clone);
        }
        return tinted;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tintSuit) : tintSuit(mesh.material);
    });
    const bone = (name: string) => {
      const joint = bones.get(name);
      if (!joint) throw new Error("B12 visitor rig is missing " + name);
      return joint;
    };
    this.head = bone("Head");
    this.shoulders = bone("Spine2");
    this.hands = ["Left", "Right"].map((side) =>
      new TwoBoneLimb(bone(side + "Arm"), bone(side + "ForeArm"), bone(side + "Hand")));
    this.feet = ["Left", "Right"].map((side) =>
      new TwoBoneLimb(bone(side + "UpLeg"), bone(side + "Leg"), bone(side + "Foot")));
    this.ankles = this.feet.map(({ end }) => end.getWorldPosition(new THREE.Vector3()).y);
    this.wrists = this.hands.map((limb, index) => {
      const side = index === 0 ? "Left" : "Right";
      const hand = limb.end.getWorldPosition(new THREE.Vector3());
      const finger = bone(side + "HandMiddle1").getWorldPosition(new THREE.Vector3()).sub(hand).normalize();
      const aim = (direction: THREE.Vector3) => new THREE.Quaternion()
        .setFromUnitVectors(finger, direction.normalize())
        .multiply(limb.restEnd);
      return {
        idle: aim(new THREE.Vector3(0, -1, 0.08)),
        gesture: aim(new THREE.Vector3(0, -0.34, 0.94)),
      };
    });
  }

  update(seconds: number, delta: number, reducedMotion: boolean) {
    sampleHeadquartersVisitor(this.role, seconds, this.pose);
    const { x, y, z, yaw, distance } = this.pose;
    const gait = reducedMotion ? 0 : this.pose.gait;
    const speakingRole = this.role === "forecourt-conversation-left" || this.role === "forecourt-conversation-right";
    const bodyYaw = speakingRole ? yaw * 0.67 : yaw;
    this.group.position.set(x, y, z);
    if (this.initialized && !reducedMotion) {
      const angle = THREE.MathUtils.euclideanModulo(bodyYaw - this.group.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      this.group.rotation.y += angle * (1 - Math.exp(-8 * delta));
    } else {
      this.group.rotation.y = bodyYaw;
    }
    this.initialized = true;
    for (const { bone, rotation } of this.rest) bone.quaternion.copy(rotation);

    const cycle = (distance / (strideMeters * this.stature)) % 1;
    const partnerOffset = this.role === "forecourt-conversation-right" ? 3.5 : 0;
    const gesture = speakingRole && !reducedMotion ? conversationGesture(this.role, seconds) : 0;

    if (speakingRole)
      this.head.quaternion.multiply(this.motion.setFromAxisAngle(axisY, (yaw - bodyYaw) * 0.25));
    if (!reducedMotion) {
      const bounce = gait * Math.sin(cycle * Math.PI * 4) * 0.018;
      this.shoulders.quaternion.multiply(this.motion.setFromAxisAngle(
        axisX, bounce - gesture * 0.065,
      ));
      const listenerNod = gait ? 0 : 0.025 * Math.sin(seconds * 1.7 + partnerOffset);
      this.head.quaternion.multiply(this.motion.setFromAxisAngle(axisX, listenerNod));
    }
    this.group.updateWorldMatrix(true, true);
    this.group.getWorldQuaternion(this.heading);
    for (let index = 0; index < 2; index++) {
      const sign = index === 0 ? 1 : -1;
      const phase = (cycle + index * 0.5) % 1;
      const swing = Math.max(0, (phase - stance) / (1 - stance));
      const stride = strideMeters * stance;
      const footZ = (phase < stance
        ? 0.5 - phase / stance
        : -0.5 + THREE.MathUtils.smoothstep(swing, 0, 1)) * stride;
      this.solve(
        this.feet[index],
        sign * 0.105,
        this.ankles[index] / this.stature + Math.sin(swing * Math.PI) * 0.10 * gait,
        footZ * gait,
        sign * 0.17, 0.56, 0.83,
      );
      this.feet[index].orientEnd(this.orientation.copy(this.heading).multiply(this.feet[index].restEnd));

      const armSwing = -sign * Math.cos(cycle * 2 * Math.PI) * 0.11 * gait;
      const speech = index === 1 ? gesture : 0;
      this.solve(
        this.hands[index],
        sign * (0.225 + speech * 0.055),
        0.86 + speech * 0.33,
        0.05 + armSwing + speech * 0.31,
        sign * 0.55, 1.05, 0.16,
      );
      this.orientation.copy(this.wrists[index].idle).slerp(this.wrists[index].gesture, speech)
        .premultiply(this.heading);
      this.hands[index].orientEnd(this.orientation);
    }
  }

  private solve(
    limb: TwoBoneLimb,
    x: number,
    y: number,
    z: number,
    poleX: number,
    poleY: number,
    poleZ: number,
  ) {
    this.group.localToWorld(this.target.set(x, y, z).multiplyScalar(this.stature));
    this.group.localToWorld(this.pole.set(poleX, poleY, poleZ).multiplyScalar(this.stature));
    limb.solve(this.target, this.pole);
  }

  dispose() {
    this.skeletons.forEach((skeleton) => skeleton.dispose());
    this.suits.forEach((material) => material.dispose());
  }
}
