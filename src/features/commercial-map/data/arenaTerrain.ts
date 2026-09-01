import { ARENA_FRONT_LAYOUT, sourceBoundsToLocal } from './parkEnvironment';

/**
 * Modelo de cota do setor da Arena Sicredi - Icatu.
 *
 * Uma única função de altura é compartilhada por terreno, escadaria, taludes,
 * quadras, campo, caminhos e vegetação: é o que garante que nada volte a
 * "flutuar" sobre a antiga praça plana. Apresentação pura — nenhuma cota daqui
 * alimenta lote, métrica comercial ou geometria oficial.
 */

export const ARENA_TERRAIN_REVISION = '2026.7-arena-terreno-natural.1';

/** Cota do apron pavimentado diante da Arena (leste). */
export const ARENA_TERRAIN_BASE_ELEVATION = ARENA_FRONT_LAYOUT.plaza.elevation;

/** Desnível total entre o terraço oeste e o apron leste. */
export const ARENA_TERRAIN_RISE =
  ARENA_FRONT_LAYOUT.stairs.stepCount * ARENA_FRONT_LAYOUT.stairs.riserHeight;

export const ARENA_TERRAIN_TOP_ELEVATION = ARENA_TERRAIN_BASE_ELEVATION + ARENA_TERRAIN_RISE;

const STAIRS = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.stairs.sourceBounds);

/** Início (leste) e fim (oeste) da rampa natural, alinhados à corrida da escadaria. */
const SLOPE_EAST_X = STAIRS.maxX - ARENA_FRONT_LAYOUT.stairs.lowerLandingDepth;
const SLOPE_WEST_X = STAIRS.minX + ARENA_FRONT_LAYOUT.stairs.upperLandingDepth;

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge1 === edge0) return value < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Perfil longitudinal (0 no apron leste, 1 no terraço oeste). */
export function arenaTerrainSlopeFactor(x: number) {
  return smoothstep(SLOPE_EAST_X, SLOPE_WEST_X, x);
}

/**
 * Ondulação suave, determinística e de baixa frequência. Desaparece por
 * completo no apron pavimentado para não brigar com o piso plano da Arena.
 */
function gentleUndulation(x: number, z: number) {
  const apronFade = 1 - smoothstep(SLOPE_EAST_X - 0.6, SLOPE_EAST_X + 1.8, x);
  const wave =
    Math.sin(x * 0.62 + z * 0.31) * 0.6 +
    Math.sin(z * 0.44 - x * 0.19) * 0.4;
  return wave * 0.018 * apronFade;
}

// ANALYST: follows footballField — move WEST of F with
// `[4560, 2708, 4884, 2948]` (arena-roads/ANALYSIS.md §3.3). FIELD_BLEND → 0.45.
const FIELD = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.footballField.sourceBounds);
/** Blend, em unidades locais, entre o patamar do campo e o terreno em volta. */
const FIELD_BLEND = 0.45;

function distanceToRectangle(
  x: number,
  z: number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
) {
  const dx = Math.max(bounds.minX - x, 0, x - bounds.maxX);
  const dz = Math.max(bounds.minZ - z, 0, z - bounds.maxZ);
  return Math.hypot(dx, dz);
}

function slopeElevation(x: number, z: number) {
  return ARENA_TERRAIN_BASE_ELEVATION + ARENA_TERRAIN_RISE * arenaTerrainSlopeFactor(x)
    + gentleUndulation(x, z);
}

/** Patamar plano que recebe o campo de futebol, tirado da cota central da encosta. */
export const ARENA_FIELD_PLATEAU_ELEVATION = ARENA_TERRAIN_BASE_ELEVATION
  + ARENA_TERRAIN_RISE * arenaTerrainSlopeFactor((FIELD.minX + FIELD.maxX) / 2);

export function arenaTerrainElevation(x: number, z: number) {
  const natural = slopeElevation(x, z);
  const distance = distanceToRectangle(x, z, FIELD);
  if (distance >= FIELD_BLEND) return natural;
  const weight = 1 - smoothstep(0, FIELD_BLEND, distance);
  return natural + (ARENA_FIELD_PLATEAU_ELEVATION - natural) * weight;
}

export const ARENA_FOOTBALL_FIELD_BOUNDS = FIELD;

/** Maior cota amostrada em um retângulo — usada para assentar superfícies planas. */
export function arenaTerrainPlateauElevation(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  samples = 6,
) {
  let highest = Number.NEGATIVE_INFINITY;
  for (let ix = 0; ix <= samples; ix += 1) {
    const x = bounds.minX + ((bounds.maxX - bounds.minX) * ix) / samples;
    for (let iz = 0; iz <= samples; iz += 1) {
      const z = bounds.minZ + ((bounds.maxZ - bounds.minZ) * iz) / samples;
      highest = Math.max(highest, arenaTerrainElevation(x, z));
    }
  }
  return highest;
}

/**
 * Cota do piso da escadaria em um degrau (0 = base leste, stepCount = topo).
 * O primeiro e o último degrau encostam nas cotas reais do terreno.
 */
export function arenaStairTreadElevation(step: number) {
  const clamped = Math.min(Math.max(step, 0), ARENA_FRONT_LAYOUT.stairs.stepCount);
  return ARENA_TERRAIN_BASE_ELEVATION + clamped * ARENA_FRONT_LAYOUT.stairs.riserHeight;
}

export const ARENA_STAIR_GEOMETRY = Object.freeze({
  bounds: STAIRS,
  slopeEastX: SLOPE_EAST_X,
  slopeWestX: SLOPE_WEST_X,
});
