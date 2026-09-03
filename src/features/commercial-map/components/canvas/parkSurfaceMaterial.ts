import * as THREE from 'three';

/**
 * Shader revision is tied to the Three r170 chunks hooked below. Keep this key
 * stable while the generated GLSL remains identical: profiles differ only by
 * uniforms so every park surface shares one compiled program.
 */
export const PARK_SURFACE_PROGRAM_CACHE_KEY = 'commercial-map-park-surface-r170-v1-grain-contact';

export type ParkSurfaceKind = 'asphalt' | 'concrete' | 'lot' | 'roof' | 'metal' | 'volume';

export interface ParkSurfaceOptions {
  /** World-space grit frequency. Higher = finer aggregate. */
  grainFrequency?: number;
  /** Albedo modulation around the authored colour. Official palettes stay. */
  grainStrength?: number;
  /** Roughness jitter so pavement/metal stop reading as plastic. */
  roughnessVariation?: number;
  /** Cheap view-space normal perturb from world-xz noise. 0 disables. */
  normalStrength?: number;
  /** 0 disables contact. Otherwise darkens fragments near the ground. */
  contactStrength?: number;
  /** World-Y falloff, in map units (0.15 units/metre). */
  contactHeight?: number;
  /** Local-Y of unit primitives treated as the mesh bottom (boxes/cylinders). */
  contactObjectBottom?: number;
  /** Extra metalness jitter for zinc/steel. 0 leaves metalness untouched. */
  metalnessVariation?: number;
  /** Camera distance where high-frequency grit/normals start fading. */
  detailFadeStart?: number;
  /** Camera distance where high-frequency grit/normals are gone. */
  detailFadeEnd?: number;
}

export interface ResolvedParkSurfaceOptions {
  grainFrequency: number;
  grainStrength: number;
  roughnessVariation: number;
  normalStrength: number;
  contactStrength: number;
  contactHeight: number;
  contactObjectBottom: number;
  metalnessVariation: number;
  detailFadeStart: number;
  detailFadeEnd: number;
}

export const PARK_SURFACE_DEFAULTS: Readonly<ResolvedParkSurfaceOptions> = Object.freeze({
  grainFrequency: 18,
  grainStrength: 0.12,
  roughnessVariation: 0.06,
  normalStrength: 0.22,
  contactStrength: 0,
  contactHeight: 0.22,
  contactObjectBottom: -0.5,
  metalnessVariation: 0,
  detailFadeStart: 70,
  detailFadeEnd: 260,
});

export const PARK_SURFACE_PROFILES: Readonly<Record<ParkSurfaceKind, Readonly<ResolvedParkSurfaceOptions>>> =
  Object.freeze({
    asphalt: Object.freeze({
      ...PARK_SURFACE_DEFAULTS,
      grainFrequency: 22,
      grainStrength: 0.18,
      roughnessVariation: 0.09,
      normalStrength: 0.38,
    }),
    concrete: Object.freeze({
      ...PARK_SURFACE_DEFAULTS,
      grainFrequency: 16,
      grainStrength: 0.1,
      roughnessVariation: 0.055,
      normalStrength: 0.22,
    }),
    lot: Object.freeze({
      ...PARK_SURFACE_DEFAULTS,
      grainFrequency: 17,
      grainStrength: 0.11,
      roughnessVariation: 0.05,
      normalStrength: 0.24,
    }),
    roof: Object.freeze({
      ...PARK_SURFACE_DEFAULTS,
      grainFrequency: 9,
      grainStrength: 0.075,
      roughnessVariation: 0.11,
      normalStrength: 0.1,
      metalnessVariation: 0.08,
    }),
    metal: Object.freeze({
      ...PARK_SURFACE_DEFAULTS,
      grainFrequency: 11,
      grainStrength: 0.055,
      roughnessVariation: 0.13,
      normalStrength: 0.08,
      metalnessVariation: 0.1,
      contactStrength: 0.12,
      contactHeight: 0.16,
    }),
    volume: Object.freeze({
      ...PARK_SURFACE_DEFAULTS,
      grainFrequency: 7,
      grainStrength: 0.04,
      roughnessVariation: 0.03,
      normalStrength: 0.05,
      contactStrength: 0.48,
      contactHeight: 0.26,
    }),
  });

