import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ARENA_FRONT_LAYOUT,
  PARK_ENVIRONMENT_FEATURES,
  sourceBoundsToLocal,
  sourcePolygonToLocal,
} from '../../data/parkEnvironment';
import {
  ARENA_FIELD_PLATEAU_ELEVATION,
  ARENA_FOOTBALL_FIELD_BOUNDS,
  ARENA_TERRAIN_BASE_ELEVATION,
  arenaStairTreadElevation,
  arenaTerrainElevation,
  arenaTerrainPlateauElevation,
} from '../../data/arenaTerrain';
import { isArenaTerrainExcluded } from '../../data/arenaSectorZoning';
import { getOpenGroundTexture, type OpenGroundSurface } from './openGroundTextures';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import { integrateGroundGeometryWithRearRoads } from '../../utils/rearRoadGroundIntegration';
import { ArenaAccessStructure } from './ArenaAccessStructure';

const NO_RAYCAST = () => undefined;
const UNIT_Y = new THREE.Vector3(0, 1, 0);
const BASE_Y = ARENA_TERRAIN_BASE_ELEVATION;

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

const PLAZA_USER_DATA = featureUserData('arena-front-public-plaza');
const STAIRS_USER_DATA = featureUserData('arena-front-concrete-stairs');
const TERRAIN_USER_DATA = featureUserData('arena-front-natural-terrain');
const FIELD_USER_DATA = featureUserData('arena-front-football-field');
const PATHS_USER_DATA = featureUserData('arena-front-pedestrian-paths');
const COURTS_USER_DATA = Object.freeze({
  featureIds: ['arena-front-multi-sport-court', 'arena-front-sand-volleyball-court'],
  classification: 'SPORTS_COURT',
  isSellable: false,
  contributesToCommercialMetrics: false,
});
const LANDSCAPE_USER_DATA = featureUserData('arena-front-landscape-support');
const INFRASTRUCTURE_USER_DATA = Object.freeze({
  classification: 'NON_COMMERCIAL_STRUCTURE',
  isSellable: false,
  contributesToCommercialMetrics: false,
});

/** As quadras ficam no trecho já plano, a leste da encosta. */
const COURT_BASE_Y = Math.max(
  BASE_Y,
  arenaTerrainPlateauElevation(sourceBoundsToLocal(ARENA_FRONT_LAYOUT.multiSportCourt.sourceBounds)),
  arenaTerrainPlateauElevation(sourceBoundsToLocal(ARENA_FRONT_LAYOUT.sandVolleyballCourt.sourceBounds)),
) + 0.004;

interface Segment {
  start: readonly [number, number, number];
  end: readonly [number, number, number];
  radius: number;
}

