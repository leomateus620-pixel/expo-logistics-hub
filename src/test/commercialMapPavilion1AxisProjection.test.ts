import { describe, expect, it } from 'vitest';
import {
  createCommercialPavilionReferenceProjectionFrame,
  projectCommercialPavilionReferencePoint,
  projectCommercialPavilionReferenceRect,
  transformCommercialPavilionReferencePoint,
  transformCommercialPavilionReferenceRect,
  transformCommercialPavilionReferenceSequenceOrientation,
  transformCommercialPavilionReferenceShape,
  type CommercialPavilionReferenceCell,
  type CommercialPavilionReferenceRect,
} from '@/features/commercial-map/data/commercialPavilionReference';
import {
  PAVILION1_COMMERCIAL_REFERENCE,
  PAVILION1_COMMERCIAL_REFERENCE_PROJECTION,
  PAVILION1_COMMERCIAL_REFERENCE_RUNS,
} from '@/features/commercial-map/data/pavilion1CommercialReference';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  COMMERCIAL_PAVILION_MODULE_PLANS,
  createCommercialPavilionModuleProjectionFrame,
  projectCommercialPavilionModuleRect,
} from '@/features/commercial-map/utils/commercialPavilionModules';

const EPSILON = 1e-10;
const METRIC_WIDTH = 52.7;
const METRIC_DEPTH = 22.84;
const NORMALIZED_INSET = 0.02;
const NORMALIZED_USABLE = 1 - NORMALIZED_INSET * 2;

function edges(rect: CommercialPavilionReferenceRect) {
  return {
    left: rect.centerX - rect.width / 2,
    right: rect.centerX + rect.width / 2,
    top: rect.centerZ - rect.depth / 2,
    bottom: rect.centerZ + rect.depth / 2,
  };
}

function metricX(normalized: number) {
  return ((normalized - NORMALIZED_INSET) / NORMALIZED_USABLE) * METRIC_WIDTH;
}

function metricZ(normalized: number) {
  return ((normalized - NORMALIZED_INSET) / NORMALIZED_USABLE) * METRIC_DEPTH;
}

function metricRect(runId: string) {
  const run = PAVILION1_COMMERCIAL_REFERENCE_RUNS.find((candidate) => candidate.id === runId);
  if (!run) throw new Error(`Run ${runId} não encontrado.`);
  const runEdges = edges(run.bounds);
  return {
    left: metricX(runEdges.left),
    right: metricX(runEdges.right),
    top: metricZ(runEdges.top),
    bottom: metricZ(runEdges.bottom),
    width: (run.bounds.width / NORMALIZED_USABLE) * METRIC_WIDTH,
    depth: (run.bounds.depth / NORMALIZED_USABLE) * METRIC_DEPTH,
  };
}

function polygonArea(points: readonly (readonly [number, number])[]) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
}

function metricCellArea(cell: CommercialPavilionReferenceCell) {
  if (cell.shape) {
    const metricPoints = cell.shape.footprint.map(([x, z]) => [metricX(x), metricZ(z)] as const);
    return polygonArea(metricPoints);
  }
  return (cell.width / NORMALIZED_USABLE) * METRIC_WIDTH
    * (cell.depth / NORMALIZED_USABLE) * METRIC_DEPTH;
}

function entity(identifier: string) {
  const match = OFFICIAL_REFERENCE_ENTITIES.find(
    (candidate) => candidate.publicIdentifier === identifier,
  );
  if (!match) throw new Error(`Entidade ${identifier} não encontrada.`);
  return match;
}

function worldBounds(identifier: string) {
  const ring = entity(identifier).geometry.coordinates[0];
  const xs = ring.map(([x]) => x);
  const zs = ring.map(([, z]) => z);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...zs);
  const bottom = Math.max(...zs);
  return {
    left,
    right,
    top,
    bottom,
    centerX: (left + right) / 2,
    centerZ: (top + bottom) / 2,
    width: right - left,
    depth: bottom - top,
  };
}

