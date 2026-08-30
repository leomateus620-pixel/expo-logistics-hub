import { memo, useEffect, useMemo, useState } from 'react';
import { Html } from '@react-three/drei';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  REAR_PARKING_BLOCKS, REAR_PARKING_BLOCK_BY_ID, REAR_PARKING_ELEVATIONS,
  REAR_PARKING_GROUPS, REAR_PARKING_OPERATIONS, REAR_PARKING_ROWS,
  REAR_PARKING_SPACE_BY_ID, REAR_PARKING_SPACES, REAR_PARKING_SURFACES,
  pickRearParkingBlock, pickRearParkingSpace,
} from '../../data/rearParking';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { isMapSelectionClick } from '../../utils/interaction';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import { type ParkingPolygon } from '../../utils/parkingGeometry';
import { createParkingMaterialSet, type ParkingSurfaceKind } from './parkingMaterials';
import {
  createParkingArrowGeometry, createParkingFeatherGeometry,
  createParkingLineBatch, createParkingSurfaceGeometry,
} from './parkingMeshes';
import './rear-parking.css';

const NO_RAYCAST = () => undefined;
const MATERIAL_KINDS = ['gravel', 'soil', 'grass'] as const;
const SECTOR_CODES = ['A', 'B', 'C'] as const;
const WHITE = '#f2e7cf';
const ACCENT = '#317367';

function ParkingSelection() {
  const blockId = useCommercialMapStore((state) => state.selectedParkingBlockId);
  const spaceId = useCommercialMapStore((state) => state.selectedParkingSpaceId);
  const { size } = useThree();
  const selected = spaceId ? REAR_PARKING_SPACE_BY_ID.get(spaceId) : blockId ? REAR_PARKING_BLOCK_BY_ID.get(blockId) : null;
  const resources = useMemo(() => {
    if (!selected) return null;
    const polygons = 'rows' in selected ? selected.rows.map((row) => row.polygon) : [selected.polygon];
    return {
      fill: createParkingSurfaceGeometry(polygons, REAR_PARKING_ELEVATIONS.markings + 0.002),
      fillMaterial: new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.14, depthWrite: false, toneMapped: false }),
      line: createParkingLineBatch(polygons, REAR_PARKING_ELEVATIONS.markings + 0.006, { color: ACCENT, width: 2, opacity: 0.95 }),
    };
  }, [selected]);
  useEffect(() => {
    resources?.line.material.resolution.set(size.width, size.height);
  }, [resources, size.height, size.width]);
  useEffect(() => () => { resources?.fill.dispose(); resources?.fillMaterial.dispose(); resources?.line.dispose(); }, [resources]);
  if (!resources) return null;
  return (
    <group name="rear-parking-selection" dispose={null}>
      <mesh geometry={resources.fill} material={resources.fillMaterial} raycast={NO_RAYCAST} renderOrder={5} />
      <primitive object={resources.line.object} />
    </group>
  );
}

/**
 * Contextual only: the parking sectors and blocks never carry a permanent
 * label. At most one hover tooltip plus the selected block/space stay visible.
 */
