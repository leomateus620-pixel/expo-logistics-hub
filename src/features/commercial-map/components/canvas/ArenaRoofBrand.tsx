import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import * as THREE from 'three';
import { FENASOJA_2028_COLORS } from '@/lib/fenasoja-brand';
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
      faces: new THREE.MeshStandardMaterial({ color: FENASOJA_2028_COLORS.softWhite, vertexColors: true, roughness: 0.26, metalness: 0.16,
        emissive: '#eef2ef', emissiveIntensity: 0.1 }),
      nightFaces: new THREE.MeshStandardMaterial({ color: '#eef2ef', roughness: 0.32, metalness: 0.16, emissive: '#eef2ef', emissiveIntensity: 0.65 }),
      returns: new THREE.MeshStandardMaterial({ color: '#767e84', roughness: 0.38, metalness: 0.25, emissive: '#e4e4df' }),
      // Preserve the official RGB values: scene reflections must not wash out
      // the emblem. Its relief/backing still uses the scene lighting/shadows.
      symbol: new THREE.MeshBasicMaterial({ map, color: '#ffffff', toneMapped: false,
        alphaTest: 0.035, depthWrite: true }),
    };
  }, [gl, source]);
  useLayoutEffect(() => {
    materials.returns.emissiveIntensity = night ? 0.08 : 0.025;
    invalidate();
  }, [night, materials, invalidate]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => {
    materials.map.dispose(); materials.faces.dispose(); materials.nightFaces.dispose(); materials.returns.dispose(); materials.symbol.dispose();
  }, [materials]);

  return <group name="arena-fenasoja-roof-brand" dispose={null} userData={{ officialSymbol: ARENA_ROOF_BRAND.symbol,
    roofConforming: true, horizontal: true, layout: geometry.layout }}>
    <mesh name="arena-brand-letter-faces" geometry={geometry.faces} material={night ? materials.nightFaces : materials.faces} castShadow receiveShadow raycast={NO_RAYCAST} />
    <mesh name="arena-brand-relief-edges" geometry={geometry.returns} material={materials.returns} castShadow receiveShadow raycast={NO_RAYCAST} />
    <mesh name="arena-brand-official-symbol" geometry={geometry.symbol} material={materials.symbol} raycast={NO_RAYCAST} />
  </group>;
}

/** Asynchronous branding never suspends the existing arena. */
export function ArenaRoofBrand(props: Props) {
  return <Suspense fallback={null}><MountedArenaRoofBrand {...props} /></Suspense>;
}
