import { officialPdfPointToLocal } from '../data/officialReference2026';

/**
 * Calibração independente dos anexos de satélite 4 e 5.
 *
 * Os pixels foram lidos pelos mesmos marcos permanentes em ambas as imagens e
 * resolvidos contra o referencial da planta oficial. A homografia existe apenas
 * como instrumento de reconstrução/teste: nenhum satélite ou overlay entra no
 * bundle visual final.
 */
export const REAR_SPATIAL_CALIBRATION_REVISION = '2026.9-rear-satellite-homography.1';

export type Point2 = readonly [number, number];
export type RearSatelliteReferenceId = 'annex-4' | 'annex-5';

export interface RearCalibrationControl {
  id: string;
  name: string;
  satellitePixel: Point2;
  officialSource: Point2;
}

export interface RearSatelliteReference {
  id: RearSatelliteReferenceId;
  filename: string;
  pixelSize: Point2;
  controls: readonly RearCalibrationControl[];
}

const officialControls = Object.freeze({
  arenaNorthWest: [4900, 2690] as Point2,
  arenaNorthEast: [5385, 2690] as Point2,
  arenaSouthEast: [5385, 3130] as Point2,
  arenaSouthWest: [4900, 3130] as Point2,
  eventCenter: [4255, 3307.5] as Point2,
  footballField: [5655, 2960] as Point2,
  ethnicQuarter: [4920, 4720] as Point2,
  exporuralBoundary: [5200, 1500] as Point2,
  gate5: [5974, 3678] as Point2,
  br472Junction: [6050, 3678] as Point2,
});

/**
 * Leituras cartográficas dos anexos. Não são coordenadas de tela relativas:
 * cada entrada identifica a mesma feição física nos dois enquadramentos.
 */
export const REAR_SATELLITE_REFERENCES: Readonly<Record<RearSatelliteReferenceId, RearSatelliteReference>> = Object.freeze({
  'annex-4': Object.freeze({
    id: 'annex-4' as const,
    filename: 'ChatGPT Image 29 de ago. de 2026, 09_58_11 (1).png',
    pixelSize: [1585, 1024] as Point2,
    controls: Object.freeze([
      { id: 'arena-nw', name: 'Arena Shows — canto noroeste', satellitePixel: [676, 714], officialSource: officialControls.arenaNorthWest },
      { id: 'arena-ne', name: 'Arena Shows — canto nordeste', satellitePixel: [650, 548], officialSource: officialControls.arenaNorthEast },
      { id: 'arena-se', name: 'Arena Shows — canto sudeste', satellitePixel: [784, 486], officialSource: officialControls.arenaSouthEast },
      { id: 'arena-sw', name: 'Arena Shows — canto sudoeste', satellitePixel: [810, 652], officialSource: officialControls.arenaSouthWest },
      { id: 'event-center', name: 'Centro de Eventos Fenasoja', satellitePixel: [898, 848], officialSource: officialControls.eventCenter },
      { id: 'football-field', name: 'Centro do campo de futebol', satellitePixel: [718, 417], officialSource: officialControls.footballField },
      { id: 'ethnic-quarter', name: 'Centro do conjunto das Etnias', satellitePixel: [1290, 420], officialSource: officialControls.ethnicQuarter },
      { id: 'exporural-boundary', name: 'Limite externo da Exporural', satellitePixel: [300, 780], officialSource: officialControls.exporuralBoundary },
      { id: 'gate-5', name: 'Portão 5 oficial A5', satellitePixel: [918, 206], officialSource: officialControls.gate5 },
      { id: 'br472-junction', name: 'Entroncamento A5 / BR-472', satellitePixel: [914, 184], officialSource: officialControls.br472Junction },
    ]) as readonly RearCalibrationControl[],
  }),
  'annex-5': Object.freeze({
    id: 'annex-5' as const,
    filename: 'ChatGPT Image 29 de ago. de 2026, 09_58_11 (2).png',
    pixelSize: [1680, 942] as Point2,
    controls: Object.freeze([
      { id: 'arena-nw', name: 'Arena Shows — canto noroeste', satellitePixel: [623, 298], officialSource: officialControls.arenaNorthWest },
      { id: 'arena-ne', name: 'Arena Shows — canto nordeste', satellitePixel: [672, 472], officialSource: officialControls.arenaNorthEast },
      { id: 'arena-se', name: 'Arena Shows — canto sudeste', satellitePixel: [560, 530], officialSource: officialControls.arenaSouthEast },
      { id: 'arena-sw', name: 'Arena Shows — canto sudoeste', satellitePixel: [512, 356], officialSource: officialControls.arenaSouthWest },
      { id: 'event-center', name: 'Centro de Eventos Fenasoja', satellitePixel: [402, 147], officialSource: officialControls.eventCenter },
      { id: 'football-field', name: 'Centro do campo de futebol', satellitePixel: [631, 604], officialSource: officialControls.footballField },
      { id: 'ethnic-quarter', name: 'Centro do conjunto das Etnias', satellitePixel: [112, 570], officialSource: officialControls.ethnicQuarter },
      { id: 'exporural-boundary', name: 'Limite externo da Exporural', satellitePixel: [954, 251], officialSource: officialControls.exporuralBoundary },
      { id: 'gate-5', name: 'Portão 5 oficial A5', satellitePixel: [482, 812], officialSource: officialControls.gate5 },
      { id: 'br472-junction', name: 'Entroncamento A5 / BR-472', satellitePixel: [488, 835], officialSource: officialControls.br472Junction },
    ]) as readonly RearCalibrationControl[],
  }),
});

