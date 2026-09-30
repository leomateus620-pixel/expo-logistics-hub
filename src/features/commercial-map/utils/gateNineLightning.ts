import { GATE_NINE_LIGHTNING } from '../data/gateNineCommunicationTower';

export interface GateNineLightningState {
  enabled: boolean;
  enabledAtMs: number;
  fired: boolean;
  activations: number;
  strikes: number;
}
export interface GateNineLightningFrame {
  phase: 'idle' | 'waiting' | 'strike' | 'complete';
  energy: number;
  leader: number;
  elapsedMs: number;
  needsFrame: boolean;
}
export function createGateNineLightningState(): GateNineLightningState {
  return { enabled: false, enabledAtMs: 0, fired: false, activations: 0, strikes: 0 };
}
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/** One cloud-to-mast discharge per off→on transition, with three return strokes.
 * The user's explicit instruction keeps this timeline for reduced motion too. */
export function advanceGateNineLightning(
  state: GateNineLightningState, enabled: boolean, nowMs: number, _prefersReducedMotion = false,
): GateNineLightningFrame {
  if (!enabled) {
    state.enabled = false; state.fired = false;
    return { phase: 'idle', energy: 0, leader: 0, elapsedMs: 0, needsFrame: false };
  }
  if (!state.enabled) {
    state.enabled = true; state.enabledAtMs = nowMs; state.fired = false; state.activations += 1;
  }
  const elapsedMs = Math.max(0, nowMs - state.enabledAtMs);
  if (elapsedMs < GATE_NINE_LIGHTNING.delayMs) return { phase: 'waiting', energy: 0, leader: 0, elapsedMs, needsFrame: true };
  const strikeMs = elapsedMs - GATE_NINE_LIGHTNING.delayMs;
  if (strikeMs >= GATE_NINE_LIGHTNING.durationMs) return { phase: 'complete', energy: 0, leader: 0, elapsedMs, needsFrame: false };
  if (!state.fired) { state.fired = true; state.strikes += 1; }
  const t = strikeMs / 1000;
  const pulse = (start: number, attack: number, decay: number, strength: number) => {
    if (t < start) return 0;
    return strength * clamp((t - start) / attack) * Math.exp(-Math.max(0, t - start - attack) / decay);
  };
  const energy = clamp(pulse(0, .022, .09, 1) + pulse(.28, .012, .085, .84) + pulse(.65, .018, .125, .7));
  return { phase: 'strike', energy, leader: clamp(strikeMs / 42), elapsedMs, needsFrame: true };
}

export type LightningPoint = readonly [number, number, number];
const random = (seed: number) => { const value = Math.sin(seed * 19.131 + .73) * 43758.5453; return value - Math.floor(value); };
/** Frozen jagged ionized channel, reused for all three return strokes and future toggles. */
export function gateNineLightningPaths(topY: number): LightningPoint[][] {
  const main: LightningPoint[] = [];
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, edge = Math.sin(t * Math.PI);
    main.push([4.2 * (1 - t) + (random(i * 3 + 1) - .5) * 1.05 * edge,
      GATE_NINE_LIGHTNING.cloudHeight + (topY - GATE_NINE_LIGHTNING.cloudHeight) * t,
      -3.4 * (1 - t) + (random(i * 3 + 2) - .5) * .9 * edge]);
  }
  main[main.length - 1] = [0, topY, 0];
  const branches = [4, 7, 10, 14, 17, 20].map((index, branch) => {
    const start = main[index];
    return Array.from({ length: 7 }, (_, i) => {
      const t = i / 6;
      return [start[0] + (branch % 2 ? -1 : 1) * (1.8 + random(branch + 42) * 1.2) * t + (random(i + branch * 9) - .5) * .35 * t,
        start[1] - t * (1.6 + random(branch + 62) * 2.4),
        start[2] + (random(branch + 84) - .5) * 3.6 * t] as LightningPoint;
    });
  });
  return [main, ...branches];
}
