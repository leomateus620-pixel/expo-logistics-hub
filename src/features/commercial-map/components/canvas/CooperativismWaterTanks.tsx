import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  COOPERATIVISM_WATER_TANK_LAYOUT,
  createCooperativismWaterTankLayout,
  type CooperativismHostBounds,
} from '../../utils/cooperativismWaterTanks';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

const NO_RAYCAST = () => undefined;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const BAKOF_CYLINDER = new THREE.CylinderGeometry(1, 0.87, 1, 18);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

type Vector3Tuple = [number, number, number];

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
    if (!ref.current) return;
    const object = new THREE.Object3D();
    items.forEach((item, index) => {
      if (item.matrix) {
        ref.current?.setMatrixAt(index, item.matrix);
        return;
      }
      object.position.set(...(item.position ?? [0, 0, 0]));
      object.rotation.set(...(item.rotation ?? [0, 0, 0]));
      object.scale.set(...(item.scale ?? [1, 1, 1]));
      object.updateMatrix();
      ref.current?.setMatrixAt(index, object.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingBox();
    ref.current.computeBoundingSphere();
  }, [items]);
  useEffect(() => {
    const mesh = ref.current;
    return () => disposeInstancedMesh(mesh);
  }, [items.length]);
  if (items.length === 0) return null;
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

function beam(
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

function createBakofTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = COOPERATIVISM_WATER_TANK_LAYOUT.palette.bakofBlue;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = COOPERATIVISM_WATER_TANK_LAYOUT.palette.bakofBlueDeep;
  for (let index = 0; index < 9; index += 1) {
    const y = 18 + index * 26;
    context.fillRect(0, y, canvas.width, 5);
  }
  context.fillStyle = COOPERATIVISM_WATER_TANK_LAYOUT.palette.bakofLetter;
  context.font = '800 92px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('BAKOF', canvas.width / 2, canvas.height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'CooperativismTanks:bakof-lettering';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.needsUpdate = true;
  return texture;
}

function latticeForTower(
  origin: CoordinateLike,
  width: number,
  height: number,
  levels: number,
  thickness: number,
): InstanceTransform[] {
  const half = width / 2;
  const corners: readonly CoordinateLike[] = [
    [origin[0] - half, origin[1] - half],
    [origin[0] + half, origin[1] - half],
    [origin[0] + half, origin[1] + half],
    [origin[0] - half, origin[1] + half],
  ];
  const items: InstanceTransform[] = [];
  corners.forEach(([x, z]) => {
    items.push({
      position: [x, height / 2, z],
      scale: [thickness * 1.15, height, thickness * 1.15],
    });
  });
  for (let level = 0; level <= levels; level += 1) {
    const y = (height * level) / levels;
    for (let corner = 0; corner < 4; corner += 1) {
      const current = corners[corner];
      const next = corners[(corner + 1) % 4];
      items.push(beam(
        [current[0], y, current[1]],
        [next[0], y, next[1]],
        thickness,
      ));
    }
  }
  for (let level = 0; level < levels; level += 1) {
    const y0 = (height * level) / levels;
    const y1 = (height * (level + 1)) / levels;
    for (let corner = 0; corner < 4; corner += 1) {
      const current = corners[corner];
      const next = corners[(corner + 1) % 4];
      items.push(beam(
        [current[0], y0, current[1]],
        [next[0], y1, next[1]],
        thickness * 0.82,
      ));
      items.push(beam(
        [next[0], y0, next[1]],
        [current[0], y1, current[1]],
        thickness * 0.82,
      ));
    }
  }
  return items;
}

type CoordinateLike = readonly [number, number];

export function CooperativismWaterTanks({
  bounds,
  showDetail,
  reducedGraphics = false,
}: {
  bounds: CooperativismHostBounds;
  showDetail: boolean;
  reducedGraphics?: boolean;
}) {
  const layout = useMemo(() => createCooperativismWaterTankLayout(bounds), [bounds]);
  const braceLevels = reducedGraphics ? Math.max(2, layout.tower.braceLevels - 2) : layout.tower.braceLevels;
  const palette = COOPERATIVISM_WATER_TANK_LAYOUT.palette;

  const materials = useMemo(() => {
    const bakofMap = createBakofTexture();
    return {
      steel: new THREE.MeshStandardMaterial({
        color: palette.rustedSteel,
        roughness: 0.82,
        metalness: 0.38,
      }),
      steelDark: new THREE.MeshStandardMaterial({
        color: palette.rustedSteelDark,
        roughness: 0.78,
        metalness: 0.42,
      }),
      concrete: new THREE.MeshStandardMaterial({
        color: palette.concrete,
        roughness: 0.97,
        metalness: 0,
      }),
      bakof: new THREE.MeshStandardMaterial({
        color: bakofMap ? '#ffffff' : palette.bakofBlue,
        map: bakofMap,
        roughness: 0.62,
        metalness: 0.04,
        side: THREE.DoubleSide,
      }),
      bakofBody: new THREE.MeshStandardMaterial({
        color: palette.bakofBlue,
        roughness: 0.58,
        metalness: 0.04,
      }),
      bakofLid: new THREE.MeshStandardMaterial({
        color: palette.bakofBlueDeep,
        roughness: 0.58,
        metalness: 0.06,
      }),
      charcoal: new THREE.MeshStandardMaterial({
        color: palette.charcoal,
        roughness: 0.88,
        metalness: 0.22,
      }),
      galvanized: new THREE.MeshStandardMaterial({
        color: palette.galvanized,
        roughness: 0.54,
        metalness: 0.46,
      }),
      rust: new THREE.MeshStandardMaterial({
        color: palette.galvanizedRust,
        roughness: 0.86,
        metalness: 0.2,
      }),
      walkway: new THREE.MeshStandardMaterial({
        color: palette.walkway,
        roughness: 0.84,
        metalness: 0.28,
      }),
      map: bakofMap,
    };
  }, [palette]);

  useEffect(() => () => {
    materials.steel.dispose();
    materials.steelDark.dispose();
    materials.concrete.dispose();
    materials.bakof.dispose();
    materials.bakofBody.dispose();
    materials.bakofLid.dispose();
    materials.charcoal.dispose();
    materials.galvanized.dispose();
    materials.rust.dispose();
    materials.walkway.dispose();
    materials.map?.dispose();
  }, [materials]);

  const lattice = useMemo(
    () => layout.tanks.flatMap((tank) => latticeForTower(
      tank.localOffset,
      tank.towerWidth,
      tank.towerHeight,
      braceLevels,
      layout.tower.steelThickness,
    )),
    [braceLevels, layout],
  );

  const pads = useMemo<InstanceTransform[]>(() => layout.tanks.map((tank) => ({
    position: [tank.localOffset[0], tank.padThickness / 2, tank.localOffset[1]],
    scale: [tank.padSize, tank.padThickness, tank.padSize],
  })), [layout.tanks]);

  const platforms = useMemo<InstanceTransform[]>(() => layout.tanks.map((tank) => {
    const size = tank.towerWidth + layout.tower.platformOverhang * 2;
    return {
      position: [tank.localOffset[0], tank.towerHeight + layout.tower.platformThickness / 2, tank.localOffset[1]],
      scale: [size, layout.tower.platformThickness, size],
    };
  }), [layout]);

  const walkway = useMemo<InstanceTransform[]>(() => {
    const items: InstanceTransform[] = [];
    const deckY = layout.tanks[0].towerHeight + layout.tower.platformThickness + layout.walkway.deckThickness / 2;
    layout.walkway.segments.forEach((segment) => {
      const yaw = Math.atan2(segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]);
      items.push({
        position: [segment.center[0], deckY, segment.center[1]],
        scale: [layout.walkway.width, layout.walkway.deckThickness, segment.length],
        rotation: [0, yaw, 0],
      });
      const railY = deckY + layout.walkway.railHeight / 2;
      [-1, 1].forEach((side) => {
        const lateral = layout.walkway.width / 2;
        const sideX = segment.center[0] + Math.cos(yaw) * side * lateral;
        const sideZ = segment.center[1] - Math.sin(yaw) * side * lateral;
        items.push({
          position: [sideX, railY, sideZ],
          scale: [layout.walkway.railThickness, layout.walkway.railHeight, segment.length],
          rotation: [0, yaw, 0],
        });
      });
    });
    return items;
  }, [layout]);

  const ribs = useMemo<InstanceTransform[]>(() => {
    if (!showDetail) return [];
    const bakof = layout.tanks.find((tank) => tank.role === 'bakof-blue');
    if (!bakof) return [];
    const spec = COOPERATIVISM_WATER_TANK_LAYOUT.tanks.bakof;
    const height = spec.heightMeters * COOPERATIVISM_WATER_TANK_LAYOUT.mapUnitsPerMeter;
    const baseY = bakof.platformY;
    return Array.from({ length: spec.ribCount }, (_, index) => {
      const t = (index + 0.5) / spec.ribCount;
      const radius = (spec.bottomRadiusMeters + (spec.topRadiusMeters - spec.bottomRadiusMeters) * t)
        * COOPERATIVISM_WATER_TANK_LAYOUT.mapUnitsPerMeter;
      return {
        position: [bakof.localOffset[0], baseY + height * t, bakof.localOffset[1]] as Vector3Tuple,
        scale: [radius * 2.04, height * 0.028, radius * 2.04] as Vector3Tuple,
      };
    });
  }, [layout.tanks, showDetail]);

  const rustBands = useMemo<InstanceTransform[]>(() => {
    if (!showDetail) return [];
    const tank = layout.tanks.find((item) => item.role === 'galvanized-rust');
    if (!tank) return [];
    const spec = COOPERATIVISM_WATER_TANK_LAYOUT.tanks.galvanized;
    const height = spec.heightMeters * COOPERATIVISM_WATER_TANK_LAYOUT.mapUnitsPerMeter;
    const radius = spec.radiusMeters * COOPERATIVISM_WATER_TANK_LAYOUT.mapUnitsPerMeter;
    return [0.18, 0.47, 0.78].map((t) => ({
      position: [tank.localOffset[0], tank.platformY + height * t, tank.localOffset[1]] as Vector3Tuple,
      scale: [radius * 2.05, height * 0.045, radius * 2.05] as Vector3Tuple,
    }));
  }, [layout.tanks, showDetail]);

  const charcoalSeams = useMemo<InstanceTransform[]>(() => {
    if (!showDetail) return [];
    const tank = layout.tanks.find((item) => item.role === 'charcoal-steel');
    if (!tank) return [];
    const spec = COOPERATIVISM_WATER_TANK_LAYOUT.tanks.charcoal;
    const height = spec.heightMeters * COOPERATIVISM_WATER_TANK_LAYOUT.mapUnitsPerMeter;
    const radius = spec.radiusMeters * COOPERATIVISM_WATER_TANK_LAYOUT.mapUnitsPerMeter;
    return [-0.35, 0, 0.35].map((angle) => ({
      position: [
        tank.localOffset[0] + Math.sin(angle) * radius,
        tank.platformY + height / 2,
        tank.localOffset[1] + Math.cos(angle) * radius,
      ] as Vector3Tuple,
      scale: [radius * 0.045, height * 0.96, radius * 0.045] as Vector3Tuple,
    }));
  }, [layout.tanks, showDetail]);

  const bakof = layout.tanks.find((tank) => tank.role === 'bakof-blue')!;
  const charcoal = layout.tanks.find((tank) => tank.role === 'charcoal-steel')!;
  const galvanized = layout.tanks.find((tank) => tank.role === 'galvanized-rust')!;
  const bakofHeight = COOPERATIVISM_WATER_TANK_LAYOUT.tanks.bakof.heightMeters
    * COOPERATIVISM_WATER_TANK_LAYOUT.mapUnitsPerMeter;
  const bakofTopRadius = COOPERATIVISM_WATER_TANK_LAYOUT.tanks.bakof.topRadiusMeters
    * COOPERATIVISM_WATER_TANK_LAYOUT.mapUnitsPerMeter;
  const charcoalHeight = COOPERATIVISM_WATER_TANK_LAYOUT.tanks.charcoal.heightMeters
    * COOPERATIVISM_WATER_TANK_LAYOUT.mapUnitsPerMeter;
  const charcoalRadius = COOPERATIVISM_WATER_TANK_LAYOUT.tanks.charcoal.radiusMeters
    * COOPERATIVISM_WATER_TANK_LAYOUT.mapUnitsPerMeter;
  const galvanizedHeight = COOPERATIVISM_WATER_TANK_LAYOUT.tanks.galvanized.heightMeters
    * COOPERATIVISM_WATER_TANK_LAYOUT.mapUnitsPerMeter;
  const galvanizedRadius = COOPERATIVISM_WATER_TANK_LAYOUT.tanks.galvanized.radiusMeters
    * COOPERATIVISM_WATER_TANK_LAYOUT.mapUnitsPerMeter;

  return (
    <group name={COOPERATIVISM_WATER_TANK_LAYOUT.groupName} raycast={NO_RAYCAST} dispose={null}>
      <ScaledInstances material={materials.concrete} items={pads} receiveShadow />
      <ScaledInstances material={materials.steel} items={lattice} castShadow={!reducedGraphics} receiveShadow />
      <ScaledInstances material={materials.steelDark} items={platforms} castShadow={!reducedGraphics} receiveShadow />
      <ScaledInstances material={materials.walkway} items={walkway} castShadow={!reducedGraphics} />

      <mesh
        name="caixa-dagua-bakof"
        geometry={BAKOF_CYLINDER}
        material={materials.bakofBody}
        position={[bakof.localOffset[0], bakof.platformY + bakofHeight / 2, bakof.localOffset[1]]}
        scale={[bakofTopRadius, bakofHeight, bakofTopRadius]}
        rotation={[0, Math.PI / 2, 0]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <mesh
        geometry={UNIT_CYLINDER}
        material={materials.bakofLid}
        position={[bakof.localOffset[0], bakof.platformY + bakofHeight + 0.012, bakof.localOffset[1]]}
        scale={[bakofTopRadius * 2.08, 0.028, bakofTopRadius * 2.08]}
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <mesh
        name="caixa-dagua-bakof-lettering"
        geometry={UNIT_PLANE}
        material={materials.bakof}
        position={[
          bakof.localOffset[0] - bakofTopRadius * 0.92,
          bakof.platformY + bakofHeight * 0.52,
          bakof.localOffset[1],
        ]}
        rotation={[0, -Math.PI / 2, 0]}
        scale={[bakofTopRadius * 1.65, bakofHeight * 0.28, 1]}
        raycast={NO_RAYCAST}
        dispose={null}
      />

      <mesh
        name="caixa-dagua-charcoal"
        geometry={UNIT_CYLINDER}
        material={materials.charcoal}
        position={[charcoal.localOffset[0], charcoal.platformY + charcoalHeight / 2, charcoal.localOffset[1]]}
        scale={[charcoalRadius * 2, charcoalHeight, charcoalRadius * 2]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <mesh
        geometry={UNIT_CYLINDER}
        material={materials.steelDark}
        position={[charcoal.localOffset[0], charcoal.platformY + charcoalHeight + 0.012, charcoal.localOffset[1]]}
        scale={[charcoalRadius * 2.08, 0.026, charcoalRadius * 2.08]}
        raycast={NO_RAYCAST}
        dispose={null}
      />

      <mesh
        name="caixa-dagua-galvanized"
        geometry={UNIT_CYLINDER}
        material={materials.galvanized}
        position={[galvanized.localOffset[0], galvanized.platformY + galvanizedHeight / 2, galvanized.localOffset[1]]}
        scale={[galvanizedRadius * 2, galvanizedHeight, galvanizedRadius * 2]}
        castShadow={!reducedGraphics}
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <mesh
        geometry={UNIT_CYLINDER}
        material={materials.rust}
        position={[galvanized.localOffset[0], galvanized.platformY + galvanizedHeight + 0.012, galvanized.localOffset[1]]}
        scale={[galvanizedRadius * 2.08, 0.026, galvanizedRadius * 2.08]}
        raycast={NO_RAYCAST}
        dispose={null}
      />

      {showDetail && (
        <>
          <ScaledInstances material={materials.bakofLid} items={ribs} />
          <ScaledInstances material={materials.rust} items={rustBands} />
          <ScaledInstances material={materials.steelDark} items={charcoalSeams} />
        </>
      )}
    </group>
  );
}
