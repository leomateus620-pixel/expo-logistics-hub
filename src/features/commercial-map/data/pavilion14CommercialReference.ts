import {
  buildCommercialPavilionReferenceCells,
  commercialPavilionReferenceRect as rect,
  type CommercialPavilionReferenceCluster,
  type CommercialPavilionReferenceCorridor,
  type CommercialPavilionReferenceRun,
} from './commercialPavilionReference';

const SOURCE_DOCUMENT = 'Anexo 2 e Anexo 6 · Pavilhão 14 — Comércio e Artesanato';

// The official areas reveal a 35 m × 33 m footprint: perimeter modules are
// 1 m × 3 m and the four island rows are 1 m × 3.5 m (210 + 406 = 616 m²).
export const PAVILION14_COMMERCIAL_MODULE_GAP = 0;

const X = (meters: number) => 0.02 + (meters / 35) * 0.96;
const Z = (meters: number) => 0.02 + (meters / 33) * 0.96;
const WIDTH = (meters: number) => (meters / 35) * 0.96;
const DEPTH = (meters: number) => (meters / 33) * 0.96;

function metricRect(
  leftMeters: number,
  topMeters: number,
  widthMeters: number,
  depthMeters: number,
) {
  return rect(
    X(leftMeters + widthMeters / 2),
    Z(topMeters + depthMeters / 2),
    WIDTH(widthMeters),
    DEPTH(depthMeters),
  );
}

const SOUTH_CLUSTERS = [
  { id: 'south-01-05', numberRanges: [[1, 5]] },
  { id: 'south-06-10', numberRanges: [[6, 10]] },
  { id: 'south-11-15', numberRanges: [[11, 15]] },
  { id: 'south-16-22', numberRanges: [[16, 22]] },
  { id: 'south-23-30', numberRanges: [[23, 30]] },
  { id: 'south-31-35', numberRanges: [[31, 35]] },
] as const satisfies readonly CommercialPavilionReferenceCluster[];

const LOWER_ISLAND_CLUSTERS = [
  { id: 'lower-36-38', numberRanges: [[36, 38]] },
  { id: 'lower-39-40', numberRanges: [[39, 40]] },
  { id: 'lower-41-42', numberRanges: [[41, 42]] },
  { id: 'lower-43-44', numberRanges: [[43, 44]] },
  { id: 'lower-45-46', numberRanges: [[45, 46]] },
  { id: 'lower-47-48', numberRanges: [[47, 48]] },
  { id: 'lower-49-50', numberRanges: [[49, 50]] },
  { id: 'lower-51-52', numberRanges: [[51, 52]] },
  { id: 'lower-53-54', numberRanges: [[53, 54]] },
  { id: 'lower-55-56', numberRanges: [[55, 56]] },
  { id: 'lower-57-58', numberRanges: [[57, 58]] },
  { id: 'lower-59-60', numberRanges: [[59, 60]] },
  { id: 'lower-61-64', numberRanges: [[61, 64]] },
  { id: 'lower-65-68', numberRanges: [[65, 68]] },
  { id: 'lower-69-70', numberRanges: [[69, 70]] },
  { id: 'lower-71-72', numberRanges: [[71, 72]] },
  { id: 'lower-73-74', numberRanges: [[73, 74]] },
  { id: 'lower-75-76', numberRanges: [[75, 76]] },
  { id: 'lower-77-78', numberRanges: [[77, 78]] },
  { id: 'lower-79-82', numberRanges: [[79, 82]] },
  { id: 'lower-83-84', numberRanges: [[83, 84]] },
  { id: 'lower-85-86', numberRanges: [[85, 86]] },
  { id: 'lower-87-88', numberRanges: [[87, 88]] },
  { id: 'lower-89-90', numberRanges: [[89, 90]] },
  { id: 'lower-91-93', numberRanges: [[91, 93]] },
] as const satisfies readonly CommercialPavilionReferenceCluster[];

const CENTRAL_ISLAND_CLUSTERS = [
  { id: 'central-94-96-149-151', numberRanges: [[94, 96], [149, 151]] },
  { id: 'central-97-102', numberRanges: [[97, 102]] },
  { id: 'central-103-107', numberRanges: [[103, 107]] },
  { id: 'central-108-112', numberRanges: [[108, 112]] },
  { id: 'central-113-118', numberRanges: [[113, 118]] },
  { id: 'central-119-126', numberRanges: [[119, 126]] },
  { id: 'central-127-132', numberRanges: [[127, 132]] },
  { id: 'central-133-137', numberRanges: [[133, 137]] },
  { id: 'central-138-145', numberRanges: [[138, 145]] },
  { id: 'central-146-148', numberRanges: [[146, 148]] },
] as const satisfies readonly CommercialPavilionReferenceCluster[];

const NORTH_CLUSTERS = [
  { id: 'north-152-156', numberRanges: [[152, 156]] },
  { id: 'north-157-161', numberRanges: [[157, 161]] },
  { id: 'north-162-165', numberRanges: [[162, 165]] },
  { id: 'north-166-172', numberRanges: [[166, 172]] },
  { id: 'north-173-176', numberRanges: [[173, 176]] },
  { id: 'north-177-181', numberRanges: [[177, 181]] },
  { id: 'north-182-186', numberRanges: [[182, 186]] },
] as const satisfies readonly CommercialPavilionReferenceCluster[];

