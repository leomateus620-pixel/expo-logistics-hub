import { officialPdfPointToLocal } from './officialReference2026';
import { rearRoadCorridors, rearRoadSourceToLocalLength } from './rearParkRoadNetwork';
import { distanceToPath } from '../utils/rearRoadNetwork';

/**
 * Ambientação da área posterior: terreno ampliado até (e além) da BR-472,
 * vegetação, drenagem, iluminação e contexto externo. Camada de apresentação,
 * sem qualquer relação com inventário comercial, lotes ou métricas.
 */

export const REAR_PARK_ENVIRONMENT_REVISION = '2026.9-area-posterior-ambiente.1';

export type SourceBounds = readonly [number, number, number, number];

export interface RearTerrainPatch {
  id: string;
  /** [x0, y0, x1, y1] em pontos do PDF oficial. */
  sourceBounds: SourceBounds;
  /** Divisões da malha no eixo maior (reduzidas no modo gráfico econômico). */
  segments: number;
  /** Amplitude do relevo, em unidades locais. */
  relief: number;
  baseElevation: number;
  surface: 'grass' | 'compactedSoil';
}

/**
 * Duas manchas: a faixa sul (transição parque → rodovia) e a faixa leste (atrás
 * da Arena, além do recorte oficial). Ambas ficam fora dos polígonos oficiais
 * para não cobrir lotes, quadras ou edificações existentes.
 */
export const REAR_TERRAIN_PATCHES: readonly RearTerrainPatch[] = Object.freeze([
  {
    id: 'rear-south-transition',
    sourceBounds: [3050, 4250, 6100, 6100],
    segments: 48,
    relief: 0.018,
    baseElevation: -0.004,
    surface: 'grass',
  },
  {
    id: 'rear-east-context',
    sourceBounds: [6100, 1100, 7250, 6100],
    segments: 40,
    relief: 0.02,
    baseElevation: -0.004,
    surface: 'grass',
  },
]);

/** Estruturas oficiais que a vegetação e o contexto externo não podem invadir. */
export const REAR_STRUCTURE_EXCLUSIONS: readonly SourceBounds[] = Object.freeze([
  [4550, 4380, 4780, 4780],
  [4620, 4360, 4760, 4500],
  [5110, 4360, 5250, 4500],
  [5060, 4380, 5300, 4780],
  [5060, 4740, 5300, 5090],
  [3900, 4130, 5560, 4270],
  [4860, 3060, 5430, 4180],
]);

export interface RearVegetationCluster {
  id: string;
  sourceBounds: SourceBounds;
  /** Árvores por 1.000.000 de pontos² do PDF. */
  density: number;
  species: 'canopy' | 'grove' | 'scrub';
  seed: number;
}

export const REAR_VEGETATION_CLUSTERS: readonly RearVegetationCluster[] = Object.freeze([
  { id: 'mata-sudoeste', sourceBounds: [3080, 4320, 4020, 5240], density: 46, species: 'canopy', seed: 17 },
  { id: 'faixa-rodovia', sourceBounds: [3200, 5000, 6000, 5320], density: 16, species: 'grove', seed: 41 },
  { id: 'margem-sul-br472', sourceBounds: [3100, 5620, 6800, 6050], density: 20, species: 'grove', seed: 73 },
  { id: 'entorno-etnias', sourceBounds: [4100, 4300, 5900, 4900], density: 12, species: 'grove', seed: 109 },
  { id: 'retaguarda-arena', sourceBounds: [5480, 3120, 6100, 4300], density: 18, species: 'canopy', seed: 151 },
  { id: 'mata-leste', sourceBounds: [6180, 1400, 7200, 4100], density: 24, species: 'canopy', seed: 197 },
  { id: 'baixa-vegetacao-acesso', sourceBounds: [4060, 4700, 4700, 5300], density: 22, species: 'scrub', seed: 233 },
]);

export interface RearContextBlock {
  id: string;
  sourceBounds: SourceBounds;
  kind: 'farmland' | 'building';
  /** Altura em unidades locais (apenas para `building`). */
  height: number;
  tone: string;
}

/** Contexto mínimo além da rodovia, para que a BR-472 não fique solta no vazio. */
export const REAR_CONTEXT_BLOCKS: readonly RearContextBlock[] = Object.freeze([
  { id: 'lavoura-sul-1', sourceBounds: [3080, 5720, 4460, 6080], kind: 'farmland', height: 0, tone: '#c3b676' },
  { id: 'lavoura-sul-2', sourceBounds: [4520, 5620, 5880, 6060], kind: 'farmland', height: 0, tone: '#a9b878' },
  { id: 'lavoura-leste', sourceBounds: [6420, 4400, 7220, 5700], kind: 'farmland', height: 0, tone: '#b8b271' },
  { id: 'lavoura-nordeste', sourceBounds: [6320, 1300, 7200, 3200], kind: 'farmland', height: 0, tone: '#adba7d' },
  { id: 'galpao-sul', sourceBounds: [4700, 5780, 4960, 5920], kind: 'building', height: 0.55, tone: '#cbd0cc' },
  { id: 'casa-sul', sourceBounds: [5300, 5760, 5450, 5860], kind: 'building', height: 0.4, tone: '#d8cdbd' },
  { id: 'galpao-leste', sourceBounds: [6700, 3700, 6980, 3900], kind: 'building', height: 0.5, tone: '#c9cec9' },
]);

