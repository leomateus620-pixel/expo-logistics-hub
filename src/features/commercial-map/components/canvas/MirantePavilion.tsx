import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ARENA_TERRAIN_TOP_ELEVATION } from '../../data/arenaTerrain';
import {
  MIRANTE_DEFAULT_SITE,
  createMiranteFurniturePlan,
  createMiranteLayout,
  miranteStructuralBayPositions,
  type MiranteLayout,
  type MiranteSiteProfile,
} from '../../utils/mirante';
import type { StrategicLandmarkBounds } from '../../utils/landmarks';

const NO_RAYCAST = () => undefined;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const LANDING_TACTILE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#d4a82c',
  roughness: 0.9,
  metalness: 0,
});
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
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

/**
 * Perfil do sítio compartilhado com a escadaria da Arena: o deck do Mirante é
 * o terraço superior dos degraus, e não uma cota própria.
 */
export const MIRANTE_SITE_PROFILE: MiranteSiteProfile = Object.freeze({
  ...MIRANTE_DEFAULT_SITE,
  deckTopY: ARENA_TERRAIN_TOP_ELEVATION,
});

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

function beamAlongXy(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  z: number,
  thickness: number,
): InstanceTransform {
  return beamBetween([startX, startY, z], [endX, endY, z], thickness);
}

