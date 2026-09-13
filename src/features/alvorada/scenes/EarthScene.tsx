import { useEffect, useMemo, useRef, useState } from 'react';
import { Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  createPlaceholderTexture,
  loadAlvoradaTexture,
  releaseAlvoradaTexture,
} from '../alvoradaTextures';
import type { AlvoradaQualityProfile } from '../capabilities';
import { getEarthTextureUrls } from '../earthAssets';
import { EARTH_RADIUS, latitudeLongitudeToVector3 } from '../geo';
import { useAlvoradaReadiness, useAlvoradaTimeline } from '../TimelineContext';
import { deriveAlvoradaVisualState } from '../timeline';
import { BrazilLayer, RioGrandeDoSulLayer, SantaRosaMarker } from './GeographicLayers';

/** Secondary maps fade in over this many seconds of authored time once decoded. */
const SECONDARY_ARRIVAL_SECONDS = 0.9;

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
  uniform float nightMix;
  uniform float normalMix;
  uniform float cloudMix;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 albedo = texture2D(dayMap, vUv).rgb;
    vec3 cities = texture2D(nightMap, vUv).rgb * nightMix;
    vec3 normal = normalize(vWorldNormal);
    // Transform the tangent-space normal into the globe frame; R alone is not height.
    vec3 tangent = normalize(vec3(-normal.z, 0.0001, normal.x));
    vec3 bitangent = normalize(cross(normal, tangent));
    vec3 detail = (texture2D(normalMap, vUv).xyz * 2.0 - 1.0) * normalMix;
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
    float cloudShadow = texture2D(cloudMap, cloudUv).r * day * cloudMix;
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
  const readiness = useAlvoradaReadiness();
  const { gl } = useThree();
  const root = useRef<THREE.Group>(null);
  const cloudMesh = useRef<THREE.Mesh>(null);
  const stars = useRef<THREE.Points>(null);
  // The texture tier is fixed by the device profile and matches what the host
  // warmed; a narrow-container framing or a quality decline never reloads it.
  const [textureUrls] = useState(() => getEarthTextureUrls(quality.textureTier === 'mobile'));
  const [anisotropy] = useState(() => Math.min(quality.mobile ? 2 : 4, gl.capabilities.getMaxAnisotropy()));
  const placeholders = useMemo(() => ({
    day: createPlaceholderTexture([9, 22, 46, 255]),
    night: createPlaceholderTexture([0, 0, 0, 255]),
    normal: createPlaceholderTexture([128, 128, 255, 255]),
    cloud: createPlaceholderTexture([0, 0, 0, 0]),
  }), []);
  // Per-map arrival ramps (0 → 1) advanced by the authored clock.
  const arrival = useRef({ night: 0, normal: 0, cloud: 0 });
  const arrived = useRef({ night: false, normal: false, cloud: false });
  const sunDirection = useMemo(() => latitudeLongitudeToVector3(8, 6, 1).normalize(), []);
  const earthUniforms = useMemo(() => ({
    dayMap: { value: placeholders.day as THREE.Texture },
    nightMap: { value: placeholders.night as THREE.Texture },
    normalMap: { value: placeholders.normal as THREE.Texture },
    cloudMap: { value: placeholders.cloud as THREE.Texture },
    cloudOffset: { value: 0 },
    opacity: { value: 1 },
    nightMix: { value: 0 },
    normalMix: { value: 0 },
    cloudMix: { value: 0 },
    sunDirection: { value: sunDirection },
  }), [placeholders, sunDirection]);
  const cloudUniforms = useMemo(() => ({
    cloudMap: { value: placeholders.cloud as THREE.Texture },
    opacity: { value: 0 },
    sunDirection: { value: sunDirection },
  }), [placeholders, sunDirection]);
  const atmosphereUniforms = useMemo(() => ({
    opacity: { value: 0.28 }, sunDirection: { value: sunDirection },
  }), [sunDirection]);

  useEffect(() => {
    let active = true;
    const [dayUrl, nightUrl, normalUrl, cloudUrl] = textureUrls;
    const configure = (texture: THREE.Texture, color: boolean) => {
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.anisotropy = anisotropy;
      texture.wrapS = THREE.RepeatWrapping;
      texture.needsUpdate = true;
      return texture;
    };

    // The albedo is the only map the globe cannot appear without: it gates the
    // clock. Night lights, relief and clouds fade in whenever they arrive.
    loadAlvoradaTexture(dayUrl).then((texture) => {
      if (!active) return;
      earthUniforms.dayMap.value = configure(texture, true);
      readiness.current.report({ kind: 'critical-assets-ready', detail: { url: dayUrl } });
    }).catch((error: unknown) => {
      if (!active) return;
      readiness.current.report({
        kind: 'asset-failed',
        detail: { critical: true, url: dayUrl, message: error instanceof Error ? error.message : String(error) },
      });
    });

    const secondary: Array<[string, keyof typeof arrived.current, boolean, (texture: THREE.Texture) => void]> = [
      [nightUrl, 'night', true, (texture) => { earthUniforms.nightMap.value = texture; }],
      [normalUrl, 'normal', false, (texture) => { earthUniforms.normalMap.value = texture; }],
      [cloudUrl, 'cloud', false, (texture) => {
        earthUniforms.cloudMap.value = texture;
        cloudUniforms.cloudMap.value = texture;
      }],
    ];
    secondary.forEach(([url, key, color, bind]) => {
      loadAlvoradaTexture(url).then((texture) => {
        if (!active) return;
        bind(configure(texture, color));
        arrived.current[key] = true;
      }).catch((error: unknown) => {
        if (!active) return;
        // The globe stays presentable without a secondary map.
        readiness.current.report({
          kind: 'asset-failed',
          detail: { critical: false, url, message: error instanceof Error ? error.message : String(error) },
        });
      });
    });

    return () => {
      active = false;
      textureUrls.forEach(releaseAlvoradaTexture);
      Object.values(placeholders).forEach((texture) => texture.dispose());
    };
  }, [anisotropy, cloudUniforms, earthUniforms, placeholders, readiness, textureUrls]);

  useFrame(() => {
    const fade = deriveAlvoradaVisualState(timeline.current.elapsed).earthOpacity;
    if (root.current) root.current.visible = fade > 0.001;
    if (fade <= 0.001) return;
    const step = timeline.current.delta / SECONDARY_ARRIVAL_SECONDS;
    (Object.keys(arrival.current) as Array<keyof typeof arrival.current>).forEach((key) => {
      if (arrived.current[key] && arrival.current[key] < 1) {
        // Maps decoded before the first frame appear complete; later ones fade in.
        arrival.current[key] = timeline.current.elapsed === 0
          ? 1
          : Math.min(1, arrival.current[key] + step);
      }
    });
    const cloudRotation = timeline.current.ambientElapsed * 0.002;
    if (cloudMesh.current) cloudMesh.current.rotation.y = cloudRotation;
    earthUniforms.cloudOffset.value = cloudRotation / (Math.PI * 2);
    earthUniforms.opacity.value = fade;
    earthUniforms.nightMix.value = arrival.current.night;
    earthUniforms.normalMix.value = arrival.current.normal;
    earthUniforms.cloudMix.value = arrival.current.cloud;
    cloudUniforms.opacity.value = fade * 0.57 * arrival.current.cloud;
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
