import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ARENA_CANONICAL_LAYOUT } from '../../data/arenaCanonicalLayout';
import { createArenaArchitecture } from '../../utils/arenaArchitecture';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

const NO_RAYCAST = () => undefined;
interface Props {
  bounds: { width: number; depth: number };
  materials: Record<'roof'|'green'|'metal'|'white'|'platform'|'wall',THREE.MeshStandardMaterial>;
  showDetail: boolean; showFocusDetail: boolean; reducedGraphics: boolean;
}
/** Single canonical landmark renderer; F still owns picking, labels and commercial identity. */
export function SicrediArena({bounds,materials,showDetail,reducedGraphics}:Props) {
  const ribs=useRef<THREE.InstancedMesh>(null);
  const {gl,invalidate}=useThree();
  const geometry=useMemo(()=>createArenaArchitecture(bounds.width,bounds.depth),[bounds.width,bounds.depth]);
  const identity=useMemo(()=>{
    const canvas=document.createElement('canvas');
    [canvas.width,canvas.height]=ARENA_CANONICAL_LAYOUT.architecture.signTexture;
    const ctx=canvas.getContext('2d');
    if(ctx){ctx.fillStyle='#245d36';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f2f1e7';
      ctx.font='600 73px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(ARENA_CANONICAL_LAYOUT.architecture.sign,canvas.width/2,canvas.height/2,canvas.width-46);}
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.anisotropy=Math.min(4,gl.capabilities.getMaxAnisotropy());
    return {map,material:new THREE.MeshStandardMaterial({map,roughness:.82,metalness:0}),
      seam:new THREE.LineBasicMaterial({color:'#aeb8b8',transparent:true,opacity:.25}),
      marking:new THREE.LineBasicMaterial({color:'#ded9c9',transparent:true,opacity:.65})};
  },[gl]);
  useLayoutEffect(()=>{
    const mesh=ribs.current;if(!mesh)return;
    const matrix=new THREE.Matrix4();geometry.ribs.forEach((z,i)=>mesh.setMatrixAt(i,matrix.makeTranslation(0,0,z)));
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();invalidate();
  },[geometry,invalidate]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  useEffect(()=>()=>{identity.map.dispose();identity.material.dispose();identity.seam.dispose();identity.marking.dispose();},[identity]);
  useEffect(()=>{const mesh=ribs.current;return ()=>disposeInstancedMesh(mesh);},[]);
  return <group name="arena-sicredi-icatu-canonical" dispose={null} userData={{revision:ARENA_CANONICAL_LAYOUT.revision,
    canonicalFootprint:ARENA_CANONICAL_LAYOUT.arenaFootprint.sourceBounds,openFront:true,openRear:true}}>
    <mesh name="arena-floor-canonical" geometry={geometry.floor} material={materials.platform} receiveShadow raycast={NO_RAYCAST}/>
    <mesh name="arena-roof-canonical" geometry={geometry.roof} material={materials.roof} castShadow receiveShadow raycast={NO_RAYCAST}/>
    <mesh name="arena-green-arches" geometry={geometry.fascia} material={materials.green} castShadow receiveShadow raycast={NO_RAYCAST}/>
    <instancedMesh ref={ribs} name="arena-trussed-arches" args={[geometry.rib,materials.metal,geometry.ribs.length]}
      count={geometry.ribs.length} castShadow={!reducedGraphics} receiveShadow raycast={NO_RAYCAST}/>
    <mesh name="arena-columns-purlins" geometry={geometry.structure} material={materials.metal} castShadow={!reducedGraphics} receiveShadow raycast={NO_RAYCAST}/>
    <mesh name="arena-mounted-sign-backing" geometry={geometry.signBacking} material={materials.green} raycast={NO_RAYCAST}/>
    <mesh name="arena-mounted-sign-lettering" geometry={geometry.signFace} material={identity.material} raycast={NO_RAYCAST}/>
    <lineSegments name="arena-interior-court" geometry={geometry.courtLines} material={identity.marking} visible={showDetail} raycast={NO_RAYCAST}/>
    <lineSegments name="arena-roof-sheet-joints" geometry={geometry.seams} material={identity.seam} visible={showDetail && !reducedGraphics} raycast={NO_RAYCAST}/>
  </group>;
}
