// @vitest-environment ./src/test/venueSqlNode.environment.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAVILION3_COMMERCIAL_REFERENCE } from '@/features/commercial-map/data/pavilion3CommercialReference';

const migration = readFileSync(
  resolve('supabase/migrations/20260921015329_9f530d7e-ef7a-42a1-a3bd-2ccfd7787731.sql'),
  'utf8',
);
const sql = migration.replace(/\s+/g, ' ').toLowerCase();

function polygonArea(points: readonly (readonly [number, number])[]) {
  return Math.abs(points.reduce((sum, [x, z], index) => {
    const [nextX, nextZ] = points[(index + 1) % points.length];
    return sum + x * nextZ - nextX * z;
  }, 0)) / 2;
}

describe('Pavilhão 3 — planta oficial Fenasoja 2028', () => {
  it('fecha inventário, áreas e proveniência da edição 2028', () => {
    expect(PAVILION3_COMMERCIAL_REFERENCE.moduleCount).toBe(214);
    expect(PAVILION3_COMMERCIAL_REFERENCE.cells).toHaveLength(214);
    expect(PAVILION3_COMMERCIAL_REFERENCE.cells.reduce(
      (sum, cell) => sum + (cell.areaM2 ?? 0), 0,
    )).toBeCloseTo(663, 10);
    expect(PAVILION3_COMMERCIAL_REFERENCE.totalAreaM2).toBe(1423);
    expect(PAVILION3_COMMERCIAL_REFERENCE.source).toMatchObject({ referenceYear: 2028 });
    expect(PAVILION3_COMMERCIAL_REFERENCE.source.document).toContain('desenho set/2026');
  });

  it('representa B6-M036 como um único polígono em L com hit-test real', () => {
    const module36 = PAVILION3_COMMERCIAL_REFERENCE.cells.find((cell) => cell.number === 36);
    expect(module36?.id).toBe('B6:module:036');
    expect(module36?.areaM2).toBe(24);
    expect(module36?.shape?.footprint).toHaveLength(6);
    expect(module36?.shape?.renderParts).toHaveLength(2);
    expect(polygonArea(module36?.shape?.footprint ?? [])).toBeGreaterThan(0);
    expect(sql).toContain("baseline.public_identifier = 'b6-m036'");
    expect(sql).toContain("'coordinates', jsonb_build_array(world_ring)");
  });

  it('corrige o pareamento das ilhas sem alterar a câmera locked-plan', () => {
    const cells = new Map(PAVILION3_COMMERCIAL_REFERENCE.cells.map((cell) => [cell.number, cell]));
    expect(cells.get(80)?.centerX).toBeGreaterThan(cells.get(79)?.centerX ?? Infinity);
    expect(cells.get(144)?.centerX).toBeGreaterThan(cells.get(143)?.centerX ?? Infinity);
    expect(cells.get(79)?.centerZ).toBeCloseTo(cells.get(80)?.centerZ ?? Infinity, 12);
    expect(cells.get(143)?.centerZ).toBeCloseTo(cells.get(144)?.centerZ ?? Infinity, 12);
    expect(PAVILION3_COMMERCIAL_REFERENCE.interiorPresentation).toMatchObject({
      mode: 'plan', navigationMode: 'locked-plan', enableRotate: false,
      enablePan: true, touchNavigation: 'pan-dolly', flatModules: true,
    });
  });

  it('reconcilia somente B6 e protege identidade, status e preços', () => {
    expect(sql).toContain("pavilion.public_identifier = 'b6'");
    expect(sql).toContain("where (baseline.metadata->>'modulenumber')::integer = 36");
    expect(sql).toContain('entity.public_identifier is distinct from baseline.public_identifier');
    expect(sql).toContain('lot.status is distinct from baseline.status');
    expect(sql).toContain('to_jsonb(price) is distinct from baseline.row_state');
    expect(sql).not.toContain('update public.commercial_lots');
    expect(sql).not.toContain('delete from public.commercial_lots');
    expect(sql).not.toContain('insert into public.commercial_lots');
  });
});