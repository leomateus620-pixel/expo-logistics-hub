import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { type ThreeEvent, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type {
  CommercialHydrologicalNode,
  CommercialHydrologicalPipeSegment,
} from '../../data/hydrologicalInfrastructure';
import { HYDROLOGICAL_PRESENTATION_PALETTE } from '../../data/hydrologicalPresentation';
import type { MapEntity } from '../../types';
import {
  buildHydrologicalPipeSpans,
  hydrologicalNodeRenderKind,
  resolveHydrologicalNodePlacements,
  type HydrologicalNodeRenderKind,
  type HydrologicalPipeSpan,
  type ResolvedHydrologicalNodePlacement,
} from '../../utils/hydrologicalInfrastructure';
import { isMapSelectionClick } from '../../utils/interaction';

const NO_RAYCAST = () => undefined;
const UNIT_Y = new THREE.Vector3(0, 1, 0);
const NODE_RING_TUBE_RADIUS = 0.12;
const NODE_RING_SURFACE_CLEARANCE = 0.006;
const FULL_OPACITY = {
  distributionPipe: 0.96,
  hydrantPipe: 0.98,
  nodeBody: 1,
  nodeTop: 1,
  nodeAccessory: 0.96,
  nodeRing: 0.78,
} as const;

interface NodeVisualStyle {
  bodyRadius: number;
  bodyHeight: number;
  topRadius: number;
  topHeight: number;
  bodyColor: string;
  topColor: string;
  accessoryColor: string;
  ringColor: string;
  accessoryScale: readonly [number, number, number];
  accessoryOffset: readonly [number, number, number];
  ringRadius: number;
  colliderRadius: number;
}

interface HydrologicalNodeVisual {
  placement: ResolvedHydrologicalNodePlacement;
  kind: HydrologicalNodeRenderKind;
  style: NodeVisualStyle;
  heading: number;
}

function stableHeading(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
}

function nodeVisualStyle(kind: HydrologicalNodeRenderKind): NodeVisualStyle {
  const colors = HYDROLOGICAL_PRESENTATION_PALETTE.nodes[kind];
  switch (kind) {
    case 'HYDRANT':
      return {
        bodyRadius: 0.105,
        bodyHeight: 0.27,
        topRadius: 0.115,
        topHeight: 0.075,
        bodyColor: colors.body,
        topColor: colors.top,
        accessoryColor: colors.accessory,
        ringColor: colors.ring,
        accessoryScale: [0.17, 0.065, 0.065],
        accessoryOffset: [0.11, 0.17, 0],
        ringRadius: 0.145,
        colliderRadius: 0.21,
      };
    case 'RESERVOIR':
      return {
        bodyRadius: 0.21,
        bodyHeight: 0.38,
        topRadius: 0.225,
        topHeight: 0.07,
        bodyColor: colors.body,
        topColor: colors.top,
        accessoryColor: colors.accessory,
        ringColor: colors.ring,
        accessoryScale: [0, 0, 0],
        accessoryOffset: [0, 0, 0],
        ringRadius: 0.245,
        colliderRadius: 0.31,
      };
    case 'WELL':
      return {
        bodyRadius: 0.17,
        bodyHeight: 0.12,
        topRadius: 0.135,
        topHeight: 0.045,
        bodyColor: colors.body,
        topColor: colors.top,
        accessoryColor: colors.accessory,
        ringColor: colors.ring,
        accessoryScale: [0.055, 0.16, 0.055],
        accessoryOffset: [0, 0.14, 0],
        ringRadius: 0.205,
        colliderRadius: 0.25,
      };
    case 'VALVE':
      return {
        bodyRadius: 0.065,
        bodyHeight: 0.12,
        topRadius: 0.075,
        topHeight: 0.035,
        bodyColor: colors.body,
        topColor: colors.top,
        accessoryColor: colors.accessory,
        ringColor: colors.ring,
        accessoryScale: [0.17, 0.025, 0.035],
        accessoryOffset: [0, 0.16, 0],
        ringRadius: 0,
        colliderRadius: 0.17,
      };
    case 'TECHNICAL_MARKER':
      return {
        bodyRadius: 0.055,
        bodyHeight: 0.105,
        topRadius: 0.07,
        topHeight: 0.035,
        bodyColor: colors.body,
        topColor: colors.top,
        accessoryColor: colors.accessory,
        ringColor: colors.ring,
        accessoryScale: [0.12, 0.025, 0.03],
        accessoryOffset: [0, 0.135, 0],
        ringRadius: 0,
        colliderRadius: 0.16,
      };
    case 'JUNCTION':
      return {
        bodyRadius: 0,
        bodyHeight: 0,
        topRadius: 0,
        topHeight: 0,
        bodyColor: colors.body,
        topColor: colors.top,
        accessoryColor: colors.accessory,
        ringColor: colors.ring,
        accessoryScale: [0, 0, 0],
        accessoryOffset: [0, 0, 0],
        ringRadius: 0,
        colliderRadius: 0,
      };
    case 'SUPPLY_ENTRY':
      return {
        bodyRadius: 0.135,
        bodyHeight: 0.34,
        topRadius: 0.155,
        topHeight: 0.085,
        bodyColor: colors.body,
        topColor: colors.top,
        accessoryColor: colors.accessory,
        ringColor: colors.ring,
        accessoryScale: [0.34, 0.055, 0.065],
        accessoryOffset: [0, 0.36, 0],
        ringRadius: 0.23,
        colliderRadius: 0.32,
      };
    case 'TAP':
    default:
      return {
        bodyRadius: 0.05,
        bodyHeight: 0.14,
        topRadius: 0.06,
        topHeight: 0.035,
        bodyColor: colors.body,
        topColor: colors.top,
        accessoryColor: colors.accessory,
        ringColor: colors.ring,
        accessoryScale: [0.14, 0.035, 0.04],
        accessoryOffset: [0.085, 0.115, 0],
        ringRadius: 0,
        colliderRadius: 0.16,
      };
  }
}

function createMaterials() {
  const selection = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  selection.colorWrite = false;
  return {
    distributionPipe: new THREE.MeshStandardMaterial({
      color: HYDROLOGICAL_PRESENTATION_PALETTE.pipes.distribution,
      roughness: 0.32,
      metalness: 0.12,
      emissive: HYDROLOGICAL_PRESENTATION_PALETTE.pipes.distribution,
      emissiveIntensity: 0.42,
      transparent: true,
      opacity: FULL_OPACITY.distributionPipe,
      toneMapped: false,
    }),
    hydrantPipe: new THREE.MeshStandardMaterial({
      color: HYDROLOGICAL_PRESENTATION_PALETTE.pipes.hydrantSupply,
      roughness: 0.34,
      metalness: 0.11,
      emissive: HYDROLOGICAL_PRESENTATION_PALETTE.pipes.hydrantSupply,
      emissiveIntensity: 0.42,
      transparent: true,
      opacity: FULL_OPACITY.hydrantPipe,
      toneMapped: false,
    }),
    nodeBody: new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: FULL_OPACITY.nodeBody,
      toneMapped: false,
    }),
    nodeTop: new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: FULL_OPACITY.nodeTop,
      toneMapped: false,
    }),
    nodeAccessory: new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: FULL_OPACITY.nodeAccessory,
      toneMapped: false,
    }),
    nodeRing: new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: FULL_OPACITY.nodeRing,
      depthWrite: false,
      toneMapped: false,
    }),
    selection,
  };
}

