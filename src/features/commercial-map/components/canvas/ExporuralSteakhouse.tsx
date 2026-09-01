import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { type ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  EXPORURAL_STEAKHOUSE_LAYOUT,
  EXPORURAL_STEAKHOUSE_REVISION,
  resolveExporuralSteakhouseDimensions,
} from '../../utils/exporuralSteakhouse';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

const NO_RAYCAST = () => undefined;
const NORTH_WINDOW_X_RATIOS = [-0.31, -0.09, 0.13] as const;
const EAST_WINDOW_Z_RATIOS = [-0.28, 0, 0.28] as const;

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
}

export interface ExporuralSteakhouseMaterials {
  wall: THREE.Material;
  accent: THREE.Material;
  roof: THREE.Material;
  trim: THREE.Material;
  dark: THREE.Material;
  glass: THREE.Material;
  white: THREE.Material;
  platform: THREE.Material;
  metal: THREE.Material;
}

export interface ExporuralSteakhouseProps {
  bounds: {
    width: number;
    depth: number;
  };
  height: number;
  materials: ExporuralSteakhouseMaterials;
  showDetail: boolean;
  compoundOnClick?: (event: ThreeEvent<MouseEvent>) => void;
  compoundOnDoubleClick?: (event: ThreeEvent<MouseEvent>) => void;
}

function useOwnedDisposable(resource: { dispose: () => void }) {
  useEffect(() => () => resource.dispose(), [resource]);
}

function SteakhouseInstances({
  name,
  geometry,
  material,
  items,
  castShadow = false,
  receiveShadow = false,
}: {
  name: string;
  geometry: THREE.BufferGeometry;
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

  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, material, instanceCount]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}

