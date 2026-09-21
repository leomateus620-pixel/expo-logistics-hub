import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '../../constants';
import type { CommercialMapEnvironmentExtent } from '../../data/commercialMapEnvironment';
import { publishContinuousGround } from '../../utils/continuousGroundMaterial';
import { SunrisePostProcessing } from './CommercialMapEnvironment';
import { TerritorialEnvironment } from './TerritorialEnvironment';
import { EssentialSceneLayer } from './EssentialSceneLayer';
import { PublicContextGroup } from './PublicContextGroup';

/** Public daylight. The existing direct frame owner retains error handling,
 * invalidation and context recovery; no second render loop or post pass. */
export function PublicMapEnvironment({ extent }: { extent: CommercialMapEnvironmentExtent }) {
  const scene = useThree(state => state.scene);
  const ground = useMemo(() => new THREE.MeshStandardMaterial({ color: '#929b91', roughness: 1 }), []);
  const size = Math.max(extent.width, extent.depth) * 12;
  useEffect(() => () => ground.dispose(), [ground]);
  useLayoutEffect(() => publishContinuousGround(scene, {
    material: ground, center: [extent.centerX, extent.centerZ], size,
  }), [extent.centerX, extent.centerZ, ground, scene, size]);
  return <>
    <color attach="background" args={['#e2e4e6']} />
    <ambientLight intensity={1.1} color="#ffffff" />
    <hemisphereLight args={['#ffffff', '#9b9b9b', 1.25]} />
    <directionalLight position={[40, 100, 45]} intensity={2.2} color="#ffffff" />
    <PublicContextGroup>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[extent.centerX, COMMERCIAL_MAP_GROUND_ELEVATION, extent.centerZ]} material={ground} raycast={() => undefined}>
        <planeGeometry args={[size, size]} />
      </mesh>
      <EssentialSceneLayer id="territorial-context"><TerritorialEnvironment /></EssentialSceneLayer>
    </PublicContextGroup>
    <SunrisePostProcessing qualityTier="reduced" enabled={false} />
  </>;
}
