// @vitest-environment ./src/test/venueSqlNode.environment.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAVILION12_COMMERCIAL_REFERENCE } from '@/features/commercial-map/data/pavilion12CommercialReference';
import { PAVILION14_COMMERCIAL_REFERENCE } from '@/features/commercial-map/data/pavilion14CommercialReference';
import { PAVILION3_COMMERCIAL_REFERENCE } from '@/features/commercial-map/data/pavilion3CommercialReference';

const migration = readFileSync(
  resolve('supabase/migrations/20260824120000_rebuild_pavilions_12_14_and_correct_pavilion_3.sql'),
  'utf8',
);
const sql = migration.replace(/\s+/g, ' ').toLowerCase();
const resolver = sql.slice(
  sql.indexOf('create or replace function public.resolve_commission_map_segment_slug'),
  sql.indexOf('select public.ensure_commission_map_segments'),
);
const backfill = sql.slice(
  sql.indexOf('create temp table _commercial_pavilion_specs'),
  sql.indexOf('create or replace function public.set_map_entity_verification'),
);
const verificationRpc = sql.slice(
  sql.indexOf('create or replace function public.set_map_entity_verification'),
  sql.lastIndexOf('do $$'),
);

type ParsedRun = {
  pavilionIdentifier: 'B2' | 'B3' | 'B6';
  id: string;
  start: number;
  end: number;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  sequenceOrientation: 'X+' | 'X-' | 'Z+' | 'Z-';
  moduleOrientation: 'east-west' | 'north-south';
  group: string;
  cluster: string;
};

const runSection = migration.slice(
  migration.indexOf('CREATE TEMP TABLE _commercial_pavilion_runs'),
  migration.indexOf('CREATE TEMP TABLE _commercial_pavilion_cluster_ranges'),
);
const runPattern = /\('(B2|B3|B6)',\s*'([^']+)',\s*(\d+),\s*(\d+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*'(X\+|X-|Z\+|Z-)',\s*'(east-west|north-south)',\s*'([^']+)',\s*'([^']+)'\)/g;
const parsedRuns = [...runSection.matchAll(runPattern)].map((match) => ({
  pavilionIdentifier: match[1] as ParsedRun['pavilionIdentifier'],
  id: match[2],
  start: Number(match[3]),
  end: Number(match[4]),
  centerX: Number(match[5]),
  centerZ: Number(match[6]),
  width: Number(match[7]),
  depth: Number(match[8]),
  sequenceOrientation: match[9] as ParsedRun['sequenceOrientation'],
  moduleOrientation: match[10] as ParsedRun['moduleOrientation'],
  group: match[11],
  cluster: match[12],
}));

const clusterSection = migration.slice(
  migration.indexOf('CREATE TEMP TABLE _commercial_pavilion_cluster_ranges'),
  migration.indexOf('CREATE TEMP TABLE _commercial_pavilion_cells'),
);
const clusterPattern = /\('(B2|B3)',\s*'([^']+)',\s*(\d+),\s*(\d+)\)/g;
const parsedClusterRanges = [...clusterSection.matchAll(clusterPattern)].map((match) => ({
  pavilionIdentifier: match[1] as 'B2' | 'B3',
  cluster: match[2],
  start: Number(match[3]),
  end: Number(match[4]),
}));

const references = {
  B2: PAVILION14_COMMERCIAL_REFERENCE,
  B3: PAVILION12_COMMERCIAL_REFERENCE,
  B6: PAVILION3_COMMERCIAL_REFERENCE,
} as const;

function expectedSqlDirection(sequence: string): ParsedRun['sequenceOrientation'] {
  return ({
    'x-increasing': 'X+',
    'x-decreasing': 'X-',
    'z-increasing': 'Z+',
    'z-decreasing': 'Z-',
  } as const)[sequence as 'x-increasing' | 'x-decreasing' | 'z-increasing' | 'z-decreasing'];
}