function refreshInstanceBounds(mesh: THREE.InstancedMesh | null) {
  if (!mesh) return;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

function updateMaterialOpacity(material: THREE.Material, opacity: number) {
  const normalizedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  const transparent = normalizedOpacity < 0.999;
  const depthWrite = normalizedOpacity > 0.94;
  if (
    material.opacity === normalizedOpacity
    && material.transparent === transparent
    && material.depthWrite === depthWrite
  ) return;
  material.opacity = normalizedOpacity;
  material.transparent = transparent;
  material.depthWrite = depthWrite;
  material.needsUpdate = true;
}

/**
 * Textura procedural compartilhada, reamostrada para UV normalizada (planos e
 * fitas usam 0..1, diferente das extrusões em unidade de mundo).
 */
function tiledSurfaceTexture(surface: OpenGroundSurface, repeatX: number, repeatY: number) {
  const shared = getOpenGroundTexture(surface);
  if (!shared) return null;
  const texture = shared.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = shared.colorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 16;
  texture.repeat.set(Math.max(repeatX, 0.01), Math.max(repeatY, 0.01));
  texture.needsUpdate = true;
  return texture;
}

function createHorizontalPolygonGeometry(points: readonly (readonly [number, number])[]) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 2);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createPolygonOutlineGeometry(points: readonly (readonly [number, number])[], y: number) {
  const vertices: number[] = [];
  points.forEach(([x, z], index) => {
    const [nextX, nextZ] = points[(index + 1) % points.length];
    vertices.push(x, y, z, nextX, y, nextZ);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Malha de terreno amostrada na única função de cota do setor e recortada
 * contra as zonas de outras camadas (Arena, praça/escadaria de concreto,
 * quadras, vias, estacionamento e campo). Sem esse recorte a grama volta a
 * cobrir o acesso e os degraus da Arena.
 */
function createTerrainGeometry() {
  const bounds = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.terrain.sourceBounds);
  const { segmentsX, segmentsZ } = ARENA_FRONT_LAYOUT.terrain;
  const geometry = new THREE.PlaneGeometry(bounds.width, bounds.depth, segmentsX, segmentsZ);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(bounds.centerX, 0, bounds.centerZ);

  const position = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const grass = new THREE.Color('#8fa869');
  const soil = new THREE.Color('#a98a63');
  const color = new THREE.Color();

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const elevation = arenaTerrainElevation(x, z);
    position.setY(index, elevation);
    // Solo exposto onde a encosta é mais castigada; grama no restante.
    const wear = THREE.MathUtils.clamp(
      (Math.sin(x * 0.51 + z * 0.37) * 0.5 + 0.5) * 0.7
      + (elevation - BASE_Y) * 0.35,
      0,
      1,
    );
    color.copy(grass).lerp(soil, wear * 0.42);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  position.needsUpdate = true;
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Recorte real: triângulos cujo baricentro cai em zona de outra camada saem.
  const sourceIndex = geometry.getIndex();
  if (sourceIndex) {
    const kept: number[] = [];
    for (let triangle = 0; triangle < sourceIndex.count; triangle += 3) {
      const a = sourceIndex.getX(triangle);
      const b = sourceIndex.getX(triangle + 1);
      const c = sourceIndex.getX(triangle + 2);
      const centroidX = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
      const centroidZ = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
      if (isArenaTerrainExcluded(centroidX, centroidZ)) continue;
      kept.push(a, b, c);
    }
    geometry.setIndex(kept);
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry: integrateGroundGeometryWithRearRoads(geometry), bounds };
}

/** Fita horizontal seguindo o terreno, usada nos caminhos de pedestres. */
function createWalkwayGeometry(path: readonly (readonly [number, number])[], width: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const half = width / 2;
  let travelled = 0;

  path.forEach(([x, z], index) => {
    const previous = path[index - 1] ?? path[index];
    const next = path[index + 1] ?? path[index];
    const dirX = next[0] - previous[0];
    const dirZ = next[1] - previous[1];
    const length = Math.hypot(dirX, dirZ) || 1;
    const normalX = -dirZ / length;
    const normalZ = dirX / length;
    if (index > 0) {
      travelled += Math.hypot(x - path[index - 1][0], z - path[index - 1][1]);
    }
    const leftX = x + normalX * half;
    const leftZ = z + normalZ * half;
    const rightX = x - normalX * half;
    const rightZ = z - normalZ * half;
    positions.push(leftX, arenaTerrainElevation(leftX, leftZ) + 0.014, leftZ);
    positions.push(rightX, arenaTerrainElevation(rightX, rightZ) + 0.014, rightZ);
    uvs.push(0, travelled, 1, travelled);
    if (index > 0) {
      const base = (index - 1) * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return integrateGroundGeometryWithRearRoads(geometry);
}

function courtLineGeometry() {
  const vertices: number[] = [];
  const addSegment = (start: readonly [number, number], end: readonly [number, number]) => {
    vertices.push(start[0], COURT_BASE_Y + 0.087, start[1], end[0], COURT_BASE_Y + 0.087, end[1]);
  };
  const addRectangle = (bounds: ReturnType<typeof sourceBoundsToLocal>, inset: number) => {
    const minX = bounds.minX + inset;
    const maxX = bounds.maxX - inset;
    const minZ = bounds.minZ + inset;
    const maxZ = bounds.maxZ - inset;
    addSegment([minX, minZ], [maxX, minZ]);
    addSegment([maxX, minZ], [maxX, maxZ]);
    addSegment([maxX, maxZ], [minX, maxZ]);
    addSegment([minX, maxZ], [minX, minZ]);
  };
  const addCircle = (centerX: number, centerZ: number, radius: number, segments = 20) => {
    for (let index = 0; index < segments; index += 1) {
      const startAngle = (index / segments) * Math.PI * 2;
      const endAngle = ((index + 1) / segments) * Math.PI * 2;
      addSegment(
        [centerX + Math.cos(startAngle) * radius, centerZ + Math.sin(startAngle) * radius],
        [centerX + Math.cos(endAngle) * radius, centerZ + Math.sin(endAngle) * radius],
      );
    }
  };

  const multi = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.multiSportCourt.sourceBounds);
  [ARENA_FRONT_LAYOUT.multiSportCourt, ARENA_FRONT_LAYOUT.sandVolleyballCourt].forEach((court) => {
    const bounds = sourceBoundsToLocal(court.sourceBounds);
    addRectangle(bounds, 0.42);
    addSegment([bounds.minX + 0.42, bounds.centerZ], [bounds.maxX - 0.42, bounds.centerZ]);
  });
  addCircle(multi.centerX, multi.centerZ, Math.min(multi.depth, multi.width) * 0.14);
  const laneWidth = multi.width * 0.42;
  const laneDepth = multi.depth * 0.16;
  addRectangle({
    ...multi,
    minX: multi.centerX - laneWidth / 2,
    maxX: multi.centerX + laneWidth / 2,
    minZ: multi.minZ + 0.42,
    maxZ: multi.minZ + 0.42 + laneDepth,
  }, 0);
  addRectangle({
    ...multi,
    minX: multi.centerX - laneWidth / 2,
    maxX: multi.centerX + laneWidth / 2,
    minZ: multi.maxZ - 0.42 - laneDepth,
    maxZ: multi.maxZ - 0.42,
  }, 0);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** ANALYST: delete this helper with the east marked pitch. Replacement west
 * field is UNMARKED — no lines, no pitchTurf. docs/arena-roads/analysis.md §4.1 */
function footballFieldLineGeometry() {
  const bounds = ARENA_FOOTBALL_FIELD_BOUNDS;
  const inset = ARENA_FRONT_LAYOUT.footballField.markingInset;
  const y = ARENA_FIELD_PLATEAU_ELEVATION + 0.026;
  const vertices: number[] = [];
  const add = (start: readonly [number, number], end: readonly [number, number]) => {
    vertices.push(start[0], y, start[1], end[0], y, end[1]);
  };
  const minX = bounds.minX + inset;
  const maxX = bounds.maxX - inset;
  const minZ = bounds.minZ + inset;
  const maxZ = bounds.maxZ - inset;
  add([minX, minZ], [maxX, minZ]);
  add([maxX, minZ], [maxX, maxZ]);
  add([maxX, maxZ], [minX, maxZ]);
  add([minX, maxZ], [minX, minZ]);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  add([centerX, minZ], [centerX, maxZ]);
  const radius = Math.min(maxX - minX, maxZ - minZ) * 0.16;
  for (let index = 0; index < 24; index += 1) {
    const a = (index / 24) * Math.PI * 2;
    const b = ((index + 1) / 24) * Math.PI * 2;
    add(
      [centerX + Math.cos(a) * radius, centerZ + Math.sin(a) * radius],
      [centerX + Math.cos(b) * radius, centerZ + Math.sin(b) * radius],
    );
  }
  // Pequenas áreas.
  const boxDepth = (maxZ - minZ) * 0.24;
  const boxRun = (maxX - minX) * 0.12;
  [minX, maxX - boxRun].forEach((startX) => {
    const endX = startX + boxRun;
    add([startX, centerZ - boxDepth / 2], [endX, centerZ - boxDepth / 2]);
    add([endX, centerZ - boxDepth / 2], [endX, centerZ + boxDepth / 2]);
    add([endX, centerZ + boxDepth / 2], [startX, centerZ + boxDepth / 2]);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function courtNetGeometry(reducedGraphics: boolean) {
  const vertices: number[] = [];
  const add = (start: readonly [number, number, number], end: readonly [number, number, number]) => {
    vertices.push(...start, ...end);
  };
  const verticalDivisions = reducedGraphics ? 6 : 10;
  const horizontalDivisions = reducedGraphics ? 2 : 4;
  [ARENA_FRONT_LAYOUT.multiSportCourt, ARENA_FRONT_LAYOUT.sandVolleyballCourt]
    .filter((court) => court.supportsVolleyball)
    .forEach((court) => {
      const bounds = sourceBoundsToLocal(court.sourceBounds);
      const minX = bounds.minX + 0.4;
      const maxX = bounds.maxX - 0.4;
      const bottomY = COURT_BASE_Y + 0.34;
      const topY = COURT_BASE_Y + 0.94;
      for (let index = 0; index <= verticalDivisions; index += 1) {
        const x = THREE.MathUtils.lerp(minX, maxX, index / verticalDivisions);
        add([x, bottomY, bounds.centerZ], [x, topY, bounds.centerZ]);
      }
      for (let index = 0; index <= horizontalDivisions; index += 1) {
        const y = THREE.MathUtils.lerp(bottomY, topY, index / horizontalDivisions);
        add([minX, y, bounds.centerZ], [maxX, y, bounds.centerZ]);
      }
    });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

type MetalInfrastructureSubset = 'arena-structures' | 'courts';

interface StairLayout {
  bounds: ReturnType<typeof sourceBoundsToLocal>;
  stepRun: number;
  bankDepth: number;
  /** Centro em X e cota do piso de cada degrau/patamar, do leste para o oeste. */
  treads: { centerX: number; run: number; elevation: number; step: number }[];
  topX: number;
}

function buildStairLayout(): StairLayout {
  const config = ARENA_FRONT_LAYOUT.stairs;
  const bounds = sourceBoundsToLocal(config.sourceBounds);
  const usableRun = bounds.width - config.lowerLandingDepth - config.upperLandingDepth;
  const stepRun = (
    usableRun - config.intermediateLandingSteps.length * config.intermediateLandingDepth
  ) / config.stepCount;
  const bankDepth = (bounds.depth - config.bankGap * (config.bankCount - 1)) / config.bankCount;
  const treads: StairLayout['treads'] = [];
  let cursorX = bounds.maxX - config.lowerLandingDepth;
  for (let step = 0; step < config.stepCount; step += 1) {
    const elevation = arenaStairTreadElevation(step + 1);
    treads.push({ centerX: cursorX - stepRun / 2, run: stepRun, elevation, step: step + 1 });
    cursorX -= stepRun;
    if (config.intermediateLandingSteps.includes((step + 1) as 6 | 12)) {
      treads.push({
        centerX: cursorX - config.intermediateLandingDepth / 2,
        run: config.intermediateLandingDepth,
        elevation,
        step: step + 1,
      });
      cursorX -= config.intermediateLandingDepth;
    }
  }
  return { bounds, stepRun, bankDepth, treads, topX: cursorX };
}

function buildMetalSegments(
  reducedGraphics: boolean,
  subset: MetalInfrastructureSubset,
): Segment[] {
  const segments: Segment[] = [];
  if (subset === 'arena-structures') {
    const config = ARENA_FRONT_LAYOUT.stairs;
    const layout = buildStairLayout();
    const { bounds, bankDepth } = layout;
    const railHeight = config.handrailHeight;
    const railZs = Array.from({ length: config.bankCount }, (_, bank) => (
      [0.05, 0.95].map((fraction) => (
        bounds.minZ + bank * (bankDepth + config.bankGap) + bankDepth * fraction
      ))
    )).flat();

    railZs.forEach((z) => {
      // Corrimão contínuo acompanhando o novo perfil de degraus.
      for (let index = 1; index < layout.treads.length; index += 1) {
        const previous = layout.treads[index - 1];
        const current = layout.treads[index];
        segments.push({
          start: [previous.centerX, previous.elevation + railHeight, z],
          end: [current.centerX, current.elevation + railHeight, z],
          radius: 0.018,
        });
      }
      const postStride = reducedGraphics ? 5 : 3;
      layout.treads.forEach((tread, index) => {
        if (index % postStride !== 0 && index !== layout.treads.length - 1) return;
        segments.push({
          start: [tread.centerX, tread.elevation, z],
          end: [tread.centerX, tread.elevation + railHeight, z],
          radius: 0.02,
        });
      });
    });
  }

  if (subset === 'courts') {
    const multi = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.multiSportCourt.sourceBounds);
    const sand = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.sandVolleyballCourt.sourceBounds);
    [multi, sand].forEach((bounds) => {
      [bounds.minX + 0.4, bounds.maxX - 0.4].forEach((x) => segments.push({
        start: [x, COURT_BASE_Y + 0.08, bounds.centerZ],
        end: [x, COURT_BASE_Y + 1, bounds.centerZ],
        radius: 0.028,
      }));
    });
    if (ARENA_FRONT_LAYOUT.multiSportCourt.supportsBasketball) [multi.minZ + 0.28, multi.maxZ - 0.28].forEach((z, index) => {
      const direction = index === 0 ? 1 : -1;
      segments.push({
        start: [multi.centerX, COURT_BASE_Y + 0.08, z],
        end: [multi.centerX, COURT_BASE_Y + 1.02, z],
        radius: 0.033,
      });
      segments.push({
        start: [multi.centerX, COURT_BASE_Y + 0.98, z],
        end: [multi.centerX, COURT_BASE_Y + 0.98, z + direction * 0.38],
        radius: 0.026,
      });
    });
  }
  return segments;
}

function ArenaTerrain({ opacity }: { opacity: number }) {
  const { invalidate } = useThree();
  const terrain = useMemo(createTerrainGeometry, []);
  const texture = useMemo(() => tiledSurfaceTexture(
    'grass',
    terrain.bounds.width / 7.5,
    terrain.bounds.depth / 7.5,
  ), [terrain.bounds.depth, terrain.bounds.width]);

  useEffect(() => {
    invalidate();
  }, [invalidate, opacity]);

  useEffect(() => () => terrain.geometry.dispose(), [terrain]);
  useEffect(() => () => texture?.dispose(), [texture]);

  return (
    <mesh
      name="terreno-natural-entorno-arena"
      geometry={terrain.geometry}
      receiveShadow
      raycast={NO_RAYCAST}
      userData={TERRAIN_USER_DATA}
    >
      <meshStandardMaterial
        map={texture ?? undefined}
        vertexColors
        color="#ffffff"
        roughness={1}
        metalness={0}
        transparent={opacity < 0.999}
        opacity={opacity}
        depthWrite={opacity > 0.94}
      />
    </mesh>
  );
}

/** ANALYST: move off [5410, 2800, 5900, 3120] (east of F). New unmarked grass
 * `[4560, 2708, 4884, 2948]` west of F (ANALYSIS.md §3.3). No 02-map green box. */
function FootballField({ opacity }: { opacity: number }) {
  const { invalidate } = useThree();
  const bounds = ARENA_FOOTBALL_FIELD_BOUNDS;
  const config = ARENA_FRONT_LAYOUT.footballField;
  const turfGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(
      bounds.width - config.turfInset * 2,
      bounds.depth - config.turfInset * 2,
    );
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, [bounds.depth, bounds.width, config.turfInset]);
  const apronGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(bounds.width, bounds.depth);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, [bounds.depth, bounds.width]);
  const lines = useMemo(
    () => (config.markings ? footballFieldLineGeometry() : null),
    [config.markings],
  );
  const turfTexture = useMemo(() => tiledSurfaceTexture(
    'pitchTurf',
    (bounds.width - config.turfInset * 2) / 1.4,
    (bounds.depth - config.turfInset * 2) / 1.4,
  ), [bounds.depth, bounds.width, config.turfInset]);
  const apronTexture = useMemo(() => tiledSurfaceTexture(
    'compactedSoil',
    bounds.width / 2.2,
    bounds.depth / 2.2,
  ), [bounds.depth, bounds.width]);

  useEffect(() => {
    invalidate();
  }, [invalidate, opacity]);

  useEffect(() => () => turfGeometry.dispose(), [turfGeometry]);
  useEffect(() => () => apronGeometry.dispose(), [apronGeometry]);
  useEffect(() => () => lines?.dispose(), [lines]);
  useEffect(() => () => turfTexture?.dispose(), [turfTexture]);
  useEffect(() => () => apronTexture?.dispose(), [apronTexture]);

  return (
    <group name="campo-futebol-arena" userData={FIELD_USER_DATA}>
      <mesh
        name="borda-desgastada-campo-arena"
        geometry={apronGeometry}
        position={[bounds.centerX, ARENA_FIELD_PLATEAU_ELEVATION + 0.008, bounds.centerZ]}
        receiveShadow
        raycast={NO_RAYCAST}
        userData={FIELD_USER_DATA}
      >
        <meshStandardMaterial
          map={apronTexture ?? undefined}
          color={config.wornColor}
          roughness={1}
          metalness={0}
          transparent={opacity < 0.999}
          opacity={opacity}
          depthWrite={opacity > 0.94}
        />
      </mesh>
      <mesh
        name="gramado-campo-arena"
        geometry={turfGeometry}
        position={[bounds.centerX, ARENA_FIELD_PLATEAU_ELEVATION + 0.018, bounds.centerZ]}
        receiveShadow
        raycast={NO_RAYCAST}
        userData={FIELD_USER_DATA}
      >
        <meshStandardMaterial
          map={turfTexture ?? undefined}
          color={config.turfColor}
          roughness={1}
          metalness={0}
          transparent={opacity < 0.999}
          opacity={opacity}
          depthWrite={opacity > 0.94}
        />
      </mesh>
      {lines && (
        <lineSegments name="marcacoes-campo-arena" geometry={lines} raycast={NO_RAYCAST} renderOrder={5}>
          <lineBasicMaterial color="#f3f7ec" transparent opacity={0.78 * opacity} toneMapped={false} />
        </lineSegments>
      )}
    </group>
  );
}

function ArenaWalkways({ opacity }: { opacity: number }) {
  const { invalidate } = useThree();
  const geometry = useMemo(() => {
    const geometries = ARENA_FRONT_LAYOUT.walkways.map((walkway) => (
      createWalkwayGeometry(sourcePolygonToLocal(walkway.sourcePath), walkway.width)
    ));
    return geometries;
  }, []);
  const texture = useMemo(() => tiledSurfaceTexture('concrete', 1, 2.4), []);

  useEffect(() => {
    invalidate();
  }, [invalidate, opacity]);

  useEffect(() => () => geometry.forEach((item) => item.dispose()), [geometry]);
  useEffect(() => () => texture?.dispose(), [texture]);

  return (
    <group name="caminhos-pedestres-arena" userData={PATHS_USER_DATA}>
      {geometry.map((item, index) => (
        <mesh
          key={ARENA_FRONT_LAYOUT.walkways[index].id}
          name={ARENA_FRONT_LAYOUT.walkways[index].id}
          geometry={item}
          receiveShadow
          raycast={NO_RAYCAST}
          userData={PATHS_USER_DATA}
        >
          <meshStandardMaterial
            map={texture ?? undefined}
            color="#cfcabd"
            roughness={0.96}
            metalness={0}
            polygonOffset
            polygonOffsetFactor={-2}
            transparent={opacity < 0.999}
            opacity={opacity}
            depthWrite={opacity > 0.94}
          />
        </mesh>
      ))}
    </group>
  );
}

function ArenaVegetation({ reducedGraphics, opacity }: { reducedGraphics: boolean; opacity: number }) {
  const trunksRef = useRef<THREE.InstancedMesh>(null);
  const crownsRef = useRef<THREE.InstancedMesh>(null);
  const { gl, invalidate } = useThree();
  const clusters = ARENA_FRONT_LAYOUT.treeClusters;
  const count = clusters.length;
  const trunkGeometry = useMemo(
    () => new THREE.CylinderGeometry(0.03, 0.045, 1, reducedGraphics ? 5 : 7),
    [reducedGraphics],
  );
  const crownGeometry = useMemo(
    () => new THREE.IcosahedronGeometry(1, reducedGraphics ? 0 : 1),
    [reducedGraphics],
  );
  const trunkMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#6b543c', roughness: 0.95, metalness: 0 }),
    [],
  );
  const crownMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0 }),
    [],
  );

  useEffect(() => {
    updateMaterialOpacity(trunkMaterial, opacity);
    updateMaterialOpacity(crownMaterial, opacity);
    invalidate();
  }, [crownMaterial, invalidate, opacity, trunkMaterial]);

  useLayoutEffect(() => {
    const trunks = trunksRef.current;
    const crowns = crownsRef.current;
    if (!trunks || !crowns) return;
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    const palette = ['#5f7f4a', '#6f8f54', '#7f9a5c', '#587541'];
    clusters.forEach((cluster, index) => {
      const [x, z] = sourcePolygonToLocal([cluster.sourcePosition])[0];
      const ground = arenaTerrainElevation(x, z);
      const scale = cluster.scale;
      const trunkHeight = 0.34 * scale;
      transform.position.set(x, ground + trunkHeight / 2, z);
      transform.rotation.set(0, (index % 7) * 0.42, 0);
      transform.scale.set(scale, trunkHeight, scale);
      transform.updateMatrix();
      trunks.setMatrixAt(index, transform.matrix);

      const crownRadius = 0.3 * scale;
      transform.position.set(x, ground + trunkHeight + crownRadius * 0.72, z);
      transform.rotation.set((index % 3) * 0.18, (index % 5) * 0.51, (index % 4) * 0.12);
      transform.scale.set(crownRadius, crownRadius * 0.86, crownRadius);
      transform.updateMatrix();
      crowns.setMatrixAt(index, transform.matrix);
      crowns.setColorAt(index, color.set(palette[index % palette.length]));
    });
    refreshInstanceBounds(trunks);
    refreshInstanceBounds(crowns);
    trunks.castShadow = !reducedGraphics && opacity > 0.72;
    crowns.castShadow = !reducedGraphics && opacity > 0.72;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [clusters, gl, invalidate, opacity, reducedGraphics]);

  useEffect(() => () => {
    disposeInstancedMesh(trunksRef.current);
    disposeInstancedMesh(crownsRef.current);
    trunkGeometry.dispose();
    crownGeometry.dispose();
    trunkMaterial.dispose();
    crownMaterial.dispose();
  }, [crownGeometry, crownMaterial, trunkGeometry, trunkMaterial]);

  return (
    <group name="vegetacao-entorno-arena" userData={LANDSCAPE_USER_DATA}>
      <instancedMesh
        ref={trunksRef}
        name="troncos-arvores-arena"
        args={[trunkGeometry, trunkMaterial, count]}
        count={count}
        castShadow={!reducedGraphics && opacity > 0.72}
        frustumCulled
        raycast={NO_RAYCAST}
        userData={LANDSCAPE_USER_DATA}
      />
      <instancedMesh
        ref={crownsRef}
        name="copas-arvores-arena"
        args={[crownGeometry, crownMaterial, count]}
        count={count}
        castShadow={!reducedGraphics && opacity > 0.72}
        frustumCulled
        raycast={NO_RAYCAST}
        userData={LANDSCAPE_USER_DATA}
      />
    </group>
  );
}

function CourtSurfaces({ opacity }: { opacity: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.91,
    metalness: 0,
  }), []);

  useEffect(() => {
    updateMaterialOpacity(material, opacity);
    invalidate();
  }, [invalidate, material, opacity]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    const courts = [ARENA_FRONT_LAYOUT.multiSportCourt, ARENA_FRONT_LAYOUT.sandVolleyballCourt];
    let instance = 0;
    courts.forEach((court) => {
      const bounds = sourceBoundsToLocal(court.sourceBounds);
      transform.position.set(bounds.centerX, COURT_BASE_Y + 0.023, bounds.centerZ);
      transform.scale.set(bounds.width, 0.046, bounds.depth);
      transform.updateMatrix();
      mesh.setMatrixAt(instance, transform.matrix);
      mesh.setColorAt(instance, color.set(court.apronColor));
      instance += 1;
      transform.position.set(bounds.centerX, COURT_BASE_Y + 0.056, bounds.centerZ);
      transform.scale.set(bounds.width - court.surfaceInset * 2, 0.035, bounds.depth - court.surfaceInset * 2);
      transform.updateMatrix();
      mesh.setMatrixAt(instance, transform.matrix);
      mesh.setColorAt(instance, color.set(court.surfaceColor));
      instance += 1;
    });
    refreshInstanceBounds(mesh);
    invalidate();
  }, [invalidate]);

  useEffect(() => () => {
    disposeInstancedMesh(ref.current);
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return (
    <instancedMesh
      ref={ref}
      name="superficies-quadras-arena"
      args={[geometry, material, 4]}
      count={4}
      receiveShadow
      frustumCulled
      raycast={NO_RAYCAST}
      userData={COURTS_USER_DATA}
    />
  );
}

function MetalInfrastructure({
  reducedGraphics,
  opacity,
  subset,
}: {
  reducedGraphics: boolean;
  opacity: number;
  subset: MetalInfrastructureSubset;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { gl, invalidate } = useThree();
  const segments = useMemo(() => buildMetalSegments(reducedGraphics, subset), [reducedGraphics, subset]);
  const geometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, reducedGraphics ? 6 : 8, 1), [reducedGraphics]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#5d6664',
    roughness: 0.48,
    metalness: 0.58,
  }), []);

  useEffect(() => {
    updateMaterialOpacity(material, opacity);
    invalidate();
  }, [invalidate, material, opacity]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const midpoint = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    segments.forEach((segment, index) => {
      start.fromArray(segment.start);
      end.fromArray(segment.end);
      direction.subVectors(end, start);
      midpoint.addVectors(start, end).multiplyScalar(0.5);
      quaternion.setFromUnitVectors(UNIT_Y, direction.clone().normalize());
      transform.position.copy(midpoint);
      transform.quaternion.copy(quaternion);
      transform.scale.set(segment.radius, direction.length(), segment.radius);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    refreshInstanceBounds(mesh);
    mesh.castShadow = !reducedGraphics && opacity > 0.72;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, opacity, reducedGraphics, segments]);

  useEffect(() => () => {
    disposeInstancedMesh(ref.current);
    geometry.dispose();
  }, [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <instancedMesh
      ref={ref}
      name={subset === 'arena-structures' ? 'corrimaos-escadaria-arena' : 'postes-e-suportes-quadras-arena'}
      args={[geometry, material, segments.length]}
      count={segments.length}
      castShadow={!reducedGraphics && opacity > 0.72}
      frustumCulled
      raycast={NO_RAYCAST}
      userData={subset === 'arena-structures' ? STAIRS_USER_DATA : COURTS_USER_DATA}
    />
  );
}

function BasketballFixtures({ reducedGraphics, opacity }: { reducedGraphics: boolean; opacity: number }) {
  const boardsRef = useRef<THREE.InstancedMesh>(null);
  const ringsRef = useRef<THREE.InstancedMesh>(null);
  const { gl, invalidate } = useThree();
  const bounds = useMemo(() => sourceBoundsToLocal(ARENA_FRONT_LAYOUT.multiSportCourt.sourceBounds), []);
  const boardGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const ringGeometry = useMemo(() => new THREE.TorusGeometry(0.16, 0.018, reducedGraphics ? 5 : 7, reducedGraphics ? 10 : 16), [reducedGraphics]);
  const boardMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8ece7', roughness: 0.63, metalness: 0.08 }), []);
  const ringMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d96832', roughness: 0.54, metalness: 0.28 }), []);

  useEffect(() => {
    updateMaterialOpacity(boardMaterial, opacity);
    updateMaterialOpacity(ringMaterial, opacity);
    invalidate();
  }, [boardMaterial, invalidate, opacity, ringMaterial]);

  useLayoutEffect(() => {
    const boards = boardsRef.current;
    const rings = ringsRef.current;
    if (!boards || !rings) return;
    const transform = new THREE.Object3D();
    [
      { z: bounds.minZ + 0.42, direction: 1 },
      { z: bounds.maxZ - 0.42, direction: -1 },
    ].forEach((fixture, index) => {
      transform.position.set(bounds.centerX, COURT_BASE_Y + 1.04, fixture.z);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(0.68, 0.42, 0.055);
      transform.updateMatrix();
      boards.setMatrixAt(index, transform.matrix);
      transform.position.set(bounds.centerX, COURT_BASE_Y + 0.91, fixture.z + fixture.direction * 0.36);
      transform.rotation.set(Math.PI / 2, 0, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      rings.setMatrixAt(index, transform.matrix);
    });
    refreshInstanceBounds(boards);
    refreshInstanceBounds(rings);
    boards.castShadow = !reducedGraphics && opacity > 0.72;
    rings.castShadow = !reducedGraphics && opacity > 0.72;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [bounds, gl, invalidate, opacity, reducedGraphics]);

  useEffect(() => () => boardGeometry.dispose(), [boardGeometry]);
  useEffect(() => () => ringGeometry.dispose(), [ringGeometry]);
  useEffect(() => () => boardMaterial.dispose(), [boardMaterial]);
  useEffect(() => () => ringMaterial.dispose(), [ringMaterial]);

  return (
    <>
      <instancedMesh
        ref={boardsRef}
        name="tabelas-basquete-arena"
        args={[boardGeometry, boardMaterial, 2]}
        count={2}
        castShadow={!reducedGraphics && opacity > 0.72}
        raycast={NO_RAYCAST}
        userData={COURTS_USER_DATA}
      />
      <instancedMesh
        ref={ringsRef}
        name="aros-basquete-arena"
        args={[ringGeometry, ringMaterial, 2]}
        count={2}
        castShadow={!reducedGraphics && opacity > 0.72}
        raycast={NO_RAYCAST}
        userData={COURTS_USER_DATA}
      />
    </>
  );
}

/**
 * Degraus, patamares e muretas de arrimo. Cada piso é uma laje fina assentada
 * sobre a encosta — nunca um bloco que vai do piso ao topo.
 */
function StepInstances({ reducedGraphics, opacity }: { reducedGraphics: boolean; opacity: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { gl, invalidate } = useThree();
  const config = ARENA_FRONT_LAYOUT.stairs;
  const layout = useMemo(buildStairLayout, []);
  const instanceCount = layout.treads.length * config.bankCount + 2 + config.bankCount * 2 + 2;
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#c7c4b9',
    roughness: 0.94,
    metalness: 0,
  }), []);

  useEffect(() => {
    updateMaterialOpacity(material, opacity);
    invalidate();
  }, [invalidate, material, opacity]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    const { bounds, bankDepth } = layout;
    const slabThickness = Math.max(config.riserHeight * 1.9, 0.05);
    let instance = 0;

    for (let bank = 0; bank < config.bankCount; bank += 1) {
      const z = bounds.minZ + bankDepth / 2 + bank * (bankDepth + config.bankGap);
      layout.treads.forEach((tread) => {
        transform.position.set(tread.centerX, tread.elevation - slabThickness / 2, z);
        transform.rotation.set(0, 0, 0);
        transform.scale.set(tread.run + 0.01, slabThickness, bankDepth - 0.02);
        transform.updateMatrix();
        mesh.setMatrixAt(instance, transform.matrix);
        instance += 1;
      });
    }

    // Patamar inferior, encostando no apron da Arena.
    transform.position.set(
      bounds.maxX - config.lowerLandingDepth / 2,
      BASE_Y + 0.022,
      bounds.centerZ,
    );
    transform.scale.set(config.lowerLandingDepth, 0.05, bounds.depth);
    transform.updateMatrix();
    mesh.setMatrixAt(instance, transform.matrix);
    instance += 1;

    // Laje fina de topo, alinhada ao terraço superior.
    const topElevation = arenaStairTreadElevation(config.stepCount);
    transform.position.set(
      bounds.minX + config.upperLandingDepth / 2,
      topElevation - config.upperLandingThickness / 2,
      bounds.centerZ,
    );
    transform.scale.set(config.upperLandingDepth, config.upperLandingThickness, bounds.depth);
    transform.updateMatrix();
    mesh.setMatrixAt(instance, transform.matrix);
    instance += 1;

    // Muretas de arrimo laterais e entre lances: encontram o terreno em rampa.
    const wallCenters = [
      bounds.minZ + config.retainingWallWidth / 2,
      bounds.maxZ - config.retainingWallWidth / 2,
    ];
    for (let bank = 1; bank < config.bankCount; bank += 1) {
      wallCenters.push(bounds.minZ + bank * (bankDepth + config.bankGap));
    }
    const runStart = bounds.maxX - config.lowerLandingDepth;
    const runLength = runStart - layout.topX;
    const wallCenterX = (runStart + layout.topX) / 2;
    while (wallCenters.length < config.bankCount + 2) wallCenters.push(bounds.centerZ);
    wallCenters.slice(0, config.bankCount + 2).forEach((z) => {
      const height = (topElevation - BASE_Y) * 0.55;
      transform.position.set(wallCenterX, BASE_Y + height / 2, z);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(runLength, height, config.retainingWallWidth);
      transform.updateMatrix();
      mesh.setMatrixAt(instance, transform.matrix);
      instance += 1;
    });

    for (let remaining = instance; remaining < instanceCount; remaining += 1) {
      transform.position.set(bounds.centerX, BASE_Y - 5, bounds.centerZ);
      transform.scale.set(0.001, 0.001, 0.001);
      transform.updateMatrix();
      mesh.setMatrixAt(remaining, transform.matrix);
    }

    refreshInstanceBounds(mesh);
    mesh.castShadow = !reducedGraphics && opacity > 0.72;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [config, gl, instanceCount, invalidate, layout, opacity, reducedGraphics]);

  useEffect(() => () => {
    disposeInstancedMesh(ref.current);
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return (
    <instancedMesh
      ref={ref}
      name="degraus-concreto-arena"
      args={[geometry, material, instanceCount]}
      count={instanceCount}
      receiveShadow
      castShadow={!reducedGraphics && opacity > 0.72}
      frustumCulled
      raycast={NO_RAYCAST}
      userData={STAIRS_USER_DATA}
    />
  );
}

function ArenaStructures({
  reducedGraphics,
  opacity,
}: {
  reducedGraphics: boolean;
  opacity: number;
}) {
  const { gl, invalidate } = useThree();
  const plazaPoints = useMemo(() => sourcePolygonToLocal(ARENA_FRONT_LAYOUT.plaza.sourcePolygon), []);
  const plazaGeometry = useMemo(() => createHorizontalPolygonGeometry(plazaPoints), [plazaPoints]);
  const plazaOutline = useMemo(() => createPolygonOutlineGeometry(plazaPoints, BASE_Y + 0.014), [plazaPoints]);
  const plazaTexture = useMemo(() => tiledSurfaceTexture('concrete', 4, 3), []);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, opacity, reducedGraphics]);

  useEffect(() => () => plazaGeometry.dispose(), [plazaGeometry]);
  useEffect(() => () => plazaOutline.dispose(), [plazaOutline]);
  useEffect(() => () => plazaTexture?.dispose(), [plazaTexture]);

  return (
    <group name="estruturas-publicas-frente-arena" userData={INFRASTRUCTURE_USER_DATA}>
      <ArenaTerrain opacity={opacity} />
      <mesh
        name="praca-pavimentada-arena"
        geometry={plazaGeometry}
        position={[0, BASE_Y + 0.006, 0]}
        receiveShadow
        raycast={NO_RAYCAST}
        userData={PLAZA_USER_DATA}
      >
        <meshStandardMaterial
          map={plazaTexture ?? undefined}
          color="#c3c0b6"
          roughness={0.97}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-1}
          transparent={opacity < 0.999}
          opacity={opacity}
          depthWrite={opacity > 0.94}
        />
      </mesh>
      <lineSegments geometry={plazaOutline} raycast={NO_RAYCAST}>
        <lineBasicMaterial color="#797b74" transparent opacity={0.55 * opacity} toneMapped={false} />
      </lineSegments>
      <FootballField opacity={opacity} />
      <ArenaWalkways opacity={opacity} />
      <StepInstances reducedGraphics={reducedGraphics} opacity={opacity} />
      <MetalInfrastructure
        reducedGraphics={reducedGraphics}
        opacity={opacity}
        subset="arena-structures"
      />
      <ArenaVegetation reducedGraphics={reducedGraphics} opacity={opacity} />
    </group>
  );
}

