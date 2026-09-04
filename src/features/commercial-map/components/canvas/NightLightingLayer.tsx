import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  CommercialElectricalConnection,
  CommercialElectricalNode,
} from '../../data/electricalInfrastructure';
import type { MapEntity } from '../../types';
import {
  buildElectricalPoleCrossarmLayouts,
  resolveElectricalNodePlacements,
} from '../../utils/electricalInfrastructure';
import { buildNightLampFixtures, NIGHT_LIGHTING_CONFIG } from '../../utils/nightLighting';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';

const NO_RAYCAST = () => undefined;
const REVEAL_EPSILON = 0.002;
/** Multiplicative pools read stronger on the tone-mapped direct path used while
 * the camera moves; this keeps both render paths visually matched. */
const DIRECT_PATH_POOL_GAIN = 0.66;
const DIRECT_PATH_GLOW_GAIN = 0.8;

const LAMP_ATTRIBUTE = 'aLamp';

const POOL_VERTEX_SHADER = /* glsl */ `
  attribute vec4 aLamp;
  varying vec2 vLocal;
  varying vec4 vLamp;
  void main() {
    vLocal = position.xz;
    vLamp = aLamp;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const POOL_FRAGMENT_SHADER = /* glsl */ `
  uniform float uReveal;
  uniform float uGain;
  uniform vec3 uCool;
  uniform vec3 uWarm;
  varying vec2 vLocal;
  varying vec4 vLamp;
  void main() {
    // Local +X points away from the pole: stretch the pool along the throw.
    vec2 p = vec2(vLocal.x * 0.86, vLocal.y);
    float d2 = dot(p, p);
    if (d2 >= 1.0) discard;
    float pool = pow(1.0 - d2, 1.55);
    float hotspot = exp(-d2 * 7.0) * 0.42;
    float angle = atan(vLocal.y, vLocal.x);
    float streak = 1.0 + 0.055 * sin(angle * 6.0 + vLamp.z * 6.2831) * smoothstep(0.15, 0.7, sqrt(d2));
    float reveal = smoothstep(vLamp.z * 0.5, vLamp.z * 0.5 + 0.5, uReveal);
    vec3 tint = mix(uCool, uWarm, vLamp.y);
    vec3 light = tint * (pool + hotspot) * streak * vLamp.x * uGain * reveal;
    gl_FragColor = vec4(light, 1.0);
  }
`;

const GLOW_VERTEX_SHADER = /* glsl */ `
  attribute vec4 aLamp;
  uniform float uSize;
  uniform float uMinAngular;
  varying vec2 vLocal;
  varying vec4 vLamp;
  varying float vBoost;
  void main() {
    vLocal = position.xy;
    vLamp = aLamp;
    vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float dist = max(0.001, -center.z);
    // Keep a few pixels of halo from any distance so far poles still read.
    float size = max(uSize, dist * uMinAngular);
    vBoost = uSize / size;
    center.xy += position.xy * size * 0.5;
    gl_Position = projectionMatrix * center;
  }
