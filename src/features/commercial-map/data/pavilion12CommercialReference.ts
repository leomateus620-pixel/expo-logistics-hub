import {
  buildCommercialPavilionReferenceCells,
  commercialPavilionReferenceRect as rect,
  type CommercialPavilionReferenceCluster,
  type CommercialPavilionReferenceCorridor,
  type CommercialPavilionReferenceRun,
} from './commercialPavilionReference';

const SOURCE_DOCUMENT = 'Anexo 1 e Anexo 6 · Pavilhão 12 — Indústria, Comércio e Serviços';

// The official 50 m × 33 m plan closes exactly: 257 modules × 3 m² = 771 m².
// Module polygons therefore meet at their cadastral divisions; the renderer
// creates the visual joint without shrinking the authoritative footprint.
export const PAVILION12_COMMERCIAL_MODULE_GAP = 0;

const X = (meters: number) => 0.02 + (meters / 50) * 0.96;
const Z = (meters: number) => 0.02 + (meters / 33) * 0.96;
const WIDTH = (meters: number) => (meters / 50) * 0.96;
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

const NORTH_CLUSTERS = [
  { id: 'north-01-09', numberRanges: [[1, 9]] },
  { id: 'north-10-17', numberRanges: [[10, 17]] },
  { id: 'north-18-22', numberRanges: [[18, 22]] },
  { id: 'north-23-32', numberRanges: [[23, 32]] },
  { id: 'north-33-40', numberRanges: [[33, 40]] },
] as const satisfies readonly CommercialPavilionReferenceCluster[];

const UPPER_ISLAND_CLUSTERS = [
  { id: 'upper-41-46-119-124', numberRanges: [[41, 46], [119, 124]] },
  { id: 'upper-47-52-113-118', numberRanges: [[47, 52], [113, 118]] },
  { id: 'upper-53-57-107-112', numberRanges: [[53, 57], [107, 112]] },
  { id: 'upper-58-63-102-106', numberRanges: [[58, 63], [102, 106]] },
  { id: 'upper-64-68-97-101', numberRanges: [[64, 68], [97, 101]] },
  { id: 'upper-69-96', numberRanges: [[69, 96]] },
] as const satisfies readonly CommercialPavilionReferenceCluster[];

const LOWER_ISLAND_CLUSTERS = [
  { id: 'lower-125-130-203-208', numberRanges: [[125, 130], [203, 208]] },
  { id: 'lower-131-138-195-202', numberRanges: [[131, 138], [195, 202]] },
  { id: 'lower-139-142-191-194', numberRanges: [[139, 142], [191, 194]] },
  { id: 'lower-143-147-186-190', numberRanges: [[143, 147], [186, 190]] },
  { id: 'lower-148-152-181-185', numberRanges: [[148, 152], [181, 185]] },
  { id: 'lower-153-156-177-180', numberRanges: [[153, 156], [177, 180]] },
  { id: 'lower-157-161-172-176', numberRanges: [[157, 161], [172, 176]] },
  { id: 'lower-162-171', numberRanges: [[162, 171]] },
] as const satisfies readonly CommercialPavilionReferenceCluster[];

const SOUTH_CLUSTERS = [
  { id: 'south-209-212', numberRanges: [[209, 212]] },
  { id: 'south-213-216', numberRanges: [[213, 216]] },
  { id: 'south-217-220', numberRanges: [[217, 220]] },
  { id: 'south-221-223', numberRanges: [[221, 223]] },
  { id: 'south-224-226', numberRanges: [[224, 226]] },
  { id: 'south-227-236', numberRanges: [[227, 236]] },
  { id: 'south-237-238', numberRanges: [[237, 238]] },
  { id: 'south-239-242', numberRanges: [[239, 242]] },
  { id: 'south-243-246', numberRanges: [[243, 246]] },
  { id: 'south-247-251', numberRanges: [[247, 251]] },
  { id: 'south-252-257', numberRanges: [[252, 257]] },
] as const satisfies readonly CommercialPavilionReferenceCluster[];

