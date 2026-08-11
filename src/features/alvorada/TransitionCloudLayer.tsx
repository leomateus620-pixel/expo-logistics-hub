import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAlvoradaTimeline } from './TimelineContext';
import { bellCurve, smoothRange } from './timeline';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float opacity;
  uniform float time;
  uniform float warmth;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.52;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p = p * 2.03 + 11.7;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = vUv;
    float cloud = fbm(uv * 3.25 + vec2(time * 0.035, -time * 0.018));
    cloud = smoothstep(0.32, 0.82, cloud + opacity * 0.2);
    vec3 cool = vec3(0.22, 0.34, 0.5);
    vec3 warm = vec3(0.82, 0.49, 0.3);
    vec3 color = mix(cool, warm, warmth) + cloud * vec3(0.16, 0.14, 0.12);
    float edge = smoothstep(0.0, 0.12, uv.x) * smoothstep(0.0, 0.12, uv.y)
      * smoothstep(0.0, 0.12, 1.0 - uv.x) * smoothstep(0.0, 0.12, 1.0 - uv.y);
    gl_FragColor = vec4(color, clamp(opacity * (0.72 + cloud * 0.26) * edge, 0.0, 1.0));
  }
`;

export function TransitionCloudLayer() {
  const timeline = useAlvoradaTimeline();
  const { camera } = useThree();
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const uniforms = useMemo(() => ({
    opacity: { value: 0 },
    time: { value: 0 },
    warmth: { value: 0 },
  }), []);

  useFrame((state) => {
    const elapsed = timeline.current.elapsed;
    const descentMask = bellCurve(elapsed, 4.02, 4.53, 5.12);
    const atmosphericHaze = smoothRange(elapsed, 4.88, 5.18) * (1 - smoothRange(elapsed, 5.18, 5.6)) * 0.22;
    const opacity = Math.min(1, descentMask * 1.1 + atmosphericHaze);

    if (mesh.current) {
      camera.getWorldDirection(direction);
      mesh.current.position.copy(camera.position).addScaledVector(direction, 0.72);
      mesh.current.quaternion.copy(camera.quaternion);
      mesh.current.visible = opacity > 0.002;
    }
    if (material.current) {
      material.current.uniforms.opacity.value = opacity;
      material.current.uniforms.time.value = state.clock.elapsedTime;
      material.current.uniforms.warmth.value = smoothRange(elapsed, 4.28, 4.92);
    }
  });

  return (
    <mesh ref={mesh} renderOrder={1000} visible={false}>
      <planeGeometry args={[3.2, 3.2]} />
      <shaderMaterial
        ref={material}
        depthTest={false}
        depthWrite={false}
        fragmentShader={fragmentShader}
        transparent
        uniforms={uniforms}
        vertexShader={vertexShader}
      />
    </mesh>
  );
}
