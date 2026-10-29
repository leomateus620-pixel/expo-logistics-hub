import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CommercialLot, MapEntity } from '../../types';
import { createExternalLotFrameGeometry } from '../../utils/externalLotFrameGeometry';
import { externalLotFrameColor, isExternalPresentationLot, lotPresentationLift, lotPresentationTop } from '../../utils/externalLotPresentation';
import { disposeBatchedMesh } from '../../utils/instancedMeshDisposal';

const NO_RAYCAST = () => undefined;
// The existing rural mown shoulder reaches top + .014; keep a minimal .004 clearance.
const FRAME_SURFACE_OFFSET = .018;
type Entry = { entity: MapEntity; lot: CommercialLot };

/** One batch for both phases. Geometry survives status/selection/filter changes. */
export function ExternalLotFrames({ entries, selectedId, hoveredId, cartIds, matchingIds, filtersActive, infrastructureMode, opacity, publicScene }: {
  entries: readonly Entry[];
  selectedId: string | null; hoveredId: string | null;
  cartIds: ReadonlySet<string>; matchingIds: ReadonlySet<string>;
  filtersActive: boolean; infrastructureMode: boolean; opacity: number; publicScene: boolean;
}) {
  const invalidate = useThree(state => state.invalidate);
  const eligible = entries.filter(({ entity, lot }) => isExternalPresentationLot(entity, lot));
  const entitiesRef = useRef<MapEntity[]>([]);
  if (entitiesRef.current.length !== eligible.length || eligible.some((e, i) => e.entity !== entitiesRef.current[i])) {
    entitiesRef.current = eligible.map(e => e.entity);
  }
  const entities = entitiesRef.current;
  const resources = useMemo(() => {
    const sources = entities.flatMap(entity => {
      const geometry = createExternalLotFrameGeometry(entity.geometry);
      if (!geometry) return [];
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      if (flat !== geometry) geometry.dispose();
      return [{ entity, geometry: flat }];
    });
    if (!sources.length) return null;
    const material = publicScene
      ? new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
      : new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const mesh = new THREE.BatchedMesh(sources.length, sources.reduce((n, s) => n + s.geometry.getAttribute('position').count, 0), 0, material);
    mesh.name = 'external-lot-status-frames'; mesh.raycast = NO_RAYCAST;
    mesh.castShadow = false; mesh.receiveShadow = !publicScene;
    mesh.sortObjects = false;
    const ids = new Map<string, number>();
    const matrix = new THREE.Matrix4();
    for (const { entity, geometry } of sources) {
      const id = mesh.addInstance(mesh.addGeometry(geometry));
      ids.set(entity.id, id);
      matrix.makeTranslation(0, lotPresentationTop(entity) + FRAME_SURFACE_OFFSET, 0);
      mesh.setMatrixAt(id, matrix); mesh.setVisibleAt(id, false);
      geometry.dispose();
    }
    mesh.userData.instanceIdsByEntityId = Object.fromEntries(ids);
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    return { mesh, material, ids };
  }, [entities, publicScene]);
  useLayoutEffect(() => {
    if (!resources) return;
    const matrix = new THREE.Matrix4(), color = new THREE.Color(), muted = new THREE.Color('#c7d1c9');
    for (const { entity, lot } of entries) {
      const id = resources.ids.get(entity.id);
      if (id === undefined) continue;
      const statusColor = externalLotFrameColor(lot.status);
      resources.mesh.setVisibleAt(id, Boolean(statusColor) && !infrastructureMode);
      if (!statusColor) continue;
      color.set(statusColor);
      if (filtersActive && !matchingIds.has(entity.id) && selectedId !== entity.id) color.lerp(muted, .76);
      resources.mesh.setColorAt(id, color);
      matrix.makeTranslation(0, lotPresentationTop(entity) + FRAME_SURFACE_OFFSET + lotPresentationLift(
        selectedId === entity.id, hoveredId === entity.id, lot.status !== 'SOLD' && cartIds.has(lot.id),
      ), 0);
      resources.mesh.setMatrixAt(id, matrix);
    }
    resources.material.opacity = opacity;
    const transparent = opacity < .995;
    if (resources.material.transparent !== transparent) { resources.material.transparent = transparent; resources.material.needsUpdate = true; }
    resources.material.depthWrite = opacity > .42;
    invalidate();
  }, [resources, entries, selectedId, hoveredId, cartIds, matchingIds, filtersActive, infrastructureMode, opacity, invalidate]);
  useEffect(() => () => { disposeBatchedMesh(resources?.mesh); resources?.material.dispose(); }, [resources]);
  return resources ? <primitive object={resources.mesh} dispose={null} /> : null;
}
