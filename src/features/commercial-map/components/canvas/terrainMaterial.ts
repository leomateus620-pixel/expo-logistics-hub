import * as THREE from 'three';

/**
 * Shader revision is deliberately tied to the Three version whose chunks are
 * used below. Keep this key stable while the generated GLSL remains identical.
 */
export const TERRAIN_MULTISCALE_PROGRAM_CACHE_KEY =
  'commercial-map-terrain-multiscale-r170-v3-fbm-tiling-parcels';

export interface TerrainMultiscaleOptions {
  /** Width, in world units, of the largest fBm tonal feature. */
  macroWorldSize?: number;
  /** Width, in world units, of one close-range detail feature. */
  microWorldSize?: number;
  /** Broad albedo modulation around the authored material colour. */
  macroStrength?: number;
  /** Close-range albedo modulation, faded before it can shimmer at distance. */
  microStrength?: number;
  /** Subtle variation applied to the material's existing roughness response. */
  roughnessVariation?: number;
  /** Warm/cool hue drift (dry versus lush patches) driven by the fBm field. */
  tintStrength?: number;
  /**
   * 0 keeps the plain albedo sample. 1 fully blends a rotated, rescaled second
   * sample of the same map by a low-frequency mask, hiding the repeated tile.
   */
  tilingBreak?: number;
  /**
   * 0 disables the regional parcel field. Otherwise blends a rotated grid of
   * pasture/stubble parcels with hedgerow borders into the ground beyond
   * `parcelInnerRadius`; the park interior is never touched.
   */
  parcelStrength?: number;
  /** World distance from `worldOrigin` where the parcel field starts fading in. */
  parcelInnerRadius?: number;
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
  tintStrength: number;
  tilingBreak: number;
  parcelStrength: number;
  parcelInnerRadius: number;
  detailFadeStart: number;
  detailFadeEnd: number;
  worldOrigin: readonly [number, number];
}

export type TerrainMultiscaleQualityTier = 'full' | 'balanced' | 'reduced';

/**
 * `outer` is the kilometre-scale presentation ground around the park; `park`
 * is every grass/soil surface inside the official crop, where the same fBm
 * must read at lot scale without touching lot geometry.
 */
export type TerrainMultiscaleVariant = 'outer' | 'park';

interface TerrainMultiscaleQualityProfile {
  macroWorldSize: number;
  microWorldSize: number;
  macroStrength: number;
  microStrength: number;
  roughnessVariation: number;
  tintStrength: number;
  tilingBreak: number;
  parcelStrength: number;
  parcelInnerRadius: number;
  detailFadeStartRatio: number;
  detailFadeEndRatio: number;
  minimumDetailFadeStart: number;
}

export const TERRAIN_MULTISCALE_DEFAULTS: Readonly<ResolvedTerrainMultiscaleOptions> =
  Object.freeze({
    // The outer presentation ground is measured in thousands of world units.
    // Four fBm octaves span regional patches down to ~1/8 of this size.
    macroWorldSize: 220,
    microWorldSize: 12,
    macroStrength: 0.18,
    microStrength: 0.06,
    roughnessVariation: 0.045,
    tintStrength: 0.06,
    tilingBreak: 0.85,
    parcelStrength: 0,
    parcelInnerRadius: 110,
    detailFadeStart: 180,
    detailFadeEnd: 1_000,
    worldOrigin: Object.freeze([0, 0] as const),
  });

const MAX_WORLD_SIZE = 100_000;
const MAX_FADE_DISTANCE = 1_000_000;

/**
 * Full, balanced and reduced share one program and differ only by uniforms.
 * Reduced keeps the parcel field and grass variation at cheaper frequencies so
 * LOW never collapses the map to a flat green plane.
 */
export const TERRAIN_MULTISCALE_QUALITY_PROFILES: Readonly<Record<
  TerrainMultiscaleVariant,
  Readonly<Record<TerrainMultiscaleQualityTier, Readonly<TerrainMultiscaleQualityProfile>>>
