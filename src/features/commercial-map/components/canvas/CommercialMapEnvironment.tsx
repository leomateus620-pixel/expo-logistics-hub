import { memo, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import * as THREE from 'three';
import {
  COMMERCIAL_MAP_ENVIRONMENT_CONFIG,
  normalizedCommercialMapSunDirection,
  resolveCommercialMapCloudPlacements,
  resolveCommercialMapEnvironmentLayout,
  type CommercialMapEnvironmentExtent,
  type CommercialMapEnvironmentMode,
} from '../../data/commercialMapEnvironment';

interface CommercialMapEnvironmentProps {
  extent: CommercialMapEnvironmentExtent;
  hydrologicalModeActive: boolean;
  reducedGraphics: boolean;
}

type EnvironmentPalette = typeof COMMERCIAL_MAP_ENVIRONMENT_CONFIG.palettes.normal
  | typeof COMMERCIAL_MAP_ENVIRONMENT_CONFIG.palettes.hydrological;

const NO_RAYCAST = () => undefined;

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

function createCloudTexture(size: number, palette: EnvironmentPalette) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const random = seededRandom(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.seed);
  context.clearRect(0, 0, size, size);

  for (let index = 0; index < 58; index += 1) {
    const x = size * (0.1 + random() * 0.8);
    const y = size * (0.3 + random() * 0.42);
    const radiusX = size * (0.045 + random() * 0.14);
    const radiusY = radiusX * (0.25 + random() * 0.34);
    const lowerHalf = y > size * 0.51;
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(
      0,
      colorWithAlpha(lowerHalf ? palette.cloudShade : palette.cloud, 0.18 + random() * 0.17),
    );
    gradient.addColorStop(0.5, colorWithAlpha(palette.cloud, 0.08 + random() * 0.075));
    gradient.addColorStop(1, colorWithAlpha(palette.cloud, 0));
    context.save();
    context.translate(x, y);
    context.rotate((random() - 0.5) * 0.24);
    context.scale(radiusX, radiusY);
    context.fillStyle = gradient;
    context.fillRect(-1, -1, 2, 2);
    context.restore();
  }

  const veil = context.createLinearGradient(0, size * 0.26, 0, size * 0.78);
  veil.addColorStop(0, colorWithAlpha(palette.cloud, 0));
  veil.addColorStop(0.48, colorWithAlpha(palette.cloud, 0.035));
  veil.addColorStop(1, colorWithAlpha(palette.cloudShade, 0));
  context.fillStyle = veil;
  context.fillRect(size * 0.08, size * 0.22, size * 0.84, size * 0.62);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'CommercialMapCloudTexture';
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

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, palette.zenith);
  gradient.addColorStop(0.38, palette.upperSky);
  gradient.addColorStop(0.56, palette.horizon);
  gradient.addColorStop(0.72, palette.outerGroundNear);
  gradient.addColorStop(1, palette.outerGroundFar);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const longitude = Math.atan2(sunDirection.z, sunDirection.x);
  const sunX = ((longitude / (Math.PI * 2)) + 1) % 1 * canvas.width;
  const sunY = canvas.height * (0.5 - Math.asin(sunDirection.y) / Math.PI);
  const sunRadius = canvas.width * 0.13;
  const sunGlow = context.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
  sunGlow.addColorStop(0, colorWithAlpha(palette.sunGlow, 0.8));
  sunGlow.addColorStop(0.26, colorWithAlpha(palette.sunGlow, 0.28));
  sunGlow.addColorStop(1, colorWithAlpha(palette.sunGlow, 0));
  context.fillStyle = sunGlow;
  context.fillRect(sunX - sunRadius, sunY - sunRadius, sunRadius * 2, sunRadius * 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'CommercialMapAtmosphericReflection';
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
  sunDirection: THREE.Vector3,
  mode: CommercialMapEnvironmentMode,
) {
  const sky = new Sky();
  const material = sky.material as THREE.ShaderMaterial;
  sky.name = 'CommercialMapPhysicalSky';
  sky.scale.setScalar(scale);
  sky.position.set(centerX, -scale * 0.035, centerZ);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  material.depthWrite = false;
  material.uniforms.turbidity.value = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sky.turbidity
    + (mode === 'hydrological' ? 0.35 : 0);
  material.uniforms.rayleigh.value = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sky.rayleigh
    - (mode === 'hydrological' ? 0.35 : 0);
  material.uniforms.mieCoefficient.value = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sky.mieCoefficient;
  material.uniforms.mieDirectionalG.value = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sky.mieDirectionalG;
  material.uniforms.sunPosition.value.copy(sunDirection);
  const palette = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.palettes[mode];
  material.uniforms.environmentZenith = { value: new THREE.Color(palette.zenith) };
  material.uniforms.environmentUpperSky = { value: new THREE.Color(palette.upperSky) };
  material.uniforms.environmentHorizon = { value: new THREE.Color(palette.horizon) };
  material.uniforms.environmentSunGlow = { value: new THREE.Color(palette.sunGlow) };
  material.fragmentShader = material.fragmentShader
    .replace(
      'uniform vec3 up;',
      `uniform vec3 up;
      uniform vec3 environmentZenith;
      uniform vec3 environmentUpperSky;
      uniform vec3 environmentHorizon;
      uniform vec3 environmentSunGlow;`,
    )
    .replace(
      'gl_FragColor = vec4( retColor, 1.0 );',
      `float environmentAltitude = clamp(direction.y * 0.9 + 0.1, 0.0, 1.0);
      vec3 authoredSky = mix(
        environmentHorizon,
        environmentUpperSky,
        smoothstep(0.02, 0.42, environmentAltitude)
      );
      authoredSky = mix(
        authoredSky,
        environmentZenith,
        smoothstep(0.36, 0.96, environmentAltitude)
      );
      vec3 balancedPhysicalSky = retColor / (vec3(1.0) + max(retColor, vec3(0.0)) * 0.42);
      float solarHalo = pow(max(dot(direction, normalize(vSunDirection)), 0.0), 22.0);
      authoredSky += environmentSunGlow * solarHalo * 0.09;
      gl_FragColor = vec4(mix(balancedPhysicalSky, authoredSky, 0.84), 1.0);`,
    );
  material.customProgramCacheKey = () => `commercial-map-premium-sky-${mode}`;
  material.needsUpdate = true;
  return sky;
}