const MAX_FREQUENCY = 200;
const MAX_FADE_DISTANCE = 1_000_000;

function finiteClamped(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return THREE.MathUtils.clamp(value!, minimum, maximum);
}

export function resolveParkSurfaceOptions(
  options: Readonly<ParkSurfaceOptions> = {},
): Readonly<ResolvedParkSurfaceOptions> {
  const detailFadeStart = finiteClamped(
    options.detailFadeStart,
    PARK_SURFACE_DEFAULTS.detailFadeStart,
    0,
    MAX_FADE_DISTANCE - 1,
  );
  const detailFadeEnd = Math.max(
    detailFadeStart + 1,
    finiteClamped(
      options.detailFadeEnd,
      PARK_SURFACE_DEFAULTS.detailFadeEnd,
      detailFadeStart + 1,
      MAX_FADE_DISTANCE,
    ),
  );
  return Object.freeze({
    grainFrequency: finiteClamped(options.grainFrequency, PARK_SURFACE_DEFAULTS.grainFrequency, 0.5, MAX_FREQUENCY),
    grainStrength: finiteClamped(options.grainStrength, PARK_SURFACE_DEFAULTS.grainStrength, 0, 0.45),
    roughnessVariation: finiteClamped(
      options.roughnessVariation,
      PARK_SURFACE_DEFAULTS.roughnessVariation,
      0,
      0.4,
    ),
    normalStrength: finiteClamped(options.normalStrength, PARK_SURFACE_DEFAULTS.normalStrength, 0, 1),
    contactStrength: finiteClamped(options.contactStrength, PARK_SURFACE_DEFAULTS.contactStrength, 0, 0.85),
    contactHeight: finiteClamped(options.contactHeight, PARK_SURFACE_DEFAULTS.contactHeight, 0.02, 4),
    contactObjectBottom: finiteClamped(
      options.contactObjectBottom,
      PARK_SURFACE_DEFAULTS.contactObjectBottom,
      -2,
      2,
    ),
    metalnessVariation: finiteClamped(
      options.metalnessVariation,
      PARK_SURFACE_DEFAULTS.metalnessVariation,
      0,
      0.4,
    ),
    detailFadeStart,
    detailFadeEnd,
  });
}

interface ParkSurfaceUniforms {
  uParkGrainFrequency: THREE.IUniform<number>;
  uParkGrainStrength: THREE.IUniform<number>;
  uParkRoughnessVariation: THREE.IUniform<number>;
  uParkNormalStrength: THREE.IUniform<number>;
  uParkContactStrength: THREE.IUniform<number>;
  uParkContactHeight: THREE.IUniform<number>;
  uParkContactObjectBottom: THREE.IUniform<number>;
  uParkMetalnessVariation: THREE.IUniform<number>;
  uParkDetailFadeStart: THREE.IUniform<number>;
  uParkDetailFadeEnd: THREE.IUniform<number>;
}

interface ParkSurfaceInstallation {
  uniforms: ParkSurfaceUniforms;
  upstreamOnBeforeCompile: THREE.MeshStandardMaterial['onBeforeCompile'];
  upstreamProgramCacheKey: THREE.MeshStandardMaterial['customProgramCacheKey'];
}

const installations = new WeakMap<THREE.MeshStandardMaterial, ParkSurfaceInstallation>();

const VERTEX_PREAMBLE = `
varying vec3 vParkWorldPosition;
varying vec3 vParkWorldNormal;
varying float vParkObjectY;
`;

