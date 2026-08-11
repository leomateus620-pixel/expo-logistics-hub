import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AlvoradaQualityProfile } from '../capabilities';
import { useAlvoradaTimeline } from '../TimelineContext';
import { smoothRange } from '../timeline';
import { createBuildingFacadeTextures, createTerrainTexture, seededRandom } from '../visualTextures';

interface SantaRosaCityProps {
  quality: AlvoradaQualityProfile;
}

type RoadClass = 'p' | 's' | 't' | 'r' | 'u';

interface SantaRosaRoad {
  c: RoadClass;
  p: Array<[number, number]>;
}

interface SantaRosaRoadDataset {
  roads: SantaRosaRoad[];
}

interface BuildingPlacement {
  color: THREE.Color;
  depth: number;
  height: number;
  position: THREE.Vector3;
  rotation: number;
  width: number;
}

interface ScoredBuildingPlacement extends BuildingPlacement {
  score: number;
}

interface RoadPlacement {
  color: THREE.Color;
  length: number;
  position: THREE.Vector3;
  rotation: number;
  width: number;
}

interface TreePlacement {
  position: THREE.Vector3;
  scale: number;
}

const ROAD_DATA_URL = '/alvorada/santa-rosa-roads.json';

function terrainHeight(x: number, z: number) {
  return (
    Math.sin(x * 0.09) * 0.32
    + Math.cos(z * 0.065) * 0.46
    + Math.sin((x + z) * 0.035) * 0.27
    - Math.exp(-((x * x) + ((z - 1) * (z - 1))) / 240) * 0.28
  );
}

function roadWidth(roadClass: RoadClass) {
  if (roadClass === 'p') return 0.42;
  if (roadClass === 's') return 0.34;
  if (roadClass === 't') return 0.28;
  return roadClass === 'r' ? 0.19 : 0.14;
}

function roadColor(roadClass: RoadClass) {
  if (roadClass === 'p' || roadClass === 's') return new THREE.Color('#3a4143');
  if (roadClass === 't') return new THREE.Color('#444a4b');
  return new THREE.Color('#515553');
}

function createRoadPlacements(roads: SantaRosaRoad[], mobile: boolean) {
  const placements: RoadPlacement[] = [];

  roads.forEach((road, roadIndex) => {
    if (mobile && road.c === 'u' && roadIndex % 3 !== 0) return;
    for (let index = 1; index < road.p.length; index += 1) {
      const [startX, startZ] = road.p[index - 1];
      const [endX, endZ] = road.p[index];
      const deltaX = endX - startX;
      const deltaZ = endZ - startZ;
      const length = Math.hypot(deltaX, deltaZ);
      if (length < 0.08) continue;
      const x = (startX + endX) / 2;
      const z = (startZ + endZ) / 2;
      placements.push({
        color: roadColor(road.c),
        length,
        position: new THREE.Vector3(
          x,
          (terrainHeight(startX, startZ) + terrainHeight(endX, endZ)) / 2 + 0.055,
          z,
        ),
        rotation: Math.atan2(deltaX, deltaZ),
        width: roadWidth(road.c),
      });
    }
  });

  return placements;
}

