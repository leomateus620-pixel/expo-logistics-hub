import { useEffect, useMemo, useRef } from 'react';
import { Stars, useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from '../capabilities';
import { EARTH_RADIUS } from '../geo';
import { useAlvoradaTimeline } from '../TimelineContext';
import { deriveAlvoradaVisualState, smoothRange } from '../timeline';
import { BrazilLayer, RioGrandeDoSulLayer, SantaRosaMarker } from './GeographicLayers';

const EARTH_TEXTURE_URLS = [
  '/alvorada/earth-day-2048.jpg',
  '/alvorada/earth-night-lights-2048.png',
  '/alvorada/earth-normal-2048.jpg',
  '/alvorada/earth-clouds-1024.png',
];

const earthVertexShader = `
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

const earthFragmentShader = `
  #include <common>
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D normalMap;
  uniform vec3 sunDirection;
  uniform float opacity;
  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    vec3 dayColor = texture2D(dayMap, vUv).rgb;
    vec3 cityLights = texture2D(nightMap, vUv).rgb;
    float surfaceDetail = texture2D(normalMap, vUv).r;
    vec3 normal = normalize(vWorldNormal);
    float lightAmount = dot(normal, normalize(sunDirection));
    float dayAmount = smoothstep(-0.12, 0.44, lightAmount);
    float nightAmount = 1.0 - smoothstep(-0.2, 0.2, lightAmount);
    float horizon = pow(1.0 - abs(clamp(lightAmount, -1.0, 1.0)), 7.0);

    vec3 nightSurface = dayColor * 0.055 + cityLights * vec3(1.62, 1.07, 0.55) * 1.65;
    vec3 litSurface = dayColor * (0.34 + max(lightAmount, 0.0) * 0.92);
    vec3 color = mix(nightSurface, litSurface, dayAmount);
    color += cityLights * nightAmount * 0.62;
    color += vec3(1.0, 0.37, 0.08) * horizon * 0.13;
    color *= mix(0.965, 1.035, surfaceDetail);

    gl_FragColor = vec4(color, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const atmosphereFragmentShader = `
  #include <common>
  uniform vec3 sunDirection;
  uniform float opacity;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(viewDirection, vNormal), 0.0), 3.2);
    float sunEdge = pow(max(dot(vNormal, normalize(sunDirection)), 0.0), 7.0);
    vec3 cool = vec3(0.08, 0.32, 0.76);
    vec3 warm = vec3(1.0, 0.36, 0.08);
    vec3 color = mix(cool, warm, sunEdge * 0.82);
    gl_FragColor = vec4(color, fresnel * opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createOrbitalGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);

  const gradient = context.createRadialGradient(128, 128, 2, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255,255,238,1)');
  gradient.addColorStop(0.08, 'rgba(255,219,117,.98)');
  gradient.addColorStop(0.28, 'rgba(255,132,35,.48)');
  gradient.addColorStop(1, 'rgba(255,83,12,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function EarthScene({ quality }: { quality: AlvoradaQualityProfile }) {
  const timeline = useAlvoradaTimeline();
  const spaceRoot = useRef<THREE.Group>(null);
  const earthRoot = useRef<THREE.Group>(null);
  const cloudMesh = useRef<THREE.Mesh>(null);
  const earthMaterial = useRef<THREE.ShaderMaterial>(null);
  const atmosphereMaterial = useRef<THREE.ShaderMaterial>(null);
  const sunMaterial = useRef<THREE.SpriteMaterial>(null);
  const stars = useRef<THREE.Points>(null);
  const [dayMap, nightMap, normalMap, cloudMap] = useTexture(EARTH_TEXTURE_URLS);
  const glowTexture = useMemo(createOrbitalGlowTexture, []);
  const sunDirection = useMemo(() => new THREE.Vector3(0.42, 0.63, -0.24).normalize(), []);
  const earthSegments = quality.mobile ? [96, 64] : [128, 96];
  const atmosphereSegments = quality.mobile ? [64, 48] : [96, 64];

  useEffect(() => {
    dayMap.colorSpace = THREE.SRGBColorSpace;
    nightMap.colorSpace = THREE.SRGBColorSpace;
    cloudMap.colorSpace = THREE.SRGBColorSpace;
    [dayMap, nightMap, normalMap, cloudMap].forEach((texture) => {
      texture.anisotropy = quality.mobile ? 2 : 4;
      texture.needsUpdate = true;
    });
  }, [cloudMap, dayMap, nightMap, normalMap, quality.mobile]);

  const earthUniforms = useMemo(() => ({
    dayMap: { value: dayMap },
    nightMap: { value: nightMap },
    normalMap: { value: normalMap },
    opacity: { value: 1 },
    sunDirection: { value: sunDirection },
  }), [dayMap, nightMap, normalMap, sunDirection]);

  const atmosphereUniforms = useMemo(() => ({
    opacity: { value: 0.38 },
    sunDirection: { value: sunDirection },
  }), [sunDirection]);

  useEffect(() => () => {
    glowTexture.dispose();
    [dayMap, nightMap, normalMap, cloudMap].forEach((texture) => texture.dispose());
    EARTH_TEXTURE_URLS.forEach((url) => useTexture.clear(url));
  }, [cloudMap, dayMap, glowTexture, nightMap, normalMap]);

  useFrame(() => {
    const elapsed = timeline.current.elapsed;
    const fade = deriveAlvoradaVisualState(elapsed).earthOpacity;
    if (spaceRoot.current) spaceRoot.current.visible = fade > 0.001;
    if (earthRoot.current) {
      earthRoot.current.visible = fade > 0.001;
      earthRoot.current.scale.setScalar(1 + smoothRange(elapsed, 3.7, 4.5) * 0.025);
    }
    if (cloudMesh.current) cloudMesh.current.rotation.y = timeline.current.ambientElapsed * 0.0045;
    if (earthMaterial.current) earthMaterial.current.uniforms.opacity.value = fade;
    if (atmosphereMaterial.current) atmosphereMaterial.current.uniforms.opacity.value = fade * 0.38;
    if (sunMaterial.current) sunMaterial.current.opacity = fade * (0.66 + smoothRange(elapsed, 0, 2) * 0.22);
    if (stars.current) {
      (stars.current.material as THREE.PointsMaterial).opacity = fade;
    }
  });

  return (
    <group ref={spaceRoot}>
      <group ref={earthRoot}>
        <mesh>
          <sphereGeometry args={[EARTH_RADIUS, earthSegments[0], earthSegments[1]]} />
          <shaderMaterial
            ref={earthMaterial}
            fragmentShader={earthFragmentShader}
            transparent
            uniforms={earthUniforms}
            vertexShader={earthVertexShader}
          />
        </mesh>

        <mesh ref={cloudMesh} scale={1.006}>
          <sphereGeometry args={[EARTH_RADIUS, atmosphereSegments[0], atmosphereSegments[1]]} />
          <meshBasicMaterial
            map={cloudMap}
            color="#d8e9f8"
            blending={THREE.NormalBlending}
            opacity={0.27}
            transparent
            depthWrite={false}
          />
        </mesh>

        <mesh scale={1.019}>
          <sphereGeometry args={[EARTH_RADIUS, atmosphereSegments[0], atmosphereSegments[1]]} />
          <shaderMaterial
            ref={atmosphereMaterial}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            fragmentShader={atmosphereFragmentShader}
            side={THREE.BackSide}
            transparent
            uniforms={atmosphereUniforms}
            vertexShader={atmosphereVertexShader}
          />
        </mesh>

        <BrazilLayer />
        <RioGrandeDoSulLayer />
        <SantaRosaMarker />
      </group>

      <sprite position={sunDirection.clone().multiplyScalar(17)} scale={[4.8, 4.8, 1]}>
        <spriteMaterial
          ref={sunMaterial}
          map={glowTexture}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          opacity={0.7}
          transparent
          toneMapped={false}
        />
      </sprite>

      <Stars
        ref={stars}
        radius={68}
        depth={32}
        count={quality.mobile ? 720 : 1250}
        factor={2.1}
        saturation={0.14}
        fade
        speed={0}
      />
    </group>
  );
}
