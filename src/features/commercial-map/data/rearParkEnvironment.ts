import { officialPdfPointToLocal } from './officialReference2026';
import {
  ETHNIC_QUARTER_SOURCE_BOUNDS,
  rearRoadCorridors,
  rearRoadSourceToLocalLength,
} from './rearParkRoadNetwork';
import { distanceToPath } from '../utils/rearRoadNetwork';

/**
 * Ambientação da área posterior — revisão corretiva 2026.9.2.
 *
 * A ambientação anterior (mata atrás das Etnias, retaguarda da Arena, contexto
 * a leste do recorte) foi REMOVIDA junto com as vias inventadas. O que existe
 * aqui acompanha somente a faixa entre o Portão 5, a continuação da Rua
 * Brasília e a BR-472: mata onde as referências mostram mata, campo aberto onde
 * mostram campo aberto.
 */

export const REAR_PARK_ENVIRONMENT_REVISION = '2026.9-area-posterior-ambiente.2';

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
 * Uma única mancha de terreno, ao sul do parque, cobrindo a descida até a
 * rodovia e um trecho além dela. Sem plataforma retangular a leste, sem borda
 * dura contra as Etnias.
 */
export const REAR_TERRAIN_PATCHES: readonly RearTerrainPatch[] = Object.freeze([
  {
    id: 'rear-south-transition',
    sourceBounds: [2350, 4260, 7400, 6420],
    segments: 56,
    relief: 0.022,
    baseElevation: -0.006,
    surface: 'grass',
  },
]);

/**
 * Estruturas e áreas protegidas que a nova ambientação não pode invadir:
 * quarteirão das Etnias, corredor da Avenida dos Imigrantes, entorno da Arena,
 * apron do Portão 5 e a própria faixa da Exporural.
 */
export const REAR_STRUCTURE_EXCLUSIONS: readonly SourceBounds[] = Object.freeze([
  ETHNIC_QUARTER_SOURCE_BOUNDS,
  [3900, 4130, 5560, 4270],
  [4860, 2650, 5430, 3180],
  [3840, 4180, 4090, 4360],
  [4020, 3780, 4510, 4180],
]);

export interface RearVegetationCluster {
  id: string;
  sourceBounds: SourceBounds;
  /** Árvores por 1.000.000 de pontos² do PDF. */
  density: number;
  species: 'canopy' | 'grove' | 'scrub';
  seed: number;
}

/**
 * Distribuição conforme as referências: mata fechada a oeste da continuação da
 * Rua Brasília, faixas de mata acompanhando a rodovia e vegetação baixa nas
 * margens. As áreas que o satélite mostra abertas continuam abertas.
 */
export const REAR_VEGETATION_CLUSTERS: readonly RearVegetationCluster[] = Object.freeze([
  { id: 'mata-oeste-brasilia', sourceBounds: [2600, 4380, 3820, 5480], density: 44, species: 'canopy', seed: 17 },
  { id: 'margem-norte-br472', sourceBounds: [2500, 5320, 6900, 5620], density: 18, species: 'grove', seed: 41 },
  { id: 'margem-sul-br472', sourceBounds: [2500, 5900, 7200, 6320], density: 15, species: 'grove', seed: 73 },
  { id: 'margem-continuacao', sourceBounds: [4060, 4380, 4460, 5240], density: 20, species: 'scrub', seed: 109 },
  { id: 'bordadura-oeste', sourceBounds: [3700, 4300, 3900, 5300], density: 16, species: 'scrub', seed: 151 },
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
  { id: 'lavoura-sul-1', sourceBounds: [2600, 6040, 4200, 6380], kind: 'farmland', height: 0, tone: '#c3b676' },
  { id: 'lavoura-sul-2', sourceBounds: [4360, 5940, 6200, 6320], kind: 'farmland', height: 0, tone: '#a9b878' },
  { id: 'lavoura-sudeste', sourceBounds: [6360, 5300, 7350, 6200], kind: 'farmland', height: 0, tone: '#b8b271' },
  { id: 'galpao-sul', sourceBounds: [4520, 6060, 4790, 6200], kind: 'building', height: 0.5, tone: '#cbd0cc' },
  { id: 'casa-sul', sourceBounds: [5260, 6020, 5410, 6120], kind: 'building', height: 0.36, tone: '#d8cdbd' },
]);

export const REAR_ENVIRONMENT_BUDGET = Object.freeze({
  maximumTreeInstances: 520,
  reducedTreeInstances: 210,
  maximumPoleInstances: 32,
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
 * o asfalto, sobre o Portão 5, sobre as Etnias ou sobre estruturas oficiais.
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

      const base = cluster.species === 'scrub' ? 0.34 : cluster.species === 'grove' ? 0.66 : 0.94;
      instances.push({
        x: local[0],
        z: local[1],
        scale: base * (0.7 + random() * 0.78),
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

/** Iluminação controlada apenas na via interna e no acesso — nunca na rodovia. */
export function buildRearPoleInstances(reducedGraphics = false): RearPoleInstance[] {
  if (reducedGraphics) return [];
  const spacing = rearRoadSourceToLocalLength(420);
  const poles: RearPoleInstance[] = [];

  rearRoadCorridors()
    .filter((corridor) => corridor.id !== 'BR-472')
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
