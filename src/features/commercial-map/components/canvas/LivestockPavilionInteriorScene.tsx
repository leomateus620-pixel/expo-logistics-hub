import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { MapEntity } from '../../types';
import {
  createLivestockCattlePlan,
  createLivestockPavilionLayout,
  LIVESTOCK_PAVILION_RENDER_BUDGET,
  livestockPavilionBayPositions,
  livestockPavilionVisualHeight,
} from '../../utils/livestockPavilion';
import {
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
} from '../../utils/landmarks';
import {
  LivestockCattle,
} from './LivestockCattle';
import { createLivestockSurfaceTexture } from './livestockPavilionTextures';

const NO_RAYCAST = () => undefined;
const UP = new THREE.Vector3(0, 1, 0);
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const BEDDING_CLUMP = new THREE.DodecahedronGeometry(0.5, 0);

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
}

function InteriorInstances({
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

function createInteriorIdentityTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = LIVESTOCK_PAVILION_RENDER_BUDGET.identityTextureWidth;
  canvas.height = LIVESTOCK_PAVILION_RENDER_BUDGET.identityTextureHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#eef0e9';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#315f67';
  context.fillRect(0, 0, canvas.width, 11);
  context.fillStyle = '#243f36';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '900 36px Arial, sans-serif';
  context.fillText('PECUÁRIA', canvas.width / 2, 50);
  context.fillStyle = '#9f593c';
  context.font = '800 21px Arial, sans-serif';
  context.fillText('PAVILHÕES 6 · 10 · 11', canvas.width / 2, 87);
  context.fillStyle = '#69736c';
  context.font = '700 10px Arial, sans-serif';
  context.fillText('CIRCULAÇÃO CENTRAL · BAIAS DE EXPOSIÇÃO', canvas.width / 2, 111);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function InteriorIdentity({
  position,
  width,
  frameMaterial,
}: {
  position: Vector3Tuple;
  width: number;
  frameMaterial: THREE.Material;
}) {
  const texture = useMemo(() => createInteriorIdentityTexture(), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: texture ? '#ffffff' : '#eef0e9',
    map: texture,
    roughness: 0.76,
    metalness: 0,
  }), [texture]);

  useEffect(() => () => {
    texture?.dispose();
    material.dispose();
  }, [material, texture]);

  return (
    <group position={position} raycast={NO_RAYCAST}>
      <mesh
        geometry={UNIT_BOX}
        material={frameMaterial}
        position={[0, 0, -0.035]}
        scale={[width + 0.1, width * 0.27 + 0.1, 0.08]}
        castShadow
      />
      <mesh
        geometry={UNIT_PLANE}
        material={material}
        position={[0, 0, 0.012]}
        scale={[width, width * 0.27, 1]}
      />
    </group>
  );
}

