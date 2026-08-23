import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { CommercialPavilionLayout } from '../../utils/commercialPavilions';
import {
  projectCommercialPavilionModuleRect,
  type CommercialPavilionModulePlan,
} from '../../utils/commercialPavilionModules';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { CommercialStatus } from '../../types';
import type { CommercialPavilionModuleVisualState } from '../../utils/pavilionModuleCommercial';

const NO_RAYCAST = () => undefined;

type ModuleLayerMode = 'cutaway' | 'interior';

interface CommercialPavilionModuleLayerProps {
  layout: CommercialPavilionLayout;
  plan: CommercialPavilionModulePlan;
  mode: ModuleLayerMode;
  reducedGraphics?: boolean;
  moduleStateById?: ReadonlyMap<string, CommercialPavilionModuleVisualState>;
}

const EMPTY_MODULE_STATE = new Map<string, CommercialPavilionModuleVisualState>();

function useDisposableInstancedMeshRef() {
  const mesh = useRef<THREE.InstancedMesh | null>(null);
  const setMesh = useCallback((next: THREE.InstancedMesh | null) => {
    const previous = mesh.current;
    if (previous && previous !== next) disposeInstancedMesh(previous);
    mesh.current = next;
  }, []);
  return [mesh, setMesh] as const;
}

function zoneColor(colorCue: string, index: number, total: number) {
  const color = new THREE.Color(colorCue);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const centered = total <= 1 ? 0 : index / (total - 1) - 0.5;
  color.setHSL(
    (hsl.h + centered * 0.025 + 1) % 1,
    THREE.MathUtils.clamp(hsl.s * 0.78, 0.42, 0.76),
    THREE.MathUtils.clamp(0.54 + centered * 0.12, 0.44, 0.68),
  );
  return color;
}

const HOVER_COLOR = new THREE.Color('#f3e6b2');
const SELECTED_COLOR = new THREE.Color('#f2c94c');
const MODULE_STATUS_COLORS: Readonly<Record<CommercialStatus, THREE.Color>> = {
  AVAILABLE: new THREE.Color('#45a873'),
  RESERVED: new THREE.Color('#d7a73f'),
  IN_NEGOTIATION: new THREE.Color('#4e8fbd'),
  SOLD: new THREE.Color('#8068a9'),
  BLOCKED: new THREE.Color('#b5635f'),
  UNAVAILABLE: new THREE.Color('#78827d'),
};

type OrientedModuleCell = CommercialPavilionModulePlan['cells'][number] & {
  labelAnchor?: readonly [number, number];
  orientation?: 'east-west' | 'north-south';
  sequenceOrientation?: 'x-increasing' | 'z-increasing' | 'z-decreasing';
};

