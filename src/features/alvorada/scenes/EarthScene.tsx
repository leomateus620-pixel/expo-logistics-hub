import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stars, useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from '../capabilities';
import { getEarthTextureUrls } from '../earthAssets';
import { EARTH_RADIUS, latitudeLongitudeToVector3 } from '../geo';
import { useAlvoradaTimeline } from '../TimelineContext';
import { deriveAlvoradaVisualState } from '../timeline';
import { BrazilLayer, RioGrandeDoSulLayer, SantaRosaMarker } from './GeographicLayers';

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
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D normalMap;
  uniform sampler2D cloudMap;
  uniform vec3 sunDirection;
  uniform float opacity;
  uniform float cloudOffset;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 albedo = texture2D(dayMap, vUv).rgb;
    vec3 cities = texture2D(nightMap, vUv).rgb;
    vec3 normal = normalize(vWorldNormal);
    // Transform the tangent-space normal into the globe frame; R alone is not height.
    vec3 tangent = normalize(vec3(-normal.z, 0.0001, normal.x));
    vec3 bitangent = normalize(cross(normal, tangent));
    vec3 detail = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
    vec3 surfaceNormal = normalize(normal + (tangent * detail.x + bitangent * detail.y) * 0.16);
    float solarAngle = dot(normal, sunDirection);
    float day = smoothstep(-0.14, 0.22, solarAngle);
    float night = 1.0 - smoothstep(-0.2, 0.08, solarAngle);
    float diffuse = max(dot(surfaceNormal, sunDirection), 0.0);
    // Source blue chroma identifies open water without another mask texture.
    float water = smoothstep(0.003, 0.045, albedo.b - max(albedo.r, albedo.g));
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 halfVector = normalize(sunDirection + viewDirection);
    float reflection = pow(max(dot(surfaceNormal, halfVector), 0.0), 100.0) * water * day;
    vec2 cloudUv = vec2(fract(vUv.x + cloudOffset + 0.0015), vUv.y);
    float cloudShadow = texture2D(cloudMap, cloudUv).r * day;
    vec3 surface = albedo * (0.07 + day * 0.17 + diffuse * 1.12);
    surface *= 1.0 - cloudShadow * 0.15;
    // One geographically registered emission term, suppressed across the terminator.
    surface += cities * vec3(1.0, 0.68, 0.32) * night * 1.55;
    surface += vec3(1.0, 0.86, 0.64) * reflection * 0.38;
    gl_FragColor = vec4(surface, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const cloudFragmentShader = `
  uniform sampler2D cloudMap;
  uniform vec3 sunDirection;
  uniform float opacity;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    // Native satellite luminance retains thin cloud filaments as transparency.
    float density = texture2D(cloudMap, vUv).r;
    if (density < 0.02) discard;
    float sunlight = smoothstep(-0.18, 0.5, dot(normalize(vWorldNormal), sunDirection));
    float body = smoothstep(0.04, 0.8, density);
    vec3 color = mix(vec3(0.018, 0.034, 0.066), vec3(0.91, 0.94, 0.97), sunlight);
    color *= mix(0.78, 1.0, body);
    gl_FragColor = vec4(color, density * opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const atmosphereFragmentShader = `
  uniform vec3 sunDirection;
  uniform float opacity;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    // abs prevents the back-face shell from painting a solid blue limb.
    float rim = pow(1.0 - abs(dot(viewDirection, normal)), 5.0);
    float daylight = smoothstep(-0.3, 0.55, dot(normal, sunDirection));
    vec3 color = mix(vec3(0.025, 0.12, 0.32), vec3(0.22, 0.48, 0.8), daylight);
    gl_FragColor = vec4(color, rim * opacity * (0.35 + daylight * 0.65));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function EarthScene({ quality }: { quality: AlvoradaQualityProfile }) {
  const timeline = useAlvoradaTimeline();
  const { gl } = useThree();
  const root = useRef<THREE.Group>(null);
  const cloudMesh = useRef<THREE.Mesh>(null);
  const stars = useRef<THREE.Points>(null);
  // A quality decline must not restart loading during the journey.
  const [textureUrls] = useState(() => getEarthTextureUrls(quality.mobile));
  const configureTextures = useCallback((loaded: THREE.Texture[]) => {
    loaded.forEach((texture, index) => {
      texture.colorSpace = index < 2 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.anisotropy = Math.min(quality.mobile ? 2 : 4, gl.capabilities.getMaxAnisotropy());
      texture.wrapS = THREE.RepeatWrapping;
      texture.needsUpdate = true;
    });
  }, [gl, quality.mobile]);
  // Configure in layout before drei uploads, avoiding a second color-space upload.
  const [dayMap, nightMap, normalMap, cloudMap] = useTexture(textureUrls, configureTextures);
  const sunDirection = useMemo(() => latitudeLongitudeToVector3(8, 6, 1).normalize(), []);
  const earthUniforms = useMemo(() => ({
    dayMap: { value: dayMap }, nightMap: { value: nightMap }, normalMap: { value: normalMap },
    cloudMap: { value: cloudMap }, cloudOffset: { value: 0 }, opacity: { value: 1 },
    sunDirection: { value: sunDirection },
  }), [cloudMap, dayMap, nightMap, normalMap, sunDirection]);
  const cloudUniforms = useMemo(() => ({
    cloudMap: { value: cloudMap }, opacity: { value: 0.57 }, sunDirection: { value: sunDirection },
  }), [cloudMap, sunDirection]);
  const atmosphereUniforms = useMemo(() => ({
    opacity: { value: 0.28 }, sunDirection: { value: sunDirection },
  }), [sunDirection]);

  useEffect(() => () => {
    [dayMap, nightMap, normalMap, cloudMap].forEach((texture) => texture.dispose());
    useTexture.clear(textureUrls);
  }, [cloudMap, dayMap, nightMap, normalMap, textureUrls]);

  useFrame(() => {
    const fade = deriveAlvoradaVisualState(timeline.current.elapsed).earthOpacity;
    if (root.current) root.current.visible = fade > 0.001;
    if (fade <= 0.001) return;
    const cloudRotation = timeline.current.ambientElapsed * 0.002;
    if (cloudMesh.current) cloudMesh.current.rotation.y = cloudRotation;
    earthUniforms.cloudOffset.value = cloudRotation / (Math.PI * 2);
    earthUniforms.opacity.value = fade;
    cloudUniforms.opacity.value = fade * 0.57;
    atmosphereUniforms.opacity.value = fade * 0.28;
    if (stars.current) (stars.current.material as THREE.PointsMaterial).opacity = fade * 0.45;
  });

  const segments = quality.mobile ? 80 : 112;
  return (
    <group ref={root} name="AlvoradaEarth">
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, segments, Math.round(segments * 0.66)]} />
        <shaderMaterial fragmentShader={earthFragmentShader} vertexShader={earthVertexShader}
          uniforms={earthUniforms} transparent />
      </mesh>
      <mesh ref={cloudMesh} scale={1.003}>
        <sphereGeometry args={[EARTH_RADIUS, 80, 48]} />
        <shaderMaterial fragmentShader={cloudFragmentShader} vertexShader={earthVertexShader}
          uniforms={cloudUniforms} transparent depthWrite={false} />
      </mesh>
      <mesh scale={1.006}>
        <sphereGeometry args={[EARTH_RADIUS, 80, 48]} />
        <shaderMaterial fragmentShader={atmosphereFragmentShader} vertexShader={earthVertexShader}
          uniforms={atmosphereUniforms} blending={THREE.AdditiveBlending}
          side={THREE.BackSide} transparent depthWrite={false} />
      </mesh>
      <BrazilLayer />
      <RioGrandeDoSulLayer />
      <SantaRosaMarker />
      <Stars ref={stars} radius={68} depth={32} count={quality.mobile ? 300 : 560}
        factor={1.15} saturation={0} fade speed={0} />
    </group>
  );
}
