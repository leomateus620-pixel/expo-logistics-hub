import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  createCommercialPavilionLayout,
  resolveCommercialPavilionDefinition,
  type CommercialPavilionLayout,
} from '../../utils/commercialPavilions';
import { resolveCommercialPavilionModulePlan } from '../../utils/commercialPavilionModules';
import type { StrategicLandmarkBounds } from '../../utils/landmarks';
import { createCommercialPavilionTexture } from './commercialPavilionTextures';
import { CommercialPavilionModuleLayer } from './CommercialPavilionModuleLayer';

const NO_RAYCAST = () => undefined;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
}

export interface CommercialPavilionMaterials {
  wall: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  platform: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
}

function PavilionInstances({
  material,
  items,
  castShadow = false,
  receiveShadow = false,
}: {
  material: THREE.Material;
  items: InstanceTransform[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const object = new THREE.Object3D();
    items.forEach((item, index) => {
      object.position.set(...item.position);
      object.rotation.set(...(item.rotation ?? [0, 0, 0]));
      object.scale.set(...item.scale);
      object.updateMatrix();
      mesh.current?.setMatrixAt(index, object.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingBox();
    mesh.current.computeBoundingSphere();
  }, [items]);

  if (!items.length) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[UNIT_BOX, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}

function createIdentityTexture(pavilionNumber: number, activity: string) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#f2f0e8';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#173f2d';
  context.fillRect(0, 0, 18, canvas.height);
  context.fillStyle = '#d8ad37';
  context.fillRect(18, 0, 10, canvas.height);
  context.textBaseline = 'middle';
  context.fillStyle = '#173f2d';
  context.font = '900 74px Arial, sans-serif';
  context.fillText(`PAVILHÃO ${pavilionNumber}`, 62, 76);
  context.fillStyle = '#5a6660';
  context.font = '700 29px Arial, sans-serif';
  context.fillText(activity.toLocaleUpperCase('pt-BR'), 66, 139);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  return texture;
}

function PavilionIdentity({
  number,
  activity,
  position,
  width,
}: {
  number: number;
  activity: string;
  position: Vector3Tuple;
  width: number;
}) {
  const texture = useMemo(() => createIdentityTexture(number, activity), [activity, number]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: texture ? '#ffffff' : '#f2f0e8',
    map: texture,
    roughness: 0.62,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }), [texture]);

  useEffect(() => () => {
    texture?.dispose();
    material.dispose();
  }, [material, texture]);

  return (
    <group position={position} raycast={NO_RAYCAST}>
      <mesh position={[0, 0, -0.035]} castShadow>
        <boxGeometry args={[width + 0.1, width * 0.25 + 0.1, 0.07]} />
        <meshStandardMaterial color="#4d5654" roughness={0.62} metalness={0.16} />
      </mesh>
      <mesh material={material}>
        <planeGeometry args={[width, width * 0.25]} />
      </mesh>
    </group>
  );
}

function GableRoofAcrossX({
  centerX,
  width,
  depth,
  eaveY,
  ridgeY,
  thickness,
  materials,
  ridgeVent = false,
}: {
  centerX: number;
  width: number;
  depth: number;
  eaveY: number;
  ridgeY: number;
  thickness: number;
  materials: CommercialPavilionMaterials;
  ridgeVent?: boolean;
}) {
  const rise = Math.max(0.12, ridgeY - eaveY);
  const halfSpan = width / 2;
  const slopeLength = Math.hypot(halfSpan, rise);
  const angle = Math.atan2(rise, halfSpan);
  const plates = useMemo<InstanceTransform[]>(() => [
    {
      position: [centerX - width / 4, eaveY + rise / 2, 0],
      scale: [slopeLength + 0.06, thickness, depth],
      rotation: [0, 0, angle],
    },
    {
      position: [centerX + width / 4, eaveY + rise / 2, 0],
      scale: [slopeLength + 0.06, thickness, depth],
      rotation: [0, 0, -angle],
    },
  ], [angle, centerX, depth, eaveY, rise, slopeLength, thickness, width]);

  return (
    <>
      <PavilionInstances material={materials.roof} items={plates} castShadow receiveShadow />
      <mesh position={[centerX, ridgeY + thickness * 0.45, 0]} material={materials.metal} raycast={NO_RAYCAST} castShadow>
        <boxGeometry args={[0.12, thickness * 1.15, depth + 0.03]} />
      </mesh>
      {ridgeVent && (
        <group position={[centerX, ridgeY + 0.13, 0]} raycast={NO_RAYCAST}>
          <mesh material={materials.dark} castShadow>
            <boxGeometry args={[Math.min(width * 0.2, 0.62), 0.18, depth * 0.72]} />
          </mesh>
          <mesh position={[0, 0.12, 0]} material={materials.roof} castShadow>
            <boxGeometry args={[Math.min(width * 0.28, 0.78), 0.07, depth * 0.78]} />
          </mesh>
        </group>
      )}
    </>
  );
}

function GableRoofAcrossZ({
  width,
  depth,
  eaveY,
  ridgeY,
  thickness,
  materials,
}: {
  width: number;
  depth: number;
  eaveY: number;
  ridgeY: number;
  thickness: number;
  materials: CommercialPavilionMaterials;
}) {
  const rise = Math.max(0.12, ridgeY - eaveY);
  const halfSpan = depth / 2;
  const slopeLength = Math.hypot(halfSpan, rise);
  const angle = Math.atan2(rise, halfSpan);
  const plates = useMemo<InstanceTransform[]>(() => [
    {
      position: [0, eaveY + rise / 2, -depth / 4],
      scale: [width, thickness, slopeLength + 0.06],
      rotation: [-angle, 0, 0],
    },
    {
      position: [0, eaveY + rise / 2, depth / 4],
      scale: [width, thickness, slopeLength + 0.06],
      rotation: [angle, 0, 0],
    },
  ], [angle, depth, eaveY, rise, slopeLength, thickness, width]);

  return (
    <>
      <PavilionInstances material={materials.roof} items={plates} castShadow receiveShadow />
      <mesh position={[0, ridgeY + thickness * 0.45, 0]} material={materials.metal} raycast={NO_RAYCAST} castShadow>
        <boxGeometry args={[width + 0.03, thickness * 1.15, 0.12]} />
      </mesh>
    </>
  );
}

function PavilionRoof({
  layout,
  materials,
  showDetail,
}: {
  layout: CommercialPavilionLayout;
  materials: CommercialPavilionMaterials;
  showDetail: boolean;
}) {
  const { roof } = layout.exterior;

  if (layout.publicIdentifier === 'B1') {
    return (
      <>
        <GableRoofAcrossZ {...roof} materials={materials} />
        {showDetail && (
          <mesh position={[0, roof.eaveY + roof.rise * 0.58, 0]} material={materials.glass} raycast={NO_RAYCAST}>
            <boxGeometry args={[roof.width * 0.42, 0.025, roof.depth * 0.13]} />
          </mesh>
        )}
      </>
    );
  }

  if (layout.publicIdentifier === 'B2' || layout.publicIdentifier === 'B6') {
    const sectionCount = layout.publicIdentifier === 'B2' ? 2 : 3;
    const sectionWidth = roof.width / sectionCount;
    return (
      <>
        {Array.from({ length: sectionCount }, (_, index) => {
          const centerX = -roof.width / 2 + sectionWidth * (index + 0.5);
          return (
            <group key={centerX}>
              <GableRoofAcrossX
                centerX={centerX}
                width={sectionWidth * 0.96}
                depth={roof.depth}
                eaveY={roof.eaveY}
                ridgeY={roof.ridgeY - (layout.publicIdentifier === 'B2' ? index * 0.035 : 0)}
                thickness={roof.thickness}
                materials={materials}
              />
            </group>
          );
        })}
      </>
    );
  }

  if (layout.publicIdentifier === 'B3') {
    const sectionCount = 4;
    const sectionWidth = roof.width / sectionCount;
    const slopeLength = Math.hypot(sectionWidth, roof.rise);
    const angle = Math.atan2(roof.rise, sectionWidth);
    return (
      <>
        {Array.from({ length: sectionCount }, (_, index) => {
          const centerX = -roof.width / 2 + sectionWidth * (index + 0.5);
          const highEdgeX = centerX + sectionWidth / 2 - 0.035;
          return (
            <group key={centerX}>
              <mesh
                position={[centerX, roof.eaveY + roof.rise / 2, 0]}
                rotation={[0, 0, -angle]}
                material={materials.roof}
                raycast={NO_RAYCAST}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[slopeLength + 0.05, roof.thickness, roof.depth]} />
              </mesh>
              <mesh
                position={[highEdgeX, roof.eaveY + roof.rise * 0.54, 0]}
                material={showDetail ? materials.glass : materials.metal}
                raycast={NO_RAYCAST}
              >
                <boxGeometry args={[0.055, roof.rise * 0.82, roof.depth * 0.94]} />
              </mesh>
            </group>
          );
        })}
      </>
    );
  }

  if (layout.publicIdentifier === 'B5') {
    const rise = roof.ridgeY - roof.eaveY;
    const slopeLength = Math.hypot(roof.width, rise);
    const angle = Math.atan2(rise, roof.width);
    return (
      <>
        <mesh
          position={[0, roof.eaveY + rise / 2, 0]}
          rotation={[0, 0, -angle]}
          material={materials.roof}
          raycast={NO_RAYCAST}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[slopeLength + 0.08, roof.thickness, roof.depth]} />
        </mesh>
        <mesh position={[roof.width * 0.44, roof.ridgeY - 0.08, 0]} material={materials.glass} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.08, 0.28, roof.depth * 0.78]} />
        </mesh>
        <mesh position={[roof.width * 0.48, roof.ridgeY + 0.03, 0]} material={materials.metal} raycast={NO_RAYCAST} castShadow>
          <boxGeometry args={[0.08, 0.1, roof.depth]} />
        </mesh>
      </>
    );
  }

  return (
    <GableRoofAcrossX
      centerX={0}
      width={roof.width}
      depth={roof.depth}
      eaveY={roof.eaveY}
      ridgeY={roof.ridgeY}
      thickness={roof.thickness}
      materials={materials}
      ridgeVent={layout.publicIdentifier === 'B4'}
    />
  );
}

