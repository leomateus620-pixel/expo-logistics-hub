import type { MapEntity } from '../types';
import {
  createCommercialPavilionReferenceProjectionFrame,
  DEFAULT_COMMERCIAL_PAVILION_REFERENCE_PROJECTION,
  projectCommercialPavilionReferenceRect,
  type CommercialPavilionModuleSource,
  type CommercialPavilionInteriorPresentation,
  type CommercialPavilionReferenceCell,
  type CommercialPavilionReferenceCellShape,
  type CommercialPavilionReferenceCorridor,
  type CommercialPavilionReferenceModuleOrientation,
  type CommercialPavilionReferenceProjection,
  type CommercialPavilionReferenceProjectionFrame,
  type CommercialPavilionReferenceRect,
  type CommercialPavilionReferenceRun,
  type CommercialPavilionReferenceSequenceOrientation,
  type CommercialPavilionReferenceSupportSpace,
  type CommercialPavilionReferenceWallAccess,
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
import { PAVILION7_COMMERCIAL_REFERENCE } from '../data/pavilion7CommercialReference';
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
  /** Number printed in the title block when it conflicts with the drawn lots. */
  sourceDeclaredModuleCount?: number;
  /** Nominal sum derived from repeated official module dimensions. */
  nominalModuleAreaSquareMeters?: number;
  /** Aggregate exhibition area; never an individual-lot area. */
  exhibitionAreaSquareMeters?: number;
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
  interiorPresentation?: CommercialPavilionInteriorPresentation;
  zones: readonly CommercialPavilionModuleZone[];
  legendNumberRanges: readonly (readonly [start: number, end: number])[];
  corridors: readonly CommercialPavilionCorridor[];
  supportSpaces: readonly CommercialPavilionReferenceSupportSpace[];
  wallAccesses: readonly CommercialPavilionReferenceWallAccess[];
  cells: readonly CommercialPavilionModuleCell[];
  documentDiscrepancies: readonly string[];
  source: {
    document: string;
    page: 1;
    interpretation: 'normalized-module-grid' | 'official-reference-runs';
  };
}

const OFFICIAL_BOUNDARY: NormalizedCommercialPavilionRect = {
  centerX: 0.5,
  centerZ: 0.5,
  width: 0.96,
  depth: 0.96,
};

