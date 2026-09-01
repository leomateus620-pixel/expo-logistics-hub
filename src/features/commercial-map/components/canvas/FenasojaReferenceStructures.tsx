import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  createCooperativismLayout,
  createGastronomicAlamedaLayout,
} from '../../utils/fenasojaReferenceStructures';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import type { StrategicLandmarkBounds } from '../../utils/landmarks';

const NO_RAYCAST = () => undefined;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const UNIT_TRIANGLE = new THREE.BufferGeometry();
UNIT_TRIANGLE.setAttribute('position', new THREE.Float32BufferAttribute([
  -1, 0, 0,
  1, 0, 0,
  0, 1, 0,
], 3));
UNIT_TRIANGLE.setIndex([0, 1, 2]);
UNIT_TRIANGLE.computeVertexNormals();

type Vector3Tuple = [number, number, number];

interface StructureMaterials {
  wall: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  green: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  platform: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
}

interface InstanceTransform {
  position?: Vector3Tuple;
  scale?: Vector3Tuple;
  rotation?: Vector3Tuple;
  matrix?: THREE.Matrix4;
}

function ScaledInstances({
  geometry = UNIT_BOX,
  material,
  items,
  castShadow = false,
  receiveShadow = false,
}: {
  geometry?: THREE.BufferGeometry;
  material: THREE.Material;
  items: readonly InstanceTransform[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    items.forEach((item, index) => {
      if (item.matrix) {
        mesh.setMatrixAt(index, item.matrix);
        return;
      }
      object.position.set(...(item.position ?? [0, 0, 0]));
      object.rotation.set(...(item.rotation ?? [0, 0, 0]));
      object.scale.set(...(item.scale ?? [1, 1, 1]));
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [items]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    return () => disposeInstancedMesh(mesh);
  }, []);

  if (!items.length) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={NO_RAYCAST}
      frustumCulled
      dispose={null}
    />
  );
}

function beamBetween(
  start: Vector3Tuple,
  end: Vector3Tuple,
  thickness: number,
): InstanceTransform {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const length = Math.max(0.001, direction.length());
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    direction.normalize(),
  );
  const matrix = new THREE.Matrix4().compose(
    from.add(to).multiplyScalar(0.5),
    quaternion,
    new THREE.Vector3(length, thickness, thickness),
  );
  return { matrix };
}

