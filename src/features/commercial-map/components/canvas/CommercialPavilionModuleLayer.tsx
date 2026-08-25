import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { CommercialPavilionLayout } from '../../utils/commercialPavilions';
import { STATUS_CONFIG } from '../../constants';
import {
  createCommercialPavilionModuleProjectionFrame,
  projectCommercialPavilionModuleRect,
  type CommercialPavilionModulePlan,
} from '../../utils/commercialPavilionModules';
import type {
  CommercialPavilionReferenceCellShape,
  CommercialPavilionReferenceRect,
  CommercialPavilionReferenceSupportSpace,
} from '../../data/commercialPavilionReference';
import {
  projectCommercialPavilionReferencePoint,
  transformCommercialPavilionReferenceSequenceOrientation,
} from '../../data/commercialPavilionReference';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import { isMapSelectionClick } from '../../utils/interaction';
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
  /** Keeps plan labels upright for the pavilion's canonical interior viewpoint. */
  labelRotationRadians?: number;
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
  AVAILABLE: new THREE.Color(STATUS_CONFIG.AVAILABLE.color),
  RESERVED: new THREE.Color(STATUS_CONFIG.RESERVED.color),
  IN_NEGOTIATION: new THREE.Color(STATUS_CONFIG.IN_NEGOTIATION.color),
  SOLD: new THREE.Color(STATUS_CONFIG.SOLD.color),
  BLOCKED: new THREE.Color(STATUS_CONFIG.BLOCKED.color),
  UNAVAILABLE: new THREE.Color(STATUS_CONFIG.UNAVAILABLE.color),
};

const SUPPORT_SPACE_COLORS: Readonly<
  Record<CommercialPavilionReferenceSupportSpace['kind'], THREE.Color>
> = {
  storage: new THREE.Color('#7a817b'),
  accommodation: new THREE.Color('#87918a'),
  service: new THREE.Color('#68736d'),
};

type OrientedModuleCell = CommercialPavilionModulePlan['cells'][number] & {
  labelAnchor?: readonly [number, number];
  orientation?: 'east-west' | 'north-south';
  sequenceOrientation?: 'x-increasing' | 'x-decreasing' | 'z-increasing' | 'z-decreasing';
  shape?: CommercialPavilionReferenceCellShape;
};

function moduleRenderParts(cell: OrientedModuleCell): readonly CommercialPavilionReferenceRect[] {
  return cell.shape?.renderParts.length ? cell.shape.renderParts : [cell];
}

function compactSupportLabelLines(label: string): readonly string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words;
  if (words.length === 2) return words;

  let splitIndex = 1;
  let smallestDifference = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const firstLength = words.slice(0, index).join(' ').length;
    const secondLength = words.slice(index).join(' ').length;
    const difference = Math.abs(firstLength - secondLength);
    if (difference < smallestDifference) {
      splitIndex = index;
      smallestDifference = difference;
    }
  }
  return [words.slice(0, splitIndex).join(' '), words.slice(splitIndex).join(' ')];
}

