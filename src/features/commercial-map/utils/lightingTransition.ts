import type { DirectionalLight, WebGLRenderer } from 'three';

export interface SunrisePlayback {
  sequence: number;
  progress: number;
  from: number;
  elapsed: number;
  rewinding: boolean;
}

export const hasSunrisePlaybackFinished = (playback: SunrisePlayback) =>
  !playback.rewinding && playback.progress >= 1 && playback.elapsed >= 7.5;

export function advanceSunrisePlayback(
  playback: SunrisePlayback, sequence: number, running: boolean, complete: boolean,
  deltaSeconds: number, paused: boolean,
) {
  if (playback.sequence !== sequence) {
    playback.sequence = sequence;
    playback.from = playback.progress;
    playback.elapsed = 0;
    playback.rewinding = running && playback.progress > 0;
  }
  if (complete) return (playback.progress = 1);
  if (!running || paused) return playback.progress;
  // Demand-idle, hidden time and shader stalls are not animation time.
  playback.elapsed += Math.min(Math.max(deltaSeconds, 0), .05);
  if (playback.rewinding) {
    const t = Math.min(playback.elapsed / .7, 1);
    playback.progress = playback.from * (1 - t * t * (3 - 2 * t));
    if (t === 1) { playback.rewinding = false; playback.elapsed = 0; }
  } else playback.progress = Math.min(playback.elapsed / 7.5, 1);
  return playback.progress;
}

/** Keep shader light/shadow counts invariant, including at zero solar energy. */
export function updateSolarShadow(
  light: DirectionalLight, renderer: WebGLRenderer, intensity: number, moved: boolean,
) {
  const wasDark = light.intensity === 0;
  light.intensity = intensity;
  light.visible = true;
  // The scene's shared dirty flag also covers vegetation, LOD and model edits.
  // Honor it while lit; only opt this sun out of passes at zero contribution.
  light.shadow.autoUpdate = intensity > 0;
  if (intensity === 0) {
    light.shadow.needsUpdate = false;
    return;
  }
  if (wasDark || moved || !light.shadow.map || light.shadow.needsUpdate) {
    light.shadow.needsUpdate = true;
    renderer.shadowMap.needsUpdate = true;
  }
}