const VERTEX_WORLD_POSITION = `
vParkObjectY = transformed.y;
vec4 parkWorldPosition = vec4(transformed, 1.0);
vec3 parkObjectNormal = objectNormal;
#ifdef USE_BATCHING
  parkWorldPosition = batchingMatrix * parkWorldPosition;
  parkObjectNormal = mat3(batchingMatrix) * parkObjectNormal;
#endif
#ifdef USE_INSTANCING
  parkWorldPosition = instanceMatrix * parkWorldPosition;
  parkObjectNormal = mat3(instanceMatrix) * parkObjectNormal;
#endif
vParkWorldPosition = (modelMatrix * parkWorldPosition).xyz;
vParkWorldNormal = normalize(mat3(modelMatrix) * parkObjectNormal);
#include <project_vertex>`;

const FRAGMENT_PREAMBLE = `
varying vec3 vParkWorldPosition;
varying vec3 vParkWorldNormal;
varying float vParkObjectY;
uniform float uParkGrainFrequency;
uniform float uParkGrainStrength;
uniform float uParkRoughnessVariation;
uniform float uParkNormalStrength;
uniform float uParkContactStrength;
uniform float uParkContactHeight;
uniform float uParkContactObjectBottom;
uniform float uParkMetalnessVariation;
uniform float uParkDetailFadeStart;
uniform float uParkDetailFadeEnd;
`;

const FRAGMENT_NOISE = `
float parkSurfaceHash(vec2 position) {
  vec3 hashPosition = fract(vec3(position.xyx) * 0.1031);
  hashPosition += dot(hashPosition, hashPosition.yzx + 33.33);
  return fract((hashPosition.x + hashPosition.y) * hashPosition.z);
}

float parkSurfaceNoise(vec2 position) {
  vec2 cell = floor(position);
  vec2 localPosition = fract(position);
  localPosition = localPosition * localPosition * (3.0 - 2.0 * localPosition);
  return mix(
    mix(
      parkSurfaceHash(cell),
      parkSurfaceHash(cell + vec2(1.0, 0.0)),
      localPosition.x
    ),
    mix(
      parkSurfaceHash(cell + vec2(0.0, 1.0)),
      parkSurfaceHash(cell + vec2(1.0, 1.0)),
      localPosition.x
    ),
    localPosition.y
  );
}

float parkSurfaceFbm(vec2 position) {
  const mat2 lattice = mat2(0.82, -0.57, 0.57, 0.82);
  float amplitude = 0.5;
  float total = 0.0;
  float weight = 0.0;
  vec2 samplePosition = position;
  for (int octave = 0; octave < 3; octave += 1) {
    total += parkSurfaceNoise(samplePosition) * amplitude;
    weight += amplitude;
    samplePosition = lattice * samplePosition * 2.05 + vec2(13.1, -8.4);
    amplitude *= 0.5;
  }
  return total / weight;
}
`;

const FRAGMENT_ALBEDO = `#include <map_fragment>
float parkSurfaceDistance = distance(cameraPosition, vParkWorldPosition);
float parkSurfaceDetailFade = 1.0 - smoothstep(
  uParkDetailFadeStart,
  uParkDetailFadeEnd,
  parkSurfaceDistance
);
vec2 parkSurfaceCoord = vParkWorldPosition.xz * uParkGrainFrequency;
float parkSurfaceMacro = parkSurfaceFbm(parkSurfaceCoord * 0.18 + vec2(4.7, -2.3));
float parkSurfaceMicro = 0.5;
if (parkSurfaceDetailFade > 0.0 && uParkGrainStrength > 0.0) {
  parkSurfaceMicro = parkSurfaceNoise(mat2(0.8, -0.6, 0.6, 0.8) * parkSurfaceCoord + vec2(-11.2, 9.6));
}
float parkSurfaceGrain =
  (parkSurfaceMacro - 0.5) * 1.55
  + (parkSurfaceMicro - 0.5) * parkSurfaceDetailFade;
diffuseColor.rgb *= clamp(1.0 + parkSurfaceGrain * uParkGrainStrength, 0.72, 1.22);
`;

