import { soyEase, soyProgress } from './soyHarvestTimeline';

/** Numeric protocol only. The existing CameraRig owns and applies the camera. */
export const soyHarvestCameraFrame = {
  ready: false, restored: false,
  position: { x: 52, y: 16, z: -36 }, target: { x: 52, y: 0, z: -54.5 },
  fov: 44, near: 0.02, far: 500,
  initial: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 },
    fov: 38, near: 0.05, far: 500, captured: false },
};

// Long, eased transitions preserve orientation; no orbit is driven by a second controller.
const shots = [
  { t: 0, p: [52, 14, -35], a: [52, .1, -54.5] },
  { t: 6, p: [52, 12, -38], a: [52, .1, -54.5] },
  { t: 10, p: [50.9, 1.35, -52.4], a: [51.3, .12, -54] },
  { t: 14.5, p: [51.1, 1.25, -52.5], a: [51.4, .14, -54] },
  { t: 17, p: [58.2, 4.6, -50.8], a: [52.5, .25, -54.5] },
  { t: 19.4, p: [58.5, 4.6, -50.8], a: [53, .25, -54.5] },
  { t: 21, p: [55, 7, -44], a: [52, .1, -54.5] },
  { t: 26, p: [56, 5, -46], a: [52, .12, -54.5] },
  { t: 28, p: [51, 9, -43], a: [52, .1, -54.5] },
  { t: 35.5, p: [57, 8, -43], a: [53, .12, -54.5] },
  { t: 38.5, p: [64, 2.7, -48.8], a: [62, .4, -52.2] },
  { t: 43, p: [64, 2.7, -48.8], a: [62, .4, -52.2] },
  { t: 48, p: [65.5, 3.3, -48.4], a: [62.5, .3, -52.7] },
] as const;
const axes = ['x', 'y', 'z'] as const;
// The narrow mobile canvas needs the full header and truck framed as unloading
// begins, while the desktop shot keeps its slower approach until the grain flows.
const shotTime = (time: number, portrait: boolean) => portrait && time === 38.5 ? 37 : time;

/** Writes into one stable frame. Portrait framing widens rather than cutting the machinery. */
export function publishSoyHarvestCamera(time: number, reducedMotion: boolean, portrait: boolean) {
  const frame = soyHarvestCameraFrame;
  if (!frame.initial.captured) return;
  let previous = shots[0] as typeof shots[number], next = previous;
  if (!reducedMotion) {
    for (let i = 1; i < shots.length; i += 1) {
      next = shots[i];
      if (time <= shotTime(next.t, portrait)) break;
      previous = next;
    }
  }
  const blend = previous.t === next.t ? 0 : soyEase(soyProgress(time, shotTime(previous.t, portrait), shotTime(next.t, portrait)));
  const entry = reducedMotion ? 1 : soyEase(soyProgress(time, 0, 1.2));
  const widen = portrait ? 2.2 : 1;
  for (let i = 0; i < 3; i += 1) {
    const axis = axes[i];
    const target = previous.a[i] + (next.a[i] - previous.a[i]) * blend;
    const position = previous.p[i] + (next.p[i] - previous.p[i]) * blend;
    frame.target[axis] = frame.initial.target[axis] + (target - frame.initial.target[axis]) * entry;
    frame.position[axis] = frame.initial.position[axis] + (target + (position - target) * widen - frame.initial.position[axis]) * entry;
  }
  frame.fov = frame.initial.fov + (44 - frame.initial.fov) * entry;
  frame.ready = true;
}
