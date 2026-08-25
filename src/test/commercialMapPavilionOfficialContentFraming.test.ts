import { describe, expect, it } from 'vitest';
import {
  createCommercialPavilionReferenceProjectionFrame,
  projectCommercialPavilionReferenceRect,
  type CommercialPavilionInteriorPresentation,
  type CommercialPavilionReferenceRect,
} from '@/features/commercial-map/data/commercialPavilionReference';
import { PAVILION13_COMMERCIAL_REFERENCE } from '@/features/commercial-map/data/pavilion13CommercialReference';
import { PAVILION5_COMMERCIAL_REFERENCE } from '@/features/commercial-map/data/pavilion5CommercialReference';
import {
  PAVILION8_COMMERCIAL_REFERENCE,
  PAVILION8_COMMERCIAL_SUPPORT_SPACES,
} from '@/features/commercial-map/data/pavilion8CommercialReference';
import {
  COMMERCIAL_PAVILION_MODULE_PLANS,
  commercialPavilionOfficialContentAspect,
  deriveCommercialPavilionOfficialContentEnvelope,
  projectCommercialPavilionOfficialContentEnvelope,
  type CommercialPavilionModulePlan,
} from '@/features/commercial-map/utils/commercialPavilionModules';
import {
  commercialPavilionInteriorPresentationBounds,
  createCommercialPavilionLayout,
  resolveCommercialPavilionDefinition,
} from '@/features/commercial-map/utils/commercialPavilions';

const OFFICIAL_CONTENT_PRESENTATION = {
  fit: 'official-content',
} as const satisfies CommercialPavilionInteriorPresentation;

function edges(rect: CommercialPavilionReferenceRect) {
  return {
    left: rect.centerX - rect.width / 2,
    right: rect.centerX + rect.width / 2,
    top: rect.centerZ - rect.depth / 2,
    bottom: rect.centerZ + rect.depth / 2,
  };
}

function expectEdges(
  rect: CommercialPavilionReferenceRect,
  expected: ReturnType<typeof edges>,
) {
  const actual = edges(rect);
  expect(actual.left).toBeCloseTo(expected.left, 12);
  expect(actual.right).toBeCloseTo(expected.right, 12);
  expect(actual.top).toBeCloseTo(expected.top, 12);
  expect(actual.bottom).toBeCloseTo(expected.bottom, 12);
}

