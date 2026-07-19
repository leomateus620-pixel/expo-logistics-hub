import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  createMiranteFurniturePlan,
  createMiranteLayout,
  miranteStructuralBayPositions,
  type MiranteLayout,
} from '../../utils/mirante';
import type { StrategicLandmarkBounds } from '../../utils/landmarks';

const NO_RAYCAST = () => undefined;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const UNIT_TRIANGLE = new THREE.BufferGeometry();
UNIT_TRIANGLE.setAttribute(
  'position',
  new THREE.Float32BufferAttribute([
    -1, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ], 3),
);
UNIT_TRIANGLE.setIndex([0, 1, 2]);
UNIT_TRIANGLE.computeVertexNormals();

type Vector3Tuple = [number, number, number];
type QuaternionTuple = [number, number, number, number];

interface InstanceTransform {
  position?: Vector3Tuple;
  scale?: Vector3Tuple;
  rotation?: Vector3Tuple;
  quaternion?: QuaternionTuple;
  matrix?: THREE.Matrix4;
}

export interface MirantePavilionMaterials {
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

function ScaledInstances({
  geometry = UNIT_BOX,
  material,
  items,
  castShadow = false,
  receiveShadow = false,
}: {
  geometry?: THREE.BufferGeometry;
  material: THREE.Material;
  items: InstanceTransform[];
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
      if (item.quaternion) object.quaternion.set(...item.quaternion);
      else object.quaternion.setFromEuler(object.rotation);
      object.scale.set(...(item.scale ?? [1, 1, 1]));
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [items]);

  if (!items.length) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={NO_RAYCAST}
      frustumCulled
    />
  );
}

function beamBetween(
  start: Vector3Tuple,
  end: Vector3Tuple,
  thickness: number,
): InstanceTransform {
  const startVector = new THREE.Vector3(...start);
  const endVector = new THREE.Vector3(...end);
  const direction = endVector.clone().sub(startVector);
  const length = Math.max(0.001, direction.length());
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    direction.normalize(),
  );
  return {
    position: startVector.add(endVector).multiplyScalar(0.5).toArray() as Vector3Tuple,
    scale: [length, thickness, thickness],
    quaternion: quaternion.toArray() as QuaternionTuple,
  };
}

function slabBetween(
  start: Vector3Tuple,
  end: Vector3Tuple,
  width: number,
  thickness: number,
): InstanceTransform {
  const startVector = new THREE.Vector3(...start);
  const endVector = new THREE.Vector3(...end);
  const forward = endVector.clone().sub(startVector);
  const length = Math.max(0.001, forward.length());
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward);
  if (right.lengthSq() < 0.001) right.set(1, 0, 0);
  else right.normalize();
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, up, forward);
  basis.setPosition(startVector.add(endVector).multiplyScalar(0.5));
  basis.scale(new THREE.Vector3(width, thickness, length));
  return { matrix: basis };
}

function beamAlongXy(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  z: number,
  thickness: number,
): InstanceTransform {
  return beamBetween(
    [startX, startY, z],
    [endX, endY, z],
    thickness,
  );
}

function splitRailSegments(
  minZ: number,
  maxZ: number,
  clearMinZ: number,
  clearMaxZ: number,
) {
  const segments: Array<[number, number]> = [];
  if (clearMinZ - minZ > 0.08) segments.push([minZ, clearMinZ]);
  if (maxZ - clearMaxZ > 0.08) segments.push([clearMaxZ, maxZ]);
  return segments;
}

