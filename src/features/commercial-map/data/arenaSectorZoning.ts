import { officialPdfPointToLocal } from './officialReference2026';
import { ARENA_FRONT_LAYOUT } from './parkEnvironment';

/**
 * Zoneamento do setor da Arena Sicredi - Icatu.
 *
 * Cada zona abaixo pertence a outra camada (arquitetura, escadaria, quadras,
 * estacionamento, via, campo). O terreno natural é recortado contra elas: grama
 * e solo nunca podem cobrir concreto, quadras, estacionamento ou vias.
 *
 * Prioridade de superfície (maior vence):
 * estruturas > escadaria/praça > quadras > estacionamento > vias > campo > terreno.
 */

export type ArenaSurfaceOwner =
  | 'ARENA_STRUCTURE'
  | 'CONCRETE_ACCESS'
  | 'SPORTS_COURT'
  | 'PARKING'
  | 'ROAD'
  | 'SPORTS_FIELD';

type SourcePoint = readonly [number, number];

export interface ArenaSurfaceZone {
  id: string;
  owner: ArenaSurfaceOwner;
  priority: number;
  sourcePolygon: readonly SourcePoint[];
}

const OWNER_PRIORITY: Readonly<Record<ArenaSurfaceOwner, number>> = {
  ARENA_STRUCTURE: 90,
  CONCRETE_ACCESS: 80,
  SPORTS_COURT: 70,
  PARKING: 60,
  ROAD: 50,
  SPORTS_FIELD: 40,
};

function rect(bounds: readonly [number, number, number, number]): readonly SourcePoint[] {
  const [minX, minZ, maxX, maxZ] = bounds;
  return [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]];
}

function zone(
  id: string,
  owner: ArenaSurfaceOwner,
  sourcePolygon: readonly SourcePoint[],
): ArenaSurfaceZone {
  return { id, owner, priority: OWNER_PRIORITY[owner], sourcePolygon };
}

/** Margem de segurança (em unidades de origem) para não deixar costura de grama. */
const EDGE = 14;

function inflate(bounds: readonly [number, number, number, number]) {
  return [bounds[0] - EDGE, bounds[1] - EDGE, bounds[2] + EDGE, bounds[3] + EDGE] as const;
}

/** Zonas que o terreno natural nunca pode invadir. */
export const ARENA_SECTOR_SURFACE_ZONES: readonly ArenaSurfaceZone[] = [
  // Arena Sicredi - Icatu (entidade oficial F) e o apron imediato.
  zone('arena-footprint', 'ARENA_STRUCTURE', rect(inflate([4900, 2690, 5385, 3130]))),
  // Churrascaria Exporural (C4), imediatamente ao norte da Arena.
  zone('churrascaria-exporural', 'ARENA_STRUCTURE', rect(inflate([4980, 2370, 5100, 2480]))),
  // Praça cívica pavimentada + escadaria de concreto: acesso da Arena.
  zone('arena-plaza-concrete', 'CONCRETE_ACCESS', ARENA_FRONT_LAYOUT.plaza.sourcePolygon),
  zone('arena-stairs-concrete', 'CONCRETE_ACCESS', rect(inflate(ARENA_FRONT_LAYOUT.stairs.sourceBounds))),
  zone('arena-covered-access', 'CONCRETE_ACCESS', rect(inflate(ARENA_FRONT_LAYOUT.accessCanopy.sourceBounds))),
  // Quadras existentes: geometria preservada, apenas protegida do terreno.
  zone('multi-sport-court', 'SPORTS_COURT', rect(inflate(ARENA_FRONT_LAYOUT.multiSportCourt.sourceBounds))),
  zone('sand-volleyball-court', 'SPORTS_COURT', rect(inflate(ARENA_FRONT_LAYOUT.sandVolleyballCourt.sourceBounds))),
  // Estacionamentos oficiais atrás da Arena.
  zone('parking-expositores-visitantes', 'PARKING', [[4510, 3220], [5350, 3260], [5270, 4140], [4510, 4140]]),
  zone('parking-visitantes', 'PARKING', [[5350, 3400], [5980, 3480], [5900, 4250], [5350, 4140]]),
  // Rua Brasil, chegando pelo oeste.
  zone('rua-brasil', 'ROAD', rect([4106, 3096, 4520, 3191])),
  // Campo gramado sem marcações: superfície própria a oeste da Arena.
  zone('football-field', 'SPORTS_FIELD', rect(inflate(ARENA_FRONT_LAYOUT.footballField.sourceBounds))),
];

const LOCAL_ZONES = ARENA_SECTOR_SURFACE_ZONES.map((item) => ({
  ...item,
  polygon: item.sourcePolygon.map((point) => officialPdfPointToLocal(point)),
}));

function pointInPolygon(x: number, z: number, polygon: readonly (readonly [number, number])[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    const intersects = (zi > z) !== (zj > z)
      && x < ((xj - xi) * (z - zi)) / (zj - zi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Retorna o dono da superfície naquele ponto, ou null quando é terreno natural. */
export function resolveArenaSurfaceOwner(x: number, z: number): ArenaSurfaceOwner | null {
  let winner: ArenaSurfaceOwner | null = null;
  let bestPriority = -1;
  LOCAL_ZONES.forEach((item) => {
    if (item.priority <= bestPriority) return;
    if (!pointInPolygon(x, z, item.polygon)) return;
    winner = item.owner;
    bestPriority = item.priority;
  });
  return winner;
}

/** True quando o ponto pertence a outra camada e deve ser removido do terreno. */
export function isArenaTerrainExcluded(x: number, z: number) {
  return resolveArenaSurfaceOwner(x, z) !== null;
}

export const ARENA_SECTOR_ZONING_REVISION = '2028.2-arena-west-field-satellite.1';