function CooperativismArchitecture({
  bounds,
  height,
  materials,
  showDetail,
  reducedGraphics,
}: {
  bounds: StrategicLandmarkBounds;
  height: number;
  materials: StructureMaterials;
  showDetail: boolean;
  reducedGraphics: boolean;
}) {
  const layout = useMemo(() => createCooperativismLayout(bounds, height), [bounds, height]);
  const roofCenterY = (layout.roof.eaveY + layout.roof.ridgeY) / 2;
  const facadeZ = layout.wall.frontZ + 0.012;
  const windows = useMemo<InstanceTransform[]>(() => {
    const items: InstanceTransform[] = [];
    const sideSpan = (layout.wall.width - layout.facade.entranceWidth) / 2;
    const windowWidth = Math.min(0.28, sideSpan * 0.23);
    [-1, 1].forEach((side) => {
      for (let index = 0; index < layout.facade.sideWindowCount; index += 1) {
        const local = (index + 1) / (layout.facade.sideWindowCount + 1);
        const x = side * (
          layout.facade.entranceWidth / 2
          + sideSpan * local
        );
        items.push({
          position: [x, layout.foundation.topY + layout.wall.height * 0.42, facadeZ + 0.018],
          scale: [windowWidth, layout.wall.height * 0.28, 0.026],
        });
      }
    });
    return items;
  }, [facadeZ, layout]);
  const roofRibs = useMemo<InstanceTransform[]>(() => {
    if (!showDetail) return [];
    const ribs: InstanceTransform[] = [];
    for (let index = 0; index < layout.roof.ribCount; index += 1) {
      const z = -layout.roof.depth / 2
        + layout.roof.depth * (index / Math.max(1, layout.roof.ribCount - 1));
      ribs.push(
        beamBetween([0, layout.roof.ridgeY + 0.012, z], [layout.roof.halfSpan, layout.roof.eaveY + 0.012, z], 0.018),
        beamBetween([0, layout.roof.ridgeY + 0.012, z], [-layout.roof.halfSpan, layout.roof.eaveY + 0.012, z], 0.018),
      );
    }
    return ribs;
  }, [layout, showDetail]);
  const entranceSideX = layout.facade.entranceWidth / 2 + 0.055;

  return (
    <group name="arquitetura-b28-espaco-cooperativismo" raycast={NO_RAYCAST} dispose={null}>
      <mesh
        geometry={UNIT_BOX}
        material={materials.platform}
        position={[0, layout.foundation.height / 2, layout.foundation.frontApronDepth * 0.1]}
        scale={[layout.foundation.width, layout.foundation.height, layout.foundation.depth]}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.trim}
        position={[0, layout.foundation.height * 0.58, layout.depth / 2 + layout.foundation.frontApronDepth / 2]}
        scale={[layout.wall.width * 0.76, layout.foundation.height * 0.32, layout.foundation.frontApronDepth]}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.wall}
        position={[0, layout.wall.centerY, 0]}
        scale={[layout.wall.width, layout.wall.height, layout.wall.depth]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      {[-1, 1].map((side) => (
        <mesh
          key={`cooperativism-low-wing-${side}`}
          geometry={UNIT_BOX}
          material={materials.dark}
          position={[side * layout.width * 0.425, layout.foundation.topY + layout.wall.height * 0.22, -layout.depth * 0.03]}
          scale={[layout.width * 0.13, layout.wall.height * 0.42, layout.depth * 0.72]}
          castShadow={!reducedGraphics}
          receiveShadow
          raycast={NO_RAYCAST}
        />
      ))}

      <mesh
        geometry={UNIT_BOX}
        material={materials.roof}
        position={[layout.roof.halfSpan / 2, roofCenterY, 0]}
        rotation={[0, 0, -layout.roof.angle]}
        scale={[layout.roof.slopeLength, layout.roof.thickness, layout.roof.depth]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.roof}
        position={[-layout.roof.halfSpan / 2, roofCenterY, 0]}
        rotation={[0, 0, layout.roof.angle]}
        scale={[layout.roof.slopeLength, layout.roof.thickness, layout.roof.depth]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.metal}
        position={[0, layout.roof.ridgeY + layout.roof.thickness * 0.2, 0]}
        scale={[0.08, layout.roof.thickness * 0.72, layout.roof.depth]}
        raycast={NO_RAYCAST}
      />
      <ScaledInstances material={materials.trim} items={roofRibs} />

      <mesh
        geometry={UNIT_TRIANGLE}
        material={materials.wall}
        position={[0, layout.roof.eaveY, facadeZ]}
        scale={[layout.wall.width / 2, layout.roof.rise * 0.88, 1]}
        castShadow={!reducedGraphics}
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.dark}
        position={[0, layout.facade.entranceCenterY, facadeZ + layout.facade.recessDepth * 0.22]}
        scale={[
          layout.facade.entranceWidth + 0.12,
          layout.facade.entranceHeight + 0.12,
          layout.facade.recessDepth,
        ]}
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.glass}
        position={[0, layout.facade.entranceCenterY, facadeZ + layout.facade.recessDepth * 0.82]}
        scale={[layout.facade.entranceWidth, layout.facade.entranceHeight, 0.035]}
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.metal}
        position={[0, layout.facade.entranceCenterY, facadeZ + layout.facade.recessDepth]}
        scale={[0.026, layout.facade.entranceHeight, 0.022]}
        raycast={NO_RAYCAST}
      />
      {[-1, 1].map((side) => (
        <mesh
          key={`cooperativism-entrance-pilaster-${side}`}
          geometry={UNIT_BOX}
          material={materials.trim}
          position={[side * entranceSideX, layout.facade.entranceCenterY, facadeZ + 0.035]}
          scale={[0.095, layout.facade.entranceHeight + 0.18, 0.08]}
          castShadow={!reducedGraphics}
          raycast={NO_RAYCAST}
        />
      ))}
      <mesh
        geometry={UNIT_BOX}
        material={materials.green}
        position={[0, layout.facade.signCenterY, facadeZ + 0.026]}
        scale={[layout.facade.signWidth, layout.facade.signHeight, 0.045]}
        raycast={NO_RAYCAST}
      />
      <ScaledInstances material={materials.glass} items={windows} />

      {showDetail && (
        <>
          <ScaledInstances
            material={materials.dark}
            items={[
              beamBetween([-layout.roof.halfSpan, layout.roof.eaveY, facadeZ + 0.035], [0, layout.roof.ridgeY, facadeZ + 0.035], 0.052),
              beamBetween([0, layout.roof.ridgeY, facadeZ + 0.035], [layout.roof.halfSpan, layout.roof.eaveY, facadeZ + 0.035], 0.052),
            ]}
          />
          <mesh
            geometry={UNIT_BOX}
            material={materials.trim}
            position={[0, layout.foundation.topY + 0.025, facadeZ + layout.facade.recessDepth * 1.18]}
            scale={[layout.facade.entranceWidth * 1.12, 0.05, 0.16]}
            receiveShadow
            raycast={NO_RAYCAST}
          />
        </>
      )}
    </group>
  );
}

