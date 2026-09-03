import * as THREE from 'three';

/**
 * Shader revision is deliberately tied to the Three version whose chunks are
 * used below. Keep this key stable while the generated GLSL remains identical.
 */
export const TERRAIN_MULTISCALE_PROGRAM_CACHE_KEY =
  'commercial-map-terrain-multiscale-r170-v1';

export interface TerrainMultiscaleOptions {
  /** Width, in world units, of one broad tonal feature. */
  macroWorldSize?: number;
  /** Width, in world units, of one close-range detail feature. */
  microWorldSize?: number;
  /** Broad albedo modulation around the authored material colour. */
  macroStrength?: number;
  /** Close-range albedo modulation, faded before it can shimmer at distance. */
  microStrength?: number;
  /** Subtle variation applied to the material's existing roughness response. */
  roughnessVariation?: number;
  /** Camera distance at which close-range detail starts fading. */
  detailFadeStart?: number;
  /** Camera distance at which close-range detail is fully removed. */
  detailFadeEnd?: number;
  /** Stable world-space anchor, useful when a map is far from the origin. */
  worldOrigin?: readonly [number, number];
}

export interface ResolvedTerrainMultiscaleOptions {
  macroWorldSize: number;
  microWorldSize: number;
  macroStrength: number;
  microStrength: number;
  roughnessVariation: number;
  detailFadeStart: number;
  detailFadeEnd: number;
  worldOrigin: readonly [number, number];
}

export type TerrainMultiscaleQualityTier = 'full' | 'balanced' | 'reduced';

interface TerrainMultiscaleQualityProfile {
  macroWorldSize: number;
  microWorldSize: number;
  macroStrength: number;
  microStrength: number;
  roughnessVariation: number;
  detailFadeStartRatio: number;
  detailFadeEndRatio: number;
  minimumDetailFadeStart: number;
}

export const TERRAIN_MULTISCALE_DEFAULTS: Readonly<ResolvedTerrainMultiscaleOptions> =
  Object.freeze({
    // The outer presentation ground is measured in thousands of world units.
    // These scales read as regional patches at overview and fine turf nearby.
    macroWorldSize: 220,
    microWorldSize: 12,
    macroStrength: 0.18,
    microStrength: 0.06,
    roughnessVariation: 0.045,
    detailFadeStart: 180,
    detailFadeEnd: 1_000,
    worldOrigin: Object.freeze([0, 0] as const),
  });

const MAX_WORLD_SIZE = 100_000;
const MAX_FADE_DISTANCE = 1_000_000;

/**
 * Full and balanced share one program and differ only by uniforms. Reduced
 * deliberately selects the unmodified MeshStandardMaterial in the caller, so
 * constrained devices pay no procedural fragment cost at all.
 */
export const TERRAIN_MULTISCALE_QUALITY_PROFILES: Readonly<Record<
  TerrainMultiscaleQualityTier,
  Readonly<TerrainMultiscaleQualityProfile> | null
>> = Object.freeze({
  full: Object.freeze({
    macroWorldSize: 220,
    microWorldSize: 9,
    macroStrength: 0.2,
    microStrength: 0.065,
    roughnessVariation: 0.05,
    detailFadeStartRatio: 0.28,
    detailFadeEndRatio: 0.92,
    minimumDetailFadeStart: 90,
  }),
  balanced: Object.freeze({
    macroWorldSize: 250,
    microWorldSize: 14,
    macroStrength: 0.17,
    microStrength: 0.045,
    roughnessVariation: 0.035,
    detailFadeStartRatio: 0.22,
    detailFadeEndRatio: 0.7,
    minimumDetailFadeStart: 72,
  }),
  reduced: null,
});

function finiteClamped(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return THREE.MathUtils.clamp(value!, minimum, maximum);
}

function finiteOriginCoordinate(value: number | undefined) {
  return Number.isFinite(value) ? value! : 0;
}

/**
 * Resolves untrusted/adaptive-quality input before values reach GLSL. Invalid
 * settings therefore fall back to a useful terrain instead of producing NaNs.
 */