const FRAGMENT_ROUGHNESS = `#include <roughnessmap_fragment>
roughnessFactor = clamp(
  roughnessFactor * (1.0 + parkSurfaceGrain * uParkRoughnessVariation),
  0.08,
  1.0
);`;

const FRAGMENT_METALNESS = `#include <metalnessmap_fragment>
metalnessFactor = clamp(
  metalnessFactor * (1.0 + parkSurfaceGrain * uParkMetalnessVariation),
  0.0,
  1.0
);`;

const FRAGMENT_NORMAL = `#include <normal_fragment_maps>
if (uParkNormalStrength > 0.0 && parkSurfaceDetailFade > 0.0) {
  float parkSurfaceNx = parkSurfaceNoise(parkSurfaceCoord + vec2(0.17, 0.0));
  float parkSurfaceNz = parkSurfaceNoise(parkSurfaceCoord + vec2(0.0, 0.17));
  vec3 parkSurfaceGrit = vec3(
    parkSurfaceNx - parkSurfaceMacro,
    0.42,
    parkSurfaceNz - parkSurfaceMacro
  );
  normal = normalize(normal + parkSurfaceGrit * uParkNormalStrength * parkSurfaceDetailFade);
}
`;

const FRAGMENT_CONTACT = `vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
if (uParkContactStrength > 0.0) {
  float parkWorldContact = 1.0 - smoothstep(0.0, uParkContactHeight, vParkWorldPosition.y);
  float parkObjectContact = 1.0 - smoothstep(
    uParkContactObjectBottom,
    uParkContactObjectBottom + uParkContactHeight,
    vParkObjectY
  );
  float parkVertical = 1.0 - abs(vParkWorldNormal.y);
  float parkContact = mix(
    max(parkWorldContact, parkObjectContact) * 0.55,
    max(parkWorldContact, parkObjectContact),
    parkVertical
  );
  totalDiffuse *= mix(1.0, 1.0 - uParkContactStrength, clamp(parkContact, 0.0, 1.0));
}
`

function createUniforms(options: Readonly<ResolvedParkSurfaceOptions>): ParkSurfaceUniforms {
  return {
    uParkGrainFrequency: { value: options.grainFrequency },
    uParkGrainStrength: { value: options.grainStrength },
    uParkRoughnessVariation: { value: options.roughnessVariation },
    uParkNormalStrength: { value: options.normalStrength },
    uParkContactStrength: { value: options.contactStrength },
    uParkContactHeight: { value: options.contactHeight },
    uParkContactObjectBottom: { value: options.contactObjectBottom },
    uParkMetalnessVariation: { value: options.metalnessVariation },
    uParkDetailFadeStart: { value: options.detailFadeStart },
    uParkDetailFadeEnd: { value: options.detailFadeEnd },
  };
}

function updateUniforms(uniforms: ParkSurfaceUniforms, options: Readonly<ResolvedParkSurfaceOptions>) {
  uniforms.uParkGrainFrequency.value = options.grainFrequency;
  uniforms.uParkGrainStrength.value = options.grainStrength;
  uniforms.uParkRoughnessVariation.value = options.roughnessVariation;
  uniforms.uParkNormalStrength.value = options.normalStrength;
  uniforms.uParkContactStrength.value = options.contactStrength;
  uniforms.uParkContactHeight.value = options.contactHeight;
  uniforms.uParkContactObjectBottom.value = options.contactObjectBottom;
  uniforms.uParkMetalnessVariation.value = options.metalnessVariation;
  uniforms.uParkDetailFadeStart.value = options.detailFadeStart;
  uniforms.uParkDetailFadeEnd.value = options.detailFadeEnd;
}

type MeshStandardShader = Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0];

function hasR170ParkSurfaceAnchors(shader: MeshStandardShader) {
  return shader.vertexShader.includes('#include <project_vertex>')
    && shader.vertexShader.includes('#include <beginnormal_vertex>')
    && shader.fragmentShader.includes('#include <common>')
    && shader.fragmentShader.includes('#include <map_fragment>')
    && shader.fragmentShader.includes('#include <roughnessmap_fragment>')
    && shader.fragmentShader.includes('#include <normal_fragment_maps>')
    && shader.fragmentShader.includes('#include <aomap_fragment>')
    && shader.fragmentShader.includes(
      'vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;',
    );
}

