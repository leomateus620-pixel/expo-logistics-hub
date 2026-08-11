import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from '../capabilities';
import { useAlvoradaTimeline } from '../TimelineContext';
import { smoothRange } from '../timeline';
import { createCloudTexture, seededRandom } from '../visualTextures';

interface DawnEnvironmentProps {
  quality: AlvoradaQualityProfile;
}

interface CloudPlacement {
  drift: number;
  phase: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  stratum: number;
}

type AmbientTimelineState = {
  ambientElapsed?: number;
  elapsed: number;
};

const CLOUD_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const CLOUD_FRAGMENT_SHADER = `
  uniform sampler2D cloudMap;
  uniform vec2 texelSize;
  uniform vec3 sunDirection;
  uniform vec3 ambientColor;
  uniform vec3 sunColor;
  uniform vec3 layerTint;
  uniform float opacity;
  uniform float warmth;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    float density = texture2D(cloudMap, vUv).a;
    if (density < 0.012) discard;

    float densityX = texture2D(cloudMap, vUv + vec2(texelSize.x, 0.0)).a;
    float densityY = texture2D(cloudMap, vUv + vec2(0.0, texelSize.y)).a;
    vec3 detailNormal = normalize(vec3(
      (density - densityX) * 4.2,
      (density - densityY) * 4.2,
      0.72
    ));
    vec3 normal = normalize(vWorldNormal + detailNormal * 0.26);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float diffuse = 0.42 + max(dot(normal, normalize(sunDirection)), 0.0) * 0.58;
    float forwardScatter = pow(max(dot(viewDirection, normalize(sunDirection)), 0.0), 7.0);
    float body = smoothstep(0.018, 0.24, density);
    float silverLining = (1.0 - smoothstep(0.08, 0.34, density)) * forwardScatter;

    vec3 coolLight = ambientColor * (0.7 + diffuse * 0.3);
    vec3 warmLight = sunColor * (warmth * (0.18 + diffuse * 0.32) + silverLining * 0.7);
    vec3 color = layerTint * (coolLight + warmLight);
    float alpha = body * opacity;

    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const HORIZONTAL_SUN_DIRECTION = new THREE.Vector3(0.53, 0, -0.848).normalize();
const MOBILE_SUN_DIRECTION = new THREE.Vector3(0.25, 0, -0.968).normalize();
const AMBIENT_COLORS = ['#9db8d5', '#a8bfd7', '#b7c8dc'] as const;
const LAYER_TINTS = ['#d8e0ea', '#e4e4e3', '#eee4dc'] as const;

function createPhysicalSky() {
  const sky = new Sky();
  sky.name = 'AlvoradaPhysicalSky';
  sky.scale.setScalar(520);
  sky.frustumCulled = false;
  sky.renderOrder = -100;

  const { material } = sky;
  material.transparent = true;
  material.depthWrite = false;
  material.uniforms.skyOpacity = { value: 0 };
  material.uniforms.skyRadiance = { value: 0.78 };
  material.uniforms.turbidity.value = 6.2;
  material.uniforms.rayleigh.value = 3.2;
  material.uniforms.mieCoefficient.value = 0.0045;
  material.uniforms.mieDirectionalG.value = 0.76;
  material.fragmentShader = material.fragmentShader
    .replace(
      'uniform float mieDirectionalG;',
      'uniform float mieDirectionalG;\nuniform float skyOpacity;\nuniform float skyRadiance;',
    )
    .replace(
      'gl_FragColor = vec4( retColor, 1.0 );',
      `float alvoradaAltitude = smoothstep(-0.015, 0.36, direction.y);
      vec3 alvoradaPhysicalSky = max(retColor, vec3(0.0));
      float alvoradaLuminance = max(
        dot(alvoradaPhysicalSky, vec3(0.2126, 0.7152, 0.0722)),
        0.0
      );
      vec3 alvoradaIdentityColor = mix(
        vec3(1.38, 0.24, 0.018),
        vec3(0.018, 0.22, 1.05),
        alvoradaAltitude
      ) * (0.46 + min(alvoradaLuminance, 1.4) * 0.62);
      vec3 alvoradaBalancedSky = mix(alvoradaPhysicalSky, alvoradaIdentityColor, 0.72);
      float alvoradaSunBand = pow(max(dot(direction, normalize(vSunDirection)), 0.0), 10.0)
        * pow(1.0 - clamp(direction.y, 0.0, 1.0), 5.0);
      alvoradaBalancedSky += vec3(1.0, 0.47, 0.09) * alvoradaSunBand * 0.13;
      gl_FragColor = vec4(alvoradaBalancedSky * skyRadiance, skyOpacity);`,
    );
  material.needsUpdate = true;

  return sky;
}

function createSunMaterial() {
  return new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    fragmentShader: `
      varying vec2 vUv;
      uniform float sunOpacity;

      void main() {
        float radius = length(vUv - 0.5) * 2.0;
        float core = 1.0 - smoothstep(0.075, 0.125, radius);
        float diffraction = exp(-radius * radius * 8.5) * (1.0 - core);
        float corona = exp(-radius * 4.6) * (1.0 - core);
        float alpha = (core + diffraction * 0.34 + corona * 0.11) * sunOpacity;
        if (alpha < 0.006) discard;
        vec3 color = vec3(8.0, 6.3, 3.9) * core
          + vec3(2.5, 1.18, 0.34) * diffraction
          + vec3(1.0, 0.31, 0.07) * corona;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    fog: false,
    side: THREE.DoubleSide,
    transparent: true,
    uniforms: { sunOpacity: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
  });
}

