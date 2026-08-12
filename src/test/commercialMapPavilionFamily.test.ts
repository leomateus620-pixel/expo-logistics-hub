import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import type { MapEntity } from '@/features/commercial-map/types';
import {
  COMMERCIAL_PAVILION_DEFINITIONS,
  COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS,
  commercialPavilionFacingRadians,
  commercialPavilionFocusDirection,
  commercialPavilionSupportsInterior,
  commercialPavilionVisualHeight,
  createCommercialPavilionLayout,
  resolveCommercialPavilionDefinition,
  type CommercialPavilionBoundsDimensions,
  type CommercialPavilionPublicIdentifier,
  type CommercialPavilionRect,
} from '@/features/commercial-map/utils/commercialPavilions';

const EXPECTED_IDENTIFIERS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'] as const;
const EXPECTED_PAVILION_NUMBERS = {
  B1: 1,
  B2: 14,
  B3: 12,
  B4: 8,
  B5: 13,
  B6: 3,
} as const;

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
  it('registra exatamente B1–B6 e preserva o mapeamento oficial dos pavilhões', () => {
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

    expect(new Set(definitions.map((definition) => definition.variant)).size).toBe(6);
    expect(new Set(definitions.map((definition) => definition.roofProfile)).size).toBe(6);
    expect(new Set(definitions.map((definition) => definition.entrancePattern)).size).toBe(6);

    definitions.forEach((definition) => {
      expect(definition.facingRadians).toBe(0);
      expect(definition.focusDirection).toHaveLength(3);
      expect(definition.focusDirection.every(Number.isFinite)).toBe(true);
      expect(definition.focusDirection[1]).toBeGreaterThan(0);
      expect(definition.focusDirection[2]).toBeGreaterThan(0.9);
      expect(definition.visualHeight.min).toBeLessThan(definition.visualHeight.max);
    });

    const pavilionOneDirection = COMMERCIAL_PAVILION_DEFINITIONS.B1.focusDirection;
    expect(pavilionOneDirection[1] / pavilionOneDirection[2]).toBeGreaterThan(1.45);
    expect(-pavilionOneDirection[0] / pavilionOneDirection[2]).toBeGreaterThanOrEqual(0.9);
  });

  it('materializa as entradas solicitadas e os elementos de separação das fachadas', () => {
    const layouts = Object.fromEntries(officialPavilions.map((entity) => {
      const definition = resolveCommercialPavilionDefinition(entity)!;
      return [
        entity.publicIdentifier,
        createCommercialPavilionLayout(boundsFor(entity), definition),
      ];
    })) as Record<CommercialPavilionPublicIdentifier, ReturnType<typeof createCommercialPavilionLayout>>;

    EXPECTED_IDENTIFIERS.forEach((publicIdentifier) => {
      expect(layouts[publicIdentifier].exterior.facade.entrances).toHaveLength(
        COMMERCIAL_PAVILION_DEFINITIONS[publicIdentifier].entranceCount,
      );
    });

    expect(layouts.B1.exterior.facade.entrances).toHaveLength(1);
    expect(layouts.B1.exterior.facade.entrances[0].centerX).toBe(0);
    expect(layouts.B1.exterior.facade.entrances[0].width).toBeGreaterThan(
      layouts.B1.exterior.shell.width * 0.45,
    );

    expect(layouts.B2.exterior.facade.entrances).toHaveLength(2);
    expect(layouts.B2.exterior.facade.entrances[0].centerX).toBeLessThan(0);
    expect(layouts.B2.exterior.facade.entrances[1].centerX).toBeGreaterThan(0);
    expect(layouts.B2.exterior.facade.centralMass).not.toBeNull();
    expect(layouts.B2.exterior.facade.centralMass!.width).toBeGreaterThan(
      layouts.B2.exterior.facade.entrances[0].width,
    );

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
      expect(commercialPavilionFacingRadians(entity)).toBe(0);
      expect(commercialPavilionFocusDirection(entity)).toEqual(
        COMMERCIAL_PAVILION_DEFINITIONS[publicIdentifier].focusDirection,
      );
    });

    expect(resolveCommercialPavilionDefinition({ publicIdentifier: ' b3 ' })?.pavilionNumber).toBe(12);
    expect(resolveCommercialPavilionDefinition({ publicIdentifier: 'B12' })).toBeNull();
    expect(commercialPavilionSupportsInterior({ publicIdentifier: 'B12' })).toBe(false);
    expect(commercialPavilionFocusDirection({ publicIdentifier: 'B12' })).toBeNull();
    expect(resolveCommercialPavilionDefinition({ publicIdentifier: 'B10' })).toBeNull();
  });

  it('deriva dimensões finitas e mantém exterior e acessos dentro dos footprints oficiais', () => {
    officialPavilions.forEach((entity) => {
      const definition = resolveCommercialPavilionDefinition(entity)!;
      const bounds = boundsFor(entity);
      const visualHeight = commercialPavilionVisualHeight(bounds, definition);
      const layout = createCommercialPavilionLayout(bounds, definition, visualHeight);

      expect(everyNumberIsFinite(layout)).toBe(true);
      expect(layout.width).toBeCloseTo(bounds.width, 10);
      expect(layout.depth).toBeCloseTo(bounds.depth, 10);
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
      if (layout.exterior.facade.centralMass) {
        expectRectInside(layout.exterior.facade.centralMass, layout.width, layout.depth);
      }
    });
  });

  it('oferece um interior proporcional, legível e estruturalmente ritmado para todos', () => {
    officialPavilions.forEach((entity) => {
      const definition = resolveCommercialPavilionDefinition(entity)!;
      const layout = createCommercialPavilionLayout(boundsFor(entity), definition);
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
