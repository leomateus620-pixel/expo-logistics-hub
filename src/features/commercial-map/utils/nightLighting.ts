import type { CommercialElectricalNode } from '../data/electricalInfrastructure';
import type {
  ElectricalPoleCrossarmLayout,
  ResolvedElectricalNodePlacement,
} from './electricalInfrastructure';

/**
 * Park-wide Night Mode lighting derived from the official pole inventory.
 *
 * Every utility pole receives two LED luminaires (one per crossarm side) and
 * junction poles — those that carry more than one primary alignment chain —
 * receive a third head along the secondary chain so intersections stay lit.
 * Light reaches the ground as instanced multiplicative pools rather than as
 * hundreds of dynamic point lights, so 400+ poles cost four draw calls.
 */
export const NIGHT_LIGHTING_CONFIG = {
  revision: '2028.1-global-night',
  /** Default heads per pole (left/right arm). */
  lampsPerPole: 2,
  /** Heads on poles that join two alignment chains. */
  lampsPerJunctionPole: 3,
  /** Horizontal reach of each luminaire arm, in map units (0.15 units/metre). */
  armLength: 0.3,
  /** How far below the crossarm the arm leaves the pole. */
  armDrop: 0.24,
  /** Luminaire body footprint (length along the arm, height, width). */
  headSize: [0.15, 0.048, 0.085] as const,
  /** Emissive HDR peak of the LED head; clears the shared bloom threshold (3.2). */
  headEmissivePeak: 6.4,
  /** Radius of the ground pool around one head, before per-lamp variation. */
  poolRadius: 2.45,
  /** Pool centre is thrown forward of the head, like a real cobra-head optic. */
  poolForwardOffset: 0.42,
  /** Multiplicative gain applied to the surface under the pool centre. */
  poolGain: 2.15,
  /** Ground pools sit above every flat lot top (0.16–0.18) so they read on lots. */
  poolClearance: 0.205,
  /** Additive halo around each head (HDR, below the bloom threshold). */
  glowSize: 0.62,
  glowGain: 0.95,
  /** Reveal lambda used by the layer damping (seconds⁻¹). */
  revealLambdaIn: 1.9,
  revealLambdaOut: 3.4,
  /** Instanced draw calls issued by the layer (arm, head, glow, pool). */
  drawCalls: 4,
  colors: {
    led: '#ffe7c2',
    poolCool: '#d5deff',
    poolWarm: '#ffc98a',
    glow: '#ffd9a6',
    arm: '#3b4044',
  },
} as const;

export interface NightLampFixture {
  id: string;
  poleId: string;
  /** World position of the luminaire head. */
  headPosition: readonly [number, number, number];
  /** World position where the arm leaves the pole. */
  armOrigin: readonly [number, number, number];
  /** Unit XZ direction from the pole to the head. */
  direction: readonly [number, number];
  /** Yaw (radians, about +Y) that aligns local +X with `direction`. */
  yawRadians: number;
  armLength: number;
  /** Centre of the ground pool, thrown slightly forward of the head. */
  poolCenter: readonly [number, number, number];
  poolRadius: number;
  /** 0.82–1.12 lamp-to-lamp brightness variation. */
  intensity: number;
  /** 0 = cool LED white, 1 = warm sodium-like tint. */
  warmth: number;
  /** Deterministic 0–1 value used to stagger the reveal and break up pools. */
  seed: number;
}

export interface NightLightingSummary {
  poleCount: number;
  lampCount: number;
  twoLampPoles: number;
  threeLampPoles: number;
  drawCalls: number;
}

function hashUnit(value: string, salt: number) {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

function crossarmAxis(rotationRadians: number): readonly [number, number] {
  // Matches the insulator spread in CommercialElectricalInfrastructureLayer:
  // conductors fan out along (cos r, -sin r), so the arms face the same way.
  return [Math.cos(rotationRadians), -Math.sin(rotationRadians)];
}

function angularDistance(a: readonly [number, number], b: readonly [number, number]) {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]));
  return Math.acos(dot);
}

