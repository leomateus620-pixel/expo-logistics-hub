import type { VisitVector3 } from './visitTypes';
import type { VisitWorld } from './VisitWorld';
import type { visitInput } from './VisitInputManager';

export const VISIT_METRES = 0.15;
export const VISIT_BODY = { radius: 0.3 * VISIT_METRES, height: 1.72 * VISIT_METRES, eye: 1.62 * VISIT_METRES };
export class VisitCharacterController {
  readonly position: VisitVector3;
  velocityX = 0; velocityZ = 0;
  yaw = 0; pitch = -0.045; bodyYaw = 0; distance = 0;
  movement: 'idle' | 'walk' | 'run' = 'idle';
  constructor(position: VisitVector3) { this.position = position; }
  stop() { this.velocityX = this.velocityZ = 0; this.movement = 'idle'; }
  step(rawDelta: number, input: typeof visitInput, world: VisitWorld) {
    const dt = Math.min(0.05, Math.max(0, rawDelta));
    this.yaw += input.lookX * 0.0024;
    this.pitch = Math.max(-1.2, Math.min(1.1, this.pitch - input.lookY * 0.0024));
    input.lookX = input.lookY = 0;
    const length = Math.max(1, Math.hypot(input.forward, input.strafe));
    const speed = (input.run ? 3.4 : 1.45) * VISIT_METRES;
    const dx = (Math.sin(this.yaw) * input.forward + Math.cos(this.yaw) * input.strafe) / length;
    const dz = (-Math.cos(this.yaw) * input.forward + Math.sin(this.yaw) * input.strafe) / length;
    const damping = 1 - Math.exp(-(input.forward || input.strafe ? 11 : 14) * dt);
    this.velocityX += (dx * speed - this.velocityX) * damping;
    this.velocityZ += (dz * speed - this.velocityZ) * damping;
    if (Math.hypot(this.velocityX, this.velocityZ) < 0.0005) this.velocityX = this.velocityZ = 0;
    const beforeX = this.position.x, beforeZ = this.position.z;
    world.move(this.position, this.velocityX * dt, this.velocityZ * dt, VISIT_BODY.radius, VISIT_BODY.height);
    const traveled = Math.hypot(this.position.x - beforeX, this.position.z - beforeZ);
    this.distance += traveled;
    this.movement = traveled < 0.000005 ? 'idle' : input.run ? 'run' : 'walk';
    if (traveled > 0.000005) {
      const desired = Math.atan2(this.position.x - beforeX, -(this.position.z - beforeZ));
      const difference = Math.atan2(Math.sin(desired - this.bodyYaw), Math.cos(desired - this.bodyYaw));
      this.bodyYaw += difference * (1 - Math.exp(-12 * dt));
    }
  }
}
