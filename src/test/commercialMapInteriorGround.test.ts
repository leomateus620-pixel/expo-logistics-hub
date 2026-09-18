import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyInteriorGroundMaterial, acquireInteriorGroundMaterial, releaseInteriorGroundMaterial } from '../features/commercial-map/components/canvas/interiorGroundMaterial';
import { INTERNAL_NATURAL_PARKING_RINGS, INTERNAL_PARKING_GROUND_ENVELOPE, isInternalGroundPoint } from '../features/commercial-map/data/internalGroundCoverage';
import { officialPdfPointToLocal } from '../features/commercial-map/data/officialReference2026';
import { parkingContainsPoint } from '../features/commercial-map/utils/parkingGeometry';
import { applyTerrainMultiscaleDetail } from '../features/commercial-map/components/canvas/terrainMaterial';
import { createParkingMaterialSet } from '../features/commercial-map/components/canvas/parkingMaterials';

const compile = (material: THREE.MeshStandardMaterial) => {
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader;
};

describe('canonical interior ground ownership and resources', () => {
  it('fills the inter-parking gap without altering either cadastral polygon', () => {
    for (const source of [[5330,3800],[5340,3600],[5370,3380]] as const) {
      const point = officialPdfPointToLocal(source);
      expect(INTERNAL_NATURAL_PARKING_RINGS.some(ring => parkingContainsPoint(point, ring))).toBe(false);
      expect(parkingContainsPoint(point, INTERNAL_PARKING_GROUND_ENVELOPE)).toBe(true);
      expect(isInternalGroundPoint(point)).toBe(true);
    }
    expect(INTERNAL_NATURAL_PARKING_RINGS.map(r => r.length)).toEqual([5,5]);
  });
  it('protects the external east/west fields, highway margins and lateral district', () => {
    for (const source of [[80,2950],[6300,3200],[6600,1800],[3200,4650],[5450,4900],[4100,5300]] as const)
      expect(isInternalGroundPoint(officialPdfPointToLocal(source)), source.join(',')).toBe(false);
  });
  it('shares A/B atlas and noise across distinct depth/opacity owners until the final release', () => {
    const a = acquireInteriorGroundMaterial(), b = acquireInteriorGroundMaterial();
    const c = acquireInteriorGroundMaterial({polygonOffsetFactor:-.62,polygonOffsetUnits:-1});
    expect(a).toBe(b); expect(a).not.toBe(c);
    const x = compile(a), y = compile(c);
    const texture = x.uniforms.interiorAlbedo.value as THREE.DataTexture;
    const disposed = vi.fn();texture.addEventListener('dispose',disposed);
    expect(texture).toBe(y.uniforms.interiorAlbedo.value);
    expect(x.uniforms.interiorNoise.value).toBe(y.uniforms.interiorNoise.value);
    expect(texture.image.width).toBe(512);expect(texture.image.height).toBe(256);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect((x.uniforms.interiorNormal.value as THREE.Texture).colorSpace).toBe(THREE.NoColorSpace);
    releaseInteriorGroundMaterial(a);releaseInteriorGroundMaterial(b);
    expect(disposed).not.toHaveBeenCalled();
    releaseInteriorGroundMaterial(c);expect(disposed).toHaveBeenCalledTimes(1);
  });
  it('keeps upstream external shading and quality uniforms while replacing only owned fragments', () => {
    const material = applyTerrainMultiscaleDetail(new THREE.MeshStandardMaterial());
    applyInteriorGroundMaterial(material,'internal-base');
    const first = compile(material), key = material.customProgramCacheKey();
    applyTerrainMultiscaleDetail(material,{macroStrength:.1});
    applyInteriorGroundMaterial(material,'internal-base');
    const second=compile(material);
    expect(material.customProgramCacheKey()).toBe(key);
    expect(second.uniforms.interiorAlbedo.value).toBe(first.uniforms.interiorAlbedo.value);
    expect(second.fragmentShader).toContain('interiorOwned(vInteriorGround.xz)');
    expect(second.fragmentShader).toContain('mix(priorColor,diffuseColor.rgb,interiorWeight)');
    expect(second.fragmentShader).toContain('commercialTerrainMacroCentered');
    expect(second.vertexShader).not.toContain('position.y +=');
    material.dispose();
  });
  it('shares canonical parking grass across qualities while retaining its edge transparency', () => {
    const full = createParkingMaterialSet(8, false);
    const reduced = createParkingMaterialSet(1, true);
    const a = compile(full.solid.grass), b = compile(full.feather.grass), c = compile(reduced.solid.grass);
    expect(a.uniforms.interiorAlbedo.value).toBe(b.uniforms.interiorAlbedo.value);
    expect(a.uniforms.interiorAlbedo.value).toBe(c.uniforms.interiorAlbedo.value);
    expect(full.solid.grass.map).toBeNull();
    expect(full.feather.grass.transparent).toBe(true);
    expect(full.feather.grass.depthWrite).toBe(false);
    expect(b.fragmentShader).toContain('diffuseColor.a *= clamp(vParkingAlpha');
    full.dispose();reduced.dispose();
  });
  it('retains independent depth policies during commercial focus fades', () => {
    const nations = acquireInteriorGroundMaterial({opacity:.6,depthWrite:true,transparent:true});
    const site = acquireInteriorGroundMaterial({opacity:.6,depthWrite:false,transparent:true});
    expect(nations).not.toBe(site);
    expect(nations.depthWrite).toBe(true);expect(site.depthWrite).toBe(false);
    expect(compile(nations).uniforms.interiorAlbedo.value).toBe(compile(site).uniforms.interiorAlbedo.value);
    releaseInteriorGroundMaterial(nations);releaseInteriorGroundMaterial(site);
  });
  it('does not inject the shader again when Fast Refresh retains the material', async () => {
    const material = applyInteriorGroundMaterial(new THREE.MeshStandardMaterial());
    const before = compile(material);
    vi.resetModules();
    const refreshed = await import('../features/commercial-map/components/canvas/interiorGroundMaterial');
    refreshed.applyInteriorGroundMaterial(material);
    const after = compile(material);
    expect(after.fragmentShader).toBe(before.fragmentShader);
    expect(after.uniforms.interiorAlbedo.value).toBe(before.uniforms.interiorAlbedo.value);
    material.dispose();
  });
});