export const REAR_ENVIRONMENT_BUDGET = Object.freeze({
  maximumTreeInstances: 620,
  reducedTreeInstances: 240,
  maximumPoleInstances: 48,
});

function seededRandom(seed: number) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function sourceBoundsToLocal(bounds: SourceBounds) {
  const [x0, y0] = officialPdfPointToLocal([bounds[0], bounds[1]]);
  const [x1, y1] = officialPdfPointToLocal([bounds[2], bounds[3]]);
  return {
    minX: Math.min(x0, x1),
    maxX: Math.max(x0, x1),
    minZ: Math.min(y0, y1),
    maxZ: Math.max(y0, y1),
    width: Math.abs(x1 - x0),
    depth: Math.abs(y1 - y0),
    centerX: (x0 + x1) / 2,
    centerZ: (y0 + y1) / 2,
  };
}

function insideSourceBounds(x: number, y: number, bounds: SourceBounds, padding = 0) {
  return x >= bounds[0] - padding
    && x <= bounds[2] + padding
    && y >= bounds[1] - padding
    && y <= bounds[3] + padding;
}

export interface RearTreeInstance {
  x: number;
  z: number;
  scale: number;
  rotation: number;
  tint: number;
  species: RearVegetationCluster['species'];
}

/**
 * Distribuição determinística: mesma cena a cada renderização, sem árvores sobre
 * o asfalto, sobre estruturas oficiais ou fora do terreno ampliado.
 */
export function buildRearTreeInstances(reducedGraphics = false): RearTreeInstance[] {
  const corridors = rearRoadCorridors();
  const budget = reducedGraphics
    ? REAR_ENVIRONMENT_BUDGET.reducedTreeInstances
    : REAR_ENVIRONMENT_BUDGET.maximumTreeInstances;
  const instances: RearTreeInstance[] = [];

  REAR_VEGETATION_CLUSTERS.forEach((cluster) => {
    const random = seededRandom(cluster.seed);
    const area = (cluster.sourceBounds[2] - cluster.sourceBounds[0])
      * (cluster.sourceBounds[3] - cluster.sourceBounds[1]);
    const target = Math.round((area / 1_000_000) * cluster.density * (reducedGraphics ? 0.42 : 1));

    for (let attempt = 0; attempt < target * 4 && instances.length < budget; attempt += 1) {
      const sourceX = cluster.sourceBounds[0]
        + random() * (cluster.sourceBounds[2] - cluster.sourceBounds[0]);
      const sourceY = cluster.sourceBounds[1]
        + random() * (cluster.sourceBounds[3] - cluster.sourceBounds[1]);
      if (REAR_STRUCTURE_EXCLUSIONS.some((bounds) => insideSourceBounds(sourceX, sourceY, bounds, 40))) {
        continue;
      }
      if (REAR_CONTEXT_BLOCKS.some((block) => block.kind === 'building'
        && insideSourceBounds(sourceX, sourceY, block.sourceBounds, 60))) {
        continue;
      }

      const local = officialPdfPointToLocal([sourceX, sourceY]);
      const clear = corridors.every(
        (corridor) => distanceToPath(local, corridor.path) > corridor.halfWidth + 0.55,
      );
      if (!clear) continue;

      const base = cluster.species === 'scrub' ? 0.36 : cluster.species === 'grove' ? 0.68 : 0.95;
      instances.push({
        x: local[0],
        z: local[1],
        scale: base * (0.7 + random() * 0.75),
        rotation: random() * Math.PI * 2,
        tint: random(),
        species: cluster.species,
      });
      if (instances.length >= target * 8) break;
    }
  });

  return instances;
}

export interface RearPoleInstance {
  x: number;
  z: number;
  rotation: number;
}

/** Iluminação controlada apenas nas vias internas e no acesso. */
export function buildRearPoleInstances(reducedGraphics = false): RearPoleInstance[] {
  if (reducedGraphics) return [];
  const spacing = rearRoadSourceToLocalLength(420);
  const poles: RearPoleInstance[] = [];

  rearRoadCorridors()
    .filter((corridor) => corridor.id !== 'BR-472' && corridor.id !== 'RS-472-CONTINUACAO')
    .forEach((corridor) => {
      let carried = spacing * 0.5;
      for (let index = 0; index < corridor.path.length - 1; index += 1) {
        const [ax, az] = corridor.path[index];
        const [bx, bz] = corridor.path[index + 1];
        const length = Math.hypot(bx - ax, bz - az);
        let cursor = carried;
        while (cursor < length && poles.length < REAR_ENVIRONMENT_BUDGET.maximumPoleInstances) {
          const t = cursor / length;
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
