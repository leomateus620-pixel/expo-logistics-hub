import type { VisitCharacterController } from '../VisitCharacterController';
import type { VisitWorld } from '../VisitWorld';
import type { VisitMobilityPhase } from '../useVisitStore';
import { useVisitStore } from '../useVisitStore';
import type { visitInput } from '../VisitInputManager';
import { VisitCartController } from './VisitCartController';
import { VisitHelicopterController } from './VisitHelicopterController';
import { resolveVisitCartSpawn, resolveVisitVehicleExit, VISIT_CART_RADIUS } from './VisitVehiclePlacement';
import { VisitLandingResolver, VISIT_HELICOPTER_LANDING_RADIUS } from './VisitLandingResolver';
import { resolveVisitHelicopterArrival, type VisitHelicopterArrivalPath } from './VisitHelicopterArrival';
import { VisitVehicleCameras } from './VisitVehicleCameras';

const smooth = (t: number) => t * t * (3 - 2 * t);
const zeroFlightInput = { forward: 0, strafe: 0, yaw: 0, vertical: 0 };

/** Discrete transitions and mutable poses only. VisitMode owns the sole R3F
 * frame callback; this manager never schedules frames or touches React per tick. */
export class VisitVehicleManager {
  readonly cameras = new VisitVehicleCameras();
  readonly character: VisitCharacterController;
  cart: VisitCartController | null = null;
  helicopter: VisitHelicopterController | null = null;
  private world: VisitWorld;
  private landing: VisitLandingResolver;
  private arrival: VisitHelicopterArrivalPath | null = null;
  private arrivalSeconds = 0;
  private entrySeconds = 0;
  private boardingQuerySeconds = 0;
  private arrivalFocusSeconds = 0;
  private arrivalFocusYaw = 0;
  private prepared: 'cart' | 'helicopter' | null = null;

  constructor(world: VisitWorld, character: VisitCharacterController) {
    this.world = world;
    this.landing = new VisitLandingResolver(world);
    this.character = character;
  }

  setWorld(world: VisitWorld) {
    if (this.world === world) return;
    this.world = world;
    this.landing = new VisitLandingResolver(world);
  }

  get occupiesVehicle() {
    const phase = useVisitStore.getState().mobilityPhase;
    return phase === 'cart-driving' || phase === 'cart-exiting'
      || phase === 'helicopter-entering' || phase === 'helicopter-flying'
      || phase === 'helicopter-landing' || phase === 'helicopter-grounded' || phase === 'helicopter-exiting';
  }

  get functionalMotion() {
    const phase = useVisitStore.getState().mobilityPhase;
    return phase === 'helicopter-requested' || phase === 'helicopter-arriving' || phase === 'helicopter-landed'
      || phase === 'helicopter-entering' || phase === 'helicopter-flying' || phase === 'helicopter-landing'
      || phase === 'helicopter-grounded' || phase === 'helicopter-exiting'
      || phase === 'cart-entering' || phase === 'cart-exiting'
      || Boolean(this.cart && (Math.abs(this.cart.speed) > .002 || Math.abs(this.cart.steering) > .002));
  }

  private setWalk(notice: string | null = null) {
    this.arrivalFocusSeconds = 0;
    useVisitStore.setState({ mobilityMode: 'walk', mobilityPhase: 'walk', canBoardHelicopter: false, vehicleNotice: notice });
    this.cameras.reset();
  }

  private syncOccupant() {
    const pose = this.cart && useVisitStore.getState().mobilityMode === 'cart' ? this.cart : this.helicopter;
    if (!pose) return;
    this.character.position.x = pose.position.x;
    this.character.position.y = pose.position.y;
    this.character.position.z = pose.position.z;
    this.character.yaw = pose.yaw;
    this.character.bodyYaw = pose.yaw;
    this.character.stop();
  }

  /** One short camera turn makes the arriving aircraft visible. Walking or
   * manually looking cancels it immediately; no camera is allocated. */
  private focusArrival(dt: number, input: typeof visitInput, manualLook: boolean) {
    if (this.arrivalFocusSeconds <= 0) return;
    if (manualLook || Math.abs(input.forward) + Math.abs(input.strafe) > .01) {
      this.arrivalFocusSeconds = 0;
      return;
    }
    this.arrivalFocusSeconds = Math.max(0, this.arrivalFocusSeconds - dt);
    const difference = Math.atan2(Math.sin(this.arrivalFocusYaw - this.character.yaw), Math.cos(this.arrivalFocusYaw - this.character.yaw));
    this.character.yaw += difference * (1 - Math.exp(-6 * dt));
    this.character.bodyYaw = this.character.yaw;
  }

