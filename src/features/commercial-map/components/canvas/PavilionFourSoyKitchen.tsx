import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  createPavilionFourSoyKitchenLayout,
  type PavilionFourSoyKitchenLayout,
} from '../../utils/pavilionFourSoyKitchen';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

const NO_RAYCAST = () => undefined;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const UNIT_LEAF = new THREE.ConeGeometry(0.5, 1, 3);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

type Vector3Tuple = [number, number, number];
type QuaternionTuple = [number, number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
  quaternion?: QuaternionTuple;
}

export interface PavilionFourSoyKitchenMaterials {
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

export interface PavilionFourSoyKitchenProps {
  bounds: {
    width: number;
    depth: number;
  };
  height: number;
  materials: PavilionFourSoyKitchenMaterials;
  showDetail: boolean;
  showFocusDetail: boolean;
}

function PavilionFourInstances({
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
  const invalidate = useThree((state) => state.invalidate);
  const instanceCount = items.length;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    items.forEach((item, index) => {
      object.position.set(...item.position);
      object.rotation.set(...(item.rotation ?? [0, 0, 0]));
      object.quaternion.setFromEuler(object.rotation);
      if (item.quaternion) object.quaternion.set(...item.quaternion);
      object.scale.set(...item.scale);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    invalidate();
  }, [invalidate, items]);

  useEffect(() => {
    const mesh = ref.current;
    return () => disposeInstancedMesh(mesh);
  }, [geometry, instanceCount, material]);

  if (!instanceCount) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, instanceCount]}
      count={instanceCount}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={NO_RAYCAST}
      dispose={null}
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
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  return {
    position: startVector.add(endVector).multiplyScalar(0.5).toArray() as Vector3Tuple,
    scale: [thickness, length, thickness],
    quaternion: quaternion.toArray() as QuaternionTuple,
  };
}

function createGableCapsGeometry(layout: PavilionFourSoyKitchenLayout) {
  const { building } = layout;
  const halfWidth = building.width / 2;
  const vertices = [
    -halfWidth, building.eaveY, building.rearZ,
    -halfWidth, building.eaveY, building.frontZ,
    -halfWidth, building.ridgeY, building.centerZ,
    halfWidth, building.eaveY, building.frontZ,
    halfWidth, building.eaveY, building.rearZ,
    halfWidth, building.ridgeY, building.centerZ,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSoyKitchenSignTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#193a2c';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#96bd35';
  context.fillRect(0, 0, 210, canvas.height);
  context.fillStyle = '#f5f1df';
  context.textBaseline = 'middle';
  context.textAlign = 'center';
  context.font = '900 152px Arial, sans-serif';
  context.fillText('04', 105, 135);
  context.textAlign = 'left';
  context.font = '800 72px Arial, sans-serif';
  context.fillText('COZINHA', 250, 96);
  context.font = '700 58px Arial, sans-serif';
  context.fillText('DA SOJA', 250, 174);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

function SoyKitchenSign({ layout }: { layout: PavilionFourSoyKitchenLayout }) {
  const texture = useMemo(createSoyKitchenSignTexture, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: texture ? '#ffffff' : '#193a2c',
    map: texture,
    roughness: 0.72,
    metalness: 0.01,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }), [texture]);

  useEffect(() => () => {
    texture?.dispose();
    material.dispose();
  }, [material, texture]);

  return (
    <mesh
      name="pavilion-four-soy-kitchen-sign-04"
      position={[0, layout.sign.centerY, layout.sign.z]}
      geometry={UNIT_PLANE}
      material={material}
      castShadow
      raycast={NO_RAYCAST}
      dispose={null}
      scale={[layout.sign.width, layout.sign.height, 1]}
    />
  );
}

