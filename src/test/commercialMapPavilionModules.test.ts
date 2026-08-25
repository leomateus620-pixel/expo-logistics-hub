import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_PAVILION_MODULE_PLANS,
  projectCommercialPavilionModuleRect,
  resolveCommercialPavilionModulePlan,
  type CommercialPavilionModulePlan,
  type NormalizedCommercialPavilionRect,
} from '@/features/commercial-map/utils/commercialPavilionModules';
import {
  PAVILION3_COMMERCIAL_MODULE_GAP,
  PAVILION3_COMMERCIAL_REFERENCE,
  PAVILION3_COMMERCIAL_REFERENCE_CELLS,
} from '@/features/commercial-map/data/pavilion3CommercialReference';
import {
  PAVILION1_COMMERCIAL_REFERENCE,
  PAVILION1_COMMERCIAL_REFERENCE_CELLS,
} from '@/features/commercial-map/data/pavilion1CommercialReference';
import {
  PAVILION5_COMMERCIAL_REFERENCE,
  PAVILION5_COMMERCIAL_REFERENCE_CELLS,
  PAVILION5_COMMERCIAL_SUPPORT_SPACES,
} from '@/features/commercial-map/data/pavilion5CommercialReference';
import {
  PAVILION8_COMMERCIAL_GEOMETRIC_AREA_M2,
  PAVILION8_COMMERCIAL_REFERENCE,
  PAVILION8_COMMERCIAL_REFERENCE_CELLS,
  PAVILION8_COMMERCIAL_SUPPORT_SPACES,
} from '@/features/commercial-map/data/pavilion8CommercialReference';
import {
  PAVILION13_COMMERCIAL_REFERENCE,
  PAVILION13_COMMERCIAL_REFERENCE_CELLS,
} from '@/features/commercial-map/data/pavilion13CommercialReference';
import {
  PAVILION12_COMMERCIAL_REFERENCE,
  PAVILION12_COMMERCIAL_REFERENCE_CELLS,
} from '@/features/commercial-map/data/pavilion12CommercialReference';
import {
  PAVILION14_COMMERCIAL_REFERENCE,
  PAVILION14_COMMERCIAL_REFERENCE_CELLS,
} from '@/features/commercial-map/data/pavilion14CommercialReference';
import {
  COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS,
  type CommercialPavilionPublicIdentifier,
} from '@/features/commercial-map/utils/commercialPavilions';

const EXPECTED_PLANS = {
  B1: {
    pavilionNumber: 1,
    category: 'Indústria, Comércio e Serviços',
    moduleCount: 189,
    totalAreaSquareMeters: 1201.5,
    moduleAreaSquareMeters: 587.85,
    ranges: [[1, 6], [7, 57], [58, 58], [59, 64], [65, 102], [103, 140], [141, 141], [142, 189]],
  },
  B2: {
    pavilionNumber: 14,
    category: 'Comércio e Artesanato',
    moduleCount: 186,
    totalAreaSquareMeters: 1155,
    moduleAreaSquareMeters: 616,
    ranges: [[1, 35], [36, 64], [65, 93], [94, 122], [123, 151], [152, 186]],
  },
  B3: {
    pavilionNumber: 12,
    category: 'Indústria, Comércio e Serviços',
    moduleCount: 257,
    totalAreaSquareMeters: 1650,
    moduleAreaSquareMeters: 771,
    ranges: [[1, 22], [23, 40], [41, 82], [83, 124], [125, 166], [167, 208], [209, 257]],
  },
  B4: {
    pavilionNumber: 8,
    category: 'Indústria e Comércio',
    moduleCount: 114,
    totalAreaSquareMeters: 760.2,
    moduleAreaSquareMeters: 438.5,
    ranges: [[1, 20], [21, 37], [38, 89], [90, 114]],
  },
  B5: {
    pavilionNumber: 13,
    category: 'Indústria e Comércio',
    moduleCount: 103,
    totalAreaSquareMeters: 709.05,
    moduleAreaSquareMeters: 351.3,
    ranges: [[1, 26], [27, 29], [30, 77], [78, 103]],
  },
  B6: {
    pavilionNumber: 3,
    category: 'Indústria e Comércio',
    moduleCount: 214,
    totalAreaSquareMeters: 1423.66,
    moduleAreaSquareMeters: 663,
    ranges: [
      [1, 19],
      [20, 36],
      [37, 40],
      [41, 47],
      [48, 79],
      [80, 111],
      [112, 143],
      [144, 175],
      [176, 214],
    ],
  },
  B8: {
    pavilionNumber: 5,
    category: 'Veterinária, Pequenos Animais e Rações',
    moduleCount: 81,
    totalAreaSquareMeters: 841.53,
    moduleAreaSquareMeters: 244.5,
    ranges: [[1, 1], [2, 43], [44, 62], [63, 81]],
  },
  B10: {
    pavilionNumber: 7,
    category: 'Agricultura Familiar / Agroindústrias',
    moduleCount: 57,
    totalAreaSquareMeters: 917,
    moduleAreaSquareMeters: 427.5,
    ranges: [[1, 8], [9, 19], [20, 33], [34, 47], [48, 50], [51, 57]],
  },
} as const satisfies Readonly<Record<CommercialPavilionPublicIdentifier, {
  pavilionNumber: number;
  category: string;
  moduleCount: number;
  totalAreaSquareMeters: number;
  moduleAreaSquareMeters: number;
  ranges: readonly (readonly [number, number])[];
}>>;

