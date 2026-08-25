import {
  DEFAULT_REFERENCE_LAYERS,
  MAP_REFERENCE_HEIGHT,
  MAP_REFERENCE_WIDTH,
  OFFICIAL_REFERENCE_IMAGE,
} from '../constants';
import type {
  CommercialLot,
  CommercialMapData,
  Coordinate,
  MapClassification,
  MapEntity,
  PolygonGeometry,
  VerificationStatus,
} from '../types';
import {
  EXPORURAL_AREA_CODE,
  EXPORURAL_GEOMETRY_REVISION,
  EXPORURAL_GEOMETRY_VERSION,
  EXPORURAL_LOT_REFERENCES,
  EXPORURAL_MAP_UNITS_PER_METER,
  EXPORURAL_ROAD_IDENTIFIERS,
  EXPORURAL_SOURCE_MANIFEST,
  EXPORURAL_SUPPORT_IDENTIFIERS,
  getExporuralReference,
  sourcePolygonAreaSqm,
} from './exporuralReference2026';
import { withCommercialMapSegmentMetadata } from './commercialMapSegments';
import {
  createCommercialPavilionReferenceProjectionFrame,
  DEFAULT_COMMERCIAL_PAVILION_REFERENCE_PROJECTION,
  projectCommercialPavilionReferencePoint,
  type CommercialPavilionReferenceCell,
  type CommercialPavilionReferenceProjection,
} from './commercialPavilionReference';
import {
  PAVILION1_COMMERCIAL_REFERENCE_CELLS,
  PAVILION1_COMMERCIAL_REFERENCE_PROJECTION,
} from './pavilion1CommercialReference';
import { PAVILION12_COMMERCIAL_REFERENCE_CELLS } from './pavilion12CommercialReference';
import { PAVILION14_COMMERCIAL_REFERENCE_CELLS } from './pavilion14CommercialReference';
import {
  PAVILION3_COMMERCIAL_REFERENCE_CELLS,
} from './pavilion3CommercialReference';
import { PAVILION5_COMMERCIAL_REFERENCE_CELLS } from './pavilion5CommercialReference';
import {
  PAVILION8_COMMERCIAL_REFERENCE_CELLS,
  PAVILION8_COMMERCIAL_REFERENCE_PROJECTION,
} from './pavilion8CommercialReference';
import {
  PAVILION13_COMMERCIAL_REFERENCE_CELLS,
  PAVILION13_COMMERCIAL_REFERENCE_PROJECTION,
} from './pavilion13CommercialReference';
import { commercialPavilionModelBounds } from '../utils/commercialPavilions';

type PdfPoint = [number, number];
type PdfPolygon = PdfPoint[];
type PdfBounds = [number, number, number, number];

interface ReferenceEntityInput {
  publicIdentifier: string;
  name: string;
  classification: MapClassification;
  layer: string;
  polygon: PdfPolygon;
  height?: number;
  parentPublicIdentifier?: string;
  description?: string;
  verificationStatus?: VerificationStatus;
  metadata?: Record<string, unknown>;
}

export const OFFICIAL_REFERENCE_REVISION = '2026.4';
const NON_EXPORURAL_SOURCE_REVISION = '2026.3';

/**
 * Reproducible crop used by the runtime underlay. Coordinates are PDF points
 * from the official Illustrator PDF, not measurements on the ground.
 */
export const OFFICIAL_2026_SOURCE_MANIFEST = {
  title: 'Mapa do Parque 300x200',
  edition: 'Fenasoja 2026',
  createdAt: '2026-04-29',
  pdfPage: { width: 7152.61, height: 5735.29 },
  jpegPage: { width: 14902, height: 11949 },
  parkCropPdf: { x: 600, y: 900, width: 5500, height: 4150 },
  optimizedRaster: { width: 3000, height: 2264, path: OFFICIAL_REFERENCE_IMAGE },
  sourceSha256: '650080ace6fa8656863f9decc98d5fc6721eb8a2e91f48e18a28e280434eea38',
  buyerListExcludedFromX: 6280,
} as const;

const CROP = OFFICIAL_2026_SOURCE_MANIFEST.parkCropPdf;
const LOT_INSET = 1.45;

