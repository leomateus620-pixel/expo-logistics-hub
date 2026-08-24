import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type {
  CommercialHydrologicalNode,
  CommercialHydrologicalPipeSegment,
} from '../../data/hydrologicalInfrastructure';
import type { MapEntity } from '../../types';
import {
  buildHydrologicalPipeSpans,
  hydrologicalNodeRenderKind,
  resolveHydrologicalNodePlacements,
  type HydrologicalNodeRenderKind,
  type HydrologicalPipeSpan,
  type ResolvedHydrologicalNodePlacement,
} from '../../utils/hydrologicalInfrastructure';

const NO_RAYCAST = () => undefined;
const UNIT_Y = new THREE.Vector3(0, 1, 0);
const PIPE_EPSILON_SCALE = 1e-5;
const NODE_REVEAL_WINDOW_MINIMUM = 0.42;
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
  activationDistance: number;
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
  switch (kind) {
    case 'HYDRANT':
      return {
        bodyRadius: 0.105,
        bodyHeight: 0.27,
        topRadius: 0.115,
        topHeight: 0.075,
        bodyColor: '#2f9b66',
        topColor: '#ef4b4f',
        accessoryColor: '#dce7df',
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
        bodyColor: '#a9c9d1',
        topColor: '#e7f4f6',
        accessoryColor: '#6d929d',
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
        bodyColor: '#357f92',
        topColor: '#65d5eb',
        accessoryColor: '#d8f6fa',
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
        bodyColor: '#d3a434',
        topColor: '#ffe17e',
        accessoryColor: '#f7eac1',
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
        bodyColor: '#73858c',
        topColor: '#c5d5d9',
        accessoryColor: '#e0edf0',
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
        bodyColor: '#56727a',
        topColor: '#8ca4aa',
        accessoryColor: '#8ca4aa',
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
        bodyColor: '#087fa8',
        topColor: '#54ddf5',
        accessoryColor: '#e8fbff',
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
        bodyColor: '#12aeda',
        topColor: '#80eaff',
        accessoryColor: '#d9f8ff',
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
      color: '#08c9f4',
      roughness: 0.32,
      metalness: 0.12,
      emissive: '#087899',
      emissiveIntensity: 0.88,
      transparent: true,
      opacity: 0,
      toneMapped: false,
    }),
    hydrantPipe: new THREE.MeshStandardMaterial({
      color: '#ff4050',
      roughness: 0.34,
      metalness: 0.11,
      emissive: '#98202c',
      emissiveIntensity: 0.82,
      transparent: true,
      opacity: 0,
      toneMapped: false,
    }),
    nodeBody: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.48,
      metalness: 0.18,
      emissive: '#163b44',
      emissiveIntensity: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0,
    }),
    nodeTop: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.34,
      metalness: 0.16,
      emissive: '#24464d',
      emissiveIntensity: 0.24,
      vertexColors: true,
      transparent: true,
      opacity: 0,
    }),
    nodeAccessory: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.4,
      metalness: 0.24,
      vertexColors: true,
      transparent: true,
      opacity: 0,
    }),
    nodeRing: new THREE.MeshBasicMaterial({
      color: '#ffffff',
      vertexColors: true,
      transparent: true,
      opacity: 0,
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

function nodeActivationDistance(
  node: CommercialHydrologicalNode,
  segments: readonly CommercialHydrologicalPipeSegment[],
) {
  const linkedIds = new Set(node.linkedSegmentIds ?? []);
  const incident = segments.filter((segment) => (
    linkedIds.has(segment.id)
    || segment.sourceNodeId === node.id
    || segment.targetNodeId === node.id
  ));
  if (incident.length === 0) return 0;
  return Math.min(...incident.map((segment) => (
    Number.isFinite(segment.activationDistance) ? Math.max(0, segment.activationDistance) : 0
  )));
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
  const revealElapsed = useRef(0);
  const revealSettled = useRef(false);
  const { invalidate } = useThree();

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
      activationDistance: nodeActivationDistance(placement.node, segments),
    }];
  }), [placements, segments]);
  const accessoryVisuals = useMemo(() => nodeVisuals.filter((visual) => (
    visual.style.accessoryScale.some((scale) => scale > 0)
  )), [nodeVisuals]);
  const ringVisuals = useMemo(() => reducedGraphics ? [] : nodeVisuals.filter((visual) => (
    visual.style.ringRadius > 0
  )), [nodeVisuals, reducedGraphics]);
  const selectableVisuals = useMemo(() => onSelect
    ? nodeVisuals.filter((visual) => visual.placement.node.selectable)
    : [], [nodeVisuals, onSelect]);
  const supplyEntryVisuals = useMemo(() => nodeVisuals.filter((visual) => (
    visual.kind === 'SUPPLY_ENTRY'
  )), [nodeVisuals]);
  const activationBounds = useMemo(() => {
    if (pipeSpans.length === 0) return { minimum: 0, maximum: 1, range: 1 };
    const minimum = Math.min(...pipeSpans.map((span) => span.activationStart));
    const maximum = Math.max(...pipeSpans.map((span) => span.activationEnd));
    return { minimum, maximum, range: Math.max(maximum - minimum, Number.EPSILON) };
  }, [pipeSpans]);
  const geometries = useMemo(() => {
    const created = {
      pipe: new THREE.CylinderGeometry(1, 1, 1, reducedGraphics ? 6 : 10, 1, false),
      nodeBody: new THREE.CylinderGeometry(1, 1, 1, reducedGraphics ? 7 : 12, 1, false),
      nodeTop: new THREE.SphereGeometry(1, reducedGraphics ? 7 : 12, reducedGraphics ? 4 : 7),
      nodeAccessory: new THREE.BoxGeometry(1, 1, 1),
      nodeRing: new THREE.TorusGeometry(1, 0.12, reducedGraphics ? 4 : 7, reducedGraphics ? 10 : 18),
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
    revealedDistance: number,
  ) => {
    if (!mesh) return;
    const transform = new THREE.Object3D();
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const currentEnd = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const midpoint = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    spans.forEach((span, index) => {
      const revealFraction = THREE.MathUtils.clamp(
        (revealedDistance - span.activationStart)
          / Math.max(span.activationEnd - span.activationStart, Number.EPSILON),
        0,
        1,
      );
      if (revealFraction <= 0) {
        transform.position.set(...span.start);
        transform.rotation.set(0, 0, 0);
        transform.scale.setScalar(PIPE_EPSILON_SCALE);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
        return;
      }
      start.set(...span.start);
      end.set(...span.end);
      currentEnd.lerpVectors(start, end, revealFraction);
      direction.subVectors(currentEnd, start);
      midpoint.addVectors(start, currentEnd).multiplyScalar(0.5);
      quaternion.setFromUnitVectors(UNIT_Y, direction.clone().normalize());
      transform.position.copy(midpoint);
      transform.quaternion.copy(quaternion);
      transform.scale.set(span.renderRadius, direction.length(), span.renderRadius);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  const applyNodeBatch = useCallback((
    mesh: THREE.InstancedMesh | null,
    visuals: readonly HydrologicalNodeVisual[],
    revealedDistance: number,
    part: 'body' | 'top' | 'accessory' | 'ring' | 'selection',
  ) => {
    if (!mesh) return;
    const transform = new THREE.Object3D();
    const revealWindow = Math.max(
      NODE_REVEAL_WINDOW_MINIMUM,
      activationBounds.range * 0.045,
    );
    visuals.forEach((visual, index) => {
      const { placement, style, heading } = visual;
      const progress = THREE.MathUtils.smoothstep(
        revealedDistance,
        visual.activationDistance,
        visual.activationDistance + revealWindow,
      );
      const [x, z] = placement.renderPosition;
      const ground = placement.groundElevation;
      transform.rotation.set(0, heading, 0);
      if (part === 'body') {
        transform.position.set(x, ground + style.bodyHeight * progress / 2, z);
        transform.scale.set(
          style.bodyRadius * progress,
          style.bodyHeight * progress,
          style.bodyRadius * progress,
        );
      } else if (part === 'top') {
        transform.position.set(
          x,
          ground + style.bodyHeight * progress + style.topHeight * progress * 0.55,
          z,
        );
        transform.scale.set(
          style.topRadius * progress,
          style.topHeight * progress,
          style.topRadius * progress,
        );
      } else if (part === 'accessory') {
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
        transform.position.set(
          x + (style.accessoryOffset[0] * cos + style.accessoryOffset[2] * sin) * progress,
          ground + style.accessoryOffset[1] * progress,
          z + (-style.accessoryOffset[0] * sin + style.accessoryOffset[2] * cos) * progress,
        );
        transform.scale.set(
          style.accessoryScale[0] * progress,
          style.accessoryScale[1] * progress,
          style.accessoryScale[2] * progress,
        );
      } else if (part === 'ring') {
        transform.position.set(x, ground + 0.016, z);
        transform.rotation.set(Math.PI / 2, heading, 0);
        transform.scale.setScalar(style.ringRadius * progress);
      } else {
        transform.position.set(
          x,
          ground + Math.max(style.bodyHeight, style.colliderRadius) * progress * 0.58,
          z,
        );
        transform.scale.setScalar(style.colliderRadius * progress);
      }
      if (progress <= 0) transform.scale.setScalar(PIPE_EPSILON_SCALE);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [activationBounds.range]);

  const applyReveal = useCallback((progress: number) => {
    const revealedDistance = activationBounds.minimum + activationBounds.range * progress;
    applyPipeBatch(distributionPipeRef.current, distributionSpans, revealedDistance);
    applyPipeBatch(hydrantPipeRef.current, hydrantSpans, revealedDistance);
    applyNodeBatch(nodeBodyRef.current, nodeVisuals, revealedDistance, 'body');
    applyNodeBatch(nodeTopRef.current, nodeVisuals, revealedDistance, 'top');
    applyNodeBatch(nodeAccessoryRef.current, accessoryVisuals, revealedDistance, 'accessory');
    applyNodeBatch(nodeRingRef.current, ringVisuals, revealedDistance, 'ring');
    applyNodeBatch(selectionRef.current, selectableVisuals, revealedDistance, 'selection');
    const opacityProgress = THREE.MathUtils.smoothstep(progress, 0, 0.18);
    materials.distributionPipe.opacity = FULL_OPACITY.distributionPipe * opacityProgress;
    materials.hydrantPipe.opacity = FULL_OPACITY.hydrantPipe * opacityProgress;
    materials.nodeBody.opacity = FULL_OPACITY.nodeBody * opacityProgress;
    materials.nodeTop.opacity = FULL_OPACITY.nodeTop * opacityProgress;
    materials.nodeAccessory.opacity = FULL_OPACITY.nodeAccessory * opacityProgress;
    materials.nodeRing.opacity = FULL_OPACITY.nodeRing * opacityProgress;
  }, [
    accessoryVisuals,
    activationBounds.minimum,
    activationBounds.range,
    applyNodeBatch,
    applyPipeBatch,
    distributionSpans,
    hydrantSpans,
    materials,
    nodeVisuals,
    ringVisuals,
    selectableVisuals,
  ]);

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
      ringColor.set(visual.style.topColor);
      ring?.setColorAt(index, ringColor);
    });

    revealElapsed.current = 0;
    revealSettled.current = false;
    // Establish conservative, final-state culling bounds before collapsing the
    // instances for the finite activation reveal.
    applyReveal(1);
    [
      distributionPipeRef.current,
      hydrantPipeRef.current,
      body,
      top,
      accessory,
      ring,
      selectionRef.current,
    ].forEach(refreshInstanceBounds);
    applyReveal(0);
    invalidate();
  }, [applyReveal, accessoryVisuals, invalidate, nodeVisuals, ringVisuals]);

  useEffect(() => () => {
    Object.values(geometries).forEach((geometry) => geometry.dispose());
  }, [geometries]);

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials]);

  useFrame((_state, delta) => {
    if (revealSettled.current) return;
    revealElapsed.current += Math.min(delta, 0.05);
    const duration = reducedGraphics ? 1.25 : 1.85;
    const linearProgress = Math.min(1, revealElapsed.current / duration);
    const easedProgress = 1 - (1 - linearProgress) ** 3;
    applyReveal(easedProgress);
    if (linearProgress >= 1) {
      revealSettled.current = true;
      [
        distributionPipeRef.current,
        hydrantPipeRef.current,
        nodeBodyRef.current,
        nodeTopRef.current,
        nodeAccessoryRef.current,
        nodeRingRef.current,
        selectionRef.current,
      ].forEach(refreshInstanceBounds);
      return;
    }
    invalidate();
  });

  const handleSelection = useCallback((event: ThreeEvent<MouseEvent>) => {
    if (!onSelect || event.instanceId === undefined) return;
    const selected = selectableVisuals[event.instanceId]?.placement.node;
    if (!selected) return;
    event.stopPropagation();
    onSelect(selected);
  }, [onSelect, selectableVisuals]);

  const handlePipeSelection = useCallback((
    event: ThreeEvent<MouseEvent>,
    spans: readonly HydrologicalPipeSpan[],
  ) => {
    if (!onSelect || event.instanceId === undefined) return;
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
      {selectableVisuals.length > 0 ? (
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