function ParkingLabels({ visible, hoveredBlockId }: { visible: boolean; hoveredBlockId: string | null }) {
  const selectedBlockId = useCommercialMapStore((state) => state.selectedParkingBlockId);
  const selectedSpaceId = useCommercialMapStore((state) => state.selectedParkingSpaceId);
  const inspectBlock = useCommercialMapStore((state) => state.inspectParkingBlock);
  const navigating = useCommercialMapStore((state) => state.cameraNavigating);
  const selectedSpace = selectedSpaceId ? REAR_PARKING_SPACE_BY_ID.get(selectedSpaceId) : null;
  const candidates = useMemo(() => [
    ...REAR_PARKING_GROUPS.map((group) => ({ id: group.id, code: group.code, center: group.center, isGroup: true })),
    ...REAR_PARKING_BLOCKS.map((block) => ({ id: block.id, code: block.code, center: block.center, isGroup: false })),
  ], []);
  const activeIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedBlockId) ids.add(selectedBlockId);
    if (!navigating && hoveredBlockId && hoveredBlockId !== selectedBlockId) ids.add(hoveredBlockId);
    return ids;
  }, [hoveredBlockId, navigating, selectedBlockId]);
  if (!visible) return null;
  return (
    <group name="rear-parking-screen-aligned-labels">
      {candidates.filter((item) => activeIds.has(item.id)).map((item) => (
        <Html key={item.id} position={[item.center[0], 0.2, item.center[1]]} center zIndexRange={[18, 8]}>
          <button
            type="button"
            className={`rear-parking-label ${item.isGroup ? 'is-sector' : ''} ${item.id === selectedBlockId ? 'is-selected' : ''}`}
            aria-label={item.isGroup ? `Inspecionar setor ${item.code} do estacionamento` : `Inspecionar bloco ${item.code}`}
            onClick={(event) => {
              event.stopPropagation();
              if (navigating) return;
              inspectBlock(item.isGroup ? REAR_PARKING_BLOCKS.find((block) => block.group === item.code)?.id ?? null : item.id);
            }}
          >
            {item.isGroup && <span aria-hidden="true">P</span>}
            {item.isGroup ? `Setor ${item.code}` : item.code}
          </button>
        </Html>
      ))}
      {selectedSpace && (
        <Html position={[selectedSpace.center[0], 0.19, selectedSpace.center[1]]} center zIndexRange={[19, 9]}>
          <div className="rear-parking-space-label" role="status">
            {selectedSpace.id.replace('rear-parking:', '').replaceAll(':', ' · ')}
            {selectedSpace.restriction === 'ELDERLY' && <small>Idoso · indicado na planta</small>}
          </div>
        </Html>
      )}
    </group>
  );
}


