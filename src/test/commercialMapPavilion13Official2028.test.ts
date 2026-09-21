// @vitest-environment ./src/test/venueSqlNode.environment.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PAVILION13_COMMERCIAL_REFERENCE,
  PAVILION13_MODULE_METRIC_FOOTPRINTS,
} from '@/features/commercial-map/data/pavilion13CommercialReference';
import { pointInPolygon } from '@/features/commercial-map/utils/spatialSurface';
import { getPublicArea } from '@/features/commercial-map/public/publicAreaRegistry';

const migration = readFileSync(
  resolve('supabase/migrations/20260921020213_106b16c4-fa53-436c-97a9-2a9d14de9a12.sql'),
  'utf8',
);
const sql = migration.replace(/\s+/g, ' ').toLowerCase();

function polygonArea(points: readonly (readonly [number, number])[]) {
  return Math.abs(points.reduce((sum, [x, z], index) => {
    const [nextX, nextZ] = points[(index + 1) % points.length];
    return sum + x * nextZ - nextX * z;
  }, 0)) / 2;
}

describe('Pavilhão 13 — planta oficial Fenasoja 2028', () => {
  it('fecha inventário, áreas e proveniência da edição 2028', () => {
    expect(PAVILION13_COMMERCIAL_REFERENCE.cells).toHaveLength(103);
    expect(PAVILION13_COMMERCIAL_REFERENCE.cells.reduce(
      (sum, cell) => sum + (cell.areaM2 ?? 0), 0,
    )).toBe(351);
    expect(PAVILION13_COMMERCIAL_REFERENCE).toMatchObject({
      moduleCount: 103,
      modularAreaM2: 351,
      totalAreaM2: 709,
      source: { referenceYear: 2028 },
    });
    expect(PAVILION13_COMMERCIAL_REFERENCE.source.document).toContain('desenho set/2026');
  });

  it('mantém os quatro módulos diagonais simétricos com hit-test poligonal', () => {
    const probes = {
      25: { inside: [18.5, 4.5], outside: [17, 1] },
      26: { inside: [15, 1.5], outside: [18.8, 2.8] },
      78: { inside: [4.5, 1.5], outside: [1, 2.8] },
      79: { inside: [1.5, 4.5], outside: [2.8, 1] },
    } as const;
    for (const number of [25, 26, 78, 79] as const) {
      const footprint = PAVILION13_MODULE_METRIC_FOOTPRINTS[number];
      expect(polygonArea(footprint), `B5-M${number}`).toBe(13.5);
      expect(pointInPolygon(probes[number].inside, footprint)).toBe(true);
      expect(pointInPolygon(probes[number].outside, footprint)).toBe(false);
      expect(PAVILION13_COMMERCIAL_REFERENCE.cells[number - 1]).toMatchObject({
        id: `B5:module:${String(number).padStart(3, '0')}`,
        areaM2: 13.5,
      });
    }
  });

  it('preserva navegação fixa, cotas de circulação e rota pública dedicada', () => {
    expect(PAVILION13_COMMERCIAL_REFERENCE.projection).toMatchObject({
      metricWidthM: 19.8,
      metricDepthM: 37.8,
    });
    expect(PAVILION13_COMMERCIAL_REFERENCE.interiorPresentation).toMatchObject({
      mode: 'plan', navigationMode: 'locked-plan', enableRotate: false,
      enablePan: true, touchNavigation: 'pan-dolly', flatModules: true,
    });
    expect(getPublicArea('pavilhao-13')?.pavilionIdentifier).toBe('B5');

    const corridor = (id: string) => PAVILION13_COMMERCIAL_REFERENCE.corridors.find(
      (item) => item.id === id,
    );
    expect((corridor('west-main-aisle')?.width ?? 0) * 19.8).toBeCloseTo(3.9, 10);
    expect((corridor('north-distribution')?.depth ?? 0) * 37.8).toBeCloseTo(3.25, 10);
    expect((corridor('south-distribution')?.depth ?? 0) * 37.8).toBeCloseTo(4.55, 10);
  });

  it('reconcilia somente B5 e protege IDs, status, preços e histórico geométrico', () => {
    expect(sql).toContain("pavilion.public_identifier = 'b5'");
    expect(sql).toContain("baseline.public_identifier = 'b5-m' || lpad(number::text, 3, '0')");
    expect(sql).toContain('entity.public_identifier is distinct from baseline.public_identifier');
    expect(sql).toContain('lot.status is distinct from baseline.status');
    expect(sql).toContain('to_jsonb(price) is distinct from baseline.row_state');
    expect(sql).toContain('disable trigger map_geometry_layer_lock_before_write');
    expect(sql).not.toContain('disable trigger map_geometry_archive_before_update');
    expect(sql).not.toContain('delete from public.commercial_lots');
    expect(sql).not.toContain('insert into public.commercial_lots');
  });
});