import { OFFICIAL_REFERENCE_DATA, officialPdfPointToLocal } from './officialReference2026';
import {
  ETHNIC_QUARTER_SOURCE_BOUNDS,
  rearRoadCorridors,
  rearRoadSourceToLocalLength,
} from './rearParkRoadNetwork';
import { buildRearRoadCorridorFootprints, distanceToPath } from '../utils/rearRoadNetwork';
import { REAR_SATELLITE_TOPOLOGY } from '../utils/rearSpatialCalibration';

/**
 * Ambientação georreferenciada entre a borda leste do parque e a BR-472
 * externa.
 *
 * Esta camada não cria uma segunda base cartográfica. Ela prolonga o terreno
 * oficial por uma única faixa irregular e mantém livres os três corredores:
 * Rua Brasília, acesso do Portão 5 e BR-472.
 */
export const REAR_PARK_ENVIRONMENT_REVISION = '2026.9-arena-west-field-satellite.2';

export type SourcePoint = readonly [number, number];
export type SourceBounds = readonly [number, number, number, number];

export interface RearTerrainPatch {
  id: string;
  sourcePolygon: readonly SourcePoint[];
  baseElevation: number;
  surface: 'grass';
}

/**
 * Correspondências do IMG_9936. A numeração do satélite é deliberadamente
 * separada dos seis pontos do IMG_9933.
 */
export const REAR_ENVIRONMENT_REFERENCE_POINTS = Object.freeze({
  approach: Object.freeze(REAR_SATELLITE_TOPOLOGY.points[0].officialSource),
  gate5: Object.freeze(REAR_SATELLITE_TOPOLOGY.points[1].officialSource),
  br472Junction: Object.freeze(REAR_SATELLITE_TOPOLOGY.points[2].officialSource),
});

/**
 * Polígono único e irregular. A borda interna acompanha o limite do parque e a
 * externa acompanha a continuidade simplificada do terreno além da BR-472;
 * não há placas retangulares ou ilhas desconectadas.
 */
export const REAR_TERRAIN_PATCHES: readonly RearTerrainPatch[] = Object.freeze([
  Object.freeze({
    id: 'gate5-br472-environmental-continuity',
    sourcePolygon: Object.freeze([
      // Costura interna: acompanha o limite leste sem cobrir as vias.
      [5720, 820],
      [6120, 790],
      [6580, 890],
      // Borda externa: continuidade simplificada além da BR-472.
      [6800, 1120],
      [6870, 1650],
      [6820, 2150],
      [6740, 2650],
      [6635, 3150],
      [6500, 3600],
      [6300, 4070],
      [6140, 4400],
      [5800, 4340],
      // Retorno irregular pela borda externa do parque.
      [5540, 3960],
      [5375, 3525],
      [5460, 3160],
      [5540, 2710],
      [5610, 2150],
      [5685, 1500],
      [5720, 1050],
    ] as const),
    baseElevation: 0,
    surface: 'grass' as const,
  }),
]);

