import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import type { MapEntity } from '@/features/commercial-map/types';
import { resolveCommercialPavilionModulePlan } from '@/features/commercial-map/utils/commercialPavilionModules';
import {
  COMMERCIAL_PAVILION_DEFINITIONS,
  COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS,
  commercialPavilionFacingRadians,
  commercialPavilionFocusDirection,
  commercialPavilionInteriorViewRotationRadians,
  commercialPavilionModelBounds,
  commercialPavilionSupportsInterior,
  commercialPavilionVisualHeight,
  createCommercialPavilionLayout,
  resolveCommercialPavilionDefinition,
  type CommercialPavilionBoundsDimensions,
  type CommercialPavilionPublicIdentifier,
  type CommercialPavilionRect,
} from '@/features/commercial-map/utils/commercialPavilions';

const EXPECTED_IDENTIFIERS = [
  'B1',
  'B2',
  'B3',
  'B4',
  'B5',
  'B6',
  'B8',
  'B10',
] as const;
const EXTERIOR_FACING_IDENTIFIERS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'] as const;
const EXPECTED_PAVILION_NUMBERS = {
  B1: 1,
  B2: 14,
  B3: 12,
  B4: 8,
  B5: 13,
  B6: 3,
  B8: 5,
  B10: 7,
} as const;
const EXPECTED_FACING_RADIANS = {
  B1: Math.PI / 2,
  B2: Math.PI / 2,
  B3: Math.PI,
  B4: Math.PI,
  B5: Math.PI,
  B6: Math.PI,
  B8: 0,
  B10: 0,
} as const satisfies Record<CommercialPavilionPublicIdentifier, number>;
const EXPECTED_INTERIOR_VIEW_ROTATIONS = {
  B1: Math.PI,
  B2: -Math.PI / 2,
  B3: Math.PI,
  B4: 0,
  B5: 0,
  B6: Math.PI,
  B8: 0,
  B10: 0,
} as const satisfies Record<CommercialPavilionPublicIdentifier, number>;

const officialPavilions = EXPECTED_IDENTIFIERS.map((publicIdentifier) => {
  const entity = OFFICIAL_REFERENCE_ENTITIES.find(
    (candidate) => candidate.publicIdentifier === publicIdentifier,
  );
  if (!entity) throw new Error(`Missing official pavilion ${publicIdentifier}`);
  return entity;
});

function boundsFor(entity: MapEntity): CommercialPavilionBoundsDimensions {
  const coordinates = entity.geometry.coordinates.flat();
  const xs = coordinates.map(([x]) => x);
  const zs = coordinates.map(([, z]) => z);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...zs) - Math.min(...zs),
  };
}

function centerFor(entity: MapEntity): readonly [number, number] {
  const coordinates = entity.geometry.coordinates.flat();
  const xs = coordinates.map(([x]) => x);
  const zs = coordinates.map(([, z]) => z);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...zs) + Math.max(...zs)) / 2,
  ];
}

function unitHorizontal([x, z]: readonly [number, number]): readonly [number, number] {
  const length = Math.hypot(x, z);
  if (length === 0) throw new Error('Expected a non-zero horizontal vector');
  return [x / length, z / length];
}

function horizontalDot(
  left: readonly [number, number],
  right: readonly [number, number],
): number {
  const normalizedLeft = unitHorizontal(left);
  const normalizedRight = unitHorizontal(right);
  return normalizedLeft[0] * normalizedRight[0] + normalizedLeft[1] * normalizedRight[1];
}

function closestLotInBlock(entity: MapEntity, block: 'I' | 'D'): MapEntity {
  const [centerX, centerZ] = centerFor(entity);
  const candidates = OFFICIAL_REFERENCE_ENTITIES.filter((candidate) => (
    candidate.classification === 'SELLABLE_LOT' && candidate.metadata.block === block
  ));
  const closest = candidates.reduce<MapEntity | null>((current, candidate) => {
    if (!current) return candidate;
    const [candidateX, candidateZ] = centerFor(candidate);
    const [currentX, currentZ] = centerFor(current);
    const candidateDistance = Math.hypot(candidateX - centerX, candidateZ - centerZ);
    const currentDistance = Math.hypot(currentX - centerX, currentZ - centerZ);
    return candidateDistance < currentDistance ? candidate : current;
  }, null);
  if (!closest) throw new Error(`Missing official lots for block ${block}`);
  return closest;
}

