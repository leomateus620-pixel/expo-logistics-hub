import * as THREE from 'three';
import { OPEN_GROUND_TEXTURE_SAMPLING_POLICY } from './openGroundTextures';

export type ParkingSurfaceKind = 'gravel' | 'soil' | 'grass';

/** Satellite palette, within the existing open-ground family; no external assets. */
export const PARKING_SURFACE_PROFILES = {
  gravel: { color: '#b2ada0', roughness: 0.96, normalScale: 0.26, tileMeters: 6, grain: 0.2 },
  soil: { color: '#af957c', roughness: 0.97, normalScale: 0.14, tileMeters: 6, grain: 0.1 },
  grass: { color: '#89916a', roughness: 0.98, normalScale: 0.2, tileMeters: 6, grain: 0.16 },
} as const;

export const PARKING_MATERIAL_BUDGET = {
  textureSize: OPEN_GROUND_TEXTURE_SAMPLING_POLICY.textureSize,
  maximumTextureCount: 6,
  maximumAnisotropy: OPEN_GROUND_TEXTURE_SAMPLING_POLICY.maxAnisotropy,
  metalness: 0,
  geometryDisplacement: 0,
  // Heights are not surveyed. Relief stays optical and cannot bury the markings.
  relief: 'NORMAL_ONLY_NOT_SURVEYED',
} as const;

function hash(x: number, y: number, seed: number) {
  let value = Math.imul(x ^ seed, 0x27d4eb2d) ^ Math.imul(y + seed, 0x165667b1);
  value ^= value >>> 15;
  value = Math.imul(value, 0x85ebca6b);
  return (value >>> 0) / 0x100000000;
}

/** Periodic smooth noise: even the texture seam has matching height derivatives. */
function periodicNoise(x: number, y: number, period: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const wrap = (n: number) => ((n % period) + period) % period;
  const sx = (x - ix) ** 2 * (3 - 2 * (x - ix));
  const sy = (y - iy) ** 2 * (3 - 2 * (y - iy));
  const top = THREE.MathUtils.lerp(hash(wrap(ix), wrap(iy), seed), hash(wrap(ix + 1), wrap(iy), seed), sx);
  const bottom = THREE.MathUtils.lerp(hash(wrap(ix), wrap(iy + 1), seed), hash(wrap(ix + 1), wrap(iy + 1), seed), sx);
  return THREE.MathUtils.lerp(top, bottom, sy);
}

function sampling(texture: THREE.Texture, maxAnisotropy: number) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.max(1, Math.min(PARKING_MATERIAL_BUDGET.maximumAnisotropy, maxAnisotropy || 1));
  texture.needsUpdate = true;
}

function createSurfaceTextures(kind: ParkingSurfaceKind, maxAnisotropy: number, reduced: boolean) {
  const size = PARKING_MATERIAL_BUDGET.textureSize;
  const profile = PARKING_SURFACE_PROFILES[kind];
  const seed = kind === 'gravel' ? 473 : kind === 'soil' ? 821 : 1229;
  const base = new THREE.Color(profile.color).convertLinearToSRGB();
  const heights = new Float32Array(size * size);
  const colorData = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const stone = periodicNoise(x / 2, y / 2, size / 2, seed);
      const fine = hash(x, y, seed + 13);
      const clumps = periodicNoise(x / 16, y / 16, size / 16, seed + 53);
      const grain = (stone - 0.5) * 2 + (fine - 0.5) * 0.55;
      const modulation = 1 + grain * profile.grain + (clumps - 0.5) * 0.13;
      const dryGrass = kind === 'grass' ? Math.max(0, clumps - 0.52) * 0.3 : 0;
      colorData[i * 4] = Math.round(THREE.MathUtils.clamp(base.r * modulation + dryGrass, 0, 1) * 255);
      colorData[i * 4 + 1] = Math.round(THREE.MathUtils.clamp(base.g * modulation + dryGrass * 0.55, 0, 1) * 255);
      colorData[i * 4 + 2] = Math.round(THREE.MathUtils.clamp(base.b * modulation - dryGrass * 0.2, 0, 1) * 255);
      colorData[i * 4 + 3] = 255;
      heights[i] = stone * 0.65 + fine * 0.16 + clumps * 0.19;
    }
  }
  const albedo = new THREE.DataTexture(colorData, size, size);
  albedo.name = `rear-parking-${kind}-albedo`;
  albedo.colorSpace = THREE.SRGBColorSpace;
  sampling(albedo, maxAnisotropy);
  if (reduced) return { albedo, normal: null };

  const normalData = new Uint8Array(size * size * 4);
  const height = (x: number, y: number) => heights[((y + size) % size) * size + (x + size) % size];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const dx = height(x - 1, y) - height(x + 1, y);
      const dy = height(x, y - 1) - height(x, y + 1);
      const length = Math.hypot(dx, dy, 1);
      normalData[offset] = Math.round((dx / length * 0.5 + 0.5) * 255);
      normalData[offset + 1] = Math.round((dy / length * 0.5 + 0.5) * 255);
      normalData[offset + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
      normalData[offset + 3] = 255;
    }
  }
  const normal = new THREE.DataTexture(normalData, size, size);
  normal.name = `rear-parking-${kind}-normal`;
  normal.colorSpace = THREE.NoColorSpace;
  sampling(normal, maxAnisotropy);
  return { albedo, normal };
}

