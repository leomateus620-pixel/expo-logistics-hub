// @vitest-environment ./src/test/venueSqlNode.environment.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PAVILION8_COMMERCIAL_REFERENCE,
  PAVILION8_COMMERCIAL_SUPPORT_SPACES,
} from '@/features/commercial-map/data/pavilion8CommercialReference';
import { PAVILION13_COMMERCIAL_REFERENCE } from '@/features/commercial-map/data/pavilion13CommercialReference';

const migration = readFileSync(
  resolve('supabase/migrations/20260825020000_rebuild_pavilions_8_and_13_official_layouts.sql'),
  'utf8',
);
const sql = migration.replace(/\s+/g, ' ').toLowerCase();
const runSection = migration.slice(
  migration.indexOf('CREATE TEMP TABLE _p813_runs'),
  migration.indexOf('CREATE TEMP TABLE _p813_shapes'),
);
const shapeSection = migration.slice(
  migration.indexOf('CREATE TEMP TABLE _p813_shapes'),
  migration.indexOf('CREATE TEMP TABLE _p813_cells'),
);
const supportSection = migration.slice(
  migration.indexOf('CREATE TEMP TABLE _p813_support_spaces'),
  migration.indexOf('DO $$', migration.indexOf('CREATE TEMP TABLE _p813_support_spaces')),
);
const commercialSnapshot = sql.slice(
  sql.indexOf('create temp table _p813_commercial_snapshot'),
  sql.indexOf('create temp table _p813_geometry_snapshot'),
);
const entityMutation = sql.slice(
  sql.indexOf('create temp table _p813_created_entities'),
  sql.indexOf('create temp table _p813_entity_map'),
);
const supportPersistence = sql.slice(
  sql.indexOf('with run_payload as'),
  sql.indexOf('create temp table _p813_entity_map'),
);

type PavilionIdentifier = 'B4' | 'B5';
type ParsedRun = {
  pavilionIdentifier: PavilionIdentifier;
  id: string;
  start: number;
  end: number;
  left: number;
  top: number;
  width: number;
  depth: number;
  sequenceOrientation: 'x-increasing' | 'x-decreasing' | 'z-increasing' | 'z-decreasing';
  moduleOrientation: 'east-west' | 'north-south';
  role: 'perimeter' | 'island';
  group: string;
  cluster: string;
  referenceAreaM2: number;
};

const runPattern = /\('(B4|B5)'\s*,\s*'([^']+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*'(x-increasing|x-decreasing|z-increasing|z-decreasing)'\s*,\s*'(east-west|north-south)'\s*,\s*'(perimeter|island)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*([\d.]+)\)/g;
const parsedRuns = [...runSection.matchAll(runPattern)].map((match): ParsedRun => ({
  pavilionIdentifier: match[1] as PavilionIdentifier,
  id: match[2],
  start: Number(match[3]),
  end: Number(match[4]),
  left: Number(match[5]),
  top: Number(match[6]),
  width: Number(match[7]),
  depth: Number(match[8]),
  sequenceOrientation: match[9] as ParsedRun['sequenceOrientation'],
  moduleOrientation: match[10] as ParsedRun['moduleOrientation'],
  role: match[11] as ParsedRun['role'],
  group: match[12],
  cluster: match[13],
  referenceAreaM2: Number(match[14]),
}));

const references = {
  B4: PAVILION8_COMMERCIAL_REFERENCE,
  B5: PAVILION13_COMMERCIAL_REFERENCE,
} as const;

const metricFrames = {
  B4: { width: 21.7, depth: 35.4, inset: 0 },
  B5: { width: 21, depth: 35.35, inset: 0 },
} as const;

function normalizedBounds(run: ParsedRun) {
  const frame = metricFrames[run.pavilionIdentifier];
  const usable = 1 - frame.inset * 2;
  const width = (run.width / frame.width) * usable;
  const depth = (run.depth / frame.depth) * usable;
  return {
    centerX: frame.inset + ((run.left + run.width / 2) / frame.width) * usable,
    centerZ: frame.inset + ((run.top + run.depth / 2) / frame.depth) * usable,
    width,
    depth,
  };
}