interface Normalization2D {
  center: Point2;
  scale: number;
}

export interface Homography2D {
  coefficients: readonly [number, number, number, number, number, number, number, number, number];
  fromNormalization: Normalization2D;
  toNormalization: Normalization2D;
  maximumResidual: number;
  rootMeanSquareResidual: number;
  normalizedMaximumResidual: number;
}

function normalization(points: readonly Point2[]): Normalization2D {
  const center: Point2 = [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ];
  const meanDistance = points.reduce(
    (sum, point) => sum + Math.hypot(point[0] - center[0], point[1] - center[1]),
    0,
  ) / points.length;
  return { center, scale: Math.max(meanDistance, 1) };
}

function normalized(point: Point2, rule: Normalization2D): Point2 {
  return [(point[0] - rule.center[0]) / rule.scale, (point[1] - rule.center[1]) / rule.scale];
}

function solveLinearSystem(matrix: number[][], vector: number[]) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    if (Math.abs(divisor) < 1e-12) throw new Error('Pontos de calibração degenerados.');
    for (let entry = column; entry <= size; entry += 1) augmented[column][entry] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let entry = column; entry <= size; entry += 1) {
        augmented[row][entry] -= factor * augmented[column][entry];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

function applyNormalizedHomography(coefficients: readonly number[], point: Point2): Point2 {
  const denominator = coefficients[6] * point[0] + coefficients[7] * point[1] + coefficients[8];
  if (Math.abs(denominator) < 1e-12) throw new Error('Homografia projetou ponto no infinito.');
  return [
    (coefficients[0] * point[0] + coefficients[1] * point[1] + coefficients[2]) / denominator,
    (coefficients[3] * point[0] + coefficients[4] * point[1] + coefficients[5]) / denominator,
  ];
}

export function solveHomography(from: readonly Point2[], to: readonly Point2[]): Homography2D {
  if (from.length < 4 || from.length !== to.length) {
    throw new Error('Homografia exige ao menos quatro pares correspondentes.');
  }
  const fromNormalization = normalization(from);
  const toNormalization = normalization(to);
  const rows: number[][] = [];
  const expected: number[] = [];

  from.forEach((point, index) => {
    const [u, v] = normalized(point, fromNormalization);
    const [x, z] = normalized(to[index], toNormalization);
    rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    expected.push(x);
    rows.push([0, 0, 0, u, v, 1, -u * z, -v * z]);
    expected.push(z);
  });

  const normalMatrix = Array.from({ length: 8 }, () => Array(8).fill(0) as number[]);
  const normalVector = Array(8).fill(0) as number[];
  rows.forEach((row, rowIndex) => {
    for (let column = 0; column < 8; column += 1) {
      normalVector[column] += row[column] * expected[rowIndex];
      for (let other = 0; other < 8; other += 1) {
        normalMatrix[column][other] += row[column] * row[other];
      }
    }
  });
  const solved = solveLinearSystem(normalMatrix, normalVector);
  const coefficients: Homography2D['coefficients'] = [
    solved[0], solved[1], solved[2], solved[3], solved[4], solved[5], solved[6], solved[7], 1,
  ];
  const project = (point: Point2): Point2 => {
    const projected = applyNormalizedHomography(coefficients, normalized(point, fromNormalization));
    return [
      projected[0] * toNormalization.scale + toNormalization.center[0],
      projected[1] * toNormalization.scale + toNormalization.center[1],
    ];
  };
  const residuals = from.map((point, index) => {
    const predicted = project(point);
    return Math.hypot(predicted[0] - to[index][0], predicted[1] - to[index][1]);
  });
  const analysisDiagonal = Math.hypot(
    Math.max(...to.map((point) => point[0])) - Math.min(...to.map((point) => point[0])),
    Math.max(...to.map((point) => point[1])) - Math.min(...to.map((point) => point[1])),
  );
  const maximumResidual = Math.max(...residuals);
  return {
    coefficients,
    fromNormalization,
    toNormalization,
    maximumResidual,
    rootMeanSquareResidual: Math.sqrt(residuals.reduce((sum, residual) => sum + residual ** 2, 0) / residuals.length),
    normalizedMaximumResidual: maximumResidual / analysisDiagonal,
  };
}

const transforms = Object.fromEntries(
  (Object.keys(REAR_SATELLITE_REFERENCES) as RearSatelliteReferenceId[]).map((id) => {
    const reference = REAR_SATELLITE_REFERENCES[id];
    return [id, solveHomography(
      reference.controls.map((control) => control.satellitePixel),
      reference.controls.map((control) => control.officialSource),
    )];
  }),
) as Record<RearSatelliteReferenceId, Homography2D>;

export function rearCalibrationDiagnostics(referenceId: RearSatelliteReferenceId) {
  return transforms[referenceId];
}

export function projectSatellitePixelToOfficialSource(referenceId: RearSatelliteReferenceId, point: Point2): Point2 {
  const transform = transforms[referenceId];
  const projected = applyNormalizedHomography(
    transform.coefficients,
    normalized(point, transform.fromNormalization),
  );
  return [
    projected[0] * transform.toNormalization.scale + transform.toNormalization.center[0],
    projected[1] * transform.toNormalization.scale + transform.toNormalization.center[1],
  ];
}

export function projectSatellitePixelToLocal(referenceId: RearSatelliteReferenceId, point: Point2): Point2 {
  return officialPdfPointToLocal(projectSatellitePixelToOfficialSource(referenceId, point));
}

/**
 * Eixos centrais reconciliados após as duas homografias. Estes são os únicos
 * pontos de calibração consumidos pelo grafo viário definitivo.
 */
export const REAR_CALIBRATED_AXES = Object.freeze({
  br472WestToJunction: Object.freeze([
    [5965, 1285], [5992, 2050], [6048, 2860], [6048, 3430], [6050, 3678],
  ] as readonly Point2[]),
  br472JunctionToEast: Object.freeze([
    [6050, 3678], [6060, 3950], [6075, 4300],
  ] as readonly Point2[]),
  a5Access: Object.freeze([
    [6050, 3678], [6023, 3678], [5996, 3678],
  ] as readonly Point2[]),
  brasiliaA5Perimeter: Object.freeze([
    [5996, 3678], [6010, 3870], [6000, 4070], [5960, 4215], [5925, 4285],
  ] as readonly Point2[]),
  brasiliaPerimeterOfficial: Object.freeze([
    [5925, 4285], [5790, 4302], [5620, 4270], [5510, 4235], [5100, 4200], [4600, 4200], [4140, 4185], [3964, 4100],
  ] as readonly Point2[]),
  brasiliaOfficialEventCenter: Object.freeze([
    [3964, 4100], [3964, 3800], [3964, 3500],
  ] as readonly Point2[]),
  brasiliaEventCenterArena: Object.freeze([
    [3964, 3500], [3964, 3000], [3964, 2440],
  ] as readonly Point2[]),
});
