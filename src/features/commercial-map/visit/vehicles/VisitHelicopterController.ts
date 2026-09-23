import type { VisitWorld } from '../VisitWorld';
import type { VisitCollider, VisitVector3 } from '../visitTypes';
import { VisitLandingResolver, VISIT_HELICOPTER_CLEARANCE_RADIUS, VISIT_HELICOPTER_VOLUMES, type VisitLandingSpot } from './VisitLandingResolver';
import { visitVehicleSweep } from './VisitVehicleCollision';

export interface VisitHelicopterInput { forward: number; strafe: number; yaw: number; vertical: number; land?: boolean }
export type VisitHelicopterFlightState = 'arriving' | 'landed' | 'takeoff' | 'flying' | 'landing';

const MAX_HORIZONTAL_SPEED = 1.25; // 8.3 m/s; controlled aerial viewing.
const MAX_VERTICAL_SPEED = 0.55;
const MAX_YAW_SPEED = 0.9;
const BOUNDARY_SLOW_ZONE = 2;

function clampUnit(value: number) { return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0)); }

/** Stable velocity-controlled flight with no independent tick or rigid bodies. */
export class VisitHelicopterController {
  readonly position: VisitVector3;
  yaw: number;
  pitch = 0;
  roll = 0;
  mainRotorAngle = 0;
  tailRotorAngle = 0;
  visible = true;
  flightState: VisitHelicopterFlightState = 'landed';
  velocityX = 0;
  velocityY = 0;
  velocityZ = 0;
  yawVelocity = 0;
  landingRejected = false;
  justLanded = false;
  blocked = false;
  private departureY = 0;
  private landingSpot: VisitLandingSpot | null = null;
  private landingValidationClock = 0;
  private lastLandInput = false;
  private readonly candidates: VisitCollider[] = [];
  private readonly proposed: VisitVector3 = { x: 0, y: 0, z: 0 };
  private readonly slowed = { x: 0, z: 0 };

  constructor(position: VisitVector3, yaw = 0) {
    this.position = { ...position };
    this.yaw = yaw;
    this.departureY = position.y;
  }

  get speed() { return Math.hypot(this.velocityX, this.velocityY, this.velocityZ); }
  get canExit() { return this.flightState === 'landed' && this.speed < 0.035; }

  beginTakeoff() {
    if (this.flightState !== 'landed') return false;
    this.departureY = this.position.y;
    this.flightState = 'takeoff';
    this.landingSpot = null;
    this.landingRejected = false;
    return true;
  }

  requestLanding(resolver: VisitLandingResolver) {
    if (this.flightState !== 'flying') return false;
    const spot = resolver.resolve(this.position.x, this.position.z, this.position.y + 0.005);
    if (!spot || this.position.y - spot.y < 0.16) { this.landingRejected = true; return false; }
    this.landingSpot = spot;
    this.landingValidationClock = 0;
    this.flightState = 'landing';
    this.landingRejected = false;
    return true;
  }

  cancelLanding() {
    if (this.flightState === 'landing') { this.flightState = 'flying'; this.landingSpot = null; }
  }

  private softBounds(world: VisitWorld, vx: number, vz: number) {
    const margin = VISIT_HELICOPTER_CLEARANCE_RADIUS + 0.08;
    const bounds = world.bounds, position = this.position;
    const left = position.x - (bounds.minX + margin), right = bounds.maxX - margin - position.x;
    const back = position.z - (bounds.minZ + margin), front = bounds.maxZ - margin - position.z;
    if (vx < 0) vx *= Math.max(0, Math.min(1, left / BOUNDARY_SLOW_ZONE));
    else if (vx > 0) vx *= Math.max(0, Math.min(1, right / BOUNDARY_SLOW_ZONE));
    if (vz < 0) vz *= Math.max(0, Math.min(1, back / BOUNDARY_SLOW_ZONE));
    else if (vz > 0) vz *= Math.max(0, Math.min(1, front / BOUNDARY_SLOW_ZONE));
    this.slowed.x = vx; this.slowed.z = vz;
  }

  private move(world: VisitWorld, dt: number) {
    this.softBounds(world, this.velocityX, this.velocityZ);
    this.proposed.x = this.position.x + this.slowed.x * dt;
    this.proposed.y = this.position.y + this.velocityY * dt;
    this.proposed.z = this.position.z + this.slowed.z * dt;
    const maximumY = Math.max(this.departureY + 1.5, 4.5, Math.min(9, world.maxHeight + 2));
    let groundBlocked = false;
    const groundClearance = this.flightState === 'takeoff' ? 0 : 0.05;
    let minimumY = this.flightState === 'landing' && this.landingSpot
      ? this.landingSpot.y : world.ground.supportAt(this.proposed.x, this.proposed.z, 0.36).height + groundClearance;
    if (this.flightState === 'flying' && minimumY > this.position.y + 0.03 && this.proposed.y < minimumY) {
      // An elevated slab entering under a skid is a barrier until the pilot
      // climbs. Do not snap the aircraft upward to the slab's height.
      this.proposed.x = this.position.x;
      this.proposed.z = this.position.z;
      minimumY = world.ground.supportAt(this.position.x, this.position.z, 0.36).height + groundClearance;
      this.velocityX *= 0.2; this.velocityZ *= 0.2;
      groundBlocked = true;
    }
    this.proposed.y = Math.min(maximumY, Math.max(minimumY, this.proposed.y));
    const fraction = visitVehicleSweep(world, this.position, this.proposed, VISIT_HELICOPTER_VOLUMES, this.candidates);
    this.blocked = groundBlocked || fraction < 1;
    if (fraction < 1) {
      this.proposed.x = this.position.x + (this.proposed.x - this.position.x) * fraction;
      this.proposed.y = this.position.y + (this.proposed.y - this.position.y) * fraction;
      this.proposed.z = this.position.z + (this.proposed.z - this.position.z) * fraction;
      this.velocityX *= 0.2; this.velocityY *= 0.2; this.velocityZ *= 0.2;
    }
    this.position.x = this.proposed.x;
    this.position.y = this.proposed.y;
    this.position.z = this.proposed.z;
  }