/** Limites de auditoria explícitos, extraídos da planta oficial. */
export const REAR_STRUCTURE_EXCLUSIONS: readonly SourceBounds[] = Object.freeze([
  ETHNIC_QUARTER_SOURCE_BOUNDS,
  [4860, 2650, 5430, 3180], // Arena Shows (F)
  [4660, 2860, 4880, 3200], // campo estreito N-S no gramado a oeste/sudoeste da Arena
  [3980, 3140, 4530, 3480], // Centro de Eventos (C1)
  [3970, 2420, 4120, 2850], // Espaço Mirante (D3)
  [4960, 2350, 5120, 2500], // Churrascaria Exporural (C4)
  [5310, 3360, 6020, 4290], // estacionamento oficial de visitantes
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
  // Manchas além da BR: densas, porém descontínuas e afastadas do acostamento.
  { id: 'outer-br-north', sourceBounds: [6610, 1120, 6810, 1660], density: 110, species: 'canopy', seed: 29 },
  { id: 'outer-br-p8', sourceBounds: [6510, 1770, 6760, 2350], density: 110, species: 'canopy', seed: 53 },
  { id: 'outer-br-middle', sourceBounds: [6400, 2440, 6630, 3020], density: 100, species: 'canopy', seed: 79 },
  { id: 'outer-br-south', sourceBounds: [6270, 3100, 6480, 3690], density: 88, species: 'grove', seed: 101 },
  { id: 'outer-br-terminal', sourceBounds: [6110, 3740, 6270, 4200], density: 78, species: 'grove', seed: 127 },
  // Corredor intermediário: alterna mata, clareiras e vegetação baixa.
  { id: 'intermediate-north', sourceBounds: [5940, 1050, 6380, 1580], density: 80, species: 'grove', seed: 151 },
  { id: 'intermediate-p9', sourceBounds: [5870, 1660, 6270, 2260], density: 92, species: 'canopy', seed: 179 },
  { id: 'intermediate-middle', sourceBounds: [5750, 2330, 6160, 2920], density: 78, species: 'grove', seed: 211 },
  { id: 'intermediate-south', sourceBounds: [5580, 2970, 6030, 3470], density: 62, species: 'scrub', seed: 239 },
  { id: 'gate-approach-low', sourceBounds: [5520, 3540, 5960, 4000], density: 48, species: 'scrub', seed: 269 },
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
const protectedOfficialPolygons = OFFICIAL_REFERENCE_DATA.entities
  // Estas três superfícies são substituídas pela apresentação calibrada.
  .filter((entity) => !['RUA-BRASILIA', 'RUA-UBIRETAMA', 'RODOVIA-RS-472']
    .includes(entity.publicIdentifier))
  .map((entity) => entity.geometry.coordinates[0] as Array<[number, number]>);
const protectedStructurePolygons = REAR_STRUCTURE_EXCLUSIONS.map((bounds) => {
  const local = sourceBoundsToLocal(bounds);
  return [
    [local.minX, local.minZ],
    [local.maxX, local.minZ],
    [local.maxX, local.maxZ],
    [local.minX, local.maxZ],
  ] as const;
});

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
    let clusterInstances = 0;

    for (let attempt = 0; attempt < target * 16 && instances.length < budget; attempt += 1) {
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
        distanceToPath(local, corridor.path) <= corridor.halfWidth
          // Folga inclui a copa, não apenas o tronco/base instanciada.
          + (corridor.roadId === 'RODOVIA-RS-472' ? 0.9 : 0.8)
      ))) continue;
      if (protectedOfficialPolygons.some((polygon) => distanceToPolygon(local, polygon) <= 0.32)) continue;
      if (protectedStructurePolygons.some((polygon) => distanceToPolygon(local, polygon) <= 0.32)) continue;

      const baseScale = cluster.species === 'scrub' ? 0.34 : cluster.species === 'grove' ? 0.68 : 0.94;
      instances.push({
        x: local[0],
        z: local[1],
        scale: baseScale * (0.68 + random() * 0.82),
        rotation: random() * Math.PI * 2,
        tint: random(),
        species: cluster.species,
      });
      clusterInstances += 1;
      if (instances.length >= budget || clusterInstances >= target) break;
    }
  }

  return instances;
}

export interface RearPoleInstance {
  x: number;
  z: number;
  rotation: number;
}

/** Postes apenas no acesso A5–BR; nenhuma das três vias vira corredor urbano. */
export function buildRearPoleInstances(reducedGraphics = false): RearPoleInstance[] {
  if (reducedGraphics) return [];
  const spacing = rearRoadSourceToLocalLength(90);
  const poles: RearPoleInstance[] = [];
  const footprints = buildRearRoadCorridorFootprints(undefined, { includeShoulders: true });

  rearRoadCorridors()
    .filter((corridor) => corridor.roadId === 'ACESSO-A5-BR472')
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
          // At P4/J a verge of one segment may be another road's pavement.
          // Try both verges deterministically and retain the same pole budget.
          const position = [0.22, 0.45, 0.75, 1.1, 1.5, 2].flatMap((clearance) => [1, -1].map((side) => [
            ax + (bx - ax) * t - dirZ * (corridor.halfWidth + clearance) * side,
            az + (bz - az) * t + dirX * (corridor.halfWidth + clearance) * side,
          ] as const)).find((candidate) => (
            !protectedOfficialPolygons.some((polygon) => distanceToPolygon(candidate, polygon) <= 0.18)
            && !footprints.some((footprint) => (
              distanceToPath(candidate, footprint.centerline) <= footprint.halfWidth + 0.08
            ))
            && !poles.some((pole) => Math.hypot(candidate[0] - pole.x, candidate[1] - pole.z) < 0.3)
          ));
          if (!position) {
            cursor += spacing;
            continue;
          }
          poles.push({
            x: position[0],
            z: position[1],
            rotation: Math.atan2(dirZ, dirX),
          });
          cursor += spacing;
        }
        carried = cursor - length;
      }
    });

  return poles;
}
