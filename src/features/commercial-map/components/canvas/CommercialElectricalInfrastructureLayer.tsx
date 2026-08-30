import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  CommercialElectricalConnection,
  CommercialElectricalNode,
} from '../../data/electricalInfrastructure';
import type { MapEntity } from '../../types';
import {
  buildElectricalPoleCrossarmLayouts,
  buildElectricalWirePositions,
  resolveElectricalNodePlacements,
} from '../../utils/electricalInfrastructure';

const NO_RAYCAST = () => undefined;
const POLE_CROSSARM_LENGTH = 0.42;
const POLE_CROSSARM_HEIGHT = 0.045;
const POLE_CROSSARM_DEPTH = 0.06;
const POLE_PHASE_OFFSETS = [-0.15, 0, 0.15] as const;
const TRANSFORMER_PLINTH_HEIGHT = 0.05;
const FULL_OPACITY = {
  pole: 1,
  crossarm: 1,
  insulator: 0.98,
  transformer: 1,
  concrete: 1,
  radiator: 1,
  warning: 1,
  wire: 0.46,
} as const;

function refreshInstanceBounds(mesh: THREE.InstancedMesh | null) {
  if (!mesh) return;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

function createMaterials() {
  return {
    pole: new THREE.MeshStandardMaterial({
      color: '#8e9694',
      roughness: 0.92,
      metalness: 0.04,
      transparent: true,
    }),
    crossarm: new THREE.MeshStandardMaterial({
      color: '#535a57',
      roughness: 0.72,
      metalness: 0.32,
      transparent: true,
    }),
    insulator: new THREE.MeshStandardMaterial({
      color: '#c8d9d8',
      roughness: 0.38,
      metalness: 0.08,
      transparent: true,
      emissive: '#668486',
      emissiveIntensity: 0.12,
    }),
    transformer: new THREE.MeshStandardMaterial({
      color: '#64736b',
      roughness: 0.76,
      metalness: 0.28,
      transparent: true,
    }),
    concrete: new THREE.MeshStandardMaterial({
      color: '#adb1ab',
      roughness: 0.98,
      metalness: 0,
      transparent: true,
    }),
    radiator: new THREE.MeshStandardMaterial({
      color: '#424d48',
      roughness: 0.68,
      metalness: 0.42,
      transparent: true,
    }),
    warning: new THREE.MeshStandardMaterial({
      color: '#f0c83c',
      roughness: 0.58,
      metalness: 0.12,
      transparent: true,
      emissive: '#9c6e08',
      emissiveIntensity: 0.16,
    }),
    wire: new THREE.LineBasicMaterial({
      color: '#56635f',
      transparent: true,
      opacity: FULL_OPACITY.wire,
      depthWrite: false,
      toneMapped: true,
    }),
  };
}

function CommercialElectricalInfrastructureInstances({
  nodes,
  connections,
  surfaceEntities,
  visible,
  reducedGraphics,
  rearRoadsActive = false,
}: {
  nodes: readonly CommercialElectricalNode[];
  connections: readonly CommercialElectricalConnection[];
  surfaceEntities: readonly MapEntity[];
  visible: boolean;
  reducedGraphics: boolean;
  rearRoadsActive?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const crossarmRef = useRef<THREE.InstancedMesh>(null);
  const insulatorRef = useRef<THREE.InstancedMesh>(null);
  const transformerRef = useRef<THREE.InstancedMesh>(null);
  const plinthRef = useRef<THREE.InstancedMesh>(null);
  const capRef = useRef<THREE.InstancedMesh>(null);
  const radiatorRef = useRef<THREE.InstancedMesh>(null);
  const warningRef = useRef<THREE.InstancedMesh>(null);
  const visibilityProgress = useRef(visible ? 1 : 0);
  const transitionPending = useRef(true);
  const { gl, invalidate } = useThree();
  const poles = useMemo(() => nodes.filter((node) => node.type === 'POLE'), [nodes]);
  const transformers = useMemo(() => nodes.filter((node) => node.type === 'TRANSFORMER'), [nodes]);
  const resolvedPlacements = useMemo(
    () => resolveElectricalNodePlacements(nodes, surfaceEntities, rearRoadsActive),
    [nodes, rearRoadsActive, surfaceEntities],
  );
  const placementByNodeId = useMemo(() => new Map(
    resolvedPlacements.map((placement) => [placement.node.id, placement]),
  ), [resolvedPlacements]);
  const crossarmLayouts = useMemo(
    () => buildElectricalPoleCrossarmLayouts(nodes, connections, resolvedPlacements),
    [connections, nodes, resolvedPlacements],
  );
  const geometries = useMemo(() => ({
    pole: new THREE.CylinderGeometry(0.78, 1, 1, reducedGraphics ? 6 : 8, 1),
    crossarm: new THREE.BoxGeometry(1, 1, 1),
    insulator: new THREE.CylinderGeometry(0.74, 1, 1, reducedGraphics ? 5 : 8, 2),
    transformer: new THREE.BoxGeometry(1, 1, 1),
    plinth: new THREE.BoxGeometry(1, 1, 1),
    cap: new THREE.BoxGeometry(1, 1, 1),
    radiator: new THREE.BoxGeometry(1, 1, 1),
    warning: new THREE.BoxGeometry(1, 1, 1),
  }), [reducedGraphics]);
  const materials = useMemo(createMaterials, []);
  const wireGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buildElectricalWirePositions(
      nodes,
      connections,
      surfaceEntities,
      reducedGraphics,
      resolvedPlacements,
    ), 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }, [connections, nodes, reducedGraphics, resolvedPlacements, surfaceEntities]);

  useLayoutEffect(() => {
    const poleMesh = poleRef.current;
    const crossarmMesh = crossarmRef.current;
    const insulatorMesh = insulatorRef.current;
    const transformerMesh = transformerRef.current;
    const plinthMesh = plinthRef.current;
    const capMesh = capRef.current;
    const radiatorMesh = radiatorRef.current;
    const warningMesh = warningRef.current;
    if (
      !poleMesh || !crossarmMesh || !insulatorMesh || !transformerMesh
      || !plinthMesh || !capMesh || !radiatorMesh || !warningMesh
    ) return;

    const transform = new THREE.Object3D();
    const setInstance = (
      mesh: THREE.InstancedMesh,
      index: number,
      position: readonly [number, number, number],
      rotationY: number,
      scale: readonly [number, number, number],
    ) => {
      transform.position.set(...position);
      transform.rotation.set(0, rotationY, 0);
      transform.scale.set(...scale);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    };

    poles.forEach((pole, poleIndex) => {
      const placement = placementByNodeId.get(pole.id);
      if (!placement) return;
      const [x, z] = placement.renderPosition;
      const groundY = placement.groundElevation;
      setInstance(
        poleMesh,
        poleIndex,
        [x, groundY + pole.height / 2, z],
        pole.rotationRadians,
        [pole.radius, pole.height, pole.radius],
      );
    });

    crossarmLayouts.forEach((layout, crossarmIndex) => {
      const placement = placementByNodeId.get(layout.nodeId);
      if (!placement) return;
      const pole = placement.node;
      const [x, z] = placement.renderPosition;
      const groundY = placement.groundElevation;
      setInstance(
        crossarmMesh,
        crossarmIndex,
        [x, groundY + pole.height - 0.1, z],
        layout.rotationRadians,
        [POLE_CROSSARM_LENGTH, POLE_CROSSARM_HEIGHT, POLE_CROSSARM_DEPTH],
      );
      POLE_PHASE_OFFSETS.forEach((offset, conductorIndex) => {
        const offsetX = Math.cos(layout.rotationRadians) * offset;
        const offsetZ = -Math.sin(layout.rotationRadians) * offset;
        setInstance(
          insulatorMesh,
          crossarmIndex * 3 + conductorIndex,
          [x + offsetX, groundY + pole.height - 0.055, z + offsetZ],
          layout.rotationRadians,
          [0.025, 0.075, 0.025],
        );
      });
    });

    const transformerInsulatorOffset = crossarmLayouts.length * 3;
    transformers.forEach((transformer, transformerIndex) => {
      const placement = placementByNodeId.get(transformer.id);
      if (!placement) return;
      const [x, z] = placement.renderPosition;
      const groundY = placement.groundElevation;
      const rotation = placement.rotationRadians;
      setInstance(
        plinthMesh,
        transformerIndex,
        [x, groundY + TRANSFORMER_PLINTH_HEIGHT / 2, z],
        rotation,
        [transformer.radius * 2, TRANSFORMER_PLINTH_HEIGHT, transformer.radius * 1.55],
      );
      setInstance(
        transformerMesh,
        transformerIndex,
        [x, groundY + TRANSFORMER_PLINTH_HEIGHT + transformer.height / 2, z],
        rotation,
        [transformer.radius * 1.55, transformer.height, transformer.radius * 1.12],
      );
      setInstance(
        capMesh,
        transformerIndex,
        [x, groundY + TRANSFORMER_PLINTH_HEIGHT + transformer.height + 0.025, z],
        rotation,
        [transformer.radius * 1.72, 0.05, transformer.radius * 1.3],
      );
      setInstance(
        radiatorMesh,
        transformerIndex,
        [
          x + Math.sin(rotation) * transformer.radius * 0.64,
          groundY + TRANSFORMER_PLINTH_HEIGHT + transformer.height * 0.54,
          z + Math.cos(rotation) * transformer.radius * 0.64,
        ],
        rotation,
        [transformer.radius * 1.22, transformer.height * 0.48, 0.035],
      );
      setInstance(
        warningMesh,
        transformerIndex,
        [
          x - Math.sin(rotation) * transformer.radius * 0.575,
          groundY + TRANSFORMER_PLINTH_HEIGHT + transformer.height * 0.58,
          z - Math.cos(rotation) * transformer.radius * 0.575,
        ],
        rotation,
        [0.085, 0.085, 0.018],
      );
      [-0.11, 0, 0.11].forEach((offset, conductorIndex) => {
        const offsetX = Math.cos(rotation) * offset;
        const offsetZ = -Math.sin(rotation) * offset;
        setInstance(
          insulatorMesh,
          transformerInsulatorOffset + transformerIndex * 3 + conductorIndex,
          [x + offsetX, groundY + TRANSFORMER_PLINTH_HEIGHT + transformer.height + 0.095, z + offsetZ],
          rotation,
          [0.028, 0.08, 0.028],
        );
      });
    });

    [
      poleMesh,
      crossarmMesh,
      insulatorMesh,
      transformerMesh,
      plinthMesh,
      capMesh,
      radiatorMesh,
      warningMesh,
    ].forEach(refreshInstanceBounds);
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [crossarmLayouts, geometries, gl, invalidate, placementByNodeId, poles, transformers]);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (visible && group) group.visible = true;
    transitionPending.current = true;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, visible]);

  useEffect(() => () => {
    Object.values(geometries).forEach((geometry) => geometry.dispose());
  }, [geometries]);

  useEffect(() => () => {
    wireGeometry.dispose();
  }, [wireGeometry]);

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials]);

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const target = visible ? 1 : 0;
    const next = THREE.MathUtils.damp(visibilityProgress.current, target, visible ? 10 : 13, delta);
    const settled = Math.abs(next - target) < 0.002;
    visibilityProgress.current = settled ? target : next;
    const progress = visibilityProgress.current;
    group.position.y = (1 - progress) * -0.22;
    materials.pole.opacity = FULL_OPACITY.pole * progress;
    materials.crossarm.opacity = FULL_OPACITY.crossarm * progress;
    materials.insulator.opacity = FULL_OPACITY.insulator * progress;
    materials.transformer.opacity = FULL_OPACITY.transformer * progress;
    materials.concrete.opacity = FULL_OPACITY.concrete * progress;
    materials.radiator.opacity = FULL_OPACITY.radiator * progress;
    materials.warning.opacity = FULL_OPACITY.warning * progress;
    materials.wire.opacity = FULL_OPACITY.wire * progress;
    if (settled) {
      group.visible = visible;
      if (transitionPending.current) {
        const castShadow = visible && !reducedGraphics;
        [poleRef.current, crossarmRef.current, transformerRef.current, capRef.current].forEach((mesh) => {
          if (mesh) mesh.castShadow = castShadow;
        });
        transitionPending.current = false;
        gl.shadowMap.needsUpdate = true;
      }
      return;
    }
    invalidate();
  });

  const castsInitialShadow = visible && !reducedGraphics && visibilityProgress.current >= 0.998;
  return (
    <group
      ref={groupRef}
      name="camada-infraestrutura-eletrica-comercial"
      visible={visible || visibilityProgress.current > 0.002}
    >
      <instancedMesh
        ref={poleRef}
        name="postes-infraestrutura-eletrica"
        args={[geometries.pole, materials.pole, poles.length]}
        count={poles.length}
        castShadow={castsInitialShadow}
        frustumCulled
        raycast={NO_RAYCAST}
      />
      <instancedMesh
        ref={crossarmRef}
        name="cruzetas-infraestrutura-eletrica"
        args={[geometries.crossarm, materials.crossarm, crossarmLayouts.length]}
        count={crossarmLayouts.length}
        castShadow={castsInitialShadow}
        frustumCulled
        raycast={NO_RAYCAST}
      />
      <instancedMesh
        ref={insulatorRef}
        name="isoladores-infraestrutura-eletrica"
        args={[geometries.insulator, materials.insulator, crossarmLayouts.length * 3 + transformers.length * 3]}
        count={crossarmLayouts.length * 3 + transformers.length * 3}
        frustumCulled
        raycast={NO_RAYCAST}
      />
      <instancedMesh
        ref={plinthRef}
        name="bases-transformadores"
        args={[geometries.plinth, materials.concrete, transformers.length]}
        count={transformers.length}
        frustumCulled
        raycast={NO_RAYCAST}
      />
      <instancedMesh
        ref={transformerRef}
        name="corpos-transformadores"
        args={[geometries.transformer, materials.transformer, transformers.length]}
        count={transformers.length}
        castShadow={castsInitialShadow}
        frustumCulled
        raycast={NO_RAYCAST}
      />
      <instancedMesh
        ref={capRef}
        name="coberturas-transformadores"
        args={[geometries.cap, materials.transformer, transformers.length]}
        count={transformers.length}
        castShadow={castsInitialShadow}
        frustumCulled
        raycast={NO_RAYCAST}
      />
      <instancedMesh
        ref={radiatorRef}
        name="radiadores-transformadores"
        args={[geometries.radiator, materials.radiator, transformers.length]}
        count={transformers.length}
        frustumCulled
        raycast={NO_RAYCAST}
      />
      <instancedMesh
        ref={warningRef}
        name="sinalizacao-transformadores"
        args={[geometries.warning, materials.warning, transformers.length]}
        count={transformers.length}
        frustumCulled
        raycast={NO_RAYCAST}
      />
      <lineSegments
        name="cabos-aereos-infraestrutura-eletrica"
        geometry={wireGeometry}
        material={materials.wire}
        frustumCulled
        renderOrder={5}
        raycast={NO_RAYCAST}
      />
    </group>
  );
}

export const CommercialElectricalInfrastructureLayer = memo(function CommercialElectricalInfrastructureLayer(props: {
  nodes: readonly CommercialElectricalNode[];
  connections: readonly CommercialElectricalConnection[];
  surfaceEntities: readonly MapEntity[];
  visible: boolean;
  reducedGraphics: boolean;
  rearRoadsActive?: boolean;
}) {
  if (props.nodes.length === 0) return null;
  return (
    <CommercialElectricalInfrastructureInstances
      key={props.reducedGraphics ? 'electrical-reduced' : 'electrical-full'}
      {...props}
    />
  );
});