function targetFor(
  publicIdentifier: (typeof EXTERIOR_FACING_IDENTIFIERS)[number],
): MapEntity {
  if (publicIdentifier === 'B1') {
    const lot = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'Q-I-01');
    if (!lot) throw new Error('Missing official lot Q-I-01');
    return lot;
  }
  if (publicIdentifier === 'B2') return officialPavilions[2];
  const pavilion = officialPavilions[EXPECTED_IDENTIFIERS.indexOf(publicIdentifier)];
  return closestLotInBlock(pavilion, publicIdentifier === 'B6' ? 'D' : 'I');
}

function rotatedAabbDimensions(
  bounds: CommercialPavilionBoundsDimensions,
  radians: number,
): CommercialPavilionBoundsDimensions {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [-1, 1].flatMap((xSign) => [-1, 1].map((zSign) => {
    const x = xSign * bounds.width / 2;
    const z = zSign * bounds.depth / 2;
    return [x * cosine + z * sine, -x * sine + z * cosine] as const;
  }));
  const xs = corners.map(([x]) => x);
  const zs = corners.map(([, z]) => z);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...zs) - Math.min(...zs),
  };
}

function everyNumberIsFinite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(everyNumberIsFinite);
  if (value && typeof value === 'object') {
    return Object.values(value).every(everyNumberIsFinite);
  }
  return true;
}

function expectRectInside(
  rect: CommercialPavilionRect,
  width: number,
  depth: number,
): void {
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.depth).toBeGreaterThan(0);
  expect(Math.abs(rect.centerX) + rect.width / 2).toBeLessThanOrEqual(width / 2 + 1e-10);
  expect(Math.abs(rect.centerZ) + rect.depth / 2).toBeLessThanOrEqual(depth / 2 + 1e-10);
}

