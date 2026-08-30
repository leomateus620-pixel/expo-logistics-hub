import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { isMapSelectionClick } from '../../utils/interaction';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import {
  LUNAR_LAUNCH_GESTURE,
  LUNAR_LAUNCH_HIT_TARGET,
  isDeliberateLunarSecondTap,
  lunarLaunchAltitudeAt,
  lunarLaunchThrustAt,
  resolveLunarLaunchQuality,
  sampleLunarLaunchMotion,
  type LunarLaunchMotionSample,
  type LunarTapSample,
} from '../../utils/lunarLaunch';

const NO_RAYCAST = () => undefined;

function useDisposableInstancedMeshRef() {
  const mesh = useRef<THREE.InstancedMesh | null>(null);
  const setMesh = useCallback((next: THREE.InstancedMesh | null) => {
    const previous = mesh.current;
    if (previous && previous !== next) disposeInstancedMesh(previous);
    mesh.current = next;
  }, []);
  return [mesh, setMesh] as const;
}

function trySetPointerCapture(target: EventTarget, pointerId: number) {
  if (!(target instanceof Element)) return;
  try {
    if (!target.hasPointerCapture(pointerId)) target.setPointerCapture(pointerId);
  } catch {
    // Capture is an enhancement; browsers may reject it after a cancelled pointer.
  }
}

function tryReleasePointerCapture(target: EventTarget, pointerId: number) {
  if (!(target instanceof Element)) return;
  try {
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
  } catch {
    // A lost/cancelled pointer is already effectively released.
  }
}

const PARTICLE_VERTEX_SHADER = `
  attribute float aAlpha;
  attribute float aSeed;
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vSeed;
  varying vec3 vColor;
  #include <fog_pars_vertex>

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(aSize * uPixelRatio * (150.0 / max(1.0, -mvPosition.z)), 1.0, 54.0);
    vAlpha = aAlpha;
    vColor = aColor;
    vSeed = aSeed;
    #include <fog_vertex>
  }
`;

const PARTICLE_FRAGMENT_SHADER = `
  varying float vAlpha;
  varying float vSeed;
  varying vec3 vColor;
  #include <fog_pars_fragment>

  void main() {
    vec2 centered = gl_PointCoord * 2.0 - 1.0;
    float radius = length(centered);
    float contour = sin(atan(centered.y, centered.x) * 5.0 + vSeed * 17.0) * 0.035;
    float softDisc = 1.0 - smoothstep(0.34, 1.0 + contour, radius);
    float centerGlow = exp(-radius * radius * 5.5);
    float alpha = vAlpha * max(softDisc, centerGlow * 0.62);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(vColor * (0.82 + centerGlow * 0.7), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const PLUME_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const PLUME_FRAGMENT_SHADER = `
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vUv;

  float hash21(vec2 value) {
    value = fract(value * vec2(123.34, 456.21));
    value += dot(value, value + 45.32);
    return fract(value.x * value.y);
  }

  void main() {
    float axial = 1.0 - vUv.y;
    float lateral = abs(vUv.x - 0.5) * 2.0;
    float lowNoise = sin(axial * 18.0 - uTime * 15.0 + vUv.x * 8.0) * 0.08;
    float highNoise = sin(axial * 43.0 - uTime * 27.0 - vUv.x * 13.0) * 0.035;
    float grain = (hash21(floor(vUv * vec2(32.0, 72.0)) + uTime * 0.7) - 0.5) * 0.08;
    float taper = mix(0.26, 1.0, smoothstep(0.0, 0.72, axial));
    float boundary = taper + lowNoise + highNoise + grain;
    float body = 1.0 - smoothstep(boundary * 0.54, boundary, lateral);
    float breakup = smoothstep(0.08, 0.68, hash21(vUv * vec2(8.0, 19.0) + uTime * 0.18));
    float dissolve = mix(1.0, breakup, smoothstep(0.48, 1.0, axial));
    float turbulentBands = 0.7 + 0.3 * sin(axial * 31.0 - uTime * 24.0 + lateral * 9.0);
    body *= mix(1.0, turbulentBands, smoothstep(0.18, 0.94, axial));
    float topCore = exp(-lateral * lateral * 8.0) * (1.0 - smoothstep(0.0, 0.7, axial));
    float alpha = (body * dissolve * 0.29 + topCore * 0.56) * uIntensity;
    if (alpha < 0.008) discard;

    vec3 outer = vec3(1.0, 0.16, 0.015);
    vec3 transition = vec3(1.0, 0.56, 0.04);
    vec3 core = vec3(1.75, 1.5, 0.72);
    vec3 color = mix(outer, transition, 1.0 - smoothstep(0.18, 0.92, lateral));
    color = mix(color, core, topCore);
    color *= 0.74 + uIntensity * 0.58;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const GROUND_GLOW_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GROUND_GLOW_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec2 centered = (vUv - 0.5) * 2.0;
    float radius = length(centered);
    float irregularity = sin(atan(centered.y, centered.x) * 7.0 + uTime * 3.2) * 0.035;
    float falloff = 1.0 - smoothstep(0.08, 1.0 + irregularity, radius);
    falloff *= falloff;
    if (falloff * uOpacity < 0.004) discard;
    vec3 outer = vec3(1.0, 0.22, 0.025);
    vec3 core = vec3(1.45, 0.9, 0.26);
    vec3 color = mix(outer, core, 1.0 - smoothstep(0.0, 0.72, radius));
    gl_FragColor = vec4(color, falloff * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface ParticlePool {
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  alphas: Float32Array;
  sizes: Float32Array;
}

interface TapDownSample extends LunarTapSample {
  pointerId: number;
}

interface LunarRocketLaunchRigProps {
  children: ReactNode;
  rocketHeight: number;
  sceneDiagonal: number;
  onSelect: () => void;
}

function seededValue(index: number, salt: number) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function createParticlePool(count: number, palette: readonly string[]) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const seed = index === 0 ? 0 : seededValue(index, count + 3);
    seeds[index] = seed;
    color.set(palette[Math.min(palette.length - 1, Math.floor(seed * palette.length))]);
    color.toArray(colors, index * 3);
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 260);
  return { geometry, positions, alphas, sizes } satisfies ParticlePool;
}