function createArchitecture(
  layout: MiranteLayout,
  showDetail: boolean,
  showFocusDetail: boolean,
  reducedGraphics: boolean,
) {
  const bayPositions = miranteStructuralBayPositions(layout);
  const { platform, roof, structure, railings, access } = layout;
  const columns: InstanceTransform[] = [];
  const longitudinalBeams: InstanceTransform[] = [];
  const trussMembers: InstanceTransform[] = [];
  const purlins: InstanceTransform[] = [];
  const fascias: InstanceTransform[] = [];
  const railingPosts: InstanceTransform[] = [];
  const railingRails: InstanceTransform[] = [];
  const stairSteps: InstanceTransform[] = [];
  const stairWalls: InstanceTransform[] = [];
  const stairRails: InstanceTransform[] = [];
  const landingTactile: InstanceTransform[] = [];
  const curbBands: InstanceTransform[] = [];
  const benchSeats: InstanceTransform[] = [];
  const benchFrames: InstanceTransform[] = [];

  // Pilares tubulares esbeltos, recuados da borda para deixar o guarda-corpo
  // livre, como nas fotos 7 e 9.
  const columnX = layout.width / 2 - structure.columnInsetX;
  bayPositions.forEach((z) => {
    [-1, 1].forEach((side) => {
      columns.push({
        position: [side * columnX, structure.columnCenterY, z],
        scale: [structure.columnSize, structure.columnHeight, structure.columnSize],
      });
    });
    if (!showDetail) return;
    // Treliça plana de banzo inferior horizontal e banzo superior acompanhando
    // a água baixa da cobertura; montantes e diagonais em zigue-zague.
    const lowerY = roof.eaveY - structure.trussDepth;
    trussMembers.push(
      beamAlongXy(-roof.halfSpan + 0.02, lowerY, roof.halfSpan - 0.02, lowerY, z, structure.trussMemberSize),
      beamAlongXy(-roof.halfSpan + 0.02, roof.eaveY, 0, roof.ridgeY, z, structure.trussMemberSize),
      beamAlongXy(0, roof.ridgeY, roof.halfSpan - 0.02, roof.eaveY, z, structure.trussMemberSize),
    );
    const panels = reducedGraphics ? 4 : 6;
    for (let index = 0; index <= panels; index += 1) {
      const ratio = index / panels;
      const x = -roof.halfSpan + 0.02 + ratio * (roof.halfSpan * 2 - 0.04);
      const topY = roof.ridgeY - roof.rise * Math.abs(x) / roof.halfSpan;
      trussMembers.push(beamAlongXy(x, lowerY, x, topY, z, structure.trussMemberSize * 0.8));
      if (index < panels) {
        const nextX = -roof.halfSpan + 0.02 + ((index + 1) / panels) * (roof.halfSpan * 2 - 0.04);
        const nextTopY = roof.ridgeY - roof.rise * Math.abs(nextX) / roof.halfSpan;
        trussMembers.push(
          index % 2 === 0
            ? beamAlongXy(x, lowerY, nextX, nextTopY, z, structure.trussMemberSize * 0.8)
            : beamAlongXy(x, topY, nextX, lowerY, z, structure.trussMemberSize * 0.8),
        );
      }
    }
  });

  [-1, 1].forEach((side) => {
    longitudinalBeams.push({
      position: [side * columnX, roof.eaveY - structure.trussDepth - structure.beamSize * 0.5, platform.centerZ],
      scale: [structure.beamSize, structure.beamSize, platform.depth - structure.bayInset * 1.2],
    });
  });
  longitudinalBeams.push({
    position: [0, roof.ridgeY - structure.beamSize * 0.35, platform.centerZ],
    scale: [structure.beamSize, structure.beamSize, roof.depth - 0.04],
  });

  // Faixa branca pintada no topo do muro de contenção voltado ao passeio.
  curbBands.push({
    position: [-layout.width / 2 - 0.004, platform.topY - layout.base.curbBandHeight / 2 + 0.002, platform.centerZ],
    scale: [0.012, layout.base.curbBandHeight, platform.depth],
  });

  // Escada virada na face norte: lance estreito em +X, patamar no chão.
  const stairs = access.descentStairs;
  const landing = access.landing;
  for (let index = 0; index < stairs.stepCount; index += 1) {
    const treadTopY = platform.topY - stairs.stepRise * (index + 1);
    const centerX = stairs.start[0] - stairs.stepDepth * (index + 0.5);
    stairSteps.push({
      position: [centerX, treadTopY / 2, stairs.center[2]],
      scale: [stairs.stepDepth + 0.01, treadTopY, stairs.width],
    });
  }
  stairSteps.push({
    position: [landing.centerX, landing.topY / 2, landing.centerZ],
    scale: [landing.width, landing.topY, landing.depth],
  });
  landingTactile.push({
    position: [
      landing.centerX,
      landing.topY + 0.008,
      landing.centerZ - landing.depth / 2 + landing.tactileOffsetFromNorth,
    ],
    scale: [landing.width * 0.92, 0.012, landing.tactileWidth],
  });
  stairWalls.push({
    position: [
      stairs.center[0],
      platform.topY / 2,
      platform.minZ + stairs.cheekWallThickness / 2,
    ],
    scale: [stairs.run + 0.04, platform.topY, stairs.cheekWallThickness],
  });
  const fenceZ = landing.centerZ - landing.depth / 2 + 0.02;
  const fenceHeight = 0.18;
  const fencePostCount = 6;
  for (let index = 0; index <= fencePostCount; index += 1) {
    const x = THREE.MathUtils.lerp(
      -landing.width / 2 + 0.04,
      landing.width / 2 - 0.04,
      index / fencePostCount,
    );
    stairWalls.push({
      position: [x, landing.topY + fenceHeight / 2, fenceZ],
      scale: [0.014, fenceHeight, 0.014],
    });
  }
  if (showDetail) {
    const railY = railings.height * 0.92;
    const northRailZ = stairs.center[2] - stairs.width / 2 - 0.012;
    const southRailZ = platform.minZ + 0.02;
    [northRailZ, southRailZ].forEach((z) => {
      stairRails.push(
        beamBetween(
          [stairs.start[0], platform.topY + railY, z],
          [stairs.endpoint[0], stairs.endpoint[1] + railY, z],
          railings.railSize,
        ),
      );
      [0, 0.5, 1].forEach((ratio) => {
        const y = THREE.MathUtils.lerp(platform.topY, stairs.endpoint[1], ratio);
        stairRails.push({
          position: [
            THREE.MathUtils.lerp(stairs.start[0], stairs.endpoint[0], ratio),
            y + railY / 2,
            z,
          ],
          scale: [railings.postSize, railY, railings.postSize],
        });
      });
    });
    stairRails.push({
      position: [0, landing.topY + fenceHeight, fenceZ],
      scale: [landing.width - 0.08, 0.01, 0.01],
    });
  }

  if (showDetail) {
    for (let index = 1; index <= structure.purlinCount; index += 1) {
      const ratio = index / (structure.purlinCount + 1);
      [-1, 1].forEach((side) => {
        purlins.push({
          position: [
            side * roof.halfSpan * ratio,
            roof.ridgeY - roof.rise * ratio - roof.thickness * 0.5 - 0.01,
            roof.centerZ,
          ],
          scale: [structure.trussMemberSize * 0.9, structure.trussMemberSize * 0.9, roof.depth - 0.06],
        });
      });
    }

    // Testeiras nas duas águas (fotos 7 e 9: borda clara e contínua).
    [-1, 1].forEach((side) => {
      fascias.push({
        position: [side * (roof.halfSpan - 0.008), roof.eaveY - roof.fasciaHeight / 2 + 0.012, roof.centerZ],
        scale: [0.016, roof.fasciaHeight, roof.depth],
      });
    });

    // Guarda-corpo nas laterais longas e na face norte, com vão no topo da
    // escada. A ponta sul segue aberta para a estrutura lateral.
    const railMinZ = platform.minZ + railings.inset;
    const railMaxZ = platform.maxZ - railings.inset;
    const postCount = Math.max(4, Math.ceil((railMaxZ - railMinZ) / railings.postSpacing));
    [-1, 1].forEach((side) => {
      const x = side * (layout.width / 2 - railings.inset);
      for (let index = 0; index <= postCount; index += 1) {
        railingPosts.push({
          position: [
            x,
            platform.topY + railings.height / 2,
            THREE.MathUtils.lerp(railMinZ, railMaxZ, index / postCount),
          ],
          scale: [railings.postSize, railings.height, railings.postSize],
        });
      }
      [0.42, 0.98].forEach((heightRatio) => {
        railingRails.push({
          position: [x, platform.topY + railings.height * heightRatio, (railMinZ + railMaxZ) / 2],
          scale: [railings.railSize, railings.railSize, railMaxZ - railMinZ],
        });
      });
    });
    const northRailZ = platform.minZ + railings.inset;
    const stairGapWest = stairs.endpoint[0] - 0.04;
    const stairGapEast = stairs.start[0] + 0.06;
    const northRailSpans: Array<readonly [number, number]> = [
      [-layout.width / 2 + railings.inset, stairGapWest],
      [stairGapEast, layout.width / 2 - railings.inset],
    ];
    northRailSpans.forEach(([fromX, toX]) => {
      if (toX - fromX < 0.12) return;
      const postCountNorth = Math.max(2, Math.ceil((toX - fromX) / railings.postSpacing));
      for (let index = 0; index <= postCountNorth; index += 1) {
        railingPosts.push({
          position: [
            THREE.MathUtils.lerp(fromX, toX, index / postCountNorth),
            platform.topY + railings.height / 2,
            northRailZ,
          ],
          scale: [railings.postSize, railings.height, railings.postSize],
        });
      }
      [0.42, 0.98].forEach((heightRatio) => {
        railingRails.push({
          position: [(fromX + toX) / 2, platform.topY + railings.height * heightRatio, northRailZ],
          scale: [toX - fromX, railings.railSize, railings.railSize],
        });
      });
    });
  }

  if (showFocusDetail) {
    createMiranteFurniturePlan(layout).benches
      .filter((pose) => !reducedGraphics || pose.groupIndex % 2 === 0)
      .forEach((pose) => {
        const [x, , z] = pose.position as Vector3Tuple;
        const [benchWidth, benchHeight, benchDepth] = pose.dimensions as Vector3Tuple;
        const seatY = platform.topY + benchHeight;
        benchSeats.push({
          position: [x, seatY, z],
          scale: [benchWidth, 0.014, benchDepth],
        });
        benchSeats.push({
          position: [x + benchWidth * 0.42, seatY + benchHeight * 0.55, z],
          scale: [0.014, benchHeight * 0.95, benchDepth],
          rotation: [0, 0, 0.18],
        });
        [-1, 1].forEach((zSide) => {
          benchFrames.push({
            position: [x, seatY / 2 + platform.topY / 2, z + zSide * benchDepth * 0.42],
            scale: [benchWidth * 0.9, seatY - platform.topY, 0.012],
          });
        });
      });
  }

  return {
    columns,
    longitudinalBeams,
    trussMembers,
    purlins,
    fascias,
    railingPosts,
    railingRails,
    stairSteps,
    stairWalls,
    stairRails,
    landingTactile,
    curbBands,
    benchSeats,
    benchFrames,
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
  const { platform, base, roof, service } = layout;
  const roofCenterY = (roof.eaveY + roof.ridgeY) / 2;

  return (
    <group raycast={NO_RAYCAST} dispose={null}>
      {/* Muro de contenção + laje do deck: um único volume apoiado no passeio. */}
      <mesh
        geometry={UNIT_BOX}
        material={materials.wall}
        position={[0, base.centerY, base.centerZ]}
        scale={[base.width, base.height, base.depth]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.platform}
        position={[0, platform.centerY, platform.centerZ]}
        scale={[platform.width + 0.016, platform.thickness, platform.depth + 0.016]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <ScaledInstances material={materials.white} items={architecture.curbBands} />

      {/* Cobertura de duas águas com inclinação baixa, chapa clara e cumeeira. */}
      <mesh
        geometry={UNIT_BOX}
        material={materials.roof}
        position={[roof.halfSpan * 0.5, roofCenterY, roof.centerZ]}
        rotation={[0, 0, -roof.angle]}
        scale={[roof.slopeLength, roof.thickness, roof.depth]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      {!cutaway && (
        <mesh
          geometry={UNIT_BOX}
          material={materials.roof}
          position={[-roof.halfSpan * 0.5, roofCenterY, roof.centerZ]}
          rotation={[0, 0, roof.angle]}
          scale={[roof.slopeLength, roof.thickness, roof.depth]}
          castShadow={!reducedGraphics}
          receiveShadow
          raycast={NO_RAYCAST}
        />
      )}
      <mesh
        geometry={UNIT_BOX}
        material={materials.trim}
        position={[0, roof.ridgeY + roof.thickness * 0.4, roof.centerZ]}
        scale={[layout.structure.beamSize * 1.6, roof.thickness * 0.9, roof.depth]}
        raycast={NO_RAYCAST}
      />

      <ScaledInstances
        geometry={UNIT_CYLINDER}
        material={materials.dark}
        items={architecture.columns}
        castShadow={!reducedGraphics}
      />
      <ScaledInstances material={materials.metal} items={architecture.longitudinalBeams} />

      {/* Escada de descida (fronteira com a Exporural) — sempre presente. */}
      <ScaledInstances
        material={materials.platform}
        items={architecture.stairSteps}
        castShadow={!reducedGraphics}
        receiveShadow
      />
      <ScaledInstances
        material={materials.wall}
        items={architecture.stairWalls}
        castShadow={!reducedGraphics}
        receiveShadow
      />
      <ScaledInstances
        material={LANDING_TACTILE_MATERIAL}
        items={architecture.landingTactile}
        receiveShadow
      />

      {showDetail && (
        <>
          <ScaledInstances material={materials.metal} items={architecture.trussMembers} />
          <ScaledInstances material={materials.metal} items={architecture.purlins} />
          <ScaledInstances material={materials.trim} items={architecture.fascias} />
          <ScaledInstances material={materials.metal} items={architecture.railingPosts} />
          <ScaledInstances material={materials.metal} items={architecture.railingRails} />
          <ScaledInstances material={materials.metal} items={architecture.stairRails} />
          <mesh
            geometry={UNIT_TRIANGLE}
            material={materials.trim}
            position={[0, roof.eaveY, roof.centerZ - roof.depth / 2 + 0.008]}
            scale={[roof.halfSpan, roof.rise, 1]}
            raycast={NO_RAYCAST}
          />
          <mesh
            geometry={UNIT_TRIANGLE}
            material={materials.trim}
            position={[0, roof.eaveY, roof.centerZ + roof.depth / 2 - 0.008]}
            rotation={[0, Math.PI, 0]}
            scale={[roof.halfSpan, roof.rise, 1]}
            raycast={NO_RAYCAST}
          />
          {/* Quiosque de apoio junto à parede da estrutura lateral. */}
          <group position={service.center} raycast={NO_RAYCAST}>
            <mesh
              geometry={UNIT_BOX}
              material={materials.white}
              scale={[service.width, service.height, service.depth]}
              castShadow={!reducedGraphics}
              raycast={NO_RAYCAST}
            />
            <mesh
              geometry={UNIT_BOX}
              material={materials.dark}
              position={[service.width / 2 + 0.006, -service.height * 0.08, service.depth * 0.1]}
              scale={[0.012, service.height * 0.6, service.depth * 0.4]}
              raycast={NO_RAYCAST}
            />
          </group>
        </>
      )}

      {showFocusDetail && (
        <>
          <ScaledInstances material={materials.accent} items={architecture.benchSeats} />
          <ScaledInstances material={materials.dark} items={architecture.benchFrames} />
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
  reducedGraphics = false,
}: {
  bounds: StrategicLandmarkBounds;
  height: number;
  materials: MirantePavilionMaterials;
  showDetail: boolean;
  showFocusDetail: boolean;
  reducedGraphics?: boolean;
}) {
  const layout = useMemo(
    () => createMiranteLayout(bounds, height, MIRANTE_SITE_PROFILE),
    [bounds, height],
  );

  return (
    <MiranteArchitecture
      layout={layout}
      materials={materials}
      showDetail={showDetail}
      showFocusDetail={showFocusDetail}
      reducedGraphics={reducedGraphics}
    />
  );
});
