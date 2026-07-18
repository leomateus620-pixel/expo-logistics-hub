import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  createLivestockCattlePlan,
  createLivestockPavilionLayout,
  LIVESTOCK_PAVILION_RENDER_BUDGET,
  livestockPavilionBayPositions,
} from '../../utils/livestockPavilion';
import type { StrategicLandmarkBounds } from '../../utils/landmarks';
import { LivestockCattle } from './LivestockCattle';
import { createLivestockSurfaceTexture } from './livestockPavilionTextures';

const NO_RAYCAST = () => undefined;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const BEDDING_CLUMP = new THREE.DodecahedronGeometry(0.5, 0);

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
}

export interface LivestockPavilionMaterials {
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
      object.position.set(...item.position);
      object.rotation.set(...(item.rotation ?? [0, 0, 0]));
      object.scale.set(...item.scale);
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
    />
  );
}

function beamAlongXy(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  z: number,
  thickness: number,
): InstanceTransform {
  const dx = endX - startX;
  const dy = endY - startY;
  return {
    position: [(startX + endX) / 2, (startY + endY) / 2, z],
    scale: [Math.hypot(dx, dy), thickness, thickness],
    rotation: [0, 0, Math.atan2(dy, dx)],
  };
}

function beamAlongYz(
  x: number,
  startY: number,
  startZ: number,
  endY: number,
  endZ: number,
  thickness: number,
): InstanceTransform {
  const dy = endY - startY;
  const dz = endZ - startZ;
  return {
    position: [x, (startY + endY) / 2, (startZ + endZ) / 2],
    scale: [thickness, thickness, Math.hypot(dy, dz)],
    rotation: [-Math.atan2(dy, dz), 0, 0],
  };
}

function createIdentityTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = LIVESTOCK_PAVILION_RENDER_BUDGET.identityTextureWidth;
  canvas.height = LIVESTOCK_PAVILION_RENDER_BUDGET.identityTextureHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#f3f1e8';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#2f6672';
  context.fillRect(0, 0, 15, canvas.height);
  context.fillStyle = '#2b443a';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.font = '800 29px Arial, sans-serif';
  context.fillText('PAVILHÕES 6 · 10 · 11', 36, 46);
  context.fillStyle = '#a45736';
  context.font = '900 36px Arial, sans-serif';
  context.fillText('PECUÁRIA', 36, 86);
  context.fillStyle = '#62716c';
  context.font = '700 11px Arial, sans-serif';
  context.fillText('FENASOJA · ESTRUTURA DE EXPOSIÇÃO ANIMAL', 265, 103);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function LivestockIdentitySign({
  width,
  depth,
  sideWallHeight,
  frameMaterial,
}: {
  width: number;
  depth: number;
  sideWallHeight: number;
  frameMaterial: THREE.Material;
}) {
  const texture = useMemo(() => createIdentityTexture(), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: texture ? '#ffffff' : '#f3f1e8',
    map: texture,
    roughness: 0.74,
    metalness: 0,
  }), [texture]);

  useEffect(() => () => {
    texture?.dispose();
    material.dispose();
  }, [material, texture]);

  const signWidth = Math.min(4.8, width * 0.3);
  const signHeight = Math.max(0.46, signWidth * 0.25);
  return (
    <group
      position={[0, sideWallHeight + signHeight * 0.68, depth / 2 + 0.018]}
      raycast={NO_RAYCAST}
    >
      <mesh
        geometry={UNIT_BOX}
        material={frameMaterial}
        position={[0, 0, -0.025]}
        scale={[signWidth + 0.09, signHeight + 0.09, 0.075]}
        castShadow
      />
      <mesh
        geometry={UNIT_PLANE}
        material={material}
        position={[0, 0, 0.018]}
        scale={[signWidth, signHeight, 1]}
      />
    </group>
  );
}

