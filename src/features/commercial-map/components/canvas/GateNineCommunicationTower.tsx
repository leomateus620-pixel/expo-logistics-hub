import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MapEntity } from '../../types';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { GATE_NINE_COMMUNICATION_TOWER as spec, GATE_NINE_LIGHTNING } from '../../data/gateNineCommunicationTower';
import { buildGateNineCommunicationTowerGeometry, buildGateNineCommunicationTowerPlan, buildGateNineLightningGeometry } from '../../utils/gateNineCommunicationTower';
import { advanceGateNineLightning, createGateNineLightningState } from '../../utils/gateNineLightning';
import { COMMERCIAL_MAP_ANIMATION, requestCommercialMapAnimationFrame } from '../../utils/frameActivity';
import { commercialMapDiagnosticsEnabled } from '../../utils/performanceDiagnostics';

const NO_RAYCAST = () => undefined;
const glowVertex = `varying vec3 vNormal; varying vec3 vWorld;
void main(){ vec4 world=modelMatrix*vec4(position,1.); vWorld=world.xyz;
vNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*world; }`;
const glowFragment = `uniform float uOpacity; uniform vec3 uColor; varying vec3 vNormal; varying vec3 vWorld;
void main(){ float radial=pow(abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld))),1.6);
gl_FragColor=vec4(uColor,uOpacity*radial);
#include <colorspace_fragment>
}`;
const cloudVertex = `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const cloudFragment = `uniform float uOpacity; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y); }
void main(){ vec2 p=(vUv-.5)*2.; float edge=1.-smoothstep(.34,1.,length(p));
float mist=noise(p*3.)*.55+noise(p*7.+vec2(12.,4.))*.3+noise(p*15.)*.15;
gl_FragColor=vec4(vec3(.74,.86,1.),uOpacity*edge*smoothstep(.18,.72,mist));
#include <colorspace_fragment>
}`;

/** One resident mast, one bounded lightning channel, and the shared scene's existing frame owner. */
export function GateNineCommunicationTower({ entities, active = true, opacity = 1, reducedGraphics = false }: {
  entities: readonly MapEntity[]; active?: boolean; opacity?: number; reducedGraphics?: boolean;
}) {
  const gl = useThree(s => s.gl), invalidate = useThree(s => s.invalidate);
  const rainEnabled = useCommercialMapStore(s => s.rainModeActive);
  const hydrology = useCommercialMapStore(s => s.hydrologicalModeActive);
  const plan = useMemo(() => buildGateNineCommunicationTowerPlan(entities), [entities]);
  const available = Boolean(plan);
  const presentationOpacity = Math.max(0, Math.min(1, opacity));
  const enabled = rainEnabled && active && !hydrology && available;
  const timeline = useMemo(createGateNineLightningState, []);
  const bolt = useRef<THREE.Group>(null);
  const skyGlow = useRef<THREE.Mesh>(null);
  const topLight = useRef<THREE.PointLight>(null), shaftLight = useRef<THREE.PointLight>(null);
  const resources = useMemo(() => {
    if (!available) return null;
    const parts = buildGateNineCommunicationTowerGeometry();
    const materials = {
      steel: new THREE.MeshStandardMaterial({ color: '#9ba5ae', metalness: .82, roughness: .4, emissive: '#e2efff', emissiveIntensity: 0 }),
      concrete: new THREE.MeshStandardMaterial({ color: '#99978d', roughness: .95, emissive: '#d7e7fa', emissiveIntensity: 0 }),
      antenna: new THREE.MeshStandardMaterial({ color: '#e3e4e0', metalness: .17, roughness: .55, emissive: '#f0f6ff', emissiveIntensity: 0, side: THREE.DoubleSide }),
    };
    const lightning = buildGateNineLightningGeometry();
    const core = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const halo = [new THREE.Color('#d5e8ff'), new THREE.Color('#91b8ff')].map(color => new THREE.ShaderMaterial({
      vertexShader: glowVertex, fragmentShader: glowFragment, uniforms: { uOpacity: { value: 0 }, uColor: { value: color } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    const cloudMaterial = new THREE.ShaderMaterial({ vertexShader: cloudVertex, fragmentShader: cloudFragment,
      uniforms: { uOpacity: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      toneMapped: false, side: THREE.DoubleSide });
    const corona = new THREE.SphereGeometry(.058, 12, 8), cloud = new THREE.PlaneGeometry(8, 4);
    const coronaMaterial = new THREE.MeshBasicMaterial({ color: '#edf5ff', transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    return { parts, materials, lightning, core, halo, cloudMaterial, cloud, corona, coronaMaterial };
  }, [available]);
  useEffect(() => () => {
    if (!resources) return;
    resources.parts.forEach(part => part.geometry.dispose());
    Object.values(resources.materials).forEach(material => material.dispose());
    resources.lightning.forEach(geometry => geometry.dispose()); resources.core.dispose();
    resources.halo.forEach(material => material.dispose()); resources.cloudMaterial.dispose(); resources.cloud.dispose();
    resources.corona.dispose(); resources.coronaMaterial.dispose();
  }, [resources]);
  useEffect(() => {
    if (!resources) return;
    Object.values(resources.materials).forEach(material => {
      const transparent = presentationOpacity < 1;
      if (material.transparent !== transparent) {
        material.transparent = transparent; material.needsUpdate = true;
      }
      material.opacity = presentationOpacity;
    });
    invalidate();
  }, [invalidate, presentationOpacity, resources]);
  useEffect(() => {
    advanceGateNineLightning(timeline, enabled, performance.now());
    if (!enabled && resources) {
      Object.values(resources.materials).forEach(material => { material.emissiveIntensity = 0; });
      if (bolt.current) bolt.current.visible = false;
      if (topLight.current) topLight.current.intensity = 0;
      if (shaftLight.current) shaftLight.current.intensity = 0;
    }
    invalidate();
  }, [enabled, invalidate, resources, timeline]);
  useEffect(() => () => {
    advanceGateNineLightning(timeline, false, performance.now());
    delete gl.domElement.dataset.gateNineCommunicationTower;
  }, [gl, timeline]);
  useFrame(({ camera }) => {
    if (!resources || !plan) return;
    const frame = advanceGateNineLightning(timeline, enabled, performance.now());
    const energy = frame.energy * presentationOpacity;
    if (bolt.current) bolt.current.visible = frame.phase === 'strike';
    resources.core.opacity = energy;
    resources.halo[0].uniforms.uOpacity.value = energy * .56;
    resources.halo[1].uniforms.uOpacity.value = energy * .13;
    resources.cloudMaterial.uniforms.uOpacity.value = energy * .38;
    resources.coronaMaterial.opacity = energy;
    for (const geometry of resources.lightning) {
      const count = geometry.getAttribute('position').count;
      geometry.setDrawRange(0, Math.floor(count * frame.leader / 3) * 3);
    }
    resources.materials.steel.emissiveIntensity = energy * 3.4;
    resources.materials.concrete.emissiveIntensity = energy * 1.3;
    resources.materials.antenna.emissiveIntensity = energy * 2.1;
    if (topLight.current) topLight.current.intensity = energy * 58;
    if (shaftLight.current) shaftLight.current.intensity = energy * 26;
    if (skyGlow.current) skyGlow.current.quaternion.copy(camera.quaternion);
    if (commercialMapDiagnosticsEnabled) gl.domElement.dataset.gateNineCommunicationTower = JSON.stringify({
      phase: frame.phase, elapsedMs: Math.round(frame.elapsedMs), energy: Number(energy.toFixed(3)),
      activations: timeline.activations, strikes: timeline.strikes, position: plan.position,
      estimate: spec.confidence, measuredHeight: null, geometries: resources.parts.length + resources.lightning.length + 2,
    });
    if (frame.needsFrame) requestCommercialMapAnimationFrame(gl, invalidate, COMMERCIAL_MAP_ANIMATION.rain);
  }, .45);
  if (!plan || !resources) return null;
  return <group name={spec.presentationId} position={plan.position as [number, number, number]} visible={active} dispose={null}>
    {resources.parts.map(part => <mesh key={part.key} name={`gate9-tower-${part.key}`}
      geometry={part.geometry} material={resources.materials[part.key]} castShadow={!reducedGraphics}
      receiveShadow raycast={NO_RAYCAST} dispose={null} />)}
    {/* Keep the two lights resident: rain toggles do not alter shader light counts. */}
    <pointLight ref={topLight} name="gate9-lightning-top" position={[0, spec.height + .25, 0]} color="#d9ebff" intensity={0} distance={18} decay={2} />
    <pointLight ref={shaftLight} name="gate9-lightning-shaft" position={[.3, spec.height * .43, .15]} color="#e9f3ff" intensity={0} distance={13} decay={2} />
    <group ref={bolt} name="gate9-lightning-discharge" visible={false}>
      {resources.lightning.map((geometry, index) => <mesh key={index} name={`gate9-lightning-channel-${index}`}
        geometry={geometry} material={index === 0 ? resources.core : resources.halo[index - 1]}
        raycast={NO_RAYCAST} renderOrder={30 + index} dispose={null} />)}
      <mesh ref={skyGlow} name="gate9-lightning-cloud" position={[4.2, GATE_NINE_LIGHTNING.cloudHeight, -3.4]}
        geometry={resources.cloud} material={resources.cloudMaterial} raycast={NO_RAYCAST} renderOrder={29} dispose={null} />
      <mesh name="gate9-lightning-contact" position={[0, spec.height, 0]} geometry={resources.corona}
        material={resources.coronaMaterial} raycast={NO_RAYCAST} renderOrder={35} dispose={null} />
    </group>
  </group>;
}