function facadeWallSegments(layout: CommercialPavilionLayout): InstanceTransform[] {
  const { facade, shell, slab } = layout.exterior;
  const wallHeight = Math.max(0.2, facade.entrances[0]?.height ?? shell.height * 0.68);
  const ranges = facade.entrances
    .map((entrance) => [entrance.centerX - entrance.width / 2, entrance.centerX + entrance.width / 2] as const)
    .sort(([left], [right]) => left - right);
  const pieces: InstanceTransform[] = [];
  let cursor = -shell.width / 2;
  ranges.forEach(([left, right]) => {
    if (left - cursor > 0.045) {
      pieces.push({
        position: [(cursor + left) / 2, slab.height + wallHeight / 2, facade.frontZ],
        scale: [left - cursor, wallHeight, 0.1],
      });
    }
    cursor = right;
  });
  if (shell.width / 2 - cursor > 0.045) {
    pieces.push({
      position: [(cursor + shell.width / 2) / 2, slab.height + wallHeight / 2, facade.frontZ],
      scale: [shell.width / 2 - cursor, wallHeight, 0.1],
    });
  }
  const upperHeight = Math.max(0.12, shell.height - wallHeight);
  pieces.push({
    position: [0, slab.height + wallHeight + upperHeight / 2, facade.frontZ],
    scale: [shell.width, upperHeight, 0.1],
  });
  return pieces;
}

