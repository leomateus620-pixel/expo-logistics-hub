import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createSoldLockGeometry } from '../../utils/soldLockGeometry';
import type { Coordinate } from '../../types';
import { isSoldLot, placeSoldLock, type SoldLotSurface } from '../../utils/soldLotPresentation';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

const NO_RAYCAST = () => undefined;
const NO_OBSTACLES: readonly Coordinate[][] = [];

export function SoldLotLocks({ surfaces, obstacles = NO_OBSTACLES, selectedId, hoveredId }: {
  surfaces: readonly SoldLotSurface[];
  obstacles?: readonly Coordinate[][];
  selectedId?: string | null;
  hoveredId?: string | null;
}) {
  const invalidate = useThree(state => state.invalidate);
  const obstacleIdentity = useRef(obstacles);
  if (obstacles.length !== obstacleIdentity.current.length || obstacles.some((ring, index) => ring !== obstacleIdentity.current[index])) obstacleIdentity.current = obstacles;
  const stableObstacles = obstacleIdentity.current;
  // Weak caching permits status/query refreshes without recomputing polygon search.
  const placementCache = useMemo(() => ({ obstacles: stableObstacles, values: new WeakMap<SoldLotSurface['geometry'], ReturnType<typeof placeSoldLock>>() }), [stableObstacles]);
  const placements = placementCache.values;
  const logoGroups = useMemo(() => {
    const groups = new Map<string, SoldLotSurface[]>();
    for (const surface of surfaces) if (isSoldLot(surface.status) && surface.logoUrl) {
      const group = groups.get(surface.logoUrl) ?? [];
      group.push(surface); groups.set(surface.logoUrl, group);
    }
    return groups;
  }, [surfaces]);
  const resources = useMemo(() => {
    const geometry = createSoldLockGeometry();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.16 });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, surfaces.length));
    mesh.name = 'sold-lot-locks'; mesh.raycast = NO_RAYCAST;
    mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return { mesh, geometry, material };
  }, [surfaces.length]);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3(), scale = new THREE.Vector3();
    let count = 0;
    const ids: string[] = [];
    for (const surface of surfaces) {
      if (!isSoldLot(surface.status)) continue;
      if (!placements.has(surface.geometry)) placements.set(surface.geometry, placeSoldLock(surface, stableObstacles));
      const placement = placements.get(surface.geometry);
      if (!placement) continue;
      position.fromArray(placement.position);
      position.y += selectedId === surface.id ? 0.055 : hoveredId === surface.id ? 0.035 : 0;
      scale.setScalar(placement.scale);
      matrix.compose(position, quaternion, scale);
      resources.mesh.setMatrixAt(count++, matrix);
      ids.push(surface.id);
    }
    resources.mesh.count = count;
    resources.mesh.userData.lotIds = ids;
    resources.mesh.instanceMatrix.needsUpdate = true;
    resources.mesh.computeBoundingBox(); resources.mesh.computeBoundingSphere();
    invalidate();
  }, [surfaces, stableObstacles, placements, resources, selectedId, hoveredId, invalidate]);
  useEffect(() => () => {
    disposeInstancedMesh(resources.mesh); resources.geometry.dispose(); resources.material.dispose();
  }, [resources]);
  return <>
    <primitive object={resources.mesh} dispose={null} />
    {[...logoGroups].map(([url, group]) => <SoldLogoGroup key={url} url={url} surfaces={group} obstacles={stableObstacles} placements={placements} />)}
  </>;
}

function SoldLogoGroup({ url, surfaces, obstacles, placements }: {
  url: string; surfaces: SoldLotSurface[]; obstacles: readonly Coordinate[][];
  placements: WeakMap<SoldLotSurface['geometry'], ReturnType<typeof placeSoldLock>>;
}) {
  const invalidate = useThree(state => state.invalidate);
  const assets = useMemo(() => {
    const texture = new THREE.Texture();
    texture.colorSpace = THREE.SRGBColorSpace;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, depthWrite: false });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, surfaces.length));
    mesh.name = 'sold-lot-logos'; mesh.raycast = NO_RAYCAST;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return { mesh, geometry, material, texture };
  }, [surfaces.length]);
  useEffect(() => {
    let live = true;
    const image = new Image();
    assets.mesh.visible = false;
    image.onload = () => { if (!live) return; assets.texture.image = image; assets.texture.needsUpdate = true; assets.mesh.visible = true; invalidate(); };
    image.onerror = () => { if (live) { assets.mesh.visible = false; invalidate(); } };
    image.src = url;
    return () => { live = false; image.src = ''; };
  }, [assets, url, invalidate]);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), scale = new THREE.Vector3();
    let count = 0;
    for (const surface of surfaces) {
      if (!placements.has(surface.geometry)) placements.set(surface.geometry, placeSoldLock(surface, obstacles));
      const placement = placements.get(surface.geometry);
      if (!placement) continue;
      position.fromArray(placement.position);
      const size = Math.max(0.06, Math.min(placement.scale * 1.25, placement.clearance * 1.45));
      position.y += placement.scale * 0.12 + 0.015;
      scale.set(size, size, 1);
      matrix.compose(position, rotation, scale);
      assets.mesh.setMatrixAt(count++, matrix);
    }
    assets.mesh.count = count; assets.mesh.instanceMatrix.needsUpdate = true;
    assets.mesh.computeBoundingBox(); assets.mesh.computeBoundingSphere(); invalidate();
  }, [assets, surfaces, obstacles, placements, invalidate]);
  useEffect(() => () => { disposeInstancedMesh(assets.mesh); assets.geometry.dispose(); assets.material.dispose(); assets.texture.dispose(); }, [assets]);
  return <primitive object={assets.mesh} dispose={null} />;
}