export function resolveTerrainMultiscaleOptions(
  options: Readonly<TerrainMultiscaleOptions> = {},
): Readonly<ResolvedTerrainMultiscaleOptions> {
  const detailFadeStart = finiteClamped(
    options.detailFadeStart,
    TERRAIN_MULTISCALE_DEFAULTS.detailFadeStart,
    0,
    MAX_FADE_DISTANCE - 1,
  );
  const requestedFadeEnd = finiteClamped(
    options.detailFadeEnd,
    TERRAIN_MULTISCALE_DEFAULTS.detailFadeEnd,
    0,
    MAX_FADE_DISTANCE,
  );
  const origin = options.worldOrigin;

  return Object.freeze({
    macroWorldSize: finiteClamped(
      options.macroWorldSize,
      TERRAIN_MULTISCALE_DEFAULTS.macroWorldSize,
      1,
      MAX_WORLD_SIZE,
    ),
    microWorldSize: finiteClamped(
      options.microWorldSize,
      TERRAIN_MULTISCALE_DEFAULTS.microWorldSize,
      0.25,
      MAX_WORLD_SIZE,
    ),
    macroStrength: finiteClamped(
      options.macroStrength,
      TERRAIN_MULTISCALE_DEFAULTS.macroStrength,
      0,
      0.45,
    ),
    microStrength: finiteClamped(
      options.microStrength,
      TERRAIN_MULTISCALE_DEFAULTS.microStrength,
      0,
      0.2,
    ),
    roughnessVariation: finiteClamped(
      options.roughnessVariation,
      TERRAIN_MULTISCALE_DEFAULTS.roughnessVariation,
      0,
      0.25,
    ),
    detailFadeStart,
    // A non-empty interval keeps smoothstep defined even under bad input.
    detailFadeEnd: Math.max(detailFadeStart + 1, requestedFadeEnd),
    worldOrigin: Object.freeze([
      finiteOriginCoordinate(origin?.[0]),
      finiteOriginCoordinate(origin?.[1]),
    ] as const),
  });
}

/** Maps the renderer tier to a deterministic uniform-only terrain profile. */
export function resolveTerrainMultiscaleQualityOptions(
  qualityTier: TerrainMultiscaleQualityTier,
  cameraMaxDistance: number,
  worldOrigin: readonly [number, number] = [0, 0],
) {
  const profile = TERRAIN_MULTISCALE_QUALITY_PROFILES[qualityTier];
  if (!profile) return null;
  const safeMaxDistance = finiteClamped(
    cameraMaxDistance,
    TERRAIN_MULTISCALE_DEFAULTS.detailFadeEnd,
    1,
    MAX_FADE_DISTANCE,
  );
  const detailFadeStart = Math.max(
    profile.minimumDetailFadeStart,
    safeMaxDistance * profile.detailFadeStartRatio,
  );
  const detailFadeEnd = Math.max(
    detailFadeStart + 1,
    safeMaxDistance * profile.detailFadeEndRatio,
  );

  return resolveTerrainMultiscaleOptions({
    macroWorldSize: profile.macroWorldSize,
    microWorldSize: profile.microWorldSize,
    macroStrength: profile.macroStrength,
    microStrength: profile.microStrength,
    roughnessVariation: profile.roughnessVariation,
    detailFadeStart,
    detailFadeEnd,
    worldOrigin,
  });
}

type TerrainShaderUniforms = {
  uCommercialTerrainMacroFrequency: THREE.IUniform<number>;
  uCommercialTerrainMicroFrequency: THREE.IUniform<number>;
  uCommercialTerrainMacroStrength: THREE.IUniform<number>;
  uCommercialTerrainMicroStrength: THREE.IUniform<number>;
  uCommercialTerrainRoughnessVariation: THREE.IUniform<number>;
  uCommercialTerrainDetailFadeStart: THREE.IUniform<number>;
  uCommercialTerrainDetailFadeEnd: THREE.IUniform<number>;
  uCommercialTerrainWorldOrigin: THREE.IUniform<THREE.Vector2>;
};

interface TerrainMaterialInstallation {
  uniforms: TerrainShaderUniforms;
  upstreamOnBeforeCompile: THREE.MeshStandardMaterial['onBeforeCompile'];
  upstreamProgramCacheKey: THREE.MeshStandardMaterial['customProgramCacheKey'];
}

const installations = new WeakMap<THREE.MeshStandardMaterial, TerrainMaterialInstallation>();

const VERTEX_PREAMBLE = 'varying vec3 vCommercialTerrainWorldPosition;\n';
const VERTEX_WORLD_POSITION = `
vec4 commercialTerrainWorldPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  commercialTerrainWorldPosition = batchingMatrix * commercialTerrainWorldPosition;
#endif
#ifdef USE_INSTANCING
  commercialTerrainWorldPosition = instanceMatrix * commercialTerrainWorldPosition;
#endif
vCommercialTerrainWorldPosition = (modelMatrix * commercialTerrainWorldPosition).xyz;
#include <project_vertex>`;