function refreshInstanceBounds(mesh: THREE.InstancedMesh | null) {
  if (!mesh) return;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

function CommercialHydrologicalInfrastructureInstances({
  nodes,
  segments,
  surfaceEntities,
  reducedGraphics,
  onSelect,
}: {
  nodes: readonly CommercialHydrologicalNode[];
  segments: readonly CommercialHydrologicalPipeSegment[];
  surfaceEntities: readonly MapEntity[];
  reducedGraphics: boolean;
  onSelect?: (
    element: CommercialHydrologicalNode | CommercialHydrologicalPipeSegment,
  ) => void;
}) {
  const distributionPipeRef = useRef<THREE.InstancedMesh>(null);
  const hydrantPipeRef = useRef<THREE.InstancedMesh>(null);
  const nodeBodyRef = useRef<THREE.InstancedMesh>(null);
  const nodeTopRef = useRef<THREE.InstancedMesh>(null);
  const nodeAccessoryRef = useRef<THREE.InstancedMesh>(null);
  const nodeRingRef = useRef<THREE.InstancedMesh>(null);
  const selectionRef = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();
  const selectionEnabled = Boolean(onSelect);

  const pipeSpans = useMemo(() => buildHydrologicalPipeSpans(
    segments,
    surfaceEntities,
    reducedGraphics,
  ), [reducedGraphics, segments, surfaceEntities]);
  const distributionSpans = useMemo(() => pipeSpans.filter((span) => (
    span.renderClass === 'DISTRIBUTION'
  )), [pipeSpans]);
  const hydrantSpans = useMemo(() => pipeSpans.filter((span) => (
    span.renderClass === 'HYDRANT_SUPPLY'
  )), [pipeSpans]);
  const placements = useMemo(
    () => resolveHydrologicalNodePlacements(nodes, surfaceEntities),
    [nodes, surfaceEntities],
  );
  const nodeVisuals = useMemo<readonly HydrologicalNodeVisual[]>(() => placements.flatMap((placement) => {
    const kind = hydrologicalNodeRenderKind(placement.node);
    if (kind === 'JUNCTION') return [];
    return [{
      placement,
      kind,
      style: nodeVisualStyle(kind),
      heading: stableHeading(placement.node.id),
    }];
  }), [placements]);
  const accessoryVisuals = useMemo(() => nodeVisuals.filter((visual) => (
    visual.style.accessoryScale.some((scale) => scale > 0)
  )), [nodeVisuals]);
  const ringVisuals = useMemo(() => reducedGraphics ? [] : nodeVisuals.filter((visual) => (
    visual.style.ringRadius > 0
  )), [nodeVisuals, reducedGraphics]);
  const selectableVisuals = useMemo(() => nodeVisuals.filter((visual) => (
    visual.placement.node.selectable
  )), [nodeVisuals]);
  const supplyEntryVisuals = useMemo(() => nodeVisuals.filter((visual) => (
    visual.kind === 'SUPPLY_ENTRY'
  )), [nodeVisuals]);
  const geometries = useMemo(() => {
    const created = {
      pipe: new THREE.CylinderGeometry(1, 1, 1, reducedGraphics ? 6 : 10, 1, false),
      nodeBody: new THREE.CylinderGeometry(1, 1, 1, reducedGraphics ? 7 : 12, 1, false),
      nodeTop: new THREE.SphereGeometry(1, reducedGraphics ? 7 : 12, reducedGraphics ? 4 : 7),
      nodeAccessory: new THREE.BoxGeometry(1, 1, 1),
      nodeRing: new THREE.TorusGeometry(
        1,
        NODE_RING_TUBE_RADIUS,
        reducedGraphics ? 4 : 7,
        reducedGraphics ? 10 : 18,
      ),
      selection: new THREE.SphereGeometry(1, 6, 4),
    };
    Object.values(created).forEach((geometry) => {
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
    });
    return created;
  }, [reducedGraphics]);
  const materials = useMemo(createMaterials, []);

  const applyPipeBatch = useCallback((
    mesh: THREE.InstancedMesh | null,
    spans: readonly HydrologicalPipeSpan[],
  ) => {
    if (!mesh) return;
    const transform = new THREE.Object3D();
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const midpoint = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    spans.forEach((span, index) => {
      start.set(...span.start);
      end.set(...span.end);
      direction.subVectors(end, start);
      const length = direction.length();
      midpoint.addVectors(start, end).multiplyScalar(0.5);
      transform.position.copy(midpoint);
      if (length === 0) {
        transform.quaternion.identity();
        transform.scale.set(0, 0, 0);
      } else {
        quaternion.setFromUnitVectors(UNIT_Y, direction.normalize());
        transform.quaternion.copy(quaternion);
        transform.scale.set(span.renderRadius, length, span.renderRadius);
      }
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  const applyNodeBatch = useCallback((
    mesh: THREE.InstancedMesh | null,
    visuals: readonly HydrologicalNodeVisual[],
    part: 'body' | 'top' | 'accessory' | 'ring' | 'selection',
  ) => {
    if (!mesh) return;
    const transform = new THREE.Object3D();
    visuals.forEach((visual, index) => {
      const { placement, style, heading } = visual;
      const [x, z] = placement.renderPosition;
      const ground = placement.groundElevation;
      transform.rotation.set(0, heading, 0);
      if (part === 'body') {
        transform.position.set(x, ground + style.bodyHeight / 2, z);
        transform.scale.set(
          style.bodyRadius,
          style.bodyHeight,
          style.bodyRadius,
        );
      } else if (part === 'top') {
        transform.position.set(
          x,
          ground + style.bodyHeight + style.topHeight * 0.55,
          z,
        );
        transform.scale.set(
          style.topRadius,
          style.topHeight,
          style.topRadius,
        );
      } else if (part === 'accessory') {
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
        transform.position.set(
          x + style.accessoryOffset[0] * cos + style.accessoryOffset[2] * sin,
          ground + style.accessoryOffset[1],
          z - style.accessoryOffset[0] * sin + style.accessoryOffset[2] * cos,
        );
        transform.scale.set(...style.accessoryScale);
      } else if (part === 'ring') {
        transform.position.set(
          x,
          ground
            + NODE_RING_TUBE_RADIUS * style.ringRadius
            + NODE_RING_SURFACE_CLEARANCE,
          z,
        );
        transform.rotation.set(Math.PI / 2, heading, 0);
        transform.scale.setScalar(style.ringRadius);
      } else {
        transform.position.set(
          x,
          ground + Math.max(style.bodyHeight, style.colliderRadius) * 0.58,
          z,
        );
        transform.scale.setScalar(style.colliderRadius);
      }
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useLayoutEffect(() => {
    const body = nodeBodyRef.current;
    const top = nodeTopRef.current;
    const accessory = nodeAccessoryRef.current;
    const ring = nodeRingRef.current;
    const bodyColor = new THREE.Color();
    const topColor = new THREE.Color();
    const accessoryColor = new THREE.Color();
    const ringColor = new THREE.Color();
    nodeVisuals.forEach((visual, index) => {
      bodyColor.set(visual.style.bodyColor);
      topColor.set(visual.style.topColor);
      body?.setColorAt(index, bodyColor);
      top?.setColorAt(index, topColor);
    });
    accessoryVisuals.forEach((visual, index) => {
      accessoryColor.set(visual.style.accessoryColor);
      accessory?.setColorAt(index, accessoryColor);
    });
    ringVisuals.forEach((visual, index) => {
      ringColor.set(visual.style.ringColor);
      ring?.setColorAt(index, ringColor);
    });

    applyPipeBatch(distributionPipeRef.current, distributionSpans);
    applyPipeBatch(hydrantPipeRef.current, hydrantSpans);
    applyNodeBatch(nodeBodyRef.current, nodeVisuals, 'body');
    applyNodeBatch(nodeTopRef.current, nodeVisuals, 'top');
    applyNodeBatch(nodeAccessoryRef.current, accessoryVisuals, 'accessory');
    applyNodeBatch(nodeRingRef.current, ringVisuals, 'ring');
    applyNodeBatch(selectionRef.current, selectableVisuals, 'selection');

    [
      distributionPipeRef.current,
      hydrantPipeRef.current,
      body,
      top,
      accessory,
      ring,
      selectionRef.current,
    ].forEach(refreshInstanceBounds);
    invalidate();
  }, [
    accessoryVisuals,
    applyNodeBatch,
    applyPipeBatch,
    distributionSpans,
    hydrantSpans,
    invalidate,
    materials,
    nodeVisuals,
    ringVisuals,
    selectableVisuals,
  ]);

  useEffect(() => () => {
    Object.values(geometries).forEach((geometry) => geometry.dispose());
  }, [geometries]);

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials]);

  const handleSelection = useCallback((event: ThreeEvent<MouseEvent>) => {
    if (!onSelect || event.instanceId === undefined || !isMapSelectionClick(event.delta, event.nativeEvent)) return;
    const selected = selectableVisuals[event.instanceId]?.placement.node;
    if (!selected) return;
    event.stopPropagation();
    onSelect(selected);
  }, [onSelect, selectableVisuals]);

  const handlePipeSelection = useCallback((
    event: ThreeEvent<MouseEvent>,
    spans: readonly HydrologicalPipeSpan[],
  ) => {
    if (!onSelect || event.instanceId === undefined || !isMapSelectionClick(event.delta, event.nativeEvent)) return;
    const selected = spans[event.instanceId]?.segment;
    if (!selected?.selectable) return;
    event.stopPropagation();
    onSelect(selected);
  }, [onSelect]);

  const handleDistributionPipeSelection = useCallback((event: ThreeEvent<MouseEvent>) => {
    handlePipeSelection(event, distributionSpans);
  }, [distributionSpans, handlePipeSelection]);

  const handleHydrantPipeSelection = useCallback((event: ThreeEvent<MouseEvent>) => {
    handlePipeSelection(event, hydrantSpans);
  }, [handlePipeSelection, hydrantSpans]);

  return (
    <group name="camada-infraestrutura-hidrologica-comercial">
      {distributionSpans.length > 0 ? (
        <instancedMesh
          ref={distributionPipeRef}
          name="tubulacoes-distribuicao-hidrologica"
          args={[geometries.pipe, materials.distributionPipe, distributionSpans.length]}
          count={distributionSpans.length}
          castShadow={false}
          receiveShadow={false}
          frustumCulled
          renderOrder={14}
          raycast={onSelect ? THREE.InstancedMesh.prototype.raycast : NO_RAYCAST}
          onClick={onSelect ? handleDistributionPipeSelection : undefined}
        />
      ) : null}
      {hydrantSpans.length > 0 ? (
        <instancedMesh
          ref={hydrantPipeRef}
          name="tubulacoes-hidrantes-hidrologia"
          args={[geometries.pipe, materials.hydrantPipe, hydrantSpans.length]}
          count={hydrantSpans.length}
          castShadow={false}
          receiveShadow={false}
          frustumCulled
          renderOrder={14}
          raycast={onSelect ? THREE.InstancedMesh.prototype.raycast : NO_RAYCAST}
          onClick={onSelect ? handleHydrantPipeSelection : undefined}
        />
      ) : null}
      {nodeVisuals.length > 0 ? (
        <>
          <instancedMesh
            ref={nodeBodyRef}
            name="corpos-pontos-hidrologicos"
            args={[geometries.nodeBody, materials.nodeBody, nodeVisuals.length]}
            count={nodeVisuals.length}
            castShadow={false}
            receiveShadow={false}
            frustumCulled
            renderOrder={15}
            raycast={NO_RAYCAST}
          />
          <instancedMesh
            ref={nodeTopRef}
            name="topos-pontos-hidrologicos"
            args={[geometries.nodeTop, materials.nodeTop, nodeVisuals.length]}
            count={nodeVisuals.length}
            castShadow={false}
            receiveShadow={false}
            frustumCulled
            renderOrder={15}
            raycast={NO_RAYCAST}
          />
        </>
      ) : null}
      {accessoryVisuals.length > 0 ? (
        <instancedMesh
          ref={nodeAccessoryRef}
          name="detalhes-pontos-hidrologicos"
          args={[geometries.nodeAccessory, materials.nodeAccessory, accessoryVisuals.length]}
          count={accessoryVisuals.length}
          castShadow={false}
          receiveShadow={false}
          frustumCulled
          renderOrder={15}
          raycast={NO_RAYCAST}
        />
      ) : null}
      {ringVisuals.length > 0 ? (
        <instancedMesh
          ref={nodeRingRef}
          name="aneis-identificacao-hidrologica"
          args={[geometries.nodeRing, materials.nodeRing, ringVisuals.length]}
          count={ringVisuals.length}
          castShadow={false}
          receiveShadow={false}
          frustumCulled
          renderOrder={16}
          raycast={NO_RAYCAST}
        />
      ) : null}
      {selectionEnabled && selectableVisuals.length > 0 ? (
        <instancedMesh
          ref={selectionRef}
          name="selecao-pontos-hidrologicos"
          args={[geometries.selection, materials.selection, selectableVisuals.length]}
          count={selectableVisuals.length}
          castShadow={false}
          receiveShadow={false}
          frustumCulled
          renderOrder={17}
          onClick={handleSelection}
        />
      ) : null}
      {supplyEntryVisuals.map((visual) => {
        const [x, z] = visual.placement.renderPosition;
        return (
          <Html
            key={`rotulo:${visual.placement.node.id}`}
            position={[x, visual.placement.groundElevation + 0.72, z]}
            center
            zIndexRange={[16, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div
              className="commercial-hydrological-world-label"
              aria-label="ENTRADA CORSAN, origem de abastecimento da Rede Hidrológica"
            >
              <span>Origem de abastecimento</span>
              <strong>ENTRADA CORSAN</strong>
            </div>
          </Html>
        );
      })}
    </group>
  );
}

export interface CommercialHydrologicalInfrastructureLayerProps {
  nodes: readonly CommercialHydrologicalNode[];
  segments: readonly CommercialHydrologicalPipeSegment[];
  surfaceEntities: readonly MapEntity[];
  active: boolean;
  reducedGraphics: boolean;
  onSelect?: (
    element: CommercialHydrologicalNode | CommercialHydrologicalPipeSegment,
  ) => void;
}

export const CommercialHydrologicalInfrastructureLayer = memo(
  function CommercialHydrologicalInfrastructureLayer(
    props: CommercialHydrologicalInfrastructureLayerProps,
  ) {
    // Water mode is lazy by construction: no geometry, material, frame handler
    // or raycast surface exists while the mode is inactive.
    if (!props.active || (props.nodes.length === 0 && props.segments.length === 0)) return null;
    return (
      <CommercialHydrologicalInfrastructureInstances
        key={props.reducedGraphics ? 'hydrological-reduced' : 'hydrological-full'}
        nodes={props.nodes}
        segments={props.segments}
        surfaceEntities={props.surfaceEntities}
        reducedGraphics={props.reducedGraphics}
        onSelect={props.onSelect}
      />
    );
  },
);