function resolveLampDirections(
  layouts: readonly ElectricalPoleCrossarmLayout[],
  fallbackRotation: number,
) {
  const sorted = [...layouts].sort((left, right) => left.id.localeCompare(right.id));
  const primary = crossarmAxis(sorted[0]?.rotationRadians ?? fallbackRotation);
  const directions: Array<readonly [number, number]> = [
    primary,
    [-primary[0], -primary[1]],
  ];
  if (sorted.length < 2) return directions;
  const secondary = crossarmAxis(sorted[1].rotationRadians);
  const candidates: Array<readonly [number, number]> = [secondary, [-secondary[0], -secondary[1]]];
  const best = candidates
    .map((candidate) => ({
      candidate,
      separation: Math.min(...directions.map((existing) => angularDistance(candidate, existing))),
    }))
    .sort((left, right) => right.separation - left.separation)[0];
  // A near-collinear second chain would only stack a third head on top of an
  // existing one; the junction then keeps the standard two luminaires.
  if (best.separation < Math.PI / 6) return directions;
  directions.push(best.candidate);
  return directions;
}

export function buildNightLampFixtures(
  placements: readonly ResolvedElectricalNodePlacement[],
  crossarmLayouts: readonly ElectricalPoleCrossarmLayout[],
): readonly NightLampFixture[] {
  const config = NIGHT_LIGHTING_CONFIG;
  const layoutsByPole = new Map<string, ElectricalPoleCrossarmLayout[]>();
  crossarmLayouts.forEach((layout) => {
    const list = layoutsByPole.get(layout.nodeId) ?? [];
    list.push(layout);
    layoutsByPole.set(layout.nodeId, list);
  });

  const fixtures: NightLampFixture[] = [];
  placements.forEach((placement) => {
    const pole: CommercialElectricalNode = placement.node;
    if (pole.type !== 'POLE') return;
    const [x, z] = placement.renderPosition;
    const armY = placement.groundElevation + pole.height - config.armDrop;
    const directions = resolveLampDirections(layoutsByPole.get(pole.id) ?? [], placement.rotationRadians);
    directions.forEach((direction, lampIndex) => {
      const id = `${pole.id}-lamp-${lampIndex + 1}`;
      const seed = hashUnit(id, 17);
      const armLength = config.armLength * (0.94 + hashUnit(id, 29) * 0.12);
      const headX = x + direction[0] * armLength;
      const headZ = z + direction[1] * armLength;
      const poolRadius = config.poolRadius * (0.88 + hashUnit(id, 41) * 0.24);
      const forward = config.poolForwardOffset * (0.85 + hashUnit(id, 53) * 0.3);
      fixtures.push({
        id,
        poleId: pole.id,
        headPosition: [headX, armY, headZ],
        armOrigin: [x, armY, z],
        direction,
        yawRadians: Math.atan2(-direction[1], direction[0]),
        armLength,
        poolCenter: [
          headX + direction[0] * forward,
          Math.max(config.poolClearance, placement.groundElevation + 0.03),
          headZ + direction[1] * forward,
        ],
        poolRadius,
        intensity: 0.82 + hashUnit(id, 67) * 0.3,
        warmth: 0.25 + hashUnit(id, 79) * 0.6,
        seed,
      });
    });
  });
  return fixtures;
}

export function summarizeNightLighting(
  fixtures: readonly NightLampFixture[],
): NightLightingSummary {
  const lampsByPole = new Map<string, number>();
  fixtures.forEach((fixture) => {
    lampsByPole.set(fixture.poleId, (lampsByPole.get(fixture.poleId) ?? 0) + 1);
  });
  let twoLampPoles = 0;
  let threeLampPoles = 0;
  lampsByPole.forEach((count) => {
    if (count === NIGHT_LIGHTING_CONFIG.lampsPerJunctionPole) threeLampPoles += 1;
    else if (count === NIGHT_LIGHTING_CONFIG.lampsPerPole) twoLampPoles += 1;
  });
  return {
    poleCount: lampsByPole.size,
    lampCount: fixtures.length,
    twoLampPoles,
    threeLampPoles,
    drawCalls: fixtures.length > 0 ? NIGHT_LIGHTING_CONFIG.drawCalls : 0,
  };
}