function installParkSurfaceDetail(
  material: THREE.MeshStandardMaterial,
  options: Readonly<ResolvedParkSurfaceOptions>,
) {
  const installed = installations.get(material);
  if (installed) {
    updateUniforms(installed.uniforms, options);
    return material;
  }

  const uniforms = createUniforms(options);
  const upstreamOnBeforeCompile = material.onBeforeCompile;
  const upstreamProgramCacheKeyResolver = material.customProgramCacheKey;
  const upstreamProgramCacheKey = material.customProgramCacheKey();

  material.onBeforeCompile = (shader, renderer) => {
    upstreamOnBeforeCompile.call(material, shader, renderer);
    if (!hasR170ParkSurfaceAnchors(shader)) return;

    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `${VERTEX_PREAMBLE}${shader.vertexShader}`
      .replace('#include <project_vertex>', VERTEX_WORLD_POSITION);
    shader.fragmentShader = `${FRAGMENT_PREAMBLE}${shader.fragmentShader}`
      .replace('#include <common>', `#include <common>\n${FRAGMENT_NOISE}`)
      .replace('#include <map_fragment>', FRAGMENT_ALBEDO)
      .replace('#include <roughnessmap_fragment>', FRAGMENT_ROUGHNESS)
      .replace('#include <normal_fragment_maps>', FRAGMENT_NORMAL)
      .replace(
        'vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;',
        FRAGMENT_CONTACT,
      );
    if (shader.fragmentShader.includes('#include <metalnessmap_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <metalnessmap_fragment>',
        FRAGMENT_METALNESS,
      );
    }
  };
  material.customProgramCacheKey = () =>
    `${upstreamProgramCacheKey}|${PARK_SURFACE_PROGRAM_CACHE_KEY}`;
  material.needsUpdate = true;
  installations.set(material, {
    uniforms,
    upstreamOnBeforeCompile,
    upstreamProgramCacheKey: upstreamProgramCacheKeyResolver,
  });
  return material;
}

/**
 * Adds world-space grit, roughness jitter, cheap normals and optional contact
 * shading to an existing MeshStandardMaterial. Official colours stay: the
 * shader only multiplies around the authored albedo. Existing hooks and r170
 * light/shadow chunks remain authoritative. Reduced graphics is a no-op.
 */
export function applyParkSurfaceDetail(
  material: THREE.MeshStandardMaterial,
  kind: ParkSurfaceKind | Readonly<ParkSurfaceOptions> = 'asphalt',
  reducedGraphics = false,
) {
  if (reducedGraphics) {
    removeParkSurfaceDetail(material);
    return material;
  }
  const resolved = typeof kind === 'string'
    ? PARK_SURFACE_PROFILES[kind]
    : resolveParkSurfaceOptions(kind);
  try {
    return installParkSurfaceDetail(material, resolved);
  } catch {
    removeParkSurfaceDetail(material);
    return material;
  }
}

export function removeParkSurfaceDetail(material: THREE.MeshStandardMaterial) {
  const installed = installations.get(material);
  if (!installed) return false;
  material.onBeforeCompile = installed.upstreamOnBeforeCompile;
  material.customProgramCacheKey = installed.upstreamProgramCacheKey;
  material.needsUpdate = true;
  installations.delete(material);
  return true;
}

export function hasParkSurfaceDetail(material: THREE.MeshStandardMaterial) {
  return installations.has(material);
}

/** R3F material ref: idempotent, safe to call every commit. */
export function bindParkSurfaceMaterial(
  kind: ParkSurfaceKind,
  reducedGraphics: boolean,
) {
  return (material: THREE.MeshStandardMaterial | null) => {
    if (material) applyParkSurfaceDetail(material, kind, reducedGraphics);
  };
}
