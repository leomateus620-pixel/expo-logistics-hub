import type { Coordinate } from '../types';

export type ExporuralBlock = 'R' | 'S';

export interface ExporuralLotReference {
  block: ExporuralBlock;
  lotNumber: string;
  officialAreaSqm: number;
  /**
   * Vertices in the source-plan coordinate system. They are converted to the
   * local scene by officialReference2026.ts so the original park alignment is
   * preserved.
   */
  sourcePolygon: Coordinate[];
  sourceAnnex: string;
  reviewerNote: string;
  geometryKind: 'regular' | 'rounded-end' | 'trapezoid' | 'curved-fan';
  labelSourcePoint?: Coordinate;
}

export const EXPORURAL_AREA_CODE = 'EXPORURAL';
export const EXPORURAL_GEOMETRY_REVISION = '2026.4-exporural.1';
export const EXPORURAL_GEOMETRY_VERSION = 5;

/**
 * Cross-calibration from repeated 30 m x 15 m cadastral modules in Annexes
 * 2–4. The official park crop uses a uniform 0.021818… scene/source factor;
 * 6.875 source units per metre therefore equals 0.15 scene units per metre.
 */
export const EXPORURAL_SOURCE_UNITS_PER_METER = 6.875;
export const EXPORURAL_MAP_UNITS_PER_METER = 0.15;
export const EXPORURAL_AREA_TOLERANCE_PERCENT = 0.15;

export const EXPORURAL_SOURCE_MANIFEST = {
  topology: 'Exporural.jpg',
  cadastral: ['IMG_8480.jpeg', 'IMG_8481.jpeg', 'IMG_8482.jpeg'],
  fullMap: {
    filename: 'codex-clipboard-e3d3649c-c6c2-4167-9615-c2019fb634f4.jpg',
    role: 'official-cartographic-source-of-truth',
    sha256: '650080ace6fa8656863f9decc98d5fc6721eb8a2e91f48e18a28e280434eea38',
  },
  detailReferences: [
    {
      role: 'a8-and-central-rua-15-de-novembro',
      current: { filename: '6e76daf3-60ba-40e1-901b-53a5a9c04a05.png', sha256: 'f425d874e10581b9d6f59edb0dd06e4e7b341e3b1b581f660fb843616b5e049c' },
      official: { filename: '183e3347-b274-4393-9c4e-15cba2389bc3.png', sha256: 'b47bf70672388c6fb81bf6b97ca510ae002412e4edc0122e754fed09472c653c' },
    },
    {
      role: 'a9-western-street-continuity',
      current: { filename: '3ecc5c43-1ef5-44df-8a91-ee8fe16a6402.png', sha256: '9e5aaad41f3cdc00c08409a673db2385bac36a98bdbd9d888a6dcb359d456501' },
      official: { filename: '04ca722b-7e9c-4d19-9615-7c22e41dd00f.png', sha256: 'be457f724827ff9e8649e1f3b591fb0588c9dd775cb3c603de2bb5fa48f3d7ee' },
    },
    {
      role: 'a7-western-lot-extension',
      current: { filename: '52f185d3-0b95-4445-b5cf-22d050cf9f36.png', sha256: '2fd0fbf1778dcbb75aa59a32c8ab1acb9f0cc32d485d3e8d2563a1d5d9d15727' },
      official: { filename: 'f7e16047-7c04-49d3-9c92-9ceee9ba1bc2.png', sha256: '67d190f059898a330379f19aa92be856027551fbe4a47910ad5d0ad2b1ea97da' },
    },
    {
      role: 'southern-r56-r59-perimeter',
      current: { filename: 'b0e897c7-f592-4bc6-a667-9a5cfc605d7e.png', sha256: '63fd6dbefd669bae650bb6a0fd25c3fa8b83596f21f4cfe587dc016dd40c992a' },
      official: { filename: '60f64bd3-b01e-4f96-bbf2-c9b356ef1d2a.png', sha256: 'e19c13c602dbaa42bc1b5e186debc9d756dd5416609530e7021e0df2bbdbbf22' },
    },
    {
      role: 'central-islands-28-30-and-41-43',
      current: { filename: '59ad9094-460d-463c-a582-c7bc958fb109.png', sha256: 'ae42a37f97570ed7994c61a851a82f024949948454532d87b6737b7f2a7bc4e2' },
      official: { filename: 'codex-clipboard-e3d3649c-c6c2-4167-9615-c2019fb634f4.jpg', sha256: '650080ace6fa8656863f9decc98d5fc6721eb8a2e91f48e18a28e280434eea38' },
    },
  ],
  calibrationControls: [
    'Quadra S: módulos repetidos de 30,00 m × 15,00 m',
    'Quadra R: módulos repetidos de 500,00 m² com cotas longitudinais próximas de 40,00 m',
    'Corredores transversais cotados em 6,00 m',
  ],
  unavailableReferences: ['Anexos 5, 6 e 7 mencionados no briefing, mas não fornecidos nesta execução'],
} as const;

