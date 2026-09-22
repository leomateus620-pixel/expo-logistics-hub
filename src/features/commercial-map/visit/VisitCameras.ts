import { Quaternion, Vector3, Matrix4 } from 'three';
import type { VisitWorld } from './VisitWorld';
import type { VisitCharacterController } from './VisitCharacterController';
import { VISIT_BODY } from './VisitCharacterController';
import { visitCameraFrame } from './visitRuntime';
import type { VisitCameraMode } from './useVisitStore';

const UP = new Vector3(0, 1, 0);
export class VisitCameras {
  readonly eye = new Vector3(); readonly direction = new Vector3();
  readonly position = new Vector3(); readonly target = new Vector3();
  private desired = new Vector3();
  private candidate = new Vector3();
  private distance = 0;
  private initialized = false;
  private eyeHeight = 0;
  update(character: VisitCharacterController, world: VisitWorld, mode: VisitCameraMode, dt: number) {
    const { position: p, yaw, pitch } = character;
    const desiredEye = p.y + VISIT_BODY.eye;
    this.eyeHeight = this.initialized ? this.eyeHeight + (desiredEye - this.eyeHeight) * (1 - Math.exp(-18 * dt)) : desiredEye;
    // Collider is grounded exactly; the lens eases authored curb-height changes.
    this.eye.set(p.x, Math.max(p.y + .12, this.eyeHeight), p.z);
    this.direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const desiredDistance = mode === 'first' ? 0 : 0.66;
    this.distance += (desiredDistance - this.distance) * (1 - Math.exp(-10 * dt));
    if (Math.abs(this.distance - desiredDistance) < .001) this.distance = desiredDistance;
    this.desired.copy(this.eye).addScaledVector(this.direction, -this.distance);
    if (mode === 'third') this.desired.y += this.distance * .18;
    this.desired.y = Math.max(this.desired.y, world.ground.heightAt(this.desired.x, this.desired.z) + .04);
    // Camera radius exceeds near-plane diagonal, including portrait aspect.
    const allowed = world.cameraProbe(this.eye, this.desired, .035);
    this.desired.lerpVectors(this.eye, this.desired, allowed);
    if (!this.initialized || allowed < .98 || mode === 'first' && this.distance === 0) {
      this.position.copy(this.desired); this.initialized = true;
    } else this.position.lerp(this.desired, 1 - Math.exp(-14 * dt));
    // Smoothing around a corner must also pass the probe, not just its endpoint.
    this.candidate.copy(this.position);
    const safe = world.cameraProbe(this.eye, this.candidate, .035);
    this.position.lerpVectors(this.eye, this.candidate, safe);
    this.target.copy(this.eye).addScaledVector(this.direction, .4);
    return this.position.distanceTo(this.eye);
  }
  publish() {
    Object.assign(visitCameraFrame.position, this.position);
    Object.assign(visitCameraFrame.target, this.target);
    visitCameraFrame.fov = 65; visitCameraFrame.near = .008; visitCameraFrame.far = 180;
    visitCameraFrame.ready = true;
  }
}

const FLIGHT_RADIUS = .035;
const smoothFlight = (n: number) => n * n * (3 - 2 * n);

/** Certify the whole route before taking ownership. Under a gate/canopy the
 * lens first moves sideways to a clear column; third-person arrival receives
 * its own clearance test, independent of the character's spawn column.
 * The bounded search may refuse an enclosed/invalid camera pose. It never
 * tunnels through a roof or reports success by snapping to the destination. */
export class VisitCameraFlight {
  private elapsed = 0;
  readonly duration = 2.6;
  private from = new Vector3(); private to = new Vector3();
  private fromRotation = new Quaternion(); private toRotation = new Quaternion();
  private rotation = new Quaternion(); private matrix = new Matrix4();
  private direction = new Vector3(); private position = new Vector3();
  private height = 0; private fromFov = 38; private toFov = 65;
  private route: Vector3[] = [];
  private segmentDurations: number[] = [];
  private segment = 0; private segmentElapsed = 0;
  private started = false;