function createParticleMaterial(blending: THREE.Blending) {
  return new THREE.ShaderMaterial({
    blending,
    depthTest: true,
    depthWrite: false,
    fog: true,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uPixelRatio: { value: 1 } },
    ]),
    vertexShader: PARTICLE_VERTEX_SHADER,
  });
}

function createPlumeMaterial() {
  return new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    fragmentShader: PLUME_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    transparent: true,
    uniforms: {
      uIntensity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: PLUME_VERTEX_SHADER,
  });
}

function createGroundGlowMaterial() {
  return new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    fragmentShader: GROUND_GLOW_FRAGMENT_SHADER,
    transparent: true,
    toneMapped: false,
    uniforms: {
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: GROUND_GLOW_VERTEX_SHADER,
  });
}

function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}

function setParticle(
  pool: ParticlePool,
  index: number,
  x: number,
  y: number,
  z: number,
  alpha: number,
  size: number,
) {
  const offset = index * 3;
  pool.positions[offset] = x;
  pool.positions[offset + 1] = y;
  pool.positions[offset + 2] = z;
  pool.alphas[index] = alpha;
  pool.sizes[index] = size;
}

function commitPool(pool: ParticlePool) {
  pool.geometry.getAttribute('position').needsUpdate = true;
  pool.geometry.getAttribute('aAlpha').needsUpdate = true;
  pool.geometry.getAttribute('aSize').needsUpdate = true;
}

function clearPool(pool: ParticlePool) {
  pool.alphas.fill(0);
  pool.sizes.fill(0);
  commitPool(pool);
}