  private arrive(dt: number) {
    const heli = this.helicopter, path = this.arrival;
    if (!heli || !path) return;
    this.arrivalSeconds += dt;
    const approachEnd = Math.max(2.8, Math.min(5, Math.hypot(path.approach.x - path.start.x, path.approach.z - path.start.z) / 1.4));
    const landingEnd = approachEnd + Math.max(3.2, Math.min(9, (path.approach.y - path.landing.y) / .72));
    const start = this.arrivalSeconds < approachEnd ? path.start : path.approach;
    const end = this.arrivalSeconds < approachEnd ? path.approach : path.landing;
    const range = this.arrivalSeconds < approachEnd ? approachEnd : landingEnd - approachEnd;
    const progress = this.arrivalSeconds < approachEnd ? this.arrivalSeconds / range : (this.arrivalSeconds - approachEnd) / range;
    const eased = smooth(Math.min(1, Math.max(0, progress)));
    heli.position.x = start.x + (end.x - start.x) * eased;
    heli.position.y = start.y + (end.y - start.y) * eased;
    heli.position.z = start.z + (end.z - start.z) * eased;
    heli.step(dt, zeroFlightInput, this.world, this.landing);
    if (this.arrivalSeconds >= landingEnd) {
      heli.position.x = path.landing.x;
      heli.position.y = path.landing.y;
      heli.position.z = path.landing.z;
      heli.flightState = 'landed';
      this.arrival = null;
      useVisitStore.getState().setMobilityPhase('helicopter-landed');
      useVisitStore.getState().setVehicleNotice('Helicóptero pousado. Aproxime-se para embarcar.');
    }
  }

