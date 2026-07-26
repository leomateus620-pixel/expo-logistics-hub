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
export const EXPORURAL_GEOMETRY_REVISION = '2026.3-exporural.1';
export const EXPORURAL_GEOMETRY_VERSION = 4;

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

// Quadra S: four independent bands separated by Rua Bruno Schwartz and the
// transversal Portão 8 corridor. Numbering deliberately follows the source.
pushHorizontalRow('S', [36, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26], 4004, 1277, 206.25, { 26: 'right' });
pushHorizontalRow('S', [25, 24, 23, 22, 21, 20, 19], 5227, 1277, 206.25, { 25: 'left', 19: 'right' });
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

// Distinct western parcels with their own proportions.
pushReference('R', 13, trapezoidForArea(3244, 2080, 98, 94, rAreas[13], 2), 'trapezoid', 'Parcela transversal própria, separada de R-14 e da estrutura B8.');
pushReference('R', 14, roundedEndForArea(3541, 2080, 292, rAreas[14], 'left', 18), 'rounded-end', 'Parcela longitudinal de contorno próprio, sem absorver R-01/R-02.');

const r01 = trapezoidForArea(3687, 2080, 166, 168, rAreas[1], 1);
pushReference('R', 1, r01, 'trapezoid', 'Parcela cadastral superior da dupla R-01/R-02.');
pushReference('R', 2, trapezoidForArea(3687, 2250, 168, 166, rAreas[2], -1), 'trapezoid', 'Parcela cadastral inferior da dupla R-01/R-02.');

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

// Three smaller radiused islands.
{
  const groups: Array<{ numbers: number[]; x: number; depths: number[] }> = [
    { numbers: [28, 29, 30], x: 4898, depths: [238, 250, 252, 240] },
    { numbers: [41, 42, 43], x: 5228, depths: [238, 250, 252, 240] },
    { numbers: [44, 45, 46, 47], x: 5520, depths: [238, 249, 252, 250, 225] },
  ];
  groups.forEach(({ numbers, x, depths }) => {
    let cursor = x;
    numbers.forEach((number, index) => {
      const polygon = curvedFanForArea(cursor, 2080, depths[index], depths[index + 1], rAreas[number], index === 0 || index === numbers.length - 1 ? 4 : 1.5);
      pushReference(
        'R',
        number,
        polygon,
        index === 0 || index === numbers.length - 1 ? 'rounded-end' : 'trapezoid',
        number === 47
          ? 'Terminal ampliado com fechamento inclinado e radiado.'
          : 'Ilha cadastral independente com pequenas variações angulares.',
      );
      cursor = maxX(polygon);
    });
  });
}

// Southern perimeter R-56–R-59: four distinct fan polygons on the curved edge.
{
  const depths = [184, 201, 222, 236, 210];
  let cursor = 5378;
  for (let number = 56; number <= 59; number += 1) {
    const index = number - 56;
    const polygon = curvedFanForArea(cursor, 2374, depths[index], depths[index + 1], rAreas[number], 5 + index * 1.5);
    pushReference('R', number, polygon, 'curved-fan', 'Faixa periférica em leque, com borda sul curva e lote independente.');
    cursor = maxX(polygon);
  }
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
  'B35',
  'B36',
  'B37',
  'B38',
  'C4',
  'D6-01',
  'D6-02',
  'D6-03',
  'E-01',
  'E-02',
  'E-06',
] as const;

export const EXPORURAL_PROTECTED_IDENTIFIERS = ['B7', 'B8', 'D3'] as const;

export function getExporuralReference(block: string, number: string | number) {
  const normalized = String(number).padStart(2, '0');
  return EXPORURAL_LOT_REFERENCES.find((reference) => reference.block === block && reference.lotNumber === normalized);
}

export function sourcePolygonAreaSqm(points: Coordinate[]) {
  return polygonArea(points) / SOURCE_AREA_PER_SQM;
}
