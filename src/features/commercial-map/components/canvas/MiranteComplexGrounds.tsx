import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  MIRANTE_COMPLEX,
  miranteComplexSourceBoundsToLocal,
} from '../../data/miranteComplexReconstruction';
import { PARK_ENVIRONMENT_FEATURES } from '../../data/parkEnvironment';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

const NO_RAYCAST = () => undefined;

function featureUserData(featureId: string) {
  const feature = PARK_ENVIRONMENT_FEATURES.find((candidate) => candidate.id === featureId);
  if (!feature) throw new Error(`Feature ambiental não encontrada: ${featureId}`);
  return Object.freeze({
    featureId: feature.id,
    classification: feature.classification,
    isSellable: feature.isSellable,
    contributesToCommercialMetrics: feature.contributesToCommercialMetrics,
  });
}

const SIDEWALK_USER_DATA = featureUserData('mirante-complex-sidewalk');

interface GroundBox {
  position: readonly [number, number, number];
  scale: readonly [number, number, number];
}

function opacityMaterial(color: string, roughness: number, opacity: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    transparent: opacity < 0.999,
    opacity,
    depthWrite: opacity > 0.94,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

function InstancedGround({
  name,
  items,
  material,
  geometry,
}: {
  name: string;
  items: readonly GroundBox[];
  material: THREE.Material;
  geometry: THREE.BoxGeometry;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    items.forEach((item, index) => {
      object.position.set(...item.position);
      object.rotation.set(0, 0, 0);
      object.scale.set(...item.scale);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [items]);
  useEffect(() => () => disposeInstancedMesh(ref.current), []);
  if (!items.length) return null;
  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, material, items.length]}
      count={items.length}
      receiveShadow
      frustumCulled
      raycast={NO_RAYCAST}
      userData={SIDEWALK_USER_DATA}
      dispose={null}
    />
  );
}

function slab(
  bounds: ReturnType<typeof miranteComplexSourceBoundsToLocal>,
  topY: number,
  thickness: number,
): GroundBox {
  return {
    position: [bounds.centerX, topY - thickness / 2, bounds.centerZ],
    scale: [bounds.width, thickness, bounds.depth],
  };
}

/**
 * Passeio de Rua Brasília, pátio sul e lajes do conjunto no nível do deck:
 * o Mirante e a estrutura lateral assentam neste piso, com meio-fio pintado
 * e faixa tátil amarela lidos nas fotos 7, 9 e 10.
 */
export const MiranteComplexGrounds = memo(function MiranteComplexGrounds({
  opacity,
}: {
  opacity: number;
}) {
  const { gl, invalidate } = useThree();
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const normalizedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  const materials = useMemo(() => ({
    concrete: opacityMaterial('#b7b3a8', 0.97, normalizedOpacity),
    curb: opacityMaterial('#f2f0e8', 0.88, normalizedOpacity),
    tactile: opacityMaterial('#d4a82c', 0.9, normalizedOpacity),
  }), [normalizedOpacity]);

  const surfaces = useMemo(() => {
    const sidewalk = miranteComplexSourceBoundsToLocal(MIRANTE_COMPLEX.sidewalk.sourceBounds);
    const apronEast = miranteComplexSourceBoundsToLocal([
      MIRANTE_COMPLEX.mirante.sourceBounds[0],
      MIRANTE_COMPLEX.southApron.sourceBounds[1],
      MIRANTE_COMPLEX.southApron.sourceBounds[2],
      MIRANTE_COMPLEX.southApron.sourceBounds[3],
    ]);
    const mirantePad = miranteComplexSourceBoundsToLocal([
      MIRANTE_COMPLEX.mirante.sourceBounds[0],
      MIRANTE_COMPLEX.mirante.platformSourceMinZ,
      MIRANTE_COMPLEX.mirante.sourceBounds[2],
      MIRANTE_COMPLEX.mirante.sourceBounds[3],
    ]);
    const northLanding = miranteComplexSourceBoundsToLocal(
      MIRANTE_COMPLEX.mirante.descentStairsSourceBounds,
    );
    const lateralPad = miranteComplexSourceBoundsToLocal([
      MIRANTE_COMPLEX.lateralStructure.sourceBounds[0],
      MIRANTE_COMPLEX.lateralStructure.sourceBounds[1],
      MIRANTE_COMPLEX.eastTerraceSourceMaxX,
      MIRANTE_COMPLEX.lateralStructure.sourceBounds[3],
    ]);
    const topY = MIRANTE_COMPLEX.levels.sidewalk;
    const roadY = MIRANTE_COMPLEX.levels.road;
    const landingY = MIRANTE_COMPLEX.levels.exporuralGround;
    const slabThickness = 0.03;
    const curbHeight = Math.max(0.04, topY - roadY);
    const tactileX = sidewalk.minX + MIRANTE_COMPLEX.sidewalk.tactileOffsetFromRoad;
    const landingTactileWidth = MIRANTE_COMPLEX.sidewalk.tactileWidth;

    return {
      concrete: [
        slab(sidewalk, topY, slabThickness),
        slab(apronEast, topY, slabThickness),
        slab(mirantePad, topY, slabThickness),
        slab(lateralPad, topY, slabThickness),
      ],
      curb: [
        {
          position: [
            sidewalk.minX + MIRANTE_COMPLEX.sidewalk.curbPaintWidth / 2,
            topY + 0.004,
            sidewalk.centerZ,
          ] as const,
          scale: [
            MIRANTE_COMPLEX.sidewalk.curbPaintWidth,
            0.01,
            sidewalk.depth,
          ] as const,
        },
        {
          position: [
            sidewalk.minX + 0.012,
            roadY + curbHeight / 2,
            sidewalk.centerZ,
          ] as const,
          scale: [0.024, curbHeight, sidewalk.depth] as const,
        },
        {
          position: [
            apronEast.centerX,
            topY + 0.004,
            apronEast.maxZ - MIRANTE_COMPLEX.sidewalk.curbPaintWidth / 2,
          ] as const,
          scale: [
            apronEast.width,
            0.01,
            MIRANTE_COMPLEX.sidewalk.curbPaintWidth,
          ] as const,
        },
      ],
      tactile: [
        {
          position: [tactileX, topY + 0.007, sidewalk.centerZ] as const,
          scale: [
            MIRANTE_COMPLEX.sidewalk.tactileWidth,
            0.012,
            sidewalk.depth * 0.97,
          ] as const,
        },
        {
          position: [
            northLanding.centerX,
            landingY + 0.008,
            northLanding.minZ + 0.08,
          ] as const,
          scale: [northLanding.width * 0.92, 0.012, landingTactileWidth] as const,
        },
      ],
    };
  }, []);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, opacity]);
  useEffect(() => () => {
    geometry.dispose();
    Object.values(materials).forEach((material) => material.dispose());
  }, [geometry, materials]);

  return (
    <group name="passeio-e-patio-conjunto-mirante" userData={SIDEWALK_USER_DATA} dispose={null}>
      <InstancedGround
        name="lajes-passeio-patio-mirante"
        items={surfaces.concrete}
        material={materials.concrete}
        geometry={geometry}
      />
      <InstancedGround
        name="meio-fio-pintado-conjunto-mirante"
        items={surfaces.curb}
        material={materials.curb}
        geometry={geometry}
      />
      <InstancedGround
        name="piso-tatil-conjunto-mirante"
        items={surfaces.tactile}
        material={materials.tactile}
        geometry={geometry}
      />
    </group>
  );
});