function createModuleNumberTexture(
  plan: CommercialPavilionModulePlan,
  layout: CommercialPavilionLayout,
  reducedGraphics: boolean,
  labelRotationRadians: number,
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
  const footprint = {
    width: layout.interior.clearWidth,
    depth: layout.interior.clearDepth,
  };
  const projectionFrame = createCommercialPavilionModuleProjectionFrame(plan, footprint);
  const canvasPoint = (point: readonly [number, number]) => {
    const [localX, localZ] = projectCommercialPavilionReferencePoint(point, projectionFrame);
    return [
      (localX / footprint.width + 0.5) * width,
      (localZ / footprint.depth + 0.5) * height,
    ] as const;
  };
  const canvasRect = (rect: CommercialPavilionReferenceRect) => {
    const projected = projectCommercialPavilionModuleRect(rect, projectionFrame);
    return {
      centerX: (projected.centerX / footprint.width + 0.5) * width,
      centerY: (projected.centerZ / footprint.depth + 0.5) * height,
      width: (projected.width / footprint.width) * width,
      height: (projected.depth / footprint.depth) * height,
    };
  };

  context.clearRect(0, 0, width, height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';

  plan.cells.forEach((cell) => {
    const orientedCell = cell as OrientedModuleCell;
    const projectedCell = canvasRect(cell);
    const left = projectedCell.centerX - projectedCell.width / 2;
    const top = projectedCell.centerY - projectedCell.height / 2;
    const cellWidth = projectedCell.width;
    const cellHeight = projectedCell.height;
    const labelAnchor = orientedCell.labelAnchor ?? [cell.centerX, cell.centerZ];
    const [labelX, labelY] = canvasPoint(labelAnchor);
    const visualSequenceOrientation = orientedCell.sequenceOrientation
      ? transformCommercialPavilionReferenceSequenceOrientation(
          orientedCell.sequenceOrientation,
          projectionFrame.coordinateTransform,
        )
      : null;
    const isDepthOriented = cellHeight > cellWidth * 1.18
      || (
        visualSequenceOrientation?.startsWith('z-')
        && cellHeight > cellWidth * 0.86
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
    if (orientedCell.shape?.footprint.length) {
      context.beginPath();
      orientedCell.shape.footprint.forEach(([x, z], index) => {
        const [pointX, pointY] = canvasPoint([x, z]);
        if (index === 0) context.moveTo(pointX, pointY);
        else context.lineTo(pointX, pointY);
      });
      context.closePath();
      context.stroke();
    } else {
      context.strokeRect(left + 0.75, top + 0.75, Math.max(0, cellWidth - 1.5), Math.max(0, cellHeight - 1.5));
    }

    if (fontSize < 7) return;
    context.font = `800 ${fontSize}px Inter, Arial, sans-serif`;
    context.lineWidth = Math.max(1.5, fontSize * 0.18);
    context.strokeStyle = 'rgba(250, 253, 247, 0.92)';
    context.save();
    context.translate(labelX, labelY);
    if (isDepthOriented) {
      context.rotate(visualSequenceOrientation === 'z-decreasing' ? -Math.PI / 2 : Math.PI / 2);
    }
    context.rotate(labelRotationRadians);
    context.strokeText(cell.label, 0, 0);
    context.fillStyle = '#173b2b';
    context.fillText(cell.label, 0, 0);
    context.restore();
  });

  plan.supportSpaces.forEach((supportSpace) => {
    const projectedSupport = canvasRect(supportSpace);
    const left = projectedSupport.centerX - projectedSupport.width / 2;
    const top = projectedSupport.centerY - projectedSupport.height / 2;
    const supportWidth = projectedSupport.width;
    const supportHeight = projectedSupport.height;
    const lines = compactSupportLabelLines(supportSpace.label);
    const longestLine = Math.max(1, ...lines.map((line) => line.length));
    const fontSize = Math.floor(THREE.MathUtils.clamp(
      Math.min(
        supportWidth / (longestLine * 0.62),
        supportHeight / Math.max(1, lines.length * 1.38),
      ),
      7,
      reducedGraphics ? 19 : 25,
    ));

    context.save();
    context.strokeStyle = 'rgba(54, 68, 59, 0.7)';
    context.lineWidth = Math.max(1.2, Math.min(3, Math.min(supportWidth, supportHeight) * 0.025));
    context.setLineDash([Math.max(3, fontSize * 0.35), Math.max(2, fontSize * 0.24)]);
    context.strokeRect(
      left + 0.75,
      top + 0.75,
      Math.max(0, supportWidth - 1.5),
      Math.max(0, supportHeight - 1.5),
    );
    context.setLineDash([]);

    if (fontSize >= 7 && lines.length > 0) {
      context.translate(projectedSupport.centerX, projectedSupport.centerY);
      context.rotate(labelRotationRadians);
      context.font = `800 ${fontSize}px Inter, Arial, sans-serif`;
      context.lineWidth = Math.max(1.5, fontSize * 0.16);
      context.strokeStyle = 'rgba(247, 250, 245, 0.94)';
      context.fillStyle = '#314039';
      const lineHeight = fontSize * 1.08;
      const firstLineY = -((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, index) => {
        const y = firstLineY + index * lineHeight;
        context.strokeText(line, 0, y);
        context.fillText(line, 0, y);
      });
    }
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
  labelRotationRadians = 0,
}: CommercialPavilionModuleLayerProps) {
  const interactive = mode === 'interior';
  const [moduleBaseMesh, setModuleBaseMesh] = useDisposableInstancedMeshRef();
  const [moduleMesh, setModuleMesh] = useDisposableInstancedMeshRef();
  const [corridorMesh, setCorridorMesh] = useDisposableInstancedMeshRef();
  const [supportSpaceMesh, setSupportSpaceMesh] = useDisposableInstancedMeshRef();
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
  const projectionFrame = useMemo(
    () => createCommercialPavilionModuleProjectionFrame(plan, footprint),
    [footprint, plan],
  );
  const projectedModuleParts = useMemo(() => plan.cells.flatMap((cell) => {
    const orientedCell = cell as OrientedModuleCell;
    const shaped = Boolean(orientedCell.shape);
    return moduleRenderParts(orientedCell).map((part) => ({
      cell: orientedCell,
      shaped,
      projected: projectCommercialPavilionModuleRect(part, projectionFrame),
    }));
  }), [plan.cells, projectionFrame]);
  const projectedCorridors = useMemo(() => plan.corridors.map((corridor) => ({
    ...corridor,
    projected: projectCommercialPavilionModuleRect(corridor, projectionFrame),
  })), [plan.corridors, projectionFrame]);
  const projectedSupportSpaces = useMemo(() => plan.supportSpaces.map((supportSpace) => ({
    ...supportSpace,
    projected: projectCommercialPavilionModuleRect(supportSpace, projectionFrame),
  })), [plan.supportSpaces, projectionFrame]);
  const zoneIndex = useMemo(() => new Map(
    plan.zones.map((zone, index) => [zone.id, index]),
  ), [plan.zones]);
  const numberTexture = useMemo(
    () => createModuleNumberTexture(plan, layout, reducedGraphics, labelRotationRadians),
    [labelRotationRadians, layout, plan, reducedGraphics],
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
  const supportSpaceMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.9,
    metalness: 0.035,
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
    projectedModuleParts.forEach(({ cell, projected, shaped }, index) => {
      const isSelected = cell.id === activeSelectedId;
      const isHovered = !isSelected && cell.id === activeHoveredId;
      const persistedStatus = moduleStateById.get(cell.id)?.status ?? null;
      const heightScale = isSelected ? 1.34 : isHovered ? 1.14 : 1;
      const cellHeight = moduleHeight * heightScale;

      object.position.set(
        projected.centerX,
        floorY + moduleBaseHeight / 2 + 0.006,
        projected.centerZ,
      );
      object.rotation.set(0, 0, 0);
      object.scale.set(
        Math.max(0.014, projected.width * (shaped ? 1 : 0.985)),
        moduleBaseHeight,
        Math.max(0.014, projected.depth * (shaped ? 1 : 0.985)),
      );
      object.updateMatrix();
      moduleBaseMesh.current?.setMatrixAt(index, object.matrix);

      object.position.set(
        projected.centerX,
        floorY + moduleBaseHeight + cellHeight / 2 + 0.008,
        projected.centerZ,
      );
      object.rotation.set(0, 0, 0);
      object.scale.set(
        Math.max(
          0.012,
          projected.width * (shaped ? 1 : isSelected || isHovered ? 0.955 : 0.91),
        ),
        cellHeight,
        Math.max(
          0.012,
          projected.depth * (shaped ? 1 : isSelected || isHovered ? 0.945 : 0.9),
        ),
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
    projectedModuleParts,
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

  useLayoutEffect(() => {
    if (!supportSpaceMesh.current) return;
    const object = new THREE.Object3D();
    const supportHeight = THREE.MathUtils.clamp(moduleHeight * 0.72, 0.055, 0.13);
    projectedSupportSpaces.forEach((supportSpace, index) => {
      object.position.set(
        supportSpace.projected.centerX,
        floorY + supportHeight / 2 + 0.007,
        supportSpace.projected.centerZ,
      );
      object.rotation.set(0, 0, 0);
      object.scale.set(
        Math.max(0.014, supportSpace.projected.width * 0.985),
        supportHeight,
        Math.max(0.014, supportSpace.projected.depth * 0.985),
      );
      object.updateMatrix();
      supportSpaceMesh.current?.setMatrixAt(index, object.matrix);
      supportSpaceMesh.current?.setColorAt(index, SUPPORT_SPACE_COLORS[supportSpace.kind]);
    });
    supportSpaceMesh.current.instanceMatrix.needsUpdate = true;
    if (supportSpaceMesh.current.instanceColor) supportSpaceMesh.current.instanceColor.needsUpdate = true;
    supportSpaceMesh.current.computeBoundingBox();
    supportSpaceMesh.current.computeBoundingSphere();
    supportSpaceMaterial.needsUpdate = true;
    invalidate();
  }, [floorY, invalidate, moduleHeight, projectedSupportSpaces, supportSpaceMaterial, supportSpaceMesh]);

  const handlePointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    event.stopPropagation();
    const part = event.instanceId === undefined ? null : projectedModuleParts[event.instanceId];
    const nextId = part?.cell.id ?? null;
    if (useCommercialMapStore.getState().hoveredModuleId === nextId) return;
    setHoveredModuleId(nextId);
    gl.domElement.style.cursor = nextId ? 'pointer' : 'grab';
  }, [gl, interactive, projectedModuleParts, setHoveredModuleId]);

  const handlePointerOut = useCallback(() => {
    if (!interactive) return;
    setHoveredModuleId(null);
    gl.domElement.style.cursor = 'grab';
  }, [gl, interactive, setHoveredModuleId]);

  const handleClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    if (!interactive || !isMapSelectionClick(event.delta)) return;
    event.stopPropagation();
    const part = event.instanceId === undefined ? null : projectedModuleParts[event.instanceId];
    if (!part) return;
    const current = useCommercialMapStore.getState().selectedModuleId;
    setSelectedModuleId(current === part.cell.id ? null : part.cell.id);
  }, [interactive, projectedModuleParts, setSelectedModuleId]);

  useEffect(() => () => {
    moduleMaterial.dispose();
    moduleBaseMaterial.dispose();
    corridorMaterial.dispose();
    supportSpaceMaterial.dispose();
  }, [corridorMaterial, moduleBaseMaterial, moduleMaterial, supportSpaceMaterial]);

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
      {projectedSupportSpaces.length > 0 && (
        <instancedMesh
          ref={setSupportSpaceMesh}
          args={[unitBoxGeometry, supportSpaceMaterial, projectedSupportSpaces.length]}
          castShadow={mode === 'interior' && !reducedGraphics}
          receiveShadow
          raycast={NO_RAYCAST}
          dispose={null}
        />
      )}
      <instancedMesh
        ref={setModuleBaseMesh}
        args={[unitBoxGeometry, moduleBaseMaterial, projectedModuleParts.length]}
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <instancedMesh
        ref={setModuleMesh}
        args={[unitBoxGeometry, moduleMaterial, projectedModuleParts.length]}
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