function createCloudMaterial(
  cloudTexture: THREE.Texture,
  sunDirection: THREE.Vector3,
  stratum: number,
  textureSize: number,
) {
  return new THREE.ShaderMaterial({
    depthTest: true,
    depthWrite: false,
    fragmentShader: CLOUD_FRAGMENT_SHADER,
    fog: false,
    side: THREE.DoubleSide,
    transparent: true,
    uniforms: {
      ambientColor: { value: new THREE.Color(AMBIENT_COLORS[stratum]) },
      cloudMap: { value: cloudTexture },
      layerTint: { value: new THREE.Color(LAYER_TINTS[stratum]) },
      opacity: { value: 0 },
      sunColor: { value: new THREE.Color('#ffc185') },
      sunDirection: { value: sunDirection },
      texelSize: { value: new THREE.Vector2(1 / textureSize, 1 / textureSize) },
      warmth: { value: 0 },
    },
    vertexShader: CLOUD_VERTEX_SHADER,
  });
}

function createCloudPlacements(count: number) {
  const random = seededRandom(4317202);

  return Array.from({ length: count }, (_, index): CloudPlacement => {
    const stratum = index % 3;
    const depth = 32 + stratum * 13 + random() * 48;
    let x = -35 + random() * 70;
    const y = 9 + stratum * 3.4 + random() * 10;

    // Keep the center of the final brand composition comparatively quiet.
    if (Math.abs(x) < 9 && y > 13 && depth < 66) {
      x += x < 0 ? -10 : 10;
    }

    return {
      drift: 0.045 + random() * 0.055,
      phase: random() * Math.PI * 2,
      position: [x, y, -depth],
      rotation: [0, (random() - 0.5) * 0.12, (random() - 0.5) * 0.14],
      scale: [10 + random() * 16, 2.4 + random() * 4.2, 1],
      stratum,
    };
  });
}

