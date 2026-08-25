import {
  buildCommercialPavilionReferenceCells,
  commercialPavilionReferenceRect as rect,
  type CommercialPavilionModuleSource,
  type CommercialPavilionReferenceCell,
  type CommercialPavilionReferenceCorridor,
  type CommercialPavilionReferenceModuleOrientation,
  type CommercialPavilionReferenceRect,
  type CommercialPavilionReferenceRun,
  type CommercialPavilionReferenceSequenceOrientation,
  type CommercialPavilionReferenceSourceDiscrepancy,
} from './commercialPavilionReference';

export type Pavilion3CommercialModuleOrientation =
  CommercialPavilionReferenceModuleOrientation;
export type Pavilion3CommercialSequenceOrientation =
  CommercialPavilionReferenceSequenceOrientation;
export type Pavilion3CommercialModuleSourceDiscrepancy =
  CommercialPavilionReferenceSourceDiscrepancy;
export type Pavilion3CommercialReferenceRect = CommercialPavilionReferenceRect;
export type Pavilion3CommercialReferenceRun = CommercialPavilionReferenceRun;
export type Pavilion3CommercialReferenceCorridor = CommercialPavilionReferenceCorridor;
export type Pavilion3CommercialModuleSource = CommercialPavilionModuleSource;
export type Pavilion3CommercialReferenceCell = CommercialPavilionReferenceCell<'B6'>;

/** Equal normalized clearance between adjacent modules in every official run. */
export const PAVILION3_COMMERCIAL_MODULE_GAP = 0.0015;

// The official plan shows two equal 32-module paired columns. Preserve the
// established 28-cell modular pitch and extend the run mathematically, instead
// of adding an eight-module tail below either island.
const STANDARD_CELL_DEPTH = (
  0.47 - PAVILION3_COMMERCIAL_MODULE_GAP * 27
) / 28;
const PAIRED_COLUMN_DEPTH = (
  STANDARD_CELL_DEPTH * 32 + PAVILION3_COMMERCIAL_MODULE_GAP * 31
);
const PAIRED_COLUMN_CENTER_Z = 0.2 + PAIRED_COLUMN_DEPTH / 2;

export const PAVILION3_COMMERCIAL_REFERENCE_RUNS = [
  {
    id: 'perimeter-01-19',
    label: 'Módulos 01–19',
    role: 'perimeter',
    bounds: rect(0.065, 0.26, 0.075, 0.36),
    numberRange: [1, 19],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'perimeter-west',
    cluster: 'perimeter-01-19',
  },
  {
    id: 'perimeter-20-36',
    label: 'Módulos 20–36',
    role: 'perimeter',
    bounds: rect(0.065, 0.68, 0.075, 0.32),
    numberRange: [20, 36],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'perimeter-west',
    cluster: 'perimeter-20-36',
  },
  {
    id: 'perimeter-37-40',
    label: 'Módulos 37–40',
    role: 'perimeter',
    bounds: rect(0.285, 0.91, 0.18, 0.075),
    numberRange: [37, 40],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'perimeter-south',
    cluster: 'perimeter-37-40',
  },
  {
    id: 'perimeter-41-47',
    label: 'Módulos 41–47',
    role: 'perimeter',
    bounds: rect(0.64, 0.91, 0.3, 0.075),
    numberRange: [41, 47],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'perimeter-south',
    cluster: 'perimeter-41-47',
  },
  {
    id: 'island-1-east-column',
    label: 'Módulos 48–79',
    role: 'island',
    bounds: rect(0.4325, PAIRED_COLUMN_CENTER_Z, 0.095, PAIRED_COLUMN_DEPTH),
    numberRange: [48, 79],
    orientation: 'east-west',
    sequenceOrientation: 'z-decreasing',
    group: 'island-1',
    cluster: 'island-1-east-column',
  },
  {
    id: 'island-1-west-column',
    label: 'Módulos 80–111',
    role: 'island',
    bounds: rect(0.3275, PAIRED_COLUMN_CENTER_Z, 0.095, PAIRED_COLUMN_DEPTH),
    numberRange: [80, 111],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'island-1',
    cluster: 'island-1-west-column',
  },
  {
    id: 'island-2-east-column',
    label: 'Módulos 112–143',
    role: 'island',
    bounds: rect(0.7025, PAIRED_COLUMN_CENTER_Z, 0.095, PAIRED_COLUMN_DEPTH),
    numberRange: [112, 143],
    orientation: 'east-west',
    sequenceOrientation: 'z-decreasing',
    group: 'island-2',
    cluster: 'island-2-east-column',
  },
  {
    id: 'island-2-west-column',
    label: 'Módulos 144–175',
    role: 'island',
    bounds: rect(0.5975, PAIRED_COLUMN_CENTER_Z, 0.095, PAIRED_COLUMN_DEPTH),
    numberRange: [144, 175],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'island-2',
    cluster: 'island-2-west-column',
  },
  {
    id: 'perimeter-176-214',
    label: 'Módulos 176–214',
    role: 'perimeter',
    bounds: rect(0.94, 0.48, 0.075, 0.76),
    numberRange: [176, 214],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'perimeter-east',
    cluster: 'perimeter-176-214',
  },
] as const satisfies readonly Pavilion3CommercialReferenceRun[];