function GastronomicAlamedaArchitecture({
  bounds,
  height,
  materials,
  showDetail,
  reducedGraphics,
}: {
  bounds: StrategicLandmarkBounds;
  height: number;
  materials: StructureMaterials;
  showDetail: boolean;
  reducedGraphics: boolean;
}) {
  const layout = useMemo(() => createGastronomicAlamedaLayout(bounds, height), [bounds, height]);
  const bays = useMemo(() => {
    const bayWidth = layout.building.width / layout.building.bayCount;
    const openings: InstanceTransform[] = [];
    const columns: InstanceTransform[] = [];
    for (let index = 0; index < layout.building.bayCount; index += 1) {
      const centerX = -layout.building.width / 2 + bayWidth * (index + 0.5);
      openings.push({
        position: [centerX, layout.building.wallBaseY + layout.building.wallHeight * 0.5, layout.building.frontZ + 0.026],
        scale: [bayWidth * 0.72, layout.building.wallHeight * 0.72, 0.045],
      });
    }
    for (let index = 0; index <= layout.building.bayCount; index += 1) {
      columns.push({
        position: [
          -layout.building.width / 2 + bayWidth * index,
          layout.building.wallBaseY + layout.building.wallHeight * 0.5,
          layout.building.frontZ + 0.09,
        ],
        scale: [layout.building.columnRadius * 2, layout.building.wallHeight, layout.building.columnRadius * 2],
      });
    }
    return { openings, columns };
  }, [layout]);
  const roofCenterY = (layout.roof.eaveY + layout.roof.ridgeY) / 2;
  const roofCenterZ = layout.building.centerZ;
  const roofRibs = useMemo<InstanceTransform[]>(() => {
    if (!showDetail) return [];
    const ribs: InstanceTransform[] = [];
    for (let index = 0; index < layout.roof.ribCount; index += 1) {
      const x = -layout.roof.width / 2
        + layout.roof.width * (index / Math.max(1, layout.roof.ribCount - 1));
      ribs.push(
        beamBetween([x, layout.roof.ridgeY + 0.01, roofCenterZ], [x, layout.roof.eaveY + 0.01, roofCenterZ + layout.roof.halfSpan], 0.016),
        beamBetween([x, layout.roof.ridgeY + 0.01, roofCenterZ], [x, layout.roof.eaveY + 0.01, roofCenterZ - layout.roof.halfSpan], 0.016),
      );
    }
    return ribs;
  }, [layout, roofCenterZ, showDetail]);
  const poles = useMemo<InstanceTransform[]>(() => layout.flagpoles.positionsX.map((x, index) => ({
    position: [x, layout.flagpoles.heights[index] / 2, layout.flagpoles.lineZ],
    scale: [layout.flagpoles.radius * 2, layout.flagpoles.heights[index], layout.flagpoles.radius * 2],
  })), [layout]);
  const stairSteps = useMemo<InstanceTransform[]>(() => Array.from(
    { length: layout.access.stepCount },
    (_, index) => {
      const heightAtStep = layout.access.stepRise * (index + 1);
      return {
        position: [
          layout.access.centerX,
          heightAtStep / 2,
          layout.access.frontZ - layout.access.stepDepth * (index + 0.5),
        ] as Vector3Tuple,
        scale: [layout.access.stairWidth, heightAtStep, layout.access.stepDepth + 0.01] as Vector3Tuple,
      };
    },
  ), [layout]);
  const stairBackZ = layout.access.frontZ - layout.access.stairRun;
  const railingY = layout.platform.topY + layout.access.railingHeight / 2;
  const stairRails = useMemo<InstanceTransform[]>(() => [-1, 1].flatMap((side) => {
    const x = side * layout.access.stairWidth / 2;
    return [
      beamBetween([x, layout.access.stepRise, layout.access.frontZ], [x, layout.platform.topY + layout.access.railingHeight, stairBackZ], 0.025),
      {
        position: [x, railingY, (layout.building.frontZ + stairBackZ) / 2],
        scale: [0.026, layout.access.railingHeight, Math.max(0.2, stairBackZ - layout.building.frontZ)],
      },
    ];
  }), [layout, railingY, stairBackZ]);
  const rampStart: Vector3Tuple = [layout.access.rampCenterX, 0.025, layout.access.frontZ];
  const rampEnd: Vector3Tuple = [layout.access.rampCenterX, layout.platform.topY, layout.building.frontZ + 0.12];
  const rampVector = new THREE.Vector3(...rampEnd).sub(new THREE.Vector3(...rampStart));
  const rampLength = rampVector.length();
  const rampAngle = Math.atan2(layout.platform.topY, Math.abs(rampEnd[2] - rampStart[2]));

  return (
    <group name="arquitetura-d1-alameda-gastronomica" raycast={NO_RAYCAST} dispose={null}>
      <mesh
        geometry={UNIT_BOX}
        material={materials.platform}
        position={[0, layout.platform.centerY, layout.platform.centerZ]}
        scale={[layout.platform.width, layout.platform.thickness, layout.platform.depth]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.dark}
        position={[0, layout.platform.topY * 0.43, layout.platform.frontZ - 0.035]}
        scale={[layout.platform.width, layout.platform.topY * 0.86, 0.085]}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.dark}
        position={[0, layout.building.wallCenterY, layout.building.centerZ]}
        scale={[layout.building.width, layout.building.wallHeight, layout.building.depth]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <ScaledInstances material={materials.glass} items={bays.openings} />
      <ScaledInstances
        geometry={UNIT_CYLINDER}
        material={materials.metal}
        items={bays.columns}
        castShadow={!reducedGraphics}
      />

      <mesh
        geometry={UNIT_BOX}
        material={materials.roof}
        position={[0, roofCenterY, roofCenterZ + layout.roof.halfSpan / 2]}
        rotation={[layout.roof.angle, 0, 0]}
        scale={[layout.roof.width, layout.roof.thickness, layout.roof.slopeLength]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.roof}
        position={[0, roofCenterY, roofCenterZ - layout.roof.halfSpan / 2]}
        rotation={[-layout.roof.angle, 0, 0]}
        scale={[layout.roof.width, layout.roof.thickness, layout.roof.slopeLength]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.metal}
        position={[0, layout.roof.ridgeY + 0.018, roofCenterZ]}
        scale={[layout.roof.width, 0.048, 0.065]}
        raycast={NO_RAYCAST}
      />
      <ScaledInstances material={materials.trim} items={roofRibs} />

      <ScaledInstances
        geometry={UNIT_CYLINDER}
        material={materials.metal}
        items={poles}
        castShadow={!reducedGraphics}
      />
      <ScaledInstances
        material={materials.platform}
        items={stairSteps}
        receiveShadow
      />
      <ScaledInstances material={materials.metal} items={stairRails} />

      {showDetail && (
        <>
          <mesh
            geometry={UNIT_BOX}
            material={materials.platform}
            position={[
              layout.access.rampCenterX,
              layout.platform.topY / 2,
              (rampStart[2] + rampEnd[2]) / 2,
            ]}
            rotation={[rampAngle, 0, 0]}
            scale={[layout.access.rampWidth, 0.07, rampLength]}
            receiveShadow
            raycast={NO_RAYCAST}
          />
          <ScaledInstances
            material={materials.metal}
            items={[-1, 1].flatMap((side) => {
              const x = layout.access.rampCenterX + side * layout.access.rampWidth / 2;
              return [
                beamBetween(
                  [x, layout.access.railingHeight, rampStart[2]],
                  [x, layout.platform.topY + layout.access.railingHeight, rampEnd[2]],
                  0.024,
                ),
                { position: [x, railingY, rampEnd[2] - 0.08], scale: [0.025, layout.access.railingHeight, 0.18] },
              ];
            })}
          />
        </>
      )}
    </group>
  );
}

export const CooperativismSpace = memo(function CooperativismSpace({
  bounds,
  height,
  materials,
  showDetail,
  reducedGraphics = false,
}: {
  bounds: StrategicLandmarkBounds;
  height: number;
  materials: StructureMaterials;
  showDetail: boolean;
  showFocusDetail: boolean;
  reducedGraphics?: boolean;
}) {
  return (
    <CooperativismArchitecture
      bounds={bounds}
      height={height}
      materials={materials}
      showDetail={showDetail}
      reducedGraphics={reducedGraphics}
    />
  );
});

export const GastronomicAlameda = memo(function GastronomicAlameda({
  bounds,
  height,
  materials,
  showDetail,
  reducedGraphics = false,
}: {
  bounds: StrategicLandmarkBounds;
  height: number;
  materials: StructureMaterials;
  showDetail: boolean;
  showFocusDetail: boolean;
  reducedGraphics?: boolean;
}) {
  return (
    <GastronomicAlamedaArchitecture
      bounds={bounds}
      height={height}
      materials={materials}
      showDetail={showDetail}
      reducedGraphics={reducedGraphics}
    />
  );
});