function ArenaCourts({
  reducedGraphics,
  opacity,
}: {
  reducedGraphics: boolean;
  opacity: number;
}) {
  const { gl, invalidate } = useThree();
  const lines = useMemo(courtLineGeometry, []);
  const nets = useMemo(() => courtNetGeometry(reducedGraphics), [reducedGraphics]);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, opacity, reducedGraphics]);

  useEffect(() => () => lines.dispose(), [lines]);
  useEffect(() => () => nets.dispose(), [nets]);

  return (
    <group name="quadras-publicas-arena-exporural" userData={COURTS_USER_DATA}>
      <CourtSurfaces opacity={opacity} />
      <lineSegments
        name="marcacoes-quadras-arena"
        geometry={lines}
        raycast={NO_RAYCAST}
        renderOrder={5}
        userData={COURTS_USER_DATA}
      >
        <lineBasicMaterial color="#fff8e6" transparent={opacity < 0.999} opacity={opacity} toneMapped={false} />
      </lineSegments>
      <lineSegments name="redes-volei-arena" geometry={nets} raycast={NO_RAYCAST} userData={COURTS_USER_DATA}>
        <lineBasicMaterial color="#e7e3d7" transparent opacity={0.9 * opacity} toneMapped={false} />
      </lineSegments>
      <MetalInfrastructure reducedGraphics={reducedGraphics} opacity={opacity} subset="courts" />
      {ARENA_FRONT_LAYOUT.multiSportCourt.supportsBasketball && (
        <BasketballFixtures reducedGraphics={reducedGraphics} opacity={opacity} />
      )}
    </group>
  );
}

export const ArenaFrontInfrastructure = memo(function ArenaFrontInfrastructure({
  reducedGraphics,
  showArenaStructures,
  showArenaAccess,
  showCourts,
  arenaStructuresOpacity,
  arenaAccessOpacity,
  courtsOpacity,
}: {
  reducedGraphics: boolean;
  showArenaStructures: boolean;
  showArenaAccess: boolean;
  showCourts: boolean;
  arenaStructuresOpacity: number;
  arenaAccessOpacity: number;
  courtsOpacity: number;
}) {
  if (!showArenaStructures && !showArenaAccess && !showCourts) return null;
  return (
    <group name="infraestrutura-publica-frente-arena" userData={INFRASTRUCTURE_USER_DATA}>
      {showArenaStructures && (
        <ArenaStructures reducedGraphics={reducedGraphics} opacity={arenaStructuresOpacity} />
      )}
      {showArenaAccess && (
        <ArenaAccessStructure reducedGraphics={reducedGraphics} opacity={arenaAccessOpacity} />
      )}
      {showCourts && <ArenaCourts reducedGraphics={reducedGraphics} opacity={courtsOpacity} />}
    </group>
  );
});