function updateHotParticles(
  pool: ParticlePool,
  elapsed: number,
  sceneDiagonal: number,
  rocketHeight: number,
) {
  const emissionStart = 0.3;
  const emissionEnd = 6.92;
  const currentThrust = lunarLaunchThrustAt(elapsed);
  setParticle(
    pool,
    0,
    Math.sin(elapsed * 24.7) * currentThrust * 0.008,
    lunarLaunchAltitudeAt(elapsed, sceneDiagonal, rocketHeight) + 0.045,
    Math.cos(elapsed * 21.3) * currentThrust * 0.006,
    currentThrust * 0.96,
    0.22 + currentThrust * 0.16,
  );
  for (let index = 1; index < pool.alphas.length; index += 1) {
    const seedA = seededValue(index, 11);
    const seedB = seededValue(index, 23);
    const lifetime = 0.18 + seedA * 0.24;
    const cycle = lifetime * (1.32 + seedB * 0.78);
    const offset = seedB * cycle;
    const absolute = elapsed - emissionStart - offset;
    if (absolute < 0 || elapsed > emissionEnd + lifetime) {
      setParticle(pool, index, 0, -10, 0, 0, 0);
      continue;
    }
    const age = positiveModulo(absolute, cycle);
    const spawnTime = elapsed - age;
    if (spawnTime > emissionEnd || age > lifetime) {
      setParticle(pool, index, 0, -10, 0, 0, 0);
      continue;
    }
    const life = age / lifetime;
    const thrust = lunarLaunchThrustAt(spawnTime);
    const altitude = lunarLaunchAltitudeAt(spawnTime, sceneDiagonal, rocketHeight);
    const angle = seedA * Math.PI * 2 + Math.floor(absolute / cycle) * 1.618;
    const lateralSpeed = 0.16 + seedB * 0.34;
    const turbulence = Math.sin(elapsed * (17 + seedA * 8) + index) * 0.035 * life;
    const downwardSpeed = 1.55 + seedA * 2.25 + thrust * 0.9;
    setParticle(
      pool,
      index,
      Math.cos(angle) * lateralSpeed * age + turbulence,
      Math.max(0.14, altitude + 0.12 - downwardSpeed * age),
      Math.sin(angle) * lateralSpeed * age - turbulence * 0.7,
      thrust * Math.sin(Math.PI * life) * (0.42 + seedB * 0.58),
      (0.085 + seedA * 0.15) * (1 + life * 0.75),
    );
  }
  commitPool(pool);
}

function updateSparks(
  pool: ParticlePool,
  elapsed: number,
  sceneDiagonal: number,
  rocketHeight: number,
) {
  const emissionStart = 0.72;
  const emissionEnd = 3.82;
  for (let index = 0; index < pool.alphas.length; index += 1) {
    const seedA = seededValue(index, 31);
    const seedB = seededValue(index, 47);
    const lifetime = 0.32 + seedA * 0.45;
    const cycle = 0.74 + seedB * 0.95;
    const absolute = elapsed - emissionStart - seedA * cycle;
    if (absolute < 0) {
      setParticle(pool, index, 0, -10, 0, 0, 0);
      continue;
    }
    const age = positiveModulo(absolute, cycle);
    const spawnTime = elapsed - age;
    if (spawnTime > emissionEnd || age > lifetime) {
      setParticle(pool, index, 0, -10, 0, 0, 0);
      continue;
    }
    const life = age / lifetime;
    const altitude = lunarLaunchAltitudeAt(spawnTime, sceneDiagonal, rocketHeight);
    const angle = seedB * Math.PI * 2 + Math.floor(absolute / cycle) * 0.73;
    const radialSpeed = 0.75 + seedA * 1.25;
    setParticle(
      pool,
      index,
      Math.cos(angle) * radialSpeed * age,
      Math.max(0.09, altitude + 0.08 + (0.45 + seedB * 1.25) * age - 3.4 * age * age),
      Math.sin(angle) * radialSpeed * age,
      (1 - life) * (0.45 + seedA * 0.55),
      0.035 + seedB * 0.055,
    );
  }
  commitPool(pool);
}

