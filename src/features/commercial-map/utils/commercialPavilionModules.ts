import type { MapEntity } from '../types';
import {
  createCommercialPavilionReferenceProjectionFrame,
  DEFAULT_COMMERCIAL_PAVILION_REFERENCE_PROJECTION,
  projectCommercialPavilionReferenceRect,
  type CommercialPavilionModuleSource,
  type CommercialPavilionReferenceCell,
  type CommercialPavilionReferenceCellShape,
  type CommercialPavilionReferenceCorridor,
  type CommercialPavilionReferenceModuleOrientation,
  type CommercialPavilionReferenceProjection,
  type CommercialPavilionReferenceProjectionFrame,
  type CommercialPavilionReferenceRun,
  type CommercialPavilionReferenceSequenceOrientation,
  type CommercialPavilionReferenceSupportSpace,
} from '../data/commercialPavilionReference';
import { PAVILION1_COMMERCIAL_REFERENCE } from '../data/pavilion1CommercialReference';
import { PAVILION12_COMMERCIAL_REFERENCE } from '../data/pavilion12CommercialReference';
import { PAVILION14_COMMERCIAL_REFERENCE } from '../data/pavilion14CommercialReference';
import {
  PAVILION3_COMMERCIAL_REFERENCE,
} from '../data/pavilion3CommercialReference';
import { PAVILION5_COMMERCIAL_REFERENCE } from '../data/pavilion5CommercialReference';
import { PAVILION8_COMMERCIAL_REFERENCE } from '../data/pavilion8CommercialReference';
import { PAVILION13_COMMERCIAL_REFERENCE } from '../data/pavilion13CommercialReference';
import {
  COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS,
  type CommercialPavilionPublicIdentifier,
} from './commercialPavilions';

export type CommercialPavilionModuleTopology =
  | 'perimeter-central-island'
  | 'parallel-double-island'
  | 'stacked-central-islands'
  | 'side-runs-central-island'
  | 'side-runs-market-island'
  | 'side-runs-twin-islands'
  | 'horticulture-u-gallery'
  | 'agroindustry-six-runs';

export type CommercialPavilionModuleZoneRole =
  | 'perimeter'
  | 'island'
  | 'gallery'
  | 'market-run';

export type CommercialPavilionModuleNumbering =
  | 'row-major'
  | 'row-snake'
  | 'column-major'
  | 'column-snake';

export type CommercialPavilionCorridorKind =
  | 'main'
  | 'cross'
  | 'perimeter'
  | 'atrium'
  | 'access';

/** Pavilion-local X/Z rectangle normalized to the official footprint. */
export interface NormalizedCommercialPavilionRect {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
}

/** Pavilion-local X/Z rectangle expressed in the model's world-unit scale. */
export interface CommercialPavilionLocalRect {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
}

export interface CommercialPavilionModuleStats {
  pavilionNumber: 1 | 3 | 5 | 7 | 8 | 12 | 13 | 14;
  category: string;
  moduleCount: number;
  totalAreaSquareMeters: number;
  moduleAreaSquareMeters: number;
}

export interface CommercialPavilionModuleCell
  extends NormalizedCommercialPavilionRect {
  id: string;
  number: number;
  label: string;
  zoneId: string;
  pavilionId?: CommercialPavilionPublicIdentifier;
  lotNumber?: string;
  orientation?: CommercialPavilionReferenceModuleOrientation;
  sequenceOrientation?: CommercialPavilionReferenceSequenceOrientation;
  labelAnchor?: readonly [x: number, z: number];
  type?: 'commercial-lot';
  areaM2?: number | null;
  sortOrder?: number;
  group?: string | null;
  cluster?: string;
  shape?: CommercialPavilionReferenceCellShape;
  source?: CommercialPavilionModuleSource;
}

