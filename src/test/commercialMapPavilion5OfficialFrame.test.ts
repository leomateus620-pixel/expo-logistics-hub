import { describe, expect, it } from 'vitest';
import {
  PAVILION5_COMMERCIAL_REFERENCE,
  PAVILION5_COMMERCIAL_REFERENCE_CELLS,
  PAVILION5_COMMERCIAL_REFERENCE_CORRIDORS,
  PAVILION5_COMMERCIAL_REFERENCE_PROJECTION,
  PAVILION5_COMMERCIAL_SUPPORT_SPACES,
} from '@/features/commercial-map/data/pavilion5CommercialReference';
import {
  createCommercialPavilionReferenceProjectionFrame,
  projectCommercialPavilionReferencePoint,
} from '@/features/commercial-map/data/commercialPavilionReference';

const METRIC_WIDTH = 25.5;
const METRIC_DEPTH = 43.5;

function cell(number: number) {
  return PAVILION5_COMMERCIAL_REFERENCE_CELLS[number - 1];
}

describe('enquadramento oficial do Pavilhão 5', () => {
  it('usa o referencial métrico completo sem margem inventada e sem girar o croqui', () => {
    expect(PAVILION5_COMMERCIAL_REFERENCE.projection).toBe(
      PAVILION5_COMMERCIAL_REFERENCE_PROJECTION,
    );
    expect(PAVILION5_COMMERCIAL_REFERENCE_PROJECTION).toEqual({
      coordinateTransform: 'identity',
      fit: 'metric-contain',
      metricWidthM: METRIC_WIDTH,
      metricDepthM: METRIC_DEPTH,
      alignX: 'center',
      alignZ: 'end',
    });

    expect(cell(43).centerZ - cell(43).depth / 2).toBeCloseTo(0, 12);
    expect(cell(1).centerZ + cell(1).depth / 2).toBeCloseTo(1, 12);
    expect(cell(44).centerX - cell(44).width / 2).toBeCloseTo(0, 12);
    expect(PAVILION5_COMMERCIAL_SUPPORT_SPACES[2].centerX
      + PAVILION5_COMMERCIAL_SUPPORT_SPACES[2].width / 2).toBeCloseTo(1, 12);
  });

  it('aplica uma única escala nos dois eixos e ancora a planta na fachada +Z', () => {
    const available = { width: 2, depth: 10 };
    const frame = createCommercialPavilionReferenceProjectionFrame(
      PAVILION5_COMMERCIAL_REFERENCE_PROJECTION,
      available,
    );
    const scaleX = frame.width / METRIC_WIDTH;
    const scaleZ = frame.depth / METRIC_DEPTH;
    const [frontX, frontZ] = projectCommercialPavilionReferencePoint([0.5, 1], frame);

    expect(scaleX).toBeCloseTo(scaleZ, 12);
    expect(frame.centerX).toBeCloseTo(0, 12);
    expect(frontX).toBeCloseTo(0, 12);
    expect(frontZ).toBeCloseTo(available.depth / 2, 12);
  });

  it('preserva os 81 módulos, os vãos oficiais e a soma modular de 244,50 m²', () => {
    expect(PAVILION5_COMMERCIAL_REFERENCE_CELLS).toHaveLength(81);
    expect(PAVILION5_COMMERCIAL_REFERENCE_CELLS.map((candidate) => candidate.number))
      .toEqual(Array.from({ length: 81 }, (_, index) => index + 1));

    expect(cell(1).width * METRIC_WIDTH).toBeCloseTo(3, 12);
    expect(cell(1).depth * METRIC_DEPTH).toBeCloseTo(1.5, 12);
    [2, 28, 43, 44, 62, 63, 81].forEach((number) => {
      expect(cell(number).width * METRIC_WIDTH).toBeCloseTo(3, 12);
      expect(cell(number).depth * METRIC_DEPTH).toBeCloseTo(1, 12);
    });

    const modularArea = PAVILION5_COMMERCIAL_REFERENCE_CELLS.reduce(
      (total, candidate) => total
        + candidate.width * METRIC_WIDTH * candidate.depth * METRIC_DEPTH,
      0,
    );
    expect(modularArea).toBeCloseTo(244.5, 10);

    const centralAisle = PAVILION5_COMMERCIAL_REFERENCE_CORRIDORS.find(
      (corridor) => corridor.id === 'central-commercial-aisle',
    )!;
    const westCrossAccess = PAVILION5_COMMERCIAL_REFERENCE_CORRIDORS.find(
      (corridor) => corridor.id === 'west-cross-access',
    )!;
    expect(centralAisle.width * METRIC_WIDTH).toBeCloseTo(5.7, 12);
    expect(westCrossAccess.depth * METRIC_DEPTH).toBeCloseTo(5.5, 12);
  });

  it('mantém apoios e o sombreado do módulo 28 sem criar estado comercial', () => {
    expect(PAVILION5_COMMERCIAL_REFERENCE.exhibitionAreaM2).toBe(508.95);
    expect(PAVILION5_COMMERCIAL_SUPPORT_SPACES).toHaveLength(4);
    PAVILION5_COMMERCIAL_SUPPORT_SPACES.forEach((support) => {
      expect(support.type).toBe('permanent-non-commercial');
      expect(support.sourcePrecision).toBe('official-metric');
      expect(support).not.toHaveProperty('number');
      expect(support).not.toHaveProperty('status');
    });

    expect(cell(28).source.discrepancy).toBe('manual-confirmation-required');
    expect(cell(28).areaM2).toBeNull();
    expect(cell(28)).not.toHaveProperty('status');
    expect(PAVILION5_COMMERCIAL_REFERENCE_CELLS
      .filter((candidate) => candidate.source.discrepancy !== null)
      .map((candidate) => candidate.number)).toEqual([28]);
  });
});
