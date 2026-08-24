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

export const PAVILION3_COMMERCIAL_REFERENCE_RUNS = [
  {
    id: 'perimeter-01-19',
    label: 'Faixa perimetral · 01–19',
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
    label: 'Faixa perimetral · 20–36',
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
    label: 'Faixa de acesso · 37–40',
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
    label: 'Faixa de acesso · 41–47',
    role: 'perimeter',
    bounds: rect(0.64, 0.91, 0.3, 0.075),
    numberRange: [41, 47],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'perimeter-south',
    cluster: 'perimeter-41-47',
  },
  {
    id: 'island-1-west-leg',
    label: 'Ilha 1 · 48–75',
    role: 'island',
    bounds: rect(0.3275, 0.435, 0.095, 0.47),
    numberRange: [48, 75],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'island-1',
    cluster: 'island-1-west-leg',
  },
  {
    id: 'island-1-vertical-extension',
    label: 'Ilha 1 · 76–83',
    role: 'island',
    bounds: rect(0.3275, 0.738107142857, 0.095, 0.133214285714),
    numberRange: [76, 83],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'island-1',
    cluster: 'island-1-vertical-extension',
  },
  {
    id: 'island-1-east-leg',
    label: 'Ilha 1 · 84–111',
    role: 'island',
    bounds: rect(0.4325, 0.435, 0.095, 0.47),
    numberRange: [84, 111],
    orientation: 'east-west',
    sequenceOrientation: 'z-decreasing',
    group: 'island-1',
    cluster: 'island-1-east-leg',
  },
  {
    id: 'island-2-west-leg',
    label: 'Ilha 2 · 112–139',
    role: 'island',
    bounds: rect(0.5975, 0.435, 0.095, 0.47),
    numberRange: [112, 139],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'island-2',
    cluster: 'island-2-west-leg',
  },
  {
    id: 'island-2-vertical-extension',
    label: 'Ilha 2 · 140–147',
    role: 'island',
    bounds: rect(0.5975, 0.738107142857, 0.095, 0.133214285714),
    numberRange: [140, 147],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'island-2',
    cluster: 'island-2-vertical-extension',
  },
  {
    id: 'island-2-east-leg',
    label: 'Ilha 2 · 148–175',
    role: 'island',
    bounds: rect(0.7025, 0.435, 0.095, 0.47),
    numberRange: [148, 175],
    orientation: 'east-west',
    sequenceOrientation: 'z-decreasing',
    group: 'island-2',
    cluster: 'island-2-east-leg',
  },
  {
    id: 'perimeter-176-214',
    label: 'Faixa perimetral · 176–214',
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

const SOURCE_DOCUMENT = 'Anexos oficiais 1 e 2 · Pavilhão 3 — Comércio' as const;

export const PAVILION3_COMMERCIAL_REFERENCE_CELLS =
  buildCommercialPavilionReferenceCells({
    pavilionId: 'B6',
    runs: PAVILION3_COMMERCIAL_REFERENCE_RUNS,
    moduleGap: PAVILION3_COMMERCIAL_MODULE_GAP,
    sourceDocument: SOURCE_DOCUMENT,
    referenceYear: 2026,
    discrepancyForNumber: (number) => (
      number === 6 || (number >= 156 && number <= 159)
        ? 'official-range-omission'
        : null
    ),
  });

if (PAVILION3_COMMERCIAL_REFERENCE_CELLS.length !== 214) {
  throw new Error(
    `B6: a referencia geometrica gerou ${PAVILION3_COMMERCIAL_REFERENCE_CELLS.length} modulos; o total oficial e 214.`,
  );
}

export const PAVILION3_COMMERCIAL_REFERENCE = {
  publicIdentifier: 'B6',
  pavilionNumber: 3,
  category: 'Comércio',
  moduleCount: 214,
  totalAreaM2: 1423,
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