function PavilionShell({
  layout,
  materials,
  showDetail,
  cutaway,
}: {
  layout: CommercialPavilionLayout;
  materials: CommercialPavilionMaterials;
  showDetail: boolean;
  cutaway: boolean;
}) {
  const { slab, shell, facade, structure } = layout.exterior;
  const wallThickness = Math.max(0.08, structure.columnSize * 0.64);
  const envelope = useMemo<InstanceTransform[]>(() => {
    if (!cutaway) {
      return [
        {
          position: [0, shell.centerY, shell.backZ],
          scale: [shell.width, shell.height, wallThickness],
        },
        {
          position: [-shell.width / 2 + wallThickness / 2, shell.centerY, 0],
          scale: [wallThickness, shell.height, shell.depth],
        },
        {
          position: [shell.width / 2 - wallThickness / 2, shell.centerY, 0],
          scale: [wallThickness, shell.height, shell.depth],
        },
        ...facadeWallSegments(layout),
      ];
    }
    const cutawayHeight = Math.min(0.5, shell.height * 0.22);
    const centerY = slab.height + cutawayHeight / 2;
    return [
      { position: [0, centerY, shell.backZ], scale: [shell.width, cutawayHeight, wallThickness] },
      { position: [0, centerY, facade.frontZ], scale: [shell.width, cutawayHeight, wallThickness] },
      { position: [-shell.width / 2 + wallThickness / 2, centerY, 0], scale: [wallThickness, cutawayHeight, shell.depth] },
      { position: [shell.width / 2 - wallThickness / 2, centerY, 0], scale: [wallThickness, cutawayHeight, shell.depth] },
    ];
  }, [cutaway, facade.frontZ, layout, shell, slab.height, wallThickness]);
  const doors = useMemo<InstanceTransform[]>(() => cutaway ? [] : facade.entrances.map((entrance) => ({
    position: [entrance.centerX, entrance.centerY, entrance.centerZ - 0.065],
    scale: [entrance.width * 0.92, entrance.height * 0.94, entrance.depth],
  })), [cutaway, facade.entrances]);
  const frontColumns = useMemo<InstanceTransform[]>(() => {
    if (cutaway) return [];
    const columns = [
      -shell.width / 2 + structure.columnSize / 2,
      ...facade.dividerXs,
      shell.width / 2 - structure.columnSize / 2,
    ];
    return columns.map((x) => ({
      position: [x, structure.columnCenterY, facade.frontZ + 0.045],
      scale: [structure.columnSize, structure.columnHeight, structure.columnSize],
    }));
  }, [cutaway, facade.dividerXs, facade.frontZ, shell.width, structure]);
  const sideColumns = useMemo<InstanceTransform[]>(() => {
    if (!showDetail || cutaway) return [];
    const zValues = structure.columnZs.filter((_, index) => index > 0 && index < structure.columnZs.length - 1);
    return zValues.flatMap((z) => ([-1, 1] as const).map((side) => ({
      position: [side * (shell.width / 2 - structure.columnSize / 2), structure.columnCenterY, z],
      scale: [structure.columnSize, structure.columnHeight, structure.columnSize],
    })));
  }, [cutaway, shell.width, showDetail, structure]);
  const canopies = useMemo<InstanceTransform[]>(() => cutaway ? [] : facade.entrances.map((entrance) => ({
    position: [
      entrance.centerX,
      entrance.centerY + entrance.height / 2 + 0.08,
      facade.frontZ + (layout.publicIdentifier === 'B1' ? 0.28 : 0.2),
    ],
    scale: [
      entrance.width * (layout.publicIdentifier === 'B1' ? 1.22 : 1.08),
      0.1,
      layout.publicIdentifier === 'B1' ? 0.62 : 0.42,
    ],
  })), [cutaway, facade.frontZ, facade.entrances, layout.publicIdentifier]);

  return (
    <>
      <mesh
        position={[0, slab.centerY, 0]}
        material={materials.platform}
        raycast={NO_RAYCAST}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[slab.width, slab.height, slab.depth]} />
      </mesh>
      <PavilionInstances material={materials.wall} items={envelope} castShadow receiveShadow />
      <PavilionInstances material={materials.dark} items={doors} receiveShadow />
      <PavilionInstances material={materials.trim} items={frontColumns} castShadow receiveShadow />
      <PavilionInstances material={materials.trim} items={sideColumns} castShadow receiveShadow />
      <PavilionInstances material={materials.accent} items={canopies} castShadow receiveShadow />
      {!cutaway && facade.centralMass && (
        <mesh
          position={[facade.centralMass.centerX, facade.centralMass.centerY, facade.centralMass.centerZ]}
          material={materials.trim}
          raycast={NO_RAYCAST}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[
            facade.centralMass.width,
            facade.centralMass.height,
            facade.centralMass.depth,
          ]} />
        </mesh>
      )}
    </>
  );
}