const SOURCE_AREA_PER_SQM = EXPORURAL_SOURCE_UNITS_PER_METER ** 2;
const DEFAULT_SOURCE_ANNEX = 'Anexos 2–4 · planta cadastral Exporural 2026';

function lotNumber(value: number) {
  return String(value).padStart(2, '0');
}

function polygonArea(points: Coordinate[]) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
}

function fitPolygonAreaX(points: Coordinate[], officialAreaSqm: number, anchorX: number) {
  const currentArea = polygonArea(points);
  if (currentArea <= 0) throw new Error('Polígono Exporural sem área.');
  const scaleX = (officialAreaSqm * SOURCE_AREA_PER_SQM) / currentArea;
  return points.map(([x, y]) => [anchorX + (x - anchorX) * scaleX, y] as Coordinate);
}

function rectangleForArea(x: number, y: number, depth: number, officialAreaSqm: number): Coordinate[] {
  const width = (officialAreaSqm * SOURCE_AREA_PER_SQM) / depth;
  return [[x, y], [x + width, y], [x + width, y + depth], [x, y + depth]];
}

function roundedEndForArea(
  x: number,
  y: number,
  depth: number,
  officialAreaSqm: number,
  end: 'left' | 'right',
  radius = 27,
): Coordinate[] {
  const nominalWidth = (officialAreaSqm * SOURCE_AREA_PER_SQM) / depth;
  const width = nominalWidth + radius * 0.24;
  const raw = end === 'left'
    ? [
        [x + radius, y],
        [x + width, y],
        [x + width, y + depth],
        [x, y + depth],
        [x, y + radius],
        [x + radius * 0.12, y + radius * 0.54],
        [x + radius * 0.48, y + radius * 0.14],
      ] as Coordinate[]
    : [
        [x, y],
        [x + width - radius, y],
        [x + width - radius * 0.48, y + radius * 0.12],
        [x + width - radius * 0.12, y + radius * 0.48],
        [x + width, y + radius],
        [x + width, y + depth - radius],
        [x + width - radius * 0.12, y + depth - radius * 0.48],
        [x + width - radius * 0.48, y + depth - radius * 0.12],
        [x + width - radius, y + depth],
        [x, y + depth],
      ] as Coordinate[];
  return fitPolygonAreaX(raw, officialAreaSqm, x);
}

function trapezoidForArea(
  x: number,
  y: number,
  depthLeft: number,
  depthRight: number,
  officialAreaSqm: number,
  topSkew = 0,
): Coordinate[] {
  const nominalWidth = (officialAreaSqm * SOURCE_AREA_PER_SQM) / ((depthLeft + depthRight) / 2);
  const raw: Coordinate[] = [
    [x, y],
    [x + nominalWidth, y + topSkew],
    [x + nominalWidth, y + depthRight],
    [x, y + depthLeft],
  ];
  return fitPolygonAreaX(raw, officialAreaSqm, x);
}