interface OfficialCommercialPavilionReference {
  publicIdentifier: CommercialPavilionPublicIdentifier;
  pavilionNumber: CommercialPavilionModuleStats['pavilionNumber'];
  category: string;
  moduleCount: number;
  totalAreaM2: number;
  modularAreaM2: number;
  sourceDeclaredModuleCount?: number;
  nominalGeometricAreaM2?: number;
  exhibitionAreaM2?: number;
  projection?: CommercialPavilionReferenceProjection;
  interiorPresentation?: CommercialPavilionInteriorPresentation;
  boundary?: CommercialPavilionReferenceRect;
  runs: readonly CommercialPavilionReferenceRun[];
  corridors: readonly CommercialPavilionReferenceCorridor[];
  supportSpaces?: readonly CommercialPavilionReferenceSupportSpace[];
  wallAccesses?: readonly CommercialPavilionReferenceWallAccess[];
  legendNumberRanges?: readonly (readonly [start: number, end: number])[];
  cells: readonly CommercialPavilionReferenceCell<CommercialPavilionPublicIdentifier>[];
  source: {
    document: string;
    discrepancy?: unknown;
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
      ...(reference.sourceDeclaredModuleCount !== undefined
        ? { sourceDeclaredModuleCount: reference.sourceDeclaredModuleCount }
        : {}),
      ...(reference.nominalGeometricAreaM2 !== undefined
        ? { nominalModuleAreaSquareMeters: reference.nominalGeometricAreaM2 }
        : {}),
      ...(reference.exhibitionAreaM2 !== undefined
        ? { exhibitionAreaSquareMeters: reference.exhibitionAreaM2 }
        : {}),
    },
    boundary: reference.boundary ?? OFFICIAL_BOUNDARY,
    projection: reference.projection ?? DEFAULT_COMMERCIAL_PAVILION_REFERENCE_PROJECTION,
    ...(reference.interiorPresentation
      ? { interiorPresentation: reference.interiorPresentation }
      : {}),
    zones,
    legendNumberRanges: reference.legendNumberRanges
      ?? zones.map((zone) => zone.numberRange),
    corridors: reference.corridors,
    supportSpaces: reference.supportSpaces ?? [],
    wallAccesses: reference.wallAccesses ?? [],
    cells: reference.cells,
    documentDiscrepancies: reference.sourceDeclaredModuleCount !== undefined
      && reference.sourceDeclaredModuleCount !== reference.moduleCount
      ? [
          `O croqui declara ${reference.sourceDeclaredModuleCount} módulos no quadro técnico, `
          + `mas desenha e numera ${reference.moduleCount} lotes independentes.`,
        ]
      : [],
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
            : buildOfficialCommercialPavilionPlan(
              PAVILION7_COMMERCIAL_REFERENCE,
              'agroindustry-six-runs',
              '#E653DE',
            ),
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

function rectEdges(rect: CommercialPavilionReferenceRect) {
  return {
    minX: rect.centerX - rect.width / 2,
    minZ: rect.centerZ - rect.depth / 2,
    maxX: rect.centerX + rect.width / 2,
    maxZ: rect.centerZ + rect.depth / 2,
  };
}

/**
 * Source-space envelope used only by the dedicated pavilion interior. The
 * official boundary remains authoritative, while traced support wings may
 * legitimately extend outside its normalized 0..1 range.
 */
export function deriveCommercialPavilionOfficialContentEnvelope(
  plan: Pick<
    CommercialPavilionModulePlan,
    'boundary' | 'cells' | 'corridors' | 'supportSpaces' | 'interiorPresentation'
  >,
): NormalizedCommercialPavilionRect | null {
  if (plan.interiorPresentation?.fit !== 'official-content') return null;

  const rectangles: CommercialPavilionReferenceRect[] = [
    plan.boundary,
    ...plan.cells,
    ...plan.cells.flatMap((cell) => cell.shape?.renderParts ?? []),
    ...plan.corridors,
    ...plan.supportSpaces,
  ];
  const points = plan.cells.flatMap((cell) => cell.shape?.footprint ?? []);
  const initial = rectEdges(rectangles[0]);
  const bounds = rectangles.slice(1).reduce((current, rect) => {
    const edges = rectEdges(rect);
    return {
      minX: Math.min(current.minX, edges.minX),
      minZ: Math.min(current.minZ, edges.minZ),
      maxX: Math.max(current.maxX, edges.maxX),
      maxZ: Math.max(current.maxZ, edges.maxZ),
    };
  }, initial);
  points.forEach(([x, z]) => {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minZ = Math.min(bounds.minZ, z);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxZ = Math.max(bounds.maxZ, z);
  });

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) {
    throw new Error('O envelope oficial do interior do pavilhao e invalido.');
  }
  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerZ: (bounds.minZ + bounds.maxZ) / 2,
    width,
    depth,
  };
}

/** Width/depth ratio after metric scale and the plan's orientation transform. */
export function commercialPavilionOfficialContentAspect(
  plan: Pick<
    CommercialPavilionModulePlan,
    'boundary' | 'cells' | 'corridors' | 'supportSpaces' | 'projection' | 'interiorPresentation'
  >,
): number | null {
  const envelope = deriveCommercialPavilionOfficialContentEnvelope(plan);
  if (!envelope) return null;
  const { metricWidthM, metricDepthM, coordinateTransform, fit } = plan.projection;
  if (
    fit !== 'metric-contain'
    || !metricWidthM
    || !metricDepthM
    || !Number.isFinite(metricWidthM)
    || !Number.isFinite(metricDepthM)
    || metricWidthM <= 0
    || metricDepthM <= 0
  ) {
    throw new Error('O enquadramento official-content exige uma projecao metric-contain.');
  }
  const sourceWidthM = envelope.width * metricWidthM;
  const sourceDepthM = envelope.depth * metricDepthM;
  return coordinateTransform === 'quarter-turn-clockwise'
    ? sourceDepthM / sourceWidthM
    : sourceWidthM / sourceDepthM;
}

export function projectCommercialPavilionOfficialContentEnvelope(
  plan: Pick<
    CommercialPavilionModulePlan,
    'boundary' | 'cells' | 'corridors' | 'supportSpaces' | 'projection' | 'interiorPresentation'
  >,
  footprint: { width: number; depth: number },
): CommercialPavilionLocalRect | null {
  const envelope = deriveCommercialPavilionOfficialContentEnvelope(plan);
  if (!envelope) return null;
  return projectCommercialPavilionReferenceRect(
    envelope,
    createCommercialPavilionReferenceProjectionFrame(plan.projection, footprint),
  );
}
