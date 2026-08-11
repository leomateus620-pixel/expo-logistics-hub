import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAlvoradaTimeline } from './TimelineContext';
import { deriveAlvoradaVisualState, smoothRange } from './timeline';
import { createCloudTexture, seededRandom } from './visualTextures';

interface CorridorCloudPlacement {
  depth: number;
  drift: number;
  phase: number;
  position: [number, number, number];
  rotation: number;
  scale: [number, number, number];
  stratum: number;
  travel: number;
}

type AmbientTimelineState = {
  ambientElapsed?: number;
  elapsed: number;
};

const CARD_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const CARD_FRAGMENT_SHADER = `
  uniform sampler2D cloudMap;
  uniform vec2 texelSize;
  uniform vec3 coolColor;
  uniform vec3 warmColor;
  uniform float opacity;
  uniform float time;
  uniform float warmth;

  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vec2 driftUv = vUv + vec2(sin(time * 0.07) * 0.006, cos(time * 0.053) * 0.004);
    float density = texture2D(cloudMap, driftUv).a;
    if (density < 0.01) discard;

    float east = texture2D(cloudMap, driftUv + vec2(texelSize.x, 0.0)).a;
    float north = texture2D(cloudMap, driftUv + vec2(0.0, texelSize.y)).a;
    vec2 gradient = vec2(density - east, density - north);
    vec2 sunAcrossCard = normalize(vec2(0.84, 0.31));
    float directionalLight = 0.52 + max(dot(normalize(gradient + vec2(0.0001)), sunAcrossCard), 0.0) * 0.48;
    float body = smoothstep(0.018, 0.25, density);
    float edgeLight = (1.0 - smoothstep(0.07, 0.31, density)) * directionalLight;
    float horizonWarmth = warmth * (0.35 + edgeLight * 0.65);
    vec3 color = mix(coolColor, warmColor, horizonWarmth);
    color *= 0.78 + directionalLight * 0.28;

    gl_FragColor = vec4(color, body * opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const HAZE_VERTEX_SHADER = `
  varying vec3 vDirection;

  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HAZE_FRAGMENT_SHADER = `
  uniform float opacity;
  uniform float time;
  uniform float warmth;
  varying vec3 vDirection;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.54;
    for (int octave = 0; octave < 3; octave++) {
      value += noise(p) * amplitude;
      p = p * 2.03 + 7.1;
      amplitude *= 0.48;
    }
    return value;
  }

  void main() {
    vec3 samplePosition = vDirection * 3.4 + vec3(time * 0.025, -time * 0.011, 0.0);
    float structure = fbm(samplePosition);
    vec3 cool = vec3(0.12, 0.29, 0.51);
    vec3 warm = vec3(0.94, 0.49, 0.2);
    vec3 color = mix(cool, warm, warmth * (0.74 + structure * 0.26));
    color += vec3(structure - 0.5) * 0.11;
    float structureMask = smoothstep(0.2, 0.78, structure);
    float alpha = opacity * (0.68 + structureMask * 0.32);

    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createCorridorPlacements() {
  const random = seededRandom(20280430);

  return Array.from({ length: 12 }, (_, index): CorridorCloudPlacement => {
    const stratum = index % 3;
    const depth = 0.34 + Math.pow(random(), 1.42) * 5.3;
    const horizontalReach = 0.32 + depth * 0.68;
    const verticalReach = 0.2 + depth * 0.38;

    return {
      depth,
      drift: 0.17 + random() * 0.21,
      phase: random() * Math.PI * 2,
      position: [
        (random() * 2 - 1) * horizontalReach,
        (random() * 2 - 1) * verticalReach,
        -depth,
      ],
      rotation: (random() - 0.5) * 0.58,
      scale: [
        0.9 + depth * 0.66 + random() * 0.7,
        0.52 + depth * 0.31 + random() * 0.38,
        1,
      ],
      stratum,
      travel: 0.08 + Math.min(depth * 0.12, 0.48),
    };
  });
}

function createCorridorMaterial(texture: THREE.Texture, stratum: number) {
  const coolColors = ['#6685a5', '#7994af', '#91a5b9'] as const;
  const warmColors = ['#e5a16e', '#edb083', '#f2c39a'] as const;

  return new THREE.ShaderMaterial({
    depthTest: true,
    depthWrite: false,
    fragmentShader: CARD_FRAGMENT_SHADER,
    fog: false,
    side: THREE.DoubleSide,
    transparent: true,
    uniforms: {
      cloudMap: { value: texture },
      coolColor: { value: new THREE.Color(coolColors[stratum]) },
      opacity: { value: 0 },
      texelSize: { value: new THREE.Vector2(1 / 384, 1 / 384) },
      time: { value: 0 },
      warmColor: { value: new THREE.Color(warmColors[stratum]) },
      warmth: { value: 0 },
    },
    vertexShader: CARD_VERTEX_SHADER,
  });
}

function createHazeMaterial() {
  return new THREE.ShaderMaterial({
    depthTest: true,
    depthWrite: false,
    fragmentShader: HAZE_FRAGMENT_SHADER,
    fog: false,
    side: THREE.BackSide,
    transparent: true,
    uniforms: {
      opacity: { value: 0 },
      time: { value: 0 },
      warmth: { value: 0 },
    },
    vertexShader: HAZE_VERTEX_SHADER,
  });
}

export function TransitionCloudLayer() {
  const timeline = useAlvoradaTimeline();
  const { camera } = useThree();
  const root = useRef<THREE.Group>(null);
  const cloudMeshes = useRef<THREE.Mesh[]>([]);
  const texture = useMemo(() => createCloudTexture(384), []);
  const placements = useMemo(createCorridorPlacements, []);
  const cardMaterials = useMemo(
    () => [0, 1, 2].map((stratum) => createCorridorMaterial(texture, stratum)),
    [texture],
  );
  const hazeMaterial = useMemo(createHazeMaterial, []);

  useEffect(() => () => {
    cardMaterials.forEach((material) => material.dispose());
    hazeMaterial.dispose();
    texture.dispose();
  }, [cardMaterials, hazeMaterial, texture]);

  useFrame(() => {
    const timelineState = timeline.current as AmbientTimelineState;
    const elapsed = timelineState.elapsed;
    const ambientElapsed = timelineState.ambientElapsed ?? elapsed;
    const visualState = deriveAlvoradaVisualState(elapsed);
    const visibility = visualState.transitionOpacity;
    const warmth = smoothRange(elapsed, 4.35, 5.95);
    const passage = smoothRange(elapsed, 4.2, 6.25);

    if (root.current) {
      root.current.visible = visibility > 0.001;
      root.current.position.copy(camera.position);
      root.current.quaternion.copy(camera.quaternion);
    }

    cardMaterials.forEach((material, stratum) => {
      material.uniforms.opacity.value = Math.min(
        0.2,
        visibility * (0.22 - stratum * 0.04),
      );
      material.uniforms.time.value = ambientElapsed;
      material.uniforms.warmth.value = warmth;
    });

    hazeMaterial.uniforms.opacity.value = Math.min(
      0.34,
      visibility * 0.45,
    );
    hazeMaterial.uniforms.time.value = ambientElapsed;
    hazeMaterial.uniforms.warmth.value = warmth;

    placements.forEach((placement, index) => {
      const mesh = cloudMeshes.current[index];
      if (!mesh) return;
      const motion = ambientElapsed * placement.drift + placement.phase;
      mesh.position.set(
        placement.position[0] + Math.sin(motion) * (0.06 + placement.depth * 0.025),
        placement.position[1] + Math.cos(motion * 0.74) * (0.04 + placement.depth * 0.012),
        placement.position[2] + passage * placement.travel,
      );
      mesh.rotation.z = placement.rotation + Math.sin(motion * 0.43) * 0.025;
    });
  });

  return (
    <group ref={root} visible={false}>
      {placements.map((placement, index) => (
        <mesh
          key={`${placement.stratum}-${index}`}
          ref={(mesh) => {
            if (mesh) cloudMeshes.current[index] = mesh;
          }}
          frustumCulled={false}
          position={placement.position}
          rotation={[0, 0, placement.rotation]}
          scale={placement.scale}
        >
          <planeGeometry args={[1, 1, 1, 1]} />
          <primitive attach="material" object={cardMaterials[placement.stratum]} />
        </mesh>
      ))}

      <mesh frustumCulled={false} renderOrder={1000}>
        <sphereGeometry args={[0.2, 24, 16]} />
        <primitive attach="material" object={hazeMaterial} />
      </mesh>
    </group>
  );
}