function curvedFanForArea(
  x: number,
  y: number,
  depthLeft: number,
  depthRight: number,
  officialAreaSqm: number,
  curveLift: number,
): Coordinate[] {
  const nominalWidth = (officialAreaSqm * SOURCE_AREA_PER_SQM) / ((depthLeft + depthRight) / 2);
  const raw: Coordinate[] = [
    [x, y],
    [x + nominalWidth, y],
    [x + nominalWidth, y + depthRight],
    [x + nominalWidth * 0.72, y + depthLeft * 0.28 + depthRight * 0.72 - curveLift * 0.65],
    [x + nominalWidth * 0.46, y + (depthLeft + depthRight) / 2 - curveLift],
    [x + nominalWidth * 0.2, y + depthLeft * 0.8 + depthRight * 0.2 - curveLift * 0.55],
    [x, y + depthLeft],
  ];
  return fitPolygonAreaX(raw, officialAreaSqm, x);
}

function maxX(points: Coordinate[]) {
  return Math.max(...points.map(([x]) => x));
}

const rAreas: Record<number, number> = {
  1: 896.85, 2: 896.85, 3: 995.45, 4: 1000,
  5: 450, 6: 450, 7: 450, 8: 450,
  9: 500, 10: 500, 11: 500, 12: 500,
  13: 575.85, 14: 896.85, 15: 472.1,
  16: 450, 17: 450, 18: 450, 19: 450,
  20: 500, 21: 500, 22: 500, 23: 500, 24: 500, 25: 500, 26: 500, 27: 500,
  28: 495, 29: 495, 30: 495,
  31: 500, 32: 500, 33: 500, 34: 500, 35: 500, 36: 500, 37: 500, 38: 500, 39: 500,
  40: 491.26,
  41: 498.16, 42: 498.16, 43: 498.16,
  44: 500, 45: 500, 46: 500, 47: 598.9,
  48: 500, 49: 500, 50: 500, 51: 500, 52: 500, 53: 500, 54: 500,
  55: 705.35,
  56: 471, 57: 471, 58: 471, 59: 471,
};

const sAreas: Record<number, number> = {
  1: 467.13,
  2: 450, 3: 450, 4: 450, 5: 450, 6: 450, 7: 450, 8: 450, 9: 450, 10: 450,
  11: 563.94,
  12: 450, 13: 450, 14: 450, 15: 450, 16: 450, 17: 450,
  18: 348.98,
  19: 411.83,
  20: 450, 21: 450, 22: 450, 23: 450, 24: 450, 25: 450,
  26: 650.05,
  27: 450, 28: 450, 29: 450, 30: 450, 31: 450, 32: 450, 33: 450, 34: 450, 35: 450, 36: 450,
};

const references: ExporuralLotReference[] = [];

function pushReference(
  block: ExporuralBlock,
  number: number,
  sourcePolygon: Coordinate[],
  geometryKind: ExporuralLotReference['geometryKind'],
  reviewerNote: string,
) {
  const officialAreaSqm = block === 'R' ? rAreas[number] : sAreas[number];
  references.push({
    block,
    lotNumber: lotNumber(number),
    officialAreaSqm,
    sourcePolygon,
    sourceAnnex: DEFAULT_SOURCE_ANNEX,
    reviewerNote,
    geometryKind,
    labelSourcePoint: [
      sourcePolygon.reduce((sum, [x]) => sum + x, 0) / sourcePolygon.length,
      sourcePolygon.reduce((sum, [, y]) => sum + y, 0) / sourcePolygon.length,
    ],
  });
}

