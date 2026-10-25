/** Compressed educational cycle; seconds are playback time, never agronomic time. */
export const SOY_HARVEST_DURATION = 48;
export const SOY_HARVEST_PHASES = [
  { id: 'planting', label: 'Plantio', start: 0, end: 6 },
  { id: 'growth', label: 'Nascimento e crescimento', start: 6, end: 16 },
  { id: 'management', label: 'Manejo da lavoura', start: 16, end: 21 },
  { id: 'maturation', label: 'Maturação', start: 21, end: 27 },
  { id: 'harvest', label: 'Colheita', start: 27, end: 37 },
  { id: 'unloading', label: 'Descarga', start: 37, end: 44 },
  { id: 'transport', label: 'Transporte e encerramento', start: 44, end: 48 },
] as const;

export type SoyHarvestPhase = typeof SOY_HARVEST_PHASES[number]['id'];
export const clampSoy = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export const soyProgress = (time: number, start: number, end: number) => clampSoy((time - start) / (end - start));
export const soyEase = (value: number) => { const t = clampSoy(value); return t * t * (3 - 2 * t); };

export function soyPhaseAt(time: number) {
  const safe = Math.max(0, Number.isFinite(time) ? time : 0);
  return SOY_HARVEST_PHASES.find(phase => safe < phase.end) ?? SOY_HARVEST_PHASES[6];
}

export interface SoyCycleSample {
  time: number;
  phase: SoyHarvestPhase;
  planted: number;
  plantVisibility: number;
  management: number;
  managementVisibility: number;
  growth: number;
  maturation: number;
  harvested: number;
  harvestVisibility: number;
  combineArrival: number;
  combineArrivalVisibility: number;
  auger: number;
  unloading: boolean;
  truckFill: number;
  machineFill: number;
  transport: number;
}

const WORK_LENGTH = 18;
const WORK_TURN = Math.PI * .9;
export const SOY_WORK_PATH_LENGTH = WORK_LENGTH * 3 + WORK_TURN * 2;
export const SOY_VISIBLE_WORK_SPEED = Object.freeze({ planting: .75, management: .75, harvest: .45 });

/** Each pass shows a representative centre section at agricultural speed.
 * Its unseen prefix/remainder and headland are a deliberate time ellipse.
 * The implement still samples the entire continuous path; its mask never jumps
 * to a different row or resets. Opacity is exactly zero during accelerated travel. */
export function soyPassageDistance(time: number, duration: number, speed: number, passCount = 3) {
  const length = WORK_LENGTH * passCount + WORK_TURN * (passCount - 1);
  if (time <= 0) return 0;
  if (time >= duration) return length;
  const period = duration / passCount, lane = Math.min(passCount - 1, Math.floor(time / period));
  const local = time - lane * period, hiddenEntry = period * .09, visibleDuration = period * .64;
  const centreStart = WORK_LENGTH * .46;
  const segmentLength = WORK_LENGTH + (lane < passCount - 1 ? WORK_TURN : 0);
  let distance: number;
  if (local < hiddenEntry) distance = centreStart * soyEase(local / hiddenEntry);
  else if (local < hiddenEntry + visibleDuration) distance = centreStart + (local - hiddenEntry) * speed;
  else {
    const endVisible = centreStart + visibleDuration * speed;
    distance = endVisible + (segmentLength - endVisible) * soyEase((local - hiddenEntry - visibleDuration) / (period - hiddenEntry - visibleDuration));
  }
  return lane * (WORK_LENGTH + WORK_TURN) + distance;
}

export function soyPassageVisibility(time: number, duration: number, passCount = 3) {
  if (time <= 0 || time >= duration) return 0;
  const period = duration / passCount, local = time % period;
  const entry = period * .09, exit = entry + period * .64, fade = Math.min(.16, period * .08);
  return soyEase((local - entry) / fade) * (1 - soyEase((local - exit + fade) / fade));
}

/** The truck starts at 30 km/h, then accelerates smoothly to road speed (60).
 * Only the off-screen
 * remainder is condensed to reach the highway before the 48-second endpoint. */
export function soyTransportDistance(time: number, pathLength: number) {
  const elapsed = Math.max(0, Math.min(4, time - 44)), departureDuration = 3.8;
  if (elapsed <= 1.2) return elapsed * 1.25;
  if (elapsed <= 2.4) { const accelerating = elapsed - 1.2; return 1.5 + accelerating * 1.25 + accelerating * accelerating * (1.25 / 2.4); }
  if (elapsed <= departureDuration) return 3.75 + (elapsed - 2.4) * 2.5;
  const departureDistance = 7.25;
  return departureDistance + (pathLength - departureDistance) * soyEase((elapsed - departureDuration) / (4 - departureDuration));
}