export const PAVILION12_COMMERCIAL_REFERENCE_RUNS = [
  {
    id: 'north-right-01-22',
    label: 'Faixa norte · 01–22',
    role: 'perimeter',
    bounds: metricRect(25, 0, 22, 3),
    numberRange: [1, 22],
    orientation: 'north-south',
    sequenceOrientation: 'x-decreasing',
    group: 'north-perimeter',
    cluster: 'north-right-01-22',
    clusters: NORTH_CLUSTERS,
  },
  {
    id: 'north-left-23-40',
    label: 'Faixa norte · 23–40',
    role: 'perimeter',
    bounds: metricRect(0, 0, 18, 3),
    numberRange: [23, 40],
    orientation: 'north-south',
    sequenceOrientation: 'x-decreasing',
    group: 'north-perimeter',
    cluster: 'north-left-23-40',
    clusters: NORTH_CLUSTERS,
  },
  {
    id: 'upper-island-north-41-82',
    label: 'Ilha superior · 41–82',
    role: 'island',
    bounds: metricRect(4, 8, 42, 3),
    numberRange: [41, 82],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'upper-island',
    cluster: 'upper-island-north',
    clusters: UPPER_ISLAND_CLUSTERS,
  },
  {
    id: 'upper-island-south-83-124',
    label: 'Ilha superior · 83–124',
    role: 'island',
    bounds: metricRect(4, 11, 42, 3),
    numberRange: [83, 124],
    orientation: 'north-south',
    sequenceOrientation: 'x-decreasing',
    group: 'upper-island',
    cluster: 'upper-island-south',
    clusters: UPPER_ISLAND_CLUSTERS,
  },
  {
    id: 'lower-island-north-125-166',
    label: 'Ilha inferior · 125–166',
    role: 'island',
    bounds: metricRect(4, 19, 42, 3),
    numberRange: [125, 166],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'lower-island',
    cluster: 'lower-island-north',
    clusters: LOWER_ISLAND_CLUSTERS,
  },
  {
    id: 'lower-island-south-167-208',
    label: 'Ilha inferior · 167–208',
    role: 'island',
    bounds: metricRect(4, 22, 42, 3),
    numberRange: [167, 208],
    orientation: 'north-south',
    sequenceOrientation: 'x-decreasing',
    group: 'lower-island',
    cluster: 'lower-island-south',
    clusters: LOWER_ISLAND_CLUSTERS,
  },
  {
    id: 'south-perimeter-209-257',
    label: 'Faixa sul · 209–257',
    role: 'perimeter',
    bounds: metricRect(0, 30, 49, 3),
    numberRange: [209, 257],
    orientation: 'north-south',
    sequenceOrientation: 'x-increasing',
    group: 'south-perimeter',
    cluster: 'south-perimeter-209-257',
    clusters: SOUTH_CLUSTERS,
  },
] as const satisfies readonly CommercialPavilionReferenceRun[];

export const PAVILION12_COMMERCIAL_REFERENCE_CORRIDORS = [
  { id: 'north-entry', label: 'Acesso norte', kind: 'cross', ...metricRect(18, 0, 7, 3) },
  { id: 'north-east-access', label: 'Acesso nordeste', kind: 'cross', ...metricRect(47, 0, 3, 3) },
  { id: 'north-distribution', label: 'Circulação norte', kind: 'main', ...metricRect(0, 3, 50, 5) },
  { id: 'central-distribution', label: 'Circulação central', kind: 'main', ...metricRect(0, 14, 50, 5) },
  { id: 'south-distribution', label: 'Circulação sul', kind: 'main', ...metricRect(0, 25, 50, 5) },
  { id: 'west-upper-access', label: 'Acesso lateral oeste', kind: 'perimeter', ...metricRect(0, 8, 4, 6) },
  { id: 'east-upper-access', label: 'Acesso lateral leste', kind: 'perimeter', ...metricRect(46, 8, 4, 6) },
  { id: 'west-lower-access', label: 'Acesso lateral oeste', kind: 'perimeter', ...metricRect(0, 19, 4, 6) },
  { id: 'east-lower-access', label: 'Acesso lateral leste', kind: 'perimeter', ...metricRect(46, 19, 4, 6) },
  { id: 'south-east-access', label: 'Acesso sudeste', kind: 'cross', ...metricRect(49, 30, 1, 3) },
] as const satisfies readonly CommercialPavilionReferenceCorridor[];

export const PAVILION12_COMMERCIAL_REFERENCE_CELLS =
  buildCommercialPavilionReferenceCells({
    pavilionId: 'B3',
    runs: PAVILION12_COMMERCIAL_REFERENCE_RUNS,
    moduleGap: PAVILION12_COMMERCIAL_MODULE_GAP,
    sourceDocument: SOURCE_DOCUMENT,
    referenceYear: 2026,
  });

if (PAVILION12_COMMERCIAL_REFERENCE_CELLS.length !== 257) {
  throw new Error(
    `B3: a referencia geometrica gerou ${PAVILION12_COMMERCIAL_REFERENCE_CELLS.length} modulos; o total oficial e 257.`,
  );
}

export const PAVILION12_COMMERCIAL_REFERENCE = {
  publicIdentifier: 'B3',
  pavilionNumber: 12,
  category: 'Indústria, Comércio e Serviços',
  moduleCount: 257,
  totalAreaM2: 1650,
  modularAreaM2: 771,
  individualAreaM2: null,
  moduleGap: PAVILION12_COMMERCIAL_MODULE_GAP,
  runs: PAVILION12_COMMERCIAL_REFERENCE_RUNS,
  corridors: PAVILION12_COMMERCIAL_REFERENCE_CORRIDORS,
  cells: PAVILION12_COMMERCIAL_REFERENCE_CELLS,
  source: {
    document: SOURCE_DOCUMENT,
    referenceYear: 2026,
    interpretation: 'official-reference-runs',
  },
} as const;
