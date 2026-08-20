import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { CommercialPavilionLayout } from '../../utils/commercialPavilions';
import {
  projectCommercialPavilionModuleRect,
  type CommercialPavilionModulePlan,
} from '../../utils/commercialPavilionModules';

const NO_RAYCAST = () => undefined;

type ModuleLayerMode = 'cutaway' | 'interior';

interface CommercialPavilionModuleLayerProps {
  layout: CommercialPavilionLayout;
  plan: CommercialPavilionModulePlan;
  mode: ModuleLayerMode;
  reducedGraphics?: boolean;
}

function useDisposableInstancedMeshRef() {
  const mesh = useRef<THREE.InstancedMesh | null>(null);
  const setMesh = useCallback((next: THREE.InstancedMesh | null) => {
    const previous = mesh.current;
    if (previous && previous !== next) {
      // eslint-disable-next-line no-console
      console.log('DEBUG previous', typeof previous, (previous as any)?.constructor?.name, Object.keys(previous as any).slice(0, 8));
      previous.dispose();
    }
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
    const left = (cell.centerX - cell.width / 2) * width;
    const top = (cell.centerZ - cell.depth / 2) * height;
    const cellWidth = cell.width * width;
    const cellHeight = cell.depth * height;
    const fontSize = Math.floor(THREE.MathUtils.clamp(
      Math.min(cellWidth * 0.42, cellHeight * 0.5),
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
    context.strokeText(cell.label, left + cellWidth / 2, top + cellHeight / 2);
    context.fillStyle = '#173b2b';
    context.fillText(cell.label, left + cellWidth / 2, top + cellHeight / 2);
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
 * single transparent plan texture instead of becoming a DOM/text mesh.
 */
export const CommercialPavilionModuleLayer = memo(function CommercialPavilionModuleLayer({
  layout,
  plan,
  mode,
  reducedGraphics = false,
}: CommercialPavilionModuleLayerProps) {
  const [moduleMesh, setModuleMesh] = useDisposableInstancedMeshRef();
  const [corridorMesh, setCorridorMesh] = useDisposableInstancedMeshRef();
  const unitBoxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const shortSide = Math.min(layout.interior.clearWidth, layout.interior.clearDepth);
  const moduleHeight = THREE.MathUtils.clamp(
    shortSide * (mode === 'interior' ? 0.032 : 0.04),
    mode === 'interior' ? 0.085 : 0.1,
    mode === 'interior' ? 0.22 : 0.25,
  );
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
    roughness: 0.74,
    metalness: 0.015,
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

  useLayoutEffect(() => {
    if (!moduleMesh.current) return;
    const object = new THREE.Object3D();
    projectedCells.forEach((cell, index) => {
      object.position.set(
        cell.projected.centerX,
        floorY + moduleHeight / 2 + 0.012,
        cell.projected.centerZ,
      );
      object.rotation.set(0, 0, 0);
      object.scale.set(
        Math.max(0.012, cell.projected.width * 0.94),
        moduleHeight,
        Math.max(0.012, cell.projected.depth * 0.92),
      );
      object.updateMatrix();
      moduleMesh.current?.setMatrixAt(index, object.matrix);
      moduleMesh.current?.setColorAt(
        index,
        zoneColor(plan.colorCue, zoneIndex.get(cell.zoneId) ?? 0, plan.zones.length),
      );
    });
    moduleMesh.current.instanceMatrix.needsUpdate = true;
    if (moduleMesh.current.instanceColor) moduleMesh.current.instanceColor.needsUpdate = true;
    moduleMaterial.needsUpdate = true;
    moduleMesh.current.computeBoundingBox();
    moduleMesh.current.computeBoundingSphere();
  }, [floorY, moduleHeight, moduleMaterial, moduleMesh, plan.colorCue, plan.zones.length, projectedCells, zoneIndex]);

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

  useEffect(() => () => {
    moduleMaterial.dispose();
    corridorMaterial.dispose();
  }, [corridorMaterial, moduleMaterial]);

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
        ref={setModuleMesh}
        args={[unitBoxGeometry, moduleMaterial, projectedCells.length]}
        castShadow={mode === 'interior' && !reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      {numberTexture && (
        <mesh
          position={[0, floorY + moduleHeight + 0.018, 0]}
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