function createTowerMembers(
  layout: PavilionFourSoyKitchenLayout,
  showDetail: boolean,
): InstanceTransform[] {
  const { centerX, centerZ, width, height, memberSize } = layout.cornerTower;
  const half = width / 2;
  const corners = [
    [-half, -half],
    [-half, half],
    [half, -half],
    [half, half],
  ] as const;
  const members: InstanceTransform[] = corners.map(([x, z]) => ({
    position: [centerX + x, height / 2, centerZ + z],
    scale: [memberSize, height, memberSize],
  }));
  [0.16, 0.5, 0.84].forEach((ratio) => {
    const y = height * ratio;
    members.push(
      beamBetween([centerX - half, y, centerZ - half], [centerX + half, y, centerZ - half], memberSize),
      beamBetween([centerX - half, y, centerZ + half], [centerX + half, y, centerZ + half], memberSize),
      beamBetween([centerX - half, y, centerZ - half], [centerX - half, y, centerZ + half], memberSize),
      beamBetween([centerX + half, y, centerZ - half], [centerX + half, y, centerZ + half], memberSize),
    );
  });
  if (showDetail) {
    [0, 0.5].forEach((ratio, index) => {
      const lowY = height * ratio;
      const highY = height * (ratio + 0.5);
      const direction = index % 2 === 0 ? 1 : -1;
      members.push(
        beamBetween(
          [centerX - half, lowY, centerZ - half],
          [centerX + half, highY, centerZ - half],
          memberSize * 0.8,
        ),
        beamBetween(
          [centerX + half * direction, lowY, centerZ + half],
          [centerX - half * direction, highY, centerZ + half],
          memberSize * 0.8,
        ),
      );
    });
  }
  return members;
}

function createPlantLeaves(
  layout: PavilionFourSoyKitchenLayout,
  showFocusDetail: boolean,
): InstanceTransform[] {
  const leafCount = showFocusDetail ? 8 : 5;
  return layout.landscape.plantCentersX.flatMap((centerX, plantIndex) => (
    Array.from({ length: leafCount }, (_, leafIndex) => {
      const angle = leafIndex / leafCount * Math.PI * 2 + plantIndex * 0.38;
      const length = layout.landscape.leafLength * (0.78 + (leafIndex % 3) * 0.11);
      const direction = new THREE.Vector3(
        Math.cos(angle) * 0.72,
        0.68 + (leafIndex % 2) * 0.12,
        Math.sin(angle) * 0.72,
      ).normalize();
      const base = new THREE.Vector3(
        centerX,
        layout.landscape.trunkHeight * 0.78,
        layout.landscape.z + (plantIndex % 2 === 0 ? -0.018 : 0.018),
      );
      const center = base.clone().add(direction.clone().multiplyScalar(length / 2));
      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction,
      );
      return {
        position: center.toArray() as Vector3Tuple,
        scale: [0.055, length, 0.055] as Vector3Tuple,
        quaternion: quaternion.toArray() as QuaternionTuple,
      };
    })
  ));
}

