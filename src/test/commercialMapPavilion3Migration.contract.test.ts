// @vitest-environment ./src/test/venueSqlNode.environment.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260823120000_rebuild_pavilion_3_commercial_modules.sql'),
  'utf8',
);
const sql = migration.replace(/\s+/g, ' ').toLowerCase();
const verificationRpc = sql.slice(
  sql.indexOf('create or replace function public.set_map_entity_verification'),
  sql.indexOf('create or replace function public.set_commercial_lot_availability'),
);
const availabilityRpc = sql.slice(
  sql.indexOf('create or replace function public.set_commercial_lot_availability'),
  sql.lastIndexOf('-- the migration succeeds only if'),
);
const backfill = sql.slice(
  sql.indexOf('create temp table _pavilion3_module_runs'),
  sql.indexOf('create or replace function public.set_map_entity_verification'),
);

const expectedRuns = [
  ['perimeter-01-19', 1, 19, 0.065, 0.26, 0.075, 0.36, 'Z+'],
  ['perimeter-20-36', 20, 36, 0.065, 0.68, 0.075, 0.32, 'Z+'],
  ['perimeter-37-40', 37, 40, 0.285, 0.91, 0.18, 0.075, 'X+'],
  ['perimeter-41-47', 41, 47, 0.64, 0.91, 0.3, 0.075, 'X+'],
  ['island-1-west-leg', 48, 75, 0.3275, 0.48, 0.095, 0.56, 'Z+'],
  ['island-1-south-cap', 76, 83, 0.38, 0.81, 0.2, 0.08, 'X+'],
  ['island-1-east-leg', 84, 111, 0.4325, 0.48, 0.095, 0.56, 'Z-'],
  ['island-2-west-leg', 112, 139, 0.5975, 0.48, 0.095, 0.56, 'Z+'],
  ['island-2-south-cap', 140, 147, 0.65, 0.81, 0.2, 0.08, 'X+'],
  ['island-2-east-leg', 148, 175, 0.7025, 0.48, 0.095, 0.56, 'Z-'],
  ['perimeter-176-214', 176, 214, 0.94, 0.48, 0.075, 0.76, 'Z+'],
] as const;