describe('família arquitetônica dos pavilhões comerciais', () => {
  it('registra os oito pavilhões internos e preserva o mapeamento oficial', () => {
    expect(COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS).toEqual(EXPECTED_IDENTIFIERS);
    expect(Object.keys(COMMERCIAL_PAVILION_DEFINITIONS)).toEqual(EXPECTED_IDENTIFIERS);
    expect(officialPavilions).toHaveLength(EXPECTED_IDENTIFIERS.length);

    EXPECTED_IDENTIFIERS.forEach((publicIdentifier, index) => {
      const definition = COMMERCIAL_PAVILION_DEFINITIONS[publicIdentifier];
      const entity = officialPavilions[index];

      expect(definition.publicIdentifier).toBe(publicIdentifier);
      expect(definition.pavilionNumber).toBe(EXPECTED_PAVILION_NUMBERS[publicIdentifier]);
      expect(definition.officialName).toBe(entity.name);
      expect(entity.classification).toBe('PAVILION');
    });
  });

  it('atribui variação, cobertura e hierarquia de foco únicas sem perder a orientação comum', () => {
    const definitions = Object.values(COMMERCIAL_PAVILION_DEFINITIONS);

    expect(new Set(definitions.map((definition) => definition.variant)).size).toBe(8);
    expect(new Set(definitions.map((definition) => definition.roofProfile)).size).toBe(8);
    expect(new Set(definitions.map((definition) => definition.entrancePattern)).size)
      .toBeGreaterThanOrEqual(6);

    definitions.forEach((definition) => {
      expect(definition.facingRadians).toBe(EXPECTED_FACING_RADIANS[definition.publicIdentifier]);
      expect(definition.interiorViewRotationRadians).toBe(
        EXPECTED_INTERIOR_VIEW_ROTATIONS[definition.publicIdentifier],
      );
      expect(definition.focusDirection).toHaveLength(3);
      expect(definition.focusDirection.every(Number.isFinite)).toBe(true);
      expect(definition.focusDirection[1]).toBeGreaterThan(0);
      expect(definition.visualHeight.min).toBeLessThan(definition.visualHeight.max);
    });
  });

  it('orienta as fachadas para seus alvos físicos e posiciona a câmera no mesmo lado público', () => {
    EXTERIOR_FACING_IDENTIFIERS.forEach((publicIdentifier) => {
      const pavilion = officialPavilions[EXPECTED_IDENTIFIERS.indexOf(publicIdentifier)];
      const target = targetFor(publicIdentifier);
      const definition = COMMERCIAL_PAVILION_DEFINITIONS[publicIdentifier];
      const [pavilionX, pavilionZ] = centerFor(pavilion);
      const [targetX, targetZ] = centerFor(target);
      const facadeDirection = [
        Math.sin(definition.facingRadians),
        Math.cos(definition.facingRadians),
      ] as const;
      const targetDirection = [targetX - pavilionX, targetZ - pavilionZ] as const;
      const focusDirection = [definition.focusDirection[0], definition.focusDirection[2]] as const;

      expect(horizontalDot(facadeDirection, targetDirection)).toBeGreaterThan(0.95);
      expect(horizontalDot(facadeDirection, focusDirection)).toBeGreaterThan(0.65);
      expect(definition.focusDirection[1]).toBeGreaterThan(0);
    });

    const pavilionOneFocus = COMMERCIAL_PAVILION_DEFINITIONS.B1.focusDirection;
    expect(
      pavilionOneFocus[1] / Math.hypot(pavilionOneFocus[0], pavilionOneFocus[2]),
    ).toBeGreaterThan(1);
  });

  it('aplica a apresentação interna oficial sem alterar a fachada física', () => {
    EXPECTED_IDENTIFIERS.forEach((publicIdentifier) => {
      const definition = COMMERCIAL_PAVILION_DEFINITIONS[publicIdentifier];
      const facadeDirection = [
        Math.sin(definition.facingRadians),
        Math.cos(definition.facingRadians),
      ] as const;
      const interiorCameraDirection = [
        Math.sin(definition.facingRadians + definition.interiorViewRotationRadians),
        Math.cos(definition.facingRadians + definition.interiorViewRotationRadians),
      ] as const;
      const expectedDot = ['B1', 'B3', 'B6'].includes(publicIdentifier)
        ? -1
        : publicIdentifier === 'B2' ? 0 : 1;

      expect(horizontalDot(facadeDirection, interiorCameraDirection)).toBeCloseTo(
        expectedDot,
        12,
      );
      expect(definition.facingRadians).toBe(EXPECTED_FACING_RADIANS[publicIdentifier]);
    });
  });

  it('materializa as entradas solicitadas e os elementos de separação das fachadas', () => {
    const layouts = Object.fromEntries(officialPavilions.map((entity) => {
      const definition = resolveCommercialPavilionDefinition(entity)!;
      const modulePlan = resolveCommercialPavilionModulePlan(entity);
      return [
        entity.publicIdentifier,
        createCommercialPavilionLayout(
          commercialPavilionModelBounds(boundsFor(entity), definition.facingRadians),
          definition,
          undefined,
          modulePlan,
        ),
      ];
    })) as Record<CommercialPavilionPublicIdentifier, ReturnType<typeof createCommercialPavilionLayout>>;

    EXPECTED_IDENTIFIERS.filter((publicIdentifier) => !['B2', 'B10'].includes(publicIdentifier))
      .forEach((publicIdentifier) => {
      expect(layouts[publicIdentifier].exterior.facade.entrances).toHaveLength(
        COMMERCIAL_PAVILION_DEFINITIONS[publicIdentifier].entranceCount,
      );
      });

    expect(layouts.B1.exterior.facade.entrances).toHaveLength(1);
    expect(layouts.B1.exterior.facade.entrances[0].centerX).toBe(0);
    expect(layouts.B1.exterior.facade.entrances[0].width).toBeGreaterThan(
      layouts.B1.exterior.shell.width * 0.45,
    );

    expect(layouts.B2.exterior.facade.entrances).toHaveLength(3);
    expect(layouts.B2.exterior.facade.rearEntrances).toHaveLength(3);
    expect(layouts.B2.exterior.facade.centralMass).toBeNull();
    const pavilion14Front = layouts.B2.exterior.facade.entrances;
    expect(pavilion14Front[0].centerX).toBeGreaterThan(pavilion14Front[1].centerX);
    expect(pavilion14Front[1].centerX).toBeGreaterThan(pavilion14Front[2].centerX);
    expect(pavilion14Front[0].width).toBeCloseTo(pavilion14Front[2].width, 12);
    expect(pavilion14Front[1].width / pavilion14Front[0].width).toBeCloseTo(5 / 4, 12);

    expect(layouts.B10.exterior.facade.entrances).toHaveLength(1);
    expect(layouts.B10.exterior.facade.rearEntrances).toHaveLength(1);
    expect(layouts.B10.exterior.facade.leftEntrances).toHaveLength(0);
    expect(layouts.B10.exterior.facade.rightEntrances).toHaveLength(2);
    expect(layouts.B10.exterior.facade.rightEntrances.every((entrance) => (
      entrance.kind === 'gate' && entrance.connectsTo === 'PAVILION_11_SHEET_02'
    ))).toBe(true);
    expect(
      layouts.B10.exterior.facade.rightEntrances[0].depth
      / layouts.B10.exterior.facade.entrances[0].width,
    ).toBeCloseTo(3.5 / 3, 12);

    expect(layouts.B4.exterior.facade.entrances).toHaveLength(2);
    expect(layouts.B4.exterior.facade.rearEntrances).toHaveLength(1);
    expect(layouts.B4.exterior.facade.rearEntrances[0].centerX).toBeGreaterThan(0);
    expect(layouts.B5.exterior.facade.entrances).toHaveLength(2);
    expect(layouts.B5.exterior.facade.rearEntrances).toHaveLength(2);
    expect(layouts.B5.exterior.facade.rearEntrances[0].centerX).toBeLessThan(0);
    expect(layouts.B5.exterior.facade.rearEntrances[1].centerX).toBeGreaterThan(0);

    expect(layouts.B6.exterior.facade.entrances).toHaveLength(3);
    expect(layouts.B6.exterior.facade.dividerXs).toHaveLength(2);
    expect(layouts.B6.exterior.facade.dividerXs[0]).toBeLessThan(0);
    expect(layouts.B6.exterior.facade.dividerXs[1]).toBeGreaterThan(0);
  });

  it('resolve suporte e câmera somente pelo publicIdentifier exato', () => {
    EXPECTED_IDENTIFIERS.forEach((publicIdentifier) => {
      const entity = { publicIdentifier };
      expect(resolveCommercialPavilionDefinition(entity)?.publicIdentifier).toBe(publicIdentifier);
      expect(commercialPavilionSupportsInterior(entity)).toBe(true);
      expect(commercialPavilionFacingRadians(entity)).toBe(EXPECTED_FACING_RADIANS[publicIdentifier]);
      expect(commercialPavilionInteriorViewRotationRadians(entity)).toBe(
        EXPECTED_INTERIOR_VIEW_ROTATIONS[publicIdentifier],
      );
      expect(commercialPavilionFocusDirection(entity)).toEqual(
        COMMERCIAL_PAVILION_DEFINITIONS[publicIdentifier].focusDirection,
      );
    });

    expect(resolveCommercialPavilionDefinition({ publicIdentifier: ' b3 ' })?.pavilionNumber).toBe(12);
    expect(resolveCommercialPavilionDefinition({ publicIdentifier: 'B12' })).toBeNull();
    expect(commercialPavilionSupportsInterior({ publicIdentifier: 'B12' })).toBe(false);
    expect(commercialPavilionFocusDirection({ publicIdentifier: 'B12' })).toBeNull();
    expect(commercialPavilionInteriorViewRotationRadians({ publicIdentifier: 'B12' })).toBe(0);
    expect(resolveCommercialPavilionDefinition({ publicIdentifier: 'B10' })?.pavilionNumber).toBe(7);
    expect(resolveCommercialPavilionDefinition({ publicIdentifier: 'B7' })).toBeNull();
  });

  it('troca os eixos somente em quartos de volta cardinais', () => {
    const bounds = { width: 4, depth: 2 };

    expect(commercialPavilionModelBounds(bounds, Math.PI / 2)).toEqual({ width: 2, depth: 4 });
    expect(commercialPavilionModelBounds(bounds, -Math.PI / 2)).toEqual({ width: 2, depth: 4 });
    expect(commercialPavilionModelBounds(bounds, 0)).toBe(bounds);
    expect(commercialPavilionModelBounds(bounds, Math.PI)).toBe(bounds);
    expect(commercialPavilionModelBounds(bounds, -Math.PI / 18)).toBe(bounds);
  });

  it('deriva dimensões finitas e mantém exterior e acessos dentro dos footprints oficiais', () => {
    officialPavilions.forEach((entity) => {
      const definition = resolveCommercialPavilionDefinition(entity)!;
      const bounds = boundsFor(entity);
      const modelBounds = commercialPavilionModelBounds(bounds, definition.facingRadians);
      const visualHeight = commercialPavilionVisualHeight(bounds, definition);
      const layout = createCommercialPavilionLayout(modelBounds, definition, visualHeight);
      const worldAabb = rotatedAabbDimensions(modelBounds, definition.facingRadians);

      expect(everyNumberIsFinite(layout)).toBe(true);
      expect(layout.width).toBeCloseTo(modelBounds.width, 10);
      expect(layout.depth).toBeCloseTo(modelBounds.depth, 10);
      expect(worldAabb.width).toBeCloseTo(bounds.width, 10);
      expect(worldAabb.depth).toBeCloseTo(bounds.depth, 10);
      if (definition.facingRadians === Math.PI / 2) {
        expect(modelBounds.width).toBeCloseTo(bounds.depth, 10);
        expect(modelBounds.depth).toBeCloseTo(bounds.width, 10);
      } else {
        expect(modelBounds).toEqual(bounds);
      }
      expect(layout.height).toBe(visualHeight);
      expect(layout.height).toBeGreaterThan(entity.geometry.extrusionHeight);
      expect(layout.exterior.slab.width).toBe(layout.width);
      expect(layout.exterior.slab.depth).toBe(layout.depth);
      expect(layout.exterior.shell.width).toBeLessThan(layout.width);
      expect(layout.exterior.shell.depth).toBeLessThan(layout.depth);
      expect(layout.exterior.roof.width).toBeLessThanOrEqual(layout.width);
      expect(layout.exterior.roof.depth).toBeLessThanOrEqual(layout.depth);
      expect(layout.exterior.roof.ridgeY).toBe(layout.height);
      expect(layout.exterior.roof.ridgeY - layout.exterior.roof.eaveY).toBeCloseTo(
        layout.exterior.roof.rise,
        10,
      );

      layout.exterior.facade.entrances.forEach((entrance) => {
        expectRectInside(entrance, layout.width, layout.depth);
        expect(entrance.centerY - entrance.height / 2).toBeGreaterThanOrEqual(
          layout.exterior.slab.height - 1e-10,
        );
        expect(entrance.centerY + entrance.height / 2).toBeLessThanOrEqual(
          layout.exterior.roof.eaveY + 1e-10,
        );
      });
      layout.exterior.facade.rearEntrances.forEach((entrance) => {
        expectRectInside(entrance, layout.width, layout.depth);
        expect(entrance.centerZ).toBeLessThan(0);
        expect(entrance.centerY - entrance.height / 2).toBeGreaterThanOrEqual(
          layout.exterior.slab.height - 1e-10,
        );
        expect(entrance.centerY + entrance.height / 2).toBeLessThanOrEqual(
          layout.exterior.roof.eaveY + 1e-10,
        );
      });
      if (layout.exterior.facade.centralMass) {
        expectRectInside(layout.exterior.facade.centralMass, layout.width, layout.depth);
      }
    });
  });

  it('oferece um interior proporcional, legível e estruturalmente ritmado para todos', () => {
    officialPavilions.forEach((entity) => {
      const definition = resolveCommercialPavilionDefinition(entity)!;
      const layout = createCommercialPavilionLayout(
        commercialPavilionModelBounds(boundsFor(entity), definition.facingRadians),
        definition,
      );
      const { interior } = layout;

      expect(interior.clearWidth).toBeGreaterThan(0);
      expect(interior.clearDepth).toBeGreaterThan(0);
      expect(interior.mainAisle.depth).toBe(interior.clearDepth);
      expect(interior.crossAisles.length).toBeGreaterThanOrEqual(1);
      expect(interior.exhibitBands).toHaveLength(2);
      expect(interior.columns.length).toBeGreaterThan(0);
      expectRectInside(interior.mainAisle, layout.width, layout.depth);
      interior.crossAisles.forEach((aisle) => expectRectInside(aisle, layout.width, layout.depth));
      interior.exhibitBands.forEach((band) => expectRectInside(band, layout.width, layout.depth));

      interior.columns.forEach((column) => {
        expect(Math.abs(column.x) + column.size / 2).toBeLessThan(layout.width / 2);
        expect(Math.abs(column.z) + column.size / 2).toBeLessThan(layout.depth / 2);
        expect(Math.abs(column.x)).toBeGreaterThanOrEqual(
          interior.mainAisle.width / 2 + column.size * 0.8,
        );
        interior.crossAisles.forEach((aisle) => {
          expect(Math.abs(column.z - aisle.centerZ)).toBeGreaterThanOrEqual(
            aisle.depth / 2 + column.size * 0.8,
          );
        });
      });
    });
  });
});
