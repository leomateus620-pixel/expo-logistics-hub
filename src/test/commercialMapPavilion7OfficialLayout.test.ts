import { describe, expect, it } from 'vitest';
import {
  PAVILION7_COMMERCIAL_GEOMETRIC_AREA_M2,
  PAVILION7_COMMERCIAL_REFERENCE,
  PAVILION7_COMMERCIAL_REFERENCE_CELLS,
  PAVILION7_COMMERCIAL_REFERENCE_CORRIDORS,
  PAVILION7_COMMERCIAL_REFERENCE_PROJECTION,
  PAVILION7_COMMERCIAL_REFERENCE_RUNS,
  PAVILION7_COMMERCIAL_SUPPORT_SPACES,
  PAVILION7_WALL_ACCESSES,
} from '@/features/commercial-map/data/pavilion7CommercialReference';
import type {
  CommercialPavilionReferenceRect,
} from '@/features/commercial-map/data/commercialPavilionReference';

function cell(number: number) {
  const match = PAVILION7_COMMERCIAL_REFERENCE_CELLS.find(
    (candidate) => candidate.number === number,
  );
  expect(match).toBeDefined();
  return match!;
}

function metricEdges(rect: CommercialPavilionReferenceRect) {
  return {
    left: (rect.centerX - rect.width / 2) * 49.9,
    right: (rect.centerX + rect.width / 2) * 49.9,
    top: (rect.centerZ - rect.depth / 2) * 18.3,
    bottom: (rect.centerZ + rect.depth / 2) * 18.3,
  };
}

function positiveAreaOverlap(
  first: CommercialPavilionReferenceRect,
  second: CommercialPavilionReferenceRect,
) {
  const a = metricEdges(first);
  const b = metricEdges(second);
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1e-9
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1e-9;
}

