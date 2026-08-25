// @vitest-environment ./src/test/venueSqlNode.environment.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAVILION1_COMMERCIAL_REFERENCE } from '@/features/commercial-map/data/pavilion1CommercialReference';
import { PAVILION3_COMMERCIAL_REFERENCE } from '@/features/commercial-map/data/pavilion3CommercialReference';
import {
  PAVILION5_COMMERCIAL_REFERENCE,
  PAVILION5_COMMERCIAL_SUPPORT_SPACES,
} from '@/features/commercial-map/data/pavilion5CommercialReference';

const migration = readFileSync(
  resolve('supabase/migrations/20260824210000_rebuild_pavilions_1_5_and_correct_pavilion_3.sql'),
  'utf8',
);
const supersedingMigration = readFileSync(
  resolve('supabase/migrations/20260825030000_rebuild_pavilions_5_7_and_14_official_layouts.sql'),
  'utf8',
);
const sql = migration.replace(/\s+/g, ' ').toLowerCase();
const supersedingSql = supersedingMigration.replace(/\s+/g, ' ').toLowerCase();
const runSection = migration.slice(
  migration.indexOf('CREATE TEMP TABLE _p135_runs'),
  migration.indexOf('CREATE TEMP TABLE _p135_cells'),
);
const backfill = sql.slice(
  0,
  sql.indexOf('create or replace function public.set_map_entity_verification'),
);
const ensureSegmentsFunction = sql.slice(
  sql.indexOf('create or replace function public.ensure_commission_map_segments'),
  sql.indexOf('revoke all on function public.ensure_commission_map_segments'),
);
const supportPersistence = sql.slice(
  sql.indexOf('-- persistência descritiva dos quatro espaços permanentes de b8'),
  sql.indexOf('create temp table _p135_entity_map'),
);
const commercialSnapshot = sql.slice(
  sql.indexOf('create temp table _p135_commercial_snapshot'),
  sql.indexOf('create temp table _p135_created_entities'),
);
const finalValidation = sql.slice(
  sql.lastIndexOf('-- validação final de identidade, geometria, segmentação e preservação.'),
);

type PavilionIdentifier = 'B1' | 'B6' | 'B8';
type SequenceOrientation = 'X+' | 'X-' | 'Z+' | 'Z-';

type ParsedRun = {
  pavilionIdentifier: PavilionIdentifier;
  id: string;
  start: number;
  end: number;
  left: number;
  top: number;
  width: number;
  depth: number;
  coordinateSpace: 'metric' | 'normalized';
  sequenceOrientation: SequenceOrientation;
  moduleOrientation: 'east-west' | 'north-south';
  group: string;
  cluster: string;
  moduleGap: number;
};

const standardPavilion3CellDepth = (0.47 - 0.0015 * 27) / 28;
const pairedPavilion3Depth = standardPavilion3CellDepth * 32 + 0.0015 * 31;

function parseSqlNumber(expression: string): number {
  const normalized = expression.replace(/::numeric/gi, '').trim();
  if (normalized === 'paired_depth') return pairedPavilion3Depth;
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);

  const subtraction = normalized.match(
    /^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/,
  );
  if (subtraction) {
    return Number(subtraction[1]) - Number(subtraction[2]) / Number(subtraction[3]);
  }

  throw new Error(`Expressão numérica SQL não reconhecida no contrato: ${expression}`);
}

const runPattern = /(?:\(|select\s+)'(B1|B6|B8)'\s*,\s*'([^']+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([^,\r\n]+)\s*,\s*([^,\r\n]+)\s*,\s*([^,\r\n]+)\s*,\s*([^,\r\n]+)\s*,\s*'(metric|normalized)'\s*,\s*'(X\+|X-|Z\+|Z-)'\s*,\s*'(east-west|north-south)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*([^,\r\n)]+)/gi;
const parsedRuns = [...runSection.matchAll(runPattern)].map((match): ParsedRun => ({
  pavilionIdentifier: match[1] as PavilionIdentifier,
  id: match[2],
  start: Number(match[3]),
  end: Number(match[4]),
  left: parseSqlNumber(match[5]),
  top: parseSqlNumber(match[6]),
  width: parseSqlNumber(match[7]),
  depth: parseSqlNumber(match[8]),
  coordinateSpace: match[9] as ParsedRun['coordinateSpace'],
  sequenceOrientation: match[10] as SequenceOrientation,
  moduleOrientation: match[11] as ParsedRun['moduleOrientation'],
  group: match[12],
  cluster: match[13],
  moduleGap: parseSqlNumber(match[14]),
}));

