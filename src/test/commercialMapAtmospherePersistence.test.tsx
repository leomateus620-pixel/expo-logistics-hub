import { readFileSync } from 'node:fs';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useCommercialMapAtmosphereResources } from '@/features/commercial-map/components/canvas/CommercialMapEnvironment';
import { COMMERCIAL_MAP_ENVIRONMENT_CONFIG, resolveCommercialMapSunriseFrame } from '@/features/commercial-map/data/commercialMapEnvironment';

function props(mode: 'normal' | 'hydrological' = 'normal', distance = 900, width = 128) {
  return {
    mode, initialFrame: resolveCommercialMapSunriseFrame(1, mode),
    palette: COMMERCIAL_MAP_ENVIRONMENT_CONFIG.palettes[mode],
    cloudOpacity: mode === 'normal' ? 0.2 : 0.1,
    skyScale: distance * 2, centerX: 25, centerZ: 40,
    visualSunDistance: distance, reflectionTextureWidth: width,
  };
}

beforeEach(() => {
  const context = {
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    fillRect: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('atmosphere resource lifetime is independent of Hydrological visibility', () => {
  it('keeps skies, programs and both reflection inputs over 20 normal/hydro cycles', () => {
    const { result, rerender } = renderHook(useCommercialMapAtmosphereResources, { initialProps: props() });
    const normal = result.current;
    const skyVersion = normal.sky.material.version;
    const normalDispose = vi.spyOn(normal.reflectionTexture, 'dispose');
    rerender(props('hydrological'));
    const hydroTexture = result.current.reflectionTexture;
    const hydroDispose = vi.spyOn(hydroTexture, 'dispose');
    const hydroVersion = hydroTexture.version;
    expect(hydroTexture).not.toBe(normal.reflectionTexture);
    for (let index = 0; index < 20; index += 1) {
      const mode = index % 2 === 0 ? 'normal' : 'hydrological';
      rerender(props(mode));
      expect(result.current.sky).toBe(normal.sky);
      expect(result.current.celestialSun).toBe(normal.celestialSun);
      expect(result.current.reflectionTexture).toBe(mode === 'normal' ? normal.reflectionTexture : hydroTexture);
      expect(result.current.sky.material.version).toBe(skyVersion);
      expect(result.current.sky.material.uniforms.authoredCloudOpacity.value).toBe(props(mode).cloudOpacity);
      const expectedGround = mode === 'hydrological'
        ? props(mode).palette.activeGround : props(mode).palette.outerGroundFar;
      expect(result.current.sky.material.uniforms.authoredGroundFar.value).toEqual(new THREE.Color(expectedGround));
    }
    expect(normalDispose).not.toHaveBeenCalled();
    expect(hydroDispose).not.toHaveBeenCalled();
    expect(hydroTexture.version).toBe(hydroVersion);
  });

  it('resizes and repositions atmosphere without replacing geometry or materials', () => {
    const { result, rerender } = renderHook(useCommercialMapAtmosphereResources, { initialProps: props() });
    const first = result.current;
    rerender({ ...props('hydrological', 1200), centerX: -8, centerZ: -15 });
    expect(result.current.sky).toBe(first.sky);
    expect(result.current.sky.position.toArray()).toEqual([-8, 0, -15]);
    expect(result.current.sky.scale.toArray()).toEqual([2400, 2400, 2400]);
    expect(result.current.celestialSun).toBe(first.celestialSun);
    expect(result.current.celestialSun.scale.toArray()).toEqual([1200, 1200, 1200]);
    const width = (result.current.celestialSun.geometry as THREE.PlaneGeometry).parameters.width;
    expect(width * result.current.celestialSun.scale.x).toBeCloseTo(
      1200 * Math.tan(THREE.MathUtils.degToRad(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.coronaDiameterDegrees / 2)) * 2,
      8,
    );
  });

  it('retires each owned resource once on unmount, not when the palette changes', () => {
    const { result, rerender, unmount } = renderHook(useCommercialMapAtmosphereResources, { initialProps: props() });
    const first = result.current;
    const disposers = [
      vi.spyOn(first.sky.geometry, 'dispose'), vi.spyOn(first.sky.material, 'dispose'),
      vi.spyOn(first.celestialSun.geometry, 'dispose'), vi.spyOn(first.celestialSun.material, 'dispose'),
      vi.spyOn(first.reflectionTexture, 'dispose'),
    ];
    rerender(props('hydrological'));
    disposers.push(vi.spyOn(result.current.reflectionTexture, 'dispose'));
    disposers.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    unmount();
    disposers.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  });

  it('retains both PMREM input resolutions across 20 quality cycles', () => {
    const { result, rerender, unmount } = renderHook(useCommercialMapAtmosphereResources, { initialProps: props() });
    const full = result.current.reflectionTexture;
    rerender(props('normal', 900, 64));
    const reduced = result.current.reflectionTexture;
    const fullDispose = vi.spyOn(full, 'dispose');
    const reducedDispose = vi.spyOn(reduced, 'dispose');
    expect(reduced).not.toBe(full);
    for (let index = 0; index < 20; index += 1) {
      const width = index % 2 === 0 ? 128 : 64;
      rerender(props('normal', 900, width));
      expect(result.current.reflectionTexture).toBe(width === 128 ? full : reduced);
    }
    expect(fullDispose).not.toHaveBeenCalled();
    expect(reducedDispose).not.toHaveBeenCalled();
    unmount();
    expect(fullDispose).toHaveBeenCalledTimes(1);
    expect(reducedDispose).toHaveBeenCalledTimes(1);
  });

  it('keeps hidden vegetation and electrical geometry on their normal physical inputs', () => {
    const source = readFileSync('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx', 'utf8');
    const treeInputs = source.slice(source.indexOf('const rearRoadCompatibleSceneTrees'), source.indexOf('const parkAccessScope'));
    expect(treeInputs).not.toContain('hydrologicalModeActive');
    expect(treeInputs).not.toContain('rearParkingEnabled');
    expect(treeInputs).toContain('rearParkingAvailable');
    expect(source).toContain('rearRoadsActive={!isolatedArea}');
    expect(source).toContain('visible={treesVisible && !hydrologicalModeActive}');
  });
});