describe('contrato persistido dos Pavilhões 8 e 13', () => {
  it('é transacional e prepara inventário, projeção e snapshots antes das mutações', () => {
    expect(sql.startsWith('-- pavilhoes 8 (b4) e 13 (b5)')).toBe(true);
    expect(sql).toContain('begin;');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).toContain("commercial-map:pavilions-8-13:2026.4");
    expect(sql).toContain("raise exception 'pavilions_8_13_active_project_precondition_failed'");
    expect(sql).toContain("raise exception 'pavilions_8_13_parent_identity_precondition_failed'");
    expect(sql).toContain("raise exception 'pavilions_8_13_map_infrastructure_precondition_failed'");
    expect(sql.indexOf('create temp table _p813_specs')).toBeLessThan(
      sql.indexOf('create temp table _p813_frames'),
    );
    expect(sql.indexOf('create temp table _p813_staged')).toBeLessThan(
      sql.indexOf('create temp table _p813_created_entities'),
    );
    expect(sql.indexOf('create temp table _p813_commercial_snapshot')).toBeLessThan(
      sql.indexOf('update public.map_entities entity'),
    );
  });

  it('mantém specs, IDs e 19 runs SQL em paridade com as referências cliente', () => {
    expect(parsedRuns).toHaveLength(19);
    expect(sql).toContain("760.20, 438.50, '2026.4-p8.1'");
    expect(sql).toContain("709.05, 351.30, '2026.4-p13.1'");
    expect(sql).toMatch(/'b4', 8, 'pavilhão 8 [^']* indústria e comércio', 'p8', 114/);
    expect(sql).toMatch(/'b5', 13, 'pavilhão 13 [^']* indústria e comércio', 'p13', 103/);
    expect(sql).toContain("21.70, 35.40, 0.00, round(pi()::numeric, 6), 'center', 'end'");
    expect(sql).toContain("21.00, 35.35, 0.00, round(pi()::numeric, 6), 'center', 'end'");

    for (const [pavilionIdentifier, reference] of Object.entries(references)) {
      const runs = parsedRuns.filter((run) => run.pavilionIdentifier === pavilionIdentifier);
      expect(runs).toHaveLength(reference.runs.length);
      reference.runs.forEach((expectedRun) => {
        const run = runs.find((candidate) => candidate.id === expectedRun.id);
        expect(run, `${pavilionIdentifier}/${expectedRun.id}`).toBeDefined();
        expect([run!.start, run!.end]).toEqual([...expectedRun.numberRange]);
        expect(run!.sequenceOrientation).toBe(expectedRun.sequenceOrientation);
        expect(run!.moduleOrientation).toBe(expectedRun.orientation);
        expect(run!.role).toBe(expectedRun.role);
        expect(run!.group).toBe(expectedRun.group);
        expect(run!.cluster).toBe(expectedRun.cluster);

        const bounds = normalizedBounds(run!);
        expect(bounds.centerX).toBeCloseTo(expectedRun.bounds.centerX, 12);
        expect(bounds.centerZ).toBeCloseTo(expectedRun.bounds.centerZ, 12);
        expect(bounds.width).toBeCloseTo(expectedRun.bounds.width, 12);
        expect(bounds.depth).toBeCloseTo(expectedRun.bounds.depth, 12);
      });

      expect(runs.reduce((area, run) => area + run.referenceAreaM2, 0))
        .toBeCloseTo(reference.modularAreaM2, 9);
      expect(runs.flatMap((run) => (
        Array.from({ length: run.end - run.start + 1 }, (_, index) => run.start + index)
      )).sort((first, second) => first - second)).toEqual(
        Array.from({ length: reference.moduleCount }, (_, index) => index + 1),
      );
    }

    expect(sql).toContain("pavilion_identifier || '-m' || lpad(module_number::text, 3, '0')");
    expect(sql).toContain("pavilion_identifier || ':module:' || lpad(module_number::text, 3, '0')");
    expect(sql).toContain('(select count(*) from _p813_cells) <> 217');
  });

  it('persiste os cinco módulos irregulares como polígonos oficiais e render parts leves', () => {
    expect(PAVILION8_COMMERCIAL_REFERENCE.cells.filter((cell) => cell.shape).map((cell) => cell.number))
      .toEqual([90]);
    expect(PAVILION13_COMMERCIAL_REFERENCE.cells.filter((cell) => cell.shape).map((cell) => cell.number))
      .toEqual([25, 26, 78, 79]);
    expect(shapeSection).toContain("'B4', 90");
    [25, 26, 78, 79].forEach((number) => {
      expect(shapeSection).toMatch(new RegExp(`'B5'(?:::text)?,\\s*${number},`));
    });
    expect(shapeSection).toContain("'[[0,0],[5.5,0],[5.5,3],[4,3],[4,5],[0,5],[0,0]]'::jsonb");
    expect(shapeSection).toContain("'[[21,0],[21,5.65],[18,5.65],[18,3],[21,0]]'::jsonb");
    expect(shapeSection).toContain("'[[14.6,0],[21,0],[18,3],[14.6,3],[14.6,0]]'::jsonb");
    expect(shapeSection).toContain("'[[0,0],[6.4,0],[6.4,3],[3,3],[0,0]]'::jsonb");
    expect(shapeSection).toContain("'[[0,0],[3,3],[3,5.65],[0,5.65],[0,0]]'::jsonb");
    expect(shapeSection).toContain('generate_series(0, 11)');
    expect(sql).toContain('(select count(*) from _p813_shapes) <> 5');
    expect(sql).toContain("raise exception 'pavilions_8_13_normalized_overlap_invalid'");
  });

  it('mantém os três apoios do Pavilhão 8 como metadata não comercial', () => {
    const supportPattern = /\('B4',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+)\)/g;
    const supports = [...supportSection.matchAll(supportPattern)].map((match) => ({
      id: match[1],
      label: match[2],
      kind: match[3],
      sourcePrecision: match[4],
      left: Number(match[5]),
      top: Number(match[6]),
      width: Number(match[7]),
      depth: Number(match[8]),
    }));
    expect(supports).toHaveLength(3);
    supports.forEach((support) => {
      const expected = PAVILION8_COMMERCIAL_SUPPORT_SPACES.find(
        (candidate) => candidate.id === support.id,
      );
      expect(expected, support.id).toBeDefined();
      expect(support.label).toBe(expected!.label);
      expect(support.kind).toBe(expected!.kind);
      expect(support.sourcePrecision).toBe(expected!.sourcePrecision);
      expect(normalizedBounds({
        pavilionIdentifier: 'B4',
        id: support.id,
        start: 0,
        end: 0,
        sequenceOrientation: 'x-increasing',
        moduleOrientation: 'east-west',
        role: 'perimeter',
        group: '',
        cluster: '',
        referenceAreaM2: 0,
        ...support,
      })).toMatchObject({
        centerX: expect.closeTo(expected!.centerX, 12),
        centerZ: expect.closeTo(expected!.centerZ, 12),
        width: expect.closeTo(expected!.width, 12),
        depth: expect.closeTo(expected!.depth, 12),
      });
    });
    expect(supportPersistence).toContain("'type', 'permanent-non-commercial'");
    expect(supportPersistence).toContain("'internalsupportspaces', parent_payload.supports_payload");
    expect(supportPersistence).not.toContain('insert into public.map_entities');
    expect(supportPersistence).not.toContain('insert into public.commercial_lots');
    expect(supportPersistence).not.toContain('insert into public.lot_prices');
  });

  it('preserva registros comerciais existentes e cria ausentes somente com defaults neutros', () => {
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
    expect(entityMutation).toContain('where not exists');
    expect(entityMutation).toContain('on conflict (project_id, public_identifier) do nothing');
    expect(entityMutation).toContain("coalesce(entity.metadata, '{}'::jsonb) - array[");
    expect(sql).toContain("'aream2', null");
    expect(sql).toContain("'areaassignment', 'unassigned'");
    expect(sql).toContain("'officialmeasurements', false");
    expect(sql).toContain("null, 'módulo ' || staged.lot_number, null, 'blocked'");
    expect(sql).toContain("created.lot_id, 'not_for_sale'");
    expect(sql).toContain("raise exception 'pavilions_8_13_new_lot_neutrality_invalid'");
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\.(?:map_entities|commercial_lots|lot_\w+|map_lot_lineage)\b/);
    expect(sql).not.toMatch(/\bupdate\s+public\.commercial_lots\b/);
    expect(sql).not.toMatch(/\b(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.lot_(?:reservations|negotiations|sales|contracts|contract_versions|status_history)\b/);
    expect(sql).not.toMatch(/\b(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.map_lot_lineage\b/);
    expect(sql).not.toMatch(/company_name|exhibitor_name|buyer_name/);
  });

  it('versiona apenas a geometria alterada e valida a topologia oficial final', () => {
    expect(sql).toContain('disable trigger map_geometry_layer_lock_before_write');
    expect(sql).toContain('enable trigger map_geometry_layer_lock_before_write');
    expect(sql).toContain('insert into public.map_entity_geometries');
    expect(sql).toContain('update public.map_entity_geometries geometry');
    expect(sql).toContain('version = geometry.version + 1');
    expect(sql).toContain('extensions.st_isvalid');
    expect(sql).toContain('extensions.st_covers');
    expect(sql).toContain('extensions.st_intersection');
    expect(sql).toContain("raise exception 'pavilions_8_13_staged_geometry_invalid'");
    expect(sql).toContain("raise exception 'pavilions_8_13_commercial_state_changed'");
    expect(sql).toContain("raise exception 'pavilions_8_13_final_inventory_invalid'");
    expect(sql).toContain("raise exception 'pavilions_8_13_persisted_state_invalid'");
    expect(sql).toContain("raise exception 'pavilions_8_13_non_structural_entity_state_changed'");
    expect(sql).toContain("raise exception 'pavilions_8_13_geometry_versioning_invalid'");
  });

  it('sincroniza o baseline do segmento e resolve B4/B5 antes de metadata legada', () => {
    expect(sql).toContain("segment.boundary_data->>'expectedentitycount' not in ('986', '1203')");
    expect(sql).toContain("segment.boundary_data->>'expectedlotcount' not in ('949', '1166')");
    expect(sql).toContain("'{expectedentitycount}', '1203'::jsonb");
    expect(sql).toContain("'{expectedlotcount}', '1166'::jsonb");
    expect(sql).toContain('"expectedentitycount":1203,"expectedlotcount":1166');
    expect(sql).not.toMatch(/\bselect\s+public\.ensure_commission_map_segments\s*\(/);

    const resolver = sql.slice(
      sql.indexOf('create or replace function public.resolve_commission_map_segment_slug'),
      sql.indexOf('-- validacao final:'),
    );
    expect(resolver).toContain("'^b4-m(00[1-9]|0[1-9][0-9]|10[0-9]|11[0-4])$'");
    expect(resolver).toContain("'^b5-m(00[1-9]|0[1-9][0-9]|10[0-3])$'");
    expect(resolver.indexOf("'^b4-m")).toBeLessThan(resolver.indexOf("upper(coalesce(_metadata->>'block'"));
    expect(resolver.indexOf("'^b5-m")).toBeLessThan(resolver.indexOf("upper(coalesce(_metadata->>'block'"));
    expect(sql).toContain("raise exception 'pavilions_8_13_canonical_resolver_invalid'");
    expect(sql).toContain("raise exception 'pavilions_8_13_industry_segment_invalid'");
  });
});