const references = {
  B1: PAVILION1_COMMERCIAL_REFERENCE,
  B6: PAVILION3_COMMERCIAL_REFERENCE,
  B8: PAVILION5_COMMERCIAL_REFERENCE,
} as const;

const metricFootprints = {
  B1: { width: 52.7, depth: 22.84, inset: 0.02 },
  B8: { width: 25.5, depth: 43.5, inset: 0.02 },
} as const;

function expectedSqlDirection(sequence: string): SequenceOrientation {
  return ({
    'x-increasing': 'X+',
    'x-decreasing': 'X-',
    'z-increasing': 'Z+',
    'z-decreasing': 'Z-',
  } as const)[sequence as 'x-increasing' | 'x-decreasing' | 'z-increasing' | 'z-decreasing'];
}

function normalizedBounds(run: ParsedRun) {
  if (run.coordinateSpace === 'normalized') {
    return {
      centerX: run.left + run.width / 2,
      centerZ: run.top + run.depth / 2,
      width: run.width,
      depth: run.depth,
    };
  }

  const footprint = metricFootprints[run.pavilionIdentifier as 'B1' | 'B8'];
  const usable = 1 - footprint.inset * 2;
  const width = (run.width / footprint.width) * usable;
  const depth = (run.depth / footprint.depth) * usable;
  return {
    centerX: footprint.inset + (run.left / footprint.width) * usable + width / 2,
    centerZ: footprint.inset + (run.top / footprint.depth) * usable + depth / 2,
    width,
    depth,
  };
}