`;

const GLOW_FRAGMENT_SHADER = /* glsl */ `
  uniform float uReveal;
  uniform float uGain;
  uniform vec3 uColor;
  varying vec2 vLocal;
  varying vec4 vLamp;
  varying float vBoost;
  void main() {
    float d2 = dot(vLocal, vLocal);
    if (d2 >= 1.0) discard;
    float halo = exp(-d2 * 5.5) * (1.0 - d2);
    float core = exp(-d2 * 40.0);
    float reveal = smoothstep(vLamp.z * 0.5, vLamp.z * 0.5 + 0.5, uReveal);
    float energy = mix(1.0, vBoost, 0.72);
    vec3 color = uColor * (halo * 0.55 + core * 1.35) * vLamp.x * uGain * reveal * energy;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function createLampAttribute(values: Float32Array) {
  const attribute = new THREE.InstancedBufferAttribute(values, 4);
  attribute.name = LAMP_ATTRIBUTE;
  return attribute;
}

function NightLightingInstances({
  nodes,
  connections,
  surfaceEntities,
  rearRoadsActive,
  polesVisible,
  reducedGraphics,
}: {
  nodes: readonly CommercialElectricalNode[];
  connections: readonly CommercialElectricalConnection[];
  surfaceEntities: readonly MapEntity[];
  rearRoadsActive: boolean;
  polesVisible: boolean;
  reducedGraphics: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const armRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const glowRef = useRef<THREE.InstancedMesh>(null);
  const poolRef = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const nightModeActive = useCommercialMapStore((state) => state.nightModeActive);
  const runtime = useRef({
    reveal: nightModeActive ? 1 : 0,
    presence: polesVisible ? 1 : 0,
    applied: -1,
    lastPathGain: -1,
  });
  const config = NIGHT_LIGHTING_CONFIG;

  const fixtures = useMemo(() => {
    const placements = resolveElectricalNodePlacements(nodes, surfaceEntities, rearRoadsActive);
    const layouts = buildElectricalPoleCrossarmLayouts(nodes, connections, placements);
    return buildNightLampFixtures(placements, layouts);
  }, [connections, nodes, rearRoadsActive, surfaceEntities]);

  const lampValues = useMemo(() => {
    const values = new Float32Array(fixtures.length * 4);
    fixtures.forEach((fixture, index) => {
      values[index * 4] = fixture.intensity;
      values[index * 4 + 1] = fixture.warmth;
      values[index * 4 + 2] = fixture.seed;
      values[index * 4 + 3] = 0;
    });
    return values;
  }, [fixtures]);

  const geometries = useMemo(() => {
    const arm = new THREE.BoxGeometry(1, 1, 1);
    arm.translate(0.5, 0, 0);
    const head = new THREE.BoxGeometry(...config.headSize);
    const glow = new THREE.PlaneGeometry(2, 2, 1, 1);
    glow.setAttribute(LAMP_ATTRIBUTE, createLampAttribute(lampValues));
    const pool = new THREE.PlaneGeometry(2, 2, 1, 1);
    pool.rotateX(-Math.PI / 2);
    pool.setAttribute(LAMP_ATTRIBUTE, createLampAttribute(lampValues));
    return { arm, head, glow, pool };
  }, [config.headSize, lampValues]);

  const materials = useMemo(() => ({
    arm: new THREE.MeshStandardMaterial({
      name: 'CommercialMapNightLampArm',
      color: config.colors.arm,
      roughness: 0.62,
      metalness: 0.48,
      transparent: true,
      opacity: 0,
    }),
    head: new THREE.MeshStandardMaterial({
      name: 'CommercialMapNightLampHead',
      color: '#dfe4de',
      emissive: config.colors.led,
      emissiveIntensity: 0,
      roughness: 0.34,
      metalness: 0.12,
      transparent: true,
      opacity: 0,
      toneMapped: false,
    }),
    glow: new THREE.ShaderMaterial({
      name: 'CommercialMapNightLampGlow',
      uniforms: {
        uReveal: { value: 0 },
        uGain: { value: config.glowGain },
        uSize: { value: config.glowSize },
        uMinAngular: { value: 0.0034 },
        uColor: { value: new THREE.Color(config.colors.glow) },
      },
      vertexShader: GLOW_VERTEX_SHADER,
      fragmentShader: GLOW_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
    }),
    pool: new THREE.ShaderMaterial({
      name: 'CommercialMapNightLightPool',
      uniforms: {
        uReveal: { value: 0 },
        uGain: { value: config.poolGain },
        uCool: { value: new THREE.Color(config.colors.poolCool) },
        uWarm: { value: new THREE.Color(config.colors.poolWarm) },
      },
      vertexShader: POOL_VERTEX_SHADER,
      fragmentShader: POOL_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      // out = dst * (1 + light): the pool scales whatever surface lies under
      // it, so asphalt, lots and grass keep their own texture while lit.
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      fog: false,
      toneMapped: false,
    }),
  }), [config]);

  useLayoutEffect(() => {
    const armMesh = armRef.current;
    const headMesh = headRef.current;
    const glowMesh = glowRef.current;
    const poolMesh = poolRef.current;
    if (!armMesh || !headMesh || !poolMesh) return;
    const transform = new THREE.Object3D();
    const armThickness = 0.028;
    fixtures.forEach((fixture, index) => {
      transform.position.set(...fixture.armOrigin);
      transform.rotation.set(0, fixture.yawRadians, 0);
      transform.scale.set(fixture.armLength, armThickness, armThickness);
      transform.updateMatrix();
      armMesh.setMatrixAt(index, transform.matrix);

      transform.position.set(...fixture.headPosition);
      transform.position.y -= config.headSize[1] * 0.35;
      transform.rotation.set(0, fixture.yawRadians, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      headMesh.setMatrixAt(index, transform.matrix);
      if (glowMesh) {
        transform.position.set(...fixture.headPosition);
        transform.position.y -= config.headSize[1] * 0.9;
        transform.rotation.set(0, 0, 0);
        transform.updateMatrix();
        glowMesh.setMatrixAt(index, transform.matrix);
      }

      transform.position.set(...fixture.poolCenter);
      transform.rotation.set(0, fixture.yawRadians, 0);
      transform.scale.set(fixture.poolRadius, 1, fixture.poolRadius);
      transform.updateMatrix();
      poolMesh.setMatrixAt(index, transform.matrix);
    });
    [armMesh, headMesh, glowMesh, poolMesh].forEach((mesh) => {
      if (!mesh) return;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    });
    if (glowMesh?.boundingSphere) {
      // Billboards grow with distance; pad the culling sphere accordingly.
      glowMesh.boundingSphere.radius += 6;
    }
    runtime.current.applied = -1;
    invalidate();
  }, [config.headSize, fixtures, geometries, invalidate]);

  useEffect(() => {
    runtime.current.applied = -1;
    invalidate();
  }, [invalidate, nightModeActive, polesVisible]);

  useEffect(() => () => {
    Object.values(geometries).forEach((geometry) => geometry.dispose());
  }, [geometries]);

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials]);

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const state = runtime.current;
    const liveNight = useCommercialMapStore.getState().nightModeActive;
    const revealTarget = liveNight ? 1 : 0;
    const presenceTarget = polesVisible ? 1 : 0;
    const nextReveal = THREE.MathUtils.damp(
      state.reveal,
      revealTarget,
      liveNight ? config.revealLambdaIn : config.revealLambdaOut,
      delta,
    );
    const nextPresence = THREE.MathUtils.damp(state.presence, presenceTarget, 10, delta);
    const revealSettled = Math.abs(nextReveal - revealTarget) < REVEAL_EPSILON;
    const presenceSettled = Math.abs(nextPresence - presenceTarget) < REVEAL_EPSILON;
    state.reveal = revealSettled ? revealTarget : nextReveal;
    state.presence = presenceSettled ? presenceTarget : nextPresence;
    const reveal = state.reveal * state.presence;
    const navigating = useCommercialMapStore.getState().cameraNavigating;
    const pathGain = navigating ? 1 : 0;
    const changed = reveal !== state.applied || pathGain !== state.lastPathGain;
    if (changed) {
      state.applied = reveal;
      state.lastPathGain = pathGain;
      group.visible = reveal > REVEAL_EPSILON;
      const eased = reveal * reveal * (3 - 2 * reveal);
      materials.arm.opacity = Math.min(1, eased * 1.6);
      materials.head.opacity = Math.min(1, eased * 1.6);
      materials.head.emissiveIntensity = config.headEmissivePeak * eased;
      materials.pool.uniforms.uReveal.value = reveal;
      materials.pool.uniforms.uGain.value = config.poolGain
        * (navigating ? DIRECT_PATH_POOL_GAIN : 1);
      materials.glow.uniforms.uReveal.value = reveal;
      materials.glow.uniforms.uGain.value = config.glowGain
        * (navigating ? DIRECT_PATH_GLOW_GAIN : 1);
    }
    if (!revealSettled || !presenceSettled) invalidate();
  });

  if (fixtures.length === 0) return null;
  return (
    <group
      ref={groupRef}
      name="camada-iluminacao-noturna"
      visible={runtime.current.reveal * runtime.current.presence > REVEAL_EPSILON}
    >
      <instancedMesh
        ref={armRef}
        name="bracos-luminarias-noturnas"
        args={[geometries.arm, materials.arm, fixtures.length]}
        count={fixtures.length}
        frustumCulled
        raycast={NO_RAYCAST}
      />
      <instancedMesh
        ref={headRef}
        name="luminarias-led-noturnas"
        args={[geometries.head, materials.head, fixtures.length]}
        count={fixtures.length}
        frustumCulled
        raycast={NO_RAYCAST}
      />
      {!reducedGraphics && (
        <instancedMesh
          ref={glowRef}
          name="halos-luminarias-noturnas"
          args={[geometries.glow, materials.glow, fixtures.length]}
          count={fixtures.length}
          frustumCulled
          renderOrder={7}
          raycast={NO_RAYCAST}
        />
      )}
      <instancedMesh
        ref={poolRef}
        name="pocas-de-luz-noturnas"
        args={[geometries.pool, materials.pool, fixtures.length]}
        count={fixtures.length}
        frustumCulled
        renderOrder={6}
        raycast={NO_RAYCAST}
      />
    </group>
  );
}

/**
 * Park-wide LED lighting for Night Mode. Two heads per pole (three on chain
 * junctions) share four instanced draw calls; ground light is approximated by
 * multiplicative pools instead of hundreds of dynamic lights, so the whole
 * network fades in and out without recompiling a single scene material.
 */
export const NightLightingLayer = memo(function NightLightingLayer(props: {
  nodes: readonly CommercialElectricalNode[];
  connections: readonly CommercialElectricalConnection[];
  surfaceEntities: readonly MapEntity[];
  rearRoadsActive?: boolean;
  polesVisible: boolean;
  reducedGraphics: boolean;
}) {
  if (props.nodes.length === 0) return null;
  return (
    <NightLightingInstances
      key={props.reducedGraphics ? 'night-lighting-reduced' : 'night-lighting-full'}
      nodes={props.nodes}
      connections={props.connections}
      surfaceEntities={props.surfaceEntities}
      rearRoadsActive={props.rearRoadsActive ?? false}
      polesVisible={props.polesVisible}
      reducedGraphics={props.reducedGraphics}
    />
  );
});