function expectStrictlyIncreasing(values: readonly number[]) {
  values.slice(1).forEach((value, index) => {
    expect(value).toBeGreaterThan(values[index]);
  });
}

function expectStrictlyDecreasing(values: readonly number[]) {
  values.slice(1).forEach((value, index) => {
    expect(value).toBeLessThan(values[index]);
  });
}

describe('projeção oficial do Pavilhão 1', () => {
  it('aplica uma única rotação horária a pontos, retângulos, sequências e shapes', () => {
    const transformedPoint = transformCommercialPavilionReferencePoint(
      [0.2, 0.7],
      'quarter-turn-clockwise',
    );
    expect(transformedPoint[0]).toBeCloseTo(0.3, 12);
    expect(transformedPoint[1]).toBeCloseTo(0.2, 12);
    const transformedRect = transformCommercialPavilionReferenceRect(
      { centerX: 0.2, centerZ: 0.7, width: 0.1, depth: 0.3 },
      'quarter-turn-clockwise',
    );
    expect(transformedRect.centerX).toBeCloseTo(0.3, 12);
    expect(transformedRect.centerZ).toBeCloseTo(0.2, 12);
    expect(transformedRect.width).toBeCloseTo(0.3, 12);
    expect(transformedRect.depth).toBeCloseTo(0.1, 12);
    expect(transformCommercialPavilionReferenceSequenceOrientation(
      'x-decreasing',
      'quarter-turn-clockwise',
    )).toBe('z-decreasing');
    expect(transformCommercialPavilionReferenceSequenceOrientation(
      'z-increasing',
      'quarter-turn-clockwise',
    )).toBe('x-decreasing');

    const module141 = PAVILION1_COMMERCIAL_REFERENCE.cells[140];
    const transformed = transformCommercialPavilionReferenceShape(
      module141.shape!,
      'quarter-turn-clockwise',
    );
    expect(transformed.renderParts).toHaveLength(2);
    expect(transformed.footprint[0]).toEqual(
      transformCommercialPavilionReferencePoint(
        module141.shape!.footprint[0],
        'quarter-turn-clockwise',
      ),
    );
    expect(transformed.labelAnchor).toEqual(
      transformCommercialPavilionReferencePoint(
        module141.shape!.labelAnchor!,
        'quarter-turn-clockwise',
      ),
    );
  });

  it('usa metric-contain com escala uniforme e preserva a proporção 52,70 × 22,84', () => {
    const available = { width: 130.38, depth: 328.38 };
    const frame = createCommercialPavilionReferenceProjectionFrame(
      PAVILION1_COMMERCIAL_REFERENCE_PROJECTION,
      available,
    );
    const expectedScale = Math.min(available.width / METRIC_DEPTH, available.depth / METRIC_WIDTH);

    expect(frame.width).toBeCloseTo(METRIC_DEPTH * expectedScale, 12);
    expect(frame.depth).toBeCloseTo(METRIC_WIDTH * expectedScale, 12);
    expect(frame.depth / frame.width).toBeCloseTo(METRIC_WIDTH / METRIC_DEPTH, 12);
    expect(frame.width).toBeLessThanOrEqual(available.width + EPSILON);
    expect(frame.depth).toBeLessThanOrEqual(available.depth + EPSILON);

    const oneMeterWide = projectCommercialPavilionReferenceRect(
      PAVILION1_COMMERCIAL_REFERENCE.cells[6],
      frame,
    );
    expect(oneMeterWide.width / oneMeterWide.depth).toBeCloseTo(3, 12);
    const threeMeterWide = projectCommercialPavilionReferenceRect(
      PAVILION1_COMMERCIAL_REFERENCE.cells[0],
      frame,
    );
    expect(threeMeterWide.depth / threeMeterWide.width).toBeCloseTo(3, 12);

    const point = projectCommercialPavilionReferencePoint([0.5, 0.5], frame);
    expect(point).toEqual([0, 0]);
  });

  it('alinha um plano métrico contido à fachada sem alterar sua escala uniforme', () => {
    const frame = createCommercialPavilionReferenceProjectionFrame({
      coordinateTransform: 'identity',
      fit: 'metric-contain',
      metricWidthM: 10,
      metricDepthM: 10,
      alignZ: 'end',
    }, { width: 20, depth: 30 });

    expect(frame.width).toBe(20);
    expect(frame.depth).toBe(20);
    expect(frame.centerX).toBe(0);
    expect(frame.centerZ).toBe(5);
    expect(projectCommercialPavilionReferencePoint([0.5, 1], frame)).toEqual([0, 15]);
  });

  it('mantém as cotas, afastamentos, corredores e área modular do anexo oficial', () => {
    const west = metricRect('west-01-06');
    const south = metricRect('south-07-57');
    const special58 = metricRect('south-58');
    const east = metricRect('east-59-64');
    const centralSouth = metricRect('central-south-65-102');
    const centralNorth = metricRect('central-north-103-140');
    const north = metricRect('north-142-189');

    const expectMetrics = (actual: readonly number[], expected: readonly number[]) => {
      actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 12));
    };
    expectMetrics([west.left, west.right, west.top, west.bottom], [0, 3, 13.84, 19.84]);
    expectMetrics([south.left, south.right, south.top, south.bottom], [0, 51, 19.84, 22.84]);
    expectMetrics([special58.left, special58.right, special58.depth], [51, 52.5, 3]);
    expectMetrics([east.left, east.right, east.top, east.bottom], [49.2, 52.7, 13.84, 19.84]);
    expectMetrics([centralNorth.left, centralNorth.right, centralNorth.top, centralNorth.bottom], [7.35, 45.35, 8.42, 11.42]);
    expectMetrics([centralSouth.left, centralSouth.right, centralSouth.top, centralSouth.bottom], [7.35, 45.35, 11.42, 14.42]);
    expectMetrics([north.left, north.right, north.top, north.bottom], [0, 48, 0, 3]);
    expect(centralNorth.left - west.right).toBeCloseTo(4.35, 12);
    expect(east.left - centralNorth.right).toBeCloseTo(3.85, 12);
    expect(east.width).toBeCloseTo(3.5, 12);

    const corridorDepths = PAVILION1_COMMERCIAL_REFERENCE.corridors
      .filter((corridor) => corridor.kind === 'main')
      .map((corridor) => (corridor.depth / NORMALIZED_USABLE) * METRIC_DEPTH);
    corridorDepths.forEach((depth) => expect(depth).toBeCloseTo(5.42, 12));
    expect(PAVILION1_COMMERCIAL_REFERENCE.cells.reduce(
      (sum, cell) => sum + metricCellArea(cell),
      0,
    )).toBeCloseTo(587.85, 10);
    expect(PAVILION1_COMMERCIAL_REFERENCE.cells.every((cell) => cell.areaM2 === null)).toBe(true);
  });

  it('projeta todos os módulos e renderParts dentro do frame sem sobreposição', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B1;
    const footprint = { width: 130.38, depth: 328.38 };
    const frame = createCommercialPavilionModuleProjectionFrame(plan, footprint);
    const projectedParts = plan.cells.flatMap((cell) => (
      (cell.shape?.renderParts ?? [cell]).map((part) => ({
        moduleNumber: cell.number,
        rect: projectCommercialPavilionModuleRect(part, frame),
      }))
    ));

    projectedParts.forEach(({ rect }) => {
      expect(Math.abs(rect.centerX) + rect.width / 2).toBeLessThanOrEqual(
        footprint.width / 2 + EPSILON,
      );
      expect(Math.abs(rect.centerZ) + rect.depth / 2).toBeLessThanOrEqual(
        footprint.depth / 2 + EPSILON,
      );
    });
    projectedParts.forEach((left, leftIndex) => {
      projectedParts.slice(leftIndex + 1).forEach((right) => {
        if (left.moduleNumber === right.moduleNumber) return;
        const overlaps = Math.abs(left.rect.centerX - right.rect.centerX) * 2
            < left.rect.width + right.rect.width - EPSILON
          && Math.abs(left.rect.centerZ - right.rect.centerZ) * 2
            < left.rect.depth + right.rect.depth - EPSILON;
        expect(overlaps, `${left.moduleNumber}/${right.moduleNumber}`).toBe(false);
      });
    });
  });

  it('mantém a topologia oficial nas geometrias externas do mapa', () => {
    const moduleBounds = (number: number) => worldBounds(`B1-M${String(number).padStart(3, '0')}`);
    expectStrictlyIncreasing(Array.from({ length: 6 }, (_, index) => (
      moduleBounds(index + 1).centerZ
    )));
    expect(new Set(Array.from({ length: 6 }, (_, index) => (
      moduleBounds(index + 1).centerX.toFixed(10)
    ))).size).toBe(1);

    expectStrictlyIncreasing(Array.from({ length: 52 }, (_, index) => (
      moduleBounds(index + 7).centerX
    )));
    expectStrictlyDecreasing(Array.from({ length: 6 }, (_, index) => (
      moduleBounds(index + 59).centerZ
    )));
    expectStrictlyDecreasing(Array.from({ length: 38 }, (_, index) => (
      moduleBounds(index + 65).centerX
    )));
    expectStrictlyIncreasing(Array.from({ length: 38 }, (_, index) => (
      moduleBounds(index + 103).centerX
    )));
    expectStrictlyDecreasing(Array.from({ length: 48 }, (_, index) => (
      moduleBounds(index + 142).centerX
    )));

    expect(moduleBounds(103).centerZ).toBeLessThan(moduleBounds(65).centerZ);
    expect(moduleBounds(142).centerZ).toBeLessThan(moduleBounds(103).centerZ);
    expect(moduleBounds(7).centerZ).toBeGreaterThan(moduleBounds(65).centerZ);
    expect(moduleBounds(141).centerX).toBeGreaterThan(moduleBounds(142).centerX);
    expect(moduleBounds(141).centerZ).toBeLessThan(moduleBounds(59).centerZ);
    expect(moduleBounds(7).depth / moduleBounds(7).width).toBeCloseTo(3, 10);
    expect(moduleBounds(1).width / moduleBounds(1).depth).toBeCloseTo(3, 10);

    const module141 = entity('B1-M141');
    expect(module141.geometry.coordinates[0]).toHaveLength(7);
    expect(module141.metadata.layoutRevision).toBe('2026.4-p1.2');
    expect(module141.metadata.planCoordinateTransform).toBe('quarter-turn-clockwise');
    expect(module141.metadata.projectionFit).toBe('metric-contain');
    expect(module141.metadata.metricReference).toEqual({ widthM: 52.7, depthM: 22.84 });
    expect(module141.metadata.areaM2).toBeNull();
  });

  it('preserva os frames legados e reconhece as projeções oficiais posteriores de B2/B8', () => {
    ['B3', 'B6'].forEach((identifier) => {
      const plan = COMMERCIAL_PAVILION_MODULE_PLANS[identifier as 'B3' | 'B6'];
      expect(plan.projection).toEqual({ coordinateTransform: 'identity', fit: 'stretch' });
    });

    expect(COMMERCIAL_PAVILION_MODULE_PLANS.B2.projection).toEqual({
      coordinateTransform: 'quarter-turn-clockwise',
      fit: 'metric-contain',
      metricWidthM: 35,
      metricDepthM: 33,
      alignX: 'center',
      alignZ: 'center',
    });
    expect(COMMERCIAL_PAVILION_MODULE_PLANS.B8.projection).toEqual({
      coordinateTransform: 'identity',
      fit: 'metric-contain',
      metricWidthM: 25.5,
      metricDepthM: 43.5,
      alignX: 'center',
      alignZ: 'end',
    });
  });
});
