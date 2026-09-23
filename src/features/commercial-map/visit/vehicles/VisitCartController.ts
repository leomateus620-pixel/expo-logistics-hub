import type { VisitWorld } from '../VisitWorld';
import type { VisitVector3 } from '../visitTypes';
import { VISIT_CART_HEIGHT, VISIT_CART_RADIUS } from './VisitVehiclePlacement';

export interface VisitCartInput { forward: number; steer: number; brake?: boolean }

const MAX_FORWARD_SPEED = 0.78; // 5.2 m/s; walking is 1.45 m/s.
const MAX_REVERSE_SPEED = 0.34;
const WHEELBASE = 0.34;
const MAX_STEERING = 0.53;

function approach(value: number, target: number, amount: number) {
  return Math.max(value - amount, Math.min(target, value + amount));
}

/** Bicycle steering and continuous collision sweep through the canonical world.
 * This owns no frame loop, Three object or React state. */
export class VisitCartController {
  readonly position: VisitVector3;
  yaw: number;
  steering = 0;
  speed = 0;
  distance = 0;
  pitch = 0;
  roll = 0;
  visible = true;
  blocked = false;

  constructor(position: VisitVector3, yaw = 0) {
    this.position = { ...position };
    this.yaw = yaw;
  }

  stop() { this.speed = 0; this.steering = 0; this.blocked = false; }

  step(rawDelta: number, input: VisitCartInput, world: VisitWorld) {
    const dt = Math.min(0.05, Math.max(0, Number.isFinite(rawDelta) ? rawDelta : 0));
    if (dt === 0) return;
    const throttle = Math.max(-1, Math.min(1, input.forward || 0));
    const steeringTarget = Math.max(-1, Math.min(1, input.steer || 0)) * MAX_STEERING;
    this.steering += (steeringTarget - this.steering) * (1 - Math.exp(-8 * dt));
    const targetSpeed = input.brake ? 0 : throttle >= 0 ? throttle * MAX_FORWARD_SPEED : throttle * MAX_REVERSE_SPEED;
    const decelerating = input.brake || this.speed * targetSpeed < 0 || Math.abs(targetSpeed) < Math.abs(this.speed);
    const acceleration = input.brake ? 1.8 : decelerating ? 1.15 : 0.72;
    this.speed = approach(this.speed, targetSpeed, acceleration * dt);
    if (!throttle && !input.brake && Math.abs(this.speed) < 0.004) this.speed = 0;
    const oldX = this.position.x, oldZ = this.position.z;
    const proposedYaw = this.yaw + this.speed / WHEELBASE * Math.tan(this.steering) * dt;
    const middleYaw = (this.yaw + proposedYaw) / 2;
    const dx = Math.sin(middleYaw) * this.speed * dt;
    const dz = -Math.cos(middleYaw) * this.speed * dt;
    if (world.ground.supportAt(this.position.x + dx, this.position.z + dz, VISIT_CART_RADIUS).height - this.position.y > 0.08) {
      // A visualised lot slab or terrace too high for the cart is a barrier,
      // even if the walking capsule is allowed to step onto it.
      this.blocked = true;
      this.speed = 0;
      return;
    }
    world.move(this.position, dx, dz, VISIT_CART_RADIUS, VISIT_CART_HEIGHT);
    const traveled = Math.hypot(this.position.x - oldX, this.position.z - oldZ);
    this.blocked = Math.abs(this.speed) > 0.02 && traveled < Math.hypot(dx, dz) * 0.3;
    if (this.blocked) this.speed = 0;
    else this.yaw = proposedYaw;
    this.distance += Math.sign(this.speed || throttle) * traveled;
    const pitchTarget = (decelerating ? Math.abs(this.speed) * 0.015 : -Math.abs(this.speed) * 0.012);
    const rollTarget = -this.steering * this.speed * 0.038;
    const settle = 1 - Math.exp(-6 * dt);
    this.pitch += (pitchTarget - this.pitch) * settle;
    this.roll += (rollTarget - this.roll) * settle;
  }
}