  private clear(world: VisitWorld, a: Vector3, b: Vector3) {
    if (world.cameraProbe(a, b, FLIGHT_RADIUS) < 1) return false;
    // Solid architecture is in the collision grid. Ground is a height field;
    // certify low lateral detours as well, so a nearby bank cannot clip the lens.
    const samples = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .1));
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      if (a.y + (b.y - a.y) * t < world.ground.heightAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) + FLIGHT_RADIUS) return false;
    }
    return true;
  }

  private clearanceRoute(origin: Vector3, toward: Vector3, world: VisitWorld): Vector3[] | null {
    const top = new Vector3(origin.x, this.height, origin.z);
    if (this.clear(world, origin, top)) return [origin.clone(), top];
    // Every candidate is tested against the spatial index, never scene meshes.
    // Most valid points need no search; gate/tree coverage normally needs one
    // short lateral segment. Keep a few safe bends for a pier blocking that ray.
    const direction = Math.atan2(toward.z - origin.z, toward.x - origin.x);
    const bends: Vector3[] = [];
    const radii = [.2, .4, .7, 1, 1.5, 2.5, 4, 6, 8];
    const find = (start: Vector3, remember: boolean): Vector3[] | null => {
      for (const radius of radii) for (let i = 0; i < 24; i++) {
        // Alternate either side of the desired direction rather than biasing
        // all departures clockwise around a building.
        const angle = direction + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * Math.PI / 12;
        const point = new Vector3(start.x + Math.cos(angle) * radius, start.y, start.z + Math.sin(angle) * radius);
        if (!this.clear(world, start, point)) continue;
        top.set(point.x, this.height, point.z);
        if (this.clear(world, point, top)) return [start.clone(), point, top.clone()];
        if (remember && radius >= .7 && bends.length < 8 && bends.every(bend => bend.distanceToSquared(point) > .35)) bends.push(point);
      }
      return null;
    };
    const direct = find(origin, true);
    if (direct) return direct;
    for (const bend of bends) {
      const tail = find(bend, false);
      if (tail) return [origin.clone(), ...tail];
    }
    return null;
  }

  start(from: {x:number;y:number;z:number}, fromTarget: {x:number;y:number;z:number}, to: {x:number;y:number;z:number}, toTarget: {x:number;y:number;z:number}, world: VisitWorld, fromFov: number, toFov: number): boolean {
    this.started = false; this.route = []; this.segmentDurations = [];
    this.elapsed = 0; this.segment = 0; this.segmentElapsed = 0;
    this.from.copy(from); this.to.copy(to);
    if (![from.x, from.y, from.z, to.x, to.y, to.z, world.maxHeight, fromFov, toFov].every(Number.isFinite)) return false;
    this.height = Math.max(from.y, to.y, world.maxHeight + .8);
    // A zero-length probe rejects a camera already embedded in a blocker. Such
    // a pose has no continuous, collision-free escape with this lens radius.
    if (!this.clear(world, this.from, this.from) || !this.clear(world, this.to, this.to)) return false;
    const departure = this.clearanceRoute(this.from, this.to, world);
    if (!departure) return false;
    const arrival = this.clearanceRoute(this.to, this.from, world);
    if (!arrival) return false;
    const points = [...departure, ...arrival.reverse()];
    this.route.push(points[0]);
    for (let i = 1; i < points.length; i++) {
      const previous = this.route[this.route.length - 1], next = points[i];
      if (previous.distanceToSquared(next) < 1e-14) continue;
      if (!this.clear(world, previous, next)) { this.route = []; return false; }
      this.route.push(next);
    }
    // Keep stationary routes valid and avoid a division by zero.
    if (this.route.length === 1) this.route.push(this.to.clone());
    let weight = 0;
    for (let i = 1; i < this.route.length; i++) {
      const next = Math.max(.35, Math.sqrt(this.route[i - 1].distanceTo(this.route[i])));
      this.segmentDurations.push(next); weight += next;
    }
    for (let i = 0; i < this.segmentDurations.length; i++) this.segmentDurations[i] = this.duration * this.segmentDurations[i] / weight;
    this.fromRotation.setFromRotationMatrix(this.matrix.lookAt(this.from, this.direction.copy(fromTarget), UP));
    this.toRotation.setFromRotationMatrix(this.matrix.lookAt(this.to, this.direction.copy(toTarget), UP));
    this.fromFov = fromFov; this.toFov = toFov;
    this.started = true;
    return true;
  }
  step(dt: number) {
    if (!this.started) return false;
    const duration = this.segmentDurations[this.segment];
    const advance = Math.min(Math.max(0, Math.min(.05, dt)), duration - this.segmentElapsed);
    this.segmentElapsed += advance; this.elapsed += advance;
    const t = Math.min(1, this.elapsed / this.duration);
    this.position.lerpVectors(this.route[this.segment], this.route[this.segment + 1], smoothFlight(this.segmentElapsed / duration));
    this.rotation.slerpQuaternions(this.fromRotation, this.toRotation, smoothFlight(t));
    this.direction.set(0,0,-1).applyQuaternion(this.rotation).add(this.position);
    Object.assign(visitCameraFrame.position, this.position); Object.assign(visitCameraFrame.target, this.direction);
    visitCameraFrame.fov = this.fromFov + (this.toFov - this.fromFov) * smoothFlight(t);
    visitCameraFrame.near = .008; visitCameraFrame.far = Math.max(500, this.height * 4); visitCameraFrame.ready = true;
    if (this.segmentElapsed >= duration) {
      if (this.segment === this.segmentDurations.length - 1) {
        // Commit the exact saved endpoint after traversing its certified segment.
        Object.assign(visitCameraFrame.position, this.to); visitCameraFrame.fov = this.toFov;
        return true;
      }
      // Publish each corner for one frame; do not cut across an uncertified
      // diagonal when a long frame consumes two neighboring route segments.
      this.segment++; this.segmentElapsed = 0;
    }
    return false;
  }
}