function pushHorizontalRow(
  block: ExporuralBlock,
  numbers: number[],
  startX: number,
  y: number,
  depth: number,
  special: Partial<Record<number, 'left' | 'right'>> = {},
) {
  let cursor = startX;
  numbers.forEach((number) => {
    const officialAreaSqm = block === 'R' ? rAreas[number] : sAreas[number];
    const rounded = special[number];
    const polygon = rounded
      ? roundedEndForArea(cursor, y, depth, officialAreaSqm, rounded)
      : rectangleForArea(cursor, y, depth, officialAreaSqm);
    pushReference(
      block,
      number,
      polygon,
      rounded ? 'rounded-end' : 'regular',
      rounded
        ? 'Terminal cadastral com canto radiado; área ajustada à matrícula sem perder o alinhamento da fileira.'
        : 'Módulo cadastral alinhado às divisas impressas.',
    );
    cursor = maxX(polygon);
  });
}

/**
 * Official R-islands have one continuous, level frontage and one continuous
 * rear edge. Only the outside corners are softened; internal dividers remain
 * full-depth and shared by adjacent parcels.
 */
function roundedIslandParcelForArea(
  x: number,
  y: number,
  depth: number,
  officialAreaSqm: number,
  edge: 'left' | 'none' | 'right',
  radius = 12,
) {
  const nominalWidth = (officialAreaSqm * SOURCE_AREA_PER_SQM) / depth;
  const width = nominalWidth + (edge === 'none' ? 0 : radius * 0.18);
  if (edge === 'none') return rectangleForArea(x, y, depth, officialAreaSqm);
  const raw: Coordinate[] = edge === 'left'
    ? [
        [x + radius, y], [x + width, y], [x + width, y + depth], [x + radius, y + depth],
        [x + 4, y + depth - 4], [x, y + depth - radius], [x, y + radius], [x + 4, y + 4],
      ]
    : [
        [x, y], [x + width - radius, y], [x + width - 4, y + 4], [x + width, y + radius],
        [x + width, y + depth - radius], [x + width - 4, y + depth - 4],
        [x + width - radius, y + depth], [x, y + depth],
      ];
  return fitPolygonAreaX(raw, officialAreaSqm, x);
}

function pushEqualDepthIsland(
  numbers: number[],
  startX: number,
  y: number,
  depth: number,
  softenLast = true,
) {
  let cursor = startX;
  numbers.forEach((number, index) => {
    const edge = index === 0
      ? 'left'
      : index === numbers.length - 1 && softenLast
        ? 'right'
        : 'none';
    const polygon = roundedIslandParcelForArea(cursor, y, depth, rAreas[number], edge);
    pushReference(
      'R',
      number,
      polygon,
      edge === 'none' ? 'regular' : 'rounded-end',
      edge === 'none'
        ? 'Ilha cadastral com frente e fundo nivelados e divisas internas contínuas.'
        : 'Terminal externo suavizado sem deformar a rua nem a divisa compartilhada.',
    );
    cursor = maxX(polygon);
  });
  return cursor;
}

// Quadra S: four independent bands separated by Rua Bruno Schwartz and the
// transversal Portão 8 corridor. Numbering deliberately follows the source.
pushHorizontalRow('S', [36, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26], 4004, 1277, 206.25, { 26: 'right' });
pushHorizontalRow('S', [25, 24, 23, 22, 21, 20, 19], 5227, 1277, 206.25, { 19: 'right' });
pushHorizontalRow('S', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 4004, 1519, 206.25, { 1: 'left', 11: 'right' });
pushHorizontalRow('S', [12, 13, 14, 15, 16, 17, 18], 5227, 1519, 206.25, { 12: 'left', 18: 'right' });

// Quadra R: northern/western cadastral band.
pushHorizontalRow('R', [15, 16, 17, 18, 19, 5, 6, 7, 8], 3287, 1763, 295, { 15: 'left', 8: 'right' });

// Quadra R: long central island, bounded by Johan Muller, Gustavo Bessel and
// Rua 15 de Novembro. R-40 is the radiused southern terminal.
pushHorizontalRow('R', [9, 10, 11, 12, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40], 3994, 1763, 278, { 9: 'left', 40: 'right' });

// Quadra R eastern island. The former Semear monolith is represented by the
// independent R-53, R-54 and R-55 cadastral parcels; R-55 keeps its large arc.
pushHorizontalRow('R', [48, 49, 50, 51, 52, 53, 54, 55], 5227, 1763, 270, { 48: 'left', 55: 'right' });