describe('contrato persistido dos Pavilhões 1, 3 e 5', () => {
  it('mantém transação, escopo e inventários finais da comissão em 986/949', () => {
    expect(sql.startsWith('-- pavilhões 1, 3 e 5')).toBe(true);
    expect(sql).toContain('begin;');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).toContain("segment.boundary_data->>'expectedentitycount' not in ('797', '986')");
    expect(sql).toContain("segment.boundary_data->>'expectedlotcount' not in ('760', '949')");
    expect(sql).toContain("'{expectedentitycount}', '986'::jsonb");
    expect(sql).toContain("'{expectedlotcount}', '949'::jsonb");
    expect(finalValidation).toContain("segment.boundary_data->>'expectedentitycount' is distinct from '986'");
    expect(finalValidation).toContain("segment.boundary_data->>'expectedlotcount' is distinct from '949'");
    expect(finalValidation).toContain('or not public.map_segment_is_complete(segment.id)');
    expect(finalValidation).toContain('exporural_state_changed_outside_scope');
    expect(ensureSegmentsFunction).toContain(
      '"expectedentitycount":986,"expectedlotcount":949',
    );
    expect(ensureSegmentsFunction).not.toContain(
      '"expectedentitycount":797,"expectedlotcount":760',
    );
    expect(sql).not.toMatch(/\bselect\s+public\.ensure_commission_map_segments\s*\(/);
  });

  it('mantém IDs e sequências; trata o frame p5.1 como snapshot supersedido por p5.2', () => {
    expect(parsedRuns).toHaveLength(20);

    for (const [pavilionIdentifier, reference] of Object.entries(references)) {
      const sqlRuns = parsedRuns.filter((run) => run.pavilionIdentifier === pavilionIdentifier);
      const regularReferenceRuns = reference.runs.filter((run) => (
        pavilionIdentifier !== 'B1' || run.id !== 'northeast-141'
      ));
      expect(sqlRuns).toHaveLength(regularReferenceRuns.length);

      regularReferenceRuns.forEach((expectedRun) => {
        const run = sqlRuns.find((candidate) => candidate.id === expectedRun.id);
        expect(run, `${pavilionIdentifier}/${expectedRun.id}`).toBeDefined();
        expect([run!.start, run!.end]).toEqual([...expectedRun.numberRange]);
        expect(run!.sequenceOrientation).toBe(
          expectedSqlDirection(expectedRun.sequenceOrientation),
        );
        expect(run!.moduleOrientation).toBe(expectedRun.orientation);
        expect(run!.group).toBe(expectedRun.group);
        expect(run!.cluster).toBe(expectedRun.cluster);
        expect(run!.moduleGap).toBeCloseTo(reference.moduleGap, 12);

        const historicalBounds = normalizedBounds(run!);
        if (pavilionIdentifier === 'B8') {
          const currentBounds = {
            centerX: (run!.left + run!.width / 2) / 25.5,
            centerZ: (run!.top + run!.depth / 2) / 43.5,
            width: run!.width / 25.5,
            depth: run!.depth / 43.5,
          };
          expect(currentBounds.centerX).toBeCloseTo(expectedRun.bounds.centerX, 12);
          expect(currentBounds.centerZ).toBeCloseTo(expectedRun.bounds.centerZ, 12);
          expect(currentBounds.width).toBeCloseTo(expectedRun.bounds.width, 12);
          expect(currentBounds.depth).toBeCloseTo(expectedRun.bounds.depth, 12);
          expect(historicalBounds.width).not.toBeCloseTo(expectedRun.bounds.width, 12);
        } else {
          expect(historicalBounds.centerX).toBeCloseTo(expectedRun.bounds.centerX, 12);
          expect(historicalBounds.centerZ).toBeCloseTo(expectedRun.bounds.centerZ, 12);
          expect(historicalBounds.width).toBeCloseTo(expectedRun.bounds.width, 12);
          expect(historicalBounds.depth).toBeCloseTo(expectedRun.bounds.depth, 12);
        }
      });

      const inventoryRuns = pavilionIdentifier === 'B1'
        ? [...sqlRuns, {
            id: 'northeast-141', start: 141, end: 141,
          }]
        : sqlRuns;
      expect(inventoryRuns.map((run) => run.id).sort()).toEqual(
        reference.runs.map((run) => run.id).sort(),
      );
      const expanded = inventoryRuns.flatMap((run) => (
        Array.from({ length: run.end - run.start + 1 }, (_, index) => run.start + index)
      )).sort((first, second) => first - second);
      expect(expanded).toEqual(
        Array.from({ length: reference.moduleCount }, (_, index) => index + 1),
      );
    }

    expect(sql).toContain("pavilion_identifier || '-m' || lpad(module_number::text, 3, '0')");
    expect(sql).toContain("pavilion_identifier || ':module:' || lpad(module_number::text, 3, '0')");
    expect(sql).toContain('(select count(*) from _p135_cells) <> 484');
    expect(supersedingSql).toContain("'2026.4-p5.2', '2026.4-p5.1'");
    expect(supersedingSql).toContain("('b8', 'east-bottom-01'");
  });

  it('persiste P3 com quatro colunas pareadas de 32 módulos e sem tails', () => {
    const pairedRuns = parsedRuns.filter((run) => (
      run.pavilionIdentifier === 'B6' && run.id.includes('column')
    ));
    expect(pairedRuns.map((run) => [run.id, run.start, run.end])).toEqual([
      ['island-1-east-column', 48, 79],
      ['island-1-west-column', 80, 111],
      ['island-2-east-column', 112, 143],
      ['island-2-west-column', 144, 175],
    ]);
    pairedRuns.forEach((run) => {
      expect(run.end - run.start + 1).toBe(32);
      expect(run.depth).toBeCloseTo(pairedPavilion3Depth, 12);
      expect(run.moduleOrientation).toBe('east-west');
      expect(run.id).not.toMatch(/tail|extension|cap/);
    });
    expect(runSection).not.toMatch(/tail|extension|south-cap/i);
  });

  it('mantém o bbox e a âncora deslocada do módulo irregular P1-141 separados', () => {
    const cell = PAVILION1_COMMERCIAL_REFERENCE.cells[140];
    const special = sql.slice(
      sql.indexOf('-- b1-m141 é um único módulo em l'),
      sql.indexOf('create temp table _p135_b8_support_spaces'),
    );

    expect(cell.id).toBe('B1:module:141');
    expect(cell.centerX).toBeCloseTo(0.02 + (50.35 / 52.7) * 0.96, 12);
    expect(cell.centerZ).toBeCloseTo(0.02 + (2.25 / 22.84) * 0.96, 12);
    expect(cell.labelAnchor[0]).toBeCloseTo(cell.centerX, 12);
    expect(cell.labelAnchor[1]).toBeCloseTo(0.02 + (1.5 / 22.84) * 0.96, 12);
    expect(cell.labelAnchor[1]).not.toBeCloseTo(cell.centerZ, 12);
    expect(special).toContain('50.35 / metric_width) * usable as center_x');
    expect(special).toContain('2.25 / metric_depth) * usable as center_z');
    expect(special).toContain('1.50 / metric_depth) * usable as label_z');
    expect(special).toContain('dimensions.center_x, dimensions.center_z, dimensions.width, dimensions.depth');
    expect(special).toContain('jsonb_build_array(dimensions.center_x, dimensions.label_z)');
  });

  it('mantém B8 fora de segmentos mesmo diante de metadata legada da Exporural', () => {
    expect(sql).toContain(
      "('b8', 5, 'pavilhão 5 — veterinária, pequenos animais e rações', 'p5', 81, 0, 25.50, 43.50, 0.02, '2026.4-p5.1', 'croqui pavilhão 5 - fenasoja 2026.pdf', null)",
    );
    expect(backfill).toContain("case when segment_slug is null then '{}'::jsonb");
    expect(backfill).toContain("case when staged.pavilion_identifier = 'b8'");
    expect(backfill).toContain("- 'segmentid' - 'segmentcode' - 'segmentname'");
    expect(finalValidation).toContain(
      "'b8-m001', jsonb_build_object('block', 'r', 'areacode', 'exporural') ) is not null",
    );
    expect(finalValidation).toContain("'pavilionpublicidentifier', 'b8'");
    expect(finalValidation).toContain("'pavilionmodulekey', 'b8:module:081'");
    expect(finalValidation).toContain("'areacode', 'exporural'");
    expect(finalValidation).toContain(') is not null then');
  });

  it('preserva os quatro apoios do snapshot p5.1 e valida o frame oficial p5.2', () => {
    const supportTable = migration.slice(
      migration.indexOf('CREATE TEMP TABLE _p135_b8_support_spaces'),
      migration.indexOf('DO $$', migration.indexOf('CREATE TEMP TABLE _p135_b8_support_spaces')),
    );
    const supportPattern = /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/g;
    const supports = [...supportTable.matchAll(supportPattern)].map((match) => ({
      id: match[1],
      label: match[2],
      kind: match[3],
      left: Number(match[4]),
      top: Number(match[5]),
      width: Number(match[6]),
      depth: Number(match[7]),
    }));

    expect(supports).toHaveLength(4);
    supports.forEach((support) => {
      const expected = PAVILION5_COMMERCIAL_SUPPORT_SPACES.find(
        (candidate) => candidate.id === support.id,
      );
      expect(expected, support.id).toBeDefined();
      expect(support.label).toBe(expected!.label);
      expect(support.kind).toBe(expected!.kind);
      const historicalWidth = (support.width / 25.5) * 0.96;
      expect((support.left + support.width / 2) / 25.5).toBeCloseTo(expected!.centerX, 12);
      expect((support.top + support.depth / 2) / 43.5).toBeCloseTo(expected!.centerZ, 12);
      expect(support.width / 25.5).toBeCloseTo(expected!.width, 12);
      expect(support.depth / 43.5).toBeCloseTo(expected!.depth, 12);
      expect(historicalWidth).not.toBeCloseTo(expected!.width, 12);
    });
    expect(supportPersistence).toContain('0.02 + ((support.left_m + support.width_m / 2) / 25.5) * 0.96');
    expect(supersedingSql).toContain("'2026.4-p5.2', '2026.4-p5.1'");
    expect(supersedingSql).toContain("('b8', 'deposito-fenasoja'");
    expect(supportPersistence).toContain("'type', 'permanent-non-commercial'");
    expect(supportPersistence).toContain("jsonb_build_object('internalsupportspaces', support_payload.payload)");
    expect(supportPersistence).not.toContain('insert into public.map_entities');
    expect(supportPersistence).not.toContain('insert into public.commercial_lots');
    expect(supportPersistence).not.toContain('insert into public.lot_prices');
  });

  it('preserva lotes reutilizados e fotografa todas as relações comerciais e contratos', () => {
    expect(backfill).not.toMatch(/\bdelete\s+from\s+public\.commercial_lots\b/);
    expect(backfill).not.toMatch(/\bupdate\s+public\.commercial_lots\b/);
    expect(backfill).toContain("where staged.pavilion_identifier in ('b1', 'b8')");
    expect(backfill).toContain('pavilion_3_update_in_place_precondition_failed');
    expect(commercialSnapshot).toContain('to_jsonb(lot) as lot_state');

    const protectedRelations = [
      'lot_prices',
      'lot_reservations',
      'lot_negotiations',
      'lot_sales',
      'lot_contracts',
      'lot_contract_versions',
      'lot_status_history',
      'map_lot_lineage',
    ];
    protectedRelations.forEach((relation) => {
      expect(commercialSnapshot).toContain(`public.${relation}`);
      expect(finalValidation).toContain(`current.${
        relation === 'lot_prices' ? 'prices'
          : relation === 'lot_reservations' ? 'reservations'
            : relation === 'lot_negotiations' ? 'negotiations'
              : relation === 'lot_sales' ? 'sales'
                : relation === 'lot_contracts' ? 'contracts'
                  : relation === 'lot_contract_versions' ? 'contract_versions'
                    : relation === 'lot_status_history' ? 'status_history'
                      : 'lineage'
      } is distinct from previous.`);
    });
    expect(finalValidation).toContain('pavilions_1_3_5_commercial_state_changed');
  });
});