export interface CommercialPavilionModuleZone {
  id: string;
  label: string;
  role: CommercialPavilionModuleZoneRole;
  bounds: NormalizedCommercialPavilionRect;
  rows: number;
  columns: number;
  numbering: CommercialPavilionModuleNumbering;
  moduleCount: number;
  numberRange: readonly [start: number, end: number];
}

export interface CommercialPavilionCorridor
  extends NormalizedCommercialPavilionRect {
  id: string;
  kind: CommercialPavilionCorridorKind;
  label: string;
}

export interface CommercialPavilionModulePlan {
  publicIdentifier: CommercialPavilionPublicIdentifier;
  topology: CommercialPavilionModuleTopology;
  colorCue: string;
  stats: CommercialPavilionModuleStats;
  boundary: NormalizedCommercialPavilionRect;
  projection: CommercialPavilionReferenceProjection;
  zones: readonly CommercialPavilionModuleZone[];
  legendNumberRanges: readonly (readonly [start: number, end: number])[];
  corridors: readonly CommercialPavilionCorridor[];
  supportSpaces: readonly CommercialPavilionReferenceSupportSpace[];
  cells: readonly CommercialPavilionModuleCell[];
  source: {
    document: string;
    page: 1;
    interpretation: 'normalized-module-grid' | 'official-reference-runs';
  };
}

interface CommercialPavilionModuleZoneSeed {
  id: string;
  label: string;
  role: CommercialPavilionModuleZoneRole;
  bounds: NormalizedCommercialPavilionRect;
  rows: number;
  columns: number;
  numbering: CommercialPavilionModuleNumbering;
  flipX?: boolean;
  flipZ?: boolean;
}

interface CommercialPavilionModulePlanSeed {
  publicIdentifier: CommercialPavilionPublicIdentifier;
  topology: CommercialPavilionModuleTopology;
  colorCue: string;
  stats: CommercialPavilionModuleStats;
  boundary: NormalizedCommercialPavilionRect;
  zones: readonly CommercialPavilionModuleZoneSeed[];
  corridors: readonly CommercialPavilionCorridor[];
}

const OFFICIAL_BOUNDARY: NormalizedCommercialPavilionRect = {
  centerX: 0.5,
  centerZ: 0.5,
  width: 0.96,
  depth: 0.96,
};

function rect(
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
): NormalizedCommercialPavilionRect {
  return { centerX, centerZ, width, depth };
}

function corridor(
  id: string,
  label: string,
  kind: CommercialPavilionCorridorKind,
  bounds: NormalizedCommercialPavilionRect,
): CommercialPavilionCorridor {
  return { id, label, kind, ...bounds };
}

function zone(
  id: string,
  label: string,
  role: CommercialPavilionModuleZoneRole,
  bounds: NormalizedCommercialPavilionRect,
  rows: number,
  columns: number,
  numbering: CommercialPavilionModuleNumbering = 'row-snake',
  orientation: { flipX?: boolean; flipZ?: boolean } = {},
): CommercialPavilionModuleZoneSeed {
  return { id, label, role, bounds, rows, columns, numbering, ...orientation };
}

function positionForSequence(
  sequence: number,
  rows: number,
  columns: number,
  numbering: CommercialPavilionModuleNumbering,
): { row: number; column: number } {
  if (numbering === 'column-major' || numbering === 'column-snake') {
    const column = Math.floor(sequence / rows);
    const positionInColumn = sequence % rows;
    const row = numbering === 'column-snake' && column % 2 === 1
      ? rows - positionInColumn - 1
      : positionInColumn;
    return { row, column };
  }

  const row = Math.floor(sequence / columns);
  const positionInRow = sequence % columns;
  const column = numbering === 'row-snake' && row % 2 === 1
    ? columns - positionInRow - 1
    : positionInRow;
  return { row, column };
}