// A7 western extension: the four official footprints share their printed
// edges. R-13 remains a shallow strip, R-14 follows the tapered west contour,
// and R-01/R-02 stay stacked beside Rua Pastor Albert Lehenbauer.
const r13Width = 297;
const r13LeftDepth = 85;
const r13RightDepth = (2 * rAreas[13] * SOURCE_AREA_PER_SQM) / r13Width - r13LeftDepth;
const r13RightBottom = 2080 + r13RightDepth;
pushReference('R', 13, [
  [3244, 2080], [3541, 2080], [3541, r13RightBottom], [3244, 2080 + r13LeftDepth],
], 'trapezoid', 'Faixa rasa de A7, com divisa contínua com R-14 e sem absorver B8.');

pushReference('R', 14, [
  [3541, 2080], [3687, 2080], [3687, 2385.226398], [3562, 2385.226398], [3541, r13RightBottom],
], 'trapezoid', 'Parcela longitudinal afunilada entre R-13 e a dupla R-01/R-02.');

const r01Depth = (rAreas[1] * SOURCE_AREA_PER_SQM) / 253;
pushReference('R', 1, rectangleForArea(3687, 2080, r01Depth, rAreas[1]), 'regular', 'Parcela cadastral superior da dupla R-01/R-02.');
pushReference('R', 2, rectangleForArea(3687, 2080 + r01Depth, r01Depth, rAreas[2]), 'regular', 'Parcela cadastral inferior da dupla R-01/R-02.');

const r03Width = 264;
const r03Depth = (rAreas[3] * SOURCE_AREA_PER_SQM) / r03Width;
const r04Depth = (rAreas[4] * SOURCE_AREA_PER_SQM) / r03Width;
pushReference('R', 3, trapezoidForArea(3994, 2080, r03Depth, r03Depth - 2, rAreas[3], 1), 'trapezoid', 'Parcela superior de grande profundidade, adjacente à Rua Gustavo Bessel.');
pushReference('R', 4, trapezoidForArea(3994, 2080 + r03Depth, r04Depth - 2, r04Depth, rAreas[4], -1), 'trapezoid', 'Parcela inferior mantida fora do footprint do Mirante.');

// R-20–R-27: individual fan polygons following the western curved boundary.
{
  const depths = [340, 332, 317, 296, 282, 286, 300, 319, 337];
  let cursor = 4261;
  for (let index = 0; index < 8; index += 1) {
    const number = 20 + index;
    const polygon = curvedFanForArea(cursor, 2080, depths[index], depths[index + 1], rAreas[number], 6 + Math.abs(3.5 - index) * 0.7);
    pushReference('R', number, polygon, 'curved-fan', 'Divisas em leque e borda multissegmentada conforme a curva ocidental.');
    cursor = maxX(polygon);
  }
}

// Three independent islands south of Rua Gustavo Bessel. Their old generated
// fans produced concave rear edges and visually swallowed Rua Emanuel
// Brachmann; the official plan uses level, continuous blocks.
pushEqualDepthIsland([28, 29, 30], 4900, 2080, 252);
pushEqualDepthIsland([41, 42, 43], 5228, 2080, 252);
const r47Left = pushEqualDepthIsland([44, 45, 46], 5520, 2080, 252, false);
const r47TopRight = 5940;
const r47AverageWidth = (rAreas[47] * SOURCE_AREA_PER_SQM) / 252;
const r47BottomRight = r47Left + 2 * r47AverageWidth - (r47TopRight - r47Left);
pushReference('R', 47, [
  [r47Left, 2080], [r47TopRight, 2080], [r47BottomRight, 2332], [r47Left, 2332],
], 'trapezoid', 'Terminal leste fortemente afunilado junto ao contorno viário do parque.');

