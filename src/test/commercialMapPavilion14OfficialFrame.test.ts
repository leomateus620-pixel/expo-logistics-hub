import { describe, expect, it } from 'vitest';
import {
  createCommercialPavilionReferenceProjectionFrame,
  projectCommercialPavilionReferenceRect,
  transformCommercialPavilionReferenceSequenceOrientation,
} from '@/features/commercial-map/data/commercialPavilionReference';
import {
  PAVILION14_COMMERCIAL_GEOMETRIC_AREA_M2,
  PAVILION14_COMMERCIAL_REFERENCE,
  PAVILION14_COMMERCIAL_REFERENCE_CELLS,
  PAVILION14_COMMERCIAL_REFERENCE_CORRIDORS,
  PAVILION14_COMMERCIAL_REFERENCE_PROJECTION,
  PAVILION14_COMMERCIAL_REFERENCE_RUNS,
  PAVILION14_COMMERCIAL_WALL_ACCESSES,
} from '@/features/commercial-map/data/pavilion14CommercialReference';

const cell = (number: number) => PAVILION14_COMMERCIAL_REFERENCE_CELLS[number - 1];

describe('enquadramento oficial do Pavilhão 14', () => {
  it('preserva a planta métrica 35 × 33 sem inset, lacunas ou numeração histórica', () => {
    expect(PAVILION14_COMMERCIAL_REFERENCE_CELLS).toHaveLength(186);
    expect(new Set(PAVILION14_COMMERCIAL_REFERENCE_CELLS.map(({ id }) => id)).size).toBe(186);
    expect(PAVILION14_COMMERCIAL_REFERENCE_CELLS.map(({ number }) => number)).toEqual(
      Array.from({ length: 186 }, (_, index) => index + 1),
    );
    expect(PAVILION14_COMMERCIAL_REFERENCE_CELLS.every(({ areaM2 }) => areaM2 === null)).toBe(true);
    expect(PAVILION14_COMMERCIAL_REFERENCE_CELLS.every(({ source }) => source.discrepancy === null)).toBe(true);

    const nominalArea = PAVILION14_COMMERCIAL_REFERENCE_CELLS.reduce(
      (total, module) => total + module.width * 35 * module.depth * 33,
      0,
    );
    expect(nominalArea).toBeCloseTo(616, 10);
    expect(PAVILION14_COMMERCIAL_GEOMETRIC_AREA_M2).toBe(616);
    expect(PAVILION14_COMMERCIAL_REFERENCE.modularAreaM2).toBe(616.16);
    expect(PAVILION14_COMMERCIAL_REFERENCE.individualAreaM2).toBeNull();

    const sourceBounds = PAVILION14_COMMERCIAL_REFERENCE_RUNS.reduce(
      (bounds, run) => ({
        minX: Math.min(bounds.minX, run.bounds.centerX - run.bounds.width / 2),
        minZ: Math.min(bounds.minZ, run.bounds.centerZ - run.bounds.depth / 2),
        maxX: Math.max(bounds.maxX, run.bounds.centerX + run.bounds.width / 2),
        maxZ: Math.max(bounds.maxZ, run.bounds.centerZ + run.bounds.depth / 2),
      }),
      { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity },
    );
    expect(sourceBounds).toEqual({ minX: 0, minZ: 0, maxX: 1, maxZ: 1 });
  });

  it('mantém as seis sequências oficiais e apenas clusters sustentados pelos runs', () => {
    expect(PAVILION14_COMMERCIAL_REFERENCE_RUNS.map(({ numberRange }) => numberRange)).toEqual([
      [1, 35],
      [36, 64],
      [65, 93],
      [94, 122],
      [123, 151],
      [152, 186],
    ]);

    expect(cell(1).centerX).toBeLessThan(cell(35).centerX);
    expect(cell(36).centerX).toBeGreaterThan(cell(64).centerX);
    expect(cell(65).centerX).toBeLessThan(cell(93).centerX);
    expect(cell(94).centerX).toBeGreaterThan(cell(122).centerX);
    expect(cell(123).centerX).toBeLessThan(cell(151).centerX);
    expect(cell(152).centerX).toBeGreaterThan(cell(186).centerX);

    PAVILION14_COMMERCIAL_REFERENCE_RUNS.forEach((run) => {
      const [start, end] = run.numberRange;
      const clusters = new Set(
        PAVILION14_COMMERCIAL_REFERENCE_CELLS
          .filter(({ number }) => number >= start && number <= end)
          .map(({ cluster }) => cluster),
      );
      expect(clusters).toEqual(new Set([run.cluster]));
      expect('clusters' in run).toBe(false);
    });
  });

  it('aplica quarter-turn e escala uniforme mantendo a vista oficial centralizada', () => {
    expect(PAVILION14_COMMERCIAL_REFERENCE_PROJECTION).toEqual({
      coordinateTransform: 'quarter-turn-clockwise',
      fit: 'metric-contain',
      metricWidthM: 35,
      metricDepthM: 33,
      alignX: 'center',
      alignZ: 'center',
    });

    const frame = createCommercialPavilionReferenceProjectionFrame(
      PAVILION14_COMMERCIAL_REFERENCE_PROJECTION,
      { width: 33, depth: 35 },
    );
    expect(frame.centerX).toBe(0);
    expect(frame.centerZ).toBe(0);
    expect(frame.width).toBe(33);
    expect(frame.depth).toBe(35);
    expect(frame.width / frame.depth).toBeCloseTo(33 / 35, 12);

    expect(transformCommercialPavilionReferenceSequenceOrientation(
      'x-increasing',
      frame.coordinateTransform,
    )).toBe('z-increasing');
    expect(transformCommercialPavilionReferenceSequenceOrientation(
      'x-decreasing',
      frame.coordinateTransform,
    )).toBe('z-decreasing');
  });

  it('projeta os corredores oficiais em três acessos frontais e traseiros 4/5/4', () => {
    expect(PAVILION14_COMMERCIAL_WALL_ACCESSES).toHaveLength(3);
    expect(PAVILION14_COMMERCIAL_WALL_ACCESSES.every(
      ({ edges, sourcePrecision }) => (
        edges[0] === 'front'
        && edges[1] === 'rear'
        && sourcePrecision === 'official-metric'
      ),
    )).toBe(true);

    const frame = createCommercialPavilionReferenceProjectionFrame(
      PAVILION14_COMMERCIAL_REFERENCE_PROJECTION,
      { width: 33, depth: 35 },
    );
    const projected = PAVILION14_COMMERCIAL_WALL_ACCESSES.map(({ corridorId }) => {
      const corridor = PAVILION14_COMMERCIAL_REFERENCE_CORRIDORS.find(
        ({ id }) => id === corridorId,
      );
      expect(corridor).toBeDefined();
      return projectCommercialPavilionReferenceRect(corridor!, frame);
    });

    [11.5, 0, -11.5].forEach((expectedCenter, index) => {
      expect(projected[index].centerX).toBeCloseTo(expectedCenter, 12);
    });
    [4, 5, 4].forEach((expectedWidth, index) => {
      expect(projected[index].width).toBeCloseTo(expectedWidth, 12);
    });
    projected.forEach((access) => {
      expect(access.centerZ).toBe(0);
      expect(access.depth).toBe(35);
    });
  });

  it('publica a identidade e a fonte oficiais sem dados comerciais inventados', () => {
    expect(PAVILION14_COMMERCIAL_REFERENCE.category).toBe('Artesanato e Comércio');
    expect(PAVILION14_COMMERCIAL_REFERENCE.totalAreaM2).toBe(1155);
    expect(PAVILION14_COMMERCIAL_REFERENCE.source.document).toBe(
      'WhatsApp Image 2026-08-25 at 03.11.58.jpeg',
    );
    expect(PAVILION14_COMMERCIAL_REFERENCE.legendNumberRanges).toEqual([
      [1, 35],
      [36, 64],
      [65, 93],
      [94, 122],
      [123, 151],
      [152, 186],
    ]);
  });
});