function createCloudLayer(
  placements: ReturnType<typeof resolveCommercialMapCloudPlacements>,
  texture: THREE.Texture,
  palette: EnvironmentPalette,
  opacity: number,
) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    alphaTest: 0.012,
    color: palette.cloud,
    depthWrite: false,
    fog: true,
    map: texture,
    opacity,
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
  });
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
  mesh.name = 'CommercialMapSparseClouds';
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = -40;
  mesh.raycast = NO_RAYCAST;
  return mesh;
}

export const CommercialMapEnvironment = memo(function CommercialMapEnvironment({
  extent,
  hydrologicalModeActive,
  reducedGraphics,
}: CommercialMapEnvironmentProps) {
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const mode: CommercialMapEnvironmentMode = hydrologicalModeActive ? 'hydrological' : 'normal';
  const palette = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.palettes[mode];
  const layout = useMemo(
    () => resolveCommercialMapEnvironmentLayout(extent, mode, reducedGraphics),
    [extent, mode, reducedGraphics],
  );
  const sunDirection = useMemo(
    () => new THREE.Vector3(...normalizedCommercialMapSunDirection()),
    [],
  );
  const sunPosition = useMemo(
    () => new THREE.Vector3(extent.centerX, 0, extent.centerZ)
      .addScaledVector(sunDirection, layout.sunDistance),
    [extent.centerX, extent.centerZ, layout.sunDistance, sunDirection],
  );
  const fillPosition = useMemo(() => {
    const direction = new THREE.Vector3(...COMMERCIAL_MAP_ENVIRONMENT_CONFIG.fill.direction).normalize();
    return new THREE.Vector3(extent.centerX, 0, extent.centerZ)
      .addScaledVector(direction, layout.sunDistance * 0.82);
  }, [extent.centerX, extent.centerZ, layout.sunDistance]);
  const sunTarget = useMemo(() => {
    const target = new THREE.Object3D();
    target.name = 'CommercialMapSolarTarget';
    target.position.set(extent.centerX, 0, extent.centerZ);
    return target;
  }, [extent.centerX, extent.centerZ]);
  const sky = useMemo(
    () => createSky(layout.skyScale, extent.centerX, extent.centerZ, sunDirection, mode),
    [extent.centerX, extent.centerZ, layout.skyScale, mode, sunDirection],
  );
  const cloudPlacements = useMemo(
    () => resolveCommercialMapCloudPlacements(extent, reducedGraphics),
    [extent, reducedGraphics],
  );
  const cloudTextureSize = reducedGraphics
    ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.reducedTextureSize
    : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.fullTextureSize;
  const cloudTexture = useMemo(
    () => createCloudTexture(cloudTextureSize, palette),
    [cloudTextureSize, palette],
  );
  const cloudOpacity = hydrologicalModeActive
    ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.hydrologicalOpacity
    : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.opacity;
  const cloudLayer = useMemo(
    () => createCloudLayer(cloudPlacements, cloudTexture, palette, cloudOpacity),
    [cloudOpacity, cloudPlacements, cloudTexture, palette],
  );
  const groundTextureSize = reducedGraphics
    ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.ground.reducedTextureSize
    : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.ground.fullTextureSize;
  const outerGroundTexture = useMemo(
    () => createOuterGroundTexture(groundTextureSize, palette),
    [groundTextureSize, palette],
  );
  const reflectionTextureWidth = reducedGraphics
    ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.reflections.reducedTextureWidth
    : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.reflections.fullTextureWidth;
  const reflectionTexture = useMemo(
    () => createReflectionTexture(reflectionTextureWidth, palette, sunDirection),
    [palette, reflectionTextureWidth, sunDirection],
  );

  useEffect(() => {
    const previousEnvironment = scene.environment;
    const previousEnvironmentIntensity = scene.environmentIntensity;
    scene.environment = reflectionTexture;
    scene.environmentIntensity = hydrologicalModeActive
      ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.reflections.hydrologicalIntensity
      : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.reflections.intensity;
    invalidate();
    return () => {
      if (scene.environment === reflectionTexture) {
        scene.environment = previousEnvironment;
        scene.environmentIntensity = previousEnvironmentIntensity;
      }
      reflectionTexture.dispose();
    };
  }, [hydrologicalModeActive, invalidate, reflectionTexture, scene]);

  useEffect(() => () => {
    sky.geometry.dispose();
    sky.material.dispose();
  }, [sky]);

  useEffect(() => () => {
    cloudLayer.geometry.dispose();
    (cloudLayer.material as THREE.Material).dispose();
    cloudTexture.dispose();
  }, [cloudLayer, cloudTexture]);

  useEffect(() => () => {
    outerGroundTexture.dispose();
  }, [outerGroundTexture]);

  return (
    <>
      <color attach="background" args={[palette.fallback]} />
      <fog attach="fog" args={[palette.horizon, layout.fogNear, layout.fogFar]} />
      <primitive object={sky} />
      <primitive object={cloudLayer} />
      <primitive object={sunTarget} />
      <ambientLight
        color="#f4f8f5"
        intensity={hydrologicalModeActive
          ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.ambient.hydrologicalIntensity
          : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.ambient.intensity}
      />
      <hemisphereLight
        args={[
          palette.horizon,
          palette.hemisphereGround,
          hydrologicalModeActive
            ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.ambient.hydrologicalHemisphereIntensity
            : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.ambient.hemisphereIntensity,
        ]}
      />
      <directionalLight
        position={sunPosition.toArray()}
        target={sunTarget}
        intensity={hydrologicalModeActive
          ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.hydrologicalIntensity
          : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.intensity}
        color={COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.color}
        castShadow={!reducedGraphics}
        shadow-mapSize-width={reducedGraphics ? 512 : 2048}
        shadow-mapSize-height={reducedGraphics ? 512 : 2048}
        shadow-camera-left={-layout.shadowSpan}
        shadow-camera-right={layout.shadowSpan}
        shadow-camera-top={layout.shadowSpan}
        shadow-camera-bottom={-layout.shadowSpan}
        shadow-camera-near={0.5}
        shadow-camera-far={Math.max(180, layout.sunDistance * 2.6)}
        shadow-bias={-0.00006}
        shadow-normalBias={0.035}
        shadow-radius={2}
      />
      <directionalLight
        position={fillPosition.toArray()}
        target={sunTarget}
        intensity={hydrologicalModeActive
          ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.fill.hydrologicalIntensity
          : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.fill.intensity}
        color={COMMERCIAL_MAP_ENVIRONMENT_CONFIG.fill.color}
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
          roughness={0.98}
          metalness={0}
          envMapIntensity={0.12}
        />
      </mesh>
    </>
  );
});
