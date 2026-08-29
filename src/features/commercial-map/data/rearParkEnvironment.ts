import { OFFICIAL_REFERENCE_DATA, officialPdfPointToLocal } from './officialReference2026';
import {
  ETHNIC_QUARTER_SOURCE_BOUNDS,
  rearRoadCorridors,
  rearRoadSourceToLocalLength,
} from './rearParkRoadNetwork';
import { distanceToPath } from '../utils/rearRoadNetwork';

/**
 * Ambientação georreferenciada da faixa A5 / BR-472.
 *
 * Esta camada não cria uma segunda base cartográfica. Ela prolonga somente o
 * terreno necessário para sustentar a rodovia no limite leste do recorte
 * oficial e mantém todas as entidades existentes como volumes de exclusão.
 */
export const REAR_PARK_ENVIRONMENT_REVISION = '2026.9-area-posterior-ambiente.3';

export type SourcePoint = readonly [number, number];
export type SourceBounds = readonly [number, number, number, number];

export interface RearTerrainPatch {
  id: string;
  sourcePolygon: readonly SourcePoint[];
  baseElevation: number;
  surface: 'grass';
}

/**
 * Polígono único e irregular. A borda interna acompanha o limite do parque e a
 * externa acompanha a continuidade simplificada do terreno além da BR-472;
 * não há placas retangulares ou ilhas desconectadas.
 */
export const REAR_TERRAIN_PATCHES: readonly RearTerrainPatch[] = Object.freeze([
  Object.freeze({
    id: 'br472-east-terrain-continuity',
    sourcePolygon: Object.freeze([
      [5850, 1120],
      [6240, 1045],
      [6550, 1110],
      [6810, 1440],
      [6775, 2200],
      [6900, 3070],
      [6815, 3910],
      [6570, 4580],
      [6120, 4690],
      [5925, 4410],
      [5870, 3600],
      [5885, 2620],
      [5860, 1780],
    ] as const),
    baseElevation: 0,
    surface: 'grass' as const,
  }),
]);

/** Limites de auditoria explícitos, extraídos da planta oficial. */
export const REAR_STRUCTURE_EXCLUSIONS: readonly SourceBounds[] = Object.freeze([
  ETHNIC_QUARTER_SOURCE_BOUNDS,
  [4860, 2650, 5430, 3180], // Arena Shows (F)
  [5410, 2800, 5900, 3120], // campo de futebol
  [3980, 3140, 4530, 3480], // Centro de Eventos (C1)
  [5310, 3360, 6020, 4290], // estacionamento oficial de visitantes
  [5928, 3630, 6020, 3726], // símbolo oficial A5 e margem de acesso
  [3888, 4170, 3990, 4270], // Portão 3 (A3), fora da intervenção
]);

export interface RearVegetationCluster {
  id: string;
  sourceBounds: SourceBounds;
  density: number;
  species: 'canopy' | 'grove' | 'scrub';
  seed: number;
}

/**
 * Corredores lidos nos anexos de satélite: mata mais densa além da rodovia e
 * bordaduras descontínuas do lado do parque. As áreas abertas não recebem uma
 * floresta uniforme.
 */
export const REAR_VEGETATION_CLUSTERS: readonly RearVegetationCluster[] = Object.freeze([
  { id: 'outer-br-north', sourceBounds: [6130, 1360, 6660, 2420], density: 116, species: 'canopy', seed: 29 },
  { id: 'outer-br-middle', sourceBounds: [6140, 2490, 6740, 3540], density: 108, species: 'canopy', seed: 53 },
  { id: 'outer-br-south', sourceBounds: [6150, 3630, 6580, 4390], density: 104, species: 'grove', seed: 79 },
  { id: 'inner-br-north', sourceBounds: [5690, 1420, 5940, 2520], density: 92, species: 'grove', seed: 101 },
  { id: 'inner-br-middle', sourceBounds: [5700, 2580, 5950, 3460], density: 76, species: 'scrub', seed: 127 },
  { id: 'inner-br-south', sourceBounds: [5530, 3770, 5910, 4270], density: 72, species: 'scrub', seed: 151 },
]);

export const REAR_ENVIRONMENT_BUDGET = Object.freeze({
  maximumTreeInstances: 360,
  reducedTreeInstances: 145,
  maximumPoleInstances: 24,
});

function seededRandom(seed: number) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function sourceBoundsToLocal(bounds: SourceBounds) {
  const [x0, z0] = officialPdfPointToLocal([bounds[0], bounds[1]]);
  const [x1, z1] = officialPdfPointToLocal([bounds[2], bounds[3]]);
  return {
    minX: Math.min(x0, x1),
    maxX: Math.max(x0, x1),
    minZ: Math.min(z0, z1),
    maxZ: Math.max(z0, z1),
    width: Math.abs(x1 - x0),
    depth: Math.abs(z1 - z0),
    centerX: (x0 + x1) / 2,
    centerZ: (z0 + z1) / 2,
  };
}

export function sourcePolygonToLocal(polygon: readonly SourcePoint[]) {
  return polygon.map((point) => officialPdfPointToLocal(point));
}

