import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SE_CLOVERLEAF_CENTER_LOCAL,
  SE_CLOVERLEAF_CENTER_SOURCE,
  SE_CLOVERLEAF_ELEVATION_BANDS,
  SE_CLOVERLEAF_FOCUS_BOUNDS,
  SE_CLOVERLEAF_JOIN_LOCAL,
  SE_CLOVERLEAF_JOIN_SOURCE,
  SE_CLOVERLEAF_LAYOUT,
  SE_CLOVERLEAF_QUADRANTS,
  SE_CLOVERLEAF_RENDER_BUDGET,
  SE_CLOVERLEAF_REVISION,
  SE_CLOVERLEAF_ROUNDABOUTS,
  SE_CLOVERLEAF_SCENE_SUPPORT_POINTS,
  seCloverleafIsEastOfParkCore,
  seCloverleafIsSouthOfA5Trevo,
} from '@/features/commercial-map/data/seCloverleaf';
import {
  REAR_CALIBRATED_AXES,
  REAR_OFFICIAL_ANCHORS,
} from '@/features/commercial-map/utils/rearSpatialCalibration';
import { officialPdfPointToLocal } from '@/features/commercial-map/data/officialReference2026';
import {
  buildSeCloverleafRenderModel,
  disposeSeCloverleafRenderModel,
  pointIsOnSeCloverleafHighway,
  seCloverleafLoopCenters,
  seCloverleafMainlineElevation,
  seCloverleafWestTerminus,
} from '@/features/commercial-map/utils/seCloverleaf';
import { REAR_PARK_ROAD_NETWORK } from '@/features/commercial-map/data/rearParkRoadNetwork';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const FORBIDDEN_EXISTING_FILES = [
  'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
  'src/features/commercial-map/data/rearParkRoadNetwork.ts',
  'src/features/commercial-map/utils/rearSpatialCalibration.ts',
  'src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx',
  'src/features/commercial-map/components/canvas/HeadquartersInteriorScene.tsx',
  'src/features/commercial-map/components/canvas/LivestockPavilionInteriorScene.tsx',
  'src/features/commercial-map/components/canvas/MiranteInteriorScene.tsx',
] as const;

describe('trevo sul BR-472 — isolamento', () => {
  it('vive em arquivos novos e não entra no canvas, no A5 nem nos interiores', () => {
    FORBIDDEN_EXISTING_FILES.forEach((path) => {
      const source = read(path);
      expect(source).not.toContain('SeCloverleaf');
      expect(source).not.toContain('seCloverleaf');
      expect(source).not.toContain('se-cloverleaf');
    });
    expect(read('src/features/commercial-map/components/canvas/RearParkRoadNetwork.tsx'))
      .toContain("import { SeCloverleaf } from './SeCloverleaf'");
    expect(read('src/features/commercial-map/components/canvas/RearParkRoadNetwork.tsx'))
      .toContain('<SeCloverleaf');
  });

  it('preserva o trevo em Y do Portão 5 byte a byte', () => {
    expect(REAR_OFFICIAL_ANCHORS.trevoFork).toEqual([6058, 3678]);
    expect(REAR_OFFICIAL_ANCHORS.br472Junction).toEqual([6120, 3678]);
    expect(REAR_CALIBRATED_AXES.a5TrevoTrunk).toEqual([
      REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
      [5998, 3678],
      REAR_OFFICIAL_ANCHORS.trevoFork,
    ]);
    expect(REAR_PARK_ROAD_NETWORK.filter((road) => road.roadId === 'ACESSO-A5-BR472').map((road) => road.id))
      .toEqual(['gate5-internal-approach', 'a5-trevo-trunk', 'a5-br472-north-ramp', 'a5-br472-south-ramp']);
    expect(REAR_CALIBRATED_AXES.br472SouthRampToSouth.at(-1)).toEqual(SE_CLOVERLEAF_JOIN_SOURCE);
  });
});