const FRAGMENT_PREAMBLE = `
varying vec3 vCommercialTerrainWorldPosition;
uniform float uCommercialTerrainMacroFrequency;
uniform float uCommercialTerrainMicroFrequency;
uniform float uCommercialTerrainMacroStrength;
uniform float uCommercialTerrainMicroStrength;
uniform float uCommercialTerrainRoughnessVariation;
uniform float uCommercialTerrainDetailFadeStart;
uniform float uCommercialTerrainDetailFadeEnd;
uniform vec2 uCommercialTerrainWorldOrigin;
`;

// Sin-free value noise: two scales cost eight small hash evaluations per
// terrain fragment, with no texture fetches, render targets or per-frame work.
const FRAGMENT_NOISE = `
float commercialTerrainHash(vec2 position) {
  vec3 hashPosition = fract(vec3(position.xyx) * 0.1031);
  hashPosition += dot(hashPosition, hashPosition.yzx + 33.33);
  return fract((hashPosition.x + hashPosition.y) * hashPosition.z);
}

float commercialTerrainNoise(vec2 position) {
  vec2 cell = floor(position);
  vec2 localPosition = fract(position);
  localPosition = localPosition * localPosition * (3.0 - 2.0 * localPosition);
  return mix(
    mix(
      commercialTerrainHash(cell),
      commercialTerrainHash(cell + vec2(1.0, 0.0)),
      localPosition.x
    ),
    mix(
      commercialTerrainHash(cell + vec2(0.0, 1.0)),
      commercialTerrainHash(cell + vec2(1.0, 1.0)),
      localPosition.x
    ),
    localPosition.y
  );
}
`;

const FRAGMENT_ALBEDO_VARIATION = `#include <map_fragment>
vec2 commercialTerrainPosition = vCommercialTerrainWorldPosition.xz - uCommercialTerrainWorldOrigin;
float commercialTerrainMacro = commercialTerrainNoise(
  commercialTerrainPosition * uCommercialTerrainMacroFrequency + vec2(11.7, -7.3)
);
float commercialTerrainDistance = distance(cameraPosition, vCommercialTerrainWorldPosition);
float commercialTerrainDetailFade = 1.0 - smoothstep(
  uCommercialTerrainDetailFadeStart,
  uCommercialTerrainDetailFadeEnd,
  commercialTerrainDistance
);
float commercialTerrainMicro = 0.5;
if (commercialTerrainDetailFade > 0.0 && uCommercialTerrainMicroStrength > 0.0) {
  vec2 commercialTerrainRotatedPosition = mat2(0.8, -0.6, 0.6, 0.8) * commercialTerrainPosition;
  commercialTerrainMicro = commercialTerrainNoise(
    commercialTerrainRotatedPosition * uCommercialTerrainMicroFrequency + vec2(-31.1, 19.4)
  );
}
float commercialTerrainMacroCentered = commercialTerrainMacro - 0.5;
float commercialTerrainMicroCentered = commercialTerrainMicro - 0.5;
float commercialTerrainTone =
  commercialTerrainMacroCentered * uCommercialTerrainMacroStrength
  + commercialTerrainMicroCentered * uCommercialTerrainMicroStrength * commercialTerrainDetailFade;
diffuseColor.rgb *= clamp(1.0 + commercialTerrainTone, 0.72, 1.24);`;

const FRAGMENT_ROUGHNESS_VARIATION = `#include <roughnessmap_fragment>
float commercialTerrainRoughness =
  commercialTerrainMacroCentered
  + commercialTerrainMicroCentered * commercialTerrainDetailFade * 0.45;
roughnessFactor = clamp(
  roughnessFactor * (1.0 + commercialTerrainRoughness * uCommercialTerrainRoughnessVariation),
  0.04,
  1.0
);`;

function createUniforms(options: Readonly<ResolvedTerrainMultiscaleOptions>): TerrainShaderUniforms {
  return {
    uCommercialTerrainMacroFrequency: { value: 1 / options.macroWorldSize },
    uCommercialTerrainMicroFrequency: { value: 1 / options.microWorldSize },
    uCommercialTerrainMacroStrength: { value: options.macroStrength },
    uCommercialTerrainMicroStrength: { value: options.microStrength },
    uCommercialTerrainRoughnessVariation: { value: options.roughnessVariation },
    uCommercialTerrainDetailFadeStart: { value: options.detailFadeStart },
    uCommercialTerrainDetailFadeEnd: { value: options.detailFadeEnd },
    uCommercialTerrainWorldOrigin: {
      value: new THREE.Vector2(options.worldOrigin[0], options.worldOrigin[1]),
    },
  };
}