function createCityPlacements(quality: AlvoradaQualityProfile, roads: SantaRosaRoad[]) {
  const random = seededRandom(20280429);
  const buildingPalette = ['#d8d2c7', '#e4ddd1', '#b8b7b2', '#eee5d7', '#a7adaf', '#c9b8a4'];
  const candidates: ScoredBuildingPlacement[] = [];
  const occupied = new Set<string>();

  roads.forEach((road) => {
    for (let index = 1; index < road.p.length; index += 1) {
      const [startX, startZ] = road.p[index - 1];
      const [endX, endZ] = road.p[index];
      const deltaX = endX - startX;
      const deltaZ = endZ - startZ;
      const length = Math.hypot(deltaX, deltaZ);
      if (length < 0.45) continue;
      const directionX = deltaX / length;
      const directionZ = deltaZ / length;
      const perpendicularX = -directionZ;
      const perpendicularZ = directionX;
      const spacing = road.c === 'p' || road.c === 's' ? 2.15 : 1.48;

      for (let distance = 0.4; distance < length; distance += spacing * (0.86 + random() * 0.44)) {
        for (const side of [-1, 1]) {
          if (random() > 0.86) continue;
          const width = 0.44 + random() * 0.94;
          const depth = 0.5 + random() * 1.04;
          const setback = roadWidth(road.c) * 0.72 + depth * 0.62 + 0.2 + random() * 0.28;
          const x = startX + directionX * distance + perpendicularX * setback * side;
          const z = startZ + directionZ * distance + perpendicularZ * setback * side;
          const distanceToCenter = Math.hypot(x, z);
          if (distanceToCenter > 34) continue;
          const occupancyKey = `${Math.round(x / 0.82)}:${Math.round(z / 0.82)}`;
          if (occupied.has(occupancyKey)) continue;
          occupied.add(occupancyKey);

          const central = distanceToCenter < 11.5;
          const tower = central && random() > 0.94;
          const height = tower
            ? 3.4 + random() * 3.8
            : 0.62 + random() * (central ? 2.15 : 1.18);
          candidates.push({
            color: new THREE.Color(buildingPalette[Math.floor(random() * buildingPalette.length)]),
            depth,
            height,
            position: new THREE.Vector3(x, terrainHeight(x, z) + height / 2, z),
            rotation: Math.atan2(deltaX, deltaZ) + (random() - 0.5) * 0.04,
            score: distanceToCenter * 0.1 + random() * 18,
            width,
          });
        }
      }
    }
  });

  candidates.sort((left, right) => left.score - right.score);
  const buildings: BuildingPlacement[] = candidates
    .slice(0, quality.buildingCount)
    .map(({ score: _score, ...building }) => building);

  const trees: TreePlacement[] = [];
  while (trees.length < quality.treeCount) {
    const parkTree = trees.length < Math.floor(quality.treeCount * 0.38);
    const x = parkTree ? 3.3 + random() * 6.3 : (random() + random() - 1) * 38;
    const z = parkTree ? -4 + random() * 22 : (random() + random() - 1) * 40;
    trees.push({
      position: new THREE.Vector3(x, terrainHeight(x, z) + 0.38, z),
      scale: 0.36 + random() * 0.5,
    });
  }

  return { buildings, trees };
}

function CityVehicles() {
  const timeline = useAlvoradaTimeline();
  const vehicles = useRef<THREE.Group[]>([]);

  useFrame((state) => {
    const reveal = smoothRange(timeline.current.elapsed, 5, 5.35);
    vehicles.current.forEach((vehicle, index) => {
      const direction = index % 2 === 0 ? -1 : 1;
      const loop = ((state.clock.elapsedTime * (1.4 + index * 0.08) + index * 8) % 54) - 27;
      vehicle.position.z = loop * direction;
      vehicle.visible = reveal > 0.1;
    });
  });

  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <group
          key={index}
          ref={(vehicle) => {
            if (vehicle) vehicles.current[index] = vehicle;
          }}
          position={[index % 2 === 0 ? -0.28 : 0.28, 0.24, index * 7 - 20]}
          visible={false}
        >
          <mesh castShadow>
            <boxGeometry args={[0.24, 0.14, 0.48]} />
            <meshStandardMaterial color={index % 3 === 0 ? '#f3eee4' : '#46586a'} roughness={0.58} />
          </mesh>
          <pointLight color="#ffd6a0" intensity={0.18} distance={1.2} position={[0, 0, -0.34]} />
        </group>
      ))}
    </>
  );
}