function edges(rect: NormalizedCommercialPavilionRect) {
  return {
    left: rect.centerX - rect.width / 2,
    right: rect.centerX + rect.width / 2,
    top: rect.centerZ - rect.depth / 2,
    bottom: rect.centerZ + rect.depth / 2,
  };
}

function expectRectInside(
  rect: NormalizedCommercialPavilionRect,
  container: NormalizedCommercialPavilionRect,
): void {
  const rectEdges = edges(rect);
  const containerEdges = edges(container);
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.depth).toBeGreaterThan(0);
  expect(rectEdges.left).toBeGreaterThanOrEqual(containerEdges.left - 1e-10);
  expect(rectEdges.right).toBeLessThanOrEqual(containerEdges.right + 1e-10);
  expect(rectEdges.top).toBeGreaterThanOrEqual(containerEdges.top - 1e-10);
  expect(rectEdges.bottom).toBeLessThanOrEqual(containerEdges.bottom + 1e-10);
}

function rectsOverlap(
  first: NormalizedCommercialPavilionRect,
  second: NormalizedCommercialPavilionRect,
) {
  const a = edges(first);
  const b = edges(second);
  const epsilon = 1e-10;
  return a.left < b.right - epsilon
    && a.right > b.left + epsilon
    && a.top < b.bottom - epsilon
    && a.bottom > b.top + epsilon;
}

function polygonArea(points: readonly (readonly [number, number])[]): number {
  return Math.abs(points.reduce((total, [x, z], index) => {
    const [nextX, nextZ] = points[(index + 1) % points.length];
    return total + x * nextZ - nextX * z;
  }, 0)) / 2;
}

function metricAreaForPlan(
  plan: CommercialPavilionModulePlan,
  metricWidthM: number,
  metricDepthM: number,
): number {
  const normalizedSpan = 1;
  return plan.cells.reduce((total, cell) => {
    const normalizedArea = cell.shape
      ? polygonArea(cell.shape.footprint)
      : cell.width * cell.depth;
    return total + normalizedArea
      * metricWidthM * metricDepthM
      / (normalizedSpan * normalizedSpan);
  }, 0);
}

function expectNoModuleRenderPartOverlaps(plan: CommercialPavilionModulePlan): void {
  const parts = plan.cells.flatMap((cell) => (
    (cell.shape?.renderParts ?? [cell]).map((part) => ({ cell, part }))
  ));
  const conflicts: string[] = [];
  parts.forEach(({ cell, part }, index) => {
    parts.slice(index + 1).forEach(({ cell: otherCell, part: otherPart }) => {
      if (cell.id !== otherCell.id && rectsOverlap(part, otherPart)) {
        conflicts.push(`${cell.id} invade ${otherCell.id}`);
      }
    });
  });
  expect(conflicts).toEqual([]);
}

function expectOfficialPlan(
  publicIdentifier: CommercialPavilionPublicIdentifier,
  plan: CommercialPavilionModulePlan,
): void {
  const expected = EXPECTED_PLANS[publicIdentifier];
  expect(plan.publicIdentifier).toBe(publicIdentifier);
  expect(plan.stats).toEqual({
    pavilionNumber: expected.pavilionNumber,
    category: expected.category,
    moduleCount: expected.moduleCount,
    totalAreaSquareMeters: expected.totalAreaSquareMeters,
    moduleAreaSquareMeters: expected.moduleAreaSquareMeters,
  });
  expect(plan.legendNumberRanges).toEqual(expected.ranges);
  expect(plan.cells).toHaveLength(expected.moduleCount);
}

function pavilion3Cell(number: number) {
  const cell = COMMERCIAL_PAVILION_MODULE_PLANS.B6.cells.find(
    (candidate) => candidate.number === number,
  );
  expect(cell).toBeDefined();
  return cell!;
}

const OFFICIAL_REFERENCE_PAVILIONS = new Set<CommercialPavilionPublicIdentifier>([
  'B1',
  'B2',
  'B3',
  'B4',
  'B5',
  'B6',
  'B8',
]);

function expectStrictlyIncreasing(values: readonly number[]): void {
  values.slice(1).forEach((value, index) => {
    expect(value).toBeGreaterThan(values[index]);
  });
}

function expectStrictlyDecreasing(values: readonly number[]): void {
  values.slice(1).forEach((value, index) => {
    expect(value).toBeLessThan(values[index]);
  });
}

