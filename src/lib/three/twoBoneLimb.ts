import * as THREE from 'three';

/** Analytic inverse kinematics for a three-joint arm or leg. */
export class TwoBoneLimb {
  private readonly startPosition = new THREE.Vector3();
  private readonly jointPosition = new THREE.Vector3();
  private readonly endPosition = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly bend = new THREE.Vector3();
  private readonly elbow = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly delta = new THREE.Quaternion();
  private readonly world = new THREE.Quaternion();
  private readonly parent = new THREE.Quaternion();
  readonly restEnd = new THREE.Quaternion();

  constructor(
    readonly upper: THREE.Bone,
    readonly lower: THREE.Bone,
    readonly end: THREE.Bone,
  ) {
    end.getWorldQuaternion(this.restEnd);
  }

  private aim(bone: THREE.Bone, child: THREE.Bone, target: THREE.Vector3) {
    bone.getWorldPosition(this.startPosition);
    child.getWorldPosition(this.jointPosition);
    this.from.subVectors(this.jointPosition, this.startPosition).normalize();
    this.to.subVectors(target, this.startPosition).normalize();
    this.delta.setFromUnitVectors(this.from, this.to);
    bone.getWorldQuaternion(this.world).premultiply(this.delta);
    bone.parent!.getWorldQuaternion(this.parent).invert();
    bone.quaternion.copy(this.parent).multiply(this.world);
    bone.updateWorldMatrix(false, true);
  }

  solve(target: THREE.Vector3, pole: THREE.Vector3) {
    this.upper.getWorldPosition(this.startPosition);
    this.lower.getWorldPosition(this.jointPosition);
    this.end.getWorldPosition(this.endPosition);
    const first = this.startPosition.distanceTo(this.jointPosition);
    const second = this.jointPosition.distanceTo(this.endPosition);
    const reach = THREE.MathUtils.clamp(this.startPosition.distanceTo(target), .01, first + second - .002);
    this.axis.subVectors(target, this.startPosition).normalize();
    this.bend.subVectors(pole, this.startPosition)
      .addScaledVector(this.axis, -this.bend.dot(this.axis)).normalize();
    const along = (first * first - second * second + reach * reach) / (2 * reach);
    const offset = Math.sqrt(Math.max(0, first * first - along * along));
    this.elbow.copy(this.startPosition).addScaledVector(this.axis, along).addScaledVector(this.bend, offset);
    this.aim(this.upper, this.lower, this.elbow);
    this.aim(this.lower, this.end, target);
  }

  orientEnd(world: THREE.Quaternion) {
    this.end.parent!.getWorldQuaternion(this.parent).invert();
    this.end.quaternion.copy(this.parent).multiply(world);
    this.end.updateWorldMatrix(false, true);
  }
}