function LivestockInteriorCameraRig({
  entity,
  reducedGraphics,
}: {
  entity: MapEntity;
  reducedGraphics: boolean;
}) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const animating = useRef(true);
  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const { camera, gl, invalidate, size } = useThree();
  const bounds = useMemo(() => strategicLandmarkBounds(entity), [entity]);
  const height = Math.max(entity.geometry.extrusionHeight, livestockPavilionVisualHeight(bounds));
  const layout = useMemo(() => createLivestockPavilionLayout(bounds, height), [bounds, height]);
  const facing = strategicLandmarkFacingRadians(entity);
  const center = useMemo(
    () => new THREE.Vector3(bounds.centerX, entity.geometry.elevation, bounds.centerZ),
    [bounds.centerX, bounds.centerZ, entity.geometry.elevation],
  );
  const toWorld = useCallback((x: number, y: number, z: number) => (
    new THREE.Vector3(x, y, z).applyAxisAngle(UP, facing).add(center)
  ), [center, facing]);
  const clampTarget = useCallback(() => {
    const target = controls.current?.target;
    if (!target) return;
    const local = target.clone().sub(center).applyAxisAngle(UP, -facing);
    local.x = THREE.MathUtils.clamp(local.x, -layout.width * 0.62, layout.width * 0.62);
    local.y = THREE.MathUtils.clamp(local.y, 0.12, layout.height * 1.08);
    local.z = THREE.MathUtils.clamp(local.z, -layout.depth * 1.45, layout.depth * 1.45);
    target.copy(local.applyAxisAngle(UP, facing).add(center));
  }, [center, facing, layout.depth, layout.height, layout.width]);

  useEffect(() => {
    const compact = size.width < 700 || size.height < 500;
    const portrait = size.height > size.width * 1.15;
    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = portrait
      ? toWorld(-layout.width * 0.18, layout.height * 1.92, layout.depth * 10.5)
      : compact
      ? toWorld(-layout.width * 0.42, layout.height * 2.02, layout.depth * 6.5)
      : toWorld(-layout.width * 0.48, layout.height * 1.72, layout.depth * 5);
    const destination = portrait
      ? toWorld(-layout.width * 0.16, layout.height * 1.48, layout.depth * 8.8)
      : compact
      ? toWorld(-layout.width * 0.32, layout.height * 1.62, layout.depth * 5.5)
      : toWorld(-layout.width * 0.38, layout.height * 1.26, layout.depth * 4.1);
    const lookAt = portrait
      ? toWorld(-layout.width * 0.16, layout.height * 0.46, 0)
      : compact
      ? toWorld(-layout.width * 0.12, layout.height * 0.48, 0)
      : toWorld(-layout.width * 0.16, layout.height * 0.42, -layout.depth * 0.04);

    targetPosition.current.copy(destination);
    targetLookAt.current.copy(lookAt);
    camera.position.copy(reducedMotion ? destination : start);
    camera.near = 0.04;
    camera.far = Math.max(140, layout.width * 8);
    if (camera instanceof THREE.PerspectiveCamera) camera.fov = portrait ? 50 : compact ? 48 : 44;
    camera.updateProjectionMatrix();
    controls.current?.target.copy(lookAt);
    clampTarget();
    controls.current?.update();
    animating.current = !reducedMotion && !reducedGraphics;
    gl.domElement.style.cursor = 'grab';
    invalidate();
    return () => {
      gl.domElement.style.cursor = 'grab';
    };
  }, [
    camera,
    clampTarget,
    gl,
    invalidate,
    layout.depth,
    layout.eaveHeight,
    layout.height,
    layout.sideWallHeight,
    layout.width,
    reducedGraphics,
    size.height,
    size.width,
    toWorld,
  ]);

  useFrame((_state, delta) => {
    if (!animating.current) return;
    const factor = 1 - Math.exp(-delta * 4.6);
    camera.position.lerp(targetPosition.current, factor);
    if (controls.current) {
      controls.current.target.lerp(targetLookAt.current, factor);
      controls.current.update();
    }
    if (
      camera.position.distanceTo(targetPosition.current) < 0.035
      && (!controls.current || controls.current.target.distanceTo(targetLookAt.current) < 0.025)
    ) {
      camera.position.copy(targetPosition.current);
      controls.current?.target.copy(targetLookAt.current);
      controls.current?.update();
      animating.current = false;
    } else {
      invalidate();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      regress
      enableDamping
      dampingFactor={0.075}
      enablePan
      screenSpacePanning
      zoomToCursor
      minDistance={Math.max(2.6, layout.depth * 0.9)}
      maxDistance={Math.max(26, layout.width * 1.55)}
      minPolarAngle={0.18}
      maxPolarAngle={Math.PI / 2.02}
      target={toWorld(0, layout.sideWallHeight * 1.1, 0).toArray()}
      onStart={() => {
        animating.current = false;
        gl.domElement.style.cursor = 'grabbing';
      }}
      onEnd={() => {
        gl.domElement.style.cursor = 'grab';
      }}
      onChange={() => {
        clampTarget();
        invalidate();
      }}
    />
  );
}

export const LivestockPavilionInteriorScene = memo(function LivestockPavilionInteriorScene({
  entity,
  reducedGraphics,
}: {
  entity: MapEntity;
  reducedGraphics: boolean;
}) {
  const bounds = useMemo(() => strategicLandmarkBounds(entity), [entity]);
  const height = Math.max(entity.geometry.extrusionHeight, livestockPavilionVisualHeight(bounds));
  const layout = useMemo(() => createLivestockPavilionLayout(bounds, height), [bounds, height]);
  const facing = strategicLandmarkFacingRadians(entity);
  const cattle = useMemo(
    () => createLivestockCattlePlan(layout, reducedGraphics ? 'reducedInterior' : 'interior'),
    [layout, reducedGraphics],
  );
  const surfaceTextures = useMemo(() => ({
    concrete: createLivestockSurfaceTexture('concrete'),
    roof: createLivestockSurfaceTexture('roof'),
    sawdust: createLivestockSurfaceTexture('sawdust'),
  }), []);
  const materials = useMemo(() => ({
    platform: new THREE.MeshStandardMaterial({
      color: '#85847e',
      map: surfaceTextures.concrete,
      bumpMap: surfaceTextures.concrete,
      bumpScale: 0.014,
      roughness: 0.97,
      metalness: 0,
    }),
    bedding: new THREE.MeshStandardMaterial({
      color: '#c59a64',
      map: surfaceTextures.sawdust,
      bumpMap: surfaceTextures.sawdust,
      bumpScale: 0.026,
      roughness: 1,
      metalness: 0,
    }),
    aisle: new THREE.MeshStandardMaterial({
      color: '#8d8b84',
      map: surfaceTextures.concrete,
      bumpMap: surfaceTextures.concrete,
      bumpScale: 0.012,
      roughness: 0.96,
      metalness: 0,
    }),
    wall: new THREE.MeshStandardMaterial({ color: '#557d88', roughness: 0.82, metalness: 0.04 }),
    steel: new THREE.MeshStandardMaterial({
      color: '#354345',
      emissive: '#1b2425',
      emissiveIntensity: 0.045,
      roughness: 0.54,
      metalness: 0.3,
    }),
    roof: new THREE.MeshStandardMaterial({
      color: '#c9ccc7',
      map: surfaceTextures.roof,
      bumpMap: surfaceTextures.roof,
      bumpScale: 0.008,
      roughness: 0.62,
      metalness: 0.16,
      side: THREE.DoubleSide,
    }),
    trim: new THREE.MeshStandardMaterial({ color: '#b9b5aa', roughness: 0.82, metalness: 0.03 }),
    water: new THREE.MeshStandardMaterial({ color: '#315e69', roughness: 0.34, metalness: 0.08 }),
    skylight: new THREE.MeshStandardMaterial({
      color: '#b7d6d6',
      roughness: 0.26,
      metalness: 0.04,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    light: new THREE.MeshStandardMaterial({
      color: '#fff0c4',
      emissive: '#ffbd67',
      emissiveIntensity: 1.35,
      roughness: 0.42,
      toneMapped: false,
    }),
  }), [surfaceTextures]);

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
    Object.values(surfaceTextures).forEach((texture) => texture?.dispose());
  }, [materials, surfaceTextures]);

  const architecture = useMemo(() => {
    const platforms: InstanceTransform[] = [];
    const stallFloors: InstanceTransform[] = [];
    const aisles: InstanceTransform[] = [];
    const aisleEdges: InstanceTransform[] = [];
    const aisleJoints: InstanceTransform[] = [];
    const drainageChannels: InstanceTransform[] = [];
    const outerWalls: InstanceTransform[] = [];
    const partitionKickboards: InstanceTransform[] = [];
    const partitionRails: InstanceTransform[] = [];
    const corridorRails: InstanceTransform[] = [];
    const gatePosts: InstanceTransform[] = [];
    const feedTroughs: InstanceTransform[] = [];
    const columns: InstanceTransform[] = [];
    const ties: InstanceTransform[] = [];
    const chords: InstanceTransform[] = [];
    const trussWebs: InstanceTransform[] = [];
    const sideBraces: InstanceTransform[] = [];
    const purlins: InstanceTransform[] = [];
    const farRoof: InstanceTransform[] = [];
    const ridgeCaps: InstanceTransform[] = [];
    const ridgeVents: InstanceTransform[] = [];
    const ridgeSupports: InstanceTransform[] = [];
    const rails: InstanceTransform[] = [];
    const sectionThresholds: InstanceTransform[] = [];
    const skylights: InstanceTransform[] = [];
    const lightHousings: InstanceTransform[] = [];
    const lightTubes: InstanceTransform[] = [];
    const waterers: InstanceTransform[] = [];
    const beddingClumps: InstanceTransform[] = [];

    layout.sections.forEach((section, sectionIndex) => {
      platforms.push({
        position: [section.centerX, layout.platformHeight / 2, 0],
        scale: [section.width, layout.platformHeight, layout.depth - 0.035],
      });
      aisles.push({
        position: [section.centerX, layout.platformHeight + 0.032, 0],
        scale: [section.width - 0.06, 0.064, layout.corridorWidth - 0.025],
      });
      drainageChannels.push({
        position: [section.centerX, layout.platformHeight + 0.069, 0],
        scale: [section.width - 0.12, 0.018, 0.058],
      });
      aisleJoints.push({
        position: [section.minX + 0.04, layout.platformHeight + 0.071, 0],
        scale: [0.04, 0.012, layout.corridorWidth - 0.08],
      });
      [-1, 1].forEach((side) => {
        const stallZ = side * (layout.corridorWidth / 2 + layout.stallDepth / 2);
        stallFloors.push({
          position: [section.centerX, layout.platformHeight + 0.038, stallZ],
          scale: [section.width - 0.08, 0.076, layout.stallDepth - 0.04],
        });
        aisleEdges.push({
          position: [
            section.centerX,
            layout.platformHeight + 0.085,
            side * (layout.corridorWidth / 2 + 0.02),
          ],
          scale: [section.width - 0.1, 0.1, 0.07],
        });
        feedTroughs.push({
          position: [
            section.centerX,
            layout.platformHeight + 0.135,
            side * (layout.corridorWidth / 2 + 0.14),
          ],
          scale: [section.width - 0.26, 0.17, 0.19],
        });
        outerWalls.push({
          position: [
            section.centerX,
            layout.platformHeight + layout.sideWallHeight * 0.38,
            side * (layout.depth / 2 - 0.07),
          ],
          scale: [section.width - 0.15, layout.sideWallHeight * 0.76, 0.12],
        });
        [0.76, 1.12].forEach((heightRatio) => {
          rails.push({
            position: [
              section.centerX,
              Math.min(layout.eaveHeight - 0.16, layout.sideWallHeight * heightRatio + 0.31),
              side * (layout.depth / 2 - 0.12),
            ],
            scale: [section.width - 0.18, 0.035, 0.035],
          });
        });
        [0.42, 0.67, 0.91].forEach((railHeight) => {
          corridorRails.push({
            position: [
              section.centerX,
              layout.platformHeight + railHeight,
              side * (layout.corridorWidth / 2 + 0.19),
            ],
            scale: [section.width - 0.22, 0.04, 0.04],
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

        const clumpCount = reducedGraphics ? 8 : 26;
        for (let clumpIndex = 0; clumpIndex < clumpCount; clumpIndex += 1) {
          const xRatio = ((clumpIndex * 41 + sectionIndex * 17 + (side > 0 ? 7 : 23)) % 101) / 101;
          const zRatio = ((clumpIndex * 31 + sectionIndex * 9) % 47) / 47;
          const clumpScale = 0.042 + ((clumpIndex * 13 + sectionIndex) % 6) * 0.009;
          beddingClumps.push({
            position: [
              section.minX + 0.12 + xRatio * (section.width - 0.24),
              layout.platformHeight + 0.083,
              side * (
                layout.corridorWidth / 2
                + 0.27
                + zRatio * Math.max(0.12, layout.stallDepth - 0.38)
              ),
            ],
            scale: [clumpScale * 1.5, clumpScale * 0.44, clumpScale],
            rotation: [0, (clumpIndex * 0.83) % Math.PI, 0],
          });
        }
      });

      // The camera-facing roof sheet remains open as a deliberate architectural
      // section, while its chords and purlins stay visible. This preserves roof
      // logic without allowing an opaque plane to hide the stalls.
      farRoof.push({
        position: [
          section.centerX,
          layout.eaveHeight + layout.roofRise / 2,
          -layout.roofHalfSpan / 2,
        ],
        scale: [section.width + 0.08, 0.085, layout.roofSlopeLength + 0.055],
        rotation: [-layout.roofAngle, 0, 0],
      });
      [-0.25, 0.25].forEach((xRatio) => {
        const slopeRatio = 0.43;
        skylights.push({
          position: [
            section.centerX + section.width * xRatio,
            layout.height - layout.roofRise * slopeRatio + 0.047,
            -layout.roofHalfSpan * slopeRatio,
          ],
          scale: [section.width * 0.18, 0.018, layout.roofSlopeLength * 0.32],
          rotation: [-layout.roofAngle, 0, 0],
        });
      });
      ridgeCaps.push({
        position: [section.centerX, layout.height + 0.025, 0],
        scale: [section.width + 0.08, 0.085, 0.13],
      });
      ridgeVents.push({
        position: [section.centerX, layout.height + 0.135, 0],
        scale: [section.width - 0.12, 0.055, 0.24],
      });

      const bays = livestockPavilionBayPositions(section);
      bays.forEach((x, index) => {
        if (!reducedGraphics || index === 0 || index === bays.length - 1 || index % 2 === 0) {
          [-1, 1].forEach((side) => {
            columns.push({
              position: [
                x,
                layout.platformHeight + layout.eaveHeight / 2,
                side * (layout.depth / 2 - 0.13),
              ],
              scale: [0.07, layout.eaveHeight, 0.07],
            });
            chords.push({
              position: [
                x,
                layout.eaveHeight + layout.roofRise / 2 - 0.05,
                side * layout.roofHalfSpan / 2,
              ],
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
          ties.push({
            position: [x, layout.eaveHeight - 0.09, 0],
            scale: [0.055, 0.055, layout.depth - 0.23],
          });
          ridgeSupports.push({
            position: [x, layout.height + 0.075, 0],
            scale: [0.035, 0.13, 0.035],
          });
        }
        if (index > 0 && index < bays.length - 1) {
          [-1, 1].forEach((side) => {
            partitionKickboards.push({
              position: [
                x,
                layout.platformHeight + 0.14,
                side * (layout.corridorWidth / 2 + layout.stallDepth / 2),
              ],
              scale: [0.055, 0.22, layout.stallDepth - 0.1],
            });
            [0.39, 0.63, 0.86].forEach((railHeight) => {
              partitionRails.push({
                position: [
                  x,
                  layout.platformHeight + railHeight,
                  side * (layout.corridorWidth / 2 + layout.stallDepth / 2),
                ],
                scale: [0.045, 0.045, layout.stallDepth - 0.1],
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
        if (index < bays.length - 1) {
          const nextX = bays[index + 1];
          const bayWidth = nextX - x;
          lightHousings.push({
            position: [x + bayWidth / 2, layout.eaveHeight - 0.19, 0],
            scale: [bayWidth * 0.48, 0.065, 0.085],
          });
          lightTubes.push({
            position: [x + bayWidth / 2, layout.eaveHeight - 0.225, 0],
            scale: [bayWidth * 0.39, 0.025, 0.048],
          });
          if (!reducedGraphics && index % 2 === 0) {
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

      sectionThresholds.push({
        position: [section.minX + 0.035, layout.platformHeight + 0.055, 0],
        scale: [0.07, 0.11, layout.corridorWidth],
      });
    });

    return {
      aisles,
      beddingClumps,
      columns,
      farRoof,
      lightTubes,
      outerWalls,
      partitionKickboards,
      platforms,
      ridgeCaps,
      ridgeVents,
      skylights,
      steelDetails: [
        ...aisleJoints,
        ...drainageChannels,
        ...partitionRails,
        ...corridorRails,
        ...gatePosts,
        ...rails,
        ...ties,
        ...chords,
        ...trussWebs,
        ...sideBraces,
        ...purlins,
        ...ridgeSupports,
        ...lightHousings,
      ],
      stallFloors,
      trimDetails: [...aisleEdges, ...feedTroughs, ...sectionThresholds],
      waterers,
    };
  }, [layout, reducedGraphics]);

  const shadowSpan = Math.max(layout.width * 0.62, 8);
  const signWidth = Math.min(3.6, layout.width * 0.22);

  return (
    <>
      <color attach="background" args={['#cfd5cf']} />
      <fog attach="fog" args={['#cfd5cf', layout.width * 1.6, layout.width * 3.8]} />
      <ambientLight intensity={0.54} />
      <hemisphereLight args={['#fff7e5', '#67584c', 0.78]} />
      <directionalLight
        position={[bounds.centerX - layout.width * 0.26, 11, bounds.centerZ + 7]}
        intensity={1.82}
        color="#fff0ce"
        castShadow={!reducedGraphics}
        shadow-mapSize-width={reducedGraphics ? 256 : 1024}
        shadow-mapSize-height={reducedGraphics ? 256 : 1024}
        shadow-camera-left={-shadowSpan}
        shadow-camera-right={shadowSpan}
        shadow-camera-top={shadowSpan * 0.5}
        shadow-camera-bottom={-shadowSpan * 0.5}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-bias={-0.00008}
        shadow-normalBias={0.035}
      />
      <pointLight
        position={[bounds.centerX, layout.eaveHeight * 0.92, bounds.centerZ]}
        intensity={0.86}
        distance={layout.width * 0.68}
        decay={2}
        color="#ffe5b5"
      />
      <directionalLight
        position={[bounds.centerX + layout.width * 0.36, 5.5, bounds.centerZ - 5]}
        intensity={0.32}
        color="#cfe2ef"
      />
      <group
        position={[bounds.centerX, entity.geometry.elevation, bounds.centerZ]}
        rotation={[0, facing, 0]}
        dispose={null}
        raycast={NO_RAYCAST}
      >
        <InteriorInstances material={materials.platform} items={architecture.platforms} receiveShadow />
        <InteriorInstances material={materials.aisle} items={architecture.aisles} receiveShadow />
        <InteriorInstances material={materials.bedding} items={architecture.stallFloors} receiveShadow />
        <InteriorInstances material={materials.trim} items={architecture.trimDetails} castShadow receiveShadow />
        <InteriorInstances material={materials.wall} items={architecture.outerWalls} />
        <InteriorInstances material={materials.wall} items={architecture.partitionKickboards} />
        <InteriorInstances material={materials.steel} items={architecture.columns} castShadow={!reducedGraphics} />
        <InteriorInstances material={materials.steel} items={architecture.steelDetails} />
        <InteriorInstances material={materials.roof} items={architecture.farRoof} castShadow receiveShadow />
        <InteriorInstances material={materials.skylight} items={architecture.skylights} />
        <InteriorInstances material={materials.trim} items={architecture.ridgeCaps} />
        <InteriorInstances material={materials.roof} items={architecture.ridgeVents} castShadow />
        <InteriorInstances material={materials.water} items={architecture.waterers} />
        <InteriorInstances material={materials.light} items={architecture.lightTubes} />
        <InteriorInstances
          geometry={BEDDING_CLUMP}
          material={materials.bedding}
          items={architecture.beddingClumps}
        />
        <LivestockCattle
          poses={cattle}
          castShadow={!reducedGraphics}
          animate={!reducedGraphics}
        />
        {layout.sections
          .filter((_section, index) => !reducedGraphics || index === 1)
          .map((section) => (
            <pointLight
              key={`stall-light:${section.key}`}
              position={[section.centerX, layout.eaveHeight * 0.74, 0]}
              intensity={reducedGraphics ? 0.38 : 0.36}
              distance={Math.max(4.2, section.width * 0.9)}
              decay={2}
              color="#ffdba6"
            />
          ))}
        <InteriorIdentity
          position={[0, layout.eaveHeight - 0.38, -layout.depth / 2 + 0.135]}
          width={signWidth}
          frameMaterial={materials.steel}
        />
      </group>
      <LivestockInteriorCameraRig entity={entity} reducedGraphics={reducedGraphics} />
    </>
  );
});