function expandZone(
  publicIdentifier: CommercialPavilionPublicIdentifier,
  seed: CommercialPavilionModuleZoneSeed,
  startNumber: number,
): {
  zone: CommercialPavilionModuleZone;
  cells: CommercialPavilionModuleCell[];
} {
  const moduleCount = seed.rows * seed.columns;
  const endNumber = startNumber + moduleCount - 1;
  const maximumGapX = seed.bounds.width / Math.max(1, seed.columns * 4);
  const maximumGapZ = seed.bounds.depth / Math.max(1, seed.rows * 4);
  const gapX = Math.min(0.004, maximumGapX);
  const gapZ = Math.min(0.004, maximumGapZ);
  const cellWidth = (
    seed.bounds.width - gapX * Math.max(0, seed.columns - 1)
  ) / seed.columns;
  const cellDepth = (
    seed.bounds.depth - gapZ * Math.max(0, seed.rows - 1)
  ) / seed.rows;
  const left = seed.bounds.centerX - seed.bounds.width / 2;
  const top = seed.bounds.centerZ - seed.bounds.depth / 2;

  const cells = Array.from({ length: moduleCount }, (_, sequence) => {
    const number = startNumber + sequence;
    const position = positionForSequence(
      sequence,
      seed.rows,
      seed.columns,
      seed.numbering,
    );
    const row = seed.flipZ ? seed.rows - position.row - 1 : position.row;
    const column = seed.flipX ? seed.columns - position.column - 1 : position.column;
    return {
      id: `${publicIdentifier}:module:${String(number).padStart(3, '0')}`,
      number,
      label: String(number).padStart(2, '0'),
      zoneId: seed.id,
      centerX: left + column * (cellWidth + gapX) + cellWidth / 2,
      centerZ: top + row * (cellDepth + gapZ) + cellDepth / 2,
      width: cellWidth,
      depth: cellDepth,
    } satisfies CommercialPavilionModuleCell;
  });

  return {
    zone: {
      id: seed.id,
      label: seed.label,
      role: seed.role,
      bounds: seed.bounds,
      rows: seed.rows,
      columns: seed.columns,
      numbering: seed.numbering,
      moduleCount,
      numberRange: [startNumber, endNumber],
    },
    cells,
  };
}

function buildPlan(seed: CommercialPavilionModulePlanSeed): CommercialPavilionModulePlan {
  let nextNumber = 1;
  const zones: CommercialPavilionModuleZone[] = [];
  const cells: CommercialPavilionModuleCell[] = [];

  seed.zones.forEach((zoneSeed) => {
    const expanded = expandZone(seed.publicIdentifier, zoneSeed, nextNumber);
    zones.push(expanded.zone);
    cells.push(...expanded.cells);
    nextNumber += expanded.cells.length;
  });

  if (cells.length !== seed.stats.moduleCount) {
    throw new Error(
      `${seed.publicIdentifier}: plano visual gerou ${cells.length} módulos; `
      + `a referência oficial exige ${seed.stats.moduleCount}.`,
    );
  }

  return {
    ...seed,
    projection: DEFAULT_COMMERCIAL_PAVILION_REFERENCE_PROJECTION,
    zones,
    legendNumberRanges: zones.map((zone) => zone.numberRange),
    supportSpaces: [],
    cells,
    source: {
      document: 'Fenasoja - Planta Pavilhões Internos.pdf',
      page: 1,
      interpretation: 'normalized-module-grid',
    },
  };
}

type GeneratedCommercialPavilionPublicIdentifier = Exclude<
  CommercialPavilionPublicIdentifier,
  'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' | 'B8'
>;

const PLAN_SEEDS: Readonly<
  Record<GeneratedCommercialPavilionPublicIdentifier, CommercialPavilionModulePlanSeed>