describe('enquadramento interno pelo conteúdo oficial dos Pavilhões 5, 8 e 13', () => {
  it('ativa official-content somente nas três referências e planos autorizados', () => {
    [
      [PAVILION5_COMMERCIAL_REFERENCE, COMMERCIAL_PAVILION_MODULE_PLANS.B8],
      [PAVILION8_COMMERCIAL_REFERENCE, COMMERCIAL_PAVILION_MODULE_PLANS.B4],
      [PAVILION13_COMMERCIAL_REFERENCE, COMMERCIAL_PAVILION_MODULE_PLANS.B5],
    ].forEach(([reference, plan]) => {
      expect(reference.interiorPresentation).toEqual(OFFICIAL_CONTENT_PRESENTATION);
      expect(plan.interiorPresentation).toEqual(OFFICIAL_CONTENT_PRESENTATION);
    });
  });

  it('deriva o envelope de boundary, lotes, polígonos, renderParts, corredores e apoios', () => {
    const pavilion13 = COMMERCIAL_PAVILION_MODULE_PLANS.B5;
    const polygonCell = pavilion13.cells.find((cell) => cell.number === 25)!;
    const probe = {
      ...pavilion13,
      boundary: { centerX: 0.5, centerZ: 0.5, width: 0.2, depth: 0.2 },
      cells: [{
        ...polygonCell,
        centerX: 0.2,
        centerZ: 0.5,
        width: 0.1,
        depth: 0.1,
        shape: {
          footprint: [[0.1, 0.3], [0.3, 0.3], [0.3, 0.4], [0.1, 0.4]],
          renderParts: [{ centerX: 0.225, centerZ: 0.2, width: 0.05, depth: 0.1 }],
          labelAnchor: [0.2, 0.35],
        },
      }],
      corridors: [{
        ...pavilion13.corridors[0],
        centerX: 0.8,
        centerZ: 0.5,
        width: 0.2,
        depth: 0.1,
      }],
      supportSpaces: [{
        ...PAVILION8_COMMERCIAL_SUPPORT_SPACES[0],
        centerX: 0.5,
        centerZ: 1.05,
        width: 0.1,
        depth: 0.1,
      }],
    } satisfies CommercialPavilionModulePlan;

    expectEdges(deriveCommercialPavilionOfficialContentEnvelope(probe), {
      left: 0.1,
      right: 0.9,
      top: 0.15,
      bottom: 1.1,
    });
  });

  it('mantém P5/P13 no envelope métrico completo e incorpora o overflow plan-traced de P8', () => {
    expectEdges(
      deriveCommercialPavilionOfficialContentEnvelope(COMMERCIAL_PAVILION_MODULE_PLANS.B8),
      { left: 0, right: 1, top: 0, bottom: 1 },
    );
    expectEdges(
      deriveCommercialPavilionOfficialContentEnvelope(COMMERCIAL_PAVILION_MODULE_PLANS.B5),
      { left: 0, right: 1, top: 0, bottom: 1 },
    );

    const pavilion8Overflow = 7.4 / 35.4;
    const pavilion8Envelope = deriveCommercialPavilionOfficialContentEnvelope(
      COMMERCIAL_PAVILION_MODULE_PLANS.B4,
    );
    expectEdges(pavilion8Envelope, {
      left: 0,
      right: 1,
      top: -pavilion8Overflow,
      bottom: 1,
    });
    expect(edges(pavilion8Envelope).top).toBeCloseTo(
      edges(PAVILION8_COMMERCIAL_SUPPORT_SPACES[0]).top,
      12,
    );
  });

  it('calcula a proporção métrica efetiva, inclusive os 7,40 m plan-traced ao norte de P8', () => {
    expect(commercialPavilionOfficialContentAspect(COMMERCIAL_PAVILION_MODULE_PLANS.B8))
      .toBeCloseTo(25.5 / 43.5, 12);
    expect(commercialPavilionOfficialContentAspect(COMMERCIAL_PAVILION_MODULE_PLANS.B5))
      .toBeCloseTo(21 / 35.35, 12);
    expect(commercialPavilionOfficialContentAspect(COMMERCIAL_PAVILION_MODULE_PLANS.B4))
      .toBeCloseTo(21.7 / (35.4 + 7.4), 12);
  });

  it('faz o envelope oficial preencher integralmente o clear frame interno', () => {
    ([
      ['B8', { width: 12, depth: 7 }],
      ['B4', { width: 4, depth: 12 }],
      ['B5', { width: 5, depth: 11 }],
    ] as const).forEach(([identifier, physicalBounds]) => {
      const plan = COMMERCIAL_PAVILION_MODULE_PLANS[identifier];
      const definition = resolveCommercialPavilionDefinition({ publicIdentifier: identifier })!;
      const envelope = deriveCommercialPavilionOfficialContentEnvelope(plan)!;
      const aspect = commercialPavilionOfficialContentAspect(plan)!;
      const physicalLayout = createCommercialPavilionLayout(
        physicalBounds,
        definition,
        undefined,
        plan,
      );
      const physicalContentEnvelope = projectCommercialPavilionOfficialContentEnvelope(
        plan,
        {
          width: physicalLayout.interior.clearWidth,
          depth: physicalLayout.interior.clearDepth,
        },
      )!;
      const presentationBounds = commercialPavilionInteriorPresentationBounds(
        physicalBounds,
        physicalContentEnvelope,
      );
      const layout = createCommercialPavilionLayout(
        presentationBounds,
        definition,
        undefined,
        plan,
      );
      expect(layout.interior.clearWidth / layout.interior.clearDepth)
        .toBeCloseTo(aspect, 12);
      expect(layout.interior.clearWidth).toBeCloseTo(physicalContentEnvelope.width, 12);
      expect(layout.interior.clearDepth).toBeCloseTo(physicalContentEnvelope.depth, 12);

      const projectionFrame = createCommercialPavilionReferenceProjectionFrame(
        plan.projection,
        {
          width: layout.interior.clearWidth,
          depth: layout.interior.clearDepth,
        },
      );
      const projectedEnvelope = projectCommercialPavilionReferenceRect(
        envelope,
        projectionFrame,
      );
      expect(projectedEnvelope.centerX).toBeCloseTo(0, 12);
      expect(projectedEnvelope.centerZ).toBeCloseTo(0, 12);
      expect(projectedEnvelope.width).toBeCloseTo(layout.interior.clearWidth, 12);
      expect(projectedEnvelope.depth).toBeCloseTo(layout.interior.clearDepth, 12);
    });
  });

  it('não altera pavilhões sem opt-in', () => {
    (['B1', 'B2', 'B3', 'B6', 'B10'] as const).forEach((identifier) => {
      const plan = COMMERCIAL_PAVILION_MODULE_PLANS[identifier];
      expect(plan.interiorPresentation).toBeUndefined();
      expect(commercialPavilionOfficialContentAspect(plan)).toBeNull();
    });
  });
});