export const PAVILION3_COMMERCIAL_REFERENCE_CORRIDORS = [
  {
    id: 'west-longitudinal',
    label: 'Circulação longitudinal oeste',
    kind: 'main',
    ...rect(0.19, 0.475, 0.15, 0.73),
  },
  {
    id: 'central-longitudinal',
    label: 'Circulação longitudinal central',
    kind: 'main',
    ...rect(0.515, 0.48, 0.05, 0.74),
  },
  {
    id: 'east-longitudinal',
    label: 'Circulação longitudinal leste',
    kind: 'main',
    ...rect(0.8275, 0.48, 0.125, 0.74),
  },
  {
    id: 'north-distribution',
    label: 'Distribuição norte',
    kind: 'cross',
    ...rect(0.505, 0.15, 0.78, 0.07),
  },
  {
    id: 'south-distribution',
    label: 'Distribuição sul',
    kind: 'cross',
    ...rect(0.505, 0.861, 0.78, 0.018),
  },
  {
    id: 'west-lateral-access',
    label: 'Acesso lateral entre 19 e 20',
    kind: 'cross',
    ...rect(0.155, 0.48, 0.25, 0.06),
  },
  {
    id: 'south-access',
    label: 'Acesso entre 40 e 41',
    kind: 'cross',
    ...rect(0.4325, 0.91, 0.09, 0.075),
  },
] as const satisfies readonly Pavilion3CommercialReferenceCorridor[];

const SOURCE_DOCUMENT = 'Croqui Pavilhão 3 - Fenasoja 2026.pdf' as const;

export const PAVILION3_COMMERCIAL_REFERENCE_CELLS =
  buildCommercialPavilionReferenceCells({
    pavilionId: 'B6',
    runs: PAVILION3_COMMERCIAL_REFERENCE_RUNS,
    moduleGap: PAVILION3_COMMERCIAL_MODULE_GAP,
    sourceDocument: SOURCE_DOCUMENT,
    referenceYear: 2026,
  });

if (PAVILION3_COMMERCIAL_REFERENCE_CELLS.length !== 214) {
  throw new Error(
    `B6: a referencia geometrica gerou ${PAVILION3_COMMERCIAL_REFERENCE_CELLS.length} modulos; o total oficial e 214.`,
  );
}

export const PAVILION3_COMMERCIAL_REFERENCE = {
  publicIdentifier: 'B6',
  pavilionNumber: 3,
  category: 'Indústria e Comércio',
  moduleCount: 214,
  totalAreaM2: 1423.66,
  modularAreaM2: 663,
  individualAreaM2: null,
  moduleGap: PAVILION3_COMMERCIAL_MODULE_GAP,
  runs: PAVILION3_COMMERCIAL_REFERENCE_RUNS,
  corridors: PAVILION3_COMMERCIAL_REFERENCE_CORRIDORS,
  cells: PAVILION3_COMMERCIAL_REFERENCE_CELLS,
  source: {
    document: SOURCE_DOCUMENT,
    referenceYear: 2026,
    interpretation: 'official-reference-runs',
  },
} as const;