function createBladeSectionGeometry({
  startRadius,
  endRadius,
  startHalfWidth,
  endHalfWidth,
  startSweep,
  endSweep,
  thickness,
}: {
  startRadius: number;
  endRadius: number;
  startHalfWidth: number;
  endHalfWidth: number;
  startSweep: number;
  endSweep: number;
  thickness: number;
}) {
  const shape = new THREE.Shape();
  shape.moveTo(startRadius, startSweep - startHalfWidth);
  shape.bezierCurveTo(
    THREE.MathUtils.lerp(startRadius, endRadius, 0.34),
    THREE.MathUtils.lerp(startSweep, endSweep, 0.2) - startHalfWidth * 0.86,
    THREE.MathUtils.lerp(startRadius, endRadius, 0.72),
    THREE.MathUtils.lerp(startSweep, endSweep, 0.78) - endHalfWidth * 1.15,
    endRadius,
    endSweep - endHalfWidth,
  );
  shape.lineTo(endRadius, endSweep + endHalfWidth);
  shape.bezierCurveTo(
    THREE.MathUtils.lerp(startRadius, endRadius, 0.7),
    THREE.MathUtils.lerp(startSweep, endSweep, 0.75) + endHalfWidth * 1.12,
    THREE.MathUtils.lerp(startRadius, endRadius, 0.3),
    THREE.MathUtils.lerp(startSweep, endSweep, 0.18) + startHalfWidth * 0.88,
    startRadius,
    startSweep + startHalfWidth,
  );
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 3,
  });
  geometry.translate(0, 0, -thickness / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function WindTurbine({
  position,
  span,
  towerHeight,
  rotorRadius,
  hubRadius,
  foundationHeight,
  foundationDiameter,
  materials,
}: {
  position: readonly [number, number];
  span: number;
  towerHeight: number;
  rotorRadius: number;
  hubRadius: number;
  foundationHeight: number;
  foundationDiameter: number;
  materials: ExporuralSteakhouseMaterials;
}) {
  const turbine = EXPORURAL_STEAKHOUSE_LAYOUT.windTurbine;
  const bladeThickness = Math.max(0.026, span * 0.014);
  const bladeRootEnd = rotorRadius * (turbine.bladeTipStartRatio + 0.015);
  const rootGeometry = useMemo(() => createBladeSectionGeometry({
    startRadius: hubRadius * 0.68,
    endRadius: bladeRootEnd,
    startHalfWidth: hubRadius * 0.36,
    endHalfWidth: hubRadius * 0.12,
    startSweep: 0,
    endSweep: rotorRadius * 0.055,
    thickness: bladeThickness,
  }), [bladeRootEnd, bladeThickness, hubRadius, rotorRadius]);
  const tipGeometry = useMemo(() => createBladeSectionGeometry({
    startRadius: bladeRootEnd * 0.985,
    endRadius: rotorRadius,
    startHalfWidth: hubRadius * 0.125,
    endHalfWidth: hubRadius * 0.045,
    startSweep: rotorRadius * 0.052,
    endSweep: rotorRadius * 0.12,
    thickness: bladeThickness,
  }), [bladeRootEnd, bladeThickness, hubRadius, rotorRadius]);
  const towerGeometry = useMemo(() => new THREE.CylinderGeometry(
    span * turbine.topRadiusToSpan,
    span * turbine.bottomRadiusToSpan,
    towerHeight,
    16,
    1,
  ), [span, towerHeight, turbine.bottomRadiusToSpan, turbine.topRadiusToSpan]);
  const hubGeometry = useMemo(() => new THREE.SphereGeometry(1, 14, 10), []);
  const unitBox = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const unitCylinder = useMemo(() => new THREE.CylinderGeometry(0.5, 0.5, 1, 12), []);
  const bladeItems = useMemo<readonly InstanceTransform[]>(() => (
    turbine.bladeAngles.map((angle) => ({
      position: [0, 0, 0],
      rotation: [0, 0, angle],
      scale: [1, 1, 1],
    }))
  ), [turbine.bladeAngles]);
  const nacelleWidth = span * turbine.nacelleSizeToSpan[0];
  const nacelleHeight = span * turbine.nacelleSizeToSpan[1];
  const nacelleLength = span * turbine.nacelleSizeToSpan[2];
  const rotorZ = -nacelleLength * 0.56;
  const towerBaseY = foundationHeight + 0.002;

  useOwnedDisposable(rootGeometry);
  useOwnedDisposable(tipGeometry);
  useOwnedDisposable(towerGeometry);
  useOwnedDisposable(hubGeometry);
  useOwnedDisposable(unitBox);
  useOwnedDisposable(unitCylinder);

  return (
    <group
      name="catavento-moderno-churrascaria-exporural"
      position={[position[0], 0, position[1]]}
      userData={{
        featureType: 'MODERN_THREE_BLADE_WIND_TURBINE',
        bladeCount: turbine.bladeAngles.length,
        referenceDriven: true,
      }}
      dispose={null}
    >
      <mesh
        name="plinto-circular-catavento-sobre-lote-q-r-27"
        geometry={unitCylinder}
        material={materials.platform}
        position={[0, foundationHeight / 2, 0]}
        scale={[foundationDiameter, foundationHeight, foundationDiameter]}
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <mesh
        name="torre-cilindrica-catavento"
        geometry={towerGeometry}
        material={materials.metal}
        position={[0, towerBaseY + towerHeight / 2, 0]}
        castShadow
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <group
        name="nacelle-e-rotor-catavento"
        position={[0, towerBaseY + towerHeight, 0]}
        rotation={[0, turbine.yawRadians, 0]}
        dispose={null}
      >
        <mesh
          name="nacelle-branca-catavento"
          geometry={unitBox}
          material={materials.white}
          position={[0, nacelleHeight * 0.08, 0]}
          scale={[nacelleWidth, nacelleHeight, nacelleLength]}
          castShadow
          raycast={NO_RAYCAST}
          dispose={null}
        />
        <group position={[0, 0, rotorZ]} dispose={null}>
          <mesh
            name="eixo-rotor-catavento"
            geometry={unitCylinder}
            material={materials.metal}
            position={[0, 0, nacelleLength * 0.045]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[hubRadius * 0.46, nacelleLength * 0.18, hubRadius * 0.46]}
            castShadow
            raycast={NO_RAYCAST}
            dispose={null}
          />
          <SteakhouseInstances
            name="tres-pas-brancas-catavento"
            geometry={rootGeometry}
            material={materials.white}
            items={bladeItems}
            castShadow
          />
          <SteakhouseInstances
            name="tres-pontas-vermelhas-catavento"
            geometry={tipGeometry}
            material={materials.accent}
            items={bladeItems}
            castShadow
          />
          <mesh
            name="cubo-branco-catavento"
            geometry={hubGeometry}
            material={materials.white}
            scale={[hubRadius, hubRadius, hubRadius * 0.72]}
            castShadow
            raycast={NO_RAYCAST}
            dispose={null}
          />
        </group>
      </group>
    </group>
  );
}

export function ExporuralSteakhouse({
  bounds,
  height,
  materials,
  showDetail,
  compoundOnClick,
  compoundOnDoubleClick,
}: ExporuralSteakhouseProps) {
  const layout = EXPORURAL_STEAKHOUSE_LAYOUT;
  const boundsWidth = bounds.width;
  const boundsDepth = bounds.depth;
  const dimensions = useMemo(
    () => resolveExporuralSteakhouseDimensions({ width: boundsWidth, depth: boundsDepth }),
    [boundsDepth, boundsWidth],
  );
  const span = Math.max(boundsWidth, boundsDepth);
  const unitBox = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const compoundHitMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      depthWrite: false,
      toneMapped: false,
    });
    material.visible = false;
    material.colorWrite = false;
    return material;
  }, []);
  const foundationHeight = layout.mainBuilding.foundationHeight;
  const mainEaveY = foundationHeight + dimensions.mainWallHeight;
  const mainRidgeY = mainEaveY + dimensions.mainRoofRise;
  const mainRoofOverhang = span * 0.028;
  const mainRoofHalfRun = dimensions.mainWidth / 2 + mainRoofOverhang;
  const mainRoofPanelLength = Math.hypot(mainRoofHalfRun, dimensions.mainRoofRise);
  const mainRoofPitch = Math.atan2(dimensions.mainRoofRise, mainRoofHalfRun);
  const northRoofDepth = dimensions.mainDepth * layout.mainBuilding.northRoofShare;
  const southRoofDepth = dimensions.mainDepth - northRoofDepth;
  const northRoofCenterZ = -dimensions.mainDepth / 2 + northRoofDepth / 2;
  const southRoofCenterZ = dimensions.mainDepth / 2 - southRoofDepth / 2;
  const annexEaveY = foundationHeight + dimensions.annexWallHeight;
  const annexRidgeY = annexEaveY + dimensions.annexRoofRise;
  const annexRoofOverhang = span * 0.022;
  const annexRoofHalfRun = dimensions.annexDepth / 2 + annexRoofOverhang;
  const annexRoofPanelLength = Math.hypot(annexRoofHalfRun, dimensions.annexRoofRise);
  const annexRoofPitch = Math.atan2(dimensions.annexRoofRise, annexRoofHalfRun);
  const towerHeight = Math.min(
    dimensions.turbineTowerHeight,
    height - dimensions.turbineFoundationHeight - dimensions.turbineRotorRadius,
  );
  const turbineTowerBaseY = dimensions.turbineFoundationHeight + 0.002;
  const turbineTowerHitWidth = Math.max(
    span * layout.windTurbine.bottomRadiusToSpan * 3.2,
    span * 0.12,
  );
  const turbineRotorZ = -span * layout.windTurbine.nacelleSizeToSpan[2] * 0.56;
  const turbineRotorHitDepth = Math.max(0.08, span * 0.055);

  const platformItems = useMemo<readonly InstanceTransform[]>(() => [
    {
      position: [dimensions.mainOffsetX, foundationHeight / 2, 0],
      scale: [
        dimensions.mainWidth + mainRoofOverhang * 1.1,
        foundationHeight,
        dimensions.mainDepth + mainRoofOverhang * 1.1,
      ],
    },
    {
      position: [dimensions.annexCenterX, foundationHeight / 2, dimensions.annexCenterZ],
      scale: [
        dimensions.annexWidth + annexRoofOverhang * 1.25,
        foundationHeight,
        dimensions.annexDepth + annexRoofOverhang * 1.25,
      ],
    },
  ], [annexRoofOverhang, dimensions, foundationHeight, mainRoofOverhang]);
  const wallItems = useMemo<readonly InstanceTransform[]>(() => [
    {
      position: [
        dimensions.mainOffsetX,
        foundationHeight + dimensions.mainWallHeight / 2,
        0,
      ],
      scale: [dimensions.mainWidth, dimensions.mainWallHeight, dimensions.mainDepth],
    },
    {
      position: [
        dimensions.annexCenterX,
        foundationHeight + dimensions.annexWallHeight / 2,
        dimensions.annexCenterZ,
      ],
      scale: [dimensions.annexWidth, dimensions.annexWallHeight, dimensions.annexDepth],
    },
  ], [dimensions, foundationHeight]);
  const northRoofItems = useMemo<readonly InstanceTransform[]>(() => (
    [-1, 1].map((side) => ({
      position: [
        dimensions.mainOffsetX + side * mainRoofHalfRun / 2,
        mainEaveY + dimensions.mainRoofRise / 2,
        northRoofCenterZ,
      ],
      rotation: [0, 0, side > 0 ? -mainRoofPitch : mainRoofPitch],
      scale: [mainRoofPanelLength, span * 0.025, northRoofDepth + mainRoofOverhang * 2],
    }))
  ), [dimensions.mainOffsetX, dimensions.mainRoofRise, mainEaveY, mainRoofHalfRun, mainRoofOverhang, mainRoofPanelLength, mainRoofPitch, northRoofCenterZ, northRoofDepth, span]);
  const beigeRoofItems = useMemo<readonly InstanceTransform[]>(() => [
    ...[-1, 1].map((side) => ({
      position: [
        dimensions.mainOffsetX + side * mainRoofHalfRun / 2,
        mainEaveY + dimensions.mainRoofRise / 2,
        southRoofCenterZ,
      ] as Vector3Tuple,
      rotation: [0, 0, side > 0 ? -mainRoofPitch : mainRoofPitch] as Vector3Tuple,
      scale: [mainRoofPanelLength, span * 0.025, southRoofDepth + mainRoofOverhang * 2] as Vector3Tuple,
    })),
    ...[-1, 1].map((side) => ({
      position: [
        dimensions.annexCenterX,
        annexEaveY + dimensions.annexRoofRise / 2,
        dimensions.annexCenterZ + side * annexRoofHalfRun / 2,
      ] as Vector3Tuple,
      rotation: [side > 0 ? annexRoofPitch : -annexRoofPitch, 0, 0] as Vector3Tuple,
      scale: [
        dimensions.annexWidth + annexRoofOverhang * 2,
        span * 0.022,
        annexRoofPanelLength,
      ] as Vector3Tuple,
    })),
  ], [annexEaveY, annexRoofHalfRun, annexRoofOverhang, annexRoofPanelLength, annexRoofPitch, dimensions, mainEaveY, mainRoofHalfRun, mainRoofOverhang, mainRoofPanelLength, mainRoofPitch, southRoofCenterZ, southRoofDepth, span]);
  const windowItems = useMemo<readonly InstanceTransform[]>(() => [
    ...NORTH_WINDOW_X_RATIOS.map((ratio) => ({
      position: [
        dimensions.mainOffsetX + dimensions.mainWidth * ratio,
        foundationHeight + dimensions.mainWallHeight * 0.52,
        -dimensions.mainDepth / 2 - 0.026,
      ] as Vector3Tuple,
      scale: [
        dimensions.mainWidth * 0.145,
        dimensions.mainWallHeight * 0.32,
        0.04,
      ] as Vector3Tuple,
    })),
    ...EAST_WINDOW_Z_RATIOS.map((ratio) => ({
      position: [
        dimensions.mainOffsetX + dimensions.mainWidth / 2 + 0.026,
        foundationHeight + dimensions.mainWallHeight * 0.52,
        dimensions.mainDepth * ratio,
      ] as Vector3Tuple,
      scale: [
        0.04,
        dimensions.mainWallHeight * 0.32,
        dimensions.mainDepth * 0.16,
      ] as Vector3Tuple,
    })),
  ], [dimensions, foundationHeight]);
  const facadeItems = useMemo<readonly InstanceTransform[]>(() => [
    {
      position: [dimensions.mainOffsetX, mainEaveY - span * 0.085, -dimensions.mainDepth / 2 - 0.045],
      scale: [dimensions.mainWidth, span * 0.045, 0.055],
    },
    {
      position: [dimensions.mainOffsetX + dimensions.mainWidth / 2 + 0.045, mainEaveY - span * 0.085, 0],
      scale: [0.055, span * 0.045, dimensions.mainDepth],
    },
    {
      position: [dimensions.annexCenterX, annexEaveY - span * 0.065, dimensions.annexCenterZ + dimensions.annexDepth / 2 + 0.035],
      scale: [dimensions.annexWidth, span * 0.038, 0.045],
    },
  ], [annexEaveY, dimensions, mainEaveY, span]);
  const frameItems = useMemo<readonly InstanceTransform[]>(() => showDetail ? [
    ...NORTH_WINDOW_X_RATIOS.flatMap((ratio) => {
      const x = dimensions.mainOffsetX + dimensions.mainWidth * ratio;
      const y = foundationHeight + dimensions.mainWallHeight * 0.52;
      const z = -dimensions.mainDepth / 2 - 0.052;
      return [
        { position: [x, y, z], scale: [0.022, dimensions.mainWallHeight * 0.34, 0.025] },
        { position: [x, y, z], scale: [dimensions.mainWidth * 0.15, 0.022, 0.025] },
      ] as InstanceTransform[];
    }),
    ...EAST_WINDOW_Z_RATIOS.flatMap((ratio) => {
      const x = dimensions.mainOffsetX + dimensions.mainWidth / 2 + 0.052;
      const y = foundationHeight + dimensions.mainWallHeight * 0.52;
      const z = dimensions.mainDepth * ratio;
      return [
        { position: [x, y, z], scale: [0.025, dimensions.mainWallHeight * 0.34, 0.022] },
        { position: [x, y, z], scale: [0.025, 0.022, dimensions.mainDepth * 0.165] },
      ] as InstanceTransform[];
    }),
  ] : [], [dimensions, foundationHeight, showDetail]);
  const darkItems = useMemo<readonly InstanceTransform[]>(() => [
    {
      position: [dimensions.mainOffsetX, mainEaveY + 0.018, -dimensions.mainDepth / 2 - mainRoofOverhang],
      scale: [dimensions.mainWidth + mainRoofOverhang * 2, span * 0.035, 0.05],
    },
    {
      position: [dimensions.mainOffsetX, mainEaveY + 0.018, dimensions.mainDepth / 2 + mainRoofOverhang],
      scale: [dimensions.mainWidth + mainRoofOverhang * 2, span * 0.035, 0.05],
    },
    {
      position: [dimensions.mainOffsetX - dimensions.mainWidth * 0.34, foundationHeight + dimensions.mainWallHeight * 0.38, -dimensions.mainDepth / 2 - 0.03],
      scale: [dimensions.mainWidth * 0.17, dimensions.mainWallHeight * 0.7, 0.045],
    },
    {
      position: [dimensions.annexCenterX, foundationHeight + dimensions.annexWallHeight * 0.39, dimensions.annexCenterZ + dimensions.annexDepth / 2 + 0.03],
      scale: [dimensions.annexWidth * 0.27, dimensions.annexWallHeight * 0.72, 0.045],
    },
    ...frameItems,
  ], [dimensions, foundationHeight, frameItems, mainEaveY, mainRoofOverhang, span]);
  const northRoofRibs = useMemo<readonly InstanceTransform[]>(() => showDetail
    ? [-1, 1].flatMap((side) => Array.from({ length: 5 }, (_, index) => {
        const progress = 0.16 + index * 0.19;
        return {
          position: [
            dimensions.mainOffsetX + side * mainRoofHalfRun * progress,
            mainRidgeY - dimensions.mainRoofRise * progress + 0.018,
            northRoofCenterZ,
          ] as Vector3Tuple,
          rotation: [0, 0, side > 0 ? -mainRoofPitch : mainRoofPitch] as Vector3Tuple,
          scale: [span * 0.012, span * 0.018, northRoofDepth + mainRoofOverhang * 1.8] as Vector3Tuple,
        };
      }))
    : [], [dimensions.mainOffsetX, dimensions.mainRoofRise, mainRidgeY, mainRoofHalfRun, mainRoofOverhang, mainRoofPitch, northRoofCenterZ, northRoofDepth, showDetail, span]);
  const beigeRoofRibs = useMemo<readonly InstanceTransform[]>(() => showDetail
    ? [
        ...[-1, 1].flatMap((side) => Array.from({ length: 5 }, (_, index) => {
          const progress = 0.16 + index * 0.19;
          return {
            position: [
              dimensions.mainOffsetX + side * mainRoofHalfRun * progress,
              mainRidgeY - dimensions.mainRoofRise * progress + 0.018,
              southRoofCenterZ,
            ] as Vector3Tuple,
            rotation: [0, 0, side > 0 ? -mainRoofPitch : mainRoofPitch] as Vector3Tuple,
            scale: [span * 0.012, span * 0.018, southRoofDepth + mainRoofOverhang * 1.8] as Vector3Tuple,
          };
        })),
        ...[-1, 1].flatMap((side) => Array.from({ length: 3 }, (_, index) => {
          const progress = 0.22 + index * 0.28;
          return {
            position: [
              dimensions.annexCenterX,
              annexRidgeY - dimensions.annexRoofRise * progress + 0.016,
              dimensions.annexCenterZ + side * annexRoofHalfRun * progress,
            ] as Vector3Tuple,
            rotation: [side > 0 ? annexRoofPitch : -annexRoofPitch, 0, 0] as Vector3Tuple,
            scale: [dimensions.annexWidth + annexRoofOverhang * 1.8, span * 0.016, span * 0.011] as Vector3Tuple,
          };
        })),
      ]
    : [], [annexRidgeY, annexRoofHalfRun, annexRoofOverhang, annexRoofPitch, dimensions, mainRidgeY, mainRoofHalfRun, mainRoofOverhang, mainRoofPitch, showDetail, southRoofCenterZ, southRoofDepth, span]);
  const gableGeometry = useMemo(() => {
    const vertices: number[] = [];
    const doubleSidedTriangle = (
      first: Vector3Tuple,
      second: Vector3Tuple,
      third: Vector3Tuple,
    ) => {
      vertices.push(...first, ...second, ...third, ...third, ...second, ...first);
    };
    const mainWestX = dimensions.mainOffsetX - dimensions.mainWidth / 2;
    const mainEastX = dimensions.mainOffsetX + dimensions.mainWidth / 2;
    const mainNorthZ = -dimensions.mainDepth / 2;
    const mainSouthZ = dimensions.mainDepth / 2;
    const annexWestX = dimensions.annexCenterX - dimensions.annexWidth / 2;
    const annexEastX = dimensions.annexCenterX + dimensions.annexWidth / 2;
    const annexNorthZ = dimensions.annexCenterZ - dimensions.annexDepth / 2;
    const annexSouthZ = dimensions.annexCenterZ + dimensions.annexDepth / 2;

    doubleSidedTriangle(
      [mainWestX, mainEaveY, mainNorthZ],
      [mainEastX, mainEaveY, mainNorthZ],
      [dimensions.mainOffsetX, mainRidgeY, mainNorthZ],
    );
    doubleSidedTriangle(
      [mainWestX, mainEaveY, mainSouthZ],
      [mainEastX, mainEaveY, mainSouthZ],
      [dimensions.mainOffsetX, mainRidgeY, mainSouthZ],
    );
    doubleSidedTriangle(
      [annexWestX, annexEaveY, annexNorthZ],
      [annexWestX, annexEaveY, annexSouthZ],
      [annexWestX, annexRidgeY, dimensions.annexCenterZ],
    );
    doubleSidedTriangle(
      [annexEastX, annexEaveY, annexNorthZ],
      [annexEastX, annexEaveY, annexSouthZ],
      [annexEastX, annexRidgeY, dimensions.annexCenterZ],
    );

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }, [annexEaveY, annexRidgeY, dimensions, mainEaveY, mainRidgeY]);

  useOwnedDisposable(unitBox);
  useOwnedDisposable(compoundHitMaterial);
  useOwnedDisposable(gableGeometry);

  return (
    <group
      name="churrascaria-exporural-com-catavento"
      userData={{
        classification: 'LANDMARK',
        featureType: 'EXPORURAL_STEAKHOUSE',
        officialEntityIdentifier: layout.officialEntityIdentifier,
        referenceRevision: EXPORURAL_STEAKHOUSE_REVISION,
        primaryDrawCalls: showDetail ? 17 : 15,
      }}
      dispose={null}
    >
      {compoundOnClick && (
        <group
          name="hit-volumes-compostos-churrascaria-exporural"
          onClick={compoundOnClick}
          onDoubleClick={compoundOnDoubleClick}
          userData={{
            selectsOfficialEntityIdentifier: layout.officialEntityIdentifier,
            presentationOnly: true,
          }}
          dispose={null}
        >
          <mesh
            name="hit-volume-anexo-churrascaria-exporural"
            geometry={unitBox}
            material={compoundHitMaterial}
            position={[
              dimensions.annexCenterX,
              annexRidgeY / 2,
              dimensions.annexCenterZ,
            ]}
            scale={[
              dimensions.annexWidth,
              annexRidgeY,
              dimensions.annexDepth,
            ]}
            dispose={null}
          />
          <mesh
            name="hit-volume-torre-catavento-exporural"
            geometry={unitBox}
            material={compoundHitMaterial}
            position={[
              dimensions.turbineCenterX,
              turbineTowerBaseY + towerHeight / 2,
              dimensions.turbineCenterZ,
            ]}
            scale={[turbineTowerHitWidth, towerHeight, turbineTowerHitWidth]}
            dispose={null}
          />
          <group
            position={[
              dimensions.turbineCenterX,
              0,
              dimensions.turbineCenterZ,
            ]}
            rotation={[0, layout.windTurbine.yawRadians, 0]}
            dispose={null}
          >
            <mesh
              name="hit-volume-rotor-catavento-exporural"
              geometry={unitBox}
              material={compoundHitMaterial}
              position={[0, turbineTowerBaseY + towerHeight, turbineRotorZ]}
              scale={[
                dimensions.turbineRotorRadius * 2.08,
                dimensions.turbineRotorRadius * 2.08,
                turbineRotorHitDepth,
              ]}
              dispose={null}
            />
          </group>
        </group>
      )}
      <SteakhouseInstances
        name="bases-churrascaria-e-anexo"
        geometry={unitBox}
        material={materials.platform}
        items={platformItems}
        receiveShadow
      />
      <SteakhouseInstances
        name="paredes-cinza-escuras-churrascaria-e-banheiro"
        geometry={unitBox}
        material={materials.wall}
        items={wallItems}
        castShadow
        receiveShadow
      />
      <mesh
        name="empenas-fechadas-churrascaria-e-banheiro"
        geometry={gableGeometry}
        material={materials.wall}
        castShadow
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <SteakhouseInstances
        name="cobertura-norte-metal-cinza-escuro"
        geometry={unitBox}
        material={materials.roof}
        items={northRoofItems}
        castShadow
        receiveShadow
      />
      <SteakhouseInstances
        name="cobertura-sul-e-anexo-bege"
        geometry={unitBox}
        material={materials.trim}
        items={beigeRoofItems}
        castShadow
        receiveShadow
      />
      <SteakhouseInstances
        name="faixa-clara-fachadas-churrascaria"
        geometry={unitBox}
        material={materials.white}
        items={facadeItems}
      />
      <SteakhouseInstances
        name="janelas-churrascaria-exporural"
        geometry={unitBox}
        material={materials.glass}
        items={windowItems}
      />
      <SteakhouseInstances
        name="fascias-portas-e-caixilhos-charcoal"
        geometry={unitBox}
        material={materials.dark}
        items={darkItems}
        castShadow
      />
      {showDetail && (
        <>
          <SteakhouseInstances
            name="frisos-cobertura-norte"
            geometry={unitBox}
            material={materials.roof}
            items={northRoofRibs}
          />
          <SteakhouseInstances
            name="frisos-cobertura-sul-e-banheiro"
            geometry={unitBox}
            material={materials.trim}
            items={beigeRoofRibs}
          />
        </>
      )}
      <WindTurbine
        position={[dimensions.turbineCenterX, dimensions.turbineCenterZ]}
        span={span}
        towerHeight={towerHeight}
        rotorRadius={dimensions.turbineRotorRadius}
        hubRadius={dimensions.turbineHubRadius}
        foundationHeight={dimensions.turbineFoundationHeight}
        foundationDiameter={dimensions.turbineFoundationDiameter}
        materials={materials}
      />
    </group>
  );
}