function ParkingOperations({ labelsVisible }: { labelsVisible: boolean }) {
  const { size } = useThree();
  const inspectionOpen = useCommercialMapStore((state) => state.parkingInspectionOpen);
  const selectedBlockId = useCommercialMapStore((state) => state.selectedParkingBlockId);
  const operationNotes = useMemo(() => REAR_PARKING_OPERATIONS.filter((operation) => ['NO_RIGHT_TURN', 'GATE', 'BARRIER'].includes(operation.kind)), []);
  /** Operation notes are contextual: only the two closest to the inspected block. */
  const visibleOperationIds = useMemo(() => {
    const block = selectedBlockId ? REAR_PARKING_BLOCK_BY_ID.get(selectedBlockId) : null;
    if (!labelsVisible || !inspectionOpen || !block) return [] as string[];
    return operationNotes
      .map((operation) => ({
        id: operation.id,
        distance: Math.hypot(operation.position[0] - block.center[0], operation.position[1] - block.center[1]),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2)
      .map((note) => note.id);
  }, [inspectionOpen, labelsVisible, operationNotes, selectedBlockId]);
  const resources = useMemo(() => {
    const geometry = createParkingArrowGeometry();
    const material = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.96, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 });
    const arrows = REAR_PARKING_OPERATIONS.filter((operation) => operation.kind === 'ENTRY_ARROW' || operation.kind === 'EXIT_ARROW');
    const mesh = new THREE.InstancedMesh(geometry, material, arrows.length);
    mesh.name = 'rear-parking-direction-arrows';
    mesh.raycast = NO_RAYCAST;
    const transform = new THREE.Object3D();
    arrows.forEach((operation, index) => {
      transform.position.set(operation.position[0], REAR_PARKING_ELEVATIONS.markings, operation.position[1]);
      transform.rotation.set(0, operation.rotationY, 0);
      transform.scale.setScalar(0.7);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    const barriers = REAR_PARKING_OPERATIONS.filter((operation) => operation.span && (operation.kind === 'BARRIER' || operation.kind === 'GATE'));
    // Symbolic operation markers: the raster does not specify a built barrier model/height.
    const lines: ParkingPolygon[] = barriers.map((operation) => {
      const dx = Math.cos(operation.headingRadians + Math.PI) * (operation.span ?? 0) / 2;
      const dz = Math.sin(operation.headingRadians + Math.PI) * (operation.span ?? 0) / 2;
      return [[operation.position[0] - dx, operation.position[1] - dz], [operation.position[0] + dx, operation.position[1] + dz]];
    });
    const barrierLines = createParkingLineBatch(lines, REAR_PARKING_ELEVATIONS.markings + 0.004, { color: '#9a6b3b', width: 3, closed: false });
    const turnCurves = createParkingLineBatch(
      REAR_PARKING_OPERATIONS.flatMap((operation) => operation.curve ? [operation.curve] : []),
      REAR_PARKING_ELEVATIONS.markings + 0.003,
      { color: WHITE, width: 1.5, opacity: 0.82, closed: false },
    );
    return { mesh, geometry, material, barrierLines, turnCurves };
  }, []);
  useEffect(() => {
    resources.barrierLines.material.resolution.set(size.width, size.height);
    resources.turnCurves.material.resolution.set(size.width, size.height);
  }, [resources, size.width, size.height]);
  useEffect(() => () => {
    disposeInstancedMesh(resources.mesh); resources.geometry.dispose(); resources.material.dispose(); resources.barrierLines.dispose(); resources.turnCurves.dispose();
  }, [resources]);
  return (
    <group name="rear-parking-operations" dispose={null}>
      <primitive object={resources.mesh} />
      <primitive object={resources.barrierLines.object} />
      <primitive object={resources.turnCurves.object} />
      {operationNotes.filter((operation) => visibleOperationIds.includes(operation.id)).map((operation) => (
        <Html key={operation.id} position={[operation.position[0], 0.2, operation.position[1]]} center zIndexRange={[15, 7]}>
          <span className="rear-parking-operation" title="Restrição de circulação indicada no anexo 6">{operation.label}</span>
        </Html>
      ))}
    </group>
  );
}

/** All stalls are data, with three spatially culled instanced line batches. */
export const RearParkingLayer = memo(function RearParkingLayer({
  reducedGraphics, labelsVisible, opacity = 1,
}: { reducedGraphics: boolean; labelsVisible: boolean; opacity?: number }) {
  const { gl, size, invalidate } = useThree();
  const [hovered, setHovered] = useState(false);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const materials = useMemo(() => createParkingMaterialSet(gl.capabilities.getMaxAnisotropy(), reducedGraphics), [gl, reducedGraphics]);
  const resources = useMemo(() => {
    const surfaces = SECTOR_CODES.flatMap((group) => MATERIAL_KINDS.flatMap((kind) => {
      const polygons = REAR_PARKING_SURFACES.filter((surface) => surface.group === group && surface.kind === kind).map((surface) => surface.polygon);
      if (!polygons.length) return [];
      const y = kind === 'grass' ? REAR_PARKING_ELEVATIONS.vegetation : kind === 'soil' ? REAR_PARKING_ELEVATIONS.circulation : REAR_PARKING_ELEVATIONS.ground;
      return [{ id: `${group}-${kind}`, kind: kind as ParkingSurfaceKind,
        geometry: createParkingSurfaceGeometry(polygons, y), feather: createParkingFeatherGeometry(polygons, y + 0.001, 0.12) }];
    }));
    const rowBeds = SECTOR_CODES.map((code) => ({ code,
      geometry: createParkingSurfaceGeometry(REAR_PARKING_ROWS.filter((row) => row.blockId.startsWith(`rear-parking:${code}`)).map((row) => row.polygon), REAR_PARKING_ELEVATIONS.rows),
    }));
    const markings = REAR_PARKING_GROUPS.map((group) => ({
      ...group,
      stalls: createParkingLineBatch(group.blocks.flatMap((block) => block.spaces.map((space) => space.polygon)), REAR_PARKING_ELEVATIONS.markings),
      rows: createParkingLineBatch(group.blocks.flatMap((block) => block.rows.map((row) => row.polygon)), REAR_PARKING_ELEVATIONS.markings - 0.001,
        { color: '#e9dec9', width: 0.7, opacity: 0.45 }),
    }));
    const elderly = createParkingLineBatch(
      REAR_PARKING_SPACES.filter((space) => space.restriction === 'ELDERLY').map((space) => space.polygon),
      REAR_PARKING_ELEVATIONS.markings + 0.002,
      { color: '#326c76', width: 1.45, opacity: 0.96 },
    );
    elderly.object.name = 'rear-parking-elderly-markings';
    return { surfaces, rowBeds, markings, elderly };
  }, []);
  useEffect(() => {
    resources.markings.forEach(({ stalls, rows }) => { stalls.material.resolution.set(size.width, size.height); rows.material.resolution.set(size.width, size.height); });
    resources.elderly.material.resolution.set(size.width, size.height);
    invalidate();
  }, [invalidate, resources, size.height, size.width]);
  useEffect(() => {
    for (const material of [...Object.values(materials.solid), ...Object.values(materials.feather)]) {
      material.opacity = opacity;
      material.transparent = material.name.endsWith('-feather') || opacity < 0.99;
      material.depthWrite = !material.transparent;
      material.needsUpdate = true;
    }
    invalidate();
  }, [invalidate, materials, opacity]);
  useEffect(() => () => materials.dispose(), [materials]);
  useEffect(() => () => {
    resources.surfaces.forEach(({ geometry, feather }) => { geometry.dispose(); feather.dispose(); });
    resources.rowBeds.forEach(({ geometry }) => geometry.dispose());
    resources.markings.forEach(({ stalls, rows }) => { stalls.dispose(); rows.dispose(); });
    resources.elderly.dispose();
  }, [resources]);
  const vector = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    resources.markings.forEach(({ center, stalls, rows }) => {
      const distance = Math.max(0.1, camera.position.distanceTo(vector.set(center[0], 0, center[1])));
      const pixelsPerUnit = size.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance);
      const detail = THREE.MathUtils.smoothstep(pixelsPerUnit * 0.37, 1.3, 4.5);
      stalls.object.visible = detail > 0.03;
      stalls.material.opacity = detail * 0.86 * opacity;
      stalls.material.linewidth = Math.min(1.25, 0.6 + pixelsPerUnit * 0.015);
      rows.material.opacity = (0.2 + (1 - detail) * 0.38) * opacity;
    });
  });
  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const state = useCommercialMapStore.getState();
    if (!isMapSelectionClick(event.delta, event.nativeEvent) || state.cameraNavigating) return;
    const point = [event.point.x, event.point.z] as const;
    const space = pickRearParkingSpace(point);
    if (space) state.inspectParkingSpace(space.blockId, space.id);
    else {
      const block = pickRearParkingBlock(point);
      if (block) state.inspectParkingBlock(block.id);
    }
  };
  useEffect(() => {
    if (hovered && !useCommercialMapStore.getState().cameraNavigating) gl.domElement.style.cursor = 'pointer';
    return () => { if (hovered) gl.domElement.style.cursor = 'grab'; };
  }, [gl, hovered]);
  return (
    <group name="rear-parking-reference-layer" dispose={null}>
      {resources.surfaces.map(({ id, kind, geometry, feather }) => (
        <group key={id}>
          <mesh geometry={geometry} material={materials.solid[kind]} receiveShadow onClick={select}
            onPointerOver={() => setHovered(true)}
            onPointerMove={(event: ThreeEvent<PointerEvent>) => {
              if (useCommercialMapStore.getState().cameraNavigating) { setHoveredBlockId(null); return; }
              const block = pickRearParkingBlock([event.point.x, event.point.z]);
              setHoveredBlockId((current) => (block?.id ?? null) === current ? current : block?.id ?? null);
            }}
            onPointerOut={() => { setHovered(false); setHoveredBlockId(null); }} />
          <mesh geometry={feather} material={materials.feather[kind]} receiveShadow raycast={NO_RAYCAST} />
        </group>
      ))}
      {resources.rowBeds.map(({ code, geometry }) => (
        <mesh key={code} geometry={geometry} material={materials.solid.soil} receiveShadow onClick={select} />
      ))}
      {resources.markings.map(({ code, stalls, rows }) => (
        <group key={code}><primitive object={stalls.object} /><primitive object={rows.object} /></group>
      ))}
      <primitive object={resources.elderly.object} />
      <ParkingSelection />
      <ParkingOperations labelsVisible={labelsVisible} />
      <ParkingLabels visible={labelsVisible} hoveredBlockId={hoveredBlockId} />
    </group>
  );
});
