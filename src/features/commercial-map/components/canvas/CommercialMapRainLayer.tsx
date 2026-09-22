import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { COMMERCIAL_MAP_ANIMATION, requestCommercialMapAnimationFrame } from '../../utils/frameActivity';
import * as THREE from 'three';
import type { MapEntity } from '../../types';
import type { CommercialMapQualityTier } from '../../utils/viewport';
import { commercialRainRuntime, COMMERCIAL_RAIN_BUDGETS, resolveRainQuality } from '../../utils/rainRuntime';
import { buildRainGroundAnchors, buildRainRunoffAnchors, type RainGroundAnchor } from '../../utils/rainPlacement';
import { commercialMapDiagnosticsEnabled, markCommercialMapStage } from '../../utils/performanceDiagnostics';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { RainWetSurfaceRegistry } from './rainWetSurfaces';
import { resolveCommercialMapExecutionPolicy } from '../../utils/executionPolicy';

const NO_RAYCAST = () => undefined;
// Fixed world-space period: moving/zooming only recycles particles at a faded
// cell boundary and never rescales their trajectories around the camera.
const RAIN_CELL_RADIUS = 18;
const random = (seed: number) => { const n = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return n - Math.floor(n); };

function particleGeometry(count: number, anchors?: readonly RainGroundAnchor[]) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5,0,0,.5,0,0,-.5,1,0,.5,1,0],3));
  geometry.setIndex([0,1,2,2,1,3]);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds.set(anchors?.[i] ?? [random(i*7+1),random(i*7+2),random(i*7+3),random(i*7+4)],i*4);
  }
  geometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seeds,4));
  geometry.instanceCount=count;
  return geometry;
}

const vertexShader = `
attribute vec4 aSeed;
uniform float uTime;
uniform float uRadius;
uniform float uKind;
uniform float uBlend;
uniform vec3 uOrigin;
varying vec2 vUv;
varying float vFade;
varying vec3 vWorld;
void main(){
  vUv=vec2(position.x+.5,position.y);
  float phase=fract(uTime*(.65+aSeed.w*.45)+aSeed.w);
  vec3 p;
  vFade=1.;
  if(uKind<.5){
    vec3 drift=vec3(uTime*.25,-uTime*(3.+aSeed.w*2.),uTime*.09);
    p=mod(aSeed.xyz*uRadius*2.+drift-uOrigin+uRadius,uRadius*2.)-uRadius+uOrigin;
    vec3 cellDistance=abs(p-uOrigin)/uRadius;
    float seamFade=1.-smoothstep(.72,1.,max(max(cellDistance.x,cellDistance.y),cellDistance.z));
    float distanceToCamera=length(p-cameraPosition);
    float width=.024+distanceToCamera*.0005;
    vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
    p+=right*position.x*width+vec3(-.08,1.,-.025)*position.y*(.18+aSeed.w*.32);
    vFade=seamFade*smoothstep(.2,.8,distanceToCamera)*smoothstep(.15,1.8,p.y)*(1.-smoothstep(.65,1.25,distanceToCamera/uRadius))*(.36+aSeed.w*.30);
  }else if(uKind<1.5){
    float radius=(.012+phase*.105);
    p=aSeed.xyz+vec3(position.x*2.*radius,.002,(position.y-.5)*2.*radius);
    vFade=(1.-phase)*(1.-smoothstep(20.,45.,distance(aSeed.xyz,cameraPosition)));
  }else if(uKind<2.5){
    p=aSeed.xyz+vec3(phase*.025,-phase*.8,0.);
    vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
    p+=right*position.x*.012+vec3(0.,position.y*.13,0.);
    vFade=(1.-smoothstep(25.,55.,distance(aSeed.xyz,cameraPosition)))*(1.-phase);
  }else{
    float radius=.11+aSeed.w*.07;
    p=aSeed.xyz+vec3(position.x*2.*radius,0.,(position.y-.5)*radius);
    vFade=.6;
  }
  vWorld=p;
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
}`;