function PavilionDetail({
  layout,
  materials,
}: {
  layout: CommercialPavilionLayout;
  materials: CommercialPavilionMaterials;
}) {
  const { facade, shell } = layout.exterior;
  const louvers = useMemo<InstanceTransform[]>(() => {
    const count = layout.publicIdentifier === 'B4' ? 7 : layout.publicIdentifier === 'B3' ? 8 : 5;
    return Array.from({ length: count }, (_, index) => ({
      position: [
        -shell.width * 0.34 + (shell.width * 0.68 * index) / Math.max(1, count - 1),
        shell.height * 0.72,
        shell.backZ - 0.065,
      ] as Vector3Tuple,
      scale: [Math.max(0.12, shell.width * 0.045), 0.04, 0.035] as Vector3Tuple,
    }));
  }, [layout.publicIdentifier, shell]);
  const bollards = useMemo<InstanceTransform[]>(() => facade.entrances.flatMap((entrance) => ([
    {
      position: [entrance.centerX - entrance.width * 0.42, 0.2, facade.frontZ + 0.35] as Vector3Tuple,
      scale: [0.07, 0.38, 0.07] as Vector3Tuple,
    },
    {
      position: [entrance.centerX + entrance.width * 0.42, 0.2, facade.frontZ + 0.35] as Vector3Tuple,
      scale: [0.07, 0.38, 0.07] as Vector3Tuple,
    },
  ])), [facade]);

  return (
    <>
      <PavilionInstances material={materials.dark} items={louvers} />
      <PavilionInstances material={materials.metal} items={bollards} castShadow />
    </>
  );
}

