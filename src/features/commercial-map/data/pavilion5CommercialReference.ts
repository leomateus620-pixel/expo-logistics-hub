import {
  buildCommercialPavilionReferenceCells,
  createCommercialPavilionMetricProjector,
  type CommercialPavilionReferenceCell,
  type CommercialPavilionReferenceCorridor,
  type CommercialPavilionReferenceProjection,
  type CommercialPavilionReferenceRun,
  type CommercialPavilionReferenceSupportSpace,
  type CommercialPavilionReferenceWallAccess,
} from './commercialPavilionReference';

export type Pavilion5CommercialReferenceCell =
  CommercialPavilionReferenceCell<'B8'>;

/** Full official footprint, including the permanent support wing: 25.50 x 43.50 m. */
const PROJECT = createCommercialPavilionMetricProjector(25.5, 43.5, 0);
const SOURCE_DOCUMENT = 'Croqui Pavilhão 5 - Fenasoja 2026.pdf' as const;

/** Official metric divisions are contiguous; the renderer adds its own visual joint. */
export const PAVILION5_COMMERCIAL_MODULE_GAP = 0;

export const PAVILION5_COMMERCIAL_REFERENCE_PROJECTION = {
  coordinateTransform: 'identity',
  fit: 'metric-contain',
  metricWidthM: 25.5,
  metricDepthM: 43.5,
  alignX: 'center',
  alignZ: 'end',
} as const satisfies CommercialPavilionReferenceProjection;

export const PAVILION5_COMMERCIAL_REFERENCE_RUNS = [
  {
    id: 'east-bottom-01',
    label: 'Módulo 01',
    role: 'gallery',
    bounds: PROJECT.rect(8.7, 42, 3, 1.5),
    numberRange: [1, 1],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'commercial-u',
    cluster: 'east-bottom-01',
  },
  {
    id: 'east-02-43',
    label: 'Módulos 02–43',
    role: 'gallery',
    bounds: PROJECT.rect(8.7, 0, 3, 42),
    numberRange: [2, 43],
    orientation: 'east-west',
    sequenceOrientation: 'z-decreasing',
    group: 'commercial-u',
    cluster: 'east-02-43',
  },
  {
    id: 'west-north-44-62',
    label: 'Módulos 44–62',
    role: 'gallery',
    bounds: PROJECT.rect(0, 0, 3, 19),
    numberRange: [44, 62],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'commercial-u',
    cluster: 'west-north-44-62',
  },
  {
    id: 'west-south-63-81',
    label: 'Módulos 63–81',
    role: 'gallery',
    bounds: PROJECT.rect(0, 24.5, 3, 19),
    numberRange: [63, 81],
    orientation: 'east-west',
    sequenceOrientation: 'z-increasing',
    group: 'commercial-u',
    cluster: 'west-south-63-81',
  },
] as const satisfies readonly CommercialPavilionReferenceRun[];

export const PAVILION5_COMMERCIAL_REFERENCE_CORRIDORS = [
  {
    id: 'central-commercial-aisle',
    label: 'Corredor comercial central',
    kind: 'main',
    ...PROJECT.rect(3, 0, 5.7, 43.5),
  },
  {
    id: 'west-cross-access',
    label: 'Acesso transversal oeste',
    kind: 'cross',
    ...PROJECT.rect(0, 19, 3, 5.5),
  },
  {
    id: 'support-north-access',
    label: 'Acesso às estruturas permanentes',
    kind: 'access',
    ...PROJECT.rect(11.7, 0, 13.8, 8),
  },
  {
    id: 'support-south-access',
    label: 'Circulação de serviço',
    kind: 'access',
    ...PROJECT.rect(11.7, 32.1, 13.8, 11.4),
  },
] as const satisfies readonly CommercialPavilionReferenceCorridor[];

