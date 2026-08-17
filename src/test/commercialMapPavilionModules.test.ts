import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_PAVILION_MODULE_PLANS,
  projectCommercialPavilionModuleRect,
  resolveCommercialPavilionModulePlan,
  type CommercialPavilionModulePlan,
  type NormalizedCommercialPavilionRect,
} from '@/features/commercial-map/utils/commercialPavilionModules';
import {
  COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS,
  type CommercialPavilionPublicIdentifier,
} from '@/features/commercial-map/utils/commercialPavilions';

const EXPECTED_PLANS = {
  B1: {
    pavilionNumber: 1,
    category: 'Comércio e Serviços',
    moduleCount: 189,
    totalAreaSquareMeters: 1201.5,
    moduleAreaSquareMeters: 587,
    ranges: [[1, 61], [62, 64], [65, 140], [141, 189]],
  },
  B2: {
    pavilionNumber: 14,
    category: 'Comércio e Artesanato',
    moduleCount: 186,
    totalAreaSquareMeters: 1155,
    moduleAreaSquareMeters: 616,
    ranges: [[1, 35], [36, 93], [94, 151], [152, 186]],
  },
  B3: {
    pavilionNumber: 12,
    category: 'Indústria, Comércio e Serviços',
    moduleCount: 257,
    totalAreaSquareMeters: 1650,
    moduleAreaSquareMeters: 771,
    ranges: [[1, 22], [23, 40], [41, 124], [125, 208], [209, 257]],
  },
  B4: {
    pavilionNumber: 8,
    category: 'Indústria, Comércio e Serviços',
    moduleCount: 114,
    totalAreaSquareMeters: 760,
    moduleAreaSquareMeters: 434,
    ranges: [[1, 20], [21, 37], [38, 89], [90, 114]],
  },
  B5: {
    pavilionNumber: 13,
    category: 'Comércio',
    moduleCount: 103,
    totalAreaSquareMeters: 709,
    moduleAreaSquareMeters: 351,
    ranges: [[1, 26], [27, 29], [30, 77], [78, 103]],
  },
  B6: {
    pavilionNumber: 3,
    category: 'Comércio',
    moduleCount: 214,
    totalAreaSquareMeters: 1423,
    moduleAreaSquareMeters: 663,
    ranges: [[1, 36], [37, 47], [48, 111], [112, 175], [176, 214]],
  },
  B8: {
    pavilionNumber: 5,
    category: 'Floriculturas',
    moduleCount: 81,
    totalAreaSquareMeters: 841.5,
    moduleAreaSquareMeters: 244.5,
    ranges: [[1, 43], [44, 62], [63, 81]],
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
  expect(plan.zones.map((zone) => zone.numberRange)).toEqual(expected.ranges);
  expect(plan.cells).toHaveLength(expected.moduleCount);
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
        expect(Object.keys(cell).sort()).toEqual([
          'centerX',
          'centerZ',
          'depth',
          'id',
          'label',
          'number',
          'width',
          'zoneId',
        ]);
        expect(cell.label).toBe(String(cell.number).padStart(2, '0'));
        expect(cell).not.toHaveProperty('exhibitorName');
        expect(cell).not.toHaveProperty('companyName');
        expect(cell).not.toHaveProperty('classification');
        expect(cell).not.toHaveProperty('geometry');
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

    expect(cell('B1', 1).centerX).toBeGreaterThan(cell('B1', 61).centerX);
    expect(cell('B2', 152).centerX).toBeGreaterThan(cell('B2', 186).centerX);
    expect(cell('B2', 36).centerX).toBeGreaterThan(cell('B2', 64).centerX);
    expect(cell('B2', 36).centerZ).toBeGreaterThan(cell('B2', 65).centerZ);
    expect(cell('B3', 1).centerX).toBeGreaterThan(cell('B3', 22).centerX);
    expect(cell('B4', 90).centerZ).toBeGreaterThan(cell('B4', 114).centerZ);
    expect(cell('B8', 1).centerX).toBeGreaterThan(cell('B8', 43).centerX);
    expect(cell('B10', 20).centerX).toBeGreaterThan(cell('B10', 33).centerX);
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