function createArchitecture(
  layout: MiranteLayout,
  showDetail: boolean,
  showFocusDetail: boolean,
  reducedGraphics: boolean,
) {
  const bayPositions = miranteStructuralBayPositions(layout);
  const columns: InstanceTransform[] = [];
  const longitudinalBeams: InstanceTransform[] = [];
  const trussMembers: InstanceTransform[] = [];
  const purlins: InstanceTransform[] = [];
  const roofRibs: InstanceTransform[] = [];
  const railingPosts: InstanceTransform[] = [];
  const railingRails: InstanceTransform[] = [];
  const lowerOpenings: InstanceTransform[] = [];
  const stairSteps: InstanceTransform[] = [];
  const accessRails: InstanceTransform[] = [];
  const furniturePlan = createMiranteFurniturePlan(layout);
  const tableTops: InstanceTransform[] = [];
  const tableLegs: InstanceTransform[] = [];
  const chairSeats: InstanceTransform[] = [];
  const chairBacks: InstanceTransform[] = [];
  const chairLegs: InstanceTransform[] = [];

  const columnX = layout.width / 2 - layout.structure.bayInset;
  bayPositions.forEach((z) => {
    [-1, 1].forEach((side) => {
      columns.push({
        position: [
          side * columnX,
          layout.structure.columnCenterY,
          z,
        ],
        scale: [
          layout.structure.columnSize,
          layout.structure.columnHeight,
          layout.structure.columnSize,
        ],
      });
    });
    if (!showDetail) return;
    const trussY = layout.roof.eaveY - layout.structure.beamSize * 0.2;
    trussMembers.push(
      beamAlongXy(
        -layout.roof.halfSpan,
        trussY,
        layout.roof.halfSpan,
        trussY,
        z,
        layout.structure.trussMemberSize,
      ),
      beamAlongXy(
        -layout.roof.halfSpan,
        layout.roof.eaveY,
        0,
        layout.roof.ridgeY,
        z,
        layout.structure.trussMemberSize,
      ),
      beamAlongXy(
        0,
        layout.roof.ridgeY,
        layout.roof.halfSpan,
        layout.roof.eaveY,
        z,
        layout.structure.trussMemberSize,
      ),
    );
    [-0.66, -0.33, 0.33, 0.66].forEach((ratio) => {
      const topY = layout.roof.ridgeY
        - layout.roof.rise * Math.abs(ratio);
      const nextRatio = ratio < 0 ? ratio + 0.33 : ratio - 0.33;
      trussMembers.push(
        beamAlongXy(
          ratio * layout.roof.halfSpan,
          trussY,
          nextRatio * layout.roof.halfSpan,
          topY,
          z,
          layout.structure.trussMemberSize * 0.84,
        ),
      );
    });
  });

  [-1, 1].forEach((side) => {
    longitudinalBeams.push({
      position: [
        side * columnX,
        layout.roof.eaveY - layout.structure.beamSize * 0.3,
        0,
      ],
      scale: [
        layout.structure.beamSize,
        layout.structure.beamSize,
        layout.depth - layout.structure.bayInset * 1.25,
      ],
    });
  });
  longitudinalBeams.push({
    position: [0, layout.roof.ridgeY - layout.structure.beamSize * 0.2, 0],
    scale: [
      layout.structure.beamSize,
      layout.structure.beamSize,
      layout.depth - layout.structure.bayInset,
    ],
  });

  if (showDetail) {
    for (let index = 1; index <= layout.structure.purlinCount; index += 1) {
      const ratio = index / (layout.structure.purlinCount + 1);
      [-1, 1].forEach((side) => {
        purlins.push({
          position: [
            side * layout.roof.halfSpan * ratio,
            layout.roof.ridgeY - layout.roof.rise * ratio - 0.015,
            0,
          ],
          scale: [
            layout.structure.trussMemberSize * 0.72,
            layout.structure.trussMemberSize * 0.72,
            layout.roof.depth - 0.08,
          ],
        });
      });
    }

    const ribCount = showFocusDetail ? 24 : 12;
    for (let index = 0; index < ribCount; index += 1) {
      const z = -layout.roof.depth / 2 + ((index + 0.5) / ribCount) * layout.roof.depth;
      [-1, 1].forEach((side) => {
        roofRibs.push({
          position: [
            side * layout.roof.halfSpan * 0.5,
            (layout.roof.eaveY + layout.roof.ridgeY) / 2 + 0.018,
            z,
          ],
          scale: [layout.roof.slopeLength, 0.018, 0.018],
          rotation: [0, 0, side > 0 ? -layout.roof.angle : layout.roof.angle],
        });
      });
    }

    const railMinZ = -layout.depth / 2 + layout.railings.inset;
    const railMaxZ = layout.depth / 2 - layout.railings.inset;
    const regularPostCount = Math.max(
      3,
      Math.ceil((railMaxZ - railMinZ) / layout.railings.postSpacing),
    );
    [-1, 1].forEach((side) => {
      for (let index = 0; index <= regularPostCount; index += 1) {
        const z = THREE.MathUtils.lerp(railMinZ, railMaxZ, index / regularPostCount);
        if (
          side > 0
          && z > layout.access.clearMinZ
          && z < layout.access.clearMaxZ
        ) continue;
        railingPosts.push({
          position: [
            side * (layout.width / 2 - layout.railings.inset),
            layout.platform.topY + layout.railings.height / 2,
            z,
          ],
          scale: [
            layout.railings.postSize,
            layout.railings.height,
            layout.railings.postSize,
          ],
        });
      }

      const segments = side < 0
        ? [[railMinZ, railMaxZ] as [number, number]]
        : splitRailSegments(
          railMinZ,
          railMaxZ,
          layout.access.clearMinZ,
          layout.access.clearMaxZ,
        );
      segments.forEach(([startZ, endZ]) => {
        [0.48, 0.88].forEach((heightRatio) => {
          railingRails.push({
            position: [
              side * (layout.width / 2 - layout.railings.inset),
              layout.platform.topY + layout.railings.height * heightRatio,
              (startZ + endZ) / 2,
            ],
            scale: [
              layout.railings.railSize,
              layout.railings.railSize,
              endZ - startZ,
            ],
          });
        });
      });
    });

    [-1, 1].forEach((zSide) => {
      const z = zSide * (layout.depth / 2 - layout.railings.inset);
      const width = layout.width - layout.railings.inset * 2;
      const endPostCount = Math.max(2, Math.ceil(width / layout.railings.postSpacing));
      for (let index = 0; index <= endPostCount; index += 1) {
        railingPosts.push({
          position: [
            THREE.MathUtils.lerp(-width / 2, width / 2, index / endPostCount),
            layout.platform.topY + layout.railings.height / 2,
            z,
          ],
          scale: [
            layout.railings.postSize,
            layout.railings.height,
            layout.railings.postSize,
          ],
        });
      }
      [0.48, 0.88].forEach((heightRatio) => {
        railingRails.push({
          position: [
            0,
            layout.platform.topY + layout.railings.height * heightRatio,
            z,
          ],
          scale: [
            width,
            layout.railings.railSize,
            layout.railings.railSize,
          ],
        });
      });
    });

    const openingCount = Math.max(4, Math.min(7, Math.round(layout.depth / 1.35)));
    for (let index = 0; index < openingCount; index += 1) {
      const z = -layout.depth * 0.36 + (index / Math.max(1, openingCount - 1)) * layout.depth * 0.72;
      const isDoor = index % 2 === 0;
      lowerOpenings.push({
        position: [
          layout.base.width / 2 + 0.012,
          isDoor ? layout.base.height * 0.34 : layout.base.height * 0.58,
          z,
        ],
        scale: [
          0.025,
          isDoor ? layout.base.height * 0.58 : layout.base.height * 0.22,
          Math.min(0.5, layout.depth / openingCount * 0.46),
        ],
      });
    }

    const stairStart = layout.access.stairs.start as Vector3Tuple;
    const stairEnd = layout.access.stairs.endpoint as Vector3Tuple;
    const stairDx = stairEnd[0] - stairStart[0];
    const stairDz = stairEnd[2] - stairStart[2];
    const stairRotation = Math.atan2(stairDx, stairDz);
    for (let index = 0; index < layout.access.stairs.stepCount; index += 1) {
      const ratio = (index + 0.5) / layout.access.stairs.stepCount;
      const stepHeight = (index + 1) * layout.access.stairs.stepRise;
      stairSteps.push({
        position: [
          THREE.MathUtils.lerp(stairStart[0], stairEnd[0], ratio),
          stairStart[1] + stepHeight / 2,
          THREE.MathUtils.lerp(stairStart[2], stairEnd[2], ratio),
        ],
        scale: [
          layout.access.stairs.width,
          stepHeight,
          layout.access.stairs.stepDepth + 0.015,
        ],
        rotation: [0, stairRotation, 0],
      });
    }

    const addAccessGuardrail = (
      start: Vector3Tuple,
      end: Vector3Tuple,
      width: number,
      guardrailHeight: number,
      intervals: number,
    ) => {
      const horizontal = new THREE.Vector3(end[0] - start[0], 0, end[2] - start[2]);
      const perpendicular = new THREE.Vector3(-horizontal.z, 0, horizontal.x).normalize();
      [-1, 1].forEach((side) => {
        const lateral = perpendicular.clone().multiplyScalar(side * width * 0.48);
        const startRail = new THREE.Vector3(...start).add(lateral);
        const endRail = new THREE.Vector3(...end).add(lateral);
        startRail.y += guardrailHeight;
        endRail.y += guardrailHeight;
        accessRails.push(
          beamBetween(
            startRail.toArray() as Vector3Tuple,
            endRail.toArray() as Vector3Tuple,
            layout.railings.railSize,
          ),
        );
        for (let index = 0; index <= intervals; index += 1) {
          const ratio = index / intervals;
          const floor = new THREE.Vector3(
            THREE.MathUtils.lerp(start[0], end[0], ratio),
            THREE.MathUtils.lerp(start[1], end[1], ratio),
            THREE.MathUtils.lerp(start[2], end[2], ratio),
          ).add(lateral);
          accessRails.push({
            position: [
              floor.x,
              floor.y + guardrailHeight / 2,
              floor.z,
            ],
            scale: [
              layout.railings.postSize,
              guardrailHeight,
              layout.railings.postSize,
            ],
          });
        }
      });
    };

    addAccessGuardrail(
      layout.access.ramp.start as Vector3Tuple,
      layout.access.ramp.endpoint as Vector3Tuple,
      layout.access.ramp.width,
      layout.access.ramp.guardrailHeight,
      5,
    );
    addAccessGuardrail(
      stairStart,
      stairEnd,
      layout.access.stairs.width,
      layout.railings.height,
      Math.max(2, Math.floor(layout.access.stairs.stepCount / 2)),
    );
  }

  if (showFocusDetail) {
    const tableWidth = Math.min(0.48, layout.width * 0.2);
    const tableDepth = tableWidth * 0.78;
    const tableHeight = Math.max(0.34, layout.platform.thickness * 1.55);
    const chairWidth = tableWidth * 0.34;
    const chairDepth = chairWidth * 0.92;
    const chairSeatY = layout.platform.topY + tableHeight * 0.52;

    furniturePlan.tables
      .filter((pose) => !reducedGraphics || pose.groupIndex < 2)
      .forEach((pose) => {
      const [x, , z] = pose.position as Vector3Tuple;
      tableTops.push({
        position: [x, layout.platform.topY + tableHeight, z],
        scale: [tableWidth, 0.055, tableDepth],
        rotation: [0, pose.rotationY, 0],
      });
      [-1, 1].forEach((xSide) => {
        [-1, 1].forEach((zSide) => {
          const local = new THREE.Vector3(
            xSide * tableWidth * 0.39,
            0,
            zSide * tableDepth * 0.37,
          ).applyAxisAngle(new THREE.Vector3(0, 1, 0), pose.rotationY);
          tableLegs.push({
            position: [
              x + local.x,
              layout.platform.topY + tableHeight / 2,
              z + local.z,
            ],
            scale: [0.035, tableHeight, 0.035],
          });
        });
      });
      });

    furniturePlan.chairs
      .filter((pose) => !reducedGraphics || pose.groupIndex < 2)
      .forEach((pose) => {
      const [x, , z] = pose.position as Vector3Tuple;
      chairSeats.push({
        position: [x, chairSeatY, z],
        scale: [chairWidth, 0.05, chairDepth],
        rotation: [0, pose.rotationY, 0],
      });
      const backward = new THREE.Vector3(0, 0, -chairDepth * 0.42)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), pose.rotationY);
      chairBacks.push({
        position: [
          x + backward.x,
          chairSeatY + chairWidth * 0.48,
          z + backward.z,
        ],
        scale: [chairWidth, chairWidth * 0.84, 0.045],
        rotation: [0, pose.rotationY, 0],
      });
      [-1, 1].forEach((xSide) => {
        [-1, 1].forEach((zSide) => {
          const local = new THREE.Vector3(
            xSide * chairWidth * 0.38,
            0,
            zSide * chairDepth * 0.36,
          ).applyAxisAngle(new THREE.Vector3(0, 1, 0), pose.rotationY);
          chairLegs.push({
            position: [
              x + local.x,
              layout.platform.topY + (chairSeatY - layout.platform.topY) / 2,
              z + local.z,
            ],
            scale: [0.022, chairSeatY - layout.platform.topY, 0.022],
          });
        });
      });
      });
  }

  return {
    columns,
    longitudinalBeams,
    trussMembers,
    purlins,
    roofRibs,
    railingPosts,
    railingRails,
    lowerOpenings,
    stairSteps,
    accessRails,
    furniture: {
      tableTops,
      tableLegs,
      chairSeats,
      chairBacks,
      chairLegs,
    },
  };
}

