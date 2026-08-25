// @vitest-environment ./src/test/venueSqlNode.environment.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAVILION14_COMMERCIAL_REFERENCE } from '@/features/commercial-map/data/pavilion14CommercialReference';
import { PAVILION5_COMMERCIAL_REFERENCE } from '@/features/commercial-map/data/pavilion5CommercialReference';
import { PAVILION7_COMMERCIAL_REFERENCE } from '@/features/commercial-map/data/pavilion7CommercialReference';

const migration = readFileSync(
  resolve('supabase/migrations/20260825030000_rebuild_pavilions_5_7_and_14_official_layouts.sql'),
  'utf8',
);
const sql = migration.replace(/\s+/g, ' ').toLowerCase();
const runSection = migration.slice(
  migration.indexOf('CREATE TEMP TABLE _p5714_runs'),
  migration.indexOf('CREATE TEMP TABLE _p5714_cells'),
);
const supportSection = migration.slice(
  migration.indexOf('CREATE TEMP TABLE _p5714_support_spaces'),
  migration.indexOf('CREATE TEMP TABLE _p5714_wall_accesses'),
);
const accessSection = migration.slice(
  migration.indexOf('CREATE TEMP TABLE _p5714_wall_accesses'),
  migration.indexOf('CREATE TEMP TABLE _p5714_frames'),
);

type PavilionIdentifier = 'B2' | 'B8' | 'B10';

const references = {
  B2: PAVILION14_COMMERCIAL_REFERENCE,
  B8: PAVILION5_COMMERCIAL_REFERENCE,
  B10: PAVILION7_COMMERCIAL_REFERENCE,
} as const;

const metricFrames = {
  B2: { width: 35, depth: 33 },
  B8: { width: 25.5, depth: 43.5 },
  B10: { width: 49.9, depth: 18.3 },
} as const;

type ParsedRun = {
  pavilionIdentifier: PavilionIdentifier;
  id: string;
  start: number;
  end: number;
  left: number;
  top: number;
  width: number;
  depth: number;
  sequenceOrientation: string;
  moduleOrientation: string;
  group: string;
  cluster: string;
};

const runPattern = /\('(B2|B8|B10)',\s*'([^']+)',\s*'[^']*',\s*'[^']*',\s*(\d+),\s*(\d+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\)/g;

const parsedRuns = [...runSection.matchAll(runPattern)].map((match): ParsedRun => ({
  pavilionIdentifier: match[1] as PavilionIdentifier,
  id: match[2],
  start: Number(match[3]),
  end: Number(match[4]),
  left: Number(match[5]),
  top: Number(match[6]),
  width: Number(match[7]),
  depth: Number(match[8]),
  sequenceOrientation: match[9],
  moduleOrientation: match[10],
  group: match[11],
  cluster: match[12],
}));