> = {
  B10: {
    publicIdentifier: 'B10',
    topology: 'agroindustry-six-runs',
    colorCue: '#E653DE',
    stats: {
      pavilionNumber: 7,
      category: 'Agricultura Familiar / Agroindústrias',
      moduleCount: 57,
      totalAreaSquareMeters: 917,
      moduleAreaSquareMeters: 427.5,
    },
    boundary: OFFICIAL_BOUNDARY,
    zones: [
      zone('south-right', 'Ala sul direita · 01–08', 'market-run', rect(0.76, 0.88, 0.34, 0.12), 1, 8, 'row-major'),
      zone('lower-right-island', 'Ilha inferior direita · 09–19', 'island', rect(0.7, 0.64, 0.42, 0.13), 1, 11, 'row-major'),
      zone('upper-island', 'Ilha superior · 20–33', 'island', rect(0.5, 0.37, 0.68, 0.13), 1, 14, 'row-major', { flipX: true }),
      zone('north-run', 'Ala norte · 34–47', 'perimeter', rect(0.5, 0.12, 0.68, 0.12), 1, 14, 'row-major'),
      zone('lower-left-island', 'Ilha inferior esquerda · 48–50', 'island', rect(0.36, 0.64, 0.14, 0.13), 1, 3, 'row-major'),
      zone('south-left', 'Ala sul esquerda · 51–57', 'market-run', rect(0.22, 0.88, 0.28, 0.12), 1, 7, 'row-major'),
    ],
    corridors: [
      corridor('north-market-aisle', 'Corredor norte', 'main', rect(0.5, 0.245, 0.76, 0.09)),
      corridor('central-market-aisle', 'Corredor central', 'main', rect(0.5, 0.505, 0.8, 0.1)),
      corridor('south-market-aisle', 'Corredor sul', 'main', rect(0.5, 0.76, 0.8, 0.08)),
      corridor('market-access', 'Acesso transversal', 'cross', rect(0.46, 0.76, 0.055, 0.36)),
    ],
  },
};

interface OfficialCommercialPavilionReference {
  publicIdentifier: CommercialPavilionPublicIdentifier;
  pavilionNumber: CommercialPavilionModuleStats['pavilionNumber'];
  category: string;
  moduleCount: number;
  totalAreaM2: number;
  modularAreaM2: number;
  projection?: CommercialPavilionReferenceProjection;
  boundary?: CommercialPavilionReferenceRect;
  runs: readonly CommercialPavilionReferenceRun[];
  corridors: readonly CommercialPavilionReferenceCorridor[];
  supportSpaces?: readonly CommercialPavilionReferenceSupportSpace[];
  legendNumberRanges?: readonly (readonly [start: number, end: number])[];
  cells: readonly CommercialPavilionReferenceCell<CommercialPavilionPublicIdentifier>[];
  source: {
    document: string;
  };
}

function buildOfficialCommercialPavilionPlan(
  reference: OfficialCommercialPavilionReference,
  topology: CommercialPavilionModuleTopology,
  colorCue: string,
): CommercialPavilionModulePlan {
  const zones = reference.runs.map((run) => {
    const moduleCount = run.numberRange[1] - run.numberRange[0] + 1;
    const horizontalSequence = run.sequenceOrientation === 'x-increasing'
      || run.sequenceOrientation === 'x-decreasing';
    return {
      id: run.id,
      label: run.label,
      role: run.role,
      bounds: run.bounds,
      rows: horizontalSequence ? 1 : moduleCount,
      columns: horizontalSequence ? moduleCount : 1,
      numbering: horizontalSequence ? 'row-major' : 'column-major',
      moduleCount,
      numberRange: run.numberRange,
    } satisfies CommercialPavilionModuleZone;
  });

  return {
    publicIdentifier: reference.publicIdentifier,
    topology,
    colorCue,
    stats: {
      pavilionNumber: reference.pavilionNumber,
      category: reference.category,
      moduleCount: reference.moduleCount,
      totalAreaSquareMeters: reference.totalAreaM2,
      // Annex values describe the complete modular inventory, never one cell.
      moduleAreaSquareMeters: reference.modularAreaM2,
    },
    boundary: reference.boundary ?? OFFICIAL_BOUNDARY,
    projection: reference.projection ?? DEFAULT_COMMERCIAL_PAVILION_REFERENCE_PROJECTION,
    zones,
    legendNumberRanges: reference.legendNumberRanges
      ?? zones.map((zone) => zone.numberRange),
    corridors: reference.corridors,
    supportSpaces: reference.supportSpaces ?? [],
    cells: reference.cells,
    source: {
      document: reference.source.document,
      page: 1,
      interpretation: 'official-reference-runs',
    },
  };
}