describe('contrato persistido do Pavilhão 3 — Comércio', () => {
  it('mantém Exporural 111/95 e atualiza Indústria para 354/317 sem mover o baseline de lineage', () => {
    expect(sql).toContain('"expectedentitycount":111,"expectedlotcount":95');
    expect(sql).toContain('"expectedentitycount":354,"expectedlotcount":317');
    expect(sql).toContain("map_segments.boundary_data->'lineagebaselineat'");
    expect(sql).toContain('commission_segment_lineage_baseline_changed');
    expect(sql).toContain("segment.slug in ('exporural', 'industria-comercio-servicos')");
    expect(sql).toContain('not public.map_segment_is_complete(segment.id)');
    expect(sql.startsWith('-- pavilhão 3 - comércio')).toBe(true);
    expect(sql).toContain('begin;');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('persiste os onze runs oficiais, sem lacunas nem duplicação entre 1 e 214', () => {
    for (const [id, start, end, centerX, centerZ, width, depth, direction] of expectedRuns) {
      expect(sql).toContain(`('${id}',`);
      expect(sql).toContain(`${start}, ${end},`);
      expect(sql).toContain(`'${direction.toLowerCase()}'`);
      expect([centerX, centerZ, width, depth].every(Number.isFinite)).toBe(true);
    }

    const expanded = expectedRuns.flatMap(([, start, end]) => (
      Array.from({ length: end - start + 1 }, (_, index) => start + index)
    ));
    expect(expanded).toHaveLength(214);
    expect(new Set(expanded).size).toBe(214);
    expect(expanded).toEqual(Array.from({ length: 214 }, (_, index) => index + 1));
    expect(sql).toContain('cross join lateral generate_series(run.start_number, run.end_number)');
    expect(sql).toContain("when run.sequence_orientation = 'z-' then run.end_number - module_number");
    expect(sql).toContain('0.0015::numeric as module_gap');
  });

  it('projeta as células no footprint livre de B6 com os insets da arquitetura e rotação PI', () => {
    expect(sql).toContain("module_layer.layer_key = 'commercial'");
    expect(sql).toContain('module_layer.id as layer_id');
    expect(sql).toContain('least(bounds.max_x - bounds.min_x, bounds.max_z - bounds.min_z) * 0.025');
    expect(sql).toContain('least(bounds.max_x - bounds.min_x, bounds.max_z - bounds.min_z) * 0.065');
    expect(sql).toContain('footprint.pavilion_center_x - (cell.center_x - 0.5) * footprint.clear_width');
    expect(sql).toContain('footprint.pavilion_center_z - (cell.center_z - 0.5) * footprint.clear_depth');
    expect(sql).toContain('rotation = round(pi()::numeric, 6)');
    expect(sql).toContain('geometry.rotation is distinct from round(pi()::numeric, 6)');
    expect(sql).toContain('disable trigger map_geometry_layer_lock_before_write');
    expect(sql).toContain('enable trigger map_geometry_layer_lock_before_write');
    expect(sql).toContain('map_geometry_archive_before_update');
  });

  it('usa identidade canônica B6-M001..214 e metadata compatível com a sincronização 2026.4', () => {
    expect(sql).toContain("'b6-m' || lpad(module_number::text, 3, '0') as public_identifier");
    expect(sql).toContain("'b6:module:' || lpad(module_number::text, 3, '0') as pavilion_module_key");
    expect(sql).toContain("'pavilionpublicidentifier', 'b6'");
    expect(sql).toContain("'parentpublicidentifier', 'b6'");
    expect(sql).toContain("'pavilionmodulekey', pavilion_module_key");
    expect(sql).toContain("'seedmanaged', true");
    expect(sql).toContain("'sourcerevision', '2026.4'");
    expect(sql).toContain("'layoutrevision', '2026.4-p3.1'");
    expect(sql).toContain("'orientation', module_orientation");
    expect(sql).toContain("'group', group_key");
    expect(sql).toContain("'cluster', cluster_key");
    expect(sql).toContain("when module_number < 100 then lpad(module_number::text, 2, '0')");
    expect(sql).toContain("'^b6-m(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$'");
    expect(sql).toContain("'^b6:module:(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$'");
  });

  it('cria lotes neutros, sem área individual, empresa, fluxo ou contrato inventado', () => {
    expect(backfill).toContain("'blocked'");
    expect(backfill).toContain("'unvalidated'");
    expect(backfill).toContain("'not_for_sale'");
    expect(backfill).toContain("'officialmeasurements', false");
    expect(backfill).toContain("'areaassignment', 'unassigned'");
    expect(backfill).toContain('lot.official_area_sqm is not null');
    expect(backfill).toContain('lot.calculated_area_sqm is not null');
    expect(backfill).toContain('lot.frontage_meters is not null');
    expect(backfill).toContain('lot.depth_meters is not null');
    expect(backfill).not.toContain('insert into public.lot_reservations');
    expect(backfill).not.toContain('insert into public.lot_negotiations');
    expect(backfill).not.toContain('insert into public.lot_sales');
    expect(backfill).not.toContain('insert into public.lot_contracts');
    expect(backfill).not.toContain('company_name');
    expect(backfill).not.toContain("'térreo'");
    expect(backfill).toContain('true, null, null, null, null, null, null, null, transaction_timestamp()');
  });

  it('marca somente 006 e 156–159 como discrepâncias explícitas da fonte', () => {
    expect(sql).toContain('module_number in (6, 156, 157, 158, 159) as has_source_discrepancy');
    expect(sql).toContain("'sourcediscrepancy', case when has_source_discrepancy then 'official-range-omission'");
    expect(sql).toContain('staged.module_number in (6, 156, 157, 158, 159)');
    expect(sql).toContain('having count(*) <> 5');
  });

  it('preserva estado comercial existente e falha fechado em conflitos de identidade', () => {
    expect(backfill).toContain('pavilion3_entity_identity_conflict');
    expect(backfill).toContain('pavilion3_module_key_conflict');
    expect(backfill).toContain('pavilion3_commercial_lot_identity_conflict');
    expect(backfill).toContain('pavilion3_entity_lot_link_conflict');
    expect(backfill).toContain('pavilion3_unexpected_internal_stand_conflict');
    expect(backfill).toContain('on conflict (project_id, public_identifier) do nothing');
    expect(backfill).toContain('on conflict do nothing');
    expect(backfill).not.toContain('update public.commercial_lots');
    expect(backfill).toContain('from _pavilion3_created_lots created');
  });

  it('permite verificar a geometria B6 sem fabricar medida e mantém o gate dos demais lotes', () => {
    expect(verificationRpc).toContain("v_entity.classification = 'internal_stand'");
    expect(verificationRpc).toContain("v_lot.area_validation_status = 'unvalidated'");
    expect(verificationRpc).toContain('v_lot.official_area_sqm is null');
    expect(verificationRpc).toContain('v_lot.calculated_area_sqm is null');
    expect(verificationRpc).toContain("if v_lot.area_validation_status <> 'validated' and not v_is_measurement_optional_pavilion_module");
    expect(verificationRpc).toContain('official_area_required_for_verification');
    expect(backfill).toContain("'verified'");
  });

  it('expõe RPC auditável apenas para disponibilidade e converte NOT_FOR_SALE em NEGOTIABLE sem valores', () => {
    expect(availabilityRpc).toContain("map_has_explicit_capability(v_org_id, 'map.manage_sales')");
    expect(availabilityRpc).toContain("map_has_explicit_capability(v_org_id, 'map.manage_lots')");
    expect(availabilityRpc).toContain("v_target_status not in ('available', 'blocked', 'unavailable')");
    expect(availabilityRpc).toContain("v_lot.status in ('reserved', 'in_negotiation', 'sold')");
    expect(availabilityRpc).toContain('lot_active_commercial_flow_forbids_availability_change');
    expect(availabilityRpc).toContain("v_active_price.pricing_mode = 'not_for_sale'");
    expect(availabilityRpc).toContain("'negotiable', null, null, null, null, true");
    expect(availabilityRpc).toContain('insert into public.lot_status_history');
    expect(availabilityRpc).toContain('insert into public.map_activity_logs');
    expect(availabilityRpc).toContain("'lot_availability_changed'");
    expect(availabilityRpc).toContain('revoke all on function public.set_commercial_lot_availability(uuid, text, text) from public');
    expect(availabilityRpc).toContain('grant execute on function public.set_commercial_lot_availability(uuid, text, text) to authenticated');
  });
});
