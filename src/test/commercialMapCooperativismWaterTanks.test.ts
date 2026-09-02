import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HYDROLOGICAL_NODES } from '@/features/commercial-map/data/hydrologicalInfrastructure';
import {
  OFFICIAL_REFERENCE_ENTITIES,
  OFFICIAL_RENDERED_ENTITIES,
} from '@/features/commercial-map/data/officialReference2026';
import {
  COOPERATIVISM_WATER_TANK_LAYOUT,
  COOPERATIVISM_WATER_TANK_PLAN,
  cooperativismWaterTankPadPolygon,
  cooperativismWaterTankTowerHeight,
  cooperativismWaterTankVisualHeight,
  createCooperativismWaterTankLayout,
} from '@/features/commercial-map/utils/cooperativismWaterTanks';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
} from '@/features/commercial-map/utils/landmarks';
import {
  buildCommercialSiteHardSurfaceMasks,
  commercialSitePolygonInteriorsOverlap,
} from '@/features/commercial-map/utils/commercialSiteEnvironment';
import { pointInPolygon } from '@/features/commercial-map/utils/spatialSurface';

const entity = (publicIdentifier: string) => {
  const found = OFFICIAL_REFERENCE_ENTITIES.find((candidate) => (
    candidate.publicIdentifier === publicIdentifier
  ));
  if (!found) throw new Error(`Entidade oficial ausente: ${publicIdentifier}`);
  return found;
};