  step(rawDelta: number, input: VisitHelicopterInput, world: VisitWorld, landingResolver: VisitLandingResolver) {
    const dt = Math.min(0.05, Math.max(0, Number.isFinite(rawDelta) ? rawDelta : 0));
    this.justLanded = false;
    if (dt === 0) return;
    this.mainRotorAngle = (this.mainRotorAngle + dt * (this.flightState === 'landed' ? 23 : 36)) % (Math.PI * 2);
    this.tailRotorAngle = (this.tailRotorAngle + dt * (this.flightState === 'landed' ? 70 : 110)) % (Math.PI * 2);
    if (this.flightState === 'arriving') return;
    if (this.flightState === 'landed') {
      this.velocityX = this.velocityY = this.velocityZ = this.yawVelocity = 0;
      if (input.vertical > 0.2) this.beginTakeoff();
      else return;
    }
    if (input.land && !this.lastLandInput && this.flightState === 'flying') this.requestLanding(landingResolver);
    this.lastLandInput = Boolean(input.land);
    if (this.flightState === 'landing' && this.landingSpot) {
      this.landingValidationClock += dt;
      if (this.landingValidationClock >= 0.2 || this.position.y - this.landingSpot.y <= 0.02) {
        this.landingValidationClock = 0;
        const spot = landingResolver.resolve(this.position.x, this.position.z, this.position.y + 0.005);
        if (!spot || Math.abs(spot.y - this.landingSpot.y) > 0.015) {
          this.landingRejected = true;
          this.cancelLanding();
        }
      }
      if (this.flightState === 'landing' && this.landingSpot) {
        const damping = Math.exp(-5 * dt);
        this.velocityX *= damping; this.velocityZ *= damping; this.yawVelocity *= damping;
        this.pitch *= damping; this.roll *= damping;
        this.velocityY = -Math.min(0.35, Math.max(0.08, (this.position.y - this.landingSpot.y) * 0.65));
        if (this.position.y - this.landingSpot.y <= 0.008 && Math.hypot(this.velocityX, this.velocityZ) < 0.035) {
          this.position.y = this.landingSpot.y;
          this.velocityX = this.velocityY = this.velocityZ = this.yawVelocity = 0;
          this.flightState = 'landed';
          this.landingSpot = null;
          this.justLanded = true;
          return;
        }
        this.move(world, dt);
        return;
      }
    }
    const forward = clampUnit(input.forward), strafe = clampUnit(input.strafe);
    const length = Math.max(1, Math.hypot(forward, strafe));
    const targetX = this.flightState === 'takeoff' ? 0 : (Math.sin(this.yaw) * forward + Math.cos(this.yaw) * strafe) / length * MAX_HORIZONTAL_SPEED;
    const targetZ = this.flightState === 'takeoff' ? 0 : (-Math.cos(this.yaw) * forward + Math.sin(this.yaw) * strafe) / length * MAX_HORIZONTAL_SPEED;
    const horizontalResponse = 1 - Math.exp(-(forward || strafe ? 1.8 : 3) * dt);
    this.velocityX += (targetX - this.velocityX) * horizontalResponse;
    this.velocityZ += (targetZ - this.velocityZ) * horizontalResponse;
    const targetVertical = this.flightState === 'takeoff' ? 0.45 : clampUnit(input.vertical) * MAX_VERTICAL_SPEED;
    this.velocityY += (targetVertical - this.velocityY) * (1 - Math.exp(-3.6 * dt));
    this.yawVelocity += (clampUnit(input.yaw) * MAX_YAW_SPEED - this.yawVelocity) * (1 - Math.exp(-4 * dt));
    this.yaw += this.yawVelocity * dt;
    const settle = 1 - Math.exp(-3.5 * dt);
    this.pitch += ((-forward * 0.095) - this.pitch) * settle;
    this.roll += ((-strafe * 0.10 - this.yawVelocity * 0.025) - this.roll) * settle;
    this.move(world, dt);
    if (this.flightState === 'takeoff' && this.position.y - this.departureY >= 0.42) this.flightState = 'flying';
  }
}