>> = Object.freeze({
  outer: Object.freeze({
    full: Object.freeze({
      macroWorldSize: 220,
      microWorldSize: 9,
      macroStrength: 0.22,
      microStrength: 0.065,
      roughnessVariation: 0.05,
      tintStrength: 0.07,
      tilingBreak: 0.9,
      parcelStrength: 0.85,
      parcelInnerRadius: 110,
      detailFadeStartRatio: 0.28,
      detailFadeEndRatio: 0.92,
      minimumDetailFadeStart: 90,
    }),
    balanced: Object.freeze({
      macroWorldSize: 250,
      microWorldSize: 14,
      macroStrength: 0.19,
      microStrength: 0.045,
      roughnessVariation: 0.035,
      tintStrength: 0.055,
      tilingBreak: 0.75,
      parcelStrength: 0.7,
      parcelInnerRadius: 110,
      detailFadeStartRatio: 0.22,
      detailFadeEndRatio: 0.7,
      minimumDetailFadeStart: 72,
    }),
    reduced: Object.freeze({
      macroWorldSize: 280,
      microWorldSize: 22,
      macroStrength: 0.15,
      microStrength: 0.028,
      roughnessVariation: 0.02,
      tintStrength: 0.04,
      tilingBreak: 0.55,
      parcelStrength: 0.55,
      parcelInnerRadius: 110,
      detailFadeStartRatio: 0.16,
      detailFadeEndRatio: 0.52,
      minimumDetailFadeStart: 56,
    }),
  }),
  park: Object.freeze({
    full: Object.freeze({
      // The official crop is ~120×90 units. A 56-unit base octave with three
      // finer octaves gives visible dry/lush patches inside single lots.
      macroWorldSize: 56,
      microWorldSize: 4.5,
      macroStrength: 0.17,
      microStrength: 0.07,
      roughnessVariation: 0.06,
      tintStrength: 0.065,
      tilingBreak: 0.9,
      parcelStrength: 0,
      parcelInnerRadius: 110,
      detailFadeStartRatio: 0.3,
      detailFadeEndRatio: 1,
      minimumDetailFadeStart: 110,
    }),
    balanced: Object.freeze({
      macroWorldSize: 64,
      microWorldSize: 6,
      macroStrength: 0.15,
      microStrength: 0.05,
      roughnessVariation: 0.045,
      tintStrength: 0.05,
      tilingBreak: 0.75,
      parcelStrength: 0,
      parcelInnerRadius: 110,
      detailFadeStartRatio: 0.24,
      detailFadeEndRatio: 0.8,
      minimumDetailFadeStart: 90,
    }),
    reduced: Object.freeze({
      macroWorldSize: 72,
      microWorldSize: 9,
      macroStrength: 0.12,
      microStrength: 0.03,
      roughnessVariation: 0.028,
      tintStrength: 0.035,
      tilingBreak: 0.55,
      parcelStrength: 0,
      parcelInnerRadius: 110,
      detailFadeStartRatio: 0.18,
      detailFadeEndRatio: 0.58,
      minimumDetailFadeStart: 72,
    }),
  }),
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
    tintStrength: finiteClamped(
      options.tintStrength,
      TERRAIN_MULTISCALE_DEFAULTS.tintStrength,
      0,
      0.2,
    ),
    tilingBreak: finiteClamped(
      options.tilingBreak,
      TERRAIN_MULTISCALE_DEFAULTS.tilingBreak,
      0,
      1,
    ),
    parcelStrength: finiteClamped(
      options.parcelStrength,
      TERRAIN_MULTISCALE_DEFAULTS.parcelStrength,
      0,
      1,
    ),
    parcelInnerRadius: finiteClamped(
      options.parcelInnerRadius,
      TERRAIN_MULTISCALE_DEFAULTS.parcelInnerRadius,
      0,
      MAX_WORLD_SIZE,
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
  variant: TerrainMultiscaleVariant = 'outer',
) {
  const profile = TERRAIN_MULTISCALE_QUALITY_PROFILES[variant][qualityTier];
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
    tintStrength: profile.tintStrength,
    tilingBreak: profile.tilingBreak,
    parcelStrength: profile.parcelStrength,
    parcelInnerRadius: profile.parcelInnerRadius,
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
  uCommercialTerrainTintStrength: THREE.IUniform<number>;
  uCommercialTerrainTilingBreak: THREE.IUniform<number>;
  uCommercialTerrainParcelStrength: THREE.IUniform<number>;
  uCommercialTerrainParcelInnerRadius: THREE.IUniform<number>;
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
uniform float uCommercialTerrainTintStrength;
uniform float uCommercialTerrainTilingBreak;
uniform float uCommercialTerrainParcelStrength;
uniform float uCommercialTerrainParcelInnerRadius;
uniform float uCommercialTerrainDetailFadeStart;
uniform float uCommercialTerrainDetailFadeEnd;
uniform vec2 uCommercialTerrainWorldOrigin;
`;

// Sin-free value noise. The fBm below costs four value-noise lookups (16 small
// hashes) plus one optional micro lookup per terrain fragment, with no extra
// textures, render targets or per-frame CPU work.
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

// Four-octave fBm with a rotated lattice per octave so axis-aligned value-noise
// artefacts never line up. Output is renormalised to 0..1.
float commercialTerrainFbm(vec2 position) {
  const mat2 lattice = mat2(0.86, -0.5, 0.5, 0.86);
  float amplitude = 0.5;
  float total = 0.0;
  float weight = 0.0;
  vec2 samplePosition = position;
  for (int octave = 0; octave < 4; octave += 1) {
    total += commercialTerrainNoise(samplePosition) * amplitude;
    weight += amplitude;
    samplePosition = lattice * samplePosition * 2.07 + vec2(17.3, -9.1);
    amplitude *= 0.5;
  }
  return total / weight;
}
`;

// Replaces r170 <map_fragment>: same sRGB decode path (three appends the
// texture colour-space conversion to texture2D), plus a stochastic second
// sample that hides the repeated tile without touching the source texture.
const FRAGMENT_MAP_WITH_TILING_BREAK = `
vec2 commercialTerrainPosition = vCommercialTerrainWorldPosition.xz - uCommercialTerrainWorldOrigin;
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  if (uCommercialTerrainTilingBreak > 0.0) {
    vec2 commercialTerrainAltUv = mat2(0.7986, -0.6018, 0.6018, 0.7986) * vMapUv * 0.731 + vec2(0.37, 0.61);
    vec4 commercialTerrainAltSample = texture2D( map, commercialTerrainAltUv );
    float commercialTerrainTileMask = smoothstep(
      0.32,
      0.68,
      commercialTerrainNoise(commercialTerrainPosition * 0.047 + vec2(5.1, 2.7))
    );
    sampledDiffuseColor = mix(
      sampledDiffuseColor,
      commercialTerrainAltSample,
      commercialTerrainTileMask * uCommercialTerrainTilingBreak
    );
  }
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif`;

const FRAGMENT_ALBEDO_VARIATION = `${FRAGMENT_MAP_WITH_TILING_BREAK}
float commercialTerrainMacro = commercialTerrainFbm(
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
// fBm concentrates around 0.5; stretch it so the strengths keep their meaning.
float commercialTerrainMacroCentered = clamp((commercialTerrainMacro - 0.5) * 1.9, -0.5, 0.5);
float commercialTerrainMicroCentered = commercialTerrainMicro - 0.5;
float commercialTerrainTone =
  commercialTerrainMacroCentered * uCommercialTerrainMacroStrength
  + commercialTerrainMicroCentered * uCommercialTerrainMicroStrength * commercialTerrainDetailFade;
// Dry patches drift warm/yellow, lush patches drift cool/green.
vec3 commercialTerrainTint = mix(
  vec3(1.0 - uCommercialTerrainTintStrength * 0.6, 1.0, 1.0 + uCommercialTerrainTintStrength * 0.2),
  vec3(1.0 + uCommercialTerrainTintStrength, 1.0 + uCommercialTerrainTintStrength * 0.45, 1.0 - uCommercialTerrainTintStrength * 0.9),
  commercialTerrainMacroCentered + 0.5
);
diffuseColor.rgb *= clamp(1.0 + commercialTerrainTone, 0.7, 1.26) * commercialTerrainTint;
// Regional parcel field: a rotated, row-offset grid of pasture/stubble cells
// with hedgerow borders, faded in beyond the park and faded out with camera
// distance before the border lines could turn into sub-pixel shimmer.
if (uCommercialTerrainParcelStrength > 0.0) {
  float commercialTerrainParcelMask = smoothstep(
    uCommercialTerrainParcelInnerRadius,
    uCommercialTerrainParcelInnerRadius * 1.6 + 40.0,
    length(commercialTerrainPosition)
  );
  if (commercialTerrainParcelMask > 0.0) {
    const vec2 commercialTerrainParcelSize = vec2(96.0, 148.0);
    vec2 commercialTerrainParcelUv = (mat2(0.9659, -0.2588, 0.2588, 0.9659) * commercialTerrainPosition)
      / commercialTerrainParcelSize;
    commercialTerrainParcelUv.x += floor(commercialTerrainParcelUv.y) * 0.37;
    vec2 commercialTerrainParcelCell = floor(commercialTerrainParcelUv);
    vec2 commercialTerrainParcelLocal = fract(commercialTerrainParcelUv);
    float commercialTerrainParcelTone = commercialTerrainHash(commercialTerrainParcelCell + vec2(3.7, 8.1)) - 0.5;
    float commercialTerrainParcelWarm = commercialTerrainHash(commercialTerrainParcelCell + vec2(-5.3, 2.9));
    vec3 commercialTerrainParcelTint = mix(
      vec3(0.93, 1.0, 0.9),
      vec3(1.1, 1.03, 0.84),
      smoothstep(0.35, 0.8, commercialTerrainParcelWarm)
    );
    vec2 commercialTerrainParcelEdge = min(commercialTerrainParcelLocal, 1.0 - commercialTerrainParcelLocal)
      * commercialTerrainParcelSize;
    float commercialTerrainHedgerow = (1.0 - smoothstep(0.8, 3.2, min(commercialTerrainParcelEdge.x, commercialTerrainParcelEdge.y)))
      * (1.0 - smoothstep(700.0, 1600.0, commercialTerrainDistance));
    vec3 commercialTerrainParcelColor = commercialTerrainParcelTint
      * (1.0 + commercialTerrainParcelTone * 0.14)
      * (1.0 - commercialTerrainHedgerow * 0.24);
    diffuseColor.rgb *= mix(
      vec3(1.0),
      commercialTerrainParcelColor,
      commercialTerrainParcelMask * uCommercialTerrainParcelStrength
    );
  }
}`;

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
    uCommercialTerrainTintStrength: { value: options.tintStrength },
    uCommercialTerrainTilingBreak: { value: options.tilingBreak },
    uCommercialTerrainParcelStrength: { value: options.parcelStrength },
    uCommercialTerrainParcelInnerRadius: { value: options.parcelInnerRadius },
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
  uniforms.uCommercialTerrainTintStrength.value = options.tintStrength;
  uniforms.uCommercialTerrainTilingBreak.value = options.tilingBreak;
  uniforms.uCommercialTerrainParcelStrength.value = options.parcelStrength;
  uniforms.uCommercialTerrainParcelInnerRadius.value = options.parcelInnerRadius;
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

/**
 * Camera range used by every park-interior grass surface. The official crop is
 * ~150 units across, so close-range micro detail fades between ~110 and ~370
 * units and is gone before the park is a small object on screen.
 */
export const PARK_GROUND_DETAIL_CAMERA_RANGE = 370;

/**
 * Applies the park-scale fBm/tiling-break profile to an interior grass, soil or
 * gravel material. Reduced graphics uses the cheaper uniform profile of the
 * same program so LOW keeps terrain instead of a flat green plane.
 */
export function applyParkGroundDetail(
  material: THREE.MeshStandardMaterial,
  reducedGraphics: boolean,
  worldOrigin: readonly [number, number] = [0, 0],
) {
  const options = resolveTerrainMultiscaleQualityOptions(
    reducedGraphics ? 'reduced' : 'full',
    PARK_GROUND_DETAIL_CAMERA_RANGE,
    worldOrigin,
    'park',
  );
  if (!options) return material;
  try {
    return applyTerrainMultiscaleDetail(material, options);
  } catch {
    removeTerrainMultiscaleDetail(material);
    return material;
  }
}

/** Owns only the material; the shader adds no textures or disposable targets. */
export function createMultiscaleTerrainMaterial(
  parameters: THREE.MeshStandardMaterialParameters = {},
  options: Readonly<TerrainMultiscaleOptions> = {},
) {
  return applyTerrainMultiscaleDetail(new THREE.MeshStandardMaterial(parameters), options);
}