describe('caixas d’água elevadas ao lado do Espaço do Cooperativismo', () => {
  it('não altera o cadastro B28 nem inventa identificador cadastral', () => {
    const host = entity('B28');
    const snapshot = JSON.stringify(host);

    expect(host).toMatchObject({
      id: 'reference:2026:b28',
      publicIdentifier: 'B28',
      name: 'Espaço do Cooperativismo',
      classification: 'BUILDING',
    });
    expect(COOPERATIVISM_WATER_TANK_LAYOUT.hostPublicIdentifier).toBe('B28');
    expect(resolveStrategicLandmarkKind(host)).toBe('cooperativism-space');
    expect(OFFICIAL_REFERENCE_ENTITIES.some((candidate) => (
      candidate.publicIdentifier.startsWith('B')
      && candidate !== host
      && /caixa|tanque|reservat/i.test(`${candidate.publicIdentifier} ${candidate.name}`)
    ))).toBe(false);
    expect(JSON.stringify(host)).toBe(snapshot);
  });

  it('ancora três tanques distintos nos símbolos hidráulicos oficiais do Espaço Cooperativo', () => {
    const host = entity('B28');
    const layout = createCooperativismWaterTankLayout(strategicLandmarkBounds(host));

    expect(COOPERATIVISM_WATER_TANK_PLAN).toHaveLength(3);
    expect(layout.tanks).toHaveLength(3);
    expect(layout.tanks.map((tank) => tank.role)).toEqual([
      'bakof-blue',
      'charcoal-steel',
      'galvanized-rust',
    ]);
    layout.tanks.forEach((tank) => {
      const hydro = HYDROLOGICAL_NODES.find((node) => node.id === tank.hydroId);
      expect(hydro, tank.hydroId).toBeDefined();
      expect(hydro?.type).toBe('reservoir');
      expect(tank.worldPosition[0]).toBeCloseTo(hydro!.position[0], 8);
      expect(tank.worldPosition[1]).toBeCloseTo(hydro!.position[1], 8);
    });
    expect(layout.tanks[0].label).toBe('BAKOF');
  });

  it('implanta as torres no gramado leste de Quadra N, ao lado de B28 e fora de vias/lotes', () => {
    const host = entity('B28');
    const quadraN = entity('QUADRA-N');
    const layout = createCooperativismWaterTankLayout(strategicLandmarkBounds(host));
    const hostBounds = strategicLandmarkBounds(host);
    const hardMasks = buildCommercialSiteHardSurfaceMasks(OFFICIAL_RENDERED_ENTITIES).filter((mask) => (
      mask.role === 'OFFICIAL_ROAD'
      || mask.role === 'OFFICIAL_LOT_OR_STAND'
      || mask.sourceIdentifier === 'D4'
      || mask.sourceIdentifier === 'B9'
      || mask.sourceIdentifier === 'D2'
    ));

    layout.tanks.forEach((tank) => {
      expect(pointInPolygon(tank.worldPosition, quadraN.geometry.coordinates[0]), tank.hydroId).toBe(true);
      expect(pointInPolygon(tank.worldPosition, host.geometry.coordinates[0]), tank.hydroId).toBe(false);
      expect(tank.worldPosition[0]).toBeGreaterThan(hostBounds.maxX);
      expect(tank.localOffset[0]).toBeGreaterThan(hostBounds.width / 2);
      const pad = cooperativismWaterTankPadPolygon(tank);
      expect(commercialSitePolygonInteriorsOverlap(pad, host.geometry.coordinates[0]), tank.hydroId).toBe(false);
      hardMasks.forEach((mask) => {
        expect(
          commercialSitePolygonInteriorsOverlap(pad, mask.polygon),
          `${tank.hydroId}/${mask.sourceIdentifier}`,
        ).toBe(false);
      });
    });
    OFFICIAL_REFERENCE_ENTITIES.filter((candidate) => candidate.classification === 'SELLABLE_LOT').forEach((lot) => {
      layout.tanks.forEach((tank) => {
        expect(
          pointInPolygon(tank.worldPosition, lot.geometry.coordinates[0]),
          `${tank.hydroId}/${lot.publicIdentifier}`,
        ).toBe(false);
      });
    });
  });

  it('usa escala de torres elevadas reais, não brinquedo, com treliça e passarela compartilhada', () => {
    const host = entity('B28');
    const layout = createCooperativismWaterTankLayout(strategicLandmarkBounds(host));
    const meters = COOPERATIVISM_WATER_TANK_LAYOUT.mapUnitsPerMeter;

    expect(cooperativismWaterTankTowerHeight()).toBeCloseTo(6 * meters, 10);
    expect(cooperativismWaterTankVisualHeight()).toBeGreaterThan(9 * meters);
    expect(cooperativismWaterTankVisualHeight()).toBeLessThan(12 * meters);
    expect(layout.tower.braceLevels).toBeGreaterThanOrEqual(4);
    expect(layout.walkway.segments).toHaveLength(2);
    layout.walkway.segments.forEach((segment) => {
      expect(segment.length).toBeGreaterThan(0.35);
      expect(segment.length).toBeLessThan(1.2);
    });
    const span = Math.hypot(
      layout.tanks[2].worldPosition[0] - layout.tanks[0].worldPosition[0],
      layout.tanks[2].worldPosition[1] - layout.tanks[0].worldPosition[1],
    );
    expect(span).toBeGreaterThan(0.8);
    expect(span).toBeLessThan(2.2);
  });

  it('integra as caixas no mesh de B28 sem destruir o grupo arquitetônico existente', () => {
    const structuresSource = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/FenasojaReferenceStructures.tsx',
    ), 'utf8');
    const tanksSource = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/CooperativismWaterTanks.tsx',
    ), 'utf8');

    expect(structuresSource).toContain('arquitetura-b28-espaco-cooperativismo');
    expect(structuresSource).toContain('<CooperativismWaterTanks');
    expect(tanksSource).toContain('COOPERATIVISM_WATER_TANK_LAYOUT.groupName');
    expect(COOPERATIVISM_WATER_TANK_LAYOUT.groupName).toBe('caixas-dagua-espaco-cooperativismo');
    expect(tanksSource).toContain('caixa-dagua-bakof');
    expect(tanksSource).toContain('BAKOF');
    expect(tanksSource).toContain('caixa-dagua-charcoal');
    expect(tanksSource).toContain('caixa-dagua-galvanized');
    expect(tanksSource).not.toMatch(/orange|#f28c1b/i);
  });
});