describe('trevo sul BR-472 — implantação', () => {
  it('encaixa no término sul da BR-472, a sudeste do parque e a sul do A5', () => {
    expect(SE_CLOVERLEAF_JOIN_SOURCE).toEqual([6146, 4400]);
    expect(SE_CLOVERLEAF_JOIN_LOCAL).toEqual(officialPdfPointToLocal([6146, 4400]));
    expect(SE_CLOVERLEAF_CENTER_LOCAL[0]).toBeCloseTo(SE_CLOVERLEAF_JOIN_LOCAL[0], 6);
    expect(SE_CLOVERLEAF_CENTER_LOCAL[1]).toBeGreaterThan(SE_CLOVERLEAF_JOIN_LOCAL[1] + 10);
    expect(SE_CLOVERLEAF_CENTER_SOURCE[1]).toBeGreaterThan(4400);
    expect(seCloverleafIsSouthOfA5Trevo()).toBe(true);
    expect(seCloverleafIsEastOfParkCore()).toBe(true);
    expect(SE_CLOVERLEAF_FOCUS_BOUNDS.minZ).toBeGreaterThan(
      officialPdfPointToLocal(REAR_OFFICIAL_ANCHORS.br472SouthRampJunction)[1] + 8,
    );
    expect(SE_CLOVERLEAF_FOCUS_BOUNDS.minX).toBeGreaterThan(20);
  });

  it('tem quatro pétalas simétricas e duas rotatórias amarelas a leste e oeste da rodovia', () => {
    expect(SE_CLOVERLEAF_QUADRANTS.map((quadrant) => quadrant.id)).toEqual(['ne', 'se', 'sw', 'nw']);
    const [west, east] = [SE_CLOVERLEAF_ROUNDABOUTS.west, SE_CLOVERLEAF_ROUNDABOUTS.east];
    expect(west[1]).toBeCloseTo(SE_CLOVERLEAF_CENTER_LOCAL[1], 6);
    expect(east[1]).toBeCloseTo(SE_CLOVERLEAF_CENTER_LOCAL[1], 6);
    expect(west[0]).toBeLessThan(SE_CLOVERLEAF_CENTER_LOCAL[0] - 8);
    expect(east[0]).toBeGreaterThan(SE_CLOVERLEAF_CENTER_LOCAL[0] + 8);
    expect(east[0] - SE_CLOVERLEAF_CENTER_LOCAL[0]).toBeCloseTo(
      SE_CLOVERLEAF_CENTER_LOCAL[0] - west[0],
      6,
    );
    const loops = seCloverleafLoopCenters();
    expect(loops).toHaveLength(4);
    const eastOf = loops.filter(([x]) => x > SE_CLOVERLEAF_CENTER_LOCAL[0]);
    const westOf = loops.filter(([x]) => x < SE_CLOVERLEAF_CENTER_LOCAL[0]);
    const northOf = loops.filter(([, z]) => z < SE_CLOVERLEAF_CENTER_LOCAL[1]);
    const southOf = loops.filter(([, z]) => z > SE_CLOVERLEAF_CENTER_LOCAL[1]);
    expect(eastOf).toHaveLength(2);
    expect(westOf).toHaveLength(2);
    expect(northOf).toHaveLength(2);
    expect(southOf).toHaveLength(2);
  });

  it('vira a BR-472 para oeste ao sul do parque depois do trevo', () => {
    const west = seCloverleafWestTerminus();
    expect(west[0]).toBeLessThan(SE_CLOVERLEAF_CENTER_LOCAL[0] - 20);
    expect(west[1]).toBeGreaterThan(SE_CLOVERLEAF_CENTER_LOCAL[1] + 8);
    expect(pointIsOnSeCloverleafHighway(SE_CLOVERLEAF_JOIN_LOCAL)).toBe(true);
    expect(pointIsOnSeCloverleafHighway(west)).toBe(true);
    expect(pointIsOnSeCloverleafHighway([0, 0])).toBe(false);
  });

  it('mantém o tabuleiro acima da transversal sem cota compartilhada', () => {
    const bands = Object.values(SE_CLOVERLEAF_ELEVATION_BANDS);
    expect(new Set(bands.map((value) => value.toFixed(4))).size).toBe(bands.length);
    expect(SE_CLOVERLEAF_ELEVATION_BANDS.overpass)
      .toBeGreaterThan(SE_CLOVERLEAF_ELEVATION_BANDS.roundabout + 0.4);
    expect(SE_CLOVERLEAF_ELEVATION_BANDS.deckSoffit)
      .toBeGreaterThan(SE_CLOVERLEAF_ELEVATION_BANDS.grade + 0.45);
    expect(seCloverleafMainlineElevation(SE_CLOVERLEAF_CENTER_LOCAL[1]))
      .toBeCloseTo(SE_CLOVERLEAF_LAYOUT.overpassHeight, 5);
    expect(seCloverleafMainlineElevation(SE_CLOVERLEAF_JOIN_LOCAL[1]))
      .toBeCloseTo(SE_CLOVERLEAF_LAYOUT.gradeElevation, 5);
    expect(seCloverleafMainlineElevation(SE_CLOVERLEAF_CENTER_LOCAL[1] + 40))
      .toBeCloseTo(SE_CLOVERLEAF_LAYOUT.gradeElevation, 5);
  });
});

