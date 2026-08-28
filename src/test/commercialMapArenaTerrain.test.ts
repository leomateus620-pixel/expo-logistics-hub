import { describe, expect, it } from 'vitest';
import {
  ARENA_FRONT_LAYOUT,
  PARK_ENVIRONMENT_FEATURES,
  sourceBoundsToLocal,
} from '@/features/commercial-map/data/parkEnvironment';
import {
  ARENA_FIELD_PLATEAU_ELEVATION,
  ARENA_FOOTBALL_FIELD_BOUNDS,
  ARENA_TERRAIN_BASE_ELEVATION,
  ARENA_TERRAIN_RISE,
  ARENA_TERRAIN_TOP_ELEVATION,
  arenaStairTreadElevation,
  arenaTerrainElevation,
  arenaTerrainPlateauElevation,
} from '@/features/commercial-map/data/arenaTerrain';

const STAIRS = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.stairs.sourceBounds);

describe('terreno reconstruído do entorno da Arena', () => {
  it('substitui o bloco flutuante por um desnível compatível com a escadaria', () => {
    expect(ARENA_FRONT_LAYOUT.stairs.riserHeight).toBeLessThan(0.04);
    expect(ARENA_TERRAIN_RISE).toBeGreaterThan(0.5);
    expect(ARENA_TERRAIN_RISE).toBeLessThan(0.7);
    expect(arenaStairTreadElevation(0)).toBeCloseTo(ARENA_TERRAIN_BASE_ELEVATION, 6);
    expect(arenaStairTreadElevation(ARENA_FRONT_LAYOUT.stairs.stepCount))
      .toBeCloseTo(ARENA_TERRAIN_TOP_ELEVATION, 6);
    // Cada piso é monotônico: nenhum degrau desce ao subir a encosta.
    for (let step = 1; step <= ARENA_FRONT_LAYOUT.stairs.stepCount; step += 1) {
      expect(arenaStairTreadElevation(step)).toBeGreaterThan(arenaStairTreadElevation(step - 1));
    }
  });

  it('mantém o apron da Arena plano e a encosta contínua a oeste', () => {
    const apronX = STAIRS.maxX + 3;
    expect(arenaTerrainElevation(apronX, 0)).toBeCloseTo(ARENA_TERRAIN_BASE_ELEVATION, 6);
    expect(arenaTerrainElevation(apronX, -2)).toBeCloseTo(ARENA_TERRAIN_BASE_ELEVATION, 6);

    const samples = Array.from({ length: 24 }, (_, index) => {
      const x = STAIRS.maxX - (index / 23) * (STAIRS.maxX - STAIRS.minX);
      return arenaTerrainElevation(x, STAIRS.centerZ);
    });
    samples.forEach((elevation, index) => {
      if (index === 0) return;
      expect(elevation).toBeGreaterThanOrEqual(samples[index - 1] - 1e-6);
      // Sem saltos: a malha desce de forma contínua, sem degrau de terreno.
      expect(elevation - samples[index - 1]).toBeLessThan(0.12);
    });
    expect(samples[samples.length - 1]).toBeGreaterThan(samples[0]);
  });

  it('reserva um patamar plano para o campo de futebol sem invadir as quadras', () => {
    const field = ARENA_FOOTBALL_FIELD_BOUNDS;
    expect(field.width).toBeGreaterThan(field.depth);
    const corners: [number, number][] = [
      [field.minX + 0.2, field.minZ + 0.2],
      [field.maxX - 0.2, field.minZ + 0.2],
      [field.minX + 0.2, field.maxZ - 0.2],
      [field.maxX - 0.2, field.maxZ - 0.2],
      [field.centerX, field.centerZ],
    ];
    corners.forEach(([x, z]) => {
      expect(arenaTerrainElevation(x, z)).toBeCloseTo(ARENA_FIELD_PLATEAU_ELEVATION, 2);
    });

    const multi = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.multiSportCourt.sourceBounds);
    const sand = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.sandVolleyballCourt.sourceBounds);
    [multi, sand].forEach((court) => {
      const overlaps = field.maxX > court.minX && field.minX < court.maxX
        && field.maxZ > court.minZ && field.minZ < court.maxZ;
      expect(overlaps).toBe(false);
      // Quadras seguem no trecho plano, junto ao apron.
      expect(arenaTerrainPlateauElevation(court)).toBeCloseTo(ARENA_TERRAIN_BASE_ELEVATION, 2);
    });
    expect(field.maxZ).toBeLessThan(STAIRS.minZ);
  });

  it('registra terreno, campo e caminhos como apresentação não comercial', () => {
    ['arena-front-natural-terrain', 'arena-front-football-field', 'arena-front-pedestrian-paths']
      .forEach((id) => {
        const feature = PARK_ENVIRONMENT_FEATURES.find((candidate) => candidate.id === id);
        expect(feature, id).toBeDefined();
        expect(feature!.isSellable).toBe(false);
        expect(feature!.contributesToCommercialMetrics).toBe(false);
      });
    expect(ARENA_FRONT_LAYOUT.walkways.length).toBeGreaterThanOrEqual(3);
    expect(ARENA_FRONT_LAYOUT.treeClusters.length).toBeGreaterThanOrEqual(10);
  });
});
