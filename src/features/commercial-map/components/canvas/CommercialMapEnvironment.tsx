import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import {
  BlendFunction,
  BloomEffect,
  Effect,
  EffectAttribute,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import * as THREE from 'three';
import {
  COMMERCIAL_MAP_ENVIRONMENT_CONFIG,
  resolveCommercialMapEnvironmentLayout,
  resolveCommercialMapShadowFrustum,
  resolveCommercialMapSunriseFrame,
  resolveCommercialMapSunriseProgress,
  resolveCommercialMapSunriseQualityTier,
  type CommercialMapEnvironmentExtent,
  type CommercialMapShadowFrustum,
  type CommercialMapEnvironmentMode,
  type CommercialMapSunriseFrame,
  type CommercialMapSunriseQualityTier,
} from '../../data/commercialMapEnvironment';
import {
  resolveCommercialMapCameraDistanceBounds,
  resolveCommercialMapEnvironmentQualityTier,
  type CommercialMapQualityTier,
} from '../../utils/viewport';
import {
  bindCommercialMapScreen,
  collectCommercialMapRenderTargets,
  validateCommercialMapRenderTargets,
} from '../../utils/renderingPresentation';
import {
  COMMERCIAL_MAP_RENDER_RETRY_EVENT,
  publishCommercialMapRenderHealth,
} from '../../utils/renderingHealth';
import {
  beginCommercialMapRenderTiming,
  endCommercialMapRenderTiming,
  disposeCommercialMapRenderTiming,
} from '../../utils/renderingTiming';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import {
  openGroundTextureBundleForEntity,
  type OpenGroundSurfaceProfile,
} from './openGroundTextures';
import {
  applyTerrainMultiscaleDetail,
  resolveTerrainMultiscaleQualityOptions,
} from './terrainMaterial';
import { RegionalLandscapeLayer } from './RegionalLandscapeLayer';

interface CommercialMapEnvironmentProps {
  active?: boolean;
  extent: CommercialMapEnvironmentExtent;
  /**
   * Park-only box (no regional highways) that the shadow camera is fitted to.
   * Defaults to `extent` for callers that have no wider scene reach.
   */
  shadowExtent?: CommercialMapEnvironmentExtent;
  hydrologicalModeActive: boolean;
  reducedGraphics: boolean;
  adaptiveQualityTier?: CommercialMapQualityTier;
  nightMode?: boolean;
}

type EnvironmentPalette = typeof COMMERCIAL_MAP_ENVIRONMENT_CONFIG.palettes.normal
  | typeof COMMERCIAL_MAP_ENVIRONMENT_CONFIG.palettes.hydrological;

type SunriseSky = Sky & {
  material: THREE.ShaderMaterial & {
    uniforms: Record<string, THREE.IUniform>;
  };
};

type CelestialSun = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

const NO_RAYCAST = () => undefined;
const CELESTIAL_SUN_PLANE_NORMAL = new THREE.Vector3(0, 0, 1);
const ACTIVE_GROUND_PROFILE: Readonly<OpenGroundSurfaceProfile> = Object.freeze({
  surface: 'landscapeGrass',
  // A broader camera-safe tile keeps the 256px source detailed near the park
  // while avoiding a visible checkerboard at the responsive zoom-out limit.
  tileWorldSize: 48,
  baseColor: '#b8c9b0',
  roughness: 0.99,
});
const ACTIVE_GROUND_NORMAL_SCALE = new THREE.Vector2(0.12, 0.12);

function colorWithAlpha(hex: string, alpha: number) {
  const color = new THREE.Color(hex);
  return color.getStyle().replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
}

function createReflectionTexture(
  width: number,
  palette: EnvironmentPalette,
  sunDirection: THREE.Vector3,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.max(16, Math.floor(width / 2));
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const sunrise = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise;
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, sunrise.colors.finalZenith);
  gradient.addColorStop(0.4, sunrise.colors.finalUpper);
  gradient.addColorStop(0.53, sunrise.colors.finalHorizonCool);
  gradient.addColorStop(0.61, sunrise.colors.finalHorizon);
  gradient.addColorStop(0.72, palette.outerGroundNear);
  gradient.addColorStop(1, palette.outerGroundFar);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const longitude = Math.atan2(sunDirection.z, sunDirection.x);
  const sunX = ((longitude / (Math.PI * 2)) + 1) % 1 * canvas.width;
  const sunY = canvas.height * (0.5 - Math.asin(sunDirection.y) / Math.PI);
  const sunRadius = canvas.width * 0.085;
  const sunGlow = context.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
  sunGlow.addColorStop(0, colorWithAlpha(sunrise.colors.sunCore, 0.95));
  sunGlow.addColorStop(0.18, colorWithAlpha(sunrise.colors.sunEdge, 0.68));
  sunGlow.addColorStop(0.48, colorWithAlpha(sunrise.colors.corona, 0.2));
  sunGlow.addColorStop(1, colorWithAlpha(sunrise.colors.corona, 0));
  context.fillStyle = sunGlow;
  context.fillRect(sunX - sunRadius, sunY - sunRadius, sunRadius * 2, sunRadius * 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'CommercialMapStableSunriseReflection';
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createSky(
  scale: number,
  centerX: number,
  centerZ: number,
  initialFrame: CommercialMapSunriseFrame,
  mode: CommercialMapEnvironmentMode,
  palette: EnvironmentPalette,
  cloudOpacity: number,
) {
  const sky = new Sky() as SunriseSky;
  const material = sky.material;
  const sunrise = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise;
  sky.name = 'CommercialMapPhysicalSunriseSky';
  sky.scale.setScalar(scale);
  sky.position.set(centerX, 0, centerZ);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  material.depthWrite = false;
  material.uniforms.turbidity.value = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sky.turbidity
    + (mode === 'hydrological' ? 0.35 : 0);
  material.uniforms.rayleigh.value = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sky.rayleigh
    - (mode === 'hydrological' ? 0.3 : 0);
  material.uniforms.mieCoefficient.value = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sky.mieCoefficient;
  material.uniforms.mieDirectionalG.value = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sky.mieDirectionalG;
  material.uniforms.sunPosition.value.set(...initialFrame.direction);
  material.uniforms.sunriseProgress = { value: initialFrame.easedProgress };
  material.uniforms.preSunriseZenith = { value: new THREE.Color(sunrise.colors.preSunriseZenith) };
  material.uniforms.preSunriseUpper = { value: new THREE.Color(sunrise.colors.preSunriseUpper) };
  material.uniforms.preSunriseHorizon = { value: new THREE.Color(sunrise.colors.preSunriseHorizon) };
  material.uniforms.finalSunriseZenith = { value: new THREE.Color(sunrise.colors.finalZenith) };
  material.uniforms.finalSunriseUpper = { value: new THREE.Color(sunrise.colors.finalUpper) };
  material.uniforms.finalSunriseHorizon = { value: new THREE.Color(sunrise.colors.finalHorizon) };
  material.uniforms.finalSunriseHorizonCool = { value: new THREE.Color(sunrise.colors.finalHorizonCool) };
  material.uniforms.authoredCloudCool = { value: new THREE.Color(palette.cloud) };
  material.uniforms.authoredCloudShade = { value: new THREE.Color(palette.cloudShade) };
  material.uniforms.authoredCloudWarm = { value: new THREE.Color(sunrise.colors.warmCloud) };
  material.uniforms.authoredCloudOpacity = { value: cloudOpacity };
  material.uniforms.authoredGroundFar = {
    value: new THREE.Color(mode === 'hydrological' ? palette.activeGround : palette.outerGroundFar),
  };
  material.fragmentShader = material.fragmentShader
    .replace(
      'uniform vec3 up;',
      `uniform vec3 up;
      uniform float sunriseProgress;
      uniform vec3 preSunriseZenith;
      uniform vec3 preSunriseUpper;
      uniform vec3 preSunriseHorizon;
      uniform vec3 finalSunriseZenith;
      uniform vec3 finalSunriseUpper;
      uniform vec3 finalSunriseHorizon;
      uniform vec3 finalSunriseHorizonCool;
      uniform vec3 authoredCloudCool;
      uniform vec3 authoredCloudShade;
      uniform vec3 authoredCloudWarm;
      uniform float authoredCloudOpacity;
      uniform vec3 authoredGroundFar;`,
    )
    .replace(
      'gl_FragColor = vec4( retColor, 1.0 );',
      `float altitude = direction.y;
      float skyHeight = clamp(altitude * 1.35 + 0.018, 0.0, 1.0);
      vec3 preGradient = mix(
        preSunriseHorizon,
        preSunriseUpper,
        smoothstep(0.015, 0.4, skyHeight)
      );
      preGradient = mix(
        preGradient,
        preSunriseZenith,
        smoothstep(0.36, 0.96, skyHeight)
      );
      vec3 finalGradient = mix(
        finalSunriseHorizon,
        finalSunriseUpper,
        smoothstep(0.02, 0.42, skyHeight)
      );
      finalGradient = mix(
        finalGradient,
        finalSunriseZenith,
        smoothstep(0.4, 0.97, skyHeight)
      );
      finalGradient = mix(
        finalGradient,
        finalSunriseHorizonCool,
        exp(-abs(altitude) * 11.0) * 0.16
      );
      vec3 authoredSky = mix(preGradient, finalGradient, sunriseProgress);
      vec3 balancedPhysicalSky = retColor
        / (vec3(1.0) + max(retColor, vec3(0.0)) * 0.48);
      vec3 composedSky = mix(balancedPhysicalSky, authoredSky, 0.92);
      float cloudBand = smoothstep(0.018, 0.055, altitude)
        * (1.0 - smoothstep(0.22, 0.39, altitude));
      float cloudAzimuth = atan(direction.z, direction.x);
      float cloudStreakA = sin(cloudAzimuth * 7.0 + altitude * 31.0);
      float cloudStreakB = sin(cloudAzimuth * 13.0 - altitude * 47.0 + 1.7);
      float cloudStreakC = sin(cloudAzimuth * 3.0 + altitude * 19.0 - 0.8);
      float cloudField = cloudStreakA * 0.46 + cloudStreakB * 0.34 + cloudStreakC * 0.2;
      float cloudDensity = smoothstep(0.28, 0.72, cloudField)
        * cloudBand
        * authoredCloudOpacity;
      vec2 horizonDirection = normalize(direction.xz + vec2(0.0001));
      vec2 solarDirection = normalize(vSunDirection.xz + vec2(0.0001));
      float solarAlignment = pow(max(dot(horizonDirection, solarDirection), 0.0), 5.0);
      vec3 cloudColor = mix(authoredCloudShade, authoredCloudCool, 0.68 + altitude * 0.55);
      cloudColor = mix(
        cloudColor,
        authoredCloudWarm,
        sunriseProgress * solarAlignment * 0.72
      );
      composedSky = mix(composedSky, cloudColor, cloudDensity);
      vec3 lowerHorizon = mix(
        authoredGroundFar,
        authoredSky,
        smoothstep(-0.14, 0.012, altitude)
      );
      float belowHorizon = 1.0 - smoothstep(-0.075, 0.008, altitude);
      composedSky = mix(composedSky, lowerHorizon, belowHorizon);
      float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      gl_FragColor = vec4(max(composedSky + dither / 720.0, vec3(0.0)), 1.0);`,
    );
  // Mode changes uniforms only; both palettes intentionally share one program.
  material.customProgramCacheKey = () => 'commercial-map-camera-safe-sunrise-sky-v5';
  material.needsUpdate = true;
  return sky;
}

function createCelestialSun(
  sceneAnchor: THREE.Vector3,
  celestialDistance: number,
  initialFrame: CommercialMapSunriseFrame,
) {
  const sunrise = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise;
  const discRadiusRatio = Math.tan(THREE.MathUtils.degToRad(
    sunrise.apparentDiscDiameterDegrees / 2,
  )) / Math.tan(THREE.MathUtils.degToRad(sunrise.coronaDiameterDegrees / 2));
  const planeSize = celestialDistance * Math.tan(THREE.MathUtils.degToRad(
    sunrise.coronaDiameterDegrees / 2,
  )) * 2;
  const geometry = new THREE.PlaneGeometry(planeSize, planeSize, 1, 1);
  const material = new THREE.ShaderMaterial({
    name: 'CommercialMapCelestialSunMaterial',
    uniforms: {
      uSunriseProgress: { value: initialFrame.easedProgress },
      uRayStrength: { value: initialFrame.rayStrength },
      uDiscRadiusRatio: { value: discRadiusRatio },
      uSunCore: { value: new THREE.Color(sunrise.colors.sunCore) },
      uSunEdge: { value: new THREE.Color(sunrise.colors.sunEdge) },
      uCorona: { value: new THREE.Color(sunrise.colors.corona) },
      uRays: { value: new THREE.Color(sunrise.colors.rays) },
    },
    vertexShader: `
      varying vec2 vSunUv;
      void main() {
        vSunUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: `
      uniform float uSunriseProgress;
      uniform float uRayStrength;
      uniform float uDiscRadiusRatio;
      uniform vec3 uSunCore;
      uniform vec3 uSunEdge;
      uniform vec3 uCorona;
      uniform vec3 uRays;
      varying vec2 vSunUv;

      void main() {
        float radius = length(vSunUv);
        if (radius > 1.0) discard;
        float reveal = smoothstep(0.025, 0.16, uSunriseProgress);
        float disc = 1.0 - smoothstep(
          uDiscRadiusRatio * 0.84,
          uDiscRadiusRatio,
          radius
        );
        float core = 1.0 - smoothstep(
          0.0,
          uDiscRadiusRatio * 0.62,
          radius
        );
        float corona = exp(
          -max(radius - uDiscRadiusRatio * 0.66, 0.0) / 0.24
        ) * (1.0 - smoothstep(0.68, 1.0, radius));
        float rayRadius = length(vec2(vSunUv.x * 0.62, vSunUv.y * 1.28));
        float rayPattern = 0.72 + 0.28 * sin(atan(vSunUv.y, vSunUv.x) * 12.0);
        float rays = (1.0 - smoothstep(0.16, 1.0, rayRadius))
          * rayPattern
          * uRayStrength
          * 0.14;
        float alpha = clamp((disc + corona * 0.34 + rays * 0.28) * reveal, 0.0, 1.0);
        vec3 color = uCorona * corona * 0.72
          + uRays * rays
          + uSunEdge * disc * (2.2 + core * 0.72)
          + uSunCore * core * 3.55;
        gl_FragColor = vec4(color * reveal, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geometry, material) as CelestialSun;
  const initialDirection = new THREE.Vector3(...initialFrame.direction);
  mesh.name = 'CommercialMapWorldSpaceCelestialSun';
  mesh.position.copy(sceneAnchor).addScaledVector(initialDirection, celestialDistance);
  mesh.quaternion.setFromUnitVectors(
    CELESTIAL_SUN_PLANE_NORMAL,
    initialDirection.clone().multiplyScalar(-1),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -50;
  mesh.raycast = NO_RAYCAST;
  return mesh;
}

function updateCelestialSun(
  sun: CelestialSun,
  sceneAnchor: THREE.Vector3,
  celestialDistance: number,
  direction: THREE.Vector3,
  facingDirection: THREE.Vector3,
  frame: CommercialMapSunriseFrame,
) {
  sun.position.copy(sceneAnchor).addScaledVector(direction, celestialDistance);
  facingDirection.copy(direction).multiplyScalar(-1);
  sun.quaternion.setFromUnitVectors(CELESTIAL_SUN_PLANE_NORMAL, facingDirection);
  sun.material.uniforms.uSunriseProgress.value = frame.easedProgress;
  sun.material.uniforms.uRayStrength.value = frame.rayStrength;
}

function configureSunLight(
  target: THREE.Object3D,
  frustum: CommercialMapShadowFrustum,
  qualityTier: CommercialMapSunriseQualityTier,
) {
  const quality = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality[qualityTier];
  const light = new THREE.DirectionalLight(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.color, 0);
  light.name = 'CommercialMapAuthoritativeSunLight';
  light.target = target;
  light.castShadow = true;
  light.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  // Orthographic box fitted to the park only; see resolveCommercialMapShadowFrustum.
  light.shadow.camera.left = -frustum.halfWidth;
  light.shadow.camera.right = frustum.halfWidth;
  light.shadow.camera.top = frustum.halfHeight;
  light.shadow.camera.bottom = -frustum.halfHeight;
  light.shadow.camera.near = frustum.near;
  light.shadow.camera.far = frustum.far;
  light.shadow.camera.updateProjectionMatrix();
  // Tight near/far keeps depth precision high. Bias is in
  // COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar — retuned for 0.15 units/metre
  // so PCF contact on pavilions/trees reads without acne or peter-pan.
  light.shadow.bias = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.shadowBias;
  light.shadow.normalBias = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.shadowNormalBias;
  light.shadow.radius = resolveShadowRadiusTexels(3, quality.shadowMapSize);
  return light;
}

/** shadow.radius is in texels for PCFShadowMap; keep world softness constant. */
function resolveShadowRadiusTexels(radiusAt2048: number, shadowMapSize: number) {
  return Math.max(1, radiusAt2048 * (shadowMapSize / 2048));
}

function updateSkyFrame(sky: SunriseSky, frame: CommercialMapSunriseFrame) {
  const material = sky.material;
  (material.uniforms.sunPosition.value as THREE.Vector3).set(...frame.direction);
  material.uniforms.sunriseProgress.value = frame.easedProgress;
}

/** Mode is presentation state, not the lifetime of skies or PMREM inputs. */
// eslint-disable-next-line react-refresh/only-export-components -- Isolated hook export makes the actual resource lifetime regression-testable.
export function useCommercialMapAtmosphereResources({
  initialFrame,
  mode,
  palette,
  cloudOpacity,
  skyScale,
  centerX,
  centerZ,
  visualSunDistance,
  reflectionTextureWidth,
}: {
  initialFrame: CommercialMapSunriseFrame;
  mode: CommercialMapEnvironmentMode;
  palette: EnvironmentPalette;
  cloudOpacity: number;
  skyScale: number;
  centerX: number;
  centerZ: number;
  visualSunDistance: number;
  reflectionTextureWidth: number;
}) {
  const initial = useRef({ initialFrame, mode, palette, cloudOpacity }).current;
  const sky = useMemo(() => createSky(
    1, 0, 0, initial.initialFrame, initial.mode, initial.palette, initial.cloudOpacity,
  ), [initial]);
  // Unit-size geometry scales with the current scene envelope; mode/resize
  // never replaces the material and drops its cached shader program.
  const celestialSun = useMemo(
    () => createCelestialSun(new THREE.Vector3(), 1, initial.initialFrame),
    [initial],
  );
  // Keep both authored palettes and both quality inputs alive. Updating or
  // disposing them on a mode/tier switch invalidates Three's cached PMREM
  // targets and used to rebuild its LOD geometries on every quality cycle.
  const reflectionTextures = useMemo(() => ({
    normal: {
      full: createReflectionTexture(
        COMMERCIAL_MAP_ENVIRONMENT_CONFIG.reflections.fullTextureWidth,
        COMMERCIAL_MAP_ENVIRONMENT_CONFIG.palettes.normal,
        new THREE.Vector3(...resolveCommercialMapSunriseFrame(1, 'normal').direction),
      ),
      reduced: createReflectionTexture(
        COMMERCIAL_MAP_ENVIRONMENT_CONFIG.reflections.reducedTextureWidth,
        COMMERCIAL_MAP_ENVIRONMENT_CONFIG.palettes.normal,
        new THREE.Vector3(...resolveCommercialMapSunriseFrame(1, 'normal').direction),
      ),
    },
    hydrological: {
      full: createReflectionTexture(
        COMMERCIAL_MAP_ENVIRONMENT_CONFIG.reflections.fullTextureWidth,
        COMMERCIAL_MAP_ENVIRONMENT_CONFIG.palettes.hydrological,
        new THREE.Vector3(...resolveCommercialMapSunriseFrame(1, 'hydrological').direction),
      ),
      reduced: createReflectionTexture(
        COMMERCIAL_MAP_ENVIRONMENT_CONFIG.reflections.reducedTextureWidth,
        COMMERCIAL_MAP_ENVIRONMENT_CONFIG.palettes.hydrological,
        new THREE.Vector3(...resolveCommercialMapSunriseFrame(1, 'hydrological').direction),
      ),
    },
  }), []);
  const reflectionTier = reflectionTextureWidth
    <= COMMERCIAL_MAP_ENVIRONMENT_CONFIG.reflections.reducedTextureWidth ? 'reduced' : 'full';

  useLayoutEffect(() => {
    sky.scale.setScalar(skyScale);
    sky.position.set(centerX, 0, centerZ);
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sky.turbidity
      + (mode === 'hydrological' ? 0.35 : 0);
    uniforms.rayleigh.value = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sky.rayleigh
      - (mode === 'hydrological' ? 0.3 : 0);
    (uniforms.authoredCloudCool.value as THREE.Color).set(palette.cloud);
    (uniforms.authoredCloudShade.value as THREE.Color).set(palette.cloudShade);
    uniforms.authoredCloudOpacity.value = cloudOpacity;
    (uniforms.authoredGroundFar.value as THREE.Color).set(
      mode === 'hydrological' ? palette.activeGround : palette.outerGroundFar,
    );
    celestialSun.scale.setScalar(visualSunDistance);
  }, [celestialSun, centerX, centerZ, cloudOpacity, mode, palette, sky, skyScale, visualSunDistance]);

  useEffect(() => () => {
    Object.values(reflectionTextures).forEach((textures) => {
      textures.full.dispose();
      textures.reduced.dispose();
    });
  }, [reflectionTextures]);
  useEffect(() => () => {
    sky.geometry.dispose();
    sky.material.dispose();
    celestialSun.geometry.dispose();
    celestialSun.material.dispose();
  }, [celestialSun, sky]);

  return { sky, celestialSun, reflectionTexture: reflectionTextures[mode][reflectionTier] };
}

/**
 * Five-tap unsharp mask that runs after SMAA in its own pass (two convolution
 * effects cannot share an EffectPass). Strength is deliberately tiny: it only
 * returns the edge contrast SMAA ULTRA blends away, never a haloed "sharpen".
 */
class CommercialMapSharpenEffect extends Effect {
  constructor(strength: number) {
    super(
      'CommercialMapSharpenEffect',
      `uniform float uSharpenStrength;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 north = texture2D(inputBuffer, uv + vec2(0.0, texelSize.y)).rgb;
        vec3 south = texture2D(inputBuffer, uv - vec2(0.0, texelSize.y)).rgb;
        vec3 east = texture2D(inputBuffer, uv + vec2(texelSize.x, 0.0)).rgb;
        vec3 west = texture2D(inputBuffer, uv - vec2(texelSize.x, 0.0)).rgb;
        vec3 blurred = (north + south + east + west) * 0.25;
        vec3 sharpened = inputColor.rgb + (inputColor.rgb - blurred) * uSharpenStrength;
        outputColor = vec4(clamp(sharpened, 0.0, 1.0), inputColor.a);
      }`,
      {
        attributes: EffectAttribute.CONVOLUTION,
        uniforms: new Map<string, THREE.Uniform>([
          ['uSharpenStrength', new THREE.Uniform(THREE.MathUtils.clamp(strength, 0, 0.6))],
        ]),
      },
    );
  }

  setStrength(strength: number) {
    const uniform = this.uniforms.get('uSharpenStrength');
    if (uniform) uniform.value = THREE.MathUtils.clamp(strength, 0, 0.6);
  }
}

/** The installed React wrapper removes, but does not dispose, EffectPasses when
 * its JSX children change. Own this fixed stack so active-scene changes never
 * recreate passes, attach duplicate effect listeners, or retire render targets.
 */
function createCommercialMapPostProcessing(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
) {
  const previousAutoClear = gl.autoClear;
  const composer = new EffectComposer(gl, {
    multisampling: 0,
    frameBufferType: THREE.HalfFloatType,
  });
  // EffectComposer's constructor changes this global renderer setting. It is
  // needed only during our render pass, never while the interior renders direct.
  gl.autoClear = previousAutoClear;
  const bloom = new BloomEffect({
    blendFunction: BlendFunction.ADD,
    intensity: 0.58,
    luminanceThreshold: 3.2,
    luminanceSmoothing: 0.16,
    mipmapBlur: true,
    // Keep the authored full-quality glow at rest. Interaction frames bypass
    // this persistent stack, so these levels never tax orbit/pan/zoom.
    levels: COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality.full.bloomLevels,
  });
  const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  // Renderer MSAA only affects the default framebuffer. The exterior renders
  // through an HDR target, so it needs its own edge resolve. SMAA keeps roof,
  // road and parking lines stable without TAA ghosting during pan/selection.
  const smaa = new SMAAEffect({
    // A single program variant prevents HIGH <-> ULTRA shader recompiles.
    preset: SMAAPreset.ULTRA,
  });
  const sharpen = new CommercialMapSharpenEffect(0);
  const renderPass = new RenderPass(scene, camera);
  // SMAA must see the final tone-mapped image. Keeping it in the same
  // EffectPass would let postprocessing sort the convolution effect ahead of
  // Bloom/ACES, which weakens edge detection on HDR values.
  const effectPass = new EffectPass(camera, bloom, toneMapping);
  const smaaPass = new EffectPass(camera, smaa);
  const sharpenPass = new EffectPass(camera, sharpen);
  sharpenPass.enabled = false;
  composer.addPass(renderPass);
  composer.addPass(effectPass);
  composer.addPass(smaaPass);
  // Keep the pass allocated across tiers. Toggling `enabled` changes neither
  // the composer's targets nor effect listeners.
  composer.addPass(sharpenPass);
  // autoRenderToScreen selects the last *added* pass, including disabled
  // passes. A dormant sharpen used to leave balanced/mobile with no output.
  composer.autoRenderToScreen = false;
  smaaPass.renderToScreen = true;
  sharpenPass.renderToScreen = false;
  let disposed = false;
  let selectionShadersPrepared = false;
  return {
    composer,
    bloom,
    toneMapping,
    smaa,
    setSharpenStrength: (strength: number) => {
      sharpen.setStrength(strength);
      sharpenPass.enabled = strength > 0;
      smaaPass.renderToScreen = !sharpenPass.enabled;
      sharpenPass.renderToScreen = sharpenPass.enabled;
    },
    hasScreenOutput: () => composer.passes.filter((pass) => pass.enabled && pass.renderToScreen).length === 1,
    validateTargets: () => validateCommercialMapRenderTargets(gl, collectCommercialMapRenderTargets([
      composer.inputBuffer, composer.outputBuffer, composer.passes,
    ])),
    prepareSelectionShaders: () => {
      if (selectionShadersPrepared) return;
      const highlights = scene.getObjectByName('commercial-map-selection-shader-warmup');
      if (!highlights) return;
      selectionShadersPrepared = true;
      const previousTarget = gl.getRenderTarget();
      const previousFace = gl.getActiveCubeFace();
      const previousLevel = gl.getActiveMipmapLevel();
      try {
        // Preload's default-framebuffer compile uses sRGB output, whereas the
        // exterior RenderPass writes linear HDR into this actual shared target.
        // Compile only the four highlight probes with the live scene's lights
        // and fog, without rendering a frame or changing shared materials.
        gl.setRenderTarget(composer.inputBuffer);
        gl.compile(highlights, camera, scene);
      } catch (error) {
        // Optional precompilation must never take the persistent map down.
        if (import.meta.env.DEV) {
          gl.domElement.dataset.commercialMapSelectionShaderWarmupError = error instanceof Error
            ? error.message
            : String(error);
        }
      } finally {
        gl.setRenderTarget(previousTarget, previousFace, previousLevel);
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      // This stack exclusively owns its effects, passes, and render targets.
      // There are no R3F effect children that can dispose them a second time.
      composer.dispose();
    },
  };
}

export function SunrisePostProcessing({
  qualityTier,
  enabled,
  interactionActive = false,
}: {
  qualityTier: CommercialMapSunriseQualityTier;
  enabled: boolean;
  interactionActive?: boolean;
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  // Adaptive quality changes the pixel ratio without changing `size`; the
  // composer sizes its HDR targets from the drawing buffer, so it must follow.
  const pixelRatio = useThree((state) => state.viewport?.dpr ?? 1);
  const invalidate = useThree((state) => state.invalidate);
  const quality = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality[qualityTier];
  const pipeline = useRef<ReturnType<typeof createCommercialMapPostProcessing> | null>(null);
  const rendererState = useRef({ autoClear: gl.autoClear, toneMapping: gl.toneMapping });
  const lost = useRef(false);
  const postFailed = useRef(false);
  const rendererFailed = useRef(false);
  const automaticRecoveryUsed = useRef(false);
  const directRetryUsed = useRef(false);
  const directShaderFailed = useRef(false);
  const renderingFrame = useRef(false);
  const cachedShaderFailed = useRef(false);
  const manualContextResetPending = useRef(false);
  const lastErrorCode = useRef<string | null>(null);
  const presentedFrames = useRef(0);
  const contextLosses = useRef(0);
  const sizedBuffer = useRef('');
  const drawingBuffer = useRef(new THREE.Vector2());
  const [contextEpoch, setContextEpoch] = useState(0);

  const observeContextLoss = useCallback(() => {
    // isContextLost() can turn true during a draw before the browser delivers
    // its DOM event. Both paths observe the same loss, never two failures.
    if (lost.current) return;
    lost.current = true;
    contextLosses.current += 1;
    lastErrorCode.current = 'context-lost';
    publishCommercialMapRenderHealth(gl.domElement, {
      status: 'context-lost', path: 'suspended', presentedFrames: presentedFrames.current,
      contextLosses: contextLosses.current, lastErrorCode: lastErrorCode.current,
    });
  }, [gl]);

  useLayoutEffect(() => {
    const previous = { autoClear: gl.autoClear, toneMapping: gl.toneMapping };
    rendererState.current = previous;
    return () => {
      gl.autoClear = previous.autoClear;
      gl.toneMapping = previous.toneMapping;
      if (import.meta.env.DEV) disposeCommercialMapRenderTiming(gl);
    };
  }, [gl]);

  useLayoutEffect(() => {
    const previousShaderError = gl.debug.onShaderError;
    const observeShaderError: NonNullable<typeof gl.debug.onShaderError> = (...args) => {
      if (!renderingFrame.current) {
        // Preload is a later scene sibling and renders a cube in its layout
        // effect. Three reports a failed program only on first use, so retain
        // failures from that warmup before a later frame reuses the cache.
        cachedShaderFailed.current = true;
        invalidate();
      }
      previousShaderError?.(...args);
    };
    gl.debug.onShaderError = observeShaderError;
    return () => {
      if (gl.debug.onShaderError === observeShaderError) gl.debug.onShaderError = previousShaderError;
    };
  }, [gl, invalidate]);

  useEffect(() => {
    const canvas = gl.domElement;
    // Query while healthy: getExtension may return null after genuine context
    // loss, so a late forceContextRestore() alone can silently do nothing.
    let contextRestorer = gl.getContext().isContextLost()
      ? null : gl.getContext().getExtension('WEBGL_lose_context');
    const requestContextRestoration = () => {
      if (contextRestorer) contextRestorer.restoreContext();
      else gl.forceContextRestore();
    };
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    let manualRestoreTimer: ReturnType<typeof setTimeout> | undefined;
    const report = (status: 'context-lost' | 'recovering' | 'failed') => publishCommercialMapRenderHealth(canvas, {
      status, path: 'suspended', presentedFrames: presentedFrames.current,
      contextLosses: contextLosses.current, lastErrorCode: lastErrorCode.current,
    });
    const awaitRestoration = () => {
      clearTimeout(recoveryTimer);
      recoveryTimer = setTimeout(() => {
        if (!lost.current && !manualContextResetPending.current) return;
        manualContextResetPending.current = false;
        lastErrorCode.current = 'context-restore-timeout';
        report('failed');
      }, 5000);
    };
    const handleLost = () => {
      // No draw/dispose/allocation calls while the browser owns restoration.
      observeContextLoss();
      awaitRestoration();
      if (manualContextResetPending.current) {
        manualContextResetPending.current = false;
        // Only an explicit retry of a cached broken shader requests this
        // context cycle. Restoration must follow delivery of the loss event.
        manualRestoreTimer = setTimeout(requestContextRestoration, 0);
      }
    };
    const handleRestored = () => {
      clearTimeout(recoveryTimer);
      lost.current = false;
      contextRestorer = gl.getContext().getExtension('WEBGL_lose_context');
      // Demand-rendered shadows are frozen between scene changes. Their
      // targets lose GPU contents with the context even though light/target
      // objects survive; redraw them before the first recovered screen frame.
      gl.shadowMap.needsUpdate = true;
      scene.traverse((object) => {
        const shadow = (object as THREE.Light & { shadow?: THREE.LightShadow }).shadow;
        if (shadow) shadow.needsUpdate = true;
      });
      rendererFailed.current = false;
      directRetryUsed.current = false;
      directShaderFailed.current = false;
      cachedShaderFailed.current = false;
      manualContextResetPending.current = false;
      // Repeated driver loss must not create an endless HDR rebuild loop.
      postFailed.current = automaticRecoveryUsed.current;
      automaticRecoveryUsed.current = true;
      lastErrorCode.current = postFailed.current ? 'repeated-context-loss' : null;
      setContextEpoch((epoch) => epoch + 1);
      invalidate();
    };
    const handleRetry = () => {
      report('recovering');
      if (directShaderFailed.current && !lost.current && !gl.getContext().isContextLost()) {
        // resetState leaves non-runnable programs cached. A user-requested
        // context restoration clears those programs without replacing scene,
        // camera, controls or selection. No automatic retry loop is allowed.
        manualContextResetPending.current = true;
        automaticRecoveryUsed.current = false;
        gl.forceContextLoss();
        awaitRestoration();
        return;
      }
      automaticRecoveryUsed.current = false;
      directRetryUsed.current = false;
      rendererFailed.current = false;
      postFailed.current = false;
      lastErrorCode.current = null;
      if (lost.current || gl.getContext().isContextLost()) {
        observeContextLoss();
        requestContextRestoration();
        awaitRestoration();
      } else {
        gl.resetState();
        setContextEpoch((epoch) => epoch + 1);
        invalidate();
      }
    };
    canvas.addEventListener('webglcontextlost', handleLost);
    canvas.addEventListener('webglcontextrestored', handleRestored);
    canvas.addEventListener(COMMERCIAL_MAP_RENDER_RETRY_EVENT, handleRetry);
    return () => {
      clearTimeout(recoveryTimer);
      clearTimeout(manualRestoreTimer);
      canvas.removeEventListener('webglcontextlost', handleLost);
      canvas.removeEventListener('webglcontextrestored', handleRestored);
      canvas.removeEventListener(COMMERCIAL_MAP_RENDER_RETRY_EVENT, handleRetry);
    };
  }, [gl, invalidate, observeContextLoss, scene]);

  useLayoutEffect(() => {
    if (!quality.bloomEnabled || pipeline.current || lost.current || postFailed.current) return;
    let next: ReturnType<typeof createCommercialMapPostProcessing> | null = null;
    try {
      next = createCommercialMapPostProcessing(
        gl,
        scene,
        camera,
      );
    } catch (error) {
      // Some mobile drivers reject half-float render targets. The map remains
      // functional with the renderer ACES/MSAA path instead of going blank.
      if (import.meta.env.DEV) {
        gl.domElement.dataset.commercialMapPostProcessingError = error instanceof Error
          ? error.message
          : String(error);
      }
      pipeline.current = null;
      postFailed.current = true;
      lastErrorCode.current = 'post-initialization-failed';
      gl.toneMapping = rendererState.current.toneMapping;
      invalidate();
      return;
    }
    pipeline.current = next;
    sizedBuffer.current = '';
    invalidate();
  }, [
    camera,
    gl,
    invalidate,
    quality.bloomEnabled,
    scene,
    contextEpoch,
  ]);

  useLayoutEffect(() => () => {
    const current = pipeline.current;
    pipeline.current = null;
    if (!lost.current) current?.dispose();
  }, [camera, gl, scene, contextEpoch]);

  useLayoutEffect(() => {
    pipeline.current?.setSharpenStrength(quality.sharpenStrength);
    invalidate();
  }, [contextEpoch, invalidate, quality.sharpenStrength]);

  useLayoutEffect(() => {
    // Actual target resize/validation happens at frame start, after R3F has
    // applied the sole DPR controller's drawing-buffer update.
    invalidate();
  }, [enabled, interactionActive, invalidate, pixelRatio, quality.bloomEnabled, size.height, size.width]);

  useFrame((_state, delta) => {
    // One stable frame owner across modes. Changing a useFrame priority at a
    // gesture boundary used to hand the default renderer a retained HDR target.
    const contextIsLost = () => {
      if (!lost.current && !gl.getContext().isContextLost()) return false;
      observeContextLoss();
      return true;
    };
    if (contextIsLost() || rendererFailed.current) return;
    if (cachedShaderFailed.current) {
      // The warmup's render path is unknown and its broken program may be
      // shared with direct rendering. Only a context reset can safely clear
      // that cache; never count an apparently successful reuse as an image.
      directShaderFailed.current = true;
      rendererFailed.current = true;
      lastErrorCode.current = 'cached-shader-failed';
      publishCommercialMapRenderHealth(gl.domElement, {
        status: 'failed', path: 'suspended', presentedFrames: presentedFrames.current,
        contextLosses: contextLosses.current, lastErrorCode: lastErrorCode.current,
      });
      return;
    }
    const renderTiming = import.meta.env.DEV ? beginCommercialMapRenderTiming(gl) : null;
    renderingFrame.current = true;
    const previousAutoClear = gl.autoClear;
    const previousShaderError = gl.debug.onShaderError;
    let shaderFailed = false;
    gl.debug.onShaderError = (...args) => {
      shaderFailed = true;
      previousShaderError?.(...args);
    };
    gl.autoClear = true;
    let path: 'post' | 'direct' = 'direct';
    const direct = () => {
      if (contextIsLost()) throw new Error('context-lost');
      if (directShaderFailed.current) throw new Error('direct-shader-failed');
      bindCommercialMapScreen(gl, size.width, size.height);
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      shaderFailed = false;
      gl.render(scene, camera);
      if (contextIsLost()) throw new Error('context-lost');
      if (shaderFailed) {
        directShaderFailed.current = true;
        throw new Error('direct-shader-failed');
      }
    };
    try {
      const current = pipeline.current;
      if (enabled && !interactionActive && quality.bloomEnabled && current && !postFailed.current) {
        try {
          bindCommercialMapScreen(gl, size.width, size.height);
          gl.toneMapping = THREE.NoToneMapping;
          const buffer = gl.getDrawingBufferSize(drawingBuffer.current);
          const signature = `${size.width}:${size.height}:${buffer.x}:${buffer.y}`;
          if (signature !== sizedBuffer.current) {
            current.composer.setSize(size.width, size.height);
            current.validateTargets();
            if (contextIsLost()) return;
            sizedBuffer.current = signature;
            bindCommercialMapScreen(gl, size.width, size.height);
          }
          if (!current.hasScreenOutput()) throw new Error('missing-screen-output');
          current.prepareSelectionShaders();
          if (contextIsLost()) return;
          current.composer.render(delta);
          if (contextIsLost()) return;
          if (shaderFailed) throw new Error('post-shader-failed');
          if (gl.getRenderTarget() !== null) throw new Error('retained-render-target');
          path = 'post';
        } catch (error) {
          if (contextIsLost()) return;
          postFailed.current = true;
          lastErrorCode.current = error instanceof Error ? error.message : 'post-render-failed';
          // Unbind before retirement; never render a fallback into that target.
          bindCommercialMapScreen(gl, size.width, size.height);
          if (contextIsLost()) return;
          pipeline.current = null;
          try { current.dispose(); } catch { /* Keep the direct path available. */ }
          direct();
        }
      } else {
        direct();
      }
      if (contextIsLost()) return;
      presentedFrames.current += 1;
    } catch (error) {
      if (contextIsLost()) return;
      lastErrorCode.current = error instanceof Error ? error.message : 'renderer-failed';
      // At most one direct retry; never loop, reload the app, or reset its camera.
      try {
        // resetState cannot repair a cached, non-runnable shader program.
        if (directRetryUsed.current || lastErrorCode.current === 'direct-shader-failed') throw error;
        directRetryUsed.current = true;
        gl.resetState();
        direct();
        if (contextIsLost()) return;
        presentedFrames.current += 1;
      } catch {
        if (contextIsLost()) return;
        rendererFailed.current = true;
      }
    } finally {
      renderingFrame.current = false;
      const suspended = contextIsLost();
      if (!suspended) bindCommercialMapScreen(gl, size.width, size.height);
      gl.debug.onShaderError = previousShaderError;
      gl.autoClear = previousAutoClear;
      gl.toneMapping = rendererState.current.toneMapping;
      if (import.meta.env.DEV) endCommercialMapRenderTiming(renderTiming, path, !suspended && !rendererFailed.current);
      if (!suspended) publishCommercialMapRenderHealth(gl.domElement, {
        status: rendererFailed.current ? 'failed' : postFailed.current ? 'degraded' : 'ready',
        path: rendererFailed.current ? 'suspended' : path,
        presentedFrames: presentedFrames.current,
        contextLosses: contextLosses.current,
        lastErrorCode: lastErrorCode.current,
      });
    }
  }, 1);

  return null;
}

/** Acquire scene globals after all R3F attach/detach mutations have finished. */
export function CommercialMapSceneEnvironment({
  active,
  background,
  fog,
  reflectionTexture,
  environmentIntensity,
}: {
  active: boolean;
  background: THREE.Color;
  fog: THREE.Fog;
  reflectionTexture: THREE.Texture;
  environmentIntensity: number;
}) {
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    if (!active) return;
    const previousBackground = scene.background;
    const previousFog = scene.fog;
    const previousEnvironment = scene.environment;
    const previousEnvironmentIntensity = scene.environmentIntensity;
    scene.background = background;
    scene.fog = fog;
    scene.environment = reflectionTexture;
    scene.environmentIntensity = environmentIntensity;
    invalidate();

    return () => {
      // An interior may already own a field when this layout cleanup runs.
      // Never let the departing exterior overwrite the new scene owner.
      if (scene.background === background) scene.background = previousBackground;
      if (scene.fog === fog) scene.fog = previousFog;
      if (scene.environment === reflectionTexture) {
        scene.environment = previousEnvironment;
        scene.environmentIntensity = previousEnvironmentIntensity;
      }
    };
  }, [active, background, environmentIntensity, fog, invalidate, reflectionTexture, scene]);

  return null;
}

export const CommercialMapEnvironment = memo(function CommercialMapEnvironment({
  active = true,
  extent,
  shadowExtent = extent,
  hydrologicalModeActive,
  reducedGraphics,
  adaptiveQualityTier = 'HIGH',
  nightMode = false,
}: CommercialMapEnvironmentProps) {
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const maximumAnisotropy = gl.capabilities.getMaxAnisotropy();
  const sunrisePhase = useCommercialMapStore((state) => state.sunrisePhase);
  const sunriseSequence = useCommercialMapStore((state) => state.sunriseSequence);
  const sunriseStartedAt = useCommercialMapStore((state) => state.sunriseStartedAt);
  const requestSunrise = useCommercialMapStore((state) => state.requestSunrise);
  const cameraNavigating = useCommercialMapStore((state) => state.cameraNavigating);
  const mode: CommercialMapEnvironmentMode = hydrologicalModeActive ? 'hydrological' : 'normal';
  const palette = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.palettes[mode];
  const initialQualityTier = useRef<CommercialMapSunriseQualityTier | undefined>(undefined);
  if (!initialQualityTier.current) {
    const device = typeof navigator === 'undefined'
      ? undefined
      : navigator as Navigator & { deviceMemory?: number };
    initialQualityTier.current = resolveCommercialMapSunriseQualityTier({
      reducedGraphics,
      viewportWidth: size.width,
      viewportHeight: size.height,
      deviceMemory: device?.deviceMemory,
      hardwareConcurrency: device?.hardwareConcurrency,
    });
  }
  const adaptiveEnvironmentTier = resolveCommercialMapEnvironmentQualityTier(adaptiveQualityTier);
  const initialEnvironmentTier = initialQualityTier.current ?? 'balanced';
  const qualityOrder: readonly CommercialMapSunriseQualityTier[] = [
    'reduced',
    'balanced',
    'full',
  ];
  const qualityTier: CommercialMapSunriseQualityTier = reducedGraphics
    ? 'reduced'
    : qualityOrder[Math.min(
        qualityOrder.indexOf(initialEnvironmentTier),
        qualityOrder.indexOf(adaptiveEnvironmentTier),
      )];
  const quality = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality[qualityTier];
  const cameraDistanceBounds = useMemo(
    () => resolveCommercialMapCameraDistanceBounds({
      bounds: extent,
      verticalFovDegrees: camera instanceof THREE.PerspectiveCamera ? camera.fov : 38,
      aspect: size.width / Math.max(size.height, 1),
    }),
    [camera, extent, size.height, size.width],
  );
  const layout = useMemo(
    () => resolveCommercialMapEnvironmentLayout(
      extent,
      mode,
      qualityTier,
      cameraDistanceBounds.maxDistance,
    ),
    [cameraDistanceBounds.maxDistance, extent, mode, qualityTier],
  );
  const cloudOpacity = hydrologicalModeActive
    ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.hydrologicalOpacity
    : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.opacity;
  const initialSunriseProgress = useRef(sunrisePhase === 'complete' ? 1 : 0);
  const initialFrame = useMemo(
    () => resolveCommercialMapSunriseFrame(initialSunriseProgress.current, mode),
    [mode],
  );
  const sceneAnchor = useMemo(
    () => new THREE.Vector3(extent.centerX, 0, extent.centerZ),
    [extent.centerX, extent.centerZ],
  );
  const horizonTarget = useMemo(
    () => sceneAnchor.clone().addScaledVector(
      new THREE.Vector3(...COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.horizonDirection),
      layout.visualSunDistance,
    ),
    [layout.visualSunDistance, sceneAnchor],
  );
  const shadowFrustum = useMemo(
    () => resolveCommercialMapShadowFrustum(shadowExtent),
    [shadowExtent],
  );
  const shadowAnchor = useMemo(
    () => new THREE.Vector3(shadowFrustum.anchor[0], 0, shadowFrustum.anchor[1]),
    [shadowFrustum.anchor],
  );
  const sunTarget = useMemo(() => {
    const target = new THREE.Object3D();
    target.name = 'CommercialMapSolarTarget';
    target.position.copy(shadowAnchor);
    return target;
  }, [shadowAnchor]);
  const sunLight = useMemo(
    () => configureSunLight(sunTarget, shadowFrustum, qualityTier),
    [qualityTier, shadowFrustum, sunTarget],
  );
  const activeGroundTextures = useMemo(() => {
    const repeatX = layout.outerGroundSize / ACTIVE_GROUND_PROFILE.tileWorldSize;
    const repeatY = layout.outerGroundSize / ACTIVE_GROUND_PROFILE.tileWorldSize;
    // PlaneGeometry has normalized UVs. Include its final transform in the
    // pool key so no later mutation can affect another PBR surface handle.
    return openGroundTextureBundleForEntity(ACTIVE_GROUND_PROFILE, maximumAnisotropy, {
      wrapS: THREE.MirroredRepeatWrapping,
      wrapT: THREE.MirroredRepeatWrapping,
      repeat: [repeatX, repeatY],
    });
  }, [layout.outerGroundSize, maximumAnisotropy]);
  const normalGroundMaterial = useMemo(() => {
    const createBaseMaterial = () => new THREE.MeshStandardMaterial({
      name: 'CommercialMapOuterGroundMaterial',
      color: COMMERCIAL_MAP_ENVIRONMENT_CONFIG.palettes.normal.activeGround,
      map: activeGroundTextures.map,
      normalMap: activeGroundTextures.normalMap,
      normalScale: ACTIVE_GROUND_NORMAL_SCALE,
      roughnessMap: activeGroundTextures.roughnessMap,
      roughness: 0.98,
      metalness: 0,
      envMapIntensity: 0.12,
    });
    const material = createBaseMaterial();
    const terrainDetail = resolveTerrainMultiscaleQualityOptions(
      initialQualityTier.current as CommercialMapSunriseQualityTier,
      cameraDistanceBounds.maxDistance,
      [extent.centerX, extent.centerZ],
    );
    if (!terrainDetail) return material;

    try {
      return applyTerrainMultiscaleDetail(material, terrainDetail);
    } catch (error) {
      // Shader customization is presentation-only. A driver/library mismatch
      // must retain the original opaque PBR terrain instead of losing Canvas.
      material.dispose();
      if (import.meta.env.DEV) {
        gl.domElement.dataset.commercialMapTerrainMaterialError = error instanceof Error
          ? error.message
          : String(error);
      }
      return createBaseMaterial();
    }
  }, [
    activeGroundTextures,
    cameraDistanceBounds.maxDistance,
    extent.centerX,
    extent.centerZ,
    gl,
  ]);
  const hydrologicalGroundMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    name: 'CommercialMapHydrologicalOuterGroundMaterial',
    color: COMMERCIAL_MAP_ENVIRONMENT_CONFIG.palettes.hydrological.activeGround,
    roughness: 0.98,
    metalness: 0,
    envMapIntensity: 0.08,
  }), []);
  const activeGroundMaterial = hydrologicalModeActive
    ? hydrologicalGroundMaterial
    : normalGroundMaterial;
  useLayoutEffect(() => {
    const terrainDetail = resolveTerrainMultiscaleQualityOptions(
      qualityTier,
      cameraDistanceBounds.maxDistance,
      [extent.centerX, extent.centerZ],
    );
    if (!terrainDetail) return;
    try {
      applyTerrainMultiscaleDetail(normalGroundMaterial, terrainDetail);
    } catch {
      // The installed program stays; compile already kept a PBR fallback.
    }
  }, [
    cameraDistanceBounds.maxDistance,
    extent.centerX,
    extent.centerZ,
    normalGroundMaterial,
    qualityTier,
  ]);
  const reflectionTextureWidth = qualityTier === 'reduced'
    ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.reflections.reducedTextureWidth
    : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.reflections.fullTextureWidth;
  const { sky, celestialSun, reflectionTexture } = useCommercialMapAtmosphereResources({
    initialFrame, mode, palette, cloudOpacity,
    skyScale: layout.skyScale,
    centerX: extent.centerX,
    centerZ: extent.centerZ,
    visualSunDistance: layout.visualSunDistance,
    reflectionTextureWidth,
  });
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemisphereRef = useRef<THREE.HemisphereLight>(null);
  const outerGroundRef = useRef<THREE.Mesh>(null);
  const timeline = useRef({
    sequence: -1,
    lastAppliedProgress: -1,
    lastShadowUpdateAt: Number.NEGATIVE_INFINITY,
    lastDiagnosticBucket: -1,
    lastCameraSignature: '',
  });
  const frameDirection = useMemo(() => new THREE.Vector3(), []);
  const sunFacingDirection = useMemo(() => new THREE.Vector3(), []);
  const projectedSunPosition = useMemo(() => new THREE.Vector3(), []);
  const cameraWorldPosition = useMemo(() => new THREE.Vector3(), []);
  const cameraForward = useMemo(() => new THREE.Vector3(), []);
  const sunWorldScratch = useMemo(() => new THREE.Vector3(), []);
  const fogColor = useMemo(() => new THREE.Color(), []);
  const preSunriseFog = useMemo(
    () => new THREE.Color(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.colors.preSunriseHorizon),
    [],
  );
  const finalSunriseFog = useMemo(
    () => new THREE.Color(mode === 'hydrological'
      ? palette.horizon
      : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.colors.finalHorizonCool),
    [mode, palette.horizon],
  );
  const background = useMemo(
    () => new THREE.Color(nightMode ? '#050916' : palette.fallback),
    [nightMode, palette.fallback],
  );
  const fog = useMemo(() => new THREE.Fog(preSunriseFog, 0, 1), [preSunriseFog]);
  const nightFog = useMemo(() => new THREE.Color('#0b1421'), []);

  useLayoutEffect(() => {
    fog.near = layout.fogNear;
    fog.far = layout.fogFar;
  }, [fog, layout.fogFar, layout.fogNear]);

  useEffect(() => () => normalGroundMaterial.dispose(), [normalGroundMaterial]);

  useEffect(() => () => hydrologicalGroundMaterial.dispose(), [hydrologicalGroundMaterial]);

  useEffect(() => {
    timeline.current.sequence = sunriseSequence;
    timeline.current.lastAppliedProgress = -1;
    timeline.current.lastShadowUpdateAt = Number.NEGATIVE_INFINITY;
    timeline.current.lastDiagnosticBucket = -1;
    timeline.current.lastCameraSignature = '';
    invalidate();
  }, [
    active,
    celestialSun,
    invalidate,
    layout.fogFar,
    layout.fogNear,
    mode,
    nightMode,
    qualityTier,
    sky,
    sunLight,
    sunrisePhase,
    sunriseSequence,
    sunriseStartedAt,
  ]);

  useEffect(() => {
    // Preload owns the full scene. Warm only the two outer-ground variants
    // here, using the live scene as the lighting environment, so startup does
    // not traverse and compile hundreds of unrelated meshes twice.
    const compileStartedAt = typeof performance === 'undefined' ? Date.now() : performance.now();
    const programsBefore = gl.info.programs?.length ?? 0;
    const outerGround = outerGroundRef.current;
    const attachedMaterial = outerGround?.material;
    // Both mode-specific materials stay alive for the Environment lifetime.
    // Compile each variant during startup so switching Hydrological mode never
    // allocates textures or compiles a new terrain program inside the gesture.
    const groundMaterials = [normalGroundMaterial, hydrologicalGroundMaterial];
    for (const groundMaterial of groundMaterials) {
      if (outerGround) outerGround.material = groundMaterial;
      if (outerGround) gl.compile(outerGround, camera, scene);
    }
    if (!outerGround) gl.compile(scene, camera);
    if (outerGround && attachedMaterial) outerGround.material = attachedMaterial;
    if (import.meta.env.DEV) {
      const compileCompletedAt = typeof performance === 'undefined' ? Date.now() : performance.now();
      gl.domElement.dataset.commercialMapShaderCompilation = JSON.stringify({
        startedAt: Number(compileStartedAt.toFixed(2)),
        durationMs: Number((compileCompletedAt - compileStartedAt).toFixed(2)),
        programsBefore,
        programsAfter: gl.info.programs?.length ?? 0,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
      });
    }
    if (useCommercialMapStore.getState().sunrisePhase === 'idle') requestSunrise();
    else invalidate();
  }, [
    camera,
    gl,
    hydrologicalGroundMaterial,
    invalidate,
    normalGroundMaterial,
    requestSunrise,
    scene,
  ]);

  useEffect(() => () => {
    sunLight.shadow.map?.dispose();
  }, [sunLight]);

  useEffect(() => () => {
    activeGroundTextures?.dispose();
  }, [activeGroundTextures]);

  useFrame(() => {
    if (!active) return;
    const liveState = useCommercialMapStore.getState();
    const now = typeof performance === 'undefined' ? Date.now() : performance.now();
    const isRunning = liveState.sunrisePhase === 'running';
    const progress = liveState.sunrisePhase === 'complete'
      ? 1
      : isRunning && liveState.sunriseStartedAt !== null
        ? resolveCommercialMapSunriseProgress(liveState.sunriseStartedAt, now)
        : 0;
    const frameChanged = progress !== timeline.current.lastAppliedProgress
      || liveState.sunriseSequence !== timeline.current.sequence;
    const cameraSignature = import.meta.env.DEV
      ? [
          ...camera.matrixWorld.elements,
          ...camera.projectionMatrix.elements,
        ].map((value) => value.toFixed(4)).join(':')
      : '';
    const diagnosticsStale = import.meta.env.DEV
      && cameraSignature !== timeline.current.lastCameraSignature;
    if (!frameChanged && !diagnosticsStale) return;

    const frame = resolveCommercialMapSunriseFrame(progress, mode);
    const completedNow = frameChanged
      && progress >= 1
      && timeline.current.lastAppliedProgress < 1;
    if (frameChanged) {
      timeline.current.sequence = liveState.sunriseSequence;
      timeline.current.lastAppliedProgress = progress;
      frameDirection.set(...frame.direction);
      updateSkyFrame(sky, frame);
      updateCelestialSun(
        celestialSun,
        sceneAnchor,
        layout.visualSunDistance,
        frameDirection,
        sunFacingDirection,
        frame,
      );
      // The shadow camera orbits the park anchor at the fitted distance; the
      // visual sun disc and sky keep the wider scene anchor.
      sunLight.position.copy(shadowAnchor).addScaledVector(frameDirection, shadowFrustum.distance);
      sunLight.intensity = nightMode ? 0 : frame.sunlightIntensity;
      sunLight.shadow.radius = resolveShadowRadiusTexels(frame.shadowRadius, quality.shadowMapSize);
      sunTarget.updateMatrixWorld();
      sunLight.updateMatrixWorld();
      if (ambientRef.current) {
        ambientRef.current.intensity = nightMode ? 0.24 : frame.ambientIntensity;
      }
      if (hemisphereRef.current) {
        hemisphereRef.current.intensity = nightMode ? 0.3 : frame.hemisphereIntensity;
      }
      if (nightMode) fogColor.copy(nightFog);
      else fogColor.lerpColors(preSunriseFog, finalSunriseFog, frame.cloudWarmth);
      fog.color.copy(fogColor);
      scene.environmentIntensity = nightMode ? 0.16 : frame.environmentIntensity;
    }

    const diagnosticBucket = progress >= 1 ? 2 : progress >= 0.45 ? 1 : 0;
    if (
      import.meta.env.DEV
      && (diagnosticBucket !== timeline.current.lastDiagnosticBucket || diagnosticsStale)
    ) {
      timeline.current.lastDiagnosticBucket = diagnosticBucket;
      timeline.current.lastCameraSignature = cameraSignature;
      camera.getWorldPosition(cameraWorldPosition);
      camera.getWorldDirection(cameraForward);
      projectedSunPosition
        .copy(cameraWorldPosition)
        .addScaledVector(frameDirection, layout.visualSunDistance)
        .project(camera);
      gl.domElement.dataset.commercialMapSunriseDiagnostics = JSON.stringify({
        qualityTier,
        progress: Number(progress.toFixed(4)),
        direction: frame.direction.map((value) => Number(value.toFixed(5))),
        horizonTarget: horizonTarget.toArray().map((value) => Number(value.toFixed(2))),
        sunWorld: sunWorldScratch
          .copy(sceneAnchor)
          .addScaledVector(frameDirection, layout.visualSunDistance)
          .toArray()
          .map((value) => Number(value.toFixed(2))),
        sunNdc: projectedSunPosition.toArray().map((value) => Number(value.toFixed(4))),
        cameraPosition: camera.matrixWorld.elements
          .slice(12, 15)
          .map((value) => Number(value.toFixed(2))),
        cameraForward: cameraForward.toArray().map((value) => Number(value.toFixed(5))),
        sunViewDot: Number(cameraForward.dot(frameDirection).toFixed(5)),
        cameraFar: camera instanceof THREE.PerspectiveCamera ? camera.far : null,
        safeCameraMaxDistance: Number(cameraDistanceBounds.maxDistance.toFixed(3)),
        fogNear: Number(layout.fogNear.toFixed(3)),
        fogFar: Number(layout.fogFar.toFixed(3)),
        azimuthMapDegrees: COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.azimuthMapDegrees,
        elevationDegrees: Number(frame.elevationDegrees.toFixed(3)),
        renderer: {
          calls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          programs: gl.info.programs?.length ?? 0,
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
        },
      });
    }

    if (
      sunLight.castShadow
      && frameChanged
      && (
        now - timeline.current.lastShadowUpdateAt >= quality.shadowRefreshIntervalMs
        || completedNow
      )
    ) {
      gl.shadowMap.needsUpdate = true;
      timeline.current.lastShadowUpdateAt = now;
    }

    if (isRunning && progress < 1) invalidate();
    else if (isRunning) liveState.completeSunrise(liveState.sunriseSequence);
  });

  return (
    <>
      <CommercialMapSceneEnvironment
        active={active}
        background={background}
        fog={fog}
        reflectionTexture={reflectionTexture}
        environmentIntensity={initialFrame.environmentIntensity}
      />
      <group visible={active}>
      <primitive object={sky} visible={!nightMode} dispose={null} />
      <primitive object={celestialSun} visible={!nightMode} dispose={null} />
      <primitive object={sunTarget} dispose={null} />
      <primitive object={sunLight} visible={!nightMode} dispose={null} />
      <ambientLight
        ref={ambientRef}
        color={nightMode ? '#6d84b5' : '#dbeaf2'}
        intensity={nightMode ? 0.24 : initialFrame.ambientIntensity}
      />
      <hemisphereLight
        ref={hemisphereRef}
        args={[
          nightMode ? '#263a67' : palette.horizon,
          nightMode ? '#101713' : palette.hemisphereGround,
          nightMode ? 0.3 : initialFrame.hemisphereIntensity,
        ]}
      />
      <mesh
        ref={outerGroundRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[extent.centerX, -0.08, extent.centerZ]}
        receiveShadow
        raycast={NO_RAYCAST}
      >
        <planeGeometry args={[layout.outerGroundSize, layout.outerGroundSize]} />
        {/* R3F never auto-disposes primitive objects. Passing dispose={null}
            here would overwrite MeshStandardMaterial.dispose at runtime. */}
        <primitive object={activeGroundMaterial} attach="material" />
      </mesh>
      <group visible={mode === 'normal'}>
        <RegionalLandscapeLayer qualityTier={qualityTier} />
      </group>
      </group>
      {/* The persistent composer remains allocated, but native MSAA renders
          interaction frames directly. The refined post stack resumes after
          damping settles, without target churn or a shader rebuild. */}
      <SunrisePostProcessing
        qualityTier={qualityTier}
        enabled={active && !cameraNavigating}
        interactionActive={active && cameraNavigating}
      />
    </>
  );
});