describe('trevo sul BR-472 — malha', () => {
  it('gera cloverleaf completo dentro do orçamento e descarta a malha', () => {
    const model = buildSeCloverleafRenderModel();
    const reduced = buildSeCloverleafRenderModel({ reducedGraphics: true });
    try {
      expect(model.diagnostics.loopCount).toBe(4);
      expect(model.diagnostics.slipCount).toBe(4);
      expect(model.diagnostics.roundaboutCount).toBe(2);
      expect(model.diagnostics.pierCount).toBe(4);
      expect(model.diagnostics.overpassClearance).toBeGreaterThan(0.45);
      expect(model.diagnostics.withinBudget).toBe(true);
      expect(model.diagnostics.estimatedPrimaryDrawCalls)
        .toBeLessThanOrEqual(SE_CLOVERLEAF_RENDER_BUDGET.maximumPrimaryDrawCalls);
      expect(model.diagnostics.triangleCount).toBeGreaterThan(800);
      expect(model.diagnostics.triangleCount)
        .toBeLessThanOrEqual(SE_CLOVERLEAF_RENDER_BUDGET.maximumTriangles);
      expect(reduced.diagnostics.triangleCount).toBeLessThan(model.diagnostics.triangleCount);
      expect(reduced.diagnostics.withinBudget).toBe(true);
      expect(model.geometries.highway).not.toBeNull();
      expect(model.geometries.ramps).not.toBeNull();
      expect(model.geometries.crossing).not.toBeNull();
      expect(model.geometries.roundabout).not.toBeNull();
      expect(model.geometries.grass).not.toBeNull();
      expect(model.geometries.concrete).not.toBeNull();
      const highwayBox = model.geometries.highway!.boundingBox!;
      const rampsBox = model.geometries.ramps!.boundingBox!;
      expect(rampsBox.min.x).toBeLessThan(SE_CLOVERLEAF_CENTER_LOCAL[0] - 4);
      expect(rampsBox.max.x).toBeGreaterThan(SE_CLOVERLEAF_CENTER_LOCAL[0] + 4);
      expect(rampsBox.min.z).toBeLessThan(SE_CLOVERLEAF_CENTER_LOCAL[1] - 4);
      expect(rampsBox.max.z).toBeGreaterThan(SE_CLOVERLEAF_CENTER_LOCAL[1] + 4);
      expect(highwayBox.min.x).toBeLessThan(SE_CLOVERLEAF_CENTER_LOCAL[0] - 10);
      expect(highwayBox.max.z).toBeGreaterThan(SE_CLOVERLEAF_CENTER_LOCAL[1]);
      expect(highwayBox.max.y).toBeGreaterThan(SE_CLOVERLEAF_LAYOUT.overpassHeight - 0.05);
      const roundaboutBox = model.geometries.roundabout!.boundingBox!;
      expect(roundaboutBox.min.x).toBeLessThan(SE_CLOVERLEAF_ROUNDABOUTS.west[0] + 1);
      expect(roundaboutBox.max.x).toBeGreaterThan(SE_CLOVERLEAF_ROUNDABOUTS.east[0] - 1);
      expect(model.geometries.concrete!.boundingBox!.min.y)
        .toBeLessThan(SE_CLOVERLEAF_ELEVATION_BANDS.grade + 0.2);
      expect(model.geometries.concrete!.boundingBox!.max.y)
        .toBeGreaterThan(SE_CLOVERLEAF_LAYOUT.overpassHeight);
    } finally {
      disposeSeCloverleafRenderModel(model);
      disposeSeCloverleafRenderModel(reduced);
    }
  });

  it('expõe pontos de suporte e revisão para o enquadramento da rodovia', () => {
    expect(SE_CLOVERLEAF_REVISION).toMatch(/se-cloverleaf/);
    expect(SE_CLOVERLEAF_SCENE_SUPPORT_POINTS.length).toBeGreaterThanOrEqual(6);
    SE_CLOVERLEAF_SCENE_SUPPORT_POINTS.forEach((point) => {
      expect(point.position[0]).toBeGreaterThan(SE_CLOVERLEAF_FOCUS_BOUNDS.minX - 0.01);
      expect(point.position[1]).toBeGreaterThan(SE_CLOVERLEAF_FOCUS_BOUNDS.minZ - 0.01);
    });
  });
});
