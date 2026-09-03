import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  TERRAIN_MULTISCALE_DEFAULTS,
  TERRAIN_MULTISCALE_PROGRAM_CACHE_KEY,
  applyParkGroundDetail,
  applyTerrainMultiscaleDetail,
  createMultiscaleTerrainMaterial,
  hasTerrainMultiscaleDetail,
  resolveTerrainMultiscaleQualityOptions,
  resolveTerrainMultiscaleOptions,
} from '../features/commercial-map/components/canvas/terrainMaterial';

function standardShader() {
  return {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0];
}

describe('material multiescala do terreno comercial', () => {
  it('resolve parâmetros seguros e um intervalo de fade sempre válido', () => {
    expect(resolveTerrainMultiscaleOptions()).toEqual(TERRAIN_MULTISCALE_DEFAULTS);

    const resolved = resolveTerrainMultiscaleOptions({
      macroWorldSize: Number.NaN,
      microWorldSize: -20,
      macroStrength: 9,
      microStrength: Number.POSITIVE_INFINITY,
      roughnessVariation: -4,
      detailFadeStart: 900,
      detailFadeEnd: 20,
      worldOrigin: [Number.NaN, 48],
    });

    expect(resolved).toMatchObject({
      macroWorldSize: TERRAIN_MULTISCALE_DEFAULTS.macroWorldSize,
      microWorldSize: 0.25,
      macroStrength: 0.45,
      microStrength: TERRAIN_MULTISCALE_DEFAULTS.microStrength,
      roughnessVariation: 0,
      detailFadeStart: 900,
      detailFadeEnd: 901,
      worldOrigin: [0, 48],
    });
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.worldOrigin)).toBe(true);
  });

  it('mantém macro/micro em full e balanced, mas remove o custo procedural no reduced', () => {
    const full = resolveTerrainMultiscaleQualityOptions('full', 400, [12, -8]);
    const balanced = resolveTerrainMultiscaleQualityOptions('balanced', 400, [12, -8]);

    expect(full).not.toBeNull();
    expect(balanced).not.toBeNull();
    expect(resolveTerrainMultiscaleQualityOptions('reduced', 400, [12, -8])).toBeNull();
    expect(full!.macroStrength).toBeGreaterThan(0);
    expect(full!.microStrength).toBeGreaterThan(0);
    expect(balanced!.macroStrength).toBeGreaterThan(0);
    expect(balanced!.microStrength).toBeGreaterThan(0);
    expect(full!.microWorldSize).toBeLessThan(balanced!.microWorldSize);
    expect(full!.microStrength).toBeGreaterThan(balanced!.microStrength);
    expect(full!.detailFadeEnd).toBeGreaterThan(balanced!.detailFadeEnd);
    expect(full!.worldOrigin).toEqual([12, -8]);
    expect(balanced!.worldOrigin).toEqual([12, -8]);
  });

  it('usa um perfil de parque com octavas menores para a grama interna sem tocar geometria', () => {
    const outer = resolveTerrainMultiscaleQualityOptions('full', 400, [0, 0], 'outer');
    const park = resolveTerrainMultiscaleQualityOptions('full', 400, [0, 0], 'park');

    expect(park).not.toBeNull();
    expect(resolveTerrainMultiscaleQualityOptions('reduced', 400, [0, 0], 'park')).toBeNull();
    // The park crop is ~150 units wide: its base octave must be a fraction of it.
    expect(park!.macroWorldSize).toBeLessThan(80);
    expect(park!.macroWorldSize).toBeLessThan(outer!.macroWorldSize);
    expect(park!.microWorldSize).toBeLessThan(outer!.microWorldSize);
    expect(park!.tilingBreak).toBeGreaterThan(0.5);
    expect(park!.tintStrength).toBeGreaterThan(0);

    const material = new THREE.MeshStandardMaterial({ color: '#8aa465' });
    expect(applyParkGroundDetail(material, true)).toBe(material);
    expect(hasTerrainMultiscaleDetail(material)).toBe(false);
    expect(applyParkGroundDetail(material, false)).toBe(material);
    expect(hasTerrainMultiscaleDetail(material)).toBe(true);
    const shader = standardShader();
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.uCommercialTerrainMacroFrequency.value).toBeCloseTo(1 / park!.macroWorldSize);
    expect(shader.uniforms.uCommercialTerrainTilingBreak.value).toBe(park!.tilingBreak);
  });

  it('preserva MeshStandard/PBR e injeta variação macro/micro em world-space', () => {
    const material = createMultiscaleTerrainMaterial(
      { color: '#8ca375', roughness: 0.96, metalness: 0 },
      {
        macroWorldSize: 160,
        microWorldSize: 8,
        macroStrength: 0.2,
        microStrength: 0.05,
        roughnessVariation: 0.04,
        detailFadeStart: 120,
        detailFadeEnd: 720,
        worldOrigin: [12, -34],
      },
    );
    const shader = standardShader();

    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material.color.getHexString()).toBe('8ca375');
    expect(material.roughness).toBe(0.96);
    expect(material.metalness).toBe(0);
    expect(shader.vertexShader).toContain(
      'vCommercialTerrainWorldPosition = (modelMatrix * commercialTerrainWorldPosition).xyz',
    );
    expect(shader.vertexShader).toContain('#ifdef USE_INSTANCING');
    expect(shader.vertexShader).toContain('#include <project_vertex>');
    expect(shader.fragmentShader).toContain('float commercialTerrainFbm(vec2 position)');
    expect(shader.fragmentShader).toContain('for (int octave = 0; octave < 4; octave += 1)');
    expect(shader.fragmentShader).toContain('commercialTerrainMacro = commercialTerrainFbm');
    expect(shader.fragmentShader).toContain('commercialTerrainMicro = commercialTerrainNoise');
    // Tiling break replaces <map_fragment> but keeps r170's decode/multiply path.
    expect(shader.fragmentShader).not.toContain('#include <map_fragment>');
    expect(shader.fragmentShader).toContain('vec4 sampledDiffuseColor = texture2D( map, vMapUv );');
    expect(shader.fragmentShader).toContain('uCommercialTerrainTilingBreak');
    expect(shader.fragmentShader).toContain('diffuseColor *= sampledDiffuseColor;');
    expect(shader.fragmentShader).toContain('commercialTerrainTint');
    expect(shader.fragmentShader).toContain(
      'distance(cameraPosition, vCommercialTerrainWorldPosition)',
    );
    expect(shader.fragmentShader).toContain('commercialTerrainDetailFade = 1.0 - smoothstep');
    expect(shader.fragmentShader).toContain(
      'commercialTerrainDetailFade > 0.0 && uCommercialTerrainMicroStrength > 0.0',
    );
    expect(shader.fragmentShader).toContain('roughnessFactor = clamp');
    expect(shader.fragmentShader).toContain('#include <lights_fragment_begin>');
    expect(shader.fragmentShader).toContain('#include <normal_fragment_maps>');

    expect(shader.uniforms.uCommercialTerrainMacroFrequency.value).toBeCloseTo(1 / 160);
    expect(shader.uniforms.uCommercialTerrainMicroFrequency.value).toBeCloseTo(1 / 8);
    expect(shader.uniforms.uCommercialTerrainMacroStrength.value).toBe(0.2);
    expect(shader.uniforms.uCommercialTerrainMicroStrength.value).toBe(0.05);
    expect(shader.uniforms.uCommercialTerrainRoughnessVariation.value).toBe(0.04);
    expect(shader.uniforms.uCommercialTerrainDetailFadeStart.value).toBe(120);
    expect(shader.uniforms.uCommercialTerrainDetailFadeEnd.value).toBe(720);
    expect((shader.uniforms.uCommercialTerrainWorldOrigin.value as THREE.Vector2).toArray())
      .toEqual([12, -34]);
  });

  it('mantém uma chave de programa estável entre configurações resolvidas por uniforms', () => {
    const first = createMultiscaleTerrainMaterial({}, { macroWorldSize: 120 });
    const second = createMultiscaleTerrainMaterial({}, { macroWorldSize: 480, microStrength: 0 });

    expect(first.customProgramCacheKey()).toBe(second.customProgramCacheKey());
    expect(first.customProgramCacheKey()).toContain(TERRAIN_MULTISCALE_PROGRAM_CACHE_KEY);
  });

  it('encadeia customização existente e preserva sua identidade de cache', () => {
    const upstream = new THREE.MeshStandardMaterial();
    const upstreamHook = vi.fn((shader: Parameters<typeof upstream.onBeforeCompile>[0]) => {
      shader.fragmentShader = `// upstream\n${shader.fragmentShader}`;
    });
    upstream.onBeforeCompile = upstreamHook;
    upstream.customProgramCacheKey = () => 'existing-terrain-hook-v2';
    applyTerrainMultiscaleDetail(upstream);
    const shader = standardShader();

    upstream.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(upstreamHook).toHaveBeenCalledOnce();
    expect(shader.fragmentShader).toContain('// upstream');
    expect(shader.fragmentShader).toContain('commercialTerrainTone');
    expect(upstream.customProgramCacheKey()).toBe(
      `existing-terrain-hook-v2|${TERRAIN_MULTISCALE_PROGRAM_CACHE_KEY}`,
    );
  });

  it('cai para o shader anterior quando os chunks esperados do r170 não existem', () => {
    const material = new THREE.MeshStandardMaterial();
    const upstream = vi.fn((shader: Parameters<typeof material.onBeforeCompile>[0]) => {
      shader.vertexShader = '// custom vertex without Three chunks';
      shader.fragmentShader = '// custom fragment without Three chunks';
    });
    material.onBeforeCompile = upstream;
    applyTerrainMultiscaleDetail(material);
    const shader = standardShader();

    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(upstream).toHaveBeenCalledOnce();
    expect(shader.vertexShader).toBe('// custom vertex without Three chunks');
    expect(shader.fragmentShader).toBe('// custom fragment without Three chunks');
    expect(Object.keys(shader.uniforms)).toHaveLength(0);
  });

  it('reaplica opções por uniform sem duplicar GLSL nem alterar a chave', () => {
    const material = createMultiscaleTerrainMaterial({}, { macroWorldSize: 100 });
    const key = material.customProgramCacheKey();
    applyTerrainMultiscaleDetail(material, {
      macroWorldSize: 250,
      microWorldSize: 25,
      worldOrigin: [4, 8],
    });
    const shader = standardShader();

    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(material.customProgramCacheKey()).toBe(key);
    expect(shader.vertexShader.match(/varying vec3 vCommercialTerrainWorldPosition;/g)).toHaveLength(1);
    expect(shader.fragmentShader.match(/float commercialTerrainNoise\(/g)).toHaveLength(1);
    expect(shader.uniforms.uCommercialTerrainMacroFrequency.value).toBeCloseTo(1 / 250);
    expect(shader.uniforms.uCommercialTerrainMicroFrequency.value).toBeCloseTo(1 / 25);
    expect((shader.uniforms.uCommercialTerrainWorldOrigin.value as THREE.Vector2).toArray())
      .toEqual([4, 8]);
  });
});