export function SantaRosaCity({ quality }: SantaRosaCityProps) {
  const timeline = useAlvoradaTimeline();
  const source = useLoader(THREE.FileLoader, ROAD_DATA_URL) as string;
  const roadDataset = useMemo(() => JSON.parse(source) as SantaRosaRoadDataset, [source]);
  const root = useRef<THREE.Group>(null);
  const buildingsRef = useRef<THREE.InstancedMesh>(null);
  const roofsRef = useRef<THREE.InstancedMesh>(null);
  const treesRef = useRef<THREE.InstancedMesh>(null);
  const roadsRef = useRef<THREE.InstancedMesh>(null);
  const lightMaterial = useRef<THREE.PointsMaterial>(null);
  const buildingMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const { buildings, trees } = useMemo(
    () => createCityPlacements(quality, roadDataset.roads),
    [quality, roadDataset.roads],
  );
  const roadPlacements = useMemo(
    () => createRoadPlacements(roadDataset.roads, quality.mobile),
    [quality.mobile, roadDataset.roads],
  );
  const facadeTextures = useMemo(createBuildingFacadeTextures, []);
  const buildingGeometry = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 3, 0.055), []);
  const terrainTexture = useMemo(createTerrainTexture, []);
  const terrainGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(220, 220, quality.mobile ? 52 : 96, quality.mobile ? 52 : 96);
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getY(index);
      positions.setZ(index, terrainHeight(x, -z));
    }
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    return geometry;
  }, [quality.mobile]);
  const cityLights = useMemo(() => {
    const positions = new Float32Array(buildings.length * 3);
    buildings.forEach((building, index) => {
      positions[index * 3] = building.position.x;
      positions[index * 3 + 1] = building.position.y + building.height * 0.24;
      positions[index * 3 + 2] = building.position.z - building.depth * 0.52;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [buildings]);

  useEffect(() => () => {
    terrainGeometry.dispose();
    buildingGeometry.dispose();
    cityLights.dispose();
    facadeTextures.color.dispose();
    facadeTextures.emissive.dispose();
    terrainTexture.dispose();
  }, [buildingGeometry, cityLights, facadeTextures, terrainGeometry, terrainTexture]);

  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    buildings.forEach((building, index) => {
      quaternion.setFromEuler(new THREE.Euler(0, building.rotation, 0));
      scale.set(building.width, building.height, building.depth);
      matrix.compose(building.position, quaternion, scale);
      buildingsRef.current?.setMatrixAt(index, matrix);
      buildingsRef.current?.setColorAt(index, building.color);

      const roofHeight = 0.16;
      const roofPosition = building.position.clone();
      roofPosition.y += building.height / 2 + roofHeight / 2;
      scale.set(building.width * 1.06, roofHeight, building.depth * 1.06);
      matrix.compose(roofPosition, quaternion, scale);
      roofsRef.current?.setMatrixAt(index, matrix);
    });

    trees.forEach((tree, index) => {
      scale.set(tree.scale, tree.scale * 1.18, tree.scale);
      matrix.compose(tree.position, new THREE.Quaternion(), scale);
      treesRef.current?.setMatrixAt(index, matrix);
    });

    roadPlacements.forEach((road, index) => {
      quaternion.setFromEuler(new THREE.Euler(0, road.rotation, 0));
      scale.set(road.width, 0.045, road.length);
      matrix.compose(road.position, quaternion, scale);
      roadsRef.current?.setMatrixAt(index, matrix);
      roadsRef.current?.setColorAt(index, road.color);
    });

    [buildingsRef.current, roofsRef.current, treesRef.current, roadsRef.current].forEach((mesh) => {
      if (!mesh) return;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [buildings, roadPlacements, trees]);

  useFrame(() => {
    const elapsed = timeline.current.elapsed;
    if (root.current) root.current.visible = elapsed >= 4.5;
    const dawn = smoothRange(elapsed, 5, 7.2);
    if (lightMaterial.current) lightMaterial.current.opacity = (1 - dawn) * 0.74;
    if (buildingMaterial.current) {
      buildingMaterial.current.emissiveIntensity = THREE.MathUtils.lerp(0.26, 0.13, dawn);
    }
  });

  return (
    <group ref={root} visible={false}>
      <mesh geometry={terrainGeometry} receiveShadow>
        <meshStandardMaterial color="#d8d2b8" map={terrainTexture} roughness={0.98} metalness={0.01} />
      </mesh>

      <instancedMesh ref={roadsRef} args={[undefined, undefined, roadPlacements.length]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color="#d3d1c7"
          depthWrite={false}
          opacity={0.68}
          roughness={0.94}
          transparent
          vertexColors
        />
      </instancedMesh>

      <instancedMesh
        ref={buildingsRef}
        args={[undefined, undefined, buildings.length]}
        castShadow={quality.shadows}
        receiveShadow
      >
        <primitive attach="geometry" object={buildingGeometry} />
        <meshStandardMaterial
          ref={buildingMaterial}
          color="#f4eee3"
          map={facadeTextures.color}
          emissive="#4e443b"
          emissiveIntensity={0.24}
          metalness={0.02}
          roughness={0.82}
          vertexColors
        />
      </instancedMesh>

      <instancedMesh ref={roofsRef} args={[undefined, undefined, buildings.length]} castShadow={quality.shadows}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#9a5c40" roughness={0.92} />
      </instancedMesh>

      <instancedMesh ref={treesRef} args={[undefined, undefined, trees.length]} castShadow={quality.shadows}>
        <icosahedronGeometry args={[0.72, quality.mobile ? 0 : 1]} />
        <meshStandardMaterial color="#24583a" roughness={1} />
      </instancedMesh>

      <points geometry={cityLights}>
        <pointsMaterial
          ref={lightMaterial}
          color="#ffd08a"
          opacity={0.7}
          size={quality.mobile ? 0.09 : 0.075}
          sizeAttenuation
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </points>

      <CityVehicles />
    </group>
  );
}