export const CommercialPavilion = memo(function CommercialPavilion({
  publicIdentifier,
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: {
  publicIdentifier: string;
  bounds: StrategicLandmarkBounds;
  height: number;
  materials: CommercialPavilionMaterials;
  showDetail: boolean;
  showFocusDetail: boolean;
}) {
  const definition = resolveCommercialPavilionDefinition({ publicIdentifier });
  const modulePlan = resolveCommercialPavilionModulePlan({ publicIdentifier });
  const layout = useMemo(() => definition
    ? createCommercialPavilionLayout(bounds, definition, height)
    : null, [bounds, definition, height]);
  const textures = useMemo(() => ({
    concrete: createCommercialPavilionTexture('concrete'),
    zinc: createCommercialPavilionTexture('zinc'),
  }), []);

  useEffect(() => {
    materials.wall.bumpMap = textures.concrete;
    materials.wall.bumpScale = 0.012;
    materials.roof.map = textures.zinc;
    materials.roof.bumpMap = textures.zinc;
    materials.roof.bumpScale = 0.006;
    materials.roof.roughness = 0.64;
    materials.roof.metalness = 0.2;
    materials.platform.bumpMap = textures.concrete;
    materials.platform.bumpScale = 0.01;
    materials.wall.needsUpdate = true;
    materials.roof.needsUpdate = true;
    materials.platform.needsUpdate = true;
    return () => {
      materials.wall.bumpMap = null;
      materials.roof.map = null;
      materials.roof.bumpMap = null;
      materials.platform.bumpMap = null;
      textures.concrete?.dispose();
      textures.zinc?.dispose();
    };
  }, [materials, textures]);

  if (!definition || !layout) return null;
  const identityWidth = THREE.MathUtils.clamp(
    definition.pavilionNumber === 14 ? layout.width * 0.24 : layout.exterior.facade.entrances[0].width * 0.86,
    0.92,
    2.55,
  );
  const identityX = definition.pavilionNumber === 13 ? -layout.width * 0.22 : 0;
  const identityY = definition.pavilionNumber === 14
    ? Math.min(layout.height * 0.72, layout.exterior.facade.centralMass?.height ?? layout.height * 0.72)
    : Math.min(layout.exterior.roof.eaveY - 0.18, layout.height * 0.73);

  return (
    <group dispose={null}>
      <PavilionShell
        layout={layout}
        materials={materials}
        showDetail={showDetail}
        cutaway={showFocusDetail}
      />
      {!showFocusDetail && <PavilionRoof layout={layout} materials={materials} showDetail={showDetail} />}
      {showDetail && !showFocusDetail && <PavilionDetail layout={layout} materials={materials} />}
      {showFocusDetail && modulePlan && (
        <CommercialPavilionModuleLayer
          layout={layout}
          plan={modulePlan}
          mode="cutaway"
        />
      )}
      {showDetail && !showFocusDetail && (
        <PavilionIdentity
          number={definition.pavilionNumber}
          activity={definition.activity}
          width={identityWidth}
          position={[
            identityX,
            identityY,
            layout.exterior.facade.frontZ + 0.125 + (layout.exterior.facade.centralMass?.depth ?? 0) * 0.48,
          ]}
        />
      )}
    </group>
  );
});