function updateDust(pool: ParticlePool, elapsed: number) {
  const emissionStart = 0.42;
  const emissionEnd = 2.08;
  for (let index = 0; index < pool.alphas.length; index += 1) {
    const seedA = seededValue(index, 59);
    const seedB = seededValue(index, 71);
    const lifetime = 0.78 + seedA * 0.92;
    const birth = emissionStart + seedB * (emissionEnd - emissionStart);
    const age = elapsed - birth;
    if (age < 0 || age > lifetime) {
      setParticle(pool, index, 0, -10, 0, 0, 0);
      continue;
    }
    const life = age / lifetime;
    const angle = seedA * Math.PI * 2;
    const speed = 0.82 + seedB * 1.5;
    setParticle(
      pool,
      index,
      Math.cos(angle) * speed * age,
      0.11 + Math.sin(Math.PI * life) * (0.12 + seedA * 0.22),
      Math.sin(angle) * speed * age,
      Math.sin(Math.PI * life) * (0.14 + seedB * 0.2),
      (0.38 + seedA * 0.4) * (1 + life * 1.9),
    );
  }
  commitPool(pool);
}

function updateSmoke(
  pool: ParticlePool,
  elapsed: number,
  sceneDiagonal: number,
  rocketHeight: number,
) {
  const emissionStart = 0.84;
  const emissionEnd = 5.35;
  for (let index = 0; index < pool.alphas.length; index += 1) {
    const seedA = seededValue(index, 83);
    const seedB = seededValue(index, 97);
    const lifetime = 1.05 + seedA * 1.15;
    const cycle = 1.16 + seedB * 1.18;
    const absolute = elapsed - emissionStart - seedA * cycle;
    if (absolute < 0) {
      setParticle(pool, index, 0, -10, 0, 0, 0);
      continue;
    }
    const age = positiveModulo(absolute, cycle);
    const spawnTime = elapsed - age;
    if (spawnTime > emissionEnd || age > lifetime) {
      setParticle(pool, index, 0, -10, 0, 0, 0);
      continue;
    }
    const life = age / lifetime;
    const altitude = lunarLaunchAltitudeAt(spawnTime, sceneDiagonal, rocketHeight);
    const angle = seedB * Math.PI * 2;
    const drift = 0.1 + seedA * 0.24;
    setParticle(
      pool,
      index,
      Math.cos(angle) * drift * age + Math.sin(elapsed * 0.8 + index) * 0.035,
      Math.max(0.12, altitude + 0.055 - (0.36 + seedB * 0.42) * age + age * age * 0.13),
      Math.sin(angle) * drift * age,
      Math.sin(Math.PI * life) * (0.055 + seedA * 0.09),
      (0.24 + seedB * 0.3) * (1 + life * 2.2),
    );
  }
  commitPool(pool);
}