export const LivestockPavilion = memo(function LivestockPavilion({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: {
  bounds: StrategicLandmarkBounds;
  height: number;
  materials: LivestockPavilionMaterials;
  showDetail: boolean;
  showFocusDetail: boolean;
}) {
  const layout = useMemo(
    () => createLivestockPavilionLayout(bounds, height),
    [bounds, height],
  );
  const surfaceTextures = useMemo(() => ({
    concrete: createLivestockSurfaceTexture('concrete'),
    roof: createLivestockSurfaceTexture('roof'),
    sawdust: createLivestockSurfaceTexture('sawdust'),
  }), []);
  const detailMaterials = useMemo(() => ({
    skylight: new THREE.MeshStandardMaterial({
      color: '#b7d4d3',
      roughness: 0.3,
      metalness: 0.05,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    light: new THREE.MeshStandardMaterial({
      color: '#fff1c4',
      emissive: '#ffbf69',
      emissiveIntensity: 1.25,
      roughness: 0.44,
      metalness: 0,
      toneMapped: false,
    }),
  }), []);

  useEffect(() => {
    const targets = [
      {
        material: materials.platform,
        texture: surfaceTextures.concrete,
        bumpScale: 0.014,
        roughness: 0.96,
        metalness: 0,
      },
      {
        material: materials.accent,
        texture: surfaceTextures.sawdust,
        bumpScale: 0.022,
        roughness: 1,
        metalness: 0,
      },
      {
        material: materials.roof,
        texture: surfaceTextures.roof,
        bumpScale: 0.008,
        roughness: 0.6,
        metalness: 0.16,
      },
    ];
    const previous = targets.map(({ material }) => ({
      material,
      map: material.map,
      bumpMap: material.bumpMap,
      bumpScale: material.bumpScale,
      roughness: material.roughness,
      metalness: material.metalness,
    }));

    targets.forEach(({ material, texture, bumpScale, roughness, metalness }) => {
      material.map = texture;
      material.bumpMap = texture;
      material.bumpScale = bumpScale;
      material.roughness = roughness;
      material.metalness = metalness;
      material.needsUpdate = true;
    });

    return () => {
      previous.forEach((item) => {
        item.material.map = item.map;
        item.material.bumpMap = item.bumpMap;
        item.material.bumpScale = item.bumpScale;
        item.material.roughness = item.roughness;
        item.material.metalness = item.metalness;
        item.material.needsUpdate = true;
      });
    };
  }, [materials, surfaceTextures]);

  useEffect(() => () => {
    Object.values(surfaceTextures).forEach((texture) => texture?.dispose());
  }, [surfaceTextures]);

  useEffect(() => () => {
    detailMaterials.skylight.dispose();
    detailMaterials.light.dispose();
  }, [detailMaterials]);

  const architecture = useMemo(() => {
    const roofFaces: InstanceTransform[] = [];
    const ridgeCaps: InstanceTransform[] = [];
    const ridgeVents: InstanceTransform[] = [];
    const ridgeSupports: InstanceTransform[] = [];
    const gutters: InstanceTransform[] = [];
    const downspouts: InstanceTransform[] = [];
    const platforms: InstanceTransform[] = [];
    const stallFloors: InstanceTransform[] = [];
    const corridors: InstanceTransform[] = [];
    const aisleEdges: InstanceTransform[] = [];
    const aisleJoints: InstanceTransform[] = [];
    const sideWalls: InstanceTransform[] = [];
    const columns: InstanceTransform[] = [];
    const trussTies: InstanceTransform[] = [];
    const trussChords: InstanceTransform[] = [];
    const trussWebs: InstanceTransform[] = [];
    const partitionKickboards: InstanceTransform[] = [];
    const partitionRails: InstanceTransform[] = [];
    const sideRails: InstanceTransform[] = [];
    const corridorRails: InstanceTransform[] = [];
    const gatePosts: InstanceTransform[] = [];
    const sideBraces: InstanceTransform[] = [];
    const roofSeams: InstanceTransform[] = [];
    const purlins: InstanceTransform[] = [];
    const skylights: InstanceTransform[] = [];
    const feedTroughs: InstanceTransform[] = [];
    const waterers: InstanceTransform[] = [];
    const lightHousings: InstanceTransform[] = [];
    const lightTubes: InstanceTransform[] = [];
    const beddingClumps: InstanceTransform[] = [];

    layout.sections.forEach((section, sectionIndex) => {
      platforms.push({
        position: [section.centerX, layout.platformHeight / 2, 0],
        scale: [section.width, layout.platformHeight, layout.depth - 0.04],
      });
      corridors.push({
        position: [section.centerX, layout.platformHeight + 0.03, 0],
        scale: [section.width - 0.08, 0.06, layout.corridorWidth - 0.04],
      });
      aisleJoints.push({
        position: [section.minX + 0.035, layout.platformHeight + 0.064, 0],
        scale: [0.035, 0.012, layout.corridorWidth - 0.08],
      });
      [-1, 1].forEach((side) => {
        const sideZ = side * (layout.corridorWidth / 2 + layout.stallDepth / 2);
        stallFloors.push({
          position: [section.centerX, layout.platformHeight + 0.034, sideZ],
          scale: [section.width - 0.1, 0.068, layout.stallDepth - 0.06],
        });
        aisleEdges.push({
          position: [
            section.centerX,
            layout.platformHeight + 0.08,
            side * (layout.corridorWidth / 2 + 0.02),
          ],
          scale: [section.width - 0.1, 0.1, 0.07],
        });
        feedTroughs.push({
          position: [
            section.centerX,
            layout.platformHeight + 0.13,
            side * (layout.corridorWidth / 2 + 0.135),
          ],
          scale: [section.width - 0.28, 0.16, 0.18],
        });
        sideWalls.push({
          position: [
            section.centerX,
            layout.platformHeight + layout.sideWallHeight * 0.38,
            side * (layout.depth / 2 - 0.075),
          ],
          scale: [section.width - 0.18, layout.sideWallHeight * 0.76, 0.12],
        });
        roofFaces.push({
          position: [
            section.centerX,
            layout.eaveHeight + layout.roofRise / 2,
            side * layout.roofHalfSpan / 2,
          ],
          scale: [section.width + 0.08, 0.085, layout.roofSlopeLength + 0.055],
          rotation: [side * layout.roofAngle, 0, 0],
        });
        gutters.push({
          position: [section.centerX, layout.eaveHeight - 0.018, side * (layout.depth / 2 - 0.035)],
          scale: [section.width + 0.055, 0.07, 0.075],
        });
        [0.76, 1.12].forEach((heightRatio) => {
          sideRails.push({
            position: [
              section.centerX,
              Math.min(layout.eaveHeight - 0.17, layout.sideWallHeight * heightRatio + 0.32),
              side * (layout.depth / 2 - 0.115),
            ],
            scale: [section.width - 0.22, 0.035, 0.035],
          });
        });
        [0.42, 0.67, 0.91].forEach((railHeight) => {
          corridorRails.push({
            position: [
              section.centerX,
              layout.platformHeight + railHeight,
              side * (layout.corridorWidth / 2 + 0.19),
            ],
            scale: [section.width - 0.24, 0.04, 0.04],
          });
        });
        [0.28, 0.58, 0.86].forEach((slopeRatio) => {
          purlins.push({
            position: [
              section.centerX,
              layout.height - layout.roofRise * slopeRatio - 0.055,
              side * layout.roofHalfSpan * slopeRatio,
            ],
            scale: [section.width - 0.08, 0.04, 0.045],
          });
        });
        [-0.25, 0.25].forEach((xRatio) => {
          const slopeRatio = 0.43;
          skylights.push({
            position: [
              section.centerX + section.width * xRatio,
              layout.height - layout.roofRise * slopeRatio + 0.047,
              side * layout.roofHalfSpan * slopeRatio,
            ],
            scale: [section.width * 0.18, 0.018, layout.roofSlopeLength * 0.32],
            rotation: [side * layout.roofAngle, 0, 0],
          });
        });

        if (showFocusDetail) {
          const seamCount = Math.max(8, Math.round(section.width / 0.36));
          for (let seamIndex = 1; seamIndex < seamCount; seamIndex += 1) {
            roofSeams.push({
              position: [
                section.minX + section.width * (seamIndex / seamCount),
                layout.eaveHeight + layout.roofRise / 2 + 0.05,
                side * layout.roofHalfSpan / 2,
              ],
              scale: [0.018, 0.018, layout.roofSlopeLength],
              rotation: [side * layout.roofAngle, 0, 0],
            });
          }
        }

        [section.minX + 0.09, section.maxX - 0.09].forEach((x) => {
          downspouts.push({
            position: [
              x,
              layout.platformHeight + layout.eaveHeight * 0.46,
              side * (layout.depth / 2 - 0.035),
            ],
            scale: [0.055, layout.eaveHeight * 0.92, 0.055],
          });
        });

        const clumpCount = showFocusDetail ? 18 : 7;
        for (let clumpIndex = 0; clumpIndex < clumpCount; clumpIndex += 1) {
          const xRatio = ((clumpIndex * 37 + sectionIndex * 13 + (side > 0 ? 5 : 19)) % 97) / 97;
          const zRatio = ((clumpIndex * 29 + sectionIndex * 7) % 43) / 43;
          const clumpScale = 0.045 + ((clumpIndex * 11 + sectionIndex) % 5) * 0.009;
          beddingClumps.push({
            position: [
              section.minX + 0.14 + xRatio * (section.width - 0.28),
              layout.platformHeight + 0.078,
              side * (
                layout.corridorWidth / 2
                + 0.28
                + zRatio * Math.max(0.1, layout.stallDepth - 0.4)
              ),
            ],
            scale: [clumpScale * 1.45, clumpScale * 0.42, clumpScale],
            rotation: [0, (clumpIndex * 0.91) % Math.PI, 0],
          });
        }
      });

      ridgeCaps.push({
        position: [section.centerX, layout.height + 0.025, 0],
        scale: [section.width + 0.09, 0.085, 0.14],
      });
      ridgeVents.push({
        position: [section.centerX, layout.height + 0.135, 0],
        scale: [section.width - 0.12, 0.055, 0.24],
      });

      const bayPositions = livestockPavilionBayPositions(section);
      bayPositions.forEach((x, index) => {
        [-1, 1].forEach((side) => {
          columns.push({
            position: [
              x,
              layout.platformHeight + layout.eaveHeight / 2,
              side * (layout.depth / 2 - 0.13),
            ],
            scale: [0.072, layout.eaveHeight, 0.072],
          });
          trussChords.push({
            position: [x, layout.eaveHeight + layout.roofRise / 2 - 0.055, side * layout.roofHalfSpan / 2],
            scale: [0.055, 0.055, layout.roofSlopeLength - 0.06],
            rotation: [side * layout.roofAngle, 0, 0],
          });
          gatePosts.push({
            position: [
              x,
              layout.platformHeight + 0.54,
              side * (layout.corridorWidth / 2 + 0.19),
            ],
            scale: [0.055, 0.92, 0.055],
          });
          trussWebs.push(
            beamAlongYz(
              x,
              layout.eaveHeight - 0.12,
              side * layout.roofHalfSpan * 0.82,
              layout.height - 0.1,
              0,
              0.04,
            ),
            beamAlongYz(
              x,
              layout.eaveHeight - 0.12,
              0,
              layout.height - layout.roofRise * 0.48,
              side * layout.roofHalfSpan * 0.48,
              0.035,
            ),
          );
        });
        trussTies.push({
          position: [x, layout.eaveHeight - 0.095, 0],
          scale: [0.055, 0.055, layout.depth - 0.24],
        });
        ridgeSupports.push({
          position: [x, layout.height + 0.075, 0],
          scale: [0.035, 0.13, 0.035],
        });
        if (index > 0 && index < bayPositions.length - 1) {
          [-1, 1].forEach((side) => {
            partitionKickboards.push({
              position: [
                x,
                layout.platformHeight + 0.14,
                side * (layout.corridorWidth / 2 + layout.stallDepth / 2),
              ],
              scale: [0.055, 0.22, layout.stallDepth - 0.12],
            });
            [0.39, 0.63, 0.86].forEach((railHeight) => {
              partitionRails.push({
                position: [
                  x,
                  layout.platformHeight + railHeight,
                  side * (layout.corridorWidth / 2 + layout.stallDepth / 2),
                ],
                scale: [0.045, 0.045, layout.stallDepth - 0.12],
              });
            });
            if ((index + sectionIndex) % 3 === 1) {
              waterers.push({
                position: [
                  x + 0.13,
                  layout.platformHeight + 0.24,
                  side * (layout.corridorWidth / 2 + layout.stallDepth * 0.8),
                ],
                scale: [0.22, 0.24, 0.2],
              });
            }
          });
        }
        if (index < bayPositions.length - 1) {
          const nextX = bayPositions[index + 1];
          const bayWidth = nextX - x;
          lightHousings.push({
            position: [
              x + bayWidth / 2,
              layout.eaveHeight - 0.19,
              0,
            ],
            scale: [bayWidth * 0.48, 0.065, 0.085],
          });
          lightTubes.push({
            position: [
              x + bayWidth / 2,
              layout.eaveHeight - 0.225,
              0,
            ],
            scale: [bayWidth * 0.39, 0.025, 0.048],
          });
          if (index % 2 === 0) {
            [-1, 1].forEach((side) => {
              sideBraces.push(
                beamAlongXy(
                  x + 0.04,
                  layout.platformHeight + 0.34,
                  nextX - 0.04,
                  layout.eaveHeight - 0.22,
                  side * (layout.depth / 2 - 0.145),
                  0.035,
                ),
              );
            });
          }
        }
      });
    });

    return {
      beddingClumps,
      columns,
      corridors,
      gutters,
      lightTubes,
      metalDetails: [
        ...sideRails,
        ...corridorRails,
        ...gatePosts,
        ...partitionRails,
        ...downspouts,
        ...ridgeSupports,
      ],
      darkDetails: [
        ...aisleJoints,
        ...trussTies,
        ...trussChords,
        ...trussWebs,
        ...sideBraces,
        ...purlins,
        ...lightHousings,
      ],
      partitionKickboards,
      platforms,
      ridgeCaps,
      ridgeVents,
      roofFaces,
      roofSeams,
      sideWalls,
      skylights,
      stallFloors,
      trimDetails: [...aisleEdges, ...feedTroughs],
      waterers,
    };
  }, [layout, showFocusDetail]);

  const cattle = useMemo(
    () => createLivestockCattlePlan(layout, showFocusDetail ? 'focused' : 'medium'),
    [layout, showFocusDetail],
  );

  return (
    <group raycast={NO_RAYCAST} dispose={null}>
      <ScaledInstances
        material={materials.platform}
        items={architecture.platforms}
        receiveShadow
      />
      <ScaledInstances
        material={materials.platform}
        items={architecture.corridors}
        receiveShadow
      />
      <ScaledInstances
        material={materials.accent}
        items={architecture.stallFloors}
        receiveShadow
      />
      <ScaledInstances
        material={materials.wall}
        items={architecture.sideWalls}
        castShadow
        receiveShadow
      />
      <ScaledInstances
        material={materials.roof}
        items={architecture.roofFaces}
        castShadow
        receiveShadow
      />
      <ScaledInstances material={materials.roof} items={architecture.ridgeCaps} castShadow />
      <ScaledInstances material={materials.metal} items={architecture.gutters} />
      <ScaledInstances material={materials.dark} items={architecture.columns} castShadow={showDetail} />

      {showDetail && (
        <>
          <ScaledInstances
            material={materials.trim}
            items={architecture.trimDetails}
            castShadow
            receiveShadow
          />
          <ScaledInstances material={materials.dark} items={architecture.darkDetails} />
          <ScaledInstances material={materials.metal} items={architecture.metalDetails} />
          <ScaledInstances material={materials.wall} items={architecture.partitionKickboards} />
          <ScaledInstances material={materials.roof} items={architecture.ridgeVents} castShadow />
          <ScaledInstances material={detailMaterials.skylight} items={architecture.skylights} />
          <ScaledInstances material={detailMaterials.light} items={architecture.lightTubes} />
          <ScaledInstances material={materials.glass} items={architecture.waterers} />
          <ScaledInstances geometry={BEDDING_CLUMP} material={materials.accent} items={architecture.beddingClumps} />
          <LivestockCattle
            poses={cattle}
            castShadow={showFocusDetail}
            animate={showFocusDetail}
          />
          <LivestockIdentitySign
            width={layout.width}
            depth={layout.depth}
            sideWallHeight={layout.sideWallHeight}
            frameMaterial={materials.dark}
          />
        </>
      )}

      {showFocusDetail && (
        <>
          <ScaledInstances material={materials.white} items={architecture.roofSeams} />
          <pointLight
            position={[0, layout.eaveHeight * 0.72, 0]}
            intensity={0.82}
            distance={layout.width * 0.55}
            decay={2}
            color="#ffd59a"
          />
        </>
      )}
    </group>
  );
});