describe('contrato persistido dos Pavilhões 12, 14 e correção do Pavilhão 3', () => {
  it('mantém transação, lineage e inventários finais 111/95 e 797/760', () => {
    expect(sql.startsWith('-- pavilhões 12 e 14')).toBe(true);
    expect(sql).toContain('begin;');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).toContain('"expectedentitycount":111,"expectedlotcount":95');
    expect(sql).toContain('"expectedentitycount":797,"expectedlotcount":760');
    expect(sql).toContain("map_segments.boundary_data->'lineagebaselineat'");
    expect(sql).toContain('commission_segment_lineage_baseline_changed');
    expect(sql).toContain('not public.map_segment_is_complete(segment.id)');
    expect(sql).toMatch(/select public\.ensure_commission_map_segments\(project\.id\) from public\.map_projects project where project\.is_archived = false/);
    expect(backfill).toContain("'b2', 14, 'pavilhão 14 — comércio e artesanato'");
    expect(backfill).toContain("'b3', 12, 'pavilhão 12 — indústria, comércio e serviços'");
    expect(backfill).toContain('set name = spec.official_name');
    expect(backfill).toContain('commercial_pavilion_parent_label_invalid');
  });

  it('mantém os 24 runs do banco em paridade geométrica com a referência cliente', () => {
    expect(parsedRuns).toHaveLength(24);

    for (const [pavilionIdentifier, reference] of Object.entries(references)) {
      const runs = parsedRuns.filter((run) => run.pavilionIdentifier === pavilionIdentifier);
      expect(runs).toHaveLength(reference.runs.length);
      reference.runs.forEach((expectedRun) => {
        const run = runs.find((candidate) => candidate.id === expectedRun.id);
        expect(run).toBeDefined();
        expect([run!.start, run!.end]).toEqual([...expectedRun.numberRange]);
        expect(run!.centerX).toBeCloseTo(expectedRun.bounds.centerX, 9);
        expect(run!.centerZ).toBeCloseTo(expectedRun.bounds.centerZ, 9);
        expect(run!.width).toBeCloseTo(expectedRun.bounds.width, 9);
        expect(run!.depth).toBeCloseTo(expectedRun.bounds.depth, 9);
        expect(run!.sequenceOrientation).toBe(expectedSqlDirection(expectedRun.sequenceOrientation));
        expect(run!.moduleOrientation).toBe(expectedRun.orientation);
        expect(run!.group).toBe(expectedRun.group);
      });

      const expanded = runs.flatMap((run) => (
        Array.from({ length: run.end - run.start + 1 }, (_, index) => run.start + index)
      )).sort((first, second) => first - second);
      expect(expanded).toEqual(
        Array.from({ length: reference.moduleCount }, (_, index) => index + 1),
      );
    }

    expect(backfill).toContain('cross join lateral generate_series(1, spec.module_count) expected(module_number)');
    expect(backfill).toContain('cell_center_x - cell_width / 2 < 0');
    expect(backfill).toContain('cell_center_z + cell_depth / 2 > 1');
  });

  it('persiste os agrupamentos neutros detalhados de B2 e B3 iguais aos anexos', () => {
    expect(parsedClusterRanges.length).toBeGreaterThan(70);
    for (const pavilionIdentifier of ['B2', 'B3'] as const) {
      const reference = references[pavilionIdentifier];
      reference.cells.forEach((cell) => {
        const matches = parsedClusterRanges.filter((range) => (
          range.pavilionIdentifier === pavilionIdentifier
          && cell.number >= range.start
          && cell.number <= range.end
        ));
        expect(matches, `${pavilionIdentifier}-M${cell.number}`).toHaveLength(1);
        expect(matches[0].cluster).toBe(cell.cluster);
      });
    }
    expect(backfill).toContain('coalesce(cluster.cluster_key, run.cluster_key) as cluster_key');
    expect(backfill).not.toMatch(/sareli|leocam|glamurosa|boutique|calçados|modas/);
  });

  it('corrige 76–83 e 140–147 como extensões verticais proporcionais', () => {
    const firstLeg = parsedRuns.find((run) => run.id === 'island-1-west-leg')!;
    const firstExtension = parsedRuns.find((run) => run.id === 'island-1-vertical-extension')!;
    const secondLeg = parsedRuns.find((run) => run.id === 'island-2-west-leg')!;
    const secondExtension = parsedRuns.find((run) => run.id === 'island-2-vertical-extension')!;

    for (const [leg, extension] of [[firstLeg, firstExtension], [secondLeg, secondExtension]]) {
      expect(extension.sequenceOrientation).toBe('Z+');
      expect(extension.moduleOrientation).toBe('east-west');
      expect(extension.centerX).toBe(leg.centerX);
      expect(extension.width).toBe(leg.width);
      const legCellDepth = (leg.depth - 0.0015 * (leg.end - leg.start)) / (leg.end - leg.start + 1);
      const extensionCellDepth = (
        extension.depth - 0.0015 * (extension.end - extension.start)
      ) / (extension.end - extension.start + 1);
      expect(extensionCellDepth).toBeCloseTo(legCellDepth, 12);
      const legBottom = leg.centerZ + leg.depth / 2;
      const extensionTop = extension.centerZ - extension.depth / 2;
      expect(extensionTop - legBottom).toBeCloseTo(0.0015, 12);
    }
  });

  it('mantém área individual vazia e cria somente defaults comerciais neutros', () => {
    expect(backfill).toContain("'areaassignment', 'unassigned'");
    expect(backfill).toContain("'officialmeasurements', false");
    expect(backfill).toContain("'blocked', null, null, 'unvalidated'");
    expect(backfill).toContain("'not_for_sale', null, null, null, null");
    expect(backfill).toContain('commercial_pavilion_neutral_price_defaults_invalid');
    expect(backfill).not.toContain('insert into public.lot_reservations');
    expect(backfill).not.toContain('insert into public.lot_negotiations');
    expect(backfill).not.toContain('insert into public.lot_sales');
    expect(backfill).not.toContain('insert into public.lot_contracts');
    expect(backfill).not.toContain('company_name');
  });

  it('preserva estado comercial e revisão humana ao atualizar estruturas existentes', () => {
    expect(backfill).toContain('commercial_pavilion_entity_identity_conflict');
    expect(backfill).toContain('commercial_pavilion_module_key_conflict');
    expect(backfill).toContain('commercial_pavilion_lot_identity_conflict');
    expect(backfill).toContain('commercial_pavilion_unexpected_internal_stand_conflict');
    expect(backfill).toContain("'internal_stand', 'needs_review'");
    const entityUpdate = backfill.slice(
      backfill.indexOf('update public.map_entities entity'),
      backfill.indexOf('create temp table _commercial_pavilion_entity_map'),
    );
    expect(entityUpdate).not.toContain('verification_status =');
    expect(entityUpdate).toContain("- 'sourcediscrepancy'");
    expect(backfill).not.toContain('update public.commercial_lots');
  });

  it('marca apenas as sete divergências documentais e remove marcação obsoleta', () => {
    expect(backfill).toContain("pavilion_identifier = 'b6' and module_number in (6, 156, 157, 158, 159)");
    expect(backfill).toContain("pavilion_identifier = 'b2' and module_number in (73, 74)");
    expect(backfill).toContain("then 'official-range-omission'");
    expect(backfill).toContain("then 'manual-confirmation-required'");
    expect(sql).toContain("entity.metadata->>'sourcediscrepancy' is distinct from staged.source_discrepancy");
  });

  it('resolve somente identidades canônicas e prioriza módulos sobre metadata legada', () => {
    expect(resolver.indexOf("'^b2-m")).toBeLessThan(resolver.indexOf("= any (array[ 'b35'"));
    expect(resolver).toContain("'^b2-m(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-6])$'");
    expect(resolver).toContain("'^b3-m(00[1-9]|0[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-7])$'");
    expect(resolver).toContain("'^b6-m(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$'");
    expect(resolver).toContain("replace(upper(coalesce(_metadata->>'pavilionmodulekey', '')), ':module:', '-m')");
    expect(sql).toContain("jsonb_build_object('block', 'r', 'areacode', 'exporural')");
    expect(sql).toContain("public.resolve_commission_map_segment_slug( 'b35'");
    expect(sql).toContain("public.resolve_commission_map_segment_slug( 'b7'");
    expect(sql).toContain('commercial_pavilion_canonical_segment_resolver_invalid');
  });

  it('mantém o gate de medidas sem permitir spoof de metadata', () => {
    expect(verificationRpc).toContain("v_entity.classification = 'internal_stand'");
    expect(verificationRpc).toContain("replace(upper(coalesce(v_entity.metadata->>'pavilionmodulekey', '')), ':module:', '-m')");
    expect(verificationRpc).toContain("pavilion.classification = 'pavilion'");
    expect(verificationRpc).toContain('pavilion.id = v_entity.parent_entity_id');
    expect(verificationRpc).toContain('upper(v_lot.public_identifier) = upper(v_entity.public_identifier)');
    expect(verificationRpc).toContain("v_lot.area_validation_status = 'unvalidated'");
    expect(verificationRpc).toContain('official_area_required_for_verification');
  });
});