export function LunarRocketLaunchRig({
  children,
  rocketHeight,
  sceneDiagonal,
  onSelect,
}: LunarRocketLaunchRigProps) {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const reducedGraphics = useCommercialMapStore((state) => state.reducedGraphics);
  const launchPhase = useCommercialMapStore((state) => state.lunarLaunchPhase);
  const launchStartedAt = useCommercialMapStore((state) => state.lunarLaunchStartedAt);
  const skipRequested = useCommercialMapStore((state) => state.lunarLaunchSkipRequested);
  const launchReturnAvailable = useCommercialMapStore((state) => state.lunarLaunchReturnAvailable);
  const launchReturning = useCommercialMapStore((state) => state.lunarLaunchReturning);
  const requestLaunch = useCommercialMapStore((state) => state.requestLunarLaunch);
  const launchRoot = useRef<THREE.Group>(null);
  const worldEffects = useRef<THREE.Group>(null);
  const [plume, setPlume] = useDisposableInstancedMeshRef();
  const plumeScale = useRef<THREE.Group>(null);
  const engineCore = useRef<THREE.Mesh>(null);
  const groundGlow = useRef<THREE.Mesh>(null);
  const engineLight = useRef<THREE.PointLight>(null);
  const lastTap = useRef<LunarTapSample | null>(null);
  const tapDown = useRef<TapDownSample | null>(null);
  const activeTouchPointers = useRef(new Set<number>());
  const lastTouchInteractionAt = useRef(Number.NEGATIVE_INFINITY);
  const firstDesktopClickAt = useRef<number | null>(null);
  const lastShadowRefresh = useRef(0);
  const cleanupLastFrame = useRef(false);
  const activeLastFrame = useRef(false);
  const motionSample = useRef<LunarLaunchMotionSample>({
    phase: 'idle',
    altitude: 0,
    thrust: 0,
    groundLight: 0,
    vibration: 0,
    ascentProgress: 0,
  });
  const navigatorCapabilities = useMemo(() => {
    if (typeof navigator === 'undefined') return { hardwareConcurrency: 8, deviceMemoryGb: 8 };
    const deviceNavigator = navigator as Navigator & { deviceMemory?: number };
    return {
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGb: deviceNavigator.deviceMemory ?? 8,
    };
  }, []);
  const quality = useMemo(() => resolveLunarLaunchQuality({
    viewportWidth: size.width,
    viewportHeight: size.height,
    reducedGraphics,
    ...navigatorCapabilities,
  }), [navigatorCapabilities, reducedGraphics, size.height, size.width]);
  const hitGeometry = useMemo(() => new THREE.CylinderGeometry(
    LUNAR_LAUNCH_HIT_TARGET.radius,
    LUNAR_LAUNCH_HIT_TARGET.radius,
    rocketHeight + LUNAR_LAUNCH_HIT_TARGET.topPadding,
    12,
    1,
  ), [rocketHeight]);
  const hitMaterial = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  const plumeGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 3);
    geometry.translate(0, -0.5, 0);
    return geometry;
  }, []);
  const plumeMaterial = useMemo(createPlumeMaterial, []);
  const engineCoreGeometry = useMemo(() => new THREE.SphereGeometry(0.1, 12, 8), []);
  const engineCoreMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    color: '#fff3ad',
    depthTest: true,
    depthWrite: false,
    opacity: 0,
    toneMapped: false,
    transparent: true,
  }), []);
  const glowGeometry = useMemo(() => new THREE.CircleGeometry(1, 32), []);
  const glowMaterial = useMemo(createGroundGlowMaterial, []);
  const hotPool = useMemo(
    () => createParticlePool(quality.hotParticles, ['#fff8c4', '#ffe06a', '#ff9c2f', '#ff5b1f']),
    [quality.hotParticles],
  );
  const sparkPool = useMemo(
    () => createParticlePool(quality.sparks, ['#fff4a8', '#ffc448', '#ff7a24']),
    [quality.sparks],
  );
  const dustPool = useMemo(
    () => createParticlePool(quality.dust, ['#b79d79', '#9e8568', '#c3ad8c']),
    [quality.dust],
  );
  const smokePool = useMemo(
    () => createParticlePool(quality.smoke, ['#b7b3a9', '#9e9c96', '#c1b9ab']),
    [quality.smoke],
  );
  const hotMaterial = useMemo(() => createParticleMaterial(THREE.AdditiveBlending), []);
  const sparkMaterial = useMemo(() => createParticleMaterial(THREE.AdditiveBlending), []);
  const dustMaterial = useMemo(() => createParticleMaterial(THREE.NormalBlending), []);
  const smokeMaterial = useMemo(() => createParticleMaterial(THREE.NormalBlending), []);

  useLayoutEffect(() => {
    if (!plume.current) return;
    const transform = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const position = new THREE.Vector3();
    for (let index = 0; index < 3; index += 1) {
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), index * Math.PI / 3);
      transform.compose(position, quaternion, scale);
      plume.current.setMatrixAt(index, transform);
    }
    plume.current.instanceMatrix.needsUpdate = true;
    plume.current.computeBoundingSphere();
  }, [plume]);

  useEffect(() => () => hitGeometry.dispose(), [hitGeometry]);
  // A responsive tier can replace one pool without retiring the other pools or
  // any of the stable plume/engine materials that are still attached and shared.
  useEffect(() => () => hotPool.geometry.dispose(), [hotPool]);
  useEffect(() => () => sparkPool.geometry.dispose(), [sparkPool]);
  useEffect(() => () => dustPool.geometry.dispose(), [dustPool]);
  useEffect(() => () => smokePool.geometry.dispose(), [smokePool]);

  useEffect(() => () => {
    hitMaterial.dispose();
    plumeGeometry.dispose();
    plumeMaterial.dispose();
    engineCoreGeometry.dispose();
    engineCoreMaterial.dispose();
    glowGeometry.dispose();
    glowMaterial.dispose();
    [hotMaterial, sparkMaterial, dustMaterial, smokeMaterial].forEach((material) => material.dispose());
  }, [
    dustMaterial,
    engineCoreGeometry,
    engineCoreMaterial,
    glowGeometry,
    glowMaterial,
    hitMaterial,
    hotMaterial,
    plumeGeometry,
    plumeMaterial,
    smokeMaterial,
    sparkMaterial,
  ]);

  useEffect(() => {
    const canvas = gl.domElement;
    const activePointers = activeTouchPointers.current;
    const handleCanvasPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      lastTouchInteractionAt.current = event.timeStamp;
      activePointers.add(event.pointerId);
      if (activePointers.size <= 1) return;
      tapDown.current = null;
      lastTap.current = null;
    };
    const handleCanvasPointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      lastTouchInteractionAt.current = event.timeStamp;
      activePointers.delete(event.pointerId);
    };
    canvas.addEventListener('pointerdown', handleCanvasPointerDown, true);
    canvas.addEventListener('pointerup', handleCanvasPointerEnd, true);
    canvas.addEventListener('pointercancel', handleCanvasPointerEnd, true);
    return () => {
      canvas.removeEventListener('pointerdown', handleCanvasPointerDown, true);
      canvas.removeEventListener('pointerup', handleCanvasPointerEnd, true);
      canvas.removeEventListener('pointercancel', handleCanvasPointerEnd, true);
      activePointers.clear();
      tapDown.current = null;
      lastTap.current = null;
    };
  }, [gl]);

  const hideResetRocket = launchReturnAvailable || launchReturning;
  useEffect(() => {
    if (launchPhase !== 'idle' || !launchRoot.current) return;
    launchRoot.current.visible = !hideResetRocket;
    invalidate();
  }, [hideResetRocket, invalidate, launchPhase]);

  useFrame(() => {
    const active = launchPhase !== 'idle' && launchStartedAt !== null;
    const cleanup = launchPhase === 'cleanup';
    const now = typeof performance === 'undefined' ? Date.now() : performance.now();
    const elapsed = active && launchStartedAt !== null
      ? Math.max(0, (now - launchStartedAt) / 1000)
      : 0;

    if (!active) {
      if (activeLastFrame.current) {
        launchRoot.current?.position.set(0, 0, 0);
        launchRoot.current?.rotation.set(0, 0, 0);
        if (launchRoot.current) launchRoot.current.visible = !hideResetRocket;
        if (worldEffects.current) worldEffects.current.visible = false;
        if (plume.current) plume.current.visible = false;
        if (engineCore.current) engineCore.current.visible = false;
        if (engineLight.current) engineLight.current.intensity = 0;
        engineCoreMaterial.opacity = 0;
        glowMaterial.uniforms.uOpacity.value = 0;
        [hotPool, sparkPool, dustPool, smokePool].forEach(clearPool);
        lastShadowRefresh.current = 0;
        gl.shadowMap.needsUpdate = true;
      }
      activeLastFrame.current = false;
      cleanupLastFrame.current = false;
      return;
    }

    activeLastFrame.current = true;
    if (cleanup !== cleanupLastFrame.current) {
      gl.shadowMap.needsUpdate = true;
      cleanupLastFrame.current = cleanup;
    }
    const motion = sampleLunarLaunchMotion(
      elapsed,
      sceneDiagonal,
      rocketHeight,
      motionSample.current,
    );
    const flameNoise = Math.sin(elapsed * 19.3) * 0.055 + Math.sin(elapsed * 31.1 + 0.8) * 0.028;
    const vibration = motion.vibration;

    if (launchRoot.current) {
      launchRoot.current.visible = !cleanup;
      launchRoot.current.position.set(
        Math.sin(elapsed * 47.0) * vibration * 0.012,
        cleanup ? 0 : motion.altitude,
        Math.cos(elapsed * 43.0 + 0.4) * vibration * 0.01,
      );
      launchRoot.current.rotation.set(
        Math.sin(elapsed * 23.0) * vibration * 0.004,
        0,
        Math.cos(elapsed * 19.0) * vibration * 0.0045,
      );
    }
    if (worldEffects.current) worldEffects.current.visible = !skipRequested;
    if (plume.current) plume.current.visible = !cleanup && motion.thrust > 0.008;
    if (engineCore.current) {
      engineCore.current.visible = !cleanup && motion.thrust > 0.008;
      engineCore.current.scale.set(
        0.72 + motion.thrust * 0.62,
        0.65 + motion.thrust * 1.5,
        0.72 + motion.thrust * 0.62,
      );
    }
    engineCoreMaterial.opacity = cleanup ? 0 : motion.thrust * 0.92;
    if (plumeScale.current) {
      const width = 0.28 + motion.thrust * 0.18 + flameNoise * 0.08;
      const length = 0.25 + motion.thrust * (1.18 + flameNoise * 2.2);
      plumeScale.current.scale.set(width, Math.max(0.08, length), width);
      plumeScale.current.position.set(
        Math.sin(elapsed * 16.1) * motion.thrust * 0.018,
        0.22,
        Math.cos(elapsed * 13.3) * motion.thrust * 0.014,
      );
    }
    plumeMaterial.uniforms.uIntensity.value = cleanup ? 0 : motion.thrust;
    plumeMaterial.uniforms.uTime.value = elapsed;
    if (engineLight.current) {
      engineLight.current.intensity = cleanup ? 0 : motion.thrust * (2.4 + motion.groundLight * 2.8);
      engineLight.current.distance = 3.6 + motion.groundLight * 3.2;
    }
    if (groundGlow.current) {
      const pulse = 1 + Math.sin(elapsed * 18.0) * 0.04 * motion.groundLight;
      groundGlow.current.scale.setScalar((0.58 + motion.groundLight * 0.82) * pulse);
    }
    glowMaterial.uniforms.uOpacity.value = cleanup ? 0 : motion.groundLight * 0.28;
    glowMaterial.uniforms.uTime.value = elapsed;

    const pixelRatio = Math.max(1, Math.min(2, gl.getPixelRatio()));
    hotMaterial.uniforms.uPixelRatio.value = pixelRatio;
    sparkMaterial.uniforms.uPixelRatio.value = pixelRatio;
    dustMaterial.uniforms.uPixelRatio.value = pixelRatio;
    smokeMaterial.uniforms.uPixelRatio.value = pixelRatio;
    updateHotParticles(hotPool, elapsed, sceneDiagonal, rocketHeight);
    updateSparks(sparkPool, elapsed, sceneDiagonal, rocketHeight);
    updateDust(dustPool, elapsed);
    updateSmoke(smokePool, elapsed, sceneDiagonal, rocketHeight);

    if (!skipRequested && elapsed < 2.8) {
      const interval = quality.shadowRefreshDuringIgnition ? 0.1 : quality.tier === 'mobile' ? 0.24 : Infinity;
      if (elapsed - lastShadowRefresh.current >= interval) {
        gl.shadowMap.needsUpdate = true;
        lastShadowRefresh.current = elapsed;
      }
    }
    invalidate();
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.nativeEvent.pointerType !== 'touch') return;
    lastTouchInteractionAt.current = event.nativeEvent.timeStamp;
    if (activeTouchPointers.current.size > 1) {
      tapDown.current = null;
      lastTap.current = null;
      return;
    }
    trySetPointerCapture(event.target, event.nativeEvent.pointerId);
    tapDown.current = {
      pointerId: event.nativeEvent.pointerId,
      timeMs: event.nativeEvent.timeStamp,
      clientX: event.nativeEvent.clientX,
      clientY: event.nativeEvent.clientY,
    };
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (event.nativeEvent.pointerType !== 'touch') return;
    lastTouchInteractionAt.current = event.nativeEvent.timeStamp;
    tryReleasePointerCapture(event.target, event.nativeEvent.pointerId);
    const down = tapDown.current;
    tapDown.current = null;
    if (!down || down.pointerId !== event.nativeEvent.pointerId) return;
    const current: LunarTapSample = {
      timeMs: event.nativeEvent.timeStamp,
      clientX: event.nativeEvent.clientX,
      clientY: event.nativeEvent.clientY,
    };
    const travel = Math.hypot(current.clientX - down.clientX, current.clientY - down.clientY);
    const duration = current.timeMs - down.timeMs;
    if (travel > LUNAR_LAUNCH_GESTURE.touchTapMaxTravelPx
      || duration > LUNAR_LAUNCH_GESTURE.touchTapMaxDurationMs) {
      lastTap.current = null;
      return;
    }
    if (isDeliberateLunarSecondTap(lastTap.current, current)) {
      event.nativeEvent.preventDefault();
      event.stopPropagation();
      lastTap.current = null;
      onSelect();
      requestLaunch();
      return;
    }
    lastTap.current = current;
    onSelect();
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.nativeEvent.timeStamp - lastTouchInteractionAt.current < 800) return;
    if (launchPhase !== 'idle') return;
    if (!isMapSelectionClick(event.delta, event.nativeEvent)) return;
    const clickedAt = event.nativeEvent.timeStamp;
    const previousClickAt = firstDesktopClickAt.current;
    if (previousClickAt !== null
      && clickedAt - previousClickAt <= LUNAR_LAUNCH_GESTURE.desktopDoubleClickMaxMs) {
      event.nativeEvent.preventDefault();
      firstDesktopClickAt.current = null;
      onSelect();
      requestLaunch();
      return;
    }
    firstDesktopClickAt.current = clickedAt;
    onSelect();
  };

  const handleDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    firstDesktopClickAt.current = null;
  };

  return (
    <>
      <group ref={launchRoot} name="apollo-xiv-launch-assembly" dispose={null}>
        {children}
        <group ref={plumeScale} name="pluma-turbulenta-apollo-xiv">
          <instancedMesh
            ref={setPlume}
            args={[plumeGeometry, plumeMaterial, 3]}
            count={3}
            frustumCulled={false}
            raycast={NO_RAYCAST}
            visible={false}
            dispose={null}
          />
        </group>
        <mesh
          ref={engineCore}
          name="nucleo-emissivo-motor-apollo-xiv"
          geometry={engineCoreGeometry}
          material={engineCoreMaterial}
          position={[0, 0.17, 0]}
          raycast={NO_RAYCAST}
          renderOrder={7}
          visible={false}
          dispose={null}
        />
        <pointLight
          ref={engineLight}
          name="iluminacao-motor-apollo-xiv"
          color="#ff9a43"
          decay={2}
          distance={5}
          intensity={0}
          position={[0, 0.08, 0]}
        />
        <mesh
          name={LUNAR_LAUNCH_HIT_TARGET.objectName}
          geometry={hitGeometry}
          material={hitMaterial}
          position={[
            0,
            LUNAR_LAUNCH_HIT_TARGET.baseY
              + (rocketHeight + LUNAR_LAUNCH_HIT_TARGET.topPadding) / 2,
            0,
          ]}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={(event) => {
            lastTouchInteractionAt.current = event.nativeEvent.timeStamp;
            tryReleasePointerCapture(event.target, event.nativeEvent.pointerId);
            activeTouchPointers.current.delete(event.nativeEvent.pointerId);
            tapDown.current = null;
            lastTap.current = null;
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            if (launchPhase === 'idle') gl.domElement.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            gl.domElement.style.cursor = launchPhase === 'idle' ? 'grab' : 'grabbing';
          }}
          dispose={null}
        />
      </group>
      <group ref={worldEffects} name="efeitos-mundo-lancamento-apollo-xiv" visible={false} dispose={null}>
        <mesh
          ref={groundGlow}
          name="reflexo-solo-motor-apollo-xiv"
          geometry={glowGeometry}
          material={glowMaterial}
          position={[0, 0.102, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={NO_RAYCAST}
          renderOrder={4}
          dispose={null}
        />
        <points geometry={hotPool.geometry} material={hotMaterial} frustumCulled={false} raycast={NO_RAYCAST} dispose={null} />
        <points geometry={sparkPool.geometry} material={sparkMaterial} frustumCulled={false} raycast={NO_RAYCAST} dispose={null} />
        <points geometry={dustPool.geometry} material={dustMaterial} frustumCulled={false} raycast={NO_RAYCAST} dispose={null} />
        <points geometry={smokePool.geometry} material={smokeMaterial} frustumCulled={false} raycast={NO_RAYCAST} dispose={null} />
      </group>
    </>
  );
}