export const COMMERCIAL_PAVILION_MODULE_PLANS = Object.fromEntries(
  COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS.map((publicIdentifier) => [
    publicIdentifier,
    publicIdentifier === 'B1'
      ? buildOfficialCommercialPavilionPlan(
        PAVILION1_COMMERCIAL_REFERENCE,
        'perimeter-central-island',
        '#D97706',
      )
      : publicIdentifier === 'B2'
      ? buildOfficialCommercialPavilionPlan(
        PAVILION14_COMMERCIAL_REFERENCE,
        'parallel-double-island',
        '#1683E7',
      )
      : publicIdentifier === 'B3'
        ? buildOfficialCommercialPavilionPlan(
          PAVILION12_COMMERCIAL_REFERENCE,
          'stacked-central-islands',
          '#18DAB0',
        )
        : publicIdentifier === 'B4'
          ? buildOfficialCommercialPavilionPlan(
            PAVILION8_COMMERCIAL_REFERENCE,
            'side-runs-central-island',
            '#E1B83A',
          )
          : publicIdentifier === 'B5'
            ? buildOfficialCommercialPavilionPlan(
              PAVILION13_COMMERCIAL_REFERENCE,
              'side-runs-market-island',
              '#D6A000',
            )
        : publicIdentifier === 'B6'
          ? buildOfficialCommercialPavilionPlan(
            PAVILION3_COMMERCIAL_REFERENCE,
            'side-runs-twin-islands',
            '#13CFAC',
          )
          : publicIdentifier === 'B8'
            ? buildOfficialCommercialPavilionPlan(
              PAVILION5_COMMERCIAL_REFERENCE,
              'horticulture-u-gallery',
              '#1F9BF0',
            )
          : buildPlan(PLAN_SEEDS[publicIdentifier]),
  ]),
) as Readonly<
  Record<CommercialPavilionPublicIdentifier, CommercialPavilionModulePlan>
>;

export function resolveCommercialPavilionModulePlan(
  entity: Pick<MapEntity, 'publicIdentifier'>,
): CommercialPavilionModulePlan | null {
  const publicIdentifier = entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR');
  if (!COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS.includes(
    publicIdentifier as CommercialPavilionPublicIdentifier,
  )) {
    return null;
  }
  return COMMERCIAL_PAVILION_MODULE_PLANS[
    publicIdentifier as CommercialPavilionPublicIdentifier
  ];
}

export function projectCommercialPavilionModuleRect(
  normalized: NormalizedCommercialPavilionRect,
  target: { width: number; depth: number } | CommercialPavilionReferenceProjectionFrame,
): CommercialPavilionLocalRect {
  const frame = 'coordinateTransform' in target
    ? target
    : createCommercialPavilionReferenceProjectionFrame(
        DEFAULT_COMMERCIAL_PAVILION_REFERENCE_PROJECTION,
        target,
      );
  return projectCommercialPavilionReferenceRect(normalized, frame);
}

export function createCommercialPavilionModuleProjectionFrame(
  plan: Pick<CommercialPavilionModulePlan, 'projection'>,
  footprint: { width: number; depth: number },
): CommercialPavilionReferenceProjectionFrame {
  return createCommercialPavilionReferenceProjectionFrame(plan.projection, footprint);
}