export const PAVILION14_COMMERCIAL_REFERENCE_RUNS = [
  {
    id: 'south-perimeter-01-35',
    label: 'Faixa sul · 01–35',
    role: 'perimeter',
    bounds: metricRect(0, 30, 35, 3),
    numberRange: [1, 35],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'south-perimeter',
    cluster: 'south-perimeter-01-35',
    clusters: SOUTH_CLUSTERS,
  },
  {
    id: 'lower-island-south-36-64',
    label: 'Ilha inferior · 36–64',
    role: 'island',
    bounds: metricRect(3, 22.5, 29, 3.5),
    numberRange: [36, 64],
    orientation: 'north-south',
    sequenceOrientation: 'x-decreasing',
    group: 'lower-island',
    cluster: 'lower-island-south',
    clusters: LOWER_ISLAND_CLUSTERS,
  },
  {
    id: 'lower-island-north-65-93',
    label: 'Ilha inferior · 65–93',
    role: 'island',
    bounds: metricRect(3, 19, 29, 3.5),
    numberRange: [65, 93],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'lower-island',
    cluster: 'lower-island-north',
    clusters: LOWER_ISLAND_CLUSTERS,
  },
  {
    id: 'central-island-south-94-122',
    label: 'Ilha central · 94–122',
    role: 'island',
    bounds: metricRect(3, 10.5, 29, 3.5),
    numberRange: [94, 122],
    orientation: 'north-south',
    sequenceOrientation: 'x-decreasing',
    group: 'central-island',
    cluster: 'central-island-south',
    clusters: CENTRAL_ISLAND_CLUSTERS,
  },
  {
    id: 'central-island-north-123-151',
    label: 'Ilha central · 123–151',
    role: 'island',
    bounds: metricRect(3, 7, 29, 3.5),
    numberRange: [123, 151],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'central-island',
    cluster: 'central-island-north',
    clusters: CENTRAL_ISLAND_CLUSTERS,
  },
  {
    id: 'north-perimeter-152-186',
    label: 'Faixa norte · 152–186',
    role: 'perimeter',
    bounds: metricRect(0, 0, 35, 3),
    numberRange: [152, 186],
    orientation: 'north-south',
    sequenceOrientation: 'x-decreasing',
    group: 'north-perimeter',
    cluster: 'north-perimeter-152-186',
    clusters: NORTH_CLUSTERS,
  },
] as const satisfies readonly CommercialPavilionReferenceRun[];

export const PAVILION14_COMMERCIAL_REFERENCE_CORRIDORS = [
  { id: 'north-distribution', label: 'Circulação norte', kind: 'main', ...metricRect(0, 3, 35, 4) },
  { id: 'central-distribution', label: 'Circulação central', kind: 'main', ...metricRect(0, 14, 35, 5) },
  { id: 'south-distribution', label: 'Circulação sul', kind: 'main', ...metricRect(0, 26, 35, 4) },
  { id: 'west-upper-access', label: 'Acesso lateral oeste', kind: 'perimeter', ...metricRect(0, 7, 3, 7) },
  { id: 'east-upper-access', label: 'Acesso lateral leste', kind: 'perimeter', ...metricRect(32, 7, 3, 7) },
  { id: 'west-lower-access', label: 'Acesso lateral oeste', kind: 'perimeter', ...metricRect(0, 19, 3, 7) },
  { id: 'east-lower-access', label: 'Acesso lateral leste', kind: 'perimeter', ...metricRect(32, 19, 3, 7) },
] as const satisfies readonly CommercialPavilionReferenceCorridor[];

export const PAVILION14_COMMERCIAL_REFERENCE_CELLS =
  buildCommercialPavilionReferenceCells({
    pavilionId: 'B2',
    runs: PAVILION14_COMMERCIAL_REFERENCE_RUNS,
    moduleGap: PAVILION14_COMMERCIAL_MODULE_GAP,
    sourceDocument: SOURCE_DOCUMENT,
    referenceYear: 2026,
    discrepancyForNumber: (number) => (
      number === 73 || number === 74 ? 'manual-confirmation-required' : null
    ),
  });

if (PAVILION14_COMMERCIAL_REFERENCE_CELLS.length !== 186) {
  throw new Error(
    `B2: a referencia geometrica gerou ${PAVILION14_COMMERCIAL_REFERENCE_CELLS.length} modulos; o total oficial e 186.`,
  );
}

export const PAVILION14_COMMERCIAL_REFERENCE = {
  publicIdentifier: 'B2',
  pavilionNumber: 14,
  category: 'Comércio e Artesanato',
  moduleCount: 186,
  totalAreaM2: 1155,
  modularAreaM2: 616,
  individualAreaM2: null,
  moduleGap: PAVILION14_COMMERCIAL_MODULE_GAP,
  runs: PAVILION14_COMMERCIAL_REFERENCE_RUNS,
  corridors: PAVILION14_COMMERCIAL_REFERENCE_CORRIDORS,
  cells: PAVILION14_COMMERCIAL_REFERENCE_CELLS,
  source: {
    document: SOURCE_DOCUMENT,
    referenceYear: 2026,
    interpretation: 'official-reference-runs',
  },
} as const;