// Southern perimeter R-56–R-59: one contiguous fan block below Rua Emanuel
// Brachmann. The north frontage is level; internal dividers are shared; only
// the outside contour follows the diagonal/rounded park boundary.
{
  const top = 2374;
  const targetArea = rAreas[56] * SOURCE_AREA_PER_SQM;
  const r57AverageDepth = targetArea / 99;
  const r57LeftBottom = top + r57AverageDepth - 6;
  const r57RightBottom = top + r57AverageDepth + 6;
  const r56LeftBottom = top + (2 * targetArea) / 129 - (r57LeftBottom - top);

  pushReference('R', 56, [
    [5378, top], [5507, top], [5507, r57LeftBottom], [5378, r56LeftBottom],
  ], 'trapezoid', 'Terminal oeste do leque, com frente reta e limite sul diagonal.');
  pushReference('R', 57, [
    [5507, top], [5606, top], [5606, r57RightBottom], [5507, r57LeftBottom],
  ], 'trapezoid', 'Parcela central que mantém a inclinação contínua do limite sul.');

  const r58RightBottom = 2620;
  const r58Width = targetArea / (((r57RightBottom - top) + (r58RightBottom - top)) / 2);
  const r58Right = 5606 + r58Width;
  pushReference('R', 58, [
    [5606, top], [r58Right, top], [r58Right, r58RightBottom], [5606, r57RightBottom],
  ], 'trapezoid', 'Parcela central com divisas contínuas e limite sul ascendente.');

  const r59 = fitPolygonAreaX([
    [r58Right, top], [5842, top], [5834, 2410], [5808, 2480],
    [5778, 2555], [5752, 2605], [5728, 2620], [r58Right, r58RightBottom],
  ], rAreas[59], r58Right);
  pushReference('R', 59, r59, 'curved-fan', 'Terminal leste afunilado e suavizado junto à via perimetral.');
}

export const EXPORURAL_LOT_REFERENCES = references
  .slice()
  .sort((a, b) => a.block.localeCompare(b.block) || a.lotNumber.localeCompare(b.lotNumber));

export const EXPORURAL_OFFICIAL_AREAS = Object.fromEntries(
  EXPORURAL_LOT_REFERENCES.map((reference) => [`${reference.block}-${reference.lotNumber}`, reference.officialAreaSqm]),
) as Readonly<Record<string, number>>;

export const EXPORURAL_TOTALS = {
  R: {
    lotCount: 59,
    officialAreaSqm: 31_492.94,
  },
  S: {
    lotCount: 36,
    officialAreaSqm: 16_391.93,
  },
  all: {
    lotCount: 95,
    officialAreaSqm: 47_884.87,
  },
} as const;

export const EXPORURAL_ROAD_IDENTIFIERS = [
  'RUA-BRUNO-SCHWARTZ',
  'RUA-JOHAN-MULLER',
  'RUA-GUSTAVO-BESSEL',
  'RUA-15-NOVEMBRO',
  'RUA-EMANUEL-BRACHMANN',
  'RUA-PASTOR-ALBERT-LEHENBAUER',
  'RUA-UBIRETAMA',
] as const;

export const EXPORURAL_SUPPORT_IDENTIFIERS = [
  'B37',
  'B38',
  'C4',
  'E-01',
  'E-02',
  'E-06',
] as const;

/** Explicit user-directed removals for reference 2026.4; host lots remain. */
export const EXPORURAL_REMOVED_IDENTIFIERS = [
  'B35',
  'B36',
  'D6-01',
  'D6-02',
  'D6-03',
] as const;

export const EXPORURAL_PROTECTED_IDENTIFIERS = ['B7', 'B8', 'D3'] as const;

export function getExporuralReference(block: string, number: string | number) {
  const normalized = String(number).padStart(2, '0');
  return EXPORURAL_LOT_REFERENCES.find((reference) => reference.block === block && reference.lotNumber === normalized);
}

export function sourcePolygonAreaSqm(points: Coordinate[]) {
  return polygonArea(points) / SOURCE_AREA_PER_SQM;
}