describe('contrato persistido dos Pavilhões 5, 7 e 14', () => {
  it('é uma única transação serializada, aditiva e sem mutação de lotes existentes', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(sql).toContain("hashtextextended('commercial-map:pavilions-5-7-14:2026.4', 0)");
    expect(sql).not.toMatch(/\bdelete\s+from\b/);
    expect(sql).not.toMatch(/\bupdate\s+public\.commercial_lots\b/);
    expect(sql).not.toMatch(/\bset\s+[\s\S]{0,120}\bis_archived\s*=\s*true\b/);
    expect(sql).not.toMatch(/\barchived_at\s*=\s*transaction_timestamp\(\)/);
  });

  it('declara revisões, projeções, inventários e segmentação canônicos', () => {
    expect(sql).toContain("'2026.4-p14.2', '2026.4-p14.1'");
    expect(sql).toContain("'2026.4-p5.2', '2026.4-p5.1'");
    expect(sql).toContain("'2026.4-p7.1', null");
    expect(sql).toContain("'b2', 14, 'pavilhão 14 — artesanato e comércio', 'p14', 186");
    expect(sql).toContain("35.00, 33.00, 'quarter-turn-clockwise', 'center', 'center'");
    expect(sql).toContain("'b8', 5, 'pavilhão 5 — veterinária, pequenos animais e rações', 'p5', 81");
    expect(sql).toContain("25.50, 43.50, 'identity', 'center', 'end', 0");
    expect(sql).toContain("'b10', 7, 'pavilhão 7 — agroindústrias', 'p7', 171");
    expect(sql).toContain("49.90, 18.30, 'identity', 'center', 'end', 0");
    expect(sql).toContain("'industria-comercio-servicos', null, null");
    expect(sql).toContain("null, 57,");
  });

  it('mantém os 15 runs SQL em paridade métrica com as referências cliente', () => {
    expect(parsedRuns).toHaveLength(15);

    for (const [identifier, reference] of Object.entries(references)) {
      const pavilionIdentifier = identifier as PavilionIdentifier;
      const sqlRuns = parsedRuns.filter((run) => run.pavilionIdentifier === pavilionIdentifier);
      expect(sqlRuns).toHaveLength(reference.runs.length);

      reference.runs.forEach((expected) => {
        const run = sqlRuns.find((candidate) => candidate.id === expected.id);
        expect(run, `${pavilionIdentifier}/${expected.id}`).toBeDefined();
        expect([run!.start, run!.end]).toEqual([...expected.numberRange]);
        expect(run!.sequenceOrientation).toBe(expected.sequenceOrientation);
        expect(run!.moduleOrientation).toBe(expected.orientation);
        expect(run!.group).toBe(expected.group);
        expect(run!.cluster).toBe(expected.cluster);

        const metric = metricFrames[pavilionIdentifier];
        expect((run!.left + run!.width / 2) / metric.width)
          .toBeCloseTo(expected.bounds.centerX, 12);
        expect((run!.top + run!.depth / 2) / metric.depth)
          .toBeCloseTo(expected.bounds.centerZ, 12);
        expect(run!.width / metric.width).toBeCloseTo(expected.bounds.width, 12);
        expect(run!.depth / metric.depth).toBeCloseTo(expected.bounds.depth, 12);
      });

      const expanded = sqlRuns.flatMap((run) => (
        Array.from({ length: run.end - run.start + 1 }, (_, index) => run.start + index)
      )).sort((first, second) => first - second);
      expect(expanded).toEqual(
        Array.from({ length: reference.moduleCount }, (_, index) => index + 1),
      );
    }

    expect(sql).toContain('(select count(*) from _p5714_cells) <> 438');
    expect(sql).toContain("is distinct from 616.00::numeric");
    expect(sql).toContain("is distinct from 244.50::numeric");
    expect(sql).toContain("is distinct from 427.50::numeric");
  });

  it('projeta B2 com quarter-turn e B8/B10 com identidade usando escala uniforme', () => {
    expect(sql).toContain("case when coordinate_transform = 'quarter-turn-clockwise' then metric_depth else metric_width end as oriented_metric_width");
    expect(sql).toContain("case when coordinate_transform = 'quarter-turn-clockwise' then metric_width else metric_depth end as oriented_metric_depth");
    expect(sql).toContain('clear_width / oriented_metric_width');
    expect(sql).toContain('clear_depth / oriented_metric_depth');
    expect(sql).toContain("then 1 - (point->>1)::numeric else (point->>0)::numeric end");
    expect(sql).toContain("then (point->>0)::numeric else (point->>1)::numeric end");
    expect(sql).toContain("'projectionfit', 'metric-contain'");
    expect(sql).toContain("'plancoordinatetransform', coordinate_transform");
    expect(sql).toContain("'inset', 0");
    expect(sql).toContain("'nominalgeometricaream2', case");
    expect(sql).toContain('frame_width > clear_width + 0.00000001');
    expect(sql).toContain('frame_depth > clear_depth + 0.00000001');
  });

  it('persiste infraestrutura no pai sem convertê-la em inventário comercial', () => {
    const supports = [...supportSection.matchAll(
      /\('(B8|B10)',\s*'[^']+',\s*'[^']+',\s*'[^']+',\s*[-\d.]+,\s*[-\d.]+,\s*[\d.]+,\s*[\d.]+,\s*'(official-metric|plan-traced)'\)/g,
    )];
    const accesses = [...accessSection.matchAll(
      /\('(B2|B10)',\s*'[^']+',\s*'[^']+',\s*'(official-metric|plan-traced)'/g,
    )];
    expect(supports).toHaveLength(6);
    expect(supports.filter((match) => match[1] === 'B8')).toHaveLength(4);
    expect(supports.filter((match) => match[1] === 'B10')).toHaveLength(2);
    expect(accesses.filter((match) => match[1] === 'B2')).toHaveLength(3);
    expect(accesses.filter((match) => match[1] === 'B10')).toHaveLength(4);
    expect(accessSection).toContain('"kind":"gate"');
    expect(sql).toContain("'internalsupportspaces', parent_payload.supports_payload");
    expect(sql).toContain("'internalwallaccesses', parent_payload.accesses_payload");
    expect(sql).toContain("'internalplanruns', parent_payload.runs_payload");
    expect(sql).toContain("'internalcorridors', parent_payload.corridors_payload");
    expect(supportSection.toLowerCase()).not.toContain('insert into public.map_entities');
    expect(supportSection.toLowerCase()).not.toContain('insert into public.commercial_lots');
  });

  it('preserva integralmente relações comerciais e metadata não estrutural', () => {
    [
      'lot_prices',
      'lot_reservations',
      'lot_negotiations',
      'lot_sales',
      'lot_contracts',
      'lot_contract_versions',
      'lot_status_history',
      'map_lot_lineage',
    ].forEach((relation) => expect(sql).toContain(`public.${relation}`));
    expect(sql).toContain('pavilions_5_7_14_commercial_state_changed');
    expect(sql).toContain('pavilions_5_7_14_non_structural_entity_state_changed');
    expect(sql).toContain('pavilions_5_7_14_non_structural_parent_state_changed');
    expect(sql).toContain("where staged.pavilion_identifier = 'b10'");
    expect(sql).toContain('geometry.geometry is distinct from staged.geometry');
    expect(sql).toContain('version = geometry.version + 1');
    expect(sql).toContain('name = parent_payload.official_name');
    expect(sql).toContain("'aliases', (");
    expect(sql).toContain('jsonb_array_elements_text(parent_payload.official_aliases)');
    expect(sql).toContain("to_jsonb(pavilion) - 'metadata' - 'updated_at' - 'name' as row_state");
    expect(sql).toContain("'internalsupportspaces', 'internalwallaccesses', 'aliases'");
    expect(sql).toContain('["pavilhão 14 — comércio e artesanato"]');
    expect(sql).toContain('["pavilhão 5 — floriculturas"]');
    expect(sql).toContain('["pavilhão 7 — agricultura familiar","pavilhão 7 — agricultura familiar / soja e derivados"]');
  });

  it('cria somente ausências B10 em estado neutro e sem dados inventados', () => {
    expect(sql).toContain("null, 'módulo ' || staged.lot_number, null, 'blocked'");
    expect(sql).toContain("null, null, 'unvalidated', null, null, '[]'::jsonb");
    expect(sql).toContain("gen_random_uuid(), created.lot_id, 'not_for_sale'");
    expect(sql).toContain('null, null, null, null, true');
    expect(sql).toContain("'buyerdataimported', false");
    expect(sql).toContain('pavilion_7_new_lot_neutrality_invalid');
    expect(sql).toContain('lot.official_area_sqm is not null');
    expect(sql).toContain('lot.calculated_area_sqm is not null');
    expect(sql).toContain("entity.metadata ?| array['exhibitorid', 'buyerid', 'responsibleexhibitor']");
    expect(sql).not.toContain("when pavilion_identifier = 'b10' then 'manual-confirmation-required'");
  });

  it('falha fechado para legado B10 incompatível e permanece idempotente', () => {
    expect(sql).toContain('pavilion_7_legacy_identity_incompatible');
    expect(sql).toContain('pavilion_7_legacy_commercial_activity_incompatible');
    expect(sql).toContain("coalesce(entity.metadata->>'layoutrevision', '') <> '2026.4-p7.1'");
    expect(sql).toContain('pavilions_5_14_previous_revision_precondition_failed');
    expect(sql).toContain('in (spec.previous_revision, spec.layout_revision)');
    expect(sql).toContain('on conflict (project_id, public_identifier) do nothing');
    expect(sql).toContain('where not exists');
    expect(sql).toContain('geometry.geometry is distinct from staged.geometry');
  });
});
