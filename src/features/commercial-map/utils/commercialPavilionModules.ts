import type { MapEntity } from '../types';
import {
  PAVILION3_COMMERCIAL_REFERENCE,
  type Pavilion3CommercialModuleOrientation,
  type Pavilion3CommercialModuleSource,
  type Pavilion3CommercialSequenceOrientation,
} from '../data/pavilion3CommercialReference';
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
  | 'atrium';

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
  orientation?: Pavilion3CommercialModuleOrientation;
  sequenceOrientation?: Pavilion3CommercialSequenceOrientation;
  labelAnchor?: readonly [x: number, z: number];
  type?: 'commercial-lot';
  areaM2?: number | null;
  sortOrder?: number;
  group?: string | null;
  cluster?: string;
  source?: Pavilion3CommercialModuleSource;
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
  zones: readonly CommercialPavilionModuleZone[];
  corridors: readonly CommercialPavilionCorridor[];
  cells: readonly CommercialPavilionModuleCell[];
  source: {
    document: 'Fenasoja - Planta Pavilhões Internos.pdf';
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
    zones,
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
  'B6'
>;

const PLAN_SEEDS: Readonly<
  Record<GeneratedCommercialPavilionPublicIdentifier, CommercialPavilionModulePlanSeed>
> = {
  B1: {
    publicIdentifier: 'B1',
    topology: 'perimeter-central-island',
    colorCue: '#D97706',
    stats: {
      pavilionNumber: 1,
      category: 'Comércio e Serviços',
      moduleCount: 189,
      totalAreaSquareMeters: 1201.5,
      moduleAreaSquareMeters: 587,
    },
    boundary: OFFICIAL_BOUNDARY,
    zones: [
      zone('north-run', 'Ala norte · 01–61', 'perimeter', rect(0.52, 0.1, 0.84, 0.12), 1, 61, 'row-major', { flipX: true }),
      zone('west-return', 'Retorno oeste · 62–64', 'perimeter', rect(0.08, 0.25, 0.08, 0.2), 3, 1, 'column-major'),
      zone('central-island', 'Ilha central · 65–140', 'island', rect(0.54, 0.48, 0.68, 0.2), 2, 38),
      zone('south-run', 'Ala sul · 141–189', 'perimeter', rect(0.5, 0.88, 0.84, 0.12), 1, 49, 'row-major'),
    ],
    corridors: [
      corridor('north-crossing', 'Travessia norte', 'cross', rect(0.53, 0.27, 0.82, 0.1)),
      corridor('central-loop', 'Circulação da ilha', 'main', rect(0.53, 0.66, 0.82, 0.16)),
      corridor('south-approach', 'Acesso sul', 'cross', rect(0.5, 0.77, 0.84, 0.06)),
    ],
  },
  B2: {
    publicIdentifier: 'B2',
    topology: 'parallel-double-island',
    colorCue: '#1683E7',
    stats: {
      pavilionNumber: 14,
      category: 'Comércio e Artesanato',
      moduleCount: 186,
      totalAreaSquareMeters: 1155,
      moduleAreaSquareMeters: 616,
    },
    boundary: OFFICIAL_BOUNDARY,
    zones: [
      zone('south-run', 'Ala sul · 01–35', 'perimeter', rect(0.5, 0.9, 0.88, 0.1), 1, 35, 'row-major'),
      zone('south-island', 'Ilha sul · 36–93', 'island', rect(0.5, 0.65, 0.72, 0.16), 2, 29, 'row-snake', { flipX: true, flipZ: true }),
      zone('north-island', 'Ilha norte · 94–151', 'island', rect(0.5, 0.37, 0.72, 0.16), 2, 29, 'row-snake', { flipX: true, flipZ: true }),
      zone('north-run', 'Ala norte · 152–186', 'perimeter', rect(0.5, 0.1, 0.88, 0.1), 1, 35, 'row-major', { flipX: true }),
    ],
    corridors: [
      corridor('north-aisle', 'Corredor norte', 'main', rect(0.5, 0.235, 0.88, 0.11)),
      corridor('central-aisle', 'Corredor central', 'main', rect(0.5, 0.51, 0.88, 0.1)),
      corridor('south-aisle', 'Corredor sul', 'main', rect(0.5, 0.785, 0.88, 0.11)),
    ],
  },
  B3: {
    publicIdentifier: 'B3',
    topology: 'stacked-central-islands',
    colorCue: '#18DAB0',
    stats: {
      pavilionNumber: 12,
      category: 'Indústria, Comércio e Serviços',
      moduleCount: 257,
      totalAreaSquareMeters: 1650,
      moduleAreaSquareMeters: 771,
    },
    boundary: OFFICIAL_BOUNDARY,
    zones: [
      zone('north-right', 'Ala norte direita · 01–22', 'perimeter', rect(0.73, 0.1, 0.42, 0.11), 1, 22, 'row-major', { flipX: true }),
      zone('north-left', 'Ala norte esquerda · 23–40', 'perimeter', rect(0.25, 0.1, 0.32, 0.11), 1, 18, 'row-major', { flipX: true }),
      zone('central-island', 'Ilha central · 41–124', 'island', rect(0.5, 0.38, 0.84, 0.17), 2, 42),
      zone('lower-island', 'Ilha inferior · 125–208', 'island', rect(0.5, 0.64, 0.84, 0.17), 2, 42),
      zone('south-run', 'Ala sul · 209–257', 'perimeter', rect(0.5, 0.9, 0.88, 0.11), 1, 49, 'row-major'),
    ],
    corridors: [
      corridor('north-entrance', 'Acesso norte', 'cross', rect(0.5, 0.205, 0.12, 0.1)),
      corridor('upper-aisle', 'Corredor superior', 'main', rect(0.5, 0.26, 0.88, 0.07)),
      corridor('island-aisle', 'Corredor entre ilhas', 'main', rect(0.5, 0.51, 0.88, 0.09)),
      corridor('south-aisle', 'Corredor sul', 'main', rect(0.5, 0.78, 0.88, 0.09)),
    ],
  },
  B4: {
    publicIdentifier: 'B4',
    topology: 'side-runs-central-island',
    colorCue: '#F2C94C',
    stats: {
      pavilionNumber: 8,
      category: 'Indústria, Comércio e Serviços',
      moduleCount: 114,
      totalAreaSquareMeters: 760,
      moduleAreaSquareMeters: 434,
    },
    boundary: OFFICIAL_BOUNDARY,
    zones: [
      zone('west-run', 'Ala oeste · 01–20', 'perimeter', rect(0.08, 0.43, 0.09, 0.7), 20, 1, 'column-major'),
      zone('southwest-run', 'Ala sudoeste/sul · 21–37', 'perimeter', rect(0.24, 0.89, 0.28, 0.11), 1, 17, 'row-major'),
      zone('central-island', 'Ilha central · 38–89', 'island', rect(0.53, 0.49, 0.56, 0.48), 4, 13),
      zone('east-run', 'Ala leste · 90–114', 'perimeter', rect(0.92, 0.5, 0.09, 0.78), 25, 1, 'column-major', { flipZ: true }),
    ],
    corridors: [
      corridor('west-aisle', 'Corredor oeste', 'main', rect(0.18, 0.46, 0.08, 0.7)),
      corridor('east-aisle', 'Corredor leste', 'main', rect(0.8425, 0.5, 0.055, 0.78)),
      corridor('north-crossing', 'Travessia norte', 'cross', rect(0.53, 0.18, 0.56, 0.08)),
      corridor('south-crossing', 'Travessia sul', 'cross', rect(0.565, 0.78, 0.61, 0.08)),
    ],
  },
  B5: {
    publicIdentifier: 'B5',
    topology: 'side-runs-market-island',
    colorCue: '#D6A000',
    stats: {
      pavilionNumber: 13,
      category: 'Comércio',
      moduleCount: 103,
      totalAreaSquareMeters: 709,
      moduleAreaSquareMeters: 351,
    },
    boundary: OFFICIAL_BOUNDARY,
    zones: [
      zone('west-run', 'Ala oeste · 01–26', 'perimeter', rect(0.08, 0.48, 0.09, 0.8), 26, 1, 'column-major'),
      zone('south-return', 'Retorno sul · 27–29', 'perimeter', rect(0.2, 0.91, 0.18, 0.1), 1, 3, 'row-major'),
      zone('market-island', 'Ilha comercial · 30–77', 'island', rect(0.5, 0.5, 0.56, 0.68), 6, 8),
      zone('east-run', 'Ala leste · 78–103', 'perimeter', rect(0.92, 0.48, 0.09, 0.8), 26, 1, 'column-major'),
    ],
    corridors: [
      corridor('west-spine', 'Eixo oeste', 'main', rect(0.17, 0.45, 0.07, 0.76)),
      corridor('east-spine', 'Eixo leste', 'main', rect(0.84, 0.47, 0.07, 0.8)),
      corridor('north-crossing', 'Travessia norte', 'cross', rect(0.5, 0.12, 0.56, 0.08)),
      corridor('south-crossing', 'Travessia sul', 'cross', rect(0.58, 0.88, 0.56, 0.06)),
    ],
  },
  B8: {
    publicIdentifier: 'B8',
    topology: 'horticulture-u-gallery',
    colorCue: '#1F9BF0',
    stats: {
      pavilionNumber: 5,
      category: 'Floriculturas',
      moduleCount: 81,
      totalAreaSquareMeters: 841.5,
      moduleAreaSquareMeters: 244.5,
    },
    boundary: OFFICIAL_BOUNDARY,
    zones: [
      zone('north-greenhouse', 'Ala norte · 01–43', 'gallery', rect(0.5, 0.12, 0.88, 0.15), 1, 43, 'row-major', { flipX: true }),
      zone('southwest-greenhouse', 'Ala sudoeste · 44–62', 'gallery', rect(0.27, 0.82, 0.4, 0.15), 1, 19, 'row-major'),
      zone('southeast-greenhouse', 'Ala sudeste · 63–81', 'gallery', rect(0.73, 0.82, 0.4, 0.15), 1, 19, 'row-major'),
    ],
    corridors: [
      corridor('garden-court', 'Praça de floricultura', 'atrium', rect(0.5, 0.48, 0.76, 0.5)),
      corridor('garden-axis', 'Eixo ajardinado', 'main', rect(0.5, 0.61, 0.055, 0.35)),
      corridor('garden-crossing', 'Travessia norte', 'cross', rect(0.5, 0.24, 0.82, 0.08)),
      corridor('south-entrance', 'Acesso sul', 'cross', rect(0.5, 0.82, 0.05, 0.15)),
    ],
  },
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

function buildPavilion3CommercialPlan(): CommercialPavilionModulePlan {
  const zones = PAVILION3_COMMERCIAL_REFERENCE.runs.map((run) => {
    const moduleCount = run.numberRange[1] - run.numberRange[0] + 1;
    const horizontalSequence = run.sequenceOrientation === 'x-increasing';
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
    publicIdentifier: 'B6',
    topology: 'side-runs-twin-islands',
    colorCue: '#13CFAC',
    stats: {
      pavilionNumber: PAVILION3_COMMERCIAL_REFERENCE.pavilionNumber,
      category: PAVILION3_COMMERCIAL_REFERENCE.category,
      moduleCount: PAVILION3_COMMERCIAL_REFERENCE.moduleCount,
      totalAreaSquareMeters: PAVILION3_COMMERCIAL_REFERENCE.totalAreaM2,
      // The annex defines 663 m² for the full modular inventory, not per cell.
      moduleAreaSquareMeters: PAVILION3_COMMERCIAL_REFERENCE.modularAreaM2,
    },
    boundary: OFFICIAL_BOUNDARY,
    zones,
    corridors: PAVILION3_COMMERCIAL_REFERENCE.corridors,
    cells: PAVILION3_COMMERCIAL_REFERENCE.cells,
    source: {
      document: 'Fenasoja - Planta Pavilhões Internos.pdf',
      page: 1,
      interpretation: 'official-reference-runs',
    },
  };
}

export const COMMERCIAL_PAVILION_MODULE_PLANS = Object.fromEntries(
  COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS.map((publicIdentifier) => [
    publicIdentifier,
    publicIdentifier === 'B6'
      ? buildPavilion3CommercialPlan()
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
  footprint: { width: number; depth: number },
): CommercialPavilionLocalRect {
  return {
    centerX: (normalized.centerX - 0.5) * footprint.width,
    centerZ: (normalized.centerZ - 0.5) * footprint.depth,
    width: normalized.width * footprint.width,
    depth: normalized.depth * footprint.depth,
  };
}
