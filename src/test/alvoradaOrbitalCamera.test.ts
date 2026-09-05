import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { sampleOrbitalCamera, SANTA_ROSA_ATMOSPHERIC_HANDOFF } from '@/features/alvorada/orbitalCamera';
import { EARTH_RADIUS, latitudeLongitudeToVector3, SANTA_ROSA_COORDINATES } from '@/features/alvorada/geo';
import { deriveAlvoradaVisualState } from '@/features/alvorada/timeline';
import { getEarthTextureUrls } from '@/features/alvorada/earthAssets';

describe('viagem contínua até Santa Rosa', () => {
  it.each([false, true])('mantém altitude, aproximação monotônica e continuidade mobile=%s', (mobile) => {
    const position = new THREE.Vector3();
    const previous = new THREE.Vector3();
    const target = new THREE.Vector3();
    let previousDistance = Infinity;
    for (let frame = 0; frame <= Math.ceil(SANTA_ROSA_ATMOSPHERIC_HANDOFF * 120); frame += 1) {
      const fov = sampleOrbitalCamera(frame / 120, mobile, position, target);
      expect(position.length()).toBeGreaterThan(EARTH_RADIUS + 1.5);
      expect(position.length()).toBeLessThanOrEqual(previousDistance + 1e-8);
      expect(position.distanceTo(target)).toBeGreaterThan(1);
      expect(fov).toBeGreaterThanOrEqual(40);
      expect(fov).toBeLessThanOrEqual(55);
      if (frame) expect(position.distanceTo(previous)).toBeLessThan(0.08);
      previousDistance = position.length();
      previous.copy(position);
    }
  });

  it('chega ao destino oficial antes de ocultar a troca do referencial', () => {
    const position = new THREE.Vector3();
    const target = new THREE.Vector3();
    sampleOrbitalCamera(SANTA_ROSA_ATMOSPHERIC_HANDOFF, false, position, target);
    const destination = latitudeLongitudeToVector3(
      SANTA_ROSA_COORDINATES.latitude, SANTA_ROSA_COORDINATES.longitude, 1,
    ).normalize();
    expect(position.normalize().distanceTo(destination)).toBeLessThan(1e-8);
    expect(deriveAlvoradaVisualState(SANTA_ROSA_ATMOSPHERIC_HANDOFF).earthOpacity).toBe(0);
    expect(deriveAlvoradaVisualState(2).skyOpacity).toBe(0);
  });

  it('usa resolução extra apenas na superfície desktop, preservando o orçamento mobile', () => {
    expect(getEarthTextureUrls(false)[0]).toBe('/alvorada/earth-surface-4096.webp');
    expect(getEarthTextureUrls(true)[0]).toBe('/alvorada/earth-surface-2048.webp');
    expect(getEarthTextureUrls(false).slice(1)).toEqual(getEarthTextureUrls(true).slice(1));
  });
});
