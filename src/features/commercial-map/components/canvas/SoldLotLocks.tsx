import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createSoldLockGeometry } from '../../utils/soldLockGeometry';
import { createSoldCheckGeometry } from '../../utils/soldCheckGeometry';
import { lotPresentationLift } from '../../utils/externalLotPresentation';
import type { Coordinate } from '../../types';
import { isSoldLot, placeSoldLock, type SoldLotSurface, type SoldLockPlacement } from '../../utils/soldLotPresentation';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

const NO_RAYCAST = () => undefined;
const NO_OBSTACLES: readonly Coordinate[][] = [];
interface Presentation {
  selectedId?: string | null;
  hoveredId?: string | null;
  opacity?: number;
  infrastructureMode?: boolean;
  matchingIds?: ReadonlySet<string>;
  filtersActive?: boolean;
  publicScene?: boolean;
}
type PlacementCache = WeakMap<SoldLotSurface['geometry'], SoldLockPlacement | null>;

function useStableObstacles(obstacles: readonly Coordinate[][]) {
  const identity = useRef(obstacles);
  if (obstacles.length !== identity.current.length || obstacles.some((ring, index) => ring !== identity.current[index])) identity.current = obstacles;
  return identity.current;
}

export function SoldLotLocks({ surfaces, obstacles = NO_OBSTACLES, confirmationObstacles = obstacles, ...presentation }: Presentation & {
  surfaces: readonly SoldLotSurface[]; obstacles?: readonly Coordinate[][]; confirmationObstacles?: readonly Coordinate[][];
}) {
  const stableObstacles = useStableObstacles(obstacles);
  const stableConfirmationObstacles = useStableObstacles(confirmationObstacles);
  const placements = useMemo(() => new WeakMap<SoldLotSurface['geometry'], SoldLockPlacement | null>(), [stableObstacles, stableConfirmationObstacles]);
  const { locks, confirmations, logos } = useMemo(() => {
    const locks: SoldLotSurface[] = [], confirmations: SoldLotSurface[] = [];
    const logos = new Map<string, SoldLotSurface[]>();
    for (const surface of surfaces) {
      (surface.confirmation ? confirmations : locks).push(surface);
      if (isSoldLot(surface.status) && surface.logoUrl) {
        const group = logos.get(surface.logoUrl) ?? [];
        group.push(surface); logos.set(surface.logoUrl, group);
      }
    }
    return { locks, confirmations, logos };
  }, [surfaces]);
  return <>
    {locks.length > 0 && <SoldMarkerBatch surfaces={locks} confirmation={false} obstacles={stableObstacles} placements={placements} {...presentation} />}
    {confirmations.length > 0 && <SoldMarkerBatch surfaces={confirmations} confirmation obstacles={stableConfirmationObstacles} placements={placements} {...presentation} />}
    {[...logos].map(([url, group]) => <SoldLogoGroup key={url} url={url} surfaces={group} obstacles={stableObstacles} confirmationObstacles={stableConfirmationObstacles} placements={placements} {...presentation} />)}
  </>;
}

function placementFor(surface: SoldLotSurface, placements: PlacementCache, obstacles: readonly Coordinate[][]) {
  if (!placements.has(surface.geometry)) placements.set(surface.geometry, placeSoldLock(surface, obstacles));
  return placements.get(surface.geometry);
}

