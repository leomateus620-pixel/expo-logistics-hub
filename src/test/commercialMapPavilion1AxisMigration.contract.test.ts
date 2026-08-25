// @vitest-environment ./src/test/venueSqlNode.environment.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PAVILION1_COMMERCIAL_REFERENCE,
  PAVILION1_COMMERCIAL_REFERENCE_PROJECTION,
} from '@/features/commercial-map/data/pavilion1CommercialReference';

const migration = readFileSync(
  resolve('supabase/migrations/20260825010000_correct_pavilion_1_axis_projection.sql'),
  'utf8',
);
const sql = migration.replace(/\s+/g, ' ').toLowerCase();
const sourceSnapshot = sql.slice(
  sql.indexOf('create temp table _p1_axis_source'),
  sql.indexOf('create temp table _p1_axis_parent_frames'),
);
const stagedProjection = sql.slice(
  sql.indexOf('create temp table _p1_axis_staged'),
  sql.indexOf('create temp table _p1_axis_entity_snapshot'),
);
const commercialSnapshot = sql.slice(
  sql.indexOf('create temp table _p1_axis_commercial_snapshot'),
  sql.indexOf('update public.map_entities'),
);
const mutationSection = sql.slice(
  sql.indexOf('update public.map_entities'),
  sql.lastIndexOf('do $$'),
);

describe('migration da projeção oficial do Pavilhão 1', () => {
  it('é incremental, transacional e exige o inventário anterior completo', () => {
    expect(sql.startsWith('-- pavilhão 1')).toBe(true);
    expect(sql).toContain('begin;');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).toContain("commercial-map:pavilion-1-axis-projection:2026.4-p1.2");
    expect(sql).toContain("raise exception 'pavilion_1_axis_active_project_precondition_failed'");
    expect(sql).toContain("entity.metadata->>'layoutrevision' = '2026.4-p1.1'");
    expect(sql).toContain("raise exception 'pavilion_1_axis_module_precondition_failed'");
    expect(sql).toContain('<> 189');
    expect(sourceSnapshot).toContain("pavilion.public_identifier = 'b1'");
    expect(sourceSnapshot).toContain('join public.commercial_lots lot');
    expect(sourceSnapshot).toContain("entity.metadata->>'layoutrevision' = '2026.4-p1.1'");
    expect(sourceSnapshot).toContain("entity.metadata->'normalizedfootprintpolygon'");
    expect(sourceSnapshot).toContain("entity.metadata->'normalizedlabelanchor'");
  });

  it('implementa a rotação horária e metric-contain com as cotas oficiais', () => {
    expect(PAVILION1_COMMERCIAL_REFERENCE_PROJECTION).toEqual({
      coordinateTransform: 'quarter-turn-clockwise',
      fit: 'metric-contain',
      metricWidthM: 52.7,
      metricDepthM: 22.84,
    });
    expect(PAVILION1_COMMERCIAL_REFERENCE.moduleCount).toBe(189);
    expect(PAVILION1_COMMERCIAL_REFERENCE.modularAreaM2).toBe(587.85);

    expect(sql).toContain('least(clear_width / 22.84, clear_depth / 52.70)');
    expect(sql).toContain('22.84 * uniform_scale as frame_width');
    expect(sql).toContain('52.70 * uniform_scale as frame_depth');
    expect(sql).toContain('abs(frame_depth / frame_width - 52.70 / 22.84)');
    expect(stagedProjection).toContain('(1 - (point->>1)::numeric - 0.5) * frame.frame_width');
    expect(stagedProjection).toContain('((point->>0)::numeric - 0.5) * frame.frame_depth');
    expect(stagedProjection).toContain(
      '(1 - (source.normalized_label_anchor->>1)::numeric - 0.5) * frame.frame_width',
    );
    expect(stagedProjection).toContain(
      '((source.normalized_label_anchor->>0)::numeric - 0.5) * frame.frame_depth',
    );
  });

  it('mantém a fonte normalizada e registra somente a nova projeção estrutural', () => {
    expect(stagedProjection).toContain("'layoutrevision', '2026.4-p1.2'");
    expect(stagedProjection).toContain(
      "'plancoordinatetransform', 'quarter-turn-clockwise'",
    );
    expect(stagedProjection).toContain("'projectionfit', 'metric-contain'");
    expect(stagedProjection).toContain(
      "'metricreference', jsonb_build_object('widthm', 52.70, 'depthm', 22.84)",
    );
    expect(stagedProjection).toContain("'normalizedfootprint', normalized_footprint");
    expect(stagedProjection).toContain("'normalizedfootprintpolygon', normalized_ring");
    expect(stagedProjection).toContain("'normalizedlabelanchor', normalized_label_anchor");
    expect(stagedProjection).toContain("'renderparts', render_parts");
    expect(sql).toContain("entity.metadata->'aream2' is distinct from 'null'::jsonb");
  });

  it('atualiza apenas metadata estrutural e geometria versionada de B1', () => {
    expect(mutationSection).toContain('update public.map_entities entity');
    expect(mutationSection).toContain('update public.map_entity_geometries geometry');
    expect(mutationSection).toContain('version = geometry.version + 1');
    expect(mutationSection).toContain(
      "change_reason = 'correção métrica de eixos do pavilhão 1 — planta oficial 2026'",
    );
    expect(mutationSection).toContain(
      'disable trigger map_geometry_layer_lock_before_write',
    );
    expect(mutationSection).toContain(
      'enable trigger map_geometry_layer_lock_before_write',
    );
    expect(sql).not.toMatch(/\b(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.commercial_lots\b/);
    expect(sql).not.toMatch(/\b(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.lot_(?:prices|reservations|negotiations|sales|contracts|contract_versions|status_history)\b/);
    expect(sql).not.toMatch(/\b(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.map_lot_lineage\b/);
    expect(sql).not.toMatch(/\b(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.map_segments\b/);
    expect(sql).not.toContain("public_identifier = 'b6'");
    expect(sql).not.toContain("public_identifier = 'b8'");
  });

  it('protege todos os estados comerciais e valida a geometria final', () => {
    [
      'lot_state',
      'prices',
      'reservations',
      'negotiations',
      'sales',
      'contracts',
      'contract_versions',
      'status_history',
      'lineage',
    ].forEach((field) => expect(commercialSnapshot).toContain(field));
    expect(sql).toContain("raise exception 'pavilion_1_axis_commercial_state_changed'");
    expect(sql).toContain("raise exception 'pavilion_1_axis_entity_state_changed'");
    expect(sql).toContain('extensions.st_isvalid');
    expect(sql).toContain('extensions.st_covers');
    expect(sql).toContain('extensions.st_intersection');
    expect(sql).toContain("raise exception 'pavilion_1_axis_final_state_invalid'");
  });
});