export const MiranteArchitecture = memo(function MiranteArchitecture({
  layout,
  materials,
  showDetail,
  showFocusDetail,
  cutaway = false,
  reducedGraphics = false,
}: {
  layout: MiranteLayout;
  materials: MirantePavilionMaterials;
  showDetail: boolean;
  showFocusDetail: boolean;
  cutaway?: boolean;
  reducedGraphics?: boolean;
}) {
  const architecture = useMemo(
    () => createArchitecture(layout, showDetail, showFocusDetail, reducedGraphics),
    [layout, reducedGraphics, showDetail, showFocusDetail],
  );
  const roofCenterY = (layout.roof.eaveY + layout.roof.ridgeY) / 2;
  const serviceWidth = Math.min(layout.width * 0.48, 0.92);
  const serviceDepth = Math.min(layout.depth * 0.13, 1.05);
  const serviceHeight = Math.min(
    layout.roof.eaveY - layout.platform.topY - 0.16,
    layout.height * 0.34,
  );
  const serviceZ = -layout.depth / 2 + serviceDepth * 0.72;
  const terrainPadWidth = layout.width * 1.12;
  const terrainPadCenterX = (terrainPadWidth - layout.width) / 2;
  const rampSurface = slabBetween(
    layout.access.ramp.start as Vector3Tuple,
    layout.access.ramp.endpoint as Vector3Tuple,
    layout.access.ramp.width,
    0.075,
  );
  const furnitureVisible = showFocusDetail;

  return (
    <group raycast={NO_RAYCAST} dispose={null}>
      <mesh
        geometry={UNIT_BOX}
        material={materials.green}
        position={[terrainPadCenterX, -0.025, 0]}
        scale={[terrainPadWidth, 0.11, layout.depth * 0.97]}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.wall}
        position={[0, layout.base.centerY, 0]}
        scale={[layout.base.width, layout.base.height, layout.base.depth]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.platform}
        position={[0, layout.platform.centerY, 0]}
        scale={[layout.platform.width, layout.platform.thickness, layout.platform.depth]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.trim}
        position={[layout.width * 0.48, layout.base.height * 0.28, 0]}
        scale={[
          layout.base.retainingThickness,
          layout.base.height * 0.56,
          layout.depth * 0.98,
        ]}
        receiveShadow
        raycast={NO_RAYCAST}
      />

      <mesh
        geometry={UNIT_BOX}
        material={materials.roof}
        position={[
          layout.roof.halfSpan * 0.5,
          roofCenterY,
          0,
        ]}
        rotation={[0, 0, -layout.roof.angle]}
        scale={[layout.roof.slopeLength, layout.roof.thickness, layout.roof.depth]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      {!cutaway && (
        <mesh
          geometry={UNIT_BOX}
          material={materials.roof}
          position={[
            -layout.roof.halfSpan * 0.5,
            roofCenterY,
            0,
          ]}
          rotation={[0, 0, layout.roof.angle]}
          scale={[layout.roof.slopeLength, layout.roof.thickness, layout.roof.depth]}
          castShadow={!reducedGraphics}
          receiveShadow
          raycast={NO_RAYCAST}
        />
      )}
      <mesh
        geometry={UNIT_BOX}
        material={materials.metal}
        position={[0, layout.roof.ridgeY + 0.018, 0]}
        scale={[
          layout.structure.beamSize * 1.2,
          layout.roof.thickness * 0.7,
          layout.roof.depth,
        ]}
        raycast={NO_RAYCAST}
      />

      <ScaledInstances
        material={materials.dark}
        items={architecture.columns}
        castShadow={!reducedGraphics}
      />
      <ScaledInstances material={materials.metal} items={architecture.longitudinalBeams} />

      {showDetail && (
        <>
          <ScaledInstances material={materials.metal} items={architecture.trussMembers} />
          <ScaledInstances material={materials.metal} items={architecture.purlins} />
          <ScaledInstances material={materials.trim} items={architecture.roofRibs} />
          <ScaledInstances material={materials.metal} items={architecture.railingPosts} />
          <ScaledInstances material={materials.metal} items={architecture.railingRails} />
          <ScaledInstances material={materials.dark} items={architecture.lowerOpenings} />
          <ScaledInstances
            material={materials.platform}
            items={architecture.stairSteps}
            receiveShadow
          />
          <ScaledInstances material={materials.metal} items={architecture.accessRails} />
          <ScaledInstances
            material={materials.platform}
            items={[rampSurface]}
            receiveShadow
          />
          <mesh
            geometry={UNIT_TRIANGLE}
            material={materials.roof}
            position={[0, layout.roof.eaveY, -layout.roof.depth / 2 + 0.012]}
            scale={[layout.roof.halfSpan, layout.roof.rise, 1]}
            raycast={NO_RAYCAST}
          />
          <mesh
            geometry={UNIT_TRIANGLE}
            material={materials.roof}
            position={[0, layout.roof.eaveY, layout.roof.depth / 2 - 0.012]}
            rotation={[0, Math.PI, 0]}
            scale={[layout.roof.halfSpan, layout.roof.rise, 1]}
            raycast={NO_RAYCAST}
          />
          <group position={[-layout.width * 0.2, 0, serviceZ]} raycast={NO_RAYCAST}>
            <mesh
              geometry={UNIT_BOX}
              material={materials.white}
              position={[0, layout.platform.topY + serviceHeight / 2, 0]}
              scale={[serviceWidth, serviceHeight, serviceDepth]}
              castShadow={!reducedGraphics}
              raycast={NO_RAYCAST}
            />
            <mesh
              geometry={UNIT_BOX}
              material={materials.dark}
              position={[
                serviceWidth / 2 + 0.012,
                layout.platform.topY + serviceHeight * 0.42,
                serviceDepth * 0.08,
              ]}
              scale={[0.025, serviceHeight * 0.58, serviceDepth * 0.36]}
              raycast={NO_RAYCAST}
            />
          </group>
        </>
      )}

      {furnitureVisible && (
        <>
          <ScaledInstances material={materials.accent} items={architecture.furniture.tableTops} />
          <ScaledInstances material={materials.dark} items={architecture.furniture.tableLegs} />
          <ScaledInstances material={materials.accent} items={architecture.furniture.chairSeats} />
          <ScaledInstances material={materials.accent} items={architecture.furniture.chairBacks} />
          <ScaledInstances
            geometry={UNIT_CYLINDER}
            material={materials.dark}
            items={architecture.furniture.chairLegs}
          />
        </>
      )}
    </group>
  );
});

export const MirantePavilion = memo(function MirantePavilion({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: {
  bounds: StrategicLandmarkBounds;
  height: number;
  materials: MirantePavilionMaterials;
  showDetail: boolean;
  showFocusDetail: boolean;
}) {
  const layout = useMemo(
    () => createMiranteLayout(bounds, height),
    [bounds, height],
  );

  return (
    <MiranteArchitecture
      layout={layout}
      materials={materials}
      showDetail={showDetail}
      showFocusDetail={showFocusDetail}
    />
  );
});