describe('planos visuais dos módulos internos dos pavilhões', () => {
  it('preserva as oito estatísticas oficiais e as faixas literais do anexo', () => {
    expect(Object.keys(COMMERCIAL_PAVILION_MODULE_PLANS)).toEqual(
      COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS,
    );

    COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS.forEach((publicIdentifier) => {
      expectOfficialPlan(
        publicIdentifier,
        COMMERCIAL_PAVILION_MODULE_PLANS[publicIdentifier],
      );
    });
  });

  it('expande cada módulo em um ID único, contíguo e sem conteúdo de expositor', () => {
    COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS.forEach((publicIdentifier) => {
      const plan = COMMERCIAL_PAVILION_MODULE_PLANS[publicIdentifier];
      const numbers = plan.cells.map((cell) => cell.number);
      const ids = plan.cells.map((cell) => cell.id);
      const labels = plan.cells.map((cell) => cell.label);

      expect(numbers).toEqual(
        Array.from({ length: plan.stats.moduleCount }, (_, index) => index + 1),
      );
      expect(new Set(ids).size).toBe(plan.stats.moduleCount);
      expect(new Set(labels).size).toBe(plan.stats.moduleCount);
      expect(ids[0]).toBe(`${publicIdentifier}:module:001`);
      expect(ids.at(-1)).toBe(
        `${publicIdentifier}:module:${String(plan.stats.moduleCount).padStart(3, '0')}`,
      );

      plan.cells.forEach((cell) => {
        const coreKeys = [
          'centerX',
          'centerZ',
          'depth',
          'id',
          'label',
          'number',
          'width',
          'zoneId',
        ];
        const officialReferenceKeys = [
          'areaM2',
          'centerX',
          'centerZ',
          'cluster',
          'depth',
          'group',
          'id',
          'label',
          'labelAnchor',
          'lotNumber',
          'number',
          'orientation',
          'pavilionId',
          'sequenceOrientation',
          'sortOrder',
          'source',
          'type',
          'width',
          'zoneId',
        ];
        expect(Object.keys(cell).sort()).toEqual(
          OFFICIAL_REFERENCE_PAVILIONS.has(publicIdentifier)
            ? cell.shape
              ? [...officialReferenceKeys, 'shape'].sort()
              : officialReferenceKeys
            : coreKeys,
        );
        expect(cell.label).toBe(String(cell.number).padStart(2, '0'));
        expect(cell).not.toHaveProperty('exhibitorName');
        expect(cell).not.toHaveProperty('companyName');
        expect(cell).not.toHaveProperty('classification');
        expect(cell).not.toHaveProperty('geometry');

        if (OFFICIAL_REFERENCE_PAVILIONS.has(publicIdentifier)) {
          expect(cell.pavilionId).toBe(publicIdentifier);
          expect(cell.lotNumber).toBe(cell.label);
          expect(cell.type).toBe('commercial-lot');
          expect(cell.areaM2).toBeNull();
          expect(cell.sortOrder).toBe(cell.number);
          expect(cell.labelAnchor).toEqual(
            cell.shape?.labelAnchor ?? [cell.centerX, cell.centerZ],
          );
          expect(cell.group).toBeTruthy();
          expect(cell.cluster).toBeTruthy();
          expect(cell.source?.referenceYear).toBe(2026);
        }
      });
    });
  });

  it('mantém células, zonas e corredores dentro do footprint normalizado', () => {
    const corridorConflicts: string[] = [];
    COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS.forEach((publicIdentifier) => {
      const plan = COMMERCIAL_PAVILION_MODULE_PLANS[publicIdentifier];
      expectRectInside(plan.boundary, {
        centerX: 0.5,
        centerZ: 0.5,
        width: 1,
        depth: 1,
      });
      expect(plan.zones.length).toBeGreaterThanOrEqual(3);
      expect(plan.corridors.length).toBeGreaterThanOrEqual(3);
      expect(new Set(plan.zones.map((zone) => zone.id)).size).toBe(plan.zones.length);
      expect(new Set(plan.corridors.map((corridor) => corridor.id)).size).toBe(
        plan.corridors.length,
      );

      plan.zones.forEach((zone) => {
        expectRectInside(zone.bounds, plan.boundary);
        expect(zone.rows * zone.columns).toBe(zone.moduleCount);
        expect(zone.numberRange[1] - zone.numberRange[0] + 1).toBe(zone.moduleCount);
      });
      plan.corridors.forEach((corridor) => expectRectInside(corridor, plan.boundary));
      plan.cells.forEach((cell) => {
        const parentZone = plan.zones.find((zone) => zone.id === cell.zoneId);
        expect(parentZone).toBeDefined();
        expectRectInside(cell, parentZone!.bounds);
        expectRectInside(cell, plan.boundary);
        plan.corridors.forEach((corridor) => {
          if (rectsOverlap(cell, corridor)) {
            corridorConflicts.push(`${publicIdentifier}: ${cell.id} invade ${corridor.id}`);
          }
        });
      });
    });
    expect(corridorConflicts).toEqual([]);
  });

  it('preserva o sentido espacial das sequências visíveis na planta oficial', () => {
    const cell = (publicIdentifier: CommercialPavilionPublicIdentifier, number: number) => {
      const match = COMMERCIAL_PAVILION_MODULE_PLANS[publicIdentifier].cells.find(
        (candidate) => candidate.number === number,
      );
      expect(match).toBeDefined();
      return match!;
    };

    expect(cell('B1', 1).centerZ).toBeLessThan(cell('B1', 6).centerZ);
    expect(cell('B1', 7).centerX).toBeLessThan(cell('B1', 57).centerX);
    expect(cell('B1', 58).centerX).toBeGreaterThan(cell('B1', 57).centerX);
    expect(cell('B1', 59).centerZ).toBeGreaterThan(cell('B1', 64).centerZ);
    expect(cell('B2', 152).centerX).toBeGreaterThan(cell('B2', 186).centerX);
    expect(cell('B2', 36).centerX).toBeGreaterThan(cell('B2', 64).centerX);
    expect(cell('B2', 36).centerZ).toBeGreaterThan(cell('B2', 65).centerZ);
    expect(cell('B3', 1).centerX).toBeGreaterThan(cell('B3', 22).centerX);
    expect(cell('B4', 90).centerZ).toBeLessThan(cell('B4', 114).centerZ);
    expect(cell('B8', 1).centerX).toBe(cell('B8', 43).centerX);
    expect(cell('B8', 1).centerZ).toBeGreaterThan(cell('B8', 43).centerZ);
    expect(cell('B10', 20).centerX).toBeGreaterThan(cell('B10', 33).centerX);
  });

  it('usa as 214 células da referência única e forma duas ilhas com pares de 32 sem tails', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B6;
    expect(plan.cells).toBe(PAVILION3_COMMERCIAL_REFERENCE_CELLS);
    expect(plan.cells).toBe(PAVILION3_COMMERCIAL_REFERENCE.cells);
    expect(plan.source.interpretation).toBe('official-reference-runs');

    const columns = [
      Array.from({ length: 32 }, (_, index) => pavilion3Cell(48 + index)),
      Array.from({ length: 32 }, (_, index) => pavilion3Cell(80 + index)),
      Array.from({ length: 32 }, (_, index) => pavilion3Cell(112 + index)),
      Array.from({ length: 32 }, (_, index) => pavilion3Cell(144 + index)),
    ];
    expectStrictlyDecreasing(columns[0].map((cell) => cell.centerZ));
    expectStrictlyIncreasing(columns[1].map((cell) => cell.centerZ));
    expectStrictlyDecreasing(columns[2].map((cell) => cell.centerZ));
    expectStrictlyIncreasing(columns[3].map((cell) => cell.centerZ));
    columns.forEach((column) => {
      expect(column).toHaveLength(32);
      expect(new Set(column.map((cell) => cell.centerX)).size).toBe(1);
      expect(new Set(column.map((cell) => cell.width)).size).toBe(1);
      expect(new Set(column.map((cell) => cell.depth)).size).toBe(1);
      expect(column.every((cell) => cell.orientation === 'east-west')).toBe(true);
      expect(column.every((cell) => !cell.zoneId.includes('tail'))).toBe(true);
    });
    expect(columns[0][0].depth).toBeCloseTo(columns[1][0].depth, 12);
    expect(columns[1][0].depth).toBeCloseTo(columns[2][0].depth, 12);
    expect(columns[2][0].depth).toBeCloseTo(columns[3][0].depth, 12);
  });

  it('reproduz os oito runs do Pavilhão 1 e mantém 58/141 como unidades especiais únicas', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B1;
    expect(plan.cells).toBe(PAVILION1_COMMERCIAL_REFERENCE_CELLS);
    expect(plan.cells).toBe(PAVILION1_COMMERCIAL_REFERENCE.cells);
    expect(plan.source.interpretation).toBe('official-reference-runs');

    const cell = (number: number) => plan.cells[number - 1];
    expectStrictlyIncreasing(Array.from({ length: 6 }, (_, index) => cell(index + 1).centerZ));
    expectStrictlyIncreasing(Array.from({ length: 51 }, (_, index) => cell(index + 7).centerX));
    expect(cell(58).centerX).toBeGreaterThan(cell(57).centerX);
    const southRegularZone = plan.zones.find((zone) => zone.id === 'south-07-57');
    const southSpecialZone = plan.zones.find((zone) => zone.id === 'south-58');
    expect(southRegularZone).toBeDefined();
    expect(southSpecialZone).toBeDefined();
    expect(
      southSpecialZone!.bounds.width / (southRegularZone!.bounds.width / 51),
    ).toBeCloseTo(1.5, 12);
    expect(cell(58).depth).toBeCloseTo(cell(57).depth, 12);
    expect(cell(58).areaM2).toBeNull();
    expectStrictlyDecreasing(Array.from({ length: 6 }, (_, index) => cell(index + 59).centerZ));
    expectStrictlyDecreasing(Array.from({ length: 38 }, (_, index) => cell(index + 65).centerX));
    expectStrictlyIncreasing(Array.from({ length: 38 }, (_, index) => cell(index + 103).centerX));
    expectStrictlyDecreasing(Array.from({ length: 48 }, (_, index) => cell(index + 142).centerX));

    const irregular = cell(141);
    expect(plan.cells.filter((candidate) => candidate.number === 141)).toHaveLength(1);
    expect(irregular.shape?.footprint).toHaveLength(6);
    expect(irregular.shape?.renderParts).toHaveLength(2);
    expect(plan.cells.filter((candidate) => candidate.shape)).toEqual([irregular]);
    expect(plan.supportSpaces).toEqual([]);
  });

  it('reproduz as três colunas de Pavilhão 5 e separa quatro apoios permanentes não comerciais', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B8;
    expect(plan.cells).toBe(PAVILION5_COMMERCIAL_REFERENCE_CELLS);
    expect(plan.cells).toBe(PAVILION5_COMMERCIAL_REFERENCE.cells);
    expect(plan.supportSpaces).toBe(PAVILION5_COMMERCIAL_SUPPORT_SPACES);

    const cell = (number: number) => plan.cells[number - 1];
    const east = Array.from({ length: 43 }, (_, index) => cell(index + 1));
    const westNorth = Array.from({ length: 19 }, (_, index) => cell(index + 44));
    const westSouth = Array.from({ length: 19 }, (_, index) => cell(index + 63));
    expect(new Set(east.map((candidate) => candidate.centerX)).size).toBe(1);
    expect(new Set(westNorth.map((candidate) => candidate.centerX)).size).toBe(1);
    expect(new Set(westSouth.map((candidate) => candidate.centerX)).size).toBe(1);
    expectStrictlyDecreasing(east.map((candidate) => candidate.centerZ));
    expectStrictlyIncreasing(westNorth.map((candidate) => candidate.centerZ));
    expectStrictlyIncreasing(westSouth.map((candidate) => candidate.centerZ));
    expect(westNorth[0].centerX).toBeLessThan(east[0].centerX);
    expect(westSouth[0].centerX).toBe(westNorth[0].centerX);
    expect(edges(westNorth.at(-1)!).bottom).toBeLessThan(edges(westSouth[0]).top);
    const eastRegularZone = plan.zones.find((zone) => zone.id === 'east-02-43');
    const eastSpecialZone = plan.zones.find((zone) => zone.id === 'east-bottom-01');
    expect(eastRegularZone).toBeDefined();
    expect(eastSpecialZone).toBeDefined();
    expect(
      eastSpecialZone!.bounds.depth / (eastRegularZone!.bounds.depth / 42),
    ).toBeCloseTo(1.5, 12);
    expect(cell(1).width).toBeCloseTo(cell(2).width, 12);
    expect(cell(1).areaM2).toBeNull();

    expect(plan.supportSpaces).toHaveLength(4);
    expect(new Set(plan.supportSpaces.map((space) => space.id)).size).toBe(4);
    expect(plan.supportSpaces.map((space) => space.label)).toEqual([
      'Depósito Fenasoja',
      'Depósito Hortigranjeiros',
      'Alojamento Peões',
      'Alojamento Peoas',
    ]);
    plan.supportSpaces.forEach((space) => {
      expect(space.type).toBe('permanent-non-commercial');
      expectRectInside(space, plan.boundary);
      expect(plan.cells.some((candidate) => rectsOverlap(candidate, space))).toBe(false);
      expect(space).not.toHaveProperty('number');
      expect(space).not.toHaveProperty('lotNumber');
    });
  });

  it('reconstrói o Pavilhão 8 em oito runs oficiais, com o módulo 90 irregular e sem sobreposições', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B4;
    expect(plan.cells).toBe(PAVILION8_COMMERCIAL_REFERENCE_CELLS);
    expect(plan.cells).toBe(PAVILION8_COMMERCIAL_REFERENCE.cells);
    expect(plan.source.interpretation).toBe('official-reference-runs');
    expect(plan.projection).toEqual({
      coordinateTransform: 'identity',
      fit: 'metric-contain',
      metricWidthM: 21.7,
      metricDepthM: 35.4,
      alignX: 'center',
      alignZ: 'end',
    });
    expect(plan.zones.map((zone) => zone.numberRange)).toEqual([
      [1, 20],
      [21, 25],
      [26, 37],
      [38, 63],
      [64, 89],
      [90, 90],
      [91, 100],
      [101, 114],
    ]);

    const cell = (number: number) => plan.cells[number - 1];
    expectStrictlyDecreasing(Array.from({ length: 20 }, (_, index) => cell(index + 1).centerZ));
    expectStrictlyDecreasing(Array.from({ length: 5 }, (_, index) => cell(index + 21).centerZ));
    expectStrictlyDecreasing(Array.from({ length: 12 }, (_, index) => cell(index + 26).centerX));
    expectStrictlyIncreasing(Array.from({ length: 26 }, (_, index) => cell(index + 38).centerZ));
    expectStrictlyDecreasing(Array.from({ length: 26 }, (_, index) => cell(index + 64).centerZ));
    expectStrictlyIncreasing(Array.from({ length: 10 }, (_, index) => cell(index + 91).centerZ));
    expectStrictlyIncreasing(Array.from({ length: 14 }, (_, index) => cell(index + 101).centerZ));
    expect(cell(1).centerX).toBe(cell(20).centerX);
    expect(cell(38).centerX).toBeGreaterThan(cell(64).centerX);

    const eastUpper = plan.zones.find((zone) => zone.id === 'east-upper-21-25')!;
    const eastLower = plan.zones.find((zone) => zone.id === 'east-lower-01-20')!;
    const westUpper = plan.zones.find((zone) => zone.id === 'west-upper-91-100')!;
    const westLower = plan.zones.find((zone) => zone.id === 'west-lower-101-114')!;
    expect((edges(eastLower.bounds).top - edges(eastUpper.bounds).bottom) * 35.4)
      .toBeCloseTo(4, 12);
    expect((edges(westLower.bounds).top - edges(westUpper.bounds).bottom) * 35.4)
      .toBeCloseTo(4, 12);
    ['west-cross-access', 'east-cross-access'].forEach((corridorId) => {
      const access = plan.corridors.find((corridor) => corridor.id === corridorId)!;
      expect(access.depth * 35.4).toBeCloseTo(4, 12);
    });

    const irregular = cell(90);
    expect(plan.cells.filter((candidate) => candidate.shape)).toEqual([irregular]);
    expect(irregular.shape?.footprint).toHaveLength(6);
    expect(irregular.shape?.renderParts).toHaveLength(2);
    expect(irregular.areaM2).toBeNull();
    expect(PAVILION8_COMMERCIAL_GEOMETRIC_AREA_M2).toBe(438.5);
    expect(metricAreaForPlan(plan, 21.7, 35.4)).toBeCloseTo(438.5, 9);
    expectNoModuleRenderPartOverlaps(plan);
  });

  it('mantém cozinha, sanitários e apoio do Pavilhão 8 fora do inventário comercial', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B4;
    expect(plan.supportSpaces).toBe(PAVILION8_COMMERCIAL_SUPPORT_SPACES);
    expect(plan.supportSpaces).toHaveLength(3);
    expect(plan.supportSpaces.map((space) => space.label)).toEqual([
      'Sanitários',
      'Cozinha',
      'Apoio de serviço',
    ]);
    plan.supportSpaces.forEach((space) => {
      expect(space.type).toBe('permanent-non-commercial');
      expect(space.sourcePrecision).toBe('plan-traced');
      expect(edges(space).top).toBeLessThan(edges(plan.boundary).top);
      expect(plan.cells.some((candidate) => (
        (candidate.shape?.renderParts ?? [candidate]).some((part) => rectsOverlap(part, space))
      ))).toBe(false);
      expect(space).not.toHaveProperty('number');
      expect(space).not.toHaveProperty('lotNumber');
      expect(space).not.toHaveProperty('status');
    });
  });

  it('reconstrói o Pavilhão 13 no referencial da planta com quatro módulos poligonais', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B5;
    expect(plan.cells).toBe(PAVILION13_COMMERCIAL_REFERENCE_CELLS);
    expect(plan.cells).toBe(PAVILION13_COMMERCIAL_REFERENCE.cells);
    expect(plan.source.interpretation).toBe('official-reference-runs');
    expect(plan.projection).toEqual({
      coordinateTransform: 'identity',
      fit: 'metric-contain',
      metricWidthM: 21,
      metricDepthM: 35.35,
      alignX: 'center',
      alignZ: 'end',
    });
    expect(plan.zones.map((zone) => zone.numberRange)).toEqual([
      [1, 15],
      [16, 24],
      [25, 25],
      [26, 26],
      [27, 29],
      [30, 53],
      [54, 77],
      [78, 78],
      [79, 79],
      [80, 88],
      [89, 103],
    ]);

    const cell = (number: number) => plan.cells[number - 1];
    expectStrictlyDecreasing(Array.from({ length: 15 }, (_, index) => cell(index + 1).centerZ));
    expectStrictlyDecreasing(Array.from({ length: 9 }, (_, index) => cell(index + 16).centerZ));
    expectStrictlyDecreasing(Array.from({ length: 3 }, (_, index) => cell(index + 27).centerX));
    expectStrictlyIncreasing(Array.from({ length: 24 }, (_, index) => cell(index + 30).centerZ));
    expectStrictlyDecreasing(Array.from({ length: 24 }, (_, index) => cell(index + 54).centerZ));
    expectStrictlyIncreasing(Array.from({ length: 9 }, (_, index) => cell(index + 80).centerZ));
    expectStrictlyIncreasing(Array.from({ length: 15 }, (_, index) => cell(index + 89).centerZ));
    expect(cell(30).centerX).toBeGreaterThan(cell(77).centerX);
    expect(cell(30).centerZ).toBeCloseTo(cell(77).centerZ, 12);
    expect(cell(53).centerZ).toBeCloseTo(cell(54).centerZ, 12);

    expect(plan.cells.filter((candidate) => candidate.shape).map((candidate) => candidate.number))
      .toEqual([25, 26, 78, 79]);
    [25, 26, 78, 79].forEach((number) => {
      expect(cell(number).shape?.footprint).toHaveLength(4);
      expect(cell(number).shape?.renderParts.length).toBeGreaterThanOrEqual(12);
      expect(cell(number).areaM2).toBeNull();
    });
    expect(metricAreaForPlan(plan, 21, 35.35)).toBeCloseTo(351.3, 9);
    expect(PAVILION13_COMMERCIAL_REFERENCE.source.geometricModuleAreaM2)
      .toBeCloseTo(351.3, 9);
    expectNoModuleRenderPartOverlaps(plan);
    expect(plan.supportSpaces).toEqual([]);
  });

  it('reproduz o Pavilhão 12 em sete sequências, 257 módulos de 1 × 3 m e três eixos de circulação', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B3;
    expect(plan.cells).toBe(PAVILION12_COMMERCIAL_REFERENCE_CELLS);
    expect(plan.cells).toBe(PAVILION12_COMMERCIAL_REFERENCE.cells);
    expect(plan.source.interpretation).toBe('official-reference-runs');

    const expectedCellWidth = 0.96 / 50;
    const expectedCellDepth = (3 / 33) * 0.96;
    plan.cells.forEach((cell) => {
      expect(cell.width).toBeCloseTo(expectedCellWidth, 12);
      expect(cell.depth).toBeCloseTo(expectedCellDepth, 12);
    });
    const physicalArea = plan.cells.reduce((total, cell) => (
      total + (cell.width / 0.96) * 50 * (cell.depth / 0.96) * 33
    ), 0);
    expect(physicalArea).toBeCloseTo(771, 9);

    const cell = (number: number) => plan.cells[number - 1];
    expect(cell(1).centerX).toBeGreaterThan(cell(22).centerX);
    expect(cell(23).centerX).toBeGreaterThan(cell(40).centerX);
    expect(cell(41).centerX).toBeLessThan(cell(82).centerX);
    expect(cell(83).centerX).toBeGreaterThan(cell(124).centerX);
    expect(cell(125).centerX).toBeLessThan(cell(166).centerX);
    expect(cell(167).centerX).toBeGreaterThan(cell(208).centerX);
    expect(cell(209).centerX).toBeLessThan(cell(257).centerX);
    expect(cell(41).cluster).toBe(cell(124).cluster);
    expect(cell(125).cluster).toBe(cell(208).cluster);
    expect(plan.corridors.map((corridor) => corridor.id)).toEqual(expect.arrayContaining([
      'north-distribution',
      'central-distribution',
      'south-distribution',
    ]));
  });

  it('reproduz o Pavilhão 14 em seis sequências e preserva a divergência 73–74 para confirmação', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B2;
    expect(plan.cells).toBe(PAVILION14_COMMERCIAL_REFERENCE_CELLS);
    expect(plan.cells).toBe(PAVILION14_COMMERCIAL_REFERENCE.cells);
    expect(plan.source.interpretation).toBe('official-reference-runs');

    const expectedCellWidth = 0.96 / 35;
    plan.cells.forEach((cell) => {
      expect(cell.width).toBeCloseTo(expectedCellWidth, 12);
      const depthMeters = cell.number <= 35 || cell.number >= 152 ? 3 : 3.5;
      expect(cell.depth).toBeCloseTo((depthMeters / 33) * 0.96, 12);
    });
    const physicalArea = plan.cells.reduce((total, cell) => (
      total + (cell.width / 0.96) * 35 * (cell.depth / 0.96) * 33
    ), 0);
    expect(physicalArea).toBeCloseTo(616, 9);

    const cell = (number: number) => plan.cells[number - 1];
    expect(cell(1).centerX).toBeLessThan(cell(35).centerX);
    expect(cell(36).centerX).toBeGreaterThan(cell(64).centerX);
    expect(cell(65).centerX).toBeLessThan(cell(93).centerX);
    expect(cell(94).centerX).toBeGreaterThan(cell(122).centerX);
    expect(cell(123).centerX).toBeLessThan(cell(151).centerX);
    expect(cell(152).centerX).toBeGreaterThan(cell(186).centerX);
    expect(plan.cells
      .filter((candidate) => candidate.source?.discrepancy === 'manual-confirmation-required')
      .map((candidate) => candidate.number)).toEqual([73, 74]);
    expect(cell(36).centerZ).toBeGreaterThan(cell(65).centerZ);
    expect(cell(94).centerZ).toBeGreaterThan(cell(123).centerZ);
  });

  it('espelha as extremidades das colunas pareadas de Pavilhão 3', () => {
    const east = [48, 49, 50, 51, 52].map(pavilion3Cell);
    const west = [107, 108, 109, 110, 111].map(pavilion3Cell);

    expect(new Set(east.map((cell) => cell.centerX)).size).toBe(1);
    expectStrictlyDecreasing(east.map((cell) => cell.centerZ));
    expect(new Set(west.map((cell) => cell.centerX)).size).toBe(1);
    expectStrictlyIncreasing(west.map((cell) => cell.centerZ));
    expect(east[0].centerX).toBeGreaterThan(west[0].centerX);
    expect(edges(west[0]).right).toBeLessThan(edges(east[0]).left);

    expect(pavilion3Cell(48).centerZ).toBeCloseTo(pavilion3Cell(111).centerZ, 12);
    expect(pavilion3Cell(49).centerZ).toBeCloseTo(pavilion3Cell(110).centerZ, 12);
    expect(pavilion3Cell(50).centerZ).toBeCloseTo(pavilion3Cell(109).centerZ, 12);
    expect(pavilion3Cell(51).centerZ).toBeCloseTo(pavilion3Cell(108).centerZ, 12);
    expect(pavilion3Cell(52).centerZ).toBeCloseTo(pavilion3Cell(107).centerZ, 12);
    expect(pavilion3Cell(112).centerZ).toBeCloseTo(pavilion3Cell(175).centerZ, 12);
    expect(pavilion3Cell(143).centerZ).toBeCloseTo(pavilion3Cell(144).centerZ, 12);
  });

  it('mantém gaps internos iguais e preserva os acessos entre 19/20 e 40/41', () => {
    PAVILION3_COMMERCIAL_REFERENCE.runs.forEach((run) => {
      const cells = COMMERCIAL_PAVILION_MODULE_PLANS.B6.cells
        .filter((cell) => cell.zoneId === run.id)
        .slice()
        .sort((first, second) => run.sequenceOrientation === 'x-increasing'
          ? first.centerX - second.centerX
          : first.centerZ - second.centerZ);

      cells.slice(1).forEach((cell, index) => {
        const previous = cells[index];
        const gap = run.sequenceOrientation === 'x-increasing'
          ? edges(cell).left - edges(previous).right
          : edges(cell).top - edges(previous).bottom;
        expect(gap).toBeCloseTo(PAVILION3_COMMERCIAL_MODULE_GAP, 12);
      });
    });

    const lateralAccess = COMMERCIAL_PAVILION_MODULE_PLANS.B6.corridors.find(
      (corridor) => corridor.id === 'west-lateral-access',
    )!;
    const southAccess = COMMERCIAL_PAVILION_MODULE_PLANS.B6.corridors.find(
      (corridor) => corridor.id === 'south-access',
    )!;
    expect(edges(pavilion3Cell(19)).bottom).toBeLessThan(edges(lateralAccess).top);
    expect(edges(lateralAccess).bottom).toBeLessThan(edges(pavilion3Cell(20)).top);
    expect(edges(pavilion3Cell(40)).right).toBeLessThan(edges(southAccess).left);
    expect(edges(southAccess).right).toBeLessThan(edges(pavilion3Cell(41)).left);
  });

  it('mantém área individual vazia, metadados neutros e lacunas documentais explícitas', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B6;
    expect(plan.stats.moduleAreaSquareMeters).toBe(663);
    expect(plan.cells.every((cell) => cell.areaM2 === null)).toBe(true);

    const discrepancyNumbers = plan.cells
      .filter((cell) => cell.source?.discrepancy === 'official-range-omission')
      .map((cell) => cell.number);
    expect(discrepancyNumbers).toEqual([]);
    expect(plan.cells.every((cell) => cell.source?.referenceYear === 2026)).toBe(true);

    const exposedLabels = [
      ...plan.zones.map((zone) => zone.label),
      ...plan.corridors.map((corridor) => corridor.label),
    ].join(' ');
    expect(exposedLabels).not.toMatch(/ala oeste|retorno sul/i);
  });

  it('mantém topologias distintas e resolve somente identificadores exatos', () => {
    const topologies = Object.values(COMMERCIAL_PAVILION_MODULE_PLANS).map(
      (plan) => plan.topology,
    );
    expect(new Set(topologies).size).toBe(COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS.length);

    expect(resolveCommercialPavilionModulePlan({ publicIdentifier: ' b8 ' })).toBe(
      COMMERCIAL_PAVILION_MODULE_PLANS.B8,
    );
    expect(resolveCommercialPavilionModulePlan({ publicIdentifier: 'B10' })).toBe(
      COMMERCIAL_PAVILION_MODULE_PLANS.B10,
    );
    expect(resolveCommercialPavilionModulePlan({ publicIdentifier: 'B12' })).toBeNull();
    expect(resolveCommercialPavilionModulePlan({ publicIdentifier: 'B7' })).toBeNull();
  });

  it('projeta células normalizadas para coordenadas locais sem escapar dos limites', () => {
    const footprint = { width: 24, depth: 12 };

    Object.values(COMMERCIAL_PAVILION_MODULE_PLANS).forEach((plan) => {
      plan.cells.forEach((cell) => {
        const projected = projectCommercialPavilionModuleRect(cell, footprint);
        expect(Math.abs(projected.centerX) + projected.width / 2).toBeLessThanOrEqual(
          footprint.width / 2 + 1e-10,
        );
        expect(Math.abs(projected.centerZ) + projected.depth / 2).toBeLessThanOrEqual(
          footprint.depth / 2 + 1e-10,
        );
      });
    });
  });
});
