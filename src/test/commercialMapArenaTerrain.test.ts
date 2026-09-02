import { describe, expect, it } from 'vitest';
import {
  ARENA_FRONT_LAYOUT,
  PARK_ENVIRONMENT_FEATURES,
  sourceBoundsToLocal,
} from '@/features/commercial-map/data/parkEnvironment';
import {
  ARENA_WEST_APRON_ELEVATION,
  ARENA_WEST_APRON_BOUNDS,
  ARENA_TERRAIN_BASE_ELEVATION,
  ARENA_TERRAIN_RISE,
  ARENA_TERRAIN_TOP_ELEVATION,
  arenaStairTreadElevation,
  arenaTerrainElevation,
  arenaTerrainPlateauElevation,
} from '@/features/commercial-map/data/arenaTerrain';
import {
  isArenaTerrainExcluded,
  resolveArenaSurfaceOwner,
} from '@/features/commercial-map/data/arenaSectorZoning';

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

  it('reserva um patamar plano para o campo não demarcado a oeste da Arena', () => {
    const field = ARENA_WEST_APRON_BOUNDS;
    expect(field.depth).toBeGreaterThan(field.width);
    expect(ARENA_FRONT_LAYOUT.westApron.markings).toBe(false);
    const corners: [number, number][] = [
      [field.minX + 0.2, field.minZ + 0.2],
      [field.maxX - 0.2, field.minZ + 0.2],
      [field.minX + 0.2, field.maxZ - 0.2],
      [field.maxX - 0.2, field.maxZ - 0.2],
      [field.centerX, field.centerZ],
    ];
    corners.forEach(([x, z]) => {
      expect(arenaTerrainElevation(x, z)).toBeCloseTo(ARENA_WEST_APRON_ELEVATION, 2);
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
    // Zoneamento corrigido: o campo fica entre a escadaria e a face oeste da Arena.
    const arena = sourceBoundsToLocal([4900, 2690, 5385, 3130]);
    expect(field.maxX).toBeLessThan(arena.minX);
    expect(field.minX).toBeGreaterThan(STAIRS.maxX);
    expect(field.centerZ).toBeGreaterThan(multi.maxZ);
    expect(field.centerZ).toBeGreaterThan(arena.centerZ);

    // A antiga área a leste volta a seguir o terreno natural, sem patamar ou recorte esportivo.
    const oldFieldCenter = sourceBoundsToLocal([5410, 2800, 5900, 3120]);
    expect(arenaTerrainElevation(oldFieldCenter.centerX, oldFieldCenter.centerZ))
      .toBeCloseTo(ARENA_TERRAIN_BASE_ELEVATION, 6);
    expect(resolveArenaSurfaceOwner(oldFieldCenter.centerX, oldFieldCenter.centerZ)).toBe(null);
  });

  it('registra terreno, campo e caminhos como apresentação não comercial', () => {
    ['arena-front-natural-terrain', 'arena-front-west-apron', 'arena-front-pedestrian-paths']
      .forEach((id) => {
        const feature = PARK_ENVIRONMENT_FEATURES.find((candidate) => candidate.id === id);
        expect(feature, id).toBeDefined();
        expect(feature!.isSellable).toBe(false);
        expect(feature!.contributesToCommercialMetrics).toBe(false);
      });
    expect(ARENA_FRONT_LAYOUT.walkways.length).toBeGreaterThanOrEqual(3);
    expect(ARENA_FRONT_LAYOUT.treeClusters.length).toBeGreaterThanOrEqual(10);
  });

  it('impede que o terreno natural invada concreto, quadras, vias ou estacionamento', () => {
    const plaza = sourceBoundsToLocal([4200, 2750, 4800, 3050]);
    const arena = sourceBoundsToLocal([4900, 2690, 5385, 3130]);
    const multi = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.multiSportCourt.sourceBounds);
    const parking = sourceBoundsToLocal([4600, 3300, 5200, 3900]);
    [plaza, arena, multi, parking].forEach((zone) => {
      expect(isArenaTerrainExcluded(zone.centerX, zone.centerZ)).toBe(true);
    });
    expect(resolveArenaSurfaceOwner(arena.centerX, arena.centerZ)).toBe('ARENA_STRUCTURE');

    // O centro do campo largo/norte rejeitado volta a pertencer à laje.
    const rejectedField = sourceBoundsToLocal([4560, 2708, 4884, 2948]);
    expect(resolveArenaSurfaceOwner(rejectedField.centerX, rejectedField.centerZ))
      .toBe('CONCRETE_ACCESS');

    // O entorno leste/sudeste segue sendo terreno natural, sem plano branco genérico.
    const rear = sourceBoundsToLocal([5900, 2500, 5960, 2560]);
    expect(isArenaTerrainExcluded(rear.centerX, rear.centerZ)).toBe(false);

    const field = ARENA_WEST_APRON_BOUNDS;
    for (const x of [field.minX + 0.1, field.centerX, field.maxX - 0.1]) {
      for (const z of [field.minZ + 0.1, field.centerZ, field.maxZ - 0.1]) {
        expect(resolveArenaSurfaceOwner(x, z)).toBe('CONCRETE_ACCESS');
      }
    }
    const removedEastField = sourceBoundsToLocal([5410, 2800, 5900, 3120]);
    expect(isArenaTerrainExcluded(removedEastField.centerX, removedEastField.centerZ)).toBe(false);

    const smoothConcrete = sourceBoundsToLocal([5200, 2410, 5300, 2470]);
    expect(resolveArenaSurfaceOwner(smoothConcrete.centerX, smoothConcrete.centerZ)).toBe('CONCRETE_ACCESS');
    expect(isArenaTerrainExcluded(smoothConcrete.centerX, smoothConcrete.centerZ)).toBe(true);
  });
});