export const PavilionFourSoyKitchen = memo(function PavilionFourSoyKitchen({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: PavilionFourSoyKitchenProps) {
  const boundsWidth = bounds.width;
  const boundsDepth = bounds.depth;
  const layout = useMemo(
    () => createPavilionFourSoyKitchenLayout({ width: boundsWidth, depth: boundsDepth }, height),
    [boundsDepth, boundsWidth, height],
  );
  const gableCaps = useMemo(() => createGableCapsGeometry(layout), [layout]);
  const wallHeight = layout.building.eaveY - layout.building.foundationHeight;
  const roofCenterY = layout.building.eaveY + layout.roof.rise / 2;

  const roofPanels = useMemo<readonly InstanceTransform[]>(() => [
    {
      position: [0, roofCenterY, layout.building.centerZ + layout.roof.halfRun / 2],
      rotation: [layout.roof.pitch, 0, 0],
      scale: [layout.roof.width, layout.roof.thickness, layout.roof.slopeLength],
    },
    {
      position: [0, roofCenterY, layout.building.centerZ - layout.roof.halfRun / 2],
      rotation: [-layout.roof.pitch, 0, 0],
      scale: [layout.roof.width, layout.roof.thickness, layout.roof.slopeLength],
    },
  ], [layout, roofCenterY]);
  const roofRibs = useMemo<readonly InstanceTransform[]>(() => (
    Array.from({ length: layout.roof.ribCount }, (_, index) => (
      -layout.roof.width / 2
      + layout.roof.width * ((index + 0.5) / layout.roof.ribCount)
    )).flatMap((x) => ([
      {
        position: [x, roofCenterY + 0.028, layout.building.centerZ + layout.roof.halfRun / 2] as Vector3Tuple,
        rotation: [layout.roof.pitch, 0, 0] as Vector3Tuple,
        scale: [0.018, 0.018, layout.roof.slopeLength] as Vector3Tuple,
      },
      {
        position: [x, roofCenterY + 0.028, layout.building.centerZ - layout.roof.halfRun / 2] as Vector3Tuple,
        rotation: [-layout.roof.pitch, 0, 0] as Vector3Tuple,
        scale: [0.018, 0.018, layout.roof.slopeLength] as Vector3Tuple,
      },
    ]))
  ), [layout, roofCenterY]);
  const roofTrim = useMemo<readonly InstanceTransform[]>(() => [
    {
      position: [0, layout.building.ridgeY + 0.028, layout.building.centerZ],
      scale: [layout.roof.width, 0.055, 0.07],
    },
    {
      position: [0, layout.building.eaveY + 0.012, layout.building.centerZ + layout.roof.halfRun],
      scale: [layout.roof.width, 0.05, 0.055],
    },
    {
      position: [0, layout.building.eaveY + 0.012, layout.building.centerZ - layout.roof.halfRun],
      scale: [layout.roof.width, 0.05, 0.055],
    },
  ], [layout]);
  const upperBands = useMemo<readonly InstanceTransform[]>(() => [
    {
      position: [0, layout.upperBand.centerY, layout.building.frontZ + 0.022],
      scale: [layout.building.width, layout.upperBand.height, 0.045],
    },
    {
      position: [0, layout.upperBand.centerY, layout.building.rearZ - 0.022],
      scale: [layout.building.width, layout.upperBand.height, 0.045],
    },
    {
      position: [-layout.building.width / 2 - 0.022, layout.upperBand.centerY, layout.building.centerZ],
      scale: [0.045, layout.upperBand.height, layout.building.depth],
    },
    {
      position: [layout.building.width / 2 + 0.022, layout.upperBand.centerY, layout.building.centerZ],
      scale: [0.045, layout.upperBand.height, layout.building.depth],
    },
  ], [layout]);
  const windowPanels = useMemo<readonly InstanceTransform[]>(() => (
    layout.windows.centersX.map((x) => ({
      position: [x, layout.windows.centerY, layout.building.frontZ + 0.035],
      scale: [layout.windows.width, layout.windows.height, 0.035],
    }))
  ), [layout]);
  const windowFrames = useMemo<readonly InstanceTransform[]>(() => (
    layout.windows.centersX.flatMap((x) => [
      {
        position: [x - layout.windows.width / 2, layout.windows.centerY, layout.building.frontZ + 0.059] as Vector3Tuple,
        scale: [0.025, layout.windows.height + 0.04, 0.025] as Vector3Tuple,
      },
      {
        position: [x + layout.windows.width / 2, layout.windows.centerY, layout.building.frontZ + 0.059] as Vector3Tuple,
        scale: [0.025, layout.windows.height + 0.04, 0.025] as Vector3Tuple,
      },
      {
        position: [x, layout.windows.centerY - layout.windows.height / 2, layout.building.frontZ + 0.059] as Vector3Tuple,
        scale: [layout.windows.width + 0.05, 0.025, 0.025] as Vector3Tuple,
      },
      {
        position: [x, layout.windows.centerY + layout.windows.height / 2, layout.building.frontZ + 0.059] as Vector3Tuple,
        scale: [layout.windows.width + 0.05, 0.025, 0.025] as Vector3Tuple,
      },
    ])
  ), [layout]);
  const windowLouvers = useMemo<readonly InstanceTransform[]>(() => (
    layout.windows.centersX.flatMap((x) => (
      Array.from({ length: layout.windows.louverCount }, (_, index) => ({
        position: [
          x,
          layout.windows.centerY
            - layout.windows.height * 0.4
            + layout.windows.height * 0.8 * (index / (layout.windows.louverCount - 1)),
          layout.building.frontZ + 0.075,
        ] as Vector3Tuple,
        scale: [layout.windows.width * 0.9, 0.018, 0.026] as Vector3Tuple,
        rotation: [-0.18, 0, 0] as Vector3Tuple,
      }))
    ))
  ), [layout]);
  const pergolaItems = useMemo<readonly InstanceTransform[]>(() => {
    const frontZ = layout.pergola.frontZ;
    const backZ = layout.building.frontZ + 0.04;
    return [
      ...[-0.48, -0.16, 0.16, 0.48].map((ratio) => ({
        position: [
          ratio * layout.pergola.width,
          layout.pergola.postHeight / 2,
          frontZ,
        ] as Vector3Tuple,
        scale: [
          layout.pergola.postSize,
          layout.pergola.postHeight,
          layout.pergola.postSize,
        ] as Vector3Tuple,
      })),
      {
        position: [0, layout.pergola.postHeight, frontZ],
        scale: [layout.pergola.width * 1.04, layout.pergola.postSize, layout.pergola.postSize],
      },
      {
        position: [0, layout.pergola.postHeight, backZ],
        scale: [layout.pergola.width * 1.04, layout.pergola.postSize, layout.pergola.postSize],
      },
      ...Array.from({ length: layout.pergola.rafterCount }, (_, index) => ({
        position: [
          -layout.pergola.width / 2
            + layout.pergola.width * (index / (layout.pergola.rafterCount - 1)),
          layout.pergola.postHeight + layout.pergola.postSize * 0.62,
          (frontZ + backZ) / 2,
        ] as Vector3Tuple,
        scale: [
          layout.pergola.postSize * 0.7,
          layout.pergola.postSize * 0.78,
          frontZ - backZ + 0.1,
        ] as Vector3Tuple,
      })),
    ];
  }, [layout]);
  const brickCourses = useMemo<readonly InstanceTransform[]>(() => (
    Array.from({ length: 9 }, (_, index) => (
      layout.building.foundationHeight
      + wallHeight * ((index + 0.5) / 10)
    )).flatMap((y) => [
      {
        position: [0, y, layout.building.frontZ + 0.018] as Vector3Tuple,
        scale: [layout.building.width * 0.985, 0.011, 0.014] as Vector3Tuple,
      },
      {
        position: [0, y, layout.building.rearZ - 0.018] as Vector3Tuple,
        scale: [layout.building.width * 0.985, 0.011, 0.014] as Vector3Tuple,
      },
      {
        position: [-layout.building.width / 2 - 0.018, y, layout.building.centerZ] as Vector3Tuple,
        scale: [0.014, 0.011, layout.building.depth * 0.985] as Vector3Tuple,
      },
      {
        position: [layout.building.width / 2 + 0.018, y, layout.building.centerZ] as Vector3Tuple,
        scale: [0.014, 0.011, layout.building.depth * 0.985] as Vector3Tuple,
      },
    ])
  ), [layout, wallHeight]);
  const brickJoints = useMemo<readonly InstanceTransform[]>(() => (
    Array.from({ length: 8 }, (_, rowIndex) => {
      const y = layout.building.foundationHeight + wallHeight * ((rowIndex + 1) / 10);
      return Array.from({ length: 13 }, (_, columnIndex) => {
        const stagger = rowIndex % 2 === 0 ? 0 : 0.5;
        const x = -layout.building.width / 2
          + layout.building.width * ((columnIndex + stagger) / 13);
        return {
          position: [x, y, layout.building.frontZ + 0.019] as Vector3Tuple,
          scale: [0.011, wallHeight * 0.075, 0.014] as Vector3Tuple,
        };
      });
    }).flat()
  ), [layout, wallHeight]);
  const doorRibs = useMemo<readonly InstanceTransform[]>(() => (
    Array.from({ length: layout.slidingDoor.ribCount }, (_, index) => ({
      position: [
        layout.slidingDoor.sideX + 0.024,
        layout.slidingDoor.centerY,
        layout.slidingDoor.centerZ
          - layout.slidingDoor.width / 2
          + layout.slidingDoor.width * ((index + 0.5) / layout.slidingDoor.ribCount),
      ] as Vector3Tuple,
      scale: [0.018, layout.slidingDoor.height * 0.94, 0.014] as Vector3Tuple,
    }))
  ), [layout]);
  const plantTrunks = useMemo<readonly InstanceTransform[]>(() => (
    layout.landscape.plantCentersX.map((x, index) => ({
      position: [
        x,
        layout.landscape.trunkHeight / 2,
        layout.landscape.z + (index % 2 === 0 ? -0.018 : 0.018),
      ],
      scale: [0.055, layout.landscape.trunkHeight, 0.055],
    }))
  ), [layout]);
  const plantLeaves = useMemo(
    () => createPlantLeaves(layout, showFocusDetail),
    [layout, showFocusDetail],
  );
  const towerMembers = useMemo(
    () => createTowerMembers(layout, showDetail),
    [layout, showDetail],
  );

  useEffect(() => () => gableCaps.dispose(), [gableCaps]);

  return (
    <group name="pavilion-four-soy-kitchen" dispose={null}>
      <mesh
        name="pavilion-four-soy-kitchen-red-soil"
        geometry={UNIT_BOX}
        material={materials.platform}
        position={[0, layout.site.height / 2, 0]}
        scale={[layout.site.width, layout.site.height, layout.site.depth]}
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.trim}
        position={[0, layout.building.foundationHeight / 2, layout.building.centerZ]}
        scale={[
          layout.building.width + 0.08,
          layout.building.foundationHeight,
          layout.building.depth + 0.08,
        ]}
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <mesh
        name="pavilion-four-soy-kitchen-painted-brick"
        geometry={UNIT_BOX}
        material={materials.wall}
        position={[
          0,
          layout.building.foundationHeight + wallHeight / 2,
          layout.building.centerZ,
        ]}
        scale={[layout.building.width, wallHeight, layout.building.depth]}
        castShadow
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <mesh
        geometry={gableCaps}
        material={materials.wall}
        castShadow
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <PavilionFourInstances material={materials.dark} items={upperBands} castShadow />
      <PavilionFourInstances
        material={materials.roof}
        items={roofPanels}
        castShadow
        receiveShadow
      />
      <PavilionFourInstances material={materials.metal} items={roofTrim} castShadow />
      {showDetail && (
        <PavilionFourInstances material={materials.metal} items={roofRibs} castShadow />
      )}

      <PavilionFourInstances material={materials.glass} items={windowPanels} />
      <PavilionFourInstances material={materials.trim} items={windowFrames} castShadow />
      {showDetail && (
        <PavilionFourInstances material={materials.metal} items={windowLouvers} />
      )}
      <mesh
        name="pavilion-four-soy-kitchen-sliding-door"
        geometry={UNIT_BOX}
        material={materials.metal}
        position={[
          layout.slidingDoor.sideX,
          layout.slidingDoor.centerY,
          layout.slidingDoor.centerZ,
        ]}
        scale={[0.04, layout.slidingDoor.height, layout.slidingDoor.width]}
        castShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      {showDetail && (
        <PavilionFourInstances material={materials.trim} items={doorRibs} />
      )}
      <PavilionFourInstances material={materials.accent} items={pergolaItems} castShadow />
      <SoyKitchenSign layout={layout} />

      {showDetail && (
        <PavilionFourInstances material={materials.trim} items={brickCourses} />
      )}
      {showFocusDetail && (
        <PavilionFourInstances material={materials.trim} items={brickJoints} />
      )}

      <PavilionFourInstances
        geometry={UNIT_CYLINDER}
        material={materials.accent}
        items={plantTrunks}
        castShadow
      />
      <PavilionFourInstances
        geometry={UNIT_LEAF}
        material={materials.green}
        items={plantLeaves}
        castShadow
      />
      <PavilionFourInstances
        material={materials.metal}
        items={towerMembers}
        castShadow
      />
    </group>
  );
});