const MACRO_NOISE = `
varying vec3 vParkingWorld;
varying float vParkingAlpha;
float parkingHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float parkingNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(parkingHash(i), parkingHash(i + vec2(1., 0.)), f.x),
    mix(parkingHash(i + vec2(0., 1.)), parkingHash(i + vec2(1., 1.)), f.x), f.y);
}
`;

/** One resource owner per mounted sector; camera movement never rebuilds textures. */
export function createParkingMaterialSet(maxAnisotropy: number, reducedGraphics: boolean) {
  const textures = Object.fromEntries((['gravel', 'soil', 'grass'] as const)
    .map((kind) => [kind, createSurfaceTextures(kind, maxAnisotropy, reducedGraphics)])) as Record<
      ParkingSurfaceKind, ReturnType<typeof createSurfaceTextures>
    >;

  const createMaterial = (kind: ParkingSurfaceKind, feather: boolean) => {
    const profile = PARKING_SURFACE_PROFILES[kind];
    const material = new THREE.MeshStandardMaterial({
      name: `rear-parking-${kind}${feather ? '-feather' : ''}`,
      map: textures[kind].albedo,
      normalMap: textures[kind].normal,
      normalScale: new THREE.Vector2(profile.normalScale, profile.normalScale),
      color: '#ffffff',
      roughness: profile.roughness,
      metalness: 0,
      vertexColors: false,
      transparent: feather,
      depthWrite: !feather,
      polygonOffset: feather,
      polygonOffsetFactor: feather ? -1 : 0,
      polygonOffsetUnits: feather ? -1 : 0,
    });
    // Only additive MeshStandard chunks; Three r170 colour/lighting/PBR stay intact.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `attribute float parkingAlpha;\nvarying vec3 vParkingWorld;\nvarying float vParkingAlpha;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vParkingWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vParkingAlpha = parkingAlpha;`);
      shader.fragmentShader = `${MACRO_NOISE}\n${shader.fragmentShader}`
        .replace('#include <map_fragment>', `#include <map_fragment>
float parkingBroad = parkingNoise(vParkingWorld.xz * 0.24 + vec2(17.4, 61.8));
float parkingPatch = parkingNoise(vParkingWorld.xz * 1.35 + vec2(53.2, 9.1));
diffuseColor.rgb *= 0.89 + parkingBroad * 0.16 + parkingPatch * 0.06;
diffuseColor.a *= clamp(vParkingAlpha * (0.82 + parkingPatch * 0.36), 0.0, 1.0);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * (0.96 + parkingPatch * 0.04), 0.9, 1.0);`);
    };
    material.customProgramCacheKey = () => `rear-parking-ground-r170-v1-${feather ? 'feather' : 'solid'}`;
    return material;
  };
  const solid = { gravel: createMaterial('gravel', false), soil: createMaterial('soil', false), grass: createMaterial('grass', false) };
  const feather = { gravel: createMaterial('gravel', true), soil: createMaterial('soil', true), grass: createMaterial('grass', true) };
  return {
    solid,
    feather,
    dispose() {
      Object.values(solid).forEach((material) => material.dispose());
      Object.values(feather).forEach((material) => material.dispose());
      Object.values(textures).forEach(({ albedo, normal }) => { albedo.dispose(); normal?.dispose(); });
    },
  };
}