function SoldMarkerBatch({ surfaces, confirmation, obstacles, placements, selectedId, hoveredId, opacity = 1, infrastructureMode = false, matchingIds, filtersActive, publicScene }: Presentation & {
  surfaces: readonly SoldLotSurface[]; confirmation: boolean;
  obstacles: readonly Coordinate[][]; placements: PlacementCache;
}) {
  const invalidate = useThree(state => state.invalidate);
  const resources = useMemo(() => {
    const geometry = confirmation ? createSoldCheckGeometry() : createSoldLockGeometry();
    const material = confirmation && publicScene
      ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4 })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: confirmation ? 1 : .48, metalness: confirmation ? 0 : .16, polygonOffset: confirmation, polygonOffsetFactor: -3, polygonOffsetUnits: -4 });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, surfaces.length));
    mesh.name = confirmation ? 'sold-lot-confirmations' : 'sold-lot-locks'; mesh.raycast = NO_RAYCAST;
    mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return { mesh, geometry, material };
  }, [surfaces.length, confirmation, publicScene]);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3(), scale = new THREE.Vector3(), color = new THREE.Color();
    let count = 0;
    const ids: string[] = [];
    for (const surface of surfaces) {
      if (!isSoldLot(surface.status) || surface.hideMarker || (confirmation && infrastructureMode)) continue;
      const placement = placementFor(surface, placements, obstacles);
      if (!placement) continue;
      position.fromArray(placement.position);
      position.y += lotPresentationLift(selectedId === surface.id, hoveredId === surface.id);
      if (confirmation && surface.logoUrl) {
        // Logo and seal fit in disjoint regions of the SAME inscribed circle.
        position.z += placement.clearance * .70;
        scale.setScalar(Math.min(.6, placement.clearance * .25));
      } else scale.setScalar(placement.scale);
      matrix.compose(position, quaternion, scale);
      resources.mesh.setMatrixAt(count, matrix);
      color.setScalar(confirmation && filtersActive && !matchingIds?.has(surface.id) && selectedId !== surface.id ? .60 : 1);
      if (confirmation) resources.mesh.setColorAt(count, color);
      count++;
      ids.push(surface.id);
    }
    resources.mesh.count = count;
    resources.mesh.userData.lotIds = ids;
    resources.mesh.instanceMatrix.needsUpdate = true;
    if (resources.mesh.instanceColor) resources.mesh.instanceColor.needsUpdate = true;
    resources.mesh.computeBoundingBox(); resources.mesh.computeBoundingSphere();
    resources.material.opacity = confirmation ? opacity : 1;
    const transparent = resources.material.opacity < .995;
    if (resources.material.transparent !== transparent) { resources.material.transparent = transparent; resources.material.needsUpdate = true; }
    resources.material.depthWrite = resources.material.opacity > .42;
    invalidate();
  }, [surfaces, obstacles, placements, resources, selectedId, hoveredId, confirmation, opacity, infrastructureMode, matchingIds, filtersActive, invalidate]);
  useEffect(() => () => { disposeInstancedMesh(resources.mesh); resources.geometry.dispose(); resources.material.dispose(); }, [resources]);
  return <primitive object={resources.mesh} dispose={null} />;
}

function SoldLogoGroup({ url, surfaces, obstacles, confirmationObstacles, placements, selectedId, hoveredId, opacity = 1, infrastructureMode = false }: Presentation & {
  url: string; surfaces: SoldLotSurface[]; obstacles: readonly Coordinate[][]; confirmationObstacles: readonly Coordinate[][]; placements: PlacementCache;
}) {
  const invalidate = useThree(state => state.invalidate);
  const assets = useMemo(() => {
    const texture = new THREE.Texture(); texture.colorSpace = THREE.SRGBColorSpace;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, depthWrite: false });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, surfaces.length));
    mesh.name = 'sold-lot-logos'; mesh.raycast = NO_RAYCAST;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return { mesh, geometry, material, texture };
  }, [surfaces.length]);
  useEffect(() => {
    let live = true;
    const image = new Image(); assets.mesh.visible = false;
    image.onload = () => { if (!live) return; assets.texture.image = image; assets.texture.needsUpdate = true; assets.mesh.visible = true; invalidate(); };
    image.onerror = () => { if (live) { assets.mesh.visible = false; invalidate(); } };
    image.src = url;
    return () => { live = false; image.src = ''; };
  }, [assets, url, invalidate]);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), scale = new THREE.Vector3();
    let count = 0;
    for (const surface of surfaces) {
      if (surface.confirmation && infrastructureMode) continue;
      const placement = placementFor(surface, placements, surface.confirmation ? confirmationObstacles : obstacles);
      if (!placement) continue;
      position.fromArray(placement.position);
      const size = surface.confirmation
        ? Math.min(placement.scale * 1.25, placement.clearance)
        : Math.max(.06, Math.min(placement.scale * 1.25, placement.clearance * 1.45));
      position.y += placement.scale * .12 + .015 + (surface.confirmation ? lotPresentationLift(selectedId === surface.id, hoveredId === surface.id) : 0);
      scale.set(size, size, 1); matrix.compose(position, rotation, scale);
      assets.mesh.setMatrixAt(count++, matrix);
    }
    assets.material.opacity = surfaces.some(surface => surface.confirmation) ? opacity : 1;
    assets.mesh.count = count; assets.mesh.instanceMatrix.needsUpdate = true;
    assets.mesh.computeBoundingBox(); assets.mesh.computeBoundingSphere(); invalidate();
  }, [assets, surfaces, obstacles, confirmationObstacles, placements, selectedId, hoveredId, opacity, infrastructureMode, invalidate]);
  useEffect(() => () => { disposeInstancedMesh(assets.mesh); assets.geometry.dispose(); assets.material.dispose(); assets.texture.dispose(); }, [assets]);
  return <primitive object={assets.mesh} dispose={null} />;
}
