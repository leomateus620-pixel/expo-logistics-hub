import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { advanceSunrisePlayback, hasSunrisePlaybackFinished, updateSolarShadow } from '@/features/commercial-map/utils/lightingTransition';
import { deserializeQueryCache } from '@/lib/queryPersistence';

describe('continuous illumination without camera or shader topology changes', () => {
  it('retains the sun and castShadow across 20 complete night/day cycles', () => {
    const sun = new THREE.DirectionalLight(); sun.castShadow = true;
    sun.shadow.map = new THREE.WebGLRenderTarget(1, 1);
    const renderer = { shadowMap: { needsUpdate: false } } as THREE.WebGLRenderer;
    const id = sun.uuid;
    for (let i = 0; i < 20; i++) {
      updateSolarShadow(sun, renderer, 0, false);
      expect(sun.visible).toBe(true); expect(sun.castShadow).toBe(true);
      expect(sun.shadow.autoUpdate).toBe(false); expect(sun.shadow.needsUpdate).toBe(false);
      renderer.shadowMap.needsUpdate = false;
      updateSolarShadow(sun, renderer, 1.72, false);
      expect(sun.shadow.needsUpdate).toBe(true); expect(renderer.shadowMap.needsUpdate).toBe(true);
      expect(sun.uuid).toBe(id);
    }
    sun.shadow.map.dispose();
  });
  it('updates moving solar shadows on the same frame and refreshes recovered targets', () => {
    const sun = new THREE.DirectionalLight();
    const renderer = { shadowMap: { needsUpdate: false } } as THREE.WebGLRenderer;
    updateSolarShadow(sun, renderer, 1, true);
    expect(sun.shadow.needsUpdate).toBe(true);
    sun.shadow.needsUpdate = false; renderer.shadowMap.needsUpdate = false;
    updateSolarShadow(sun, renderer, 1, false);
    expect(renderer.shadowMap.needsUpdate).toBe(true); // lost/unallocated map
  });
  it('replaces rapid requests continuously, pauses while hidden/compiling and clamps long-frame jumps', () => {
    const playback = { sequence: 0, progress: 1, from: 0, elapsed: 0, rewinding: false };
    let last = 1;
    for (let sequence = 1; sequence <= 20; sequence++) {
      const value = advanceSunrisePlayback(playback, sequence, true, false, .016, false);
      expect(Math.abs(value - last)).toBeLessThan(.01); last = value;
    }
    const frozen = playback.progress;
    expect(advanceSunrisePlayback(playback, 20, true, false, 30, true)).toBe(frozen);
    advanceSunrisePlayback(playback, 20, true, false, 30, false);
    expect(Math.abs(playback.progress - frozen)).toBeLessThan(.04);
    for (let i = 0; i < 600; i++) advanceSunrisePlayback(playback, 20, true, false, 1 / 60, false);
    expect(playback.progress).toBe(1);
  });
  it('drops old persisted commercial inventories while preserving unrelated query caches', () => {
    const result = deserializeQueryCache(JSON.stringify({ timestamp: 1, buster: 'user', clientState: {
      mutations: [], queries: [{ queryKey: ['commercial-map', 'full', 'user', 'org'] }, { queryKey: ['agenda'] }],
    } }));
    expect(result.clientState.queries.map((q) => q.queryKey)).toEqual([['agenda']]);
  });
  it('does not complete a replay on a demand frame whose delta is zero', () => {
    const playback = { sequence: 0, progress: 1, from: 0, elapsed: 7.5, rewinding: false };
    expect(advanceSunrisePlayback(playback, 1, true, false, 0, false)).toBe(1);
    expect(hasSunrisePlaybackFinished(playback)).toBe(false);
    for (let i = 0; i < 500; i++) advanceSunrisePlayback(playback, 1, true, false, 1 / 60, false);
    expect(hasSunrisePlaybackFinished(playback)).toBe(true);
  });
});
