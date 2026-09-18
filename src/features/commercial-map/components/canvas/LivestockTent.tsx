import { memo, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LIVESTOCK_TENT_RENDER_BUDGET, LIVESTOCK_TENT_REVISION } from '../../utils/livestockTent';
import { ruralBuildingRecipe, buildRuralGeometry } from '../../utils/ruralArchitecture';
import { applyRuralMaterialDetail } from '../../utils/ruralMaterialDetail';
import type { StrategicLandmarkBounds } from '../../utils/landmarks';

const NO_RAYCAST = () => undefined;
export interface LivestockTentMaterials {
  wall: THREE.MeshStandardMaterial; accent: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial; trim: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial; glass: THREE.MeshStandardMaterial;
  green: THREE.MeshStandardMaterial; white: THREE.MeshStandardMaterial;
  platform: THREE.MeshStandardMaterial; metal: THREE.MeshStandardMaterial;
}

function identityTexture() {
  if (typeof document === 'undefined') return null;
  const canvas=document.createElement('canvas');
  canvas.width=LIVESTOCK_TENT_RENDER_BUDGET.identityTextureWidth;
  canvas.height=LIVESTOCK_TENT_RENDER_BUDGET.identityTextureHeight;
  const c=canvas.getContext('2d'); if(!c) return null;
  // Sign is physically attached to the gable. No emissive billboard or logo
  // invented from the Sufiesta reference; the application's D4 identity stays.
  c.fillStyle='#d6d7c8';c.fillRect(0,0,canvas.width,canvas.height);
  c.strokeStyle='#737760';c.lineWidth=6;c.strokeRect(5,5,canvas.width-10,canvas.height-10);
  c.textAlign='center';c.textBaseline='middle';c.fillStyle='#344b3c';
  c.font='600 27px sans-serif';c.fillText('TENDA DA',canvas.width/2,39);
  c.font='bold 47px sans-serif';c.fillText('PECUÁRIA',canvas.width/2,87);
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.anisotropy=2;
  return texture;
}

export const LivestockTent = memo(function LivestockTent({ bounds, height, showDetail, showFocusDetail }: {
  bounds: StrategicLandmarkBounds; height: number; materials: LivestockTentMaterials;
  showDetail: boolean; showFocusDetail: boolean;
}) {
  const invalidate=useThree(state=>state.invalidate);
  const recipe=useMemo(()=>ruralBuildingRecipe('livestock',bounds.width,bounds.depth,height,showDetail,showFocusDetail),
    [bounds.width,bounds.depth,height,showDetail,showFocusDetail]);
  const geometry=useMemo(()=>buildRuralGeometry(recipe),[recipe]);
  // Three batches cover all members, regardless of the number of openings.
  // Materials and geometry are owned here; no shared landmark material disposed.
  const material=useMemo(()=>{
    const materials={
    opaque:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.87,metalness:.035}),
    metal:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.74,metalness:.13}),
    glass:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.49,metalness:.08}),
    };
    Object.values(materials).forEach(applyRuralMaterialDetail);
    return materials;
  },[]);
  const texture=useMemo(identityTexture,[]);
  const sign=useMemo(()=>new THREE.MeshStandardMaterial({map:texture,color:'#dcded3',roughness:.88,metalness:0}),[texture]);
  const signGeometry=useMemo(()=>new THREE.BoxGeometry(bounds.width*.39,.21,.022),[bounds.width]);
  useEffect(()=>{invalidate();return ()=>{Object.values(geometry).forEach(g=>g.dispose());};},[geometry,invalidate]);
  useEffect(()=>()=>{Object.values(material).forEach(m=>m.dispose());sign.dispose();texture?.dispose();},[material,sign,texture]);
  useEffect(()=>()=>signGeometry.dispose(),[signGeometry]);
  return <group name="tenda-pecuaria-d4" userData={{revision:LIVESTOCK_TENT_REVISION,architecture:'semi-open-pavilion',windowCount:recipe.windowCount}}
    raycast={NO_RAYCAST} dispose={null}>
    <mesh name="d4-masonry-roof-and-piers" geometry={geometry.opaque} material={material.opaque} castShadow receiveShadow raycast={NO_RAYCAST}/>
    <mesh name="d4-structure-and-frames" geometry={geometry.metal} material={material.metal} castShadow={showDetail} receiveShadow raycast={NO_RAYCAST}/>
    <mesh name="d4-recessed-windows" geometry={geometry.glass} material={material.glass} raycast={NO_RAYCAST}/>
    {showDetail && <mesh name="d4-gable-identity" geometry={signGeometry} material={sign}
      position={[0,recipe.eave+recipe.rise*.30,recipe.front+.065]} raycast={NO_RAYCAST}/>}
  </group>;
});
