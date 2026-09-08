import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  EXPORURAL_STEAKHOUSE_LAYOUT,
  EXPORURAL_STEAKHOUSE_REVISION,
  resolveExporuralSteakhouseDimensions,
} from '../../utils/exporuralSteakhouse';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

import { buildExporuralArchitecture } from '../../utils/exporuralArchitecture';
import { ExporuralActivity } from './ExporuralActivity';
import { useC4MotionPreference, c4ObjectVisible } from './useC4Motion';
import { c4RotorStep } from '../../utils/exporuralMotion';
import { ExporuralQa } from '../../diagnostics/ExporuralQa';

const NO_RAYCAST = () => undefined;

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
  selected: boolean;
  reducedGraphics: boolean;
  restroomOnClick?: (event: ThreeEvent<MouseEvent>) => void;
  compoundOnClick?: (event: ThreeEvent<MouseEvent>) => void;
  compoundOnDoubleClick?: (event: ThreeEvent<MouseEvent>) => void;
}

function useOwnedDisposable(resource: { dispose: () => void }) {
  useEffect(() => () => resource.dispose(), [resource]);
}

function ExporuralSign({
  dimensions: d,
}: {
  dimensions: ReturnType<typeof resolveExporuralSteakhouseDimensions>;
}) {
  const resources = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#263d39';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#ebe6d5';
    ctx.font = '600 35px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CHURRASCARIA', 256, 48);
    ctx.font = '600 33px sans-serif';
    ctx.fillText('E-06  •  BANHEIRO', 256, 108);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0,
    });
    const geometries = [0, 1].map((row) => {
      const geo = new THREE.PlaneGeometry(1, 1),
        uv = geo.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) + 1 - row) / 2);
      return geo;
    });
    return { texture, material, geometries };
  }, []);
  useEffect(
    () => () => {
      resources.texture.dispose();
      resources.material.dispose();
      resources.geometries.forEach((g) => g.dispose());
    },
    [resources],
  );
  return (
    <group name="identificacao-c4-e06" dispose={null}>
      <mesh
        geometry={resources.geometries[0]}
        material={resources.material}
        position={[
          d.mainOffsetX,
          0.055 + d.mainWallHeight * 0.79,
          -d.mainDepth / 2 - 0.022,
        ]}
        rotation={[0, Math.PI, 0]}
        scale={[d.mainWidth * 0.48, 0.07, 1]}
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <mesh
        geometry={resources.geometries[1]}
        material={resources.material}
        position={[
          d.annexCenterX,
          0.055 + d.annexWallHeight * 0.79,
          d.annexCenterZ + d.annexDepth / 2 + 0.023,
        ]}
        scale={[d.annexWidth * 0.62, 0.065, 1]}
        raycast={NO_RAYCAST}
        dispose={null}
      />
    </group>
  );
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
  const rotor = useRef<THREE.Group>(null);
  const viewportHeight = useThree((s) => s.size.height);
  const reducedMotion = useC4MotionPreference();
  const invalidate = useThree((s) => s.invalidate);
  const motion = useMemo(
    () => ({
      time: 0,
      frustum: new THREE.Frustum(),
      matrix: new THREE.Matrix4(),
      sphere: new THREE.Sphere(),
    }),
    [],
  );
  useEffect(() => {
    invalidate();
  }, [reducedMotion, invalidate]);
  useFrame(({ camera }, delta) => {
    if (
      !rotor.current ||
      reducedMotion ||
      !c4ObjectVisible(rotor.current, camera, motion, rotorRadius)
    )
      return;
    const distance = camera.position.distanceTo(motion.sphere.center);
    const projectedRadius =
      (rotorRadius *
        viewportHeight *
        camera.projectionMatrix.elements[5] *
        0.5) /
      Math.max(distance, 0.1);
    if (projectedRadius < 3) return;
    const step = c4RotorStep(motion.time, delta);
    motion.time = step.time;
    // Three blades lie in local XY. The shaft and rotation axis are local Z;
    // yaw belongs exclusively to the stationary parent nacelle.
    rotor.current.rotation.z =
      (rotor.current.rotation.z + step.angle) % (Math.PI * 2);
    invalidate();
  });
  const bladeThickness = Math.max(0.026, span * 0.014);
  const bladeRootEnd = rotorRadius * (turbine.bladeTipStartRatio + 0.015);
  const rootGeometry = useMemo(
    () =>
      createBladeSectionGeometry({
        startRadius: hubRadius * 0.68,
        endRadius: bladeRootEnd,
        startHalfWidth: hubRadius * 0.36,
        endHalfWidth: hubRadius * 0.12,
        startSweep: 0,
        endSweep: rotorRadius * 0.055,
        thickness: bladeThickness,
      }),
    [bladeRootEnd, bladeThickness, hubRadius, rotorRadius],
  );
  const tipGeometry = useMemo(
    () =>
      createBladeSectionGeometry({
        startRadius: bladeRootEnd * 0.985,
        endRadius: rotorRadius,
        startHalfWidth: hubRadius * 0.125,
        endHalfWidth: hubRadius * 0.045,
        startSweep: rotorRadius * 0.052,
        endSweep: rotorRadius * 0.12,
        thickness: bladeThickness,
      }),
    [bladeRootEnd, bladeThickness, hubRadius, rotorRadius],
  );
  const towerGeometry = useMemo(
    () =>
      new THREE.CylinderGeometry(
        span * turbine.topRadiusToSpan,
        span * turbine.bottomRadiusToSpan,
        towerHeight,
        16,
        1,
      ),
    [span, towerHeight, turbine.bottomRadiusToSpan, turbine.topRadiusToSpan],
  );
  const hubGeometry = useMemo(() => new THREE.SphereGeometry(1, 14, 10), []);
  const unitBox = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.42, -0.42);
    shape.lineTo(0.42, -0.42);
    shape.lineTo(0.42, 0.42);
    shape.lineTo(-0.42, 0.42);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.84,
      bevelEnabled: true,
      bevelSize: 0.08,
      bevelThickness: 0.08,
      bevelSegments: 1,
      steps: 1,
    });
    geometry.translate(0, 0, -0.42);
    return geometry;
  }, []);
  const unitCylinder = useMemo(
    () => new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    [],
  );
  const bladeItems = useMemo<readonly InstanceTransform[]>(
    () =>
      turbine.bladeAngles.map((angle) => ({
        position: [0, 0, 0],
        rotation: [0, 0, angle],
        scale: [1, 1, 1],
      })),
    [turbine.bladeAngles],
  );
  const nacelleWidth = span * turbine.nacelleSizeToSpan[0];
  const nacelleHeight = span * turbine.nacelleSizeToSpan[1];
  const nacelleLength = span * turbine.nacelleSizeToSpan[2];
  const rotorZ = -nacelleLength * 0.56;
  const towerBaseY = foundationHeight + 0.002;

  const flangeItems = useMemo<InstanceTransform[]>(
    () =>
      [0.01, 0.42, 0.83].map((ratio) => ({
        position: [0, towerBaseY + towerHeight * ratio, 0],
        scale: [
          span *
            (turbine.bottomRadiusToSpan * 2 +
              (turbine.topRadiusToSpan - turbine.bottomRadiusToSpan) *
                ratio *
                2 +
              0.012),
          0.022,
          span *
            (turbine.bottomRadiusToSpan * 2 +
              (turbine.topRadiusToSpan - turbine.bottomRadiusToSpan) *
                ratio *
                2 +
              0.012),
        ],
      })),
    [span, towerBaseY, towerHeight, turbine],
  );
  const serviceItems = useMemo<InstanceTransform[]>(
    () =>
      [
        {
          position: [0, -nacelleHeight * 0.62, 0],
          scale: [nacelleWidth * 1.2, 0.025, nacelleLength * 0.58],
        },
        ...[-1, 1].flatMap((sign) => [
          {
            position: [sign * nacelleWidth * 0.56, -nacelleHeight * 0.29, 0],
            scale: [0.009, 0.009, nacelleLength * 0.56],
          },
          ...[-1, 1].map((end) => ({
            position: [
              sign * nacelleWidth * 0.56,
              -nacelleHeight * 0.44,
              end * nacelleLength * 0.26,
            ],
            scale: [0.008, nacelleHeight * 0.34, 0.008],
          })),
        ]),
      ] as InstanceTransform[],
    [nacelleHeight, nacelleWidth, nacelleLength],
  );
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
      <SteakhouseInstances
        name="flanges-secoes-torre"
        geometry={unitCylinder}
        material={materials.metal}
        items={flangeItems}
      />
      <group
        name="nacelle-e-rotor-catavento"
        position={[0, towerBaseY + towerHeight, 0]}
        rotation={[0, turbine.yawRadians, 0]}
        dispose={null}
      >
        <SteakhouseInstances
          name="plataforma-servico-nacele"
          geometry={unitBox}
          material={materials.metal}
          items={serviceItems}
        />
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
        <group
          ref={rotor}
          name="rotor-eixo-local-z"
          position={[0, 0, rotorZ]}
          dispose={null}
        >
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
          />
          <SteakhouseInstances
            name="tres-pontas-vermelhas-catavento"
            geometry={tipGeometry}
            material={materials.accent}
            items={bladeItems}
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
  selected,
  reducedGraphics,
  compoundOnClick,
  restroomOnClick,
  compoundOnDoubleClick,
}: ExporuralSteakhouseProps) {
  const layout = EXPORURAL_STEAKHOUSE_LAYOUT;
  const boundsWidth = bounds.width;
  const boundsDepth = bounds.depth;
  const dimensions = useMemo(
    () =>
      resolveExporuralSteakhouseDimensions({
        width: boundsWidth,
        depth: boundsDepth,
      }),
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
  const annexEaveY = foundationHeight + dimensions.annexWallHeight;
  const annexRidgeY = annexEaveY + dimensions.annexRoofRise;
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

  const architecture = useMemo(
    () =>
      buildExporuralArchitecture(
        { width: boundsWidth, depth: boundsDepth },
        showDetail,
      ),
    [boundsWidth, boundsDepth, showDetail],
  );
  const roof = useRef<THREE.Group>(null);
  const roofMaterial = useMemo(() => {
    const source = materials.roof as THREE.MeshStandardMaterial;
    const copy = source.clone();
    // The selection/filter palette mutates these shared colours in place.
    // Only this sector's opacity is independent for the temporary cutaway.
    copy.color = source.color;
    copy.emissive = source.emissive;
    copy.onBeforeCompile = source.onBeforeCompile;
    copy.customProgramCacheKey = source.customProgramCacheKey;
    copy.transparent = true;
    return copy;
  }, [materials.roof]);
  useOwnedDisposable(roofMaterial);
  const gableGeometry = useMemo(() => {
    const vertices: number[] = [];
    const doubleSidedTriangle = (
      first: Vector3Tuple,
      second: Vector3Tuple,
      third: Vector3Tuple,
    ) => {
      vertices.push(
        ...first,
        ...second,
        ...third,
        ...third,
        ...second,
        ...first,
      );
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
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
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
        architecturalInterpretation: true,
        restroomHandlerAvailable: Boolean(restroomOnClick),
      }}
      dispose={null}
    >
      {import.meta.env.DEV && <ExporuralQa />}
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
            onClick={restroomOnClick}
            onDoubleClick={restroomOnClick}
            geometry={unitBox}
            material={compoundHitMaterial}
            position={[
              dimensions.annexCenterX,
              annexRidgeY / 2,
              dimensions.annexCenterZ,
            ]}
            scale={[dimensions.annexWidth, annexRidgeY, dimensions.annexDepth]}
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
            position={[dimensions.turbineCenterX, 0, dimensions.turbineCenterZ]}
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
      {Object.entries(architecture.batches).map(([finish, items]) => (
        <SteakhouseInstances
          key={finish}
          name={`arquitetura-c4-e06-${finish}`}
          geometry={unitBox}
          material={materials[finish as keyof ExporuralSteakhouseMaterials]}
          items={items}
          castShadow={
            finish === 'wall' || finish === 'roof' || finish === 'trim'
          }
          receiveShadow={finish !== 'glass'}
        />
      ))}
      <mesh
        name="empenas-fechadas-churrascaria-e-banheiro"
        geometry={gableGeometry}
        material={materials.wall}
        castShadow
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <group ref={roof} name="recorte-local-cobertura-noroeste" dispose={null}>
        <SteakhouseInstances
          name="cobertura-norte-metal-cinza-escuro"
          geometry={unitBox}
          material={roofMaterial}
          items={architecture.cutRoof}
          receiveShadow
        />
      </group>
      <ExporuralSign dimensions={dimensions} />
      <ExporuralActivity
        selected={selected}
        reducedGraphics={reducedGraphics}
        kitchen={architecture.kitchen}
        roof={roof}
        roofMaterial={roofMaterial}
      />
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