function createModuleNumberTexture(
  plan: CommercialPavilionModulePlan,
  layout: CommercialPavilionLayout,
  reducedGraphics: boolean,
) {
  if (typeof document === 'undefined') return null;
  const aspect = Math.max(0.25, layout.interior.clearWidth / layout.interior.clearDepth);
  const longSide = reducedGraphics ? 1536 : 2048;
  const width = aspect >= 1 ? longSide : Math.max(768, Math.round(longSide * aspect));
  const height = aspect >= 1 ? Math.max(768, Math.round(longSide / aspect)) : longSide;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.clearRect(0, 0, width, height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';

  plan.cells.forEach((cell) => {
    const orientedCell = cell as OrientedModuleCell;
    const left = (cell.centerX - cell.width / 2) * width;
    const top = (cell.centerZ - cell.depth / 2) * height;
    const cellWidth = cell.width * width;
    const cellHeight = cell.depth * height;
    const labelAnchor = orientedCell.labelAnchor ?? [cell.centerX, cell.centerZ];
    const labelX = labelAnchor[0] * width;
    const labelY = labelAnchor[1] * height;
    const isDepthOriented = cell.depth > cell.width * 1.18
      || (
        orientedCell.orientation === 'north-south'
        && cell.depth > cell.width * 0.86
      );
    const usableWidth = isDepthOriented ? cellHeight : cellWidth;
    const usableHeight = isDepthOriented ? cellWidth : cellHeight;
    const fontSize = Math.floor(THREE.MathUtils.clamp(
      Math.min(usableWidth * 0.42, usableHeight * 0.5),
      7,
      reducedGraphics ? 22 : 30,
    ));

    context.strokeStyle = 'rgba(248, 252, 246, 0.72)';
    context.lineWidth = Math.max(1, Math.min(2.5, Math.min(cellWidth, cellHeight) * 0.055));
    context.strokeRect(left + 0.75, top + 0.75, Math.max(0, cellWidth - 1.5), Math.max(0, cellHeight - 1.5));

    if (fontSize < 7) return;
    context.font = `800 ${fontSize}px Inter, Arial, sans-serif`;
    context.lineWidth = Math.max(1.5, fontSize * 0.18);
    context.strokeStyle = 'rgba(250, 253, 247, 0.92)';
    context.save();
    context.translate(labelX, labelY);
    if (isDepthOriented) {
      context.rotate(orientedCell.sequenceOrientation === 'z-decreasing' ? -Math.PI / 2 : Math.PI / 2);
    }
    context.strokeText(cell.label, 0, 0);
    context.fillStyle = '#173b2b';
    context.fillText(cell.label, 0, 0);
    context.restore();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = reducedGraphics ? 2 : 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * One shared visual layer for the exterior cutaway and the dedicated interior.
 * Hundreds of modules remain one draw call; every identifier is baked into a
 * single transparent plan texture instead of becoming a DOM/text mesh. In the
 * interior scene the same instanced mesh also carries hover and selection.
 */
export const CommercialPavilionModuleLayer = memo(function CommercialPavilionModuleLayer({
  layout,
  plan,
  mode,
  reducedGraphics = false,
  moduleStateById = EMPTY_MODULE_STATE,
}: CommercialPavilionModuleLayerProps) {
  const interactive = mode === 'interior';
  const [moduleBaseMesh, setModuleBaseMesh] = useDisposableInstancedMeshRef();
  const [moduleMesh, setModuleMesh] = useDisposableInstancedMeshRef();
  const [corridorMesh, setCorridorMesh] = useDisposableInstancedMeshRef();
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const hoveredModuleId = useCommercialMapStore((state) => state.hoveredModuleId);
  const selectedModuleId = useCommercialMapStore((state) => state.selectedModuleId);
  const setHoveredModuleId = useCommercialMapStore((state) => state.setHoveredModuleId);
  const setSelectedModuleId = useCommercialMapStore((state) => state.setSelectedModuleId);
  const unitBoxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const shortSide = Math.min(layout.interior.clearWidth, layout.interior.clearDepth);
  const moduleHeight = THREE.MathUtils.clamp(
    shortSide * (mode === 'interior' ? 0.032 : 0.04),
    mode === 'interior' ? 0.085 : 0.1,
    mode === 'interior' ? 0.22 : 0.25,
  );
  const moduleBaseHeight = THREE.MathUtils.clamp(moduleHeight * 0.18, 0.024, 0.045);
  const floorY = layout.interior.floorY;
  const footprint = useMemo(() => ({
    width: layout.interior.clearWidth,
    depth: layout.interior.clearDepth,
  }), [layout.interior.clearDepth, layout.interior.clearWidth]);
  const projectedCells = useMemo(() => plan.cells.map((cell) => ({
    ...cell,
    projected: projectCommercialPavilionModuleRect(cell, footprint),
  })), [footprint, plan.cells]);
  const projectedCorridors = useMemo(() => plan.corridors.map((corridor) => ({
    ...corridor,
    projected: projectCommercialPavilionModuleRect(corridor, footprint),
  })), [footprint, plan.corridors]);
  const zoneIndex = useMemo(() => new Map(
    plan.zones.map((zone, index) => [zone.id, index]),
  ), [plan.zones]);
  const numberTexture = useMemo(
    () => createModuleNumberTexture(plan, layout, reducedGraphics),
    [layout, plan, reducedGraphics],
  );
  const moduleMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.68,
    metalness: 0.025,
  }), []);
  const moduleBaseMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.78,
    metalness: 0.08,
  }), []);
  const corridorMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.96,
    metalness: 0,
  }), []);
  const labelMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    map: numberTexture,
    transparent: true,
    alphaTest: 0.05,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  }), [numberTexture]);
  const labelGeometry = useMemo(
    () => new THREE.PlaneGeometry(footprint.width, footprint.depth),
    [footprint.depth, footprint.width],
  );

  const activeHoveredId = interactive ? hoveredModuleId : null;
  const activeSelectedId = interactive ? selectedModuleId : null;

  useLayoutEffect(() => {
    if (!moduleMesh.current || !moduleBaseMesh.current) return;
    const object = new THREE.Object3D();
    const color = new THREE.Color();
    const borderColor = new THREE.Color();
    projectedCells.forEach((cell, index) => {
      const isSelected = cell.id === activeSelectedId;
      const isHovered = !isSelected && cell.id === activeHoveredId;
      const persistedStatus = moduleStateById.get(cell.id)?.status ?? null;
      const heightScale = isSelected ? 1.34 : isHovered ? 1.14 : 1;
      const cellHeight = moduleHeight * heightScale;

      object.position.set(
        cell.projected.centerX,
        floorY + moduleBaseHeight / 2 + 0.006,
        cell.projected.centerZ,
      );
      object.rotation.set(0, 0, 0);
      object.scale.set(
        Math.max(0.014, cell.projected.width * 0.985),
        moduleBaseHeight,
        Math.max(0.014, cell.projected.depth * 0.985),
      );
      object.updateMatrix();
      moduleBaseMesh.current?.setMatrixAt(index, object.matrix);

      object.position.set(
        cell.projected.centerX,
        floorY + moduleBaseHeight + cellHeight / 2 + 0.008,
        cell.projected.centerZ,
      );
      object.rotation.set(0, 0, 0);
      object.scale.set(
        Math.max(0.012, cell.projected.width * (isSelected || isHovered ? 0.955 : 0.91)),
        cellHeight,
        Math.max(0.012, cell.projected.depth * (isSelected || isHovered ? 0.945 : 0.9)),
      );
      object.updateMatrix();
      moduleMesh.current?.setMatrixAt(index, object.matrix);
      const zoneBaseColor = zoneColor(
        plan.colorCue,
        zoneIndex.get(cell.zoneId) ?? 0,
        plan.zones.length,
      );
      color.copy(persistedStatus ? MODULE_STATUS_COLORS[persistedStatus] : zoneBaseColor);
      if (persistedStatus) color.lerp(zoneBaseColor, 0.12);
      if (isSelected) color.lerp(SELECTED_COLOR, 0.82);
      else if (isHovered) color.lerp(HOVER_COLOR, 0.55);
      moduleMesh.current?.setColorAt(index, color);

      borderColor.copy(color).multiplyScalar(isSelected ? 0.68 : isHovered ? 0.56 : 0.43);
      if (isSelected) borderColor.lerp(SELECTED_COLOR, 0.34);
      moduleBaseMesh.current?.setColorAt(index, borderColor);
    });
    moduleBaseMesh.current.instanceMatrix.needsUpdate = true;
    if (moduleBaseMesh.current.instanceColor) moduleBaseMesh.current.instanceColor.needsUpdate = true;
    moduleBaseMaterial.needsUpdate = true;
    moduleBaseMesh.current.computeBoundingBox();
    moduleBaseMesh.current.computeBoundingSphere();
    moduleMesh.current.instanceMatrix.needsUpdate = true;
    if (moduleMesh.current.instanceColor) moduleMesh.current.instanceColor.needsUpdate = true;
    moduleMaterial.needsUpdate = true;
    moduleMesh.current.computeBoundingBox();
    moduleMesh.current.computeBoundingSphere();
    invalidate();
  }, [
    activeHoveredId,
    activeSelectedId,
    floorY,
    invalidate,
    moduleHeight,
    moduleBaseHeight,
    moduleBaseMaterial,
    moduleBaseMesh,
    moduleMaterial,
    moduleMesh,
    moduleStateById,
    plan.colorCue,
    plan.zones.length,
    projectedCells,
    zoneIndex,
  ]);

  useLayoutEffect(() => {
    if (!corridorMesh.current) return;
    const object = new THREE.Object3D();
    projectedCorridors.forEach((corridor, index) => {
      object.position.set(
        corridor.projected.centerX,
        floorY + 0.004,
        corridor.projected.centerZ,
      );
      object.rotation.set(0, 0, 0);
      object.scale.set(corridor.projected.width, 0.008, corridor.projected.depth);
      object.updateMatrix();
      corridorMesh.current?.setMatrixAt(index, object.matrix);
      const color = corridor.kind === 'atrium'
        ? new THREE.Color('#b8c1b4')
        : corridor.kind === 'cross'
          ? new THREE.Color('#9fada0')
          : new THREE.Color('#aeb9ab');
      corridorMesh.current?.setColorAt(index, color);
    });
    corridorMesh.current.instanceMatrix.needsUpdate = true;
    if (corridorMesh.current.instanceColor) corridorMesh.current.instanceColor.needsUpdate = true;
    corridorMaterial.needsUpdate = true;
  }, [corridorMaterial, corridorMesh, floorY, projectedCorridors]);

  const handlePointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    event.stopPropagation();
    const cell = event.instanceId === undefined ? null : projectedCells[event.instanceId];
    const nextId = cell?.id ?? null;
    if (useCommercialMapStore.getState().hoveredModuleId === nextId) return;
    setHoveredModuleId(nextId);
    gl.domElement.style.cursor = nextId ? 'pointer' : 'grab';
  }, [gl, interactive, projectedCells, setHoveredModuleId]);

  const handlePointerOut = useCallback(() => {
    if (!interactive) return;
    setHoveredModuleId(null);
    gl.domElement.style.cursor = 'grab';
  }, [gl, interactive, setHoveredModuleId]);

  const handleClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    if (!interactive) return;
    event.stopPropagation();
    const cell = event.instanceId === undefined ? null : projectedCells[event.instanceId];
    if (!cell) return;
    const current = useCommercialMapStore.getState().selectedModuleId;
    setSelectedModuleId(current === cell.id ? null : cell.id);
  }, [interactive, projectedCells, setSelectedModuleId]);

  useEffect(() => () => {
    moduleMaterial.dispose();
    moduleBaseMaterial.dispose();
    corridorMaterial.dispose();
  }, [corridorMaterial, moduleBaseMaterial, moduleMaterial]);

  useEffect(() => () => {
    numberTexture?.dispose();
    labelMaterial.dispose();
  }, [labelMaterial, numberTexture]);

  useEffect(() => () => {
    unitBoxGeometry.dispose();
  }, [unitBoxGeometry]);

  useEffect(() => () => {
    labelGeometry.dispose();
  }, [labelGeometry]);

  useEffect(() => () => {
    if (!interactive) return;
    setHoveredModuleId(null);
    gl.domElement.style.cursor = 'grab';
  }, [gl, interactive, setHoveredModuleId]);

  return (
    <group raycast={NO_RAYCAST} dispose={null}>
      {projectedCorridors.length > 0 && (
        <instancedMesh
          ref={setCorridorMesh}
          args={[unitBoxGeometry, corridorMaterial, projectedCorridors.length]}
          receiveShadow
          raycast={NO_RAYCAST}
          dispose={null}
        />
      )}
      <instancedMesh
        ref={setModuleBaseMesh}
        args={[unitBoxGeometry, moduleBaseMaterial, projectedCells.length]}
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <instancedMesh
        ref={setModuleMesh}
        args={[unitBoxGeometry, moduleMaterial, projectedCells.length]}
        castShadow={mode === 'interior' && !reducedGraphics}
        receiveShadow
        {...(interactive
          ? {
            onPointerMove: handlePointerMove,
            onPointerOut: handlePointerOut,
            onClick: handleClick,
          }
          : { raycast: NO_RAYCAST })}
        dispose={null}
      />
      {numberTexture && (
        <mesh
          position={[0, floorY + moduleBaseHeight + moduleHeight * 1.42 + 0.018, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          geometry={labelGeometry}
          material={labelMaterial}
          renderOrder={12}
          raycast={NO_RAYCAST}
          dispose={null}
        />
      )}
    </group>
  );
});