function slug(value: string) {
  return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function entityId(publicIdentifier: string) {
  return `reference:2026:${slug(publicIdentifier)}`;
}

export function officialPdfPointToLocal([x, y]: readonly [number, number]): Coordinate {
  return [
    ((x - CROP.x) / CROP.width) * MAP_REFERENCE_WIDTH - MAP_REFERENCE_WIDTH / 2,
    ((y - CROP.y) / CROP.height) * MAP_REFERENCE_HEIGHT - MAP_REFERENCE_HEIGHT / 2,
  ];
}

const pdfToLocal = officialPdfPointToLocal;

function rectPdf([x1, y1, x2, y2]: PdfBounds, inset = 0): PdfPolygon {
  return [
    [x1 + inset, y1 + inset],
    [x2 - inset, y1 + inset],
    [x2 - inset, y2 - inset],
    [x1 + inset, y2 - inset],
  ];
}

function aroundPdf([x, y]: PdfPoint, width = 54, height = width): PdfPolygon {
  return rectPdf([x - width / 2, y - height / 2, x + width / 2, y + height / 2]);
}

function diamondPdf([x, y]: PdfPoint, radius = 22): PdfPolygon {
  return [[x, y - radius], [x + radius, y], [x, y + radius], [x - radius, y]];
}

function geometry(
  polygon: PdfPolygon,
  height = 0.16,
  geometryVersion = 1,
  calibrationVersion: number | null = null,
): PolygonGeometry {
  const ring = polygon.map(pdfToLocal);
  ring.push([...ring[0]] as Coordinate);
  return {
    id: null,
    type: 'Polygon',
    coordinates: [ring],
    elevation: 0,
    extrusionHeight: height,
    rotation: 0,
    geometryVersion,
    calibrationVersion,
  };
}

const entityInputs: ReferenceEntityInput[] = [];
const lotKeys = new Set<string>();

function addEntity(input: ReferenceEntityInput) {
  entityInputs.push(input);
}

function addQuadra(
  code: string,
  bounds: PdfBounds,
  metadata?: Record<string, unknown>,
  sourcePolygon?: PdfPolygon,
) {
  const isExporural = code === 'R' || code === 'S';
  addEntity({
    publicIdentifier: `QUADRA-${code}`,
    name: `Quadra ${code}`,
    classification: 'QUADRA',
    layer: 'quadras',
    polygon: sourcePolygon ?? rectPdf(bounds),
    height: 0.025,
    parentPublicIdentifier: isExporural ? EXPORURAL_AREA_CODE : undefined,
    verificationStatus: isExporural ? 'VERIFIED' : undefined,
    metadata: {
      renderMode: 'outline',
      labelPriority: 'quadra',
      block: code,
      ...(isExporural ? {
        areaCode: EXPORURAL_AREA_CODE,
        entityType: 'EXPORURAL_QUADRA',
        geometryRevision: EXPORURAL_GEOMETRY_REVISION,
      } : {}),
      ...metadata,
    },
  });
}

function lotNumber(value: number | string) {
  return String(value).padStart(2, '0');
}

function addLot(block: string, value: number | string, polygon: PdfPolygon, metadata?: Record<string, unknown>) {
  const number = lotNumber(value);
  const key = `${block}-${number}`;
  if (lotKeys.has(key)) throw new Error(`Lote oficial duplicado: ${key}`);
  lotKeys.add(key);
  addEntity({
    publicIdentifier: `Q-${block}-${number}`,
    name: `Lote ${number}`,
    classification: 'SELLABLE_LOT',
    layer: 'commercial',
    polygon,
    height: 0.13,
    parentPublicIdentifier: `QUADRA-${block}`,
    metadata: {
      block,
      lotNumber: number,
      officialLabelVerified: true,
      cartographicAreaOnly: true,
      ...metadata,
    },
  });
}

function addRow(block: string, numbers: Array<number | string>, bounds: PdfBounds) {
  const [x1, y1, x2, y2] = bounds;
  const width = (x2 - x1) / numbers.length;
  numbers.forEach((number, index) => addLot(
    block,
    number,
    rectPdf([x1 + index * width, y1, x1 + (index + 1) * width, y2], LOT_INSET),
  ));
}

function addTwoRowGrid(block: string, bounds: PdfBounds, top: number[], bottom: number[]) {
  const [x1, y1, x2, y2] = bounds;
  const middle = (y1 + y2) / 2;
  addRow(block, top, [x1, y1, x2, middle]);
  addRow(block, bottom, [x1, middle, x2, y2]);
}

const EXPORURAL_AREA_SOURCE_POLYGON: PdfPolygon = [
  [3985, 1265], [6008, 1265], [6008, 2372], [5966, 2372],
  [5880, 2570], [5832, 2640], [5700, 2660], [5600, 2645],
  [5500, 2615], [5370, 2520], [5140, 2490], [5100, 2482],
  [4980, 2482], [4100, 2438], [3994, 2438], [3984, 2438],
  [3984, 2445], [3945, 2445], [3940, 2418], [3687, 2418],
  [3562, 2388], [3541, 2180], [3244, 2167], [3230, 2080],
  [3230, 1760], [3945, 1760], [3945, 1265],
];

const EXPORURAL_R_SOURCE_POLYGON: PdfPolygon = [
  [3230, 1760], [5966, 1760], [5966, 2372], [5880, 2570],
  [5832, 2640], [5700, 2660], [5600, 2645],
  [5500, 2615], [5370, 2520], [5140, 2490], [5100, 2482],
  [4980, 2482], [4100, 2438], [3994, 2438], [3984, 2438],
  [3984, 2445], [3945, 2445], [3940, 2418], [3687, 2418],
  [3562, 2388], [3541, 2180], [3244, 2167], [3230, 2080],
];

const EXPORURAL_S_SOURCE_POLYGON: PdfPolygon = [
  [3985, 1265], [6008, 1265], [6008, 1762], [3985, 1762],
];

addEntity({
  publicIdentifier: EXPORURAL_AREA_CODE,
  name: 'Exporural',
  description: 'Setor cadastral Exporural, composto pelas Quadras R e S, suas vias internas e estruturas de apoio.',
  classification: 'RURAL_EXHIBITION',
  layer: 'exporural',
  polygon: EXPORURAL_AREA_SOURCE_POLYGON,
  height: 0.018,
  verificationStatus: 'VERIFIED',
  metadata: {
    areaCode: EXPORURAL_AREA_CODE,
    entityType: 'EXPORURAL_AREA',
    renderMode: 'outline',
    labelPriority: 'area',
    geometryRevision: EXPORURAL_GEOMETRY_REVISION,
    geometryBoundsSource: [3230, 1265, 6008, 2660],
    defaultCameraPreset: 'exporural',
    mapUnitsPerMeter: EXPORURAL_MAP_UNITS_PER_METER,
    sourceManifest: EXPORURAL_SOURCE_MANIFEST,
  },
});

// Official quadra envelopes. These are hierarchy/label boundaries, not lots.
([
  ['S', [3985, 1270, 6010, 1730]],
  ['R', [3230, 1760, 6010, 2620]],
  ['V', [1650, 2468, 2220, 2578]],
  ['Q', [2243, 2472, 2785, 2578]],
  ['N', [2830, 2470, 3440, 2578]],
  ['U', [1650, 2625, 2220, 2830]],
  ['P', [2243, 2625, 2785, 2835]],
  ['M', [2830, 2625, 3440, 2835]],
  ['G', [3484, 2625, 3935, 2838]],
  ['T', [1650, 2890, 2220, 3100]],
  ['O', [2243, 2890, 2785, 3105]],
  ['L', [2830, 2890, 3440, 3105]],
  ['F', [3484, 2890, 3935, 3105]],
  ['J', [2830, 3182, 3440, 3435]],
  ['E', [3484, 3182, 3935, 3437]],
  ['C', [4020, 3180, 4510, 3437]],
  ['I', [2830, 3495, 3440, 3715]],
  ['D', [3484, 3495, 3935, 3715]],
  ['B', [4020, 3495, 4510, 3720]],
  ['A', [4020, 3780, 4510, 4165]],
  ['X', [760, 2400, 1640, 3140]],
] as Array<[string, PdfBounds]>).forEach(([code, bounds]) => addQuadra(
  code,
  bounds,
  code === 'G' ? { unresolvedPrintedLots: ['03', '04'], sourceNote: 'B40 cobre a coluna regular; os números 03/04 não estão impressos no mapa oficial.' } : undefined,
  code === 'R' ? EXPORURAL_R_SOURCE_POLYGON : code === 'S' ? EXPORURAL_S_SOURCE_POLYGON : undefined,
));

// Quadras R/S — explicit, calibrated polygons from the Exporural cadastral
// references. Regular parcels retain measured proportions; endpoint, island
// and perimeter parcels carry their own rounded/trapezoidal/fan vertices.
EXPORURAL_LOT_REFERENCES.forEach((reference) => addLot(
  reference.block,
  reference.lotNumber,
  reference.sourcePolygon,
  {
    areaCode: EXPORURAL_AREA_CODE,
    entityType: 'EXPORURAL_COMMERCIAL_LOT',
    officialAreaSqm: reference.officialAreaSqm,
    calculatedAreaSqm: sourcePolygonAreaSqm(reference.sourcePolygon),
    mapUnitsPerMeter: EXPORURAL_MAP_UNITS_PER_METER,
    geometryKind: reference.geometryKind,
    geometryRevision: EXPORURAL_GEOMETRY_REVISION,
    sourceReference: reference.sourceAnnex,
    reviewerNote: reference.reviewerNote,
    labelSourcePoint: reference.labelSourcePoint,
    cartographicAreaOnly: false,
    officialMeasurements: true,
    areaValidationStatus: 'VALIDATED',
  },
));

// Compact commercial quadras in the park core.
addLot('V', 6, rectPdf([1650, 2468, 1750, 2578], LOT_INSET));
addRow('V', [5, 4, 3, 2, 1], [1810, 2468, 2220, 2578]);
addRow('Q', [6, 5, 4, 3, 2, 1], [2243, 2472, 2750, 2578]);

function addUOrT(block: 'U' | 'T', bounds: PdfBounds) {
  const [x1, y1, x2, y2] = bounds;
  const middle = (y1 + y2) / 2;
  addLot(block, 11, rectPdf([x1, y1, x1 + 100, middle], LOT_INSET));
  addLot(block, 12, rectPdf([x1, middle, x1 + 100, y2], LOT_INSET));
  addRow(block, [9, 7, 5, 3, 1], [x1 + 160, y1, x2, middle]);
  addRow(block, [10, 8, 6, 4, 2], [x1 + 160, middle, x2, y2]);
}

addUOrT('U', [1650, 2625, 2220, 2830]);
addUOrT('T', [1650, 2890, 2220, 3100]);
addTwoRowGrid('P', [2243, 2625, 2785, 2835], [13, 11, 9, 7, 5, 3, 1], [14, 12, 10, 8, 6, 4, 2]);
addTwoRowGrid('O', [2243, 2890, 2785, 3105], [13, 11, 9, 7, 5, 3, 1], [14, 12, 10, 8, 6, 4, 2]);
addTwoRowGrid('M', [2830, 2625, 3440, 2835], [2, 4, 6, 8, 10, 12, 14, 16], [1, 3, 5, 7, 9, 11, 13, 15]);
addTwoRowGrid('L', [2830, 2890, 3440, 3105], [2, 4, 6, 8, 10, 12, 14, 16], [1, 3, 5, 7, 9, 11, 13, 15]);
addTwoRowGrid('J', [2830, 3182, 3440, 3435], [2, 4, 6, 8, 10, 12, 14, 16], [1, 3, 5, 7, 9, 11, 13, 15]);
addTwoRowGrid('I', [2830, 3495, 3440, 3715], [2, 4, 6, 8, 10, 12, 14, 16], [1, 3, 5, 7, 9, 11, 13, 15]);
addTwoRowGrid('F', [3484, 2890, 3760, 3105], [2, 4, 6, 8], [1, 3, 5, 7]);
addTwoRowGrid('D', [3484, 3495, 3935, 3715], [2, 4, 6, 8, 10, 12], [1, 3, 5, 7, 9, 11]);

const gColumns: Array<{ top: number; bottom: number; index: number }> = [
  { top: 2, bottom: 1, index: 0 },
  { top: 6, bottom: 5, index: 2 },
  { top: 8, bottom: 7, index: 3 },
];
gColumns.forEach(({ top, bottom, index }) => {
  const width = (3760 - 3484) / 4;
  addLot('G', top, rectPdf([3484 + index * width, 2625, 3484 + (index + 1) * width, 2731.5], LOT_INSET));
  addLot('G', bottom, rectPdf([3484 + index * width, 2731.5, 3484 + (index + 1) * width, 2838], LOT_INSET));
});

addTwoRowGrid('E', [3484, 3182, 3835, 3437], [2, 4, 6, 8, 10], [1, 3, 5, 7, 9]);
addLot('E', 13, rectPdf([3835, 3182, 3935, 3267], LOT_INSET));
addLot('E', 12, rectPdf([3835, 3267, 3935, 3352], LOT_INSET));
addLot('E', 11, rectPdf([3835, 3352, 3935, 3437], LOT_INSET));

const expectedLotCounts: Record<string, number> = {
  S: 36, R: 59, V: 6, Q: 6, U: 12, P: 14, M: 16, G: 6,
  T: 12, O: 14, L: 16, F: 8, J: 16, E: 13, I: 16, D: 12,
};

Object.entries(expectedLotCounts).forEach(([block, expected]) => {
  const actual = [...lotKeys].filter((key) => key.startsWith(`${block}-`)).length;
  if (actual !== expected) throw new Error(`Inventário da Quadra ${block}: esperado ${expected}, recebido ${actual}`);
});

// Internal streets and public circulation — each corridor remains a real separator.
const roadInputs: Array<[string, string, PdfPolygon, MapClassification?]> = [
  ['RUA-BRUNO-SCHWARTZ', 'Rua Bruno Schwartz', rectPdf([3984, 1484, 5966, 1518])],
  ['RUA-JOHAN-MULLER', 'Rua Johan Muller', rectPdf([3984, 1726, 5966, 1762])],
  ['RUA-GUSTAVO-BESSEL', 'Rua Gustavo Bessel', [
    [3230, 2058], [3985, 2058], [3985, 2041], [5966, 2041],
    [5966, 2078], [3985, 2078], [3985, 2080], [3230, 2080],
  ]],
  ['RUA-EMANUEL-BRACHMANN', 'Rua Emanuel Brachmann', rectPdf([5227, 2333, 5966, 2372])],
  ['RUA-PASTOR-ALBERT-LEHENBAUER', 'Rua Pastor Albert Lehenbauer', [
    [3968, 1265], [4004, 1265], [4004, 1484], [3985, 1518],
    [3984, 1726], [3984, 2445], [3945, 2445], [3945, 1758],
    [3963, 1726], [3963, 1518], [3968, 1484],
  ]],
  ['RUA-15-NOVEMBRO', 'Rua 15 de Novembro', rectPdf([5188, 1265, 5227, 2372])],
  ['RUA-UBIRETAMA', 'Rua Ubiretama', [
    [5966, 1265], [6008, 1265], [6008, 2080], [5960, 2320],
    [5880, 2570], [5832, 2640], [5800, 2618], [5842, 2550],
    [5920, 2310], [5966, 2070],
  ]],
  ['RUA-BUENOS-AIRES', 'Rua Buenos Aires', rectPdf([1600, 2410, 1648, 3145])],
  ['RUA-PARAGUAI', 'Rua Paraguai', rectPdf([1640, 2444, 3945, 2467])],
  ['RUA-BOLIVIA', 'Rua Bolívia', rectPdf([1640, 2579, 3945, 2624])],
  ['RUA-CHILE', 'Rua Chile', rectPdf([1640, 2836, 3945, 2889])],
  ['RUA-BRASIL', 'Rua Brasil', rectPdf([1640, 3106, 4510, 3181])],
  ['RUA-URUGUAI', 'Rua Uruguai', rectPdf([2820, 3438, 3940, 3494])],
  ['RUA-ARGENTINA', 'Rua Argentina', rectPdf([2820, 3716, 3940, 3780])],
  ['RUA-BRASILIA', 'Rua Brasília', rectPdf([3940, 2440, 3988, 4210])],
  ['RUA-MONTEVIDEU', 'Rua Montevidéu', rectPdf([3441, 3106, 3482, 3715])],
  ['ALAMEDA-MERCOSUL', 'Alameda Mercosul', rectPdf([2786, 2410, 2828, 3780])],
  ['CALCADA-ARVOREDO', 'Calçada do Arvoredo', rectPdf([2630, 3110, 2782, 3565]), 'PEDESTRIAN_PATH'],
  ['AV-BENVENUTO-CONTI', 'Avenida Benvenuto de Conti', rectPdf([1050, 4165, 3940, 4235])],
  ['AV-IMIGRANTES', 'Avenida dos Imigrantes', rectPdf([3940, 4165, 5510, 4235])],
  ['AV-TUPARENDI', 'Avenida Tuparendi', [[600, 3850], [1300, 4190], [1268, 4260], [600, 3930]]],
  ['RODOVIA-RS-472', 'Rodovia RS 472', [[5935, 1280], [5995, 1290], [6100, 4300], [6035, 4300]]],
];

const exporuralRoadIdentifiers = new Set<string>(EXPORURAL_ROAD_IDENTIFIERS);
roadInputs.forEach(([publicIdentifier, name, polygon, classification = 'ROAD']) => {
  const isExporuralRoad = exporuralRoadIdentifiers.has(publicIdentifier);
  addEntity({
    publicIdentifier,
    name,
    classification,
    layer: 'circulation',
    polygon,
    height: classification === 'ROAD' ? 0.032 : 0.026,
    parentPublicIdentifier: isExporuralRoad ? EXPORURAL_AREA_CODE : undefined,
    verificationStatus: isExporuralRoad ? 'VERIFIED' : undefined,
    metadata: {
      labelPriority: 'road',
      isSeparator: true,
      ...(isExporuralRoad ? {
        areaCode: EXPORURAL_AREA_CODE,
        entityType: 'EXPORURAL_ROAD',
        geometryRevision: EXPORURAL_GEOMETRY_REVISION,
      } : {}),
    },
  });
});

function addStructure(
  publicIdentifier: string,
  name: string,
  classification: MapClassification,
  layer: string,
  boundsOrCenter: PdfBounds | PdfPoint,
  options: {
    height?: number;
    parent?: string;
    width?: number;
    depth?: number;
    verificationStatus?: VerificationStatus;
    metadata?: Record<string, unknown>;
  } = {},
) {
  const polygon = boundsOrCenter.length === 4
    ? rectPdf(boundsOrCenter as PdfBounds)
    : aroundPdf(boundsOrCenter as PdfPoint, options.width, options.depth);
  addEntity({
    publicIdentifier,
    name,
    classification,
    layer,
    polygon,
    height: options.height ?? (classification === 'PAVILION' || classification === 'EVENT_VENUE' ? 1.35 : 0.62),
    parentPublicIdentifier: options.parent ? `QUADRA-${options.parent}` : undefined,
    verificationStatus: options.verificationStatus,
    metadata: options.metadata,
  });
}

// Official A1–A11 gates. The public identifier describes the gate, never a buyer.
([
  ['A1', 'Portão 1 — entrada de veículos de visitantes e expositores', [684, 3306]],
  ['A2', 'Portão 2 — entrada e saída de visitantes', [1274, 4040]],
  ['A3', 'Portão 3 — entrada de veículos de expositores e visitantes', [3935, 4219]],
  ['A4', 'Portão 4 — entrada e saída de visitantes', [1656, 1744]],
  ['A5', 'Portão 5 — saída de veículos de expositores e visitantes', [5974, 3678]],
  ['A6', 'Portão 6 — entrada e saída de veículos de visitantes e expositores', [3276, 941]],
  ['A7', 'Portão 7 — entrada de visitantes e expositores', [3267, 1703]],
  ['A8', 'Portão 8 — entrada de visitantes e expositores', [5206, 1302]],
  ['A9', 'Portão 9 — saída de visitantes e expositores', [3964, 1302]],
  ['A10', 'Portão 10 — entrada e saída de visitantes', [1214, 3137]],
  ['A11', 'Portão 11 — entrada e saída de visitantes e expositores', [5954, 1293]],
] as Array<[string, string, PdfPoint]>).forEach(([code, name, center]) => addEntity({
  publicIdentifier: code,
  name,
  classification: 'GATE',
  layer: 'gates',
  polygon: diamondPdf(center),
  height: 0.72,
  metadata: { legendCode: code, labelPriority: 'gate' },
}));

// Pavilions and infrastructure B1–B42, following the official lower legend.
const bStructures: Array<[string, string, MapClassification, string, PdfBounds | PdfPoint, Parameters<typeof addStructure>[5]?]> = [
  ['B1', 'Pavilhão 1 — Indústria, Comércio e Serviços', 'PAVILION', 'pavilions', [2298, 3600, 2655, 3759]],
  ['B2', 'Pavilhão 14 — Comércio e Artesanato', 'PAVILION', 'pavilions', [2418, 3833, 2658, 4074]],
  ['B3', 'Pavilhão 12 — Indústria, Comércio e Serviços', 'PAVILION', 'pavilions', [2792, 3827, 3147, 4089]],
  ['B4', 'Pavilhão 8 — Indústria e Comércio', 'PAVILION', 'pavilions', [3172, 3788, 3296, 4100]],
  ['B5', 'Pavilhão 13 — Indústria e Comércio', 'PAVILION', 'pavilions', [3307, 3788, 3445, 4051]],
  ['B6', 'Pavilhão 3 — Indústria e Comércio', 'PAVILION', 'pavilions', [3460, 3786, 3670, 4098]],
  ['B7', 'Pavilhão 4 — Cozinha da Soja', 'PAVILION', 'pavilions', [3495, 2497, 3666, 2568], { parent: 'N' }],
  ['B8', 'Pavilhão 5 — Veterinária, Pequenos Animais e Rações', 'PAVILION', 'pavilions', [3198, 2203, 3411, 2390]],
  ['B9', 'Pavilhões 6, 10 e 11 — Pecuária', 'PAVILION', 'pavilions', [2319, 2256, 3179, 2389]],
  ['B10', 'Pavilhão 7 — Agricultura familiar / soja e derivados', 'PAVILION', 'pavilions', [1973, 2252, 2309, 2379]],
  ['B11', 'Centro administrativo / auditório', 'ADMINISTRATION', 'structures', [3735, 3850, 3860, 4150]],
  ['B12', 'Sede Fenasoja / Comissão Central', 'ADMINISTRATION', 'structures', [4105, 3681], { parent: 'B', width: 135, depth: 104 }],
  ['B13', 'Palco Cultural Lactalis', 'EVENT_VENUE', 'structures', [4092, 3575], { parent: 'B', width: 126, depth: 112, height: 1.05 }],
  ['B14', "Módulo Fenasoja 60 anos — Prefeitura / Câmara de Vereadores e TV's", 'BUILDING', 'structures', [4079, 3930], { parent: 'A', width: 112, depth: 184 }],
  ['B15', 'Imprensa', 'SERVICE', 'structures', [3912, 4010], { width: 64, depth: 126 }],
  ['B16', 'Fenasoja Store / Informações', 'SERVICE', 'structures', [4048, 2921], { width: 66, depth: 86 }],
  ['B17', 'Polícia Civil / Sala Lilás', 'SECURITY', 'safety', [4048, 2813], { width: 66, depth: 86 }],
  ['B18', 'Parque Infantil Sojinha', 'ATTRACTION', 'structures', [4187, 4148], { parent: 'A', width: 115, depth: 62 }],
  ['B19', 'Brigada Militar', 'SECURITY', 'safety', [3701, 3821], { width: 62, depth: 84 }],
  ['B20', 'Praça das Nações', 'ATTRACTION', 'structures', [4800, 4350, 5070, 4870], { height: 0.16 }],
  ['B21', '19º RC MEC', 'BUILDING', 'structures', [4377, 3941], { parent: 'A', width: 105, depth: 218 }],
  ['B22', 'Pavilhão Terceira Idade', 'PAVILION', 'pavilions', [742, 3538, 931, 3834]],
  ['B23', 'Ambulatório', 'EMERGENCY', 'safety', [2670, 3970, 2780, 4140], { verificationStatus: 'NEEDS_REVIEW', metadata: { sourceDiscrepancy: 'Visível no mapa, omitido na legenda inferior.' } }],
  ['B24', 'Corpo de Bombeiros', 'EMERGENCY', 'safety', [2664, 3513], { width: 58, depth: 58 }],
  ['B25', 'Comissão de Logística', 'SERVICE', 'structures', [4395, 3615], { parent: 'B', width: 120, depth: 120 }],
  ['B26', 'Comissão de Gastronomia', 'FOOD_AREA', 'food', [4260, 3682], { parent: 'B', width: 110, depth: 100 }],
  ['B27', 'Ketten Bebidas', 'FOOD_AREA', 'food', [4260, 3569], { parent: 'B', width: 110, depth: 105 }],
  ['B28', 'Espaço do Cooperativismo', 'BUILDING', 'structures', [3000, 2480, 3220, 2570], { parent: 'N' }],
  ['B29', 'Casa Rotária', 'BUILDING', 'structures', [4570, 4820, 4740, 5050]],
  ['B30', 'Monumento do Voluntariado', 'LANDMARK', 'structures', [4060, 4147], { parent: 'A', width: 76, depth: 48 }],
  ['B31', 'Polícia Penal', 'SECURITY', 'safety', [4163, 4037], { parent: 'A', width: 74, depth: 54 }],
  ['B32', 'Expo BM', 'SECURITY', 'safety', [4198, 3927], { parent: 'A', width: 70, depth: 125 }],
  ['B33', 'ACISAP', 'BUILDING', 'structures', [2997, 3803], { width: 84, depth: 52 }],
  ['B34', 'Tomelero', 'BUILDING', 'structures', [2821, 3803], { width: 84, depth: 52 }],
  ['B37', 'Comissão Exporural', 'ADMINISTRATION', 'structures', [5380, 1324], {
    parent: 'S', width: 84, depth: 88, height: 0.18,
    metadata: { overlaysLotsWithoutRemovingThem: true, hostLot: 'S-24' },
  }],
  ['B38', 'Área de Lazer', 'ATTRACTION', 'structures', [5278, 1438], {
    parent: 'S', width: 88, depth: 82, height: 0.18,
    metadata: { overlaysLotsWithoutRemovingThem: true, hostLot: 'S-25' },
  }],
  ['B39', 'Caminhos da Soja — Emater / Ascar', 'ATTRACTION', 'structures', [1960, 2500, 2148, 2574], { parent: 'V', metadata: { overlaysLotsWithoutRemovingThem: true } }],
  ['B40', 'Espaço Institucional — Emater / Ascar', 'BUILDING', 'structures', [3553, 2645, 3618, 2828], { parent: 'G', metadata: { suppressesUnprintedLots: ['03', '04'] } }],
  ['B41', 'Sala de Reuniões Fenasoja', 'ADMINISTRATION', 'structures', [2266, 3740], { width: 74, depth: 66 }],
];
bStructures.forEach(([code, name, classification, layer, footprint, options]) => addStructure(code, name, classification, layer, footprint, options));
addStructure('B42-01', 'Módulo de Informações', 'SERVICE', 'structures', [1695, 1823], { width: 58, depth: 74, metadata: { legendCode: 'B42', instance: 1 } });
addStructure('B42-02', 'Módulo de Informações', 'SERVICE', 'structures', [3923, 4116], { parent: 'A', width: 58, depth: 74, metadata: { legendCode: 'B42', instance: 2 } });

// C, D, F, G and J official infrastructure.
const namedStructures: Array<[string, string, MapClassification, string, PdfBounds | PdfPoint, Parameters<typeof addStructure>[5]?]> = [
  ['C1', 'Centro de Eventos Fenasoja', 'EVENT_VENUE', 'structures', [4020, 3180, 4490, 3435], { parent: 'C', height: 1.55 }],
  ['C2', 'Restaurante Central', 'RESTAURANT', 'food', [2420, 3185, 2600, 3335], { height: 1.05 }],
  ['C3', 'Pizzaria', 'RESTAURANT', 'food', [2420, 3335, 2600, 3470], { height: 0.95 }],
  ['C4', 'Churrascaria Exporural', 'RESTAURANT', 'food', [4980, 2370, 5100, 2480], { parent: 'R', height: 0.95 }],
  ['C5', 'Casa da Etnia Polonesa', 'BUILDING', 'structures', [4686, 4422], { width: 118, depth: 116 }],
  ['C6', 'Casa da Etnia Italiana', 'BUILDING', 'structures', [5178, 4425], { width: 118, depth: 116 }],
  ['C7', 'Casa da Etnia Afro', 'BUILDING', 'structures', [5178, 4764], { width: 118, depth: 116 }],
  ['C8', 'Casa da Etnia Alemã', 'BUILDING', 'structures', [4657, 4758], { width: 118, depth: 116 }],
  ['D1', 'Alameda Gastronômica', 'FOOD_AREA', 'food', [3770, 2885, 3920, 3095], { parent: 'F', height: 0.72 }],
  ['D2', 'Via Expressa', 'ATTRACTION', 'structures', [3760, 2650, 3900, 2825], { parent: 'G', height: 0.82, metadata: { explicitNotRoad: true } }],
  ['D3', 'Espaço Mirante', 'ATTRACTION', 'structures', [3990, 2440, 4100, 2830], { height: 0.92 }],
  ['D4', 'Tenda da Pecuária', 'LIVESTOCK_AREA', 'exporural', [2925, 2525], { parent: 'N', width: 125, depth: 100, height: 0.74 }],
  ['D5', 'Núcleo dos Criadores de Cavalos Crioulos', 'LIVESTOCK_AREA', 'exporural', [1545, 2241], { width: 110, depth: 110, height: 0.7 }],
  ['F', 'Arena Sicredi - Icatu', 'EVENT_VENUE', 'structures', [4900, 2690, 5385, 3130], { height: 1.35, metadata: { explicitNotWater: true, labelPriority: 'landmark' } }],
  ['G', 'Árvore Lunar', 'LANDMARK', 'structures', [2152, 3334], { width: 92, depth: 92, height: 1.1 }],
  ['J', 'Parque de Diversões', 'ATTRACTION', 'structures', [930, 2450, 1600, 3000], { parent: 'X', height: 0.12, verificationStatus: 'NEEDS_REVIEW', metadata: { sourceDiscrepancy: 'Marcador J visível no mapa e ausente na legenda inferior.' } }],
];
namedStructures.forEach(([code, name, classification, layer, footprint, options]) => addStructure(code, name, classification, layer, footprint, options));

// Repeated official E markers are sanitary facilities, never water features.
export const OFFICIAL_RESTROOM_CENTERS_2026: readonly PdfPoint[] = [
  [5247, 1340], [5893, 1617], [1700, 2007], [3221, 2075], [1074, 2387], [4931, 2427],
  [3348, 2534], [4998, 2638], [5115, 2645], [4645, 2660], [5073, 2698], [1059, 2991],
  [4623, 3020], [5055, 3030], [1607, 3052], [4968, 3080], [5082, 3087], [3157, 3918],
  [2407, 3218], [2411, 3273], [4351, 3319], [2279, 3648], [3156, 4009], [2391, 3886],
  [2156, 2240], [3213, 2280],
];
OFFICIAL_RESTROOM_CENTERS_2026.forEach((center, index) => addStructure(
  `E-${String(index + 1).padStart(2, '0')}`,
  'Sanitários',
  'RESTROOM',
  'restrooms',
  center,
  { width: 42, depth: 34, height: 0.42, metadata: { legendCode: 'E', instance: index + 1 } },
));

// Large official areas and permanent footprints.
addStructure('PISTA-CAMPEIRA', 'Pista Campeira', 'LIVESTOCK_AREA', 'exporural', [1990, 1740, 3240, 2175], { height: 0.18 });
addStructure('PAVILHAO-09', 'Pavilhão 09', 'PAVILION', 'pavilions', [1697, 1862, 1913, 2374], { height: 1.32 });
addStructure('AREA-MOTORHOME', 'Área para Motor Home / Trailer para Expositores', 'PARKING', 'parking', [760, 1780, 1630, 2400], { height: 0.055, metadata: { usage: 'motorhome_trailer_expositores' } });
addStructure('TEST-DRIVE', 'Área de estacionamento de veículos test drive', 'PARKING', 'parking', [760, 2860, 1640, 3145], { height: 0.055, metadata: { usage: 'test_drive' } });
addEntity({
  publicIdentifier: 'EST-EXP-VIS',
  name: 'Estacionamento de expositores e visitantes',
  classification: 'PARKING',
  layer: 'parking',
  polygon: [[4510, 3220], [5350, 3260], [5270, 4140], [4510, 4140]],
  height: 0.06,
});
addEntity({
  publicIdentifier: 'EST-VIS',
  name: 'Estacionamento de visitantes',
  classification: 'PARKING',
  layer: 'parking',
  polygon: [[5350, 3400], [5980, 3480], [5900, 4250], [5350, 4140]],
  height: 0.06,
});
addStructure('PORTICO-NACOES', 'Pórtico das Nações', 'LANDMARK', 'structures', [4935, 4285], { width: 128, depth: 48, height: 1.15 });
addStructure('ESPACO-ETNIA-RUSSA', 'Espaço destinado à Etnia Russa', 'ATTRACTION', 'structures', [4550, 4430, 4760, 4740], { height: 0.08 });
addStructure('ESPACO-ETNIA-ARABE', 'Espaço destinado à Etnia Árabe', 'ATTRACTION', 'structures', [5080, 4430, 5285, 4740], { height: 0.08 });
addStructure('ESPACO-ETNIA-PORTUGUESA', 'Espaço destinado à Etnia Portuguesa', 'ATTRACTION', 'structures', [5080, 4780, 5285, 5050], { height: 0.08 });

const exporuralSupportIdentifiers = new Set<string>(EXPORURAL_SUPPORT_IDENTIFIERS);

function toEntity(input: ReferenceEntityInput): MapEntity {
  const isExporural = input.metadata?.areaCode === EXPORURAL_AREA_CODE
    || input.publicIdentifier === EXPORURAL_AREA_CODE
    || exporuralSupportIdentifiers.has(input.publicIdentifier);
  const isExporuralLot = input.metadata?.entityType === 'EXPORURAL_COMMERCIAL_LOT';
  const sourceLabelPoint = Array.isArray(input.metadata?.labelSourcePoint)
    && input.metadata.labelSourcePoint.length === 2
    && input.metadata.labelSourcePoint.every((value) => typeof value === 'number')
    ? input.metadata.labelSourcePoint as Coordinate
    : null;
  return {
    id: entityId(input.publicIdentifier),
    projectId: 'reference:fenasoja-2026',
    layerId: `reference:${input.layer}`,
    parentEntityId: input.parentPublicIdentifier ? entityId(input.parentPublicIdentifier) : null,
    publicIdentifier: input.publicIdentifier,
    name: input.name,
    description: input.description ?? null,
    classification: input.classification,
    verificationStatus: input.verificationStatus ?? (isExporuralLot ? 'VERIFIED' : 'NEEDS_REVIEW'),
    isSellable: input.classification === 'SELLABLE_LOT' || input.classification === 'INTERNAL_STAND',
    isArchived: false,
    geometry: geometry(
      input.polygon,
      input.height,
      isExporural ? EXPORURAL_GEOMETRY_VERSION : 1,
      isExporural ? EXPORURAL_GEOMETRY_VERSION : null,
    ),
    metadata: {
      seedManaged: true,
      sourceRevision: isExporural ? OFFICIAL_REFERENCE_REVISION : NON_EXPORURAL_SOURCE_REVISION,
      source: 'Mapa oficial Fenasoja 2026 — PDF Mapa do Parque 300x200',
      cartographicConfidence: 'official_visual_reference',
      officialMeasurements: false,
      sourcePdfPolygon: input.polygon,
      parentPublicIdentifier: input.parentPublicIdentifier ?? null,
      buyerDataImported: false,
      ...(isExporural ? {
        areaCode: EXPORURAL_AREA_CODE,
        geometryRevision: EXPORURAL_GEOMETRY_REVISION,
        ...(sourceLabelPoint ? { labelAnchor: pdfToLocal(sourceLabelPoint) } : {}),
      } : {}),
      ...input.metadata,
    },
  };
}

function pavilionModuleGeometry(
  pavilion: MapEntity,
  cell: CommercialPavilionReferenceCell,
  facingRadians: number,
  projection: CommercialPavilionReferenceProjection,
): PolygonGeometry {
  const projectPoint = pavilionModulePointProjector(pavilion, facingRadians, projection);
  const normalizedFootprint = cell.shape?.footprint ?? [
    [cell.centerX - cell.width / 2, cell.centerZ - cell.depth / 2],
    [cell.centerX + cell.width / 2, cell.centerZ - cell.depth / 2],
    [cell.centerX + cell.width / 2, cell.centerZ + cell.depth / 2],
    [cell.centerX - cell.width / 2, cell.centerZ + cell.depth / 2],
  ];
  const corners = normalizedFootprint.map(projectPoint);
  corners.push([...corners[0]] as Coordinate);
  return {
    id: null,
    type: 'Polygon',
    coordinates: [corners],
    elevation: pavilion.geometry.elevation,
    extrusionHeight: 0,
    rotation: facingRadians,
    geometryVersion: 1,
    calibrationVersion: null,
  };
}

function pavilionModulePointProjector(
  pavilion: MapEntity,
  facingRadians: number,
  projection: CommercialPavilionReferenceProjection,
): (point: readonly [number, number]) => Coordinate {
  const ring = pavilion.geometry.coordinates[0];
  const xs = ring.map(([x]) => x);
  const zs = ring.map(([, z]) => z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const modelBounds = commercialPavilionModelBounds({
    width: maxX - minX,
    depth: maxZ - minZ,
  }, facingRadians);
  const shortSide = Math.min(modelBounds.width, modelBounds.depth);
  const clearWidth = modelBounds.width - 2 * shortSide * 0.025 - 2 * shortSide * 0.065;
  const clearDepth = modelBounds.depth - 2 * shortSide * 0.025 - 2 * shortSide * 0.065;
  const projectionFrame = createCommercialPavilionReferenceProjectionFrame(
    projection,
    { width: clearWidth, depth: clearDepth },
  );
  const cosine = Math.cos(facingRadians);
  const sine = Math.sin(facingRadians);
  return (point) => {
    const [localX, localZ] = projectCommercialPavilionReferencePoint(
      point,
      projectionFrame,
    );
    return [
      centerX + localX * cosine + localZ * sine,
      centerZ - localX * sine + localZ * cosine,
    ];
  };
}

function pavilionModuleLabelAnchor(
  pavilion: MapEntity,
  cell: CommercialPavilionReferenceCell,
  facingRadians: number,
  projection: CommercialPavilionReferenceProjection,
): Coordinate {
  return pavilionModulePointProjector(
    pavilion,
    facingRadians,
    projection,
  )(cell.labelAnchor);
}

const officialBaseEntities = entityInputs.map(toEntity);

interface PavilionModuleReference {
  publicIdentifier: string;
  pavilionNumber: number;
  block: string;
  layoutRevision: string;
  source: string;
  facingRadians: number;
  segmentId: string | null;
  cells: readonly CommercialPavilionReferenceCell[];
  projection?: CommercialPavilionReferenceProjection;
}

const pavilionModuleReferences: readonly PavilionModuleReference[] = [
  {
    publicIdentifier: 'B1',
    pavilionNumber: 1,
    block: 'P1',
    layoutRevision: '2026.4-p1.2',
    source: 'Croqui Pavilhão 1 - Fenasoja 2026.pdf',
    facingRadians: Math.PI / 2,
    segmentId: 'industria-comercio-servicos',
    cells: PAVILION1_COMMERCIAL_REFERENCE_CELLS,
    projection: PAVILION1_COMMERCIAL_REFERENCE_PROJECTION,
  },
  {
    publicIdentifier: 'B2',
    pavilionNumber: 14,
    block: 'P14',
    layoutRevision: '2026.4-p14.1',
    source: 'Anexo 2 e Anexo 6 — Pavilhão 14 — Comércio e Artesanato',
    facingRadians: Math.PI / 2,
    segmentId: 'industria-comercio-servicos',
    cells: PAVILION14_COMMERCIAL_REFERENCE_CELLS,
  },
  {
    publicIdentifier: 'B3',
    pavilionNumber: 12,
    block: 'P12',
    layoutRevision: '2026.4-p12.1',
    source: 'Anexo 1 e Anexo 6 — Pavilhão 12 — Indústria, Comércio e Serviços',
    facingRadians: Math.PI,
    segmentId: 'industria-comercio-servicos',
    cells: PAVILION12_COMMERCIAL_REFERENCE_CELLS,
  },
  {
    publicIdentifier: 'B4',
    pavilionNumber: 8,
    block: 'P8',
    layoutRevision: '2026.4-p8.1',
    source: 'Croqui Pavilhão 8- Fenasoja 2026 com cozinha_page-0001 (2).jpg',
    facingRadians: Math.PI,
    segmentId: 'industria-comercio-servicos',
    cells: PAVILION8_COMMERCIAL_REFERENCE_CELLS,
    projection: PAVILION8_COMMERCIAL_REFERENCE_PROJECTION,
  },
  {
    publicIdentifier: 'B5',
    pavilionNumber: 13,
    block: 'P13',
    layoutRevision: '2026.4-p13.1',
    source: 'Croqui Pavilhão 13 - Fenasoja 2026_page-0001.jpg',
    facingRadians: Math.PI,
    segmentId: 'industria-comercio-servicos',
    cells: PAVILION13_COMMERCIAL_REFERENCE_CELLS,
    projection: PAVILION13_COMMERCIAL_REFERENCE_PROJECTION,
  },
  {
    publicIdentifier: 'B6',
    pavilionNumber: 3,
    block: 'P3',
    layoutRevision: '2026.4-p3.3',
    source: 'Croqui Pavilhão 3 - Fenasoja 2026.pdf',
    facingRadians: Math.PI,
    segmentId: 'industria-comercio-servicos',
    cells: PAVILION3_COMMERCIAL_REFERENCE_CELLS,
  },
  {
    publicIdentifier: 'B8',
    pavilionNumber: 5,
    block: 'P5',
    layoutRevision: '2026.4-p5.1',
    source: 'Croqui Pavilhão 5 - Fenasoja 2026.pdf',
    facingRadians: 0,
    segmentId: null,
    cells: PAVILION5_COMMERCIAL_REFERENCE_CELLS,
  },
];

const pavilionModuleEntities: MapEntity[] = pavilionModuleReferences.flatMap((reference) => {
  const pavilion = officialBaseEntities.find(
    (entity) => entity.publicIdentifier === reference.publicIdentifier,
  );
  if (!pavilion) {
    throw new Error(
      `${reference.publicIdentifier}: pavilhão oficial não encontrado para projetar os módulos internos.`,
    );
  }
  const projection = reference.projection
    ?? DEFAULT_COMMERCIAL_PAVILION_REFERENCE_PROJECTION;
  return reference.cells.map((cell) => {
    const publicIdentifier = `${reference.publicIdentifier}-M${String(cell.number).padStart(3, '0')}`;
    const normalizedFootprint = cell.shape?.footprint ?? [
      [cell.centerX - cell.width / 2, cell.centerZ - cell.depth / 2],
      [cell.centerX + cell.width / 2, cell.centerZ - cell.depth / 2],
      [cell.centerX + cell.width / 2, cell.centerZ + cell.depth / 2],
      [cell.centerX - cell.width / 2, cell.centerZ + cell.depth / 2],
      [cell.centerX - cell.width / 2, cell.centerZ - cell.depth / 2],
    ] as const;
    const renderParts = cell.shape?.renderParts ?? [cell];
    return {
      id: entityId(publicIdentifier),
      projectId: pavilion.projectId,
      layerId: 'reference:commercial',
      parentEntityId: pavilion.id,
      segmentId: reference.segmentId,
      ...(reference.segmentId ? { segmentSource: 'derived' as const } : {}),
      publicIdentifier,
      name: `Módulo ${cell.label}`,
      description: `Módulo comercial neutro do Pavilhão ${reference.pavilionNumber}, sem expositor vinculado.`,
      classification: 'INTERNAL_STAND',
      verificationStatus: 'NEEDS_REVIEW',
      isSellable: true,
      isArchived: false,
      geometry: pavilionModuleGeometry(
        pavilion,
        cell,
        reference.facingRadians,
        projection,
      ),
      metadata: {
        seedManaged: true,
        sourceRevision: OFFICIAL_REFERENCE_REVISION,
        layoutRevision: reference.layoutRevision,
        ...(reference.projection ? {
          planCoordinateTransform: projection.coordinateTransform,
          projectionFit: projection.fit,
          projectionAlignment: {
            x: projection.alignX ?? 'center',
            z: projection.alignZ ?? 'center',
          },
          ...(projection.metricWidthM && projection.metricDepthM ? {
            metricReference: {
              widthM: projection.metricWidthM,
              depthM: projection.metricDepthM,
            },
          } : {}),
        } : {}),
        source: reference.source,
        cartographicConfidence: 'official_visual_reference',
        officialMeasurements: false,
        buyerDataImported: false,
        parentPublicIdentifier: reference.publicIdentifier,
        pavilionModuleKey: cell.id,
        pavilionPublicIdentifier: reference.publicIdentifier,
        pavilionNumber: reference.pavilionNumber,
        commercialBlock: reference.block,
        moduleNumber: cell.number,
        lotNumber: cell.lotNumber,
        moduleType: cell.type,
        areaM2: null,
        areaAssignment: 'unassigned',
        normalizedFootprint: {
          centerX: cell.centerX,
          centerZ: cell.centerZ,
          width: cell.width,
          depth: cell.depth,
        },
        normalizedFootprintPolygon: normalizedFootprint,
        renderParts: renderParts.map((part) => ({
          centerX: part.centerX,
          centerZ: part.centerZ,
          width: part.width,
          depth: part.depth,
        })),
        normalizedLabelAnchor: cell.labelAnchor,
        orientation: cell.orientation,
        sequenceOrientation: cell.sequenceOrientation,
        labelAnchor: pavilionModuleLabelAnchor(
          pavilion,
          cell,
          reference.facingRadians,
          projection,
        ),
        sortOrder: cell.sortOrder,
        group: cell.group,
        cluster: cell.cluster,
        sourceDiscrepancy: cell.source.discrepancy,
        ...(reference.segmentId ? {
          segmentId: reference.segmentId,
          segmentCode: 'INDUSTRIA_COMERCIO_SERVICOS',
          segmentName: 'Indústria, Comércio e Serviços',
        } : {}),
      },
    } satisfies MapEntity;
  });
});

export const OFFICIAL_REFERENCE_ENTITIES = [
  ...officialBaseEntities,
  ...pavilionModuleEntities,
].map(withCommercialMapSegmentMetadata);

const officialLotEntities = OFFICIAL_REFERENCE_ENTITIES.filter((entity) => (
  entity.classification === 'SELLABLE_LOT' || entity.classification === 'INTERNAL_STAND'
));

export const OFFICIAL_REFERENCE_LOTS: CommercialLot[] = officialLotEntities.map((entity) => {
  const isPavilionModule = entity.classification === 'INTERNAL_STAND';
  const block = isPavilionModule
    ? String(entity.metadata.commercialBlock)
    : String(entity.metadata.block);
  const number = String(entity.metadata.lotNumber);
  const exporuralReference = getExporuralReference(block, number);
  const officialAreaSqm = exporuralReference?.officialAreaSqm ?? null;
  const calculatedAreaSqm = exporuralReference
    ? sourcePolygonAreaSqm(exporuralReference.sourcePolygon)
    : null;
  return {
    id: isPavilionModule
      ? `reference:2026:lot:${slug(entity.publicIdentifier)}`
      : `reference:2026:lot:${slug(`${block}-${number}`)}`,
    entityId: entity.id,
    publicIdentifier: entity.publicIdentifier,
    block,
    lotNumber: number,
    levelLabel: null,
    displayName: isPavilionModule ? `Módulo ${number}` : `Lote ${number}`,
    description: isPavilionModule
      ? `Módulo comercial neutro do Pavilhão ${String(entity.metadata.pavilionNumber)}, sem expositor vinculado.`
      : `Unidade numerada da Quadra ${block} conforme a planta oficial Fenasoja 2026.`,
    status: 'BLOCKED',
    officialAreaSqm,
    calculatedAreaSqm,
    areaValidationStatus: exporuralReference ? 'VALIDATED' : 'UNVALIDATED',
    frontageMeters: null,
    depthMeters: null,
    pricingMode: 'NOT_FOR_SALE',
    basePrice: null,
    pricePerSqm: null,
    askingPrice: null,
    minimumPrice: null,
    infrastructure: [],
    hasElectricity: false,
    hasWater: false,
    hasInternet: false,
    isCorner: false,
    isCovered: isPavilionModule,
    accessibilityNotes: null,
    commercialNotes: null,
    internalNotes: null,
    currentBuyer: null,
    reservationExpiresAt: null,
    saleDate: null,
    salespersonName: null,
    activeContractNumber: null,
    archivedAt: null,
    createdBy: null,
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
  };
});

export const OFFICIAL_REFERENCE_DATA: CommercialMapData = {
  source: 'official-reference',
  sourceMessage: 'Planta oficial 2026 digitalizada sem importar compradores. Os 95 lotes da Exporural possuem áreas cadastrais validadas; os 1.144 módulos dos Pavilhões 1, 3, 5, 8, 12, 13 e 14 permanecem sem área individual e todos os 1.406 lotes/módulos ficam bloqueados até liberação comercial.',
  project: {
    id: 'reference:fenasoja-2026',
    orgId: null,
    name: 'Parque Fenasoja — referência oficial 2026',
    description: 'Digitalização versionada do mapa oficial de 29/04/2026, com quadras, lotes, vias e infraestrutura; sem dados de ocupação empresarial.',
    coordinateSystem: 'LOCAL_NORMALIZED',
    referenceWidth: MAP_REFERENCE_WIDTH,
    referenceHeight: MAP_REFERENCE_HEIGHT,
    activeVersion: 6,
    isPublished: false,
    referenceRevision: OFFICIAL_REFERENCE_REVISION,
  },
  calibration: {
    id: 'reference:2026:calibration',
    projectId: 'reference:fenasoja-2026',
    referenceImagePath: OFFICIAL_REFERENCE_IMAGE,
    referenceImageUrl: OFFICIAL_REFERENCE_IMAGE,
    opacity: 0.2,
    isLocked: true,
    imageOffsetX: 0,
    imageOffsetY: 0,
    imageScaleX: 1,
    imageScaleY: 1,
    imageRotationDegrees: 0,
    pointA: null,
    pointB: null,
    knownDistanceMeters: null,
    mapUnitsPerMeter: null,
    status: 'UNVALIDATED',
    version: 5,
  },
  layers: DEFAULT_REFERENCE_LAYERS,
  entities: OFFICIAL_REFERENCE_ENTITIES,
  lots: OFFICIAL_REFERENCE_LOTS,
};
