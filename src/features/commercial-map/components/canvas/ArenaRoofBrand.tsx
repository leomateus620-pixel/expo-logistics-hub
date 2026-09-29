import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import * as THREE from 'three';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { ARENA_ROOF_BRAND, createArenaRoofBrand } from '../../utils/arenaRoofBrand';

const NO_RAYCAST = () => undefined;
interface Props { width: number; depth: number }

function MountedArenaRoofBrand({ width, depth }: Props) {
  const font = useLoader(FontLoader, ARENA_ROOF_BRAND.font);
  const source = useLoader(THREE.TextureLoader, ARENA_ROOF_BRAND.symbol);
  const night = useCommercialMapStore(state => state.nightModeActive);
  const { gl, invalidate } = useThree();
  const geometry = useMemo(() => createArenaRoofBrand(width, depth, font), [width, depth, font]);
  const materials = useMemo(() => {
    // Own only this clone; never dispose the official image cached by the loader.
    const map = source.clone();
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.needsUpdate = true;
    return {
      map,
      faces: new THREE.MeshStandardMaterial({ color: '#b5dcf4', roughness: 0.46, metalness: 0.06, emissive: '#eef2ef' }),
      returns: new THREE.MeshStandardMaterial({ color: '#397fad', roughness: 0.4, metalness: 0.32, emissive: '#376779' }),
      symbol: new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', color: '#ffffff',
        alphaTest: 0.035, roughness: 0.46, metalness: 0, depthWrite: true }),
    };
  }, [gl, source]);
  useLayoutEffect(() => {
    materials.faces.color.set(night ? '#eef2ef' : '#b5dcf4');
    materials.faces.roughness = night ? 0.32 : 0.46;
    materials.faces.metalness = night ? 0.16 : 0.06;
    materials.faces.emissiveIntensity = night ? 0.65 : 0;
    materials.returns.color.set(night ? '#143c48' : '#397fad');
    materials.returns.emissiveIntensity = night ? 0.12 : 0;
    materials.symbol.emissiveIntensity = night ? 0.75 : 0;
    invalidate();
  }, [night, materials, invalidate]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => {
    materials.map.dispose(); materials.faces.dispose(); materials.returns.dispose(); materials.symbol.dispose();
  }, [materials]);

  return <group name="arena-fenasoja-roof-brand" dispose={null} userData={{ officialSymbol: ARENA_ROOF_BRAND.symbol,
    roofConforming: true, horizontal: true, layout: geometry.layout }}>
    <mesh name="arena-brand-letter-faces" geometry={geometry.faces} material={materials.faces} castShadow receiveShadow raycast={NO_RAYCAST} />
    <mesh name="arena-brand-relief-edges" geometry={geometry.returns} material={materials.returns} castShadow receiveShadow raycast={NO_RAYCAST} />
    <mesh name="arena-brand-official-symbol" geometry={geometry.symbol} material={materials.symbol} raycast={NO_RAYCAST} />
  </group>;
}

/** Asynchronous branding never suspends the existing arena. */
export function ArenaRoofBrand(props: Props) {
  return <Suspense fallback={null}><MountedArenaRoofBrand {...props} /></Suspense>;
}