describe('referência oficial do Pavilhão 7', () => {
  it('adota os 57 boxes oficiais de 7,50 m²', () => {
    expect(PAVILION7_COMMERCIAL_REFERENCE.publicIdentifier).toBe('B10');
    expect(PAVILION7_COMMERCIAL_REFERENCE.moduleCount).toBe(57);
    expect(PAVILION7_COMMERCIAL_REFERENCE.sourceDeclaredModuleCount).toBe(57);
    expect(PAVILION7_COMMERCIAL_REFERENCE.totalAreaM2).toBe(917);
    expect(PAVILION7_COMMERCIAL_REFERENCE.modularAreaM2).toBe(427.5);
    expect(PAVILION7_COMMERCIAL_REFERENCE.individualAreaM2).toBe(7.5);
    expect(PAVILION7_COMMERCIAL_REFERENCE.source.discrepancy).toBeNull();
  });

  it('preserva o frame métrico oficial, sem giro e ancorado à fachada sul', () => {
    expect(PAVILION7_COMMERCIAL_REFERENCE_PROJECTION).toEqual({
      coordinateTransform: 'identity',
      fit: 'metric-contain',
      metricWidthM: 49.9,
      metricDepthM: 18.3,
      alignX: 'center',
      alignZ: 'end',
    });
  });

  it('gera IDs contínuos, boxes de 3,00 x 2,50 m e área agregada exata', () => {
    expect(PAVILION7_COMMERCIAL_REFERENCE_CELLS).toHaveLength(57);
    expect(PAVILION7_COMMERCIAL_REFERENCE_CELLS.map(({ number }) => number))
      .toEqual(Array.from({ length: 57 }, (_, index) => index + 1));
    expect(new Set(PAVILION7_COMMERCIAL_REFERENCE_CELLS.map(({ id }) => id)).size)
      .toBe(57);
    expect(cell(1).id).toBe('B10:module:001');
    expect(cell(57).id).toBe('B10:module:057');

    PAVILION7_COMMERCIAL_REFERENCE_CELLS.forEach((module) => {
      expect(module.width * 49.9).toBeCloseTo(3, 10);
      expect(module.depth * 18.3).toBeCloseTo(2.5, 10);
      expect(module.areaM2).toBe(7.5);
      expect(module.type).toBe('commercial-lot');
      expect(module.source.discrepancy).toBeNull();
    });

    const geometricArea = PAVILION7_COMMERCIAL_REFERENCE_CELLS.reduce(
      (sum, module) => sum + module.width * 49.9 * module.depth * 18.3,
      0,
    );
    expect(PAVILION7_COMMERCIAL_GEOMETRIC_AREA_M2).toBe(427.5);
    expect(geometricArea).toBeCloseTo(427.5, 8);
  });

  it('reproduz os seis runs e os sentidos numéricos do desenho', () => {
    expect(PAVILION7_COMMERCIAL_REFERENCE_RUNS.map(({ numberRange }) => numberRange))
      .toEqual([[1, 4], [5, 15], [16, 29], [30, 43], [44, 49], [50, 57]]);

    expect(cell(1).centerX).toBeLessThan(cell(4).centerX);
    expect(metricEdges(cell(4)).right).toBeCloseTo(15.7, 10);
    expect(metricEdges(cell(5)).left).toBeCloseTo(16.4, 10);
    expect(cell(5).centerX).toBeLessThan(cell(15).centerX);
    expect(cell(16).centerX).toBeLessThan(cell(29).centerX);
    expect(cell(43).centerX).toBeLessThan(cell(30).centerX);
    expect(cell(44).centerX).toBeLessThan(cell(49).centerX);
    expect(cell(50).centerX).toBeLessThan(cell(57).centerX);

    expect(metricEdges(PAVILION7_COMMERCIAL_REFERENCE_RUNS[2].bounds).left)
      .toBeCloseTo(3.95, 10);
    expect(metricEdges(PAVILION7_COMMERCIAL_REFERENCE_RUNS[2].bounds).right)
      .toBeCloseTo(45.95, 10);
    expect(cell(16).width).toBeCloseTo(cell(43).width, 12);
    expect(cell(16).depth).toBeCloseTo(cell(43).depth, 12);
    PAVILION7_COMMERCIAL_REFERENCE_CELLS.forEach((module, index) => {
      PAVILION7_COMMERCIAL_REFERENCE_CELLS.slice(index + 1).forEach((other) => {
        expect(positiveAreaOverlap(module, other)).toBe(false);
      });
    });
  });

  it('mantém corredores livres e o vão frontal oficial de 7,50 m', () => {
    const entrance = PAVILION7_COMMERCIAL_REFERENCE_CORRIDORS.find(
      ({ id }) => id === 'south-central-entrance',
    );
    const northAisle = PAVILION7_COMMERCIAL_REFERENCE_CORRIDORS.find(
      ({ id }) => id === 'north-main-aisle',
    );
    const southAisle = PAVILION7_COMMERCIAL_REFERENCE_CORRIDORS.find(
      ({ id }) => id === 'south-main-aisle',
    );
    expect(entrance).toBeDefined();
    expect(northAisle).toBeDefined();
    expect(southAisle).toBeDefined();
    expect(entrance!.width * 49.9).toBeCloseTo(7.5, 10);
    expect(northAisle!.depth * 18.3).toBeCloseTo(3.95, 10);
    expect(southAisle!.depth * 18.3).toBeCloseTo(3.95, 10);

    PAVILION7_COMMERCIAL_REFERENCE_CELLS.forEach((module) => {
      PAVILION7_COMMERCIAL_REFERENCE_CORRIDORS.forEach((corridor) => {
        expect(positiveAreaOverlap(module, corridor)).toBe(false);
      });
    });
  });

  it('mantém cozinha, banheiros e conexões com a Prancha 02 fora do inventário', () => {
    expect(PAVILION7_COMMERCIAL_SUPPORT_SPACES).toHaveLength(2);
    expect(PAVILION7_COMMERCIAL_SUPPORT_SPACES.map(({ kind }) => kind))
      .toEqual(['kitchen', 'sanitary']);
    PAVILION7_COMMERCIAL_SUPPORT_SPACES.forEach((space) => {
      expect(space.type).toBe('permanent-non-commercial');
      expect(space.sourcePrecision).toBe('plan-traced');
      expect(metricEdges(space).bottom).toBeCloseTo(0, 10);
    });

    expect(PAVILION7_WALL_ACCESSES).toHaveLength(4);
    expect(PAVILION7_WALL_ACCESSES.find(({ id }) => id === 'front-central-door'))
      .toMatchObject({
        wall: 'front',
        centerAlongWallM: 24.95,
        openingWidthM: 3,
        sourcePrecision: 'official-metric',
      });
    expect(PAVILION7_WALL_ACCESSES.filter(({ wall }) => wall === 'right'))
      .toHaveLength(2);
    expect(PAVILION7_WALL_ACCESSES.filter(({ wall }) => wall === 'right'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ connectsTo: 'PAVILION_11_SHEET_02' }),
      ]));
  });
});