/** Accepts a reused target so render-loop sampling allocates nothing. */
export function sampleSoyCycle(time: number, target?: SoyCycleSample): SoyCycleSample {
  const t = Math.max(0, Math.min(SOY_HARVEST_DURATION, Number.isFinite(time) ? time : 0));
  const result = target ?? {} as SoyCycleSample;
  result.time = t;
  result.phase = soyPhaseAt(t).id;
  result.planted = soyPassageDistance(t, 6, SOY_VISIBLE_WORK_SPEED.planting) / SOY_WORK_PATH_LENGTH;
  result.plantVisibility = soyPassageVisibility(t, 6);
  result.management = soyPassageDistance(t - 16, 5, SOY_VISIBLE_WORK_SPEED.management, 1) / WORK_LENGTH;
  result.managementVisibility = soyPassageVisibility(t - 16, 5, 1);
  result.growth = soyProgress(t, 6, 16);
  result.maturation = soyProgress(t, 21, 27);
  result.harvested = soyPassageDistance(t - 27, 9.4, SOY_VISIBLE_WORK_SPEED.harvest) / SOY_WORK_PATH_LENGTH;
  result.harvestVisibility = soyPassageVisibility(t - 27, 9.4);
  // The last ellipse ends at the unloading headland, then a 12 km/h approach.
  result.combineArrival = t <= 36.9 ? soyEase(soyProgress(t, 36.4, 36.9)) * 1.9985 : 1.9985 + .25 * soyProgress(t, 36.9, 37.4);
  result.combineArrivalVisibility = soyEase(soyProgress(t, 36.9, 37.1));
  // Both vehicles settle before extension. Flow ends before the tube folds and truck leaves.
  result.auger = soyEase(soyProgress(t, 37.4, 38.4)) * (1 - soyEase(soyProgress(t, 43.1, 43.9)));
  result.unloading = t >= 38.5 && t < 43;
  result.truckFill = soyProgress(t, 38.5, 43);
  result.machineFill = result.harvested * (1 - result.truckFill);
  result.transport = soyProgress(t, 44, 48);
  return result;
}

/** Each plant is changed only after the working implement has crossed its row position. */
export function sampleSoyPlant(time: number, along: number, lane = 0, laneCount = 1) {
  const safeLanes = Math.max(1, laneCount), width = 18, turn = Math.PI * .9;
  const position = (Math.max(0, lane) * (width + turn) + clampSoy(along) * width) / (safeLanes * width + (safeLanes - 1) * turn);
  const planted = soyPassageDistance(time, 6, SOY_VISIBLE_WORK_SPEED.planting, safeLanes) / (safeLanes * width + (safeLanes - 1) * turn) >= position;
  const harvested = time >= 27 && soyPassageDistance(time - 27, 9.4, SOY_VISIBLE_WORK_SPEED.harvest, safeLanes) / (safeLanes * width + (safeLanes - 1) * turn) >= position;
  return {
    planted,
    growth: !planted ? 0 : soyProgress(time, 6 + position * 0.4, 16),
    maturation: soyProgress(time, 21, 27),
    harvested,
  };
}

export interface SoyPlaybackClock { elapsed: number; lastNow: number | null }
export function createSoyPlaybackClock(): SoyPlaybackClock { return { elapsed: 0, lastNow: null }; }
/** Monotonic deltas; pause clears lastNow so a hidden tab can never skip the cycle. */
export function tickSoyPlaybackClock(clock: SoyPlaybackClock, nowMs: number, running: boolean) {
  if (!running) { clock.lastNow = null; return clock.elapsed; }
  if (!Number.isFinite(nowMs)) return clock.elapsed;
  if (clock.lastNow !== null) clock.elapsed = Math.min(SOY_HARVEST_DURATION, clock.elapsed + Math.max(0, nowMs - clock.lastNow) / 1000);
  clock.lastNow = Math.max(clock.lastNow ?? nowMs, nowMs);
  return clock.elapsed;
}

export interface SoyWorkPose { x: number; z: number; heading: number; distance: number; working: boolean; lanes: [number, number, number] }
export function createSoyWorkPose(): SoyWorkPose { return { x: 43, z: -56.3, heading: Math.PI / 2, distance: 0, working: false, lanes: [0, 0, 0] }; }
/** Three continuous working lines joined by semicircles contained in the headlands.
 * Coordinates are the versioned presentation layout, not survey measurements. */
export function sampleSoyWorkPath(progress: number, result = createSoyWorkPose()) {
  const width = 18, radius = 0.9, turn = Math.PI * radius;
  let distance = clampSoy(progress) * (width * 3 + turn * 2);
  result.distance = distance;
  for (let i = 0; i < 3; i += 1) result.lanes[i] = 0;
  for (let lane = 0; lane < 3; lane += 1) {
    const reverse = lane % 2 === 1, z = -56.3 + lane * 1.8;
    if (distance <= width || lane === 2) {
      const p = clampSoy(distance / width);
      result.x = reverse ? 61 - p * width : 43 + p * width;
      result.z = z; result.heading = reverse ? -Math.PI / 2 : Math.PI / 2;
      result.working = true; result.lanes[lane] = p;
      return result;
    }
    result.lanes[lane] = 1; distance -= width;
    if (distance < turn) {
      const angle = distance / radius;
      result.x = (reverse ? 43 : 61) + (reverse ? -1 : 1) * radius * Math.sin(angle);
      result.z = z + radius * (1 - Math.cos(angle));
      result.heading = reverse ? -Math.PI / 2 + angle : Math.PI / 2 - angle;
      result.working = false; return result;
    }
    distance -= turn;
  }
  return result;
}
