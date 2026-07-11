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

export const OFFICIAL_REFERENCE_REVISION = '2026.1';

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

function pdfToLocal([x, y]: PdfPoint): Coordinate {
  return [
    ((x - CROP.x) / CROP.width) * MAP_REFERENCE_WIDTH - MAP_REFERENCE_WIDTH / 2,
    ((y - CROP.y) / CROP.height) * MAP_REFERENCE_HEIGHT - MAP_REFERENCE_HEIGHT / 2,
  ];
}

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

function geometry(polygon: PdfPolygon, height = 0.16): PolygonGeometry {
  const ring = polygon.map(pdfToLocal);
  ring.push([...ring[0]] as Coordinate);
  return {
    id: null,
    type: 'Polygon',
    coordinates: [ring],
    elevation: 0,
    extrusionHeight: height,
    rotation: 0,
    geometryVersion: 1,
    calibrationVersion: null,
  };
}

const entityInputs: ReferenceEntityInput[] = [];
const lotKeys = new Set<string>();

function addEntity(input: ReferenceEntityInput) {
  entityInputs.push(input);
}

function addQuadra(code: string, bounds: PdfBounds, metadata?: Record<string, unknown>) {
  addEntity({
    publicIdentifier: `QUADRA-${code}`,
    name: `Quadra ${code}`,
    classification: 'QUADRA',
    layer: 'quadras',
    polygon: rectPdf(bounds),
    height: 0.025,
    metadata: { renderMode: 'outline', labelPriority: 'quadra', block: code, ...metadata },
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

// Official quadra envelopes. These are hierarchy/label boundaries, not lots.
([
  ['S', [3985, 1270, 5940, 1725]],
  ['R', [3230, 1760, 5960, 2575]],
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
));

// Quadra S — 01–36, preserving the two separated east/west bands.
addRow('S', [36, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26], [4026, 1277, 5185, 1479]);
addRow('S', [25, 24, 23, 22, 21, 20, 19], [5227, 1277, 5930, 1479]);
addRow('S', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [4038, 1519, 5185, 1722]);
addRow('S', [12, 13, 14, 15, 16], [5227, 1519, 5734, 1722]);
addLot('S', 17, rectPdf([5734, 1519, 5840, 1722], LOT_INSET), { infrastructureOverlay: 'B35' });
addLot('S', 18, rectPdf([5840, 1519, 5920, 1722], LOT_INSET));

// Quadra R — 01–59 distributed around four streets and event overlays.
addRow('R', [15, 16, 17, 18, 19], [3287, 1763, 3651, 2033]);
addRow('R', [5, 6, 7, 8], [3652, 1763, 3939, 2033]);
addRow('R', [9, 10, 11, 12], [3994, 1763, 4335, 2033]);
addRow('R', [31, 32, 33, 34, 35, 36, 37, 38, 39, 40], [4335, 1763, 5185, 2033]);
addRow('R', [48, 49, 50, 51, 52], [5227, 1763, 5649, 2033]);
addRow('R', [53, 54, 55], [5650, 1950, 5950, 2033]);
addLot('R', 13, rectPdf([3246, 2078, 3630, 2170], LOT_INSET));
addLot('R', 14, rectPdf([3540, 2172, 3685, 2420], LOT_INSET));
addLot('R', 1, rectPdf([3687, 2078, 3940, 2248], LOT_INSET));
addLot('R', 2, rectPdf([3687, 2248, 3940, 2420], LOT_INSET));
addLot('R', 3, rectPdf([3994, 2078, 4251, 2260], LOT_INSET));
addLot('R', 4, rectPdf([3994, 2260, 4251, 2443], LOT_INSET));
addRow('R', [20, 21, 22, 23], [4252, 2078, 4561, 2443]);
addRow('R', [24, 25, 26, 27], [4562, 2078, 4868, 2443]);
addRow('R', [28, 29, 30], [4910, 2078, 5186, 2330]);
addRow('R', [41, 42, 43], [5228, 2078, 5498, 2330]);
addRow('R', [44, 45, 46, 47], [5520, 2078, 5925, 2330]);
addRow('R', [56, 57, 58, 59], [5382, 2369, 5816, 2570]);

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
  ['RUA-BRUNO-SCHWARTZ', 'Rua Bruno Schwartz', rectPdf([3985, 1480, 5940, 1518])],
  ['RUA-JOHAN-MULLER', 'Rua Johan Muller', rectPdf([3985, 1723, 5940, 1762])],
  ['RUA-GUSTAVO-BESSEL', 'Rua Gustavo Bessel', rectPdf([3985, 2034, 5940, 2076])],
  ['RUA-EMANUEL-BRACHMANN', 'Rua Emanuel Brachmann', rectPdf([4980, 2331, 5940, 2370])],
  ['RUA-PASTOR-ALBERT-LEHENBAUER', 'Rua Pastor Albert Lehenbauer', rectPdf([3941, 1758, 3984, 2445])],
  ['RUA-15-NOVEMBRO', 'Rua 15 de Novembro', rectPdf([5186, 1758, 5227, 2370])],
  ['RUA-UBIRETAMA', 'Rua Ubiretama', rectPdf([5940, 1265, 5984, 2080])],
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

roadInputs.forEach(([publicIdentifier, name, polygon, classification = 'ROAD']) => addEntity({
  publicIdentifier,
  name,
  classification,
  layer: 'circulation',
  polygon,
  height: classification === 'ROAD' ? 0.032 : 0.026,
  metadata: { labelPriority: 'road', isSeparator: true },
}));

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
  ['B1', 'Pavilhão 1 — Comércio e serviços', 'PAVILION', 'pavilions', [2310, 3570, 2700, 3820]],
  ['B2', 'Pavilhão 14 — Artesanato e comércio', 'PAVILION', 'pavilions', [2360, 3820, 2710, 4160]],
  ['B3', 'Pavilhão 12 — Indústria e comércio', 'PAVILION', 'pavilions', [2780, 3790, 3220, 4160]],
  ['B4', 'Pavilhão 8 — Indústria e comércio', 'PAVILION', 'pavilions', [3180, 3790, 3350, 4160]],
  ['B5', 'Pavilhão 13 — Comércio', 'PAVILION', 'pavilions', [3345, 3790, 3500, 4160]],
  ['B6', 'Pavilhão 3 — Comércio', 'PAVILION', 'pavilions', [3490, 3790, 3760, 4160]],
  ['B7', 'Pavilhão 4 — Cozinha da Soja', 'PAVILION', 'pavilions', [3495, 2475, 3670, 2575], { parent: 'N' }],
  ['B8', 'Pavilhão 5 — Floriculturas', 'PAVILION', 'pavilions', [3210, 2200, 3440, 2410]],
  ['B9', 'Pavilhões 6, 10 e 11 — Pecuária', 'PAVILION', 'pavilions', [2250, 2195, 3210, 2410]],
  ['B10', 'Pavilhão 7 — Agricultura familiar / soja e derivados', 'PAVILION', 'pavilions', [1950, 2195, 2250, 2410]],
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
  ['B22', 'Pavilhão Terceira Idade', 'PAVILION', 'pavilions', [720, 3520, 910, 3910]],
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
  ['B35', 'Simulador AGCO', 'ATTRACTION', 'structures', [5784, 1625], { parent: 'S', width: 96, depth: 120 }],
  ['B36', 'Palco Semear', 'EVENT_VENUE', 'structures', [5660, 1770, 5920, 2030], { parent: 'R', height: 1.05, metadata: { commercialLotsInsideFootprint: ['R-53', 'R-54', 'R-55'] } }],
  ['B37', 'Comissão Exporural', 'ADMINISTRATION', 'structures', [5380, 1324], { parent: 'S', width: 84, depth: 88 }],
  ['B38', 'Área de Lazer', 'ATTRACTION', 'structures', [5278, 1438], { parent: 'S', width: 88, depth: 82 }],
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

([
  ['D6-01', [5626, 1813]],
  ['D6-02', [5626, 1901]],
  ['D6-03', [5626, 1988]],
] as Array<[string, PdfPoint]>).forEach(([id, center], index) => addStructure(
  id,
  'Food Truck',
  'FOOD_AREA',
  'food',
  center,
  { parent: 'R', width: 42, depth: 74, height: 0.55, metadata: { legendCode: 'D6', instance: index + 1 } },
));

// Repeated official E markers are sanitary facilities, never water features.
const restroomCenters: PdfPoint[] = [
  [5247, 1340], [5893, 1617], [1700, 2007], [3221, 2075], [1074, 2387], [4931, 2427],
  [3348, 2534], [4998, 2638], [5115, 2645], [4645, 2660], [5073, 2698], [1059, 2991],
  [4623, 3020], [5055, 3030], [1607, 3052], [4968, 3080], [5082, 3087], [3632, 3157],
  [2407, 3218], [2411, 3273], [4351, 3319], [2279, 3648], [4968, 3764], [2391, 3886],
];
restroomCenters.forEach((center, index) => addStructure(
  `E-${String(index + 1).padStart(2, '0')}`,
  'Sanitários',
  'RESTROOM',
  'restrooms',
  center,
  { width: 42, depth: 34, height: 0.42, metadata: { legendCode: 'E', instance: index + 1 } },
));

// Large official areas and permanent footprints.
addStructure('PISTA-CAMPEIRA', 'Pista Campeira', 'LIVESTOCK_AREA', 'exporural', [1990, 1740, 3240, 2175], { height: 0.18 });
addStructure('PAVILHAO-09', 'Pavilhão 09', 'PAVILION', 'pavilions', [1660, 1900, 1950, 2390], { height: 1.32 });
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

function toEntity(input: ReferenceEntityInput): MapEntity {
  return {
    id: entityId(input.publicIdentifier),
    projectId: 'reference:fenasoja-2026',
    layerId: `reference:${input.layer}`,
    parentEntityId: input.parentPublicIdentifier ? entityId(input.parentPublicIdentifier) : null,
    publicIdentifier: input.publicIdentifier,
    name: input.name,
    description: input.description ?? null,
    classification: input.classification,
    verificationStatus: input.verificationStatus ?? 'NEEDS_REVIEW',
    isSellable: input.classification === 'SELLABLE_LOT' || input.classification === 'INTERNAL_STAND',
    isArchived: false,
    geometry: geometry(input.polygon, input.height),
    metadata: {
      seedManaged: true,
      sourceRevision: OFFICIAL_REFERENCE_REVISION,
      source: 'Mapa oficial Fenasoja 2026 — PDF Mapa do Parque 300x200',
      cartographicConfidence: 'official_visual_reference',
      officialMeasurements: false,
      sourcePdfPolygon: input.polygon,
      parentPublicIdentifier: input.parentPublicIdentifier ?? null,
      buyerDataImported: false,
      ...input.metadata,
    },
  };
}

export const OFFICIAL_REFERENCE_ENTITIES = entityInputs.map(toEntity);

const officialLotEntities = OFFICIAL_REFERENCE_ENTITIES.filter((entity) => entity.classification === 'SELLABLE_LOT');

export const OFFICIAL_REFERENCE_LOTS: CommercialLot[] = officialLotEntities.map((entity) => {
  const block = String(entity.metadata.block);
  const number = String(entity.metadata.lotNumber);
  return {
    id: `reference:2026:lot:${slug(`${block}-${number}`)}`,
    entityId: entity.id,
    publicIdentifier: entity.publicIdentifier,
    block,
    lotNumber: number,
    levelLabel: null,
    displayName: `Lote ${number}`,
    description: `Unidade numerada da Quadra ${block} conforme a planta oficial Fenasoja 2026.`,
    status: 'BLOCKED',
    officialAreaSqm: null,
    calculatedAreaSqm: null,
    areaValidationStatus: 'UNVALIDATED',
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
    isCovered: false,
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
  sourceMessage: 'Planta oficial 2026 digitalizada sem importar a lista de compradores. Os 262 lotes numerados permanecem bloqueados até validação de área, preço e disponibilidade comercial.',
  project: {
    id: 'reference:fenasoja-2026',
    orgId: null,
    name: 'Parque Fenasoja — referência oficial 2026',
    description: 'Digitalização versionada do mapa oficial de 29/04/2026, com quadras, lotes, vias e infraestrutura; sem dados de ocupação empresarial.',
    coordinateSystem: 'LOCAL_NORMALIZED',
    referenceWidth: MAP_REFERENCE_WIDTH,
    referenceHeight: MAP_REFERENCE_HEIGHT,
    activeVersion: 2,
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
    version: 2,
  },
  layers: DEFAULT_REFERENCE_LAYERS,
  entities: OFFICIAL_REFERENCE_ENTITIES,
  lots: OFFICIAL_REFERENCE_LOTS,
};
