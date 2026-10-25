/** QA-only entry; imports the October read-only database replay and the real map.
 * Never registered in App.tsx or production inputs. No authentication bypass. */
import './official-2026-10-20/review';
import { _roots, addAfterEffect } from '@react-three/fiber';
import { PerspectiveCamera } from 'three';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import { useSoyHarvestStore, soyHarvestClock } from '@/features/commercial-map/harvest/useSoyHarvestStore';
import { soyPhaseAt } from '@/features/commercial-map/harvest/soyHarvestTimeline';
import { stopCommercialMapOrbitMotion } from '@/features/commercial-map/utils/cameraTransition';
import type { OrbitControls } from 'three-stdlib';

const samples: {at:number; calls:number; triangles:number}[]=[];
let recording=false;
addAfterEffect(()=>{
  const state=[..._roots.values()][0]?.store.getState();
  if(recording && state && samples.length<10000) samples.push({at:performance.now(),calls:state.gl.info.render.calls,triangles:state.gl.info.render.triangles});
});
Object.assign(window,{__soyQA:{
  pose(position:[number,number,number],target:[number,number,number]) {
    const state=[..._roots.values()][0]?.store.getState(); if(!state)return;
    const controls=state.controls as OrbitControls;
    stopCommercialMapOrbitMotion(state.camera,controls);
    state.camera.position.fromArray(position); controls.target.fromArray(target);
    state.camera.lookAt(...target); state.camera.updateMatrixWorld(); state.invalidate();
  },
  command(name: string, ...args: unknown[]) { return (useSoyHarvestStore.getState() as unknown as Record<string, (...parameters: unknown[]) => unknown>)[name](...args); },
  map(patch: Parameters<typeof useCommercialMapStore.setState>[0]) { useCommercialMapStore.setState(patch); },
  capture(){
    const state=[..._roots.values()][0]?.store.getState(); if(!state)return null;
    const camera=state.camera as PerspectiveCamera,controls=state.controls as OrbitControls;
    const model:Record<string,unknown>={};
    for(const name of ['soy-tractor-planter','soy-high-clearance-sprayer','soy-john-deere-x9','soy-grain-truck']) {
      const object=state.scene.getObjectByName(name);if(object)model[name]={position:object.position.toArray(),rotation:object.rotation.toArray(),visible:object.visible};
    }
    return {camera:{position:camera.position.toArray(),target:controls.target.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov,zoom:camera.zoom,near:camera.near,far:camera.far,
      controls:{enabled:controls.enabled,enableDamping:controls.enableDamping,minDistance:controls.minDistance,maxDistance:controls.maxDistance,minPolarAngle:controls.minPolarAngle,maxPolarAngle:controls.maxPolarAngle}},
      model,render:{...state.gl.info.render},memory:{...state.gl.info.memory,programs:state.gl.info.programs?.length},
      cycle:{status:useSoyHarvestStore.getState().status,elapsed:soyHarvestClock.elapsed,enabled:useSoyHarvestStore.getState().enabled,field:useSoyHarvestStore.getState().fieldState},
      selection:useCommercialMapStore.getState().selectedEntityId};
  },
  seek(time:number){useSoyHarvestStore.getState().pause();soyHarvestClock.elapsed=time;soyHarvestClock.lastNow=null;useSoyHarvestStore.setState({seconds:Math.floor(time),phase:soyPhaseAt(time).id}); [..._roots.values()][0]?.store.getState().invalidate();},
  probe(start:boolean){recording=start;if(start)samples.length=0;return samples;},
}});