function updateUniforms(
  uniforms: TerrainShaderUniforms,
  options: Readonly<ResolvedTerrainMultiscaleOptions>,
) {
  uniforms.uCommercialTerrainMacroFrequency.value = 1 / options.macroWorldSize;
  uniforms.uCommercialTerrainMicroFrequency.value = 1 / options.microWorldSize;
  uniforms.uCommercialTerrainMacroStrength.value = options.macroStrength;
  uniforms.uCommercialTerrainMicroStrength.value = options.microStrength;
  uniforms.uCommercialTerrainRoughnessVariation.value = options.roughnessVariation;
  uniforms.uCommercialTerrainDetailFadeStart.value = options.detailFadeStart;
  uniforms.uCommercialTerrainDetailFadeEnd.value = options.detailFadeEnd;
  uniforms.uCommercialTerrainWorldOrigin.value.set(options.worldOrigin[0], options.worldOrigin[1]);
}

type MeshStandardShader = Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0];

function hasR170TerrainAnchors(shader: MeshStandardShader) {
  return shader.vertexShader.includes('#include <project_vertex>')
    && shader.fragmentShader.includes('#include <common>')
    && shader.fragmentShader.includes('#include <map_fragment>')
    && shader.fragmentShader.includes('#include <roughnessmap_fragment>');
}

/**
 * Adds camera-safe multi-scale variation to an existing MeshStandardMaterial.
 * Existing hooks and the standard PBR/light/shadow chunks remain authoritative.
 * If another shader removes a required r170 chunk, this enhancer is a no-op.
 */
export function applyTerrainMultiscaleDetail(
  material: THREE.MeshStandardMaterial,
  options: Readonly<TerrainMultiscaleOptions> = {},
) {
  const resolved = resolveTerrainMultiscaleOptions(options);
  const installed = installations.get(material);
  if (installed) {
    updateUniforms(installed.uniforms, resolved);
    return material;
  }

  const uniforms = createUniforms(resolved);
  const upstreamOnBeforeCompile = material.onBeforeCompile;
  // Capture the upstream key before replacing its hook. The default Three key
  // is derived from onBeforeCompile.toString(), so evaluating later would lose
  // the identity of a pre-existing custom shader.
  const upstreamProgramCacheKeyResolver = material.customProgramCacheKey;
  const upstreamProgramCacheKey = material.customProgramCacheKey();

  material.onBeforeCompile = (shader, renderer) => {
    upstreamOnBeforeCompile.call(material, shader, renderer);
    if (!hasR170TerrainAnchors(shader)) return;

    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `${VERTEX_PREAMBLE}${shader.vertexShader}`
      .replace('#include <project_vertex>', VERTEX_WORLD_POSITION);
    shader.fragmentShader = `${FRAGMENT_PREAMBLE}${shader.fragmentShader}`
      .replace('#include <common>', `#include <common>\n${FRAGMENT_NOISE}`)
      .replace('#include <map_fragment>', FRAGMENT_ALBEDO_VARIATION)
      .replace('#include <roughnessmap_fragment>', FRAGMENT_ROUGHNESS_VARIATION);
  };
  material.customProgramCacheKey = () =>
    `${upstreamProgramCacheKey}|${TERRAIN_MULTISCALE_PROGRAM_CACHE_KEY}`;
  material.needsUpdate = true;
  installations.set(material, {
    uniforms,
    upstreamOnBeforeCompile,
    upstreamProgramCacheKey: upstreamProgramCacheKeyResolver,
  });
  return material;
}

/**
 * Removes only this enhancer and restores the exact hooks the caller supplied.
 * This is the last-resort mobile fallback when a driver rejects the customized
 * standard program during the real renderer compile step.
 */
export function removeTerrainMultiscaleDetail(material: THREE.MeshStandardMaterial) {
  const installed = installations.get(material);
  if (!installed) return false;
  material.onBeforeCompile = installed.upstreamOnBeforeCompile;
  material.customProgramCacheKey = installed.upstreamProgramCacheKey;
  material.needsUpdate = true;
  installations.delete(material);
  return true;
}

export function hasTerrainMultiscaleDetail(material: THREE.MeshStandardMaterial) {
  return installations.has(material);
}

/** Owns only the material; the shader adds no textures or disposable targets. */
export function createMultiscaleTerrainMaterial(
  parameters: THREE.MeshStandardMaterialParameters = {},
  options: Readonly<TerrainMultiscaleOptions> = {},
) {
  return applyTerrainMultiscaleDetail(new THREE.MeshStandardMaterial(parameters), options);
}