export function DawnEnvironment({ quality }: DawnEnvironmentProps) {
  const timeline = useAlvoradaTimeline();
  const { camera } = useThree();
  const root = useRef<THREE.Group>(null);
  const sunVisual = useRef<THREE.Mesh>(null);
  const solarLight = useRef<THREE.DirectionalLight>(null);
  const ambientLight = useRef<THREE.HemisphereLight>(null);
  const cloudMeshes = useRef<THREE.Mesh[]>([]);
  const sky = useMemo(createPhysicalSky, []);
  const sunMaterial = useMemo(createSunMaterial, []);
  const horizontalSunDirection = quality.mobile
    ? MOBILE_SUN_DIRECTION
    : HORIZONTAL_SUN_DIRECTION;
  const sunDirection = useMemo(
    () => horizontalSunDirection.clone(),
    [horizontalSunDirection],
  );
  const cloudTextureSize = quality.mobile ? 256 : 384;
  const cloudTextures = useMemo(
    () => [2028, 4317, 2029].map((seed) => createCloudTexture(cloudTextureSize, seed)),
    [cloudTextureSize],
  );
  const cloudMaterials = useMemo(
    () => [0, 1, 2].map((stratum) => createCloudMaterial(
      cloudTextures[stratum],
      sunDirection,
      stratum,
      cloudTextureSize,
    )),
    [cloudTextureSize, cloudTextures, sunDirection],
  );
  const clouds = useMemo(
    () => createCloudPlacements(quality.cloudCount),
    [quality.cloudCount],
  );
  const warmLightColor = useMemo(() => new THREE.Color('#ffd0a0'), []);
  const goldenLightColor = useMemo(() => new THREE.Color('#ffe1b8'), []);

  useEffect(() => () => {
    sky.geometry.dispose();
    sky.material.dispose();
    sunMaterial.dispose();
    cloudMaterials.forEach((material) => material.dispose());
    cloudTextures.forEach((texture) => texture.dispose());
  }, [cloudMaterials, cloudTextures, sky, sunMaterial]);

  useFrame(() => {
    const timelineState = timeline.current as AmbientTimelineState;
    const elapsed = timelineState.elapsed;
    const ambientElapsed = timelineState.ambientElapsed ?? elapsed;
    const reveal = smoothRange(elapsed, 4.48, 5.08);
    const dawn = smoothRange(elapsed, 5.15, 9.35);
    const elevation = THREE.MathUtils.degToRad(0.34 + dawn * 1.48);

    sunDirection.set(
      horizontalSunDirection.x * Math.cos(elevation),
      Math.sin(elevation),
      horizontalSunDirection.z * Math.cos(elevation),
    ).normalize();

    sky.visible = reveal > 0.001;
    sky.material.uniforms.skyOpacity.value = reveal;
    sky.material.uniforms.skyRadiance.value = THREE.MathUtils.lerp(0.78, 0.92, dawn);
    sky.material.uniforms.sunPosition.value.copy(sunDirection);
    sky.material.uniforms.turbidity.value = THREE.MathUtils.lerp(6.2, 4.8, dawn);
    sky.material.uniforms.rayleigh.value = THREE.MathUtils.lerp(3.2, 4.0, dawn);
    sky.material.uniforms.mieCoefficient.value = THREE.MathUtils.lerp(0.0045, 0.0024, dawn);

    if (root.current) root.current.visible = reveal > 0.001;
    if (sunVisual.current) {
      sunVisual.current.position.copy(camera.position).addScaledVector(sunDirection, 120);
      sunVisual.current.quaternion.copy(camera.quaternion);
      sunVisual.current.scale.setScalar(THREE.MathUtils.lerp(0.74, 1, dawn));
      sunMaterial.uniforms.sunOpacity.value = reveal;
    }
    if (solarLight.current) {
      solarLight.current.position.copy(sunDirection).multiplyScalar(90);
      solarLight.current.intensity = reveal * THREE.MathUtils.lerp(1.35, 2.35, dawn);
      solarLight.current.color.lerpColors(warmLightColor, goldenLightColor, dawn);
    }
    if (ambientLight.current) {
      ambientLight.current.intensity = reveal * THREE.MathUtils.lerp(0.76, 1.08, dawn);
    }

    cloudMaterials.forEach((material, stratum) => {
      material.uniforms.opacity.value = reveal * (0.24 - stratum * 0.032);
      material.uniforms.warmth.value = THREE.MathUtils.lerp(0.5, 0.82, dawn);
    });

    clouds.forEach((cloud, index) => {
      const mesh = cloudMeshes.current[index];
      if (!mesh) return;
      const motion = ambientElapsed * cloud.drift + cloud.phase;
      mesh.position.set(
        cloud.position[0] + Math.sin(motion) * (0.28 + cloud.stratum * 0.13),
        cloud.position[1] + Math.cos(motion * 0.61) * 0.11,
        cloud.position[2],
      );
      mesh.rotation.z = cloud.rotation[2] + Math.sin(motion * 0.37) * 0.008;
    });
  });

  return (
    <>
      <group ref={root} visible={false}>
        <primitive object={sky} />

        <mesh
          ref={sunVisual}
          frustumCulled={false}
          material={sunMaterial}
          renderOrder={-40}
        >
          <planeGeometry args={[12, 12]} />
        </mesh>

        {clouds.map((cloud, index) => (
          <mesh
            key={`${cloud.stratum}-${index}`}
            ref={(mesh) => {
              if (mesh) cloudMeshes.current[index] = mesh;
            }}
            position={cloud.position}
            rotation={cloud.rotation}
            scale={cloud.scale}
          >
            <planeGeometry args={[1, 1, 1, 1]} />
            <primitive attach="material" object={cloudMaterials[cloud.stratum]} />
          </mesh>
        ))}
      </group>

      <hemisphereLight
        ref={ambientLight}
        args={['#8fb9e6', '#52636b', 0]}
      />
      <directionalLight
        ref={solarLight}
        castShadow={quality.shadows}
        color="#ffd0a0"
        intensity={0}
        position={[18, 1.2, -86]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.018}
        shadow-mapSize-height={quality.shadowMapSize}
        shadow-mapSize-width={quality.shadowMapSize}
        shadow-camera-far={100}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
      />
    </>
  );
}
