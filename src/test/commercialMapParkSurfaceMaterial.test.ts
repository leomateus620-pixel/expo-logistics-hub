import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  PARK_SURFACE_DEFAULTS,
  PARK_SURFACE_PROFILES,
  PARK_SURFACE_PROGRAM_CACHE_KEY,
  applyParkSurfaceDetail,
  hasParkSurfaceDetail,
  removeParkSurfaceDetail,
  resolveParkSurfaceOptions,
} from '../features/commercial-map/components/canvas/parkSurfaceMaterial';

function standardShader() {
  return {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0];
}

describe('grain, roughness e contato dos materiais do parque', () => {
  it('resolve parâmetros seguros sem NaN nem intervalos invertidos', () => {
    expect(resolveParkSurfaceOptions()).toEqual(PARK_SURFACE_DEFAULTS);

    const resolved = resolveParkSurfaceOptions({
      grainFrequency: Number.NaN,
      grainStrength: 9,
      roughnessVariation: -4,
      contactHeight: 0,
      detailFadeStart: 400,
      detailFadeEnd: 10,
    });

    expect(resolved).toMatchObject({
      grainFrequency: PARK_SURFACE_DEFAULTS.grainFrequency,
      grainStrength: 0.45,
      roughnessVariation: 0,
      contactHeight: 0.02,
      detailFadeStart: 400,
      detailFadeEnd: 401,
    });
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it('mantém asfalto/concreto sem contato e volume com AO de solo', () => {
    expect(PARK_SURFACE_PROFILES.asphalt.grainStrength).toBeGreaterThan(PARK_SURFACE_PROFILES.lot.grainStrength);
    expect(PARK_SURFACE_PROFILES.asphalt.normalStrength).toBeGreaterThan(PARK_SURFACE_PROFILES.concrete.normalStrength);
    expect(PARK_SURFACE_PROFILES.asphalt.contactStrength).toBe(0);
    expect(PARK_SURFACE_PROFILES.lot.contactStrength).toBe(0);
    expect(PARK_SURFACE_PROFILES.volume.contactStrength).toBeGreaterThan(0.3);
    expect(PARK_SURFACE_PROFILES.volume.contactHeight).toBeLessThan(0.4);
    expect(PARK_SURFACE_PROFILES.roof.metalnessVariation).toBeGreaterThan(0);
    expect(PARK_SURFACE_PROFILES.asphalt.grainStrength).toBeLessThan(0.25);
  });

  it('preserva MeshStandard/PBR e só multiplica o albedo oficial', () => {
    const material = new THREE.MeshStandardMaterial({ color: '#4b5054', roughness: 0.98, metalness: 0 });
    applyParkSurfaceDetail(material, 'asphalt');
    const shader = standardShader();

    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material.color.getHexString()).toBe('4b5054');
    expect(material.roughness).toBe(0.98);
    expect(material.metalness).toBe(0);
    expect(shader.vertexShader).toContain('vParkWorldPosition = (modelMatrix * parkWorldPosition).xyz');
    expect(shader.vertexShader).toContain('#ifdef USE_INSTANCING');
    expect(shader.vertexShader).toContain('#ifdef USE_BATCHING');
    expect(shader.fragmentShader).toContain('float parkSurfaceFbm(vec2 position)');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb *= clamp(1.0 + parkSurfaceGrain * uParkGrainStrength');
    expect(shader.fragmentShader).toContain('roughnessFactor = clamp');
    expect(shader.fragmentShader).toContain('totalDiffuse *= mix(1.0, 1.0 - uParkContactStrength');
    expect(shader.fragmentShader).toContain('#include <lights_fragment_begin>');
    expect(shader.fragmentShader).toContain('#include <aomap_fragment>');
    expect(shader.uniforms.uParkGrainFrequency.value).toBe(PARK_SURFACE_PROFILES.asphalt.grainFrequency);
    expect(shader.uniforms.uParkContactStrength.value).toBe(0);
  });

  it('injeta contato em volumes sem remesh e desliga o hook no reduced', () => {
    const volume = new THREE.MeshStandardMaterial({ color: '#cfc8ba' });
    applyParkSurfaceDetail(volume, 'volume');
    const shader = standardShader();
    volume.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.uParkContactStrength.value).toBe(PARK_SURFACE_PROFILES.volume.contactStrength);
    expect(shader.fragmentShader).toContain('parkWorldContact');
    expect(shader.fragmentShader).toContain('parkObjectContact');

    const reduced = new THREE.MeshStandardMaterial();
    applyParkSurfaceDetail(reduced, 'asphalt');
    expect(hasParkSurfaceDetail(reduced)).toBe(true);
    applyParkSurfaceDetail(reduced, 'asphalt', true);
    expect(hasParkSurfaceDetail(reduced)).toBe(false);
    expect(reduced.customProgramCacheKey()).not.toContain(PARK_SURFACE_PROGRAM_CACHE_KEY);
  });

  it('encadeia um hook existente e reaplica uniforms sem duplicar GLSL', () => {
    const material = new THREE.MeshStandardMaterial();
    const upstream = vi.fn((shader: Parameters<typeof material.onBeforeCompile>[0]) => {
      shader.fragmentShader = `// upstream-park\n${shader.fragmentShader}`;
    });
    material.onBeforeCompile = upstream;
    material.customProgramCacheKey = () => 'existing-park-hook-v1';
    applyParkSurfaceDetail(material, 'lot');
    applyParkSurfaceDetail(material, 'asphalt');
    const shader = standardShader();
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(upstream).toHaveBeenCalledOnce();
    expect(shader.fragmentShader).toContain('// upstream-park');
    expect(shader.fragmentShader.match(/float parkSurfaceFbm\(/g)).toHaveLength(1);
    expect(shader.uniforms.uParkGrainFrequency.value).toBe(PARK_SURFACE_PROFILES.asphalt.grainFrequency);
    expect(material.customProgramCacheKey()).toBe(
      `existing-park-hook-v1|${PARK_SURFACE_PROGRAM_CACHE_KEY}`,
    );
    expect(removeParkSurfaceDetail(material)).toBe(true);
    expect(hasParkSurfaceDetail(material)).toBe(false);
  });

  it('cai para o shader anterior quando os chunks r170 não existem', () => {
    const material = new THREE.MeshStandardMaterial();
    const upstream = vi.fn((shader: Parameters<typeof material.onBeforeCompile>[0]) => {
      shader.vertexShader = '// custom vertex without Three chunks';
      shader.fragmentShader = '// custom fragment without Three chunks';
    });
    material.onBeforeCompile = upstream;
    applyParkSurfaceDetail(material, 'roof');
    const shader = standardShader();
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(upstream).toHaveBeenCalledOnce();
    expect(shader.vertexShader).toBe('// custom vertex without Three chunks');
    expect(shader.fragmentShader).toBe('// custom fragment without Three chunks');
    expect(Object.keys(shader.uniforms)).toHaveLength(0);
  });

  it('liga grit e contato nos receptores oficiais sem mover geometria', () => {
    const read = (path: string) => readFileSync(resolve(path), 'utf8').replace(/\r\n/g, '\n');
    const canvas = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
    const roads = read('src/features/commercial-map/components/canvas/RoadInfrastructure.tsx');
    const trees = read('src/features/commercial-map/components/canvas/CommercialTreeLayer.tsx');
    const landmarks = read('src/features/commercial-map/components/canvas/StrategicLandmarks.tsx');

    expect(canvas).toContain("applyParkSurfaceDetail(batch.material, 'lot', reducedGraphics)");
    expect(canvas).toContain("applyParkSurfaceDetail(openGroundMaterialRef.current, 'volume', openGroundReducedGraphics)");
    expect(roads).toContain("bindParkSurfaceMaterial('asphalt', reducedGraphics)");
    expect(roads).toContain("bindParkSurfaceMaterial('concrete', reducedGraphics)");
    expect(trees).toContain("applyParkSurfaceDetail(materials.trunk, 'volume', reducedGraphics)");
    expect(landmarks).toContain("applyParkSurfaceDetail(result.wall, 'volume', reducedGraphics)");
    expect(canvas).not.toContain('helipad');
  });
});