export const PAVILION5_COMMERCIAL_WALL_ACCESSES = [
  {
    id: 'north-central-exit',
    label: 'Saída',
    corridorId: 'central-commercial-aisle',
    edges: ['rear'],
    kind: 'exit',
    sourcePrecision: 'official-metric',
    structuralOpening: false,
  },
  {
    id: 'west-central-entrance',
    label: 'Entrada',
    corridorId: 'west-cross-access',
    edges: ['left'],
    kind: 'entrance',
    sourcePrecision: 'official-metric',
    structuralOpening: false,
  },
  {
    id: 'south-central-exit',
    label: 'Saída',
    corridorId: 'central-commercial-aisle',
    edges: ['front'],
    kind: 'exit',
    sourcePrecision: 'official-metric',
    structuralOpening: false,
  },
] as const satisfies readonly CommercialPavilionReferenceWallAccess[];

export const PAVILION5_COMMERCIAL_SUPPORT_SPACES = [
  {
    id: 'deposito-fenasoja',
    label: 'Depósito Fenasoja',
    kind: 'storage',
    type: 'permanent-non-commercial',
    sourcePrecision: 'official-metric',
    ...PROJECT.rect(11.7, 8, 7.8, 15.4),
  },
  {
    id: 'deposito-hortigranjeiros',
    label: 'Depósito Hortigranjeiros',
    kind: 'storage',
    type: 'permanent-non-commercial',
    sourcePrecision: 'official-metric',
    ...PROJECT.rect(11.7, 23.4, 7.8, 8.7),
  },
  {
    id: 'alojamento-peoes',
    label: 'Alojamento Peões',
    kind: 'accommodation',
    type: 'permanent-non-commercial',
    sourcePrecision: 'official-metric',
    ...PROJECT.rect(19.5, 8, 6, 14.1),
  },
  {
    id: 'alojamento-peoas',
    label: 'Alojamento Peoas',
    kind: 'accommodation',
    type: 'permanent-non-commercial',
    sourcePrecision: 'official-metric',
    ...PROJECT.rect(19.5, 22.1, 6, 10),
  },
] as const satisfies readonly CommercialPavilionReferenceSupportSpace[];

export const PAVILION5_COMMERCIAL_REFERENCE_CELLS =
  buildCommercialPavilionReferenceCells({
    pavilionId: 'B8',
    runs: PAVILION5_COMMERCIAL_REFERENCE_RUNS,
    moduleGap: PAVILION5_COMMERCIAL_MODULE_GAP,
    sourceDocument: SOURCE_DOCUMENT,
    referenceYear: 2026,
    // O sombreado impresso no módulo 28 não possui legenda comercial. Ele é
    // preservado somente como incerteza documental, nunca como status do lote.
    discrepancyForNumber: (number) => (
      number === 28 ? 'manual-confirmation-required' : null
    ),
  });

if (PAVILION5_COMMERCIAL_REFERENCE_CELLS.length !== 81) {
  throw new Error(
    `B8: a referência geométrica gerou ${PAVILION5_COMMERCIAL_REFERENCE_CELLS.length} módulos; o total oficial é 81.`,
  );
}

export const PAVILION5_COMMERCIAL_REFERENCE = {
  publicIdentifier: 'B8',
  pavilionNumber: 5,
  category: 'Veterinária, Pequenos Animais e Rações',
  moduleCount: 81,
  totalAreaM2: 841.53,
  exhibitionAreaM2: 508.95,
  modularAreaM2: 244.5,
  individualAreaM2: null,
  moduleGap: PAVILION5_COMMERCIAL_MODULE_GAP,
  boundary: { centerX: 0.5, centerZ: 0.5, width: 1, depth: 1 },
  projection: PAVILION5_COMMERCIAL_REFERENCE_PROJECTION,
  interiorPresentation: { fit: 'official-content' },
  runs: PAVILION5_COMMERCIAL_REFERENCE_RUNS,
  corridors: PAVILION5_COMMERCIAL_REFERENCE_CORRIDORS,
  supportSpaces: PAVILION5_COMMERCIAL_SUPPORT_SPACES,
  wallAccesses: PAVILION5_COMMERCIAL_WALL_ACCESSES,
  cells: PAVILION5_COMMERCIAL_REFERENCE_CELLS,
  source: {
    document: SOURCE_DOCUMENT,
    referenceYear: 2026,
    interpretation: 'official-reference-runs',
  },
} as const;
