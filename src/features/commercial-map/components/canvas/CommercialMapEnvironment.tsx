import { memo, useEffect, useMemo, useRef } from 'react';
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import {
  COMMERCIAL_MAP_ENVIRONMENT_CONFIG,
  resolveCommercialMapCloudPlacements,
  resolveCommercialMapEnvironmentLayout,
  resolveCommercialMapSunriseFrame,
  resolveCommercialMapSunriseProgress,
  resolveCommercialMapSunriseQualityTier,
  type CommercialMapEnvironmentExtent,
  type CommercialMapEnvironmentMode,
  type CommercialMapSunriseFrame,
  type CommercialMapSunriseQualityTier,
} from '../../data/commercialMapEnvironment';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import {
  openGroundTextureBundleForEntity,
  type OpenGroundSurfaceProfile,
} from './openGroundTextures';

interface CommercialMapEnvironmentProps {
  extent: CommercialMapEnvironmentExtent;
  hydrologicalModeActive: boolean;
  reducedGraphics: boolean;
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
  tileWorldSize: 18,
  baseColor: '#b8c9b0',
  roughness: 0.99,
});
const ACTIVE_GROUND_NORMAL_SCALE = new THREE.Vector2(0.12, 0.12);

function colorWithAlpha(hex: string, alpha: number) {
  const color = new THREE.Color(hex);
  return color.getStyle().replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createOuterGroundTexture(size: number, palette: EnvironmentPalette) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const radius = size * 0.7;
  const groundGradient = context.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.025,
    size / 2,
    size / 2,
    radius,
  );
  groundGradient.addColorStop(0, palette.activeGround);
  groundGradient.addColorStop(0.16, palette.outerGroundNear);
  groundGradient.addColorStop(0.54, palette.outerGroundNear);
  groundGradient.addColorStop(1, palette.outerGroundFar);
  context.fillStyle = groundGradient;
  context.fillRect(0, 0, size, size);

  const random = seededRandom(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.seed + 91);
  for (let index = 0; index < 24; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const patchRadius = size * (0.04 + random() * 0.1);
    const patch = context.createRadialGradient(x, y, 0, x, y, patchRadius);
    patch.addColorStop(0, colorWithAlpha(index % 2 === 0 ? '#789174' : '#d5ddcc', 0.045));
    patch.addColorStop(1, colorWithAlpha(palette.outerGroundFar, 0));
    context.fillStyle = patch;
    context.fillRect(x - patchRadius, y - patchRadius, patchRadius * 2, patchRadius * 2);
  }

  const edgeMask = context.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.34,
    size / 2,
    size / 2,
    size * 0.5,
  );
  edgeMask.addColorStop(0, 'rgba(255,255,255,1)');
  edgeMask.addColorStop(0.62, 'rgba(255,255,255,1)');
  edgeMask.addColorStop(0.84, 'rgba(255,255,255,.68)');
  edgeMask.addColorStop(1, 'rgba(255,255,255,0)');
  context.globalCompositeOperation = 'destination-in';
  context.fillStyle = edgeMask;
  context.fillRect(0, 0, size, size);
  context.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'CommercialMapOuterGroundTexture';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createCloudTexture(size: number) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const random = seededRandom(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.seed);
  context.clearRect(0, 0, size, size);

  for (let index = 0; index < 54; index += 1) {
    const x = size * (0.08 + random() * 0.84);
    const y = size * (0.31 + random() * 0.38);
    const radiusX = size * (0.045 + random() * 0.14);
    const radiusY = radiusX * (0.2 + random() * 0.3);
    const density = 0.13 + random() * 0.2;
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, `rgba(255,255,255,${density})`);
    gradient.addColorStop(0.56, `rgba(255,255,255,${density * 0.42})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.save();
    context.translate(x, y);
    context.rotate((random() - 0.5) * 0.2);
    context.scale(radiusX, radiusY);
    context.fillStyle = gradient;
    context.fillRect(-1, -1, 2, 2);
    context.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'CommercialMapSunriseCloudTexture';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
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
      uniform vec3 finalSunriseHorizonCool;`,
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
      float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      gl_FragColor = vec4(max(composedSky + dither / 720.0, vec3(0.0)), 1.0);`,
    );
  material.customProgramCacheKey = () => `commercial-map-premium-sunrise-sky-${mode}-v2`;
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

function createCloudLayer(
  placements: ReturnType<typeof resolveCommercialMapCloudPlacements>,
  texture: THREE.Texture,
  palette: EnvironmentPalette,
  opacity: number,
  centerX: number,
  centerZ: number,
  initialFrame: CommercialMapSunriseFrame,
) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const sunrise = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uOpacity: { value: opacity },
      uSunDirection: { value: new THREE.Vector3(...initialFrame.direction) },
      uSunriseProgress: { value: initialFrame.easedProgress },
      uWarmth: { value: initialFrame.cloudWarmth },
      uCenter: { value: new THREE.Vector2(centerX, centerZ) },
      uCloudCool: { value: new THREE.Color(palette.cloud) },
      uCloudShade: { value: new THREE.Color(palette.cloudShade) },
      uCloudWarm: { value: new THREE.Color(sunrise.colors.warmCloud) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      void main() {
        vUv = uv;
        mat4 instanceTransform = mat4(1.0);
        #ifdef USE_INSTANCING
          instanceTransform = instanceMatrix;
        #endif
        vec4 worldPosition = modelMatrix * instanceTransform * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uOpacity;
      uniform vec3 uSunDirection;
      uniform float uSunriseProgress;
      uniform float uWarmth;
      uniform vec2 uCenter;
      uniform vec3 uCloudCool;
      uniform vec3 uCloudShade;
      uniform vec3 uCloudWarm;
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        vec2 driftUv = vec2(vUv.x + uSunriseProgress * 0.008, vUv.y);
        float density = texture2D(uMap, driftUv).a;
        if (density < 0.006) discard;
        vec2 radial = normalize(vWorldPosition.xz - uCenter + vec2(0.0001));
        vec2 solar = normalize(uSunDirection.xz + vec2(0.0001));
        float alignment = pow(max(dot(radial, solar), 0.0), 4.0);
        float illuminatedEdge = smoothstep(0.05, 0.45, density)
          - smoothstep(0.5, 0.92, density);
        float warmAmount = uWarmth * alignment * (0.34 + illuminatedEdge * 0.66);
        vec3 cloudColor = mix(uCloudShade, uCloudCool, smoothstep(0.05, 0.42, density));
        cloudColor = mix(cloudColor, uCloudWarm, warmAmount);
        gl_FragColor = vec4(cloudColor, density * uOpacity);
      }
    `,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    transparent: true,
    toneMapped: true,
  });
  material.name = 'CommercialMapSunriseCloudMaterial';
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const transform = new THREE.Object3D();
  transform.rotation.order = 'YXZ';
  placements.forEach((cloud, index) => {
    transform.position.set(...cloud.position);
    transform.rotation.set(-Math.PI / 2, cloud.rotationY, 0);
    transform.scale.set(...cloud.scale);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.name = 'CommercialMapSparseSunriseClouds';
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = -40;
  mesh.raycast = NO_RAYCAST;
  return mesh;
}

function configureSunLight(
  target: THREE.Object3D,
  shadowSpan: number,
  sunDistance: number,
  qualityTier: CommercialMapSunriseQualityTier,
) {
  const quality = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality[qualityTier];
  const light = new THREE.DirectionalLight(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.color, 0);
  light.name = 'CommercialMapAuthoritativeSunLight';
  light.target = target;
  light.castShadow = qualityTier !== 'reduced';
  light.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  light.shadow.camera.left = -shadowSpan;
  light.shadow.camera.right = shadowSpan;
  light.shadow.camera.top = shadowSpan;
  light.shadow.camera.bottom = -shadowSpan;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = Math.max(220, sunDistance * 2.8);
  light.shadow.bias = -0.000055;
  light.shadow.normalBias = 0.04;
  light.shadow.radius = 4.1;
  return light;
}

function updateSkyFrame(sky: SunriseSky, frame: CommercialMapSunriseFrame) {
  const material = sky.material;
  (material.uniforms.sunPosition.value as THREE.Vector3).set(...frame.direction);
  material.uniforms.sunriseProgress.value = frame.easedProgress;
}

function SunrisePostProcessing({
  qualityTier,
}: {
  qualityTier: CommercialMapSunriseQualityTier;
}) {
  const quality = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality[qualityTier];
  if (!quality.bloomEnabled) return null;
  return (
    <EffectComposer
      multisampling={0}
      enableNormalPass={false}
    >
      <Bloom
        intensity={0.58}
        luminanceThreshold={3.2}
        luminanceSmoothing={0.16}
        mipmapBlur
        levels={quality.bloomLevels}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

export const CommercialMapEnvironment = memo(function CommercialMapEnvironment({
  extent,
  hydrologicalModeActive,
  reducedGraphics,
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
  const qualityTier: CommercialMapSunriseQualityTier = reducedGraphics
    ? 'reduced'
    : initialQualityTier.current ?? 'balanced';
  const quality = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality[qualityTier];
  const layout = useMemo(
    () => resolveCommercialMapEnvironmentLayout(extent, mode, qualityTier),
    [extent, mode, qualityTier],
  );
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
  const sunTarget = useMemo(() => {
    const target = new THREE.Object3D();
    target.name = 'CommercialMapSolarTarget';
    target.position.copy(sceneAnchor);
    return target;
  }, [sceneAnchor]);
  const sky = useMemo(
    () => createSky(layout.skyScale, extent.centerX, extent.centerZ, initialFrame, mode),
    [extent.centerX, extent.centerZ, initialFrame, layout.skyScale, mode],
  );
  const celestialSun = useMemo(
    () => createCelestialSun(sceneAnchor, layout.visualSunDistance, initialFrame),
    [initialFrame, layout.visualSunDistance, sceneAnchor],
  );
  const sunLight = useMemo(
    () => configureSunLight(sunTarget, layout.shadowSpan, layout.sunDistance, qualityTier),
    [layout.shadowSpan, layout.sunDistance, qualityTier, sunTarget],
  );
  const cloudPlacements = useMemo(
    () => resolveCommercialMapCloudPlacements(extent, qualityTier),
    [extent, qualityTier],
  );
  const cloudTextureSize = qualityTier === 'full'
    ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.fullTextureSize
    : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.reducedTextureSize;
  const cloudTexture = useMemo(() => createCloudTexture(cloudTextureSize), [cloudTextureSize]);
  const cloudOpacity = hydrologicalModeActive
    ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.hydrologicalOpacity
    : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.opacity;
  const cloudLayer = useMemo(
    () => createCloudLayer(
      cloudPlacements,
      cloudTexture,
      palette,
      cloudOpacity,
      extent.centerX,
      extent.centerZ,
      initialFrame,
    ),
    [cloudOpacity, cloudPlacements, cloudTexture, extent.centerX, extent.centerZ, initialFrame, palette],
  );
  const groundTextureSize = qualityTier === 'reduced'
    ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.ground.reducedTextureSize
    : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.ground.fullTextureSize;
  const outerGroundTexture = useMemo(
    () => createOuterGroundTexture(groundTextureSize, palette),
    [groundTextureSize, palette],
  );
  const activeGroundTextures = useMemo(() => {
    if (hydrologicalModeActive) return null;
    const bundle = openGroundTextureBundleForEntity(ACTIVE_GROUND_PROFILE, maximumAnisotropy);
    if (!bundle) return null;
    const repeatX = layout.activeGroundWidth / ACTIVE_GROUND_PROFILE.tileWorldSize;
    const repeatY = layout.activeGroundDepth / ACTIVE_GROUND_PROFILE.tileWorldSize;
    [bundle.map, bundle.normalMap, bundle.roughnessMap].forEach((texture) => {
      texture.repeat.set(repeatX, repeatY);
      texture.needsUpdate = true;
    });
    return bundle;
  }, [hydrologicalModeActive, layout.activeGroundDepth, layout.activeGroundWidth, maximumAnisotropy]);
  const reflectionTextureWidth = qualityTier === 'reduced'
    ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.reflections.reducedTextureWidth
    : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.reflections.fullTextureWidth;
  const finalSunDirection = useMemo(
    () => new THREE.Vector3(...resolveCommercialMapSunriseFrame(1, mode).direction),
    [mode],
  );
  const reflectionTexture = useMemo(
    () => createReflectionTexture(reflectionTextureWidth, palette, finalSunDirection),
    [finalSunDirection, palette, reflectionTextureWidth],
  );
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemisphereRef = useRef<THREE.HemisphereLight>(null);
  const fogRef = useRef<THREE.Fog>(null);
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

  useEffect(() => {
    const previousEnvironment = scene.environment;
    const previousEnvironmentIntensity = scene.environmentIntensity;
    scene.environment = reflectionTexture;
    scene.environmentIntensity = initialFrame.environmentIntensity;
    invalidate();
    return () => {
      if (scene.environment === reflectionTexture) {
        scene.environment = previousEnvironment;
        scene.environmentIntensity = previousEnvironmentIntensity;
      }
      reflectionTexture.dispose();
    };
  }, [initialFrame.environmentIntensity, invalidate, reflectionTexture, scene]);

  useEffect(() => {
    timeline.current.sequence = sunriseSequence;
    timeline.current.lastAppliedProgress = -1;
    timeline.current.lastShadowUpdateAt = Number.NEGATIVE_INFINITY;
    timeline.current.lastDiagnosticBucket = -1;
    timeline.current.lastCameraSignature = '';
    invalidate();
  }, [invalidate, sunrisePhase, sunriseSequence, sunriseStartedAt]);

  useEffect(() => {
    // The first demand-render compiles the persistent post stack. Compile the
    // scene once more before starting so a replay never allocates or flashes.
    gl.compile(scene, camera);
    if (useCommercialMapStore.getState().sunrisePhase === 'idle') requestSunrise();
    else invalidate();
  }, [camera, gl, invalidate, requestSunrise, scene]);

  useEffect(() => () => {
    sky.geometry.dispose();
    sky.material.dispose();
  }, [sky]);

  useEffect(() => () => {
    celestialSun.geometry.dispose();
    celestialSun.material.dispose();
  }, [celestialSun]);

  useEffect(() => () => {
    cloudLayer.geometry.dispose();
    cloudLayer.material.dispose();
    cloudTexture.dispose();
  }, [cloudLayer, cloudTexture]);

  useEffect(() => () => {
    sunLight.shadow.map?.dispose();
  }, [sunLight]);

  useEffect(() => () => {
    outerGroundTexture.dispose();
  }, [outerGroundTexture]);

  useEffect(() => () => {
    activeGroundTextures?.dispose();
  }, [activeGroundTextures]);

  useFrame(() => {
    const liveState = useCommercialMapStore.getState();
    const now = typeof performance === 'undefined' ? Date.now() : performance.now();
    const isRunning = liveState.sunrisePhase === 'running';
    const progress = liveState.sunrisePhase === 'complete'
      ? 1
      : isRunning && liveState.sunriseStartedAt !== null
        ? resolveCommercialMapSunriseProgress(liveState.sunriseStartedAt, now)
        : 0;
    const cameraSignature = [
      ...camera.matrixWorld.elements,
      ...camera.projectionMatrix.elements,
    ].map((value) => value.toFixed(4)).join(':');
    const diagnosticsStale = cameraSignature !== timeline.current.lastCameraSignature;
    const shouldApply = progress !== timeline.current.lastAppliedProgress
      || liveState.sunriseSequence !== timeline.current.sequence
      || diagnosticsStale;
    if (!shouldApply) return;

    const frame = resolveCommercialMapSunriseFrame(progress, mode);
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
    const cloudMaterial = cloudLayer.material as THREE.ShaderMaterial;
    (cloudMaterial.uniforms.uSunDirection.value as THREE.Vector3).copy(frameDirection);
    cloudMaterial.uniforms.uSunriseProgress.value = frame.easedProgress;
    cloudMaterial.uniforms.uWarmth.value = frame.cloudWarmth;
    sunLight.position.copy(sceneAnchor).addScaledVector(frameDirection, layout.sunDistance);
    sunLight.intensity = frame.sunlightIntensity;
    sunLight.shadow.radius = frame.shadowRadius;
    sunTarget.updateMatrixWorld();
    sunLight.updateMatrixWorld();
    if (ambientRef.current) ambientRef.current.intensity = frame.ambientIntensity;
    if (hemisphereRef.current) hemisphereRef.current.intensity = frame.hemisphereIntensity;
    if (fogRef.current) {
      fogColor.lerpColors(preSunriseFog, finalSunriseFog, frame.cloudWarmth);
      fogRef.current.color.copy(fogColor);
    }
    scene.environmentIntensity = frame.environmentIntensity;

    const diagnosticBucket = progress >= 1 ? 2 : progress >= 0.45 ? 1 : 0;
    if (diagnosticBucket !== timeline.current.lastDiagnosticBucket || diagnosticsStale) {
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
        sunWorld: sceneAnchor.clone()
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
      && (
        now - timeline.current.lastShadowUpdateAt >= quality.shadowRefreshIntervalMs
        || progress >= 1
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
      <color attach="background" args={[palette.fallback]} />
      <fog ref={fogRef} attach="fog" args={[preSunriseFog, layout.fogNear, layout.fogFar]} />
      <primitive object={sky} dispose={null} />
      <primitive object={celestialSun} dispose={null} />
      <primitive object={cloudLayer} dispose={null} />
      <primitive object={sunTarget} dispose={null} />
      <primitive object={sunLight} dispose={null} />
      <ambientLight ref={ambientRef} color="#dbeaf2" intensity={initialFrame.ambientIntensity} />
      <hemisphereLight
        ref={hemisphereRef}
        args={[palette.horizon, palette.hemisphereGround, initialFrame.hemisphereIntensity]}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[extent.centerX, -0.105, extent.centerZ]}
        raycast={NO_RAYCAST}
        renderOrder={-80}
      >
        <planeGeometry args={[layout.outerGroundSize, layout.outerGroundSize]} />
        <meshStandardMaterial
          color="#ffffff"
          map={outerGroundTexture}
          roughness={1}
          metalness={0}
          envMapIntensity={0.08}
          transparent
          depthWrite={false}
          // The outer feather is only 0.025 below the active ground. At low
          // camera near planes its transparent pass can share the same depth
          // bin and draw stripes over the opaque ground. Bias this background
          // away, without moving roads, disabling shadows or hiding terrain.
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={2}
        />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[extent.centerX, -0.08, extent.centerZ]}
        receiveShadow
        raycast={NO_RAYCAST}
      >
        <planeGeometry args={[layout.activeGroundWidth, layout.activeGroundDepth]} />
        <meshStandardMaterial
          color={palette.activeGround}
          map={activeGroundTextures?.map}
          normalMap={activeGroundTextures?.normalMap}
          normalScale={activeGroundTextures ? ACTIVE_GROUND_NORMAL_SCALE : undefined}
          roughnessMap={activeGroundTextures?.roughnessMap}
          roughness={0.98}
          metalness={0}
          envMapIntensity={0.12}
        />
      </mesh>
      <SunrisePostProcessing qualityTier={qualityTier} />
    </>
  );
});
