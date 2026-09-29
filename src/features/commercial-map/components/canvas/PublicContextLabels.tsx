import { memo, useEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Coordinate, MapEntity } from '../../types';
import { publicContextLabels } from '../../public/publicContextLabels';
import type { PublicExternalScenePolicy } from '../../public/publicScenePolicy';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { COMMERCIAL_MAP_OBSTRUCTION_SELECTOR } from '../../utils/contextualViewport';
import { dimensionRectsOverlap, type DimensionScreenRect } from '../../utils/pavilionDimensions';

const ORIGIN = (): [number,number] => [0,0];
/** One inert SVG, updated only by the map's existing demand-rendered frames. */
export const PublicContextLabels = memo(function PublicContextLabels({entities,policy}: {
  entities: readonly MapEntity[]; policy: PublicExternalScenePolicy;
}) {
  const gl=useThree(s=>s.gl), size=useThree(s=>s.size), invalidate=useThree(s=>s.invalidate);
  const svg=useRef<SVGSVGElement>(null), nodes=useRef(new Map<string,SVGGElement>());
  const labels=useMemo(()=>publicContextLabels(entities,policy),[entities,policy]);
  const selectedId=useCommercialMapStore(s=>s.selectedEntityId);
  const dirty=useRef(true), previous=useRef('');
  const point=useMemo(()=>new THREE.Vector3(),[]);
  useEffect(()=>{dirty.current=true;invalidate();},[labels,selectedId,invalidate]);
  useEffect(()=>{
    const shell=gl.domElement.closest('.public-map-shell'); if(!shell)return;
    const observer=new MutationObserver(records=>{if(records.some(r=>!svg.current?.contains(r.target))){dirty.current=true;invalidate();}});
    observer.observe(shell,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
    return()=>observer.disconnect();
  },[gl,invalidate]);
  useFrame(({camera,size})=>{
    if(!svg.current)return;
    camera.updateMatrixWorld();
    const key=[size.width,size.height,...camera.matrixWorld.elements,...camera.projectionMatrix.elements].join(',');
    if(key===previous.current&&!dirty.current)return;
    previous.current=key;dirty.current=false;
    const project=(p:Coordinate,y:number)=>{point.set(p[0],y,p[1]).project(camera);return {x:(point.x+1)*size.width/2,y:(1-point.y)*size.height/2,z:point.z};};
    const canvas=gl.domElement.getBoundingClientRect();
    const obstacles:DimensionScreenRect[]=[];
    gl.domElement.closest('.public-map-shell')?.querySelectorAll<HTMLElement>(`${COMMERCIAL_MAP_OBSTRUCTION_SELECTOR}, .commercial-map-label`).forEach(element=>{
      if(!element.getClientRects().length)return;const rect=element.getBoundingClientRect();
      obstacles.push({left:rect.left-canvas.left,right:rect.right-canvas.left,top:rect.top-canvas.top,bottom:rect.bottom-canvas.top});
    });
    const selection=entities.find(e=>e.id===selectedId);
    if(selection) {
      const points=selection.geometry.coordinates.flat().map(p=>project(p,selection.geometry.elevation));
      obstacles.push({left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))});
    }
    // In close inspection the selected lot and its identity own the view.
    const close=camera.position.distanceTo(new THREE.Vector3(policy.focusBounds.centerX,0,policy.focusBounds.centerZ))<policy.focusBounds.diagonal*.48;
    let shown=0;
    for(const label of labels) {
      const node=nodes.current.get(label.id);if(!node)continue;
      const p=project(label.anchor,label.elevation),a=project(label.edge[0],label.elevation),b=project(label.edge[1],label.elevation);
      const width=label.name.length*(label.block?6.6:5.7)+14,height=label.block?22:19;
      const rect={left:p.x-width/2,right:p.x+width/2,top:p.y-height/2,bottom:p.y+height/2};
      const visible=!close&&shown<(size.width<600?6:12)&&p.z>=-1&&p.z<=1
        &&Math.hypot(a.x-b.x,a.y-b.y)>width*.8&&rect.left>8&&rect.right<size.width-8&&rect.top>8&&rect.bottom<size.height-8
        &&!obstacles.some(o=>dimensionRectsOverlap(rect,o,6));
      node.style.display=visible?'':'none';if(!visible)continue;
      node.setAttribute('transform',`translate(${p.x} ${p.y})`);
      node.querySelector('rect')!.setAttribute('x',String(-width/2));node.querySelector('rect')!.setAttribute('width',String(width));
      obstacles.push(rect);shown++;
    }
  });
  return <Html calculatePosition={ORIGIN} zIndexRange={[1,1]} style={{width:size.width,height:size.height,pointerEvents:'none'}}>
    <svg ref={svg} aria-hidden="true" style={{position:'absolute',inset:0,width:'100%',height:'100%',overflow:'hidden',pointerEvents:'none'}}>
      {labels.map(label=><g key={label.id} data-public-context-label={label.id} ref={node=>{if(node)nodes.current.set(label.id,node);else nodes.current.delete(label.id);}} style={{display:'none'}}>
        <rect y={label.block?-11:-9.5} height={label.block?22:19} rx="4" fill={label.block?'#edf3e9ed':'#f7f8f5df'} stroke="#60736855" strokeWidth=".7" />
        <text textAnchor="middle" dominantBaseline="central" fill="#30423a" fontFamily="Arial, sans-serif" fontSize={label.block?12:10.5} fontWeight={label.block?700:500}>{label.name}</text>
      </g>)}
    </svg>
  </Html>;
});