  /** `ready` becomes true when the lazy model ref exists. Input is already
   * filtered by the visit focus/context guard in VisitMode. */
  step(dt: number, input: typeof visitInput, ready: { cart: boolean; helicopter: boolean }, manualLook = false) {
    const state = useVisitStore.getState();
    const phase: VisitMobilityPhase = state.mobilityPhase;
    if (phase === 'walk') {
      if (this.prepared === 'helicopter' && this.helicopter) { this.helicopter.visible = false; this.arrival = null; }
      this.boardingQuerySeconds = 0;
      this.prepared = null;
      return;
    }
    if (phase === 'cart-entering') {
      if (this.prepared !== 'cart') {
        const spawn = resolveVisitCartSpawn(this.world, this.character.position, this.character.yaw);
        if (!spawn) { this.setWalk('Não há espaço livre próximo para o carrinho.'); return; }
        this.cart = new VisitCartController(spawn, this.character.yaw);
        this.prepared = 'cart';
      }
      if (!ready.cart) return;
      this.cart.stop();
      this.syncOccupant();
      useVisitStore.getState().setMobilityPhase('cart-driving');
      return;
    }
    if (phase === 'cart-driving' && this.cart) {
      this.cart.step(dt, { forward: input.forward, steer: input.strafe, brake: input.brake }, this.world);
      this.syncOccupant();
      return;
    }
    if (phase === 'cart-exiting' && this.cart) {
      this.cart.stop();
      const exit = resolveVisitVehicleExit(this.world, this.cart.position, this.cart.yaw, VISIT_CART_RADIUS);
      if (!exit) { useVisitStore.getState().setMobilityPhase('cart-driving'); state.setVehicleNotice('Pare em uma área com espaço livre para sair.'); return; }
      Object.assign(this.character.position, exit);
      this.character.stop();
      this.setWalk();
      return;
    }
    if (phase === 'helicopter-requested') {
      if (this.prepared !== 'helicopter') {
        this.arrival = resolveVisitHelicopterArrival(this.world, this.character.position, this.landing, this.character.yaw);
        if (!this.arrival) { this.setWalk('Não há área segura próxima para o pouso do helicóptero.'); return; }
        this.helicopter = new VisitHelicopterController(this.arrival.start, this.character.yaw);
        this.helicopter.flightState = 'arriving';
        this.arrivalSeconds = 0;
        this.arrivalFocusYaw = Math.atan2(this.arrival.landing.x - this.character.position.x,
          -(this.arrival.landing.z - this.character.position.z));
        this.arrivalFocusSeconds = 1.2;
        this.prepared = 'helicopter';
      }
      this.focusArrival(dt, input, manualLook);
      if (ready.helicopter) {
        state.setMobilityPhase('helicopter-arriving');
        state.setVehicleNotice('Helicóptero se aproximando.');
      } else this.helicopter.step(dt, zeroFlightInput, this.world, this.landing);
      return;
    }
    if (phase === 'helicopter-arriving') { this.focusArrival(dt, input, manualLook); this.arrive(dt); return; }
    if (phase === 'helicopter-landed' && this.helicopter) {
      this.helicopter.step(dt, zeroFlightInput, this.world, this.landing);
      this.boardingQuerySeconds += dt;
      if (this.boardingQuerySeconds >= .1) {
        this.boardingQuerySeconds = 0;
        const distance = Math.hypot(this.character.position.x - this.helicopter.position.x, this.character.position.z - this.helicopter.position.z);
        state.setCanBoardHelicopter(distance < .65 && Math.abs(this.character.position.y - this.helicopter.position.y) < .16);
      }
      return;
    }
    if (phase === 'helicopter-entering' && this.helicopter) {
      this.entrySeconds += dt;
      this.helicopter.step(dt, zeroFlightInput, this.world, this.landing);
      this.syncOccupant();
      if (this.entrySeconds >= .28) {
        this.entrySeconds = 0;
        state.setMobilityPhase('helicopter-grounded');
        state.setVehicleNotice(null);
      }
      return;
    }
    if (phase === 'helicopter-grounded' && this.helicopter) {
      this.helicopter.step(dt, { forward: input.forward, strafe: input.strafe, yaw: input.yaw + input.lookX * .015, vertical: input.vertical }, this.world, this.landing);
      input.lookX = input.lookY = 0;
      this.syncOccupant();
      if (this.helicopter.flightState !== 'landed') state.setMobilityPhase('helicopter-flying');
      return;
    }
    if (phase === 'helicopter-flying' && this.helicopter) {
      this.helicopter.step(dt, { forward: input.forward, strafe: input.strafe, yaw: input.yaw + input.lookX * .015, vertical: input.vertical }, this.world, this.landing);
      input.lookX = input.lookY = 0;
      this.syncOccupant();
      return;
    }
    if (phase === 'helicopter-landing' && this.helicopter) {
      if (this.helicopter.flightState === 'flying' && !this.helicopter.requestLanding(this.landing)) {
        state.setMobilityPhase('helicopter-flying'); state.setVehicleNotice('Área inadequada para pouso.'); return;
      }
      this.helicopter.step(dt, zeroFlightInput, this.world, this.landing);
      this.syncOccupant();
      if (this.helicopter.landingRejected) {
        state.setMobilityPhase('helicopter-flying'); state.setVehicleNotice('Área inadequada para pouso.');
      } else if (this.helicopter.justLanded) {
        state.setMobilityPhase('helicopter-grounded'); state.setVehicleNotice('Pouso concluído. Você pode sair do helicóptero.');
      }
      return;
    }
    if (phase === 'helicopter-exiting' && this.helicopter) {
      if (!this.helicopter.canExit || !this.landing.resolve(this.helicopter.position.x, this.helicopter.position.z, this.helicopter.position.y + .01)) {
        state.setMobilityPhase('helicopter-grounded'); state.setVehicleNotice('Pouse em uma área segura antes de sair.'); return;
      }
      const exit = resolveVisitVehicleExit(this.world, this.helicopter.position, this.helicopter.yaw, VISIT_HELICOPTER_LANDING_RADIUS);
      if (!exit) { state.setMobilityPhase('helicopter-grounded'); state.setVehicleNotice('Não há espaço seguro ao lado do helicóptero.'); return; }
      Object.assign(this.character.position, exit);
      this.character.stop();
      this.helicopter.visible = false;
      this.setWalk();
    }
  }

  diagnostics() {
    const state = useVisitStore.getState();
    return { phase: state.mobilityPhase, mode: state.mobilityMode, cart: this.cart && {
      position: { ...this.cart.position }, yaw: this.cart.yaw, speed: this.cart.speed, steering: this.cart.steering, blocked: this.cart.blocked,
    }, helicopter: this.helicopter && { position: { ...this.helicopter.position }, yaw: this.helicopter.yaw,
      speed: this.helicopter.speed, flightState: this.helicopter.flightState, mainRotorAngle: this.helicopter.mainRotorAngle,
      blocked: this.helicopter.blocked, visible: this.helicopter.visible },
    };
  }
}
