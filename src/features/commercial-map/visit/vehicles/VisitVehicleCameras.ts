import { Vector3 } from 'three';
import type { VisitWorld } from '../VisitWorld';
import type { VisitCameraMode } from '../useVisitStore';
import { visitCameraFrame } from '../visitRuntime';

interface VehiclePose { position: { x: number; y: number; z: number }; yaw: number; speed?: number }

/** Vehicle offsets are separate from the walking camera, but publish through its
 * existing camera lease. The camera never follows wheel or rotor transforms. */
export class VisitVehicleCameras {
  readonly position = new Vector3();
  readonly target = new Vector3();
  readonly eye = new Vector3();
  readonly direction = new Vector3();
  private desired = new Vector3();
  private candidate = new Vector3();
  private initialized = false;
  private kind: 'cart' | 'helicopter' | null = null;

  reset() { this.initialized = false; this.kind = null; }

  update(kind: 'cart' | 'helicopter', pose: VehiclePose, world: VisitWorld, mode: VisitCameraMode, dt: number) {
    if (this.kind !== kind) { this.initialized = false; this.kind = kind; }
    const { position: p, yaw } = pose;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const speed = Math.abs(pose.speed ?? 0);
    // Keep the aircraft legible in the frame, including a short landscape
    // viewport, while easing back enough to retain the surrounding park.
    const distance = mode === 'first' ? 0 : kind === 'cart' ? .81 : Math.min(1.65, 1.08 + speed * .38);
    const height = kind === 'cart' ? .25 : .22;
    this.eye.set(p.x + (mode === 'first' ? sin * .08 : 0), p.y + height, p.z - (mode === 'first' ? cos * .08 : 0));
    this.direction.set(sin, kind === 'helicopter' ? -.085 : -.045, -cos).normalize();
    this.target.copy(this.eye).addScaledVector(this.direction, kind === 'helicopter' ? 1.3 : .8);
    this.desired.copy(this.eye).addScaledVector(this.direction, -distance);
    if (mode === 'third') this.desired.y += kind === 'cart' ? .20 : .52;
    this.desired.y = Math.max(this.desired.y, world.ground.heightAt(this.desired.x, this.desired.z) + .06);
    const safe = world.cameraProbe(this.eye, this.desired, .045);
    this.desired.lerpVectors(this.eye, this.desired, safe);
    if (!this.initialized || safe < .98) { this.position.copy(this.desired); this.initialized = true; }
    else this.position.lerp(this.desired, 1 - Math.exp(-(kind === 'helicopter' ? 5.5 : 11) * dt));
    // The damped segment can cut a corner even if the desired endpoint is free.
    this.candidate.copy(this.position);
    this.position.lerpVectors(this.eye, this.candidate, world.cameraProbe(this.eye, this.candidate, .045));
    Object.assign(visitCameraFrame.position, this.position);
    Object.assign(visitCameraFrame.target, this.target);
    visitCameraFrame.fov = 66;
    visitCameraFrame.near = .008;
    visitCameraFrame.far = 180;
    visitCameraFrame.ready = true;
  }
}