const fragmentShader = `
uniform float uTime;
uniform float uBlend;
uniform float uNight;
uniform float uLampGain;
uniform float uKind;
uniform vec3 uLamps[8];
varying vec2 vUv;
varying float vFade;
varying vec3 vWorld;
void main(){
  float lamp=0.;
  for(int i=0;i<8;i++) lamp=max(lamp,exp(-distance(vWorld,uLamps[i])*.6));
  float alpha;
  vec3 color=mix(vec3(.62,.73,.8),vec3(.15,.21,.29),uNight);
  color=mix(color,vec3(.95,.72,.40),lamp*uLampGain*.7);
  if(uKind<.5 || (uKind>1.5 && uKind<2.5)){
    alpha=pow(max(0.,1.-abs(vUv.x-.5)*2.),1.6)*sin(vUv.y*3.14159)*.46;
  }else if(uKind<1.5){
    float r=length((vUv-.5)*2.);
    alpha=smoothstep(.68,.8,r)*(1.-smoothstep(.8,1.,r))*.26;
  }else{
    vec2 uv=(vUv-.5)*2.;
    float edge=length(uv)+sin(uv.x*11.+uv.y*7.)*.08;
    alpha=(1.-smoothstep(.6,1.,edge))*.32;
    float ripple=sin(length(uv)*32.-uTime*6.)*.025;
    color=mix(vec3(.11,.19,.23),vec3(.025,.047,.075),uNight)+ripple;
    color+=lamp*uLampGain*vec3(.37,.25,.11);
  }
  gl_FragColor=vec4(color,alpha*uBlend*vFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Four pooled draws; no texture/render target and no resource creation on toggles. */
export function CommercialMapRainLayer({entities, qualityTier, active=true}: {
  entities: readonly MapEntity[]; qualityTier: CommercialMapQualityTier; active?: boolean;
}) {
  const gl=useThree((s)=>s.gl);
  const scene=useThree((s)=>s.scene);
  const invalidate=useThree((s)=>s.invalidate);
  const rain=useMemo(()=>commercialRainRuntime(scene),[scene]);
  const hydrology=useCommercialMapStore((s)=>s.hydrologicalModeActive);
  const group=useRef<THREE.Group>(null);
  const registry=useMemo(()=>new RainWetSurfaceRegistry(),[]);
  const tier=resolveRainQuality(qualityTier,gl.capabilities.maxTextureSize,(navigator as Navigator & {deviceMemory?:number}).deviceMemory);
  const budget=COMMERCIAL_RAIN_BUDGETS[tier];
  const execution=resolveCommercialMapExecutionPolicy(tier);
  const resources=useMemo(()=>{
    markCommercialMapStage('rain-preparation:start');
    const ground=buildRainGroundAnchors(entities,160);
    const runoff=buildRainRunoffAnchors(entities,160);
    const uniforms={
      uTime:{value:0},uRadius:{value:RAIN_CELL_RADIUS},uOrigin:{value:new THREE.Vector3()},
      uBlend:rain.blend,uNight:rain.night,uLampGain:{value:0},
      uLamps:{value:Array.from({length:8},()=>new THREE.Vector3(1e6,1e6,1e6))},
    };
    const make=(kind:number,count:number,anchors?:readonly RainGroundAnchor[])=>{
      const geometry=particleGeometry(count,anchors);
      const material=new THREE.ShaderMaterial({
        name:`CommercialMapRain:${kind}`,vertexShader,fragmentShader,uniforms:{...uniforms,uKind:{value:kind}},
        transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,
      });
      return {geometry,material};
    };
    const result={uniforms,drops:make(0,4000),splashes:make(1,ground.length,ground),
      runoff:make(2,runoff.length,runoff),puddles:make(3,ground.length,ground),
      groundCount:ground.length,runoffCount:runoff.length,forward:new THREE.Vector3(),
      lamps:[] as THREE.Vector3[]};
    markCommercialMapStage('rain-preparation:end');
    return result;
  },[entities,rain]);

  useEffect(()=>{
    let cancel=false;
    let timer=0;
    const instanceMatrix=new THREE.Matrix4();
    const scan=()=>{
      const pending:THREE.Object3D[]=[scene];
      // Reconcile live lamp owners rather than retaining positions from removed
      // groups. The snapshot stays bounded across layer/quality replacements.
      const lamps:THREE.Vector3[]=[];
      const chunk=()=>{
        if(cancel)return;
        const start=performance.now();
        while(pending.length && performance.now()-start<3){
          const object=pending.pop()!;
          for(const child of object.children)pending.push(child);
          const mesh=object as THREE.Mesh;
          if(mesh.material){
            const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
            for(const material of materials)registry.add(material);
          }
          // Existing authored B12/night lights; no additional light or shader-light variant.
          if((object as THREE.Light).isLight && /pool|fill|lamp/i.test(object.name) && lamps.length<1024){
            lamps.push(object.getWorldPosition(new THREE.Vector3()));
          }
          if(object.name==='luminarias-led-noturnas' && (object as THREE.InstancedMesh).isInstancedMesh){
            const fixtures=object as THREE.InstancedMesh;
            for(let i=0;i<fixtures.count && lamps.length<1024;i++){
              fixtures.getMatrixAt(i,instanceMatrix);
              lamps.push(new THREE.Vector3().setFromMatrixPosition(instanceMatrix).applyMatrix4(fixtures.matrixWorld));
            }
          }
        }
        if(pending.length)timer=window.setTimeout(chunk,32);
        else {
          resources.lamps=lamps;
          // Discovery can happen after rain has settled. Apply the same shared
          // wetness to newly attached/replaced materials on the next draw.
          cadence.current.lastWet=-1;
          invalidate();
          timer=window.setTimeout(scan,2500);
        }
      };
      chunk();
    };
    scan();
    return()=>{cancel=true;clearTimeout(timer);registry.dispose();};
  },[scene,registry,resources,invalidate]);
  useEffect(()=>()=>{
    for(const key of ['drops','splashes','runoff','puddles'] as const){resources[key].geometry.dispose();resources[key].material.dispose();}
  },[resources]);
  useEffect(()=>{invalidate();},[active,hydrology,tier,invalidate]);
  const cadence=useRef({wet:0,report:0,lamps:0,lastWet:-1});
  useFrame(({camera},delta)=>{
    if(!group.current)return;
    const now=performance.now();
    const wet=rain.blend.value;
    const lighting=useCommercialMapStore.getState();
    // The amusement-park focus also darkens the atmosphere, but does not switch
    // on the global pole network. Rain must follow the actual network controls.
    const lampsPresent=lighting.treesVisible&&!lighting.hydrologicalModeActive;
    const lampTarget=lighting.nightModeActive&&lampsPresent?1:0;
    const lampGain=THREE.MathUtils.damp(resources.uniforms.uLampGain.value,lampTarget,
      !lampsPresent?10:lampTarget?1.9:3.4,Math.min(delta,.05));
    resources.uniforms.uLampGain.value=Math.abs(lampGain-lampTarget)<.002?lampTarget:lampGain;
    group.current.visible=active && wet>0;
    resources.uniforms.uTime.value+=Math.min(delta,.05);
    camera.getWorldDirection(resources.forward);
    resources.uniforms.uOrigin.value.copy(camera.position).addScaledVector(resources.forward,resources.uniforms.uRadius.value*.65);
    resources.uniforms.uOrigin.value.y=Math.max(resources.uniforms.uRadius.value*.5,resources.uniforms.uOrigin.value.y);
    resources.drops.geometry.instanceCount=budget.drops;
    resources.splashes.geometry.instanceCount=hydrology?0:Math.min(budget.splashes,resources.groundCount);
    resources.runoff.geometry.instanceCount=hydrology?0:Math.min(budget.runoff,resources.runoffCount);
    resources.puddles.geometry.instanceCount=hydrology?0:Math.min(budget.puddles,resources.groundCount);
    const surfaceWet=active&&!hydrology?wet:0;
    if((surfaceWet!==cadence.current.lastWet && (surfaceWet===0 || surfaceWet===1))
      || (now-cadence.current.wet>1000/execution.effectUpdateHz && surfaceWet>0)) {
      registry.update(surfaceWet);cadence.current.wet=now;cadence.current.lastWet=surfaceWet;
    }
    if(now-cadence.current.lamps>1000){
      const lamps=resources.lamps;
      lamps.sort((a,b)=>a.distanceToSquared(camera.position)-b.distanceToSquared(camera.position));
      for(let i=0;i<8;i++) {
        if(lamps[i])resources.uniforms.uLamps.value[i].copy(lamps[i]);
        else resources.uniforms.uLamps.value[i].set(1e6,1e6,1e6);
      }
      cadence.current.lamps=now;
    }
    if(commercialMapDiagnosticsEnabled&&now-cadence.current.report>500){
      gl.domElement.dataset.commercialMapRain=JSON.stringify({blend:wet,night:rain.night.value,tier,
        drops:budget.drops,splashes:resources.splashes.geometry.instanceCount,runoff:resources.runoff.geometry.instanceCount,
        puddles:resources.puddles.geometry.instanceCount,wetMaterials:registry.size});
      cadence.current.report=now;
    }
    if(active&&wet>0)requestCommercialMapAnimationFrame(gl,invalidate,COMMERCIAL_MAP_ANIMATION.rain);
  },.5);
  return <group ref={group} name="CommercialMapRain" visible={active}>
    {(['drops','splashes','runoff','puddles'] as const).map((kind)=><mesh key={kind}
      name={`rain-${kind}`} geometry={resources[kind].geometry} material={resources[kind].material}
      frustumCulled={false} raycast={NO_RAYCAST} renderOrder={kind==='puddles'?2:10} dispose={null}/>) }
  </group>;
}

export default CommercialMapRainLayer;
