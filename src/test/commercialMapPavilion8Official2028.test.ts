// @vitest-environment ./src/test/venueSqlNode.environment.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PAVILION8_COMMERCIAL_REFERENCE,
  PAVILION8_MODULE_90_METRIC_FOOTPRINT,
} from '@/features/commercial-map/data/pavilion8CommercialReference';
import { pointInPolygon } from '@/features/commercial-map/utils/spatialSurface';
import { getPublicArea } from '@/features/commercial-map/public/publicAreaRegistry';
import {
  commercialPavilionFacingRadians,
  commercialPavilionInteriorViewRotationRadians,
} from '@/features/commercial-map/utils/commercialPavilions';

const migration = readFileSync(resolve('supabase/migrations/20260921024500_pavilion_8_official_2028.sql'), 'utf8');
const sql = migration.replace(/\s+/g, ' ').toLowerCase();
const metric = (value: number, axis: 'x' | 'z') => value * (axis === 'x' ? 21.7 : 35);
const edge = (id: string, side: 'top' | 'bottom') => {
  const run = PAVILION8_COMMERCIAL_REFERENCE.runs.find((item) => item.id === id);
  if (!run) throw new Error(`Run ausente: ${id}`);
  return metric(run.bounds.centerZ + (side === 'bottom' ? run.bounds.depth / 2 : -run.bounds.depth / 2), 'z');
};

describe('Pavilhão 8 — planta oficial Fenasoja 2028', () => {
  it('fecha inventário, áreas, frame e proveniência 2028', () => {
    expect(PAVILION8_COMMERCIAL_REFERENCE.cells).toHaveLength(114);
    expect(PAVILION8_COMMERCIAL_REFERENCE.cells.reduce((sum, cell) => sum + (cell.areaM2 ?? 0), 0)).toBe(438.5);
    expect(PAVILION8_COMMERCIAL_REFERENCE).toMatchObject({
      category: 'Indústria, Comércio e Serviços', moduleCount: 114,
      modularAreaM2: 438.5, totalAreaM2: 760.2,
      projection: { metricWidthM: 21.7, metricDepthM: 35 },
      source: { document: 'Planta PAVILHÃO 8 - Fenasoja 2028.pdf', referenceYear: 2028 },
    });
  });

  it('posiciona a ilha com gaps documentais de 3,00 m nos dois extremos', () => {
    expect(edge('central-east-38-63', 'top') - edge('north-26-37', 'bottom')).toBeCloseTo(3, 12);
    expect(35 - edge('central-east-38-63', 'bottom')).toBeCloseTo(3, 12);
    expect(edge('central-west-64-89', 'top')).toBeCloseTo(6, 12);
    expect(edge('central-west-64-89', 'bottom')).toBeCloseTo(32, 12);
    const aisle = (id: string) => PAVILION8_COMMERCIAL_REFERENCE.corridors.find((item) => item.id === id);
    expect(metric(aisle('west-commercial-aisle')?.width ?? 0, 'x')).toBeCloseTo(3.35, 12);
    expect(metric(aisle('east-commercial-aisle')?.width ?? 0, 'x')).toBeCloseTo(3.35, 12);
    expect(metric(aisle('north-distribution')?.depth ?? 0, 'z')).toBeCloseTo(3, 12);
    expect(metric(aisle('south-entrance')?.depth ?? 0, 'z')).toBeCloseTo(3, 12);
  });

  it('mantém o módulo 90 em L com hit-test poligonal e 24,50 m²', () => {
    const area = Math.abs(PAVILION8_MODULE_90_METRIC_FOOTPRINT.reduce((sum, [x, z], index) => {
      const [nextX, nextZ] = PAVILION8_MODULE_90_METRIC_FOOTPRINT[(index + 1) % PAVILION8_MODULE_90_METRIC_FOOTPRINT.length];
      return sum + x * nextZ - nextX * z;
    }, 0)) / 2;
    expect(area).toBe(24.5);
    expect(pointInPolygon([2, 4], PAVILION8_MODULE_90_METRIC_FOOTPRINT)).toBe(true);
    expect(pointInPolygon([5, 4], PAVILION8_MODULE_90_METRIC_FOOTPRINT)).toBe(false);
    expect(PAVILION8_COMMERCIAL_REFERENCE.cells[89]).toMatchObject({ id: 'B4:module:090', areaM2: 24.5 });
  });

  it('preserva câmera, acessos e rota pública dedicada', () => {
    expect(commercialPavilionFacingRadians({ publicIdentifier: 'B4' })).toBe(Math.PI);
    expect(commercialPavilionInteriorViewRotationRadians({ publicIdentifier: 'B4' })).toBe(0);
    expect(PAVILION8_COMMERCIAL_REFERENCE.interiorPresentation).toMatchObject({
      mode: 'plan', navigationMode: 'locked-plan', enableRotate: false,
      enablePan: true, touchNavigation: 'pan-dolly', flatModules: true,
      boundedPan: true, boundedZoom: true,
    });
    expect(PAVILION8_COMMERCIAL_REFERENCE.wallAccesses).toHaveLength(5);
    expect(getPublicArea('pavilhao-8')?.pavilionIdentifier).toBe('B4');
  });

  it('reconcilia somente B4 e protege identidade, áreas e estado comercial', () => {
    expect(sql).toContain("pavilion.public_identifier='b4'");
    expect(sql).toContain("baseline.public_identifier='b4-m'||lpad(number::text,3,'0')");
    expect(sql).toContain("'2028.1-p8.2'");
    expect(sql).toContain("lot.official_area_sqm is distinct from baseline.official_area_sqm");
    expect(sql).toContain("lot.area_validation_status is distinct from baseline.area_validation_status");
    expect(sql).toContain('current.prices is distinct from previous.prices');
    expect(sql).toContain('current.reservations is distinct from previous.reservations');
    expect(sql).toContain('current.sales is distinct from previous.sales');
    expect(sql).toContain('current.contracts is distinct from previous.contracts');
    expect(sql).toContain('current.lineage is distinct from previous.lineage');
    expect(sql).toContain('disable trigger map_geometry_layer_lock_before_write');
    expect(sql).not.toContain('disable trigger map_geometry_archive_before_update');
    expect(sql).not.toContain('insert into public.commercial_lots');
    expect(sql).not.toContain('update public.commercial_lots');
    expect(sql).not.toContain("public_identifier='b5'");
  });
});