function pointInPolygon(point: readonly [number, number], polygon: readonly (readonly [number, number])[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [xi, zi] = polygon[index];
    const [xj, zj] = polygon[previous];
    const intersects = ((zi > point[1]) !== (zj > point[1]))
      && point[0] < ((xj - xi) * (point[1] - zi)) / ((zj - zi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToPolygon(point: readonly [number, number], polygon: readonly (readonly [number, number])[]) {
  if (pointInPolygon(point, polygon)) return 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSquared));
    nearest = Math.min(nearest, Math.hypot(point[0] - (a[0] + dx * t), point[1] - (a[1] + dz * t)));
  }
  return nearest;
}

const terrainPolygons = REAR_TERRAIN_PATCHES.map((patch) => sourcePolygonToLocal(patch.sourcePolygon));
const protectedOfficialPolygons = OFFICIAL_REFERENCE_DATA.entities.map(
  (entity) => entity.geometry.coordinates[0] as Array<[number, number]>,
);

export interface RearTreeInstance {
  x: number;
  z: number;
  scale: number;
  rotation: number;
  tint: number;
  species: RearVegetationCluster['species'];
}

/** Instâncias determinísticas, filtradas por terreno, vias e geometria oficial. */
export function buildRearTreeInstances(reducedGraphics = false): RearTreeInstance[] {
  const corridors = rearRoadCorridors(true);
  const budget = reducedGraphics
    ? REAR_ENVIRONMENT_BUDGET.reducedTreeInstances
    : REAR_ENVIRONMENT_BUDGET.maximumTreeInstances;
  const instances: RearTreeInstance[] = [];

  for (const cluster of REAR_VEGETATION_CLUSTERS) {
    const random = seededRandom(cluster.seed);
    const area = (cluster.sourceBounds[2] - cluster.sourceBounds[0])
      * (cluster.sourceBounds[3] - cluster.sourceBounds[1]);
    const target = Math.round((area / 1_000_000) * cluster.density * (reducedGraphics ? 0.44 : 1));

    for (let attempt = 0; attempt < target * 12 && instances.length < budget; attempt += 1) {
      const sourceX = cluster.sourceBounds[0]
        + random() * (cluster.sourceBounds[2] - cluster.sourceBounds[0]);
      const sourceZ = cluster.sourceBounds[1]
        + random() * (cluster.sourceBounds[3] - cluster.sourceBounds[1]);
      const local = officialPdfPointToLocal([sourceX, sourceZ]) as [number, number];
      if (!terrainPolygons.some((polygon) => pointInPolygon(local, polygon))) continue;

      const feather = Math.min(
        (sourceX - cluster.sourceBounds[0]) / 180,
        (cluster.sourceBounds[2] - sourceX) / 180,
        (sourceZ - cluster.sourceBounds[1]) / 180,
        (cluster.sourceBounds[3] - sourceZ) / 180,
        1,
      );
      if (random() > Math.max(0.08, feather)) continue;
      if (corridors.some((corridor) => (
        distanceToPath(local, corridor.path) <= corridor.halfWidth + 0.5
      ))) continue;
      if (protectedOfficialPolygons.some((polygon) => distanceToPolygon(local, polygon) <= 0.32)) continue;

      const baseScale = cluster.species === 'scrub' ? 0.34 : cluster.species === 'grove' ? 0.68 : 0.94;
      instances.push({
        x: local[0],
        z: local[1],
        scale: baseScale * (0.68 + random() * 0.82),
        rotation: random() * Math.PI * 2,
        tint: random(),
        species: cluster.species,
      });
      if (instances.length >= budget) break;
    }
  }

  return instances;
}

export interface RearPoleInstance {
  x: number;
  z: number;
  rotation: number;
}

/** Postes apenas no acesso local; a BR-472 não vira corredor urbano. */
export function buildRearPoleInstances(reducedGraphics = false): RearPoleInstance[] {
  if (reducedGraphics) return [];
  const spacing = rearRoadSourceToLocalLength(360);
  const poles: RearPoleInstance[] = [];

  rearRoadCorridors()
    .filter((corridor) => corridor.roadId !== 'RODOVIA-RS-472')
    .forEach((corridor) => {
      let carried = spacing * 0.5;
      for (let index = 0; index < corridor.path.length - 1; index += 1) {
        const [ax, az] = corridor.path[index];
        const [bx, bz] = corridor.path[index + 1];
        const length = Math.hypot(bx - ax, bz - az);
        let cursor = carried;
        while (cursor < length && poles.length < REAR_ENVIRONMENT_BUDGET.maximumPoleInstances) {
          const t = cursor / (length || 1);
          const dirX = (bx - ax) / (length || 1);
          const dirZ = (bz - az) / (length || 1);
          poles.push({
            x: ax + (bx - ax) * t - dirZ * (corridor.halfWidth + 0.22),
            z: az + (bz - az) * t + dirX * (corridor.halfWidth + 0.22),
            rotation: Math.atan2(dirZ, dirX),
          });
          cursor += spacing;
        }
        carried = cursor - length;
      }
    });

  return poles;
}
