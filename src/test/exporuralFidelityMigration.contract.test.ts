// @vitest-environment ./src/test/venueSqlNode.environment.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '../features/commercial-map/data/officialReference2026';

const migration = readFileSync(
  resolve(
    'supabase/migrations/20260811153000_apply_exporural_reference_2026_4_fidelity.sql',
  ),
  'utf8',
);
const sql = migration.replace(/\s+/g, ' ').toLowerCase();

const retiredIdentifiers = ['b35', 'b36', 'd6-01', 'd6-02', 'd6-03'];
const fidelityPolygonIdentifiers = [
  'EXPORURAL',
  'QUADRA-R',
  'QUADRA-S',
  'RUA-BRUNO-SCHWARTZ',
  'RUA-JOHAN-MULLER',
  'RUA-GUSTAVO-BESSEL',
  'RUA-EMANUEL-BRACHMANN',
  'RUA-15-NOVEMBRO',
  'RUA-PASTOR-ALBERT-LEHENBAUER',
  'RUA-UBIRETAMA',
  'Q-R-44',
  'Q-R-45',
  'Q-R-46',
  'Q-R-47',
  'Q-R-56',
  'Q-R-57',
  'Q-R-58',
  'Q-R-59',
] as const;

describe('contrato da migração cartográfica Exporural 2026.4', () => {
  it('instala somente a revisão e os inventários oficiais esperados', () => {
    expect(sql).toContain("trim(coalesce(p_source_revision, '')) <> '2026.4'");
    expect(sql).toContain('jsonb_array_length(p_entities) <> 111');
    expect(sql).toContain('jsonb_array_length(p_lots) <> 95');
    expect(sql).toContain("geometryrevision}' <> '2026.4-exporural.1'");
    expect(sql).toContain("metadata,sourcepdfpolygon");
    expect(sql).toContain('exporural_source_scene_geometry_mismatch');
    expect(sql).toContain('v_reference_crop_width constant numeric := 5500');
    expect(sql).toContain('v_reference_crop_height constant numeric := 4150');
    expect(sql).toContain('"expectedentitycount":111');
    expect(sql).toContain('"expectedlotcount":95');
    expect(sql).not.toContain('jsonb_array_length(p_entities) <> 116');
  });

  it('espelha exatamente os perímetros, ruas e lotes críticos da fonte oficial', () => {
    const expectationStart = sql.indexOf('exporural_fidelity_expectations_begin');
    const expectationEnd = sql.indexOf('exporural_fidelity_expectations_end');
    const expectations = sql.slice(expectationStart, expectationEnd);

    expect(expectationStart).toBeGreaterThan(-1);
    expect(expectationEnd).toBeGreaterThan(expectationStart);
    expect(expectations).toContain('exporural_official_fidelity_polygon_mismatch');
    expect(fidelityPolygonIdentifiers).toHaveLength(18);

    for (const identifier of fidelityPolygonIdentifiers) {
      const entity = OFFICIAL_REFERENCE_ENTITIES.find(
        (candidate) => candidate.publicIdentifier === identifier,
      );
      const sourcePolygon = entity?.metadata.sourcePdfPolygon;

      expect(entity, `${identifier} ausente da fonte oficial`).toBeDefined();
      expect(sourcePolygon, `${identifier} sem sourcePdfPolygon`).toBeDefined();
      expect(expectations).toContain(
        `'${identifier.toLowerCase()}', '${JSON.stringify(sourcePolygon)}'::jsonb`,
      );
    }
  });

  it('exclui os cinco IDs antes de inferir areaCode e mantém o deploy fail-closed', () => {
    const resolverStart = sql.indexOf(
      'create or replace function public.resolve_commission_map_segment_slug',
    );
    const resolverEnd = sql.indexOf('-- refresh the persisted assignment', resolverStart);
    const resolver = sql.slice(resolverStart, resolverEnd);

    expect(resolverStart).toBeGreaterThan(-1);
    expect(resolver.indexOf("when upper(coalesce(_public_identifier, '')) = any")).toBeGreaterThan(-1);
    expect(resolver.indexOf("_metadata->>'areacode'")).toBeGreaterThan(-1);
    expect(resolver.indexOf("when upper(coalesce(_public_identifier, '')) = any"))
      .toBeLessThan(resolver.indexOf("_metadata->>'areacode'"));

    for (const identifier of retiredIdentifiers) {
      expect(resolver).toContain(`'${identifier}'`);
    }

    expect(resolver).toContain("then 'exporural'");
    expect(sql).toContain(
      "'b35', 'b36', 'd6-01', 'd6-02', 'd6-03'",
    );

    const beforeApply = sql.slice(
      0,
      sql.indexOf('create or replace function public.apply_exporural_reference_2026'),
    );
    expect(beforeApply).not.toContain('update public.map_entities');
    expect(sql).toContain('for v_entity in select value from jsonb_array_elements(p_entities)');
    expect(sql).toContain('update public.map_entities set layer_id = v_layer_id');
  });

  it('arquiva exatamente seeds inertes sem lote comercial e mantém trilha completa', () => {
    expect(sql).toContain('exporural_retired_entity_set_mismatch');
    expect(sql).toContain('exporural_retired_entity_partial_state');
    expect(sql).toContain('exporural_retired_tombstone_requires_manual_review');
    expect(sql).toContain('exporural_retired_entity_scope_mismatch');
    expect(sql).toContain('exporural_retired_entity_not_inert_seed');
    expect(sql).toContain('exporural_retired_entity_has_commercial_lot');
    expect(sql).toContain('exporural_retired_entity_geometry_missing');
    expect(sql).toContain("retired.metadata->>'seedmanaged'");
    expect(sql).toContain('get diagnostics v_retired_archived = row_count');
    expect(sql).toContain('if v_retired_archived <> 5 then');
    expect(sql).toContain("'schemaversion', 3");
    expect(sql).toContain("'retiredidentifiers'");
    expect(sql).toContain("'archivedbyreferencerevision', p_source_revision");
    expect(sql).toContain("'migrationsnapshotid', v_snapshot_id");
    expect(sql).toContain("'archivereason', 'official_exporural_2026_4_reference_removal'");
    expect(sql).toContain('exporural_retired_entity_in_payload');
    expect(sql).not.toContain('legacysemeararchived');
  });

  it('preserva os 95 lotes e todo o estado comercial no snapshot e no rollback', () => {
    for (const key of [
      'lotprices',
      'lotreservations',
      'lotnegotiations',
      'lotsales',
      'lotcontracts',
      'lotcontractversions',
      'lotstatushistory',
      'lotlineage',
    ]) {
      expect(sql).toContain(`'${key}'`);
    }

    expect(sql).toContain("'commerciallotspreserved', 95");
    expect(sql).not.toContain('delete from public.commercial_lots');
    expect(sql).toContain("source_revision in ('2026.3', '2026.4')");
    expect(sql).toContain('exporural_rollback_commercial_state_drift');
    expect(sql).toContain('exporural_rollback_map_state_drift');
    expect(sql).toContain('exporural_rollback_retired_tombstone_drift');
    expect(sql).toContain('v_retired_tombstones_preserved <> 5');
    expect(sql).toContain("'retiredtombstonespreserved', v_retired_tombstones_preserved");
    expect(sql).toContain(
      "a 2026.4 rollback restores the 111 geometry/lot set but preserves b35, b36 and d6-01..03 as archived, unsegmented audit tombstones",
    );
    expect(sql).toContain("'exporural_reference_2026_rolled_back'");
  });

  it('mantém capability, RLS e execução autenticada nos RPCs existentes', () => {
    expect(sql).toContain("public.map_has_explicit_capability(p_org_id, 'map.admin')");
    expect(sql).toContain('security definer set search_path = public, pg_temp');
    expect(sql).toContain(
      'revoke all on function public.apply_exporural_reference_2026(uuid, text, jsonb, jsonb) from public',
    );
    expect(sql).toContain(
      'grant execute on function public.apply_exporural_reference_2026(uuid, text, jsonb, jsonb) to authenticated',
    );
    expect(sql).toContain(
      'grant execute on function public.rollback_exporural_reference_2026(uuid, uuid, text) to authenticated',
    );
    expect(sql).toContain('alter table public.map_reference_migration_snapshots enable row level security');
  });
});
