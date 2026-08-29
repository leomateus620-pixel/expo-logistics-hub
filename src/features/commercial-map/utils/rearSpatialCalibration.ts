import { officialPdfPointToLocal } from '../data/officialReference2026';

/**
 * Calibração independente dos anexos de satélite 4 e 5.
 *
 * Os pixels foram lidos pelos mesmos marcos permanentes em ambas as imagens e
 * resolvidos contra o referencial da planta oficial. A homografia existe apenas
 * como instrumento de reconstrução/teste: nenhum satélite ou overlay entra no
 * bundle visual final.
 */
export const REAR_SPATIAL_CALIBRATION_REVISION = '2026.9-rear-three-corridors.4';

export type Point2 = readonly [number, number];
export type RearSatelliteReferenceId = 'annex-4' | 'annex-5';
export type RearNormalizedReferencePointId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type RearNormalizedReferencePointRole =
  | 'exporural-axis'
  | 'br472-axis'
  | 'brasilia-axis'
  | 'junction'
  | 'gate'
  | 'environment';

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

export interface RearNormalizedReferencePoint {
  id: RearNormalizedReferencePointId;
  name: string;
  role: RearNormalizedReferencePointRole;
  percent: Point2;
  satellitePixel: Point2;
}

const ANNEX_4_PIXEL_SIZE = [1536, 864] as const satisfies Point2;
const ANNEX_5_PIXEL_SIZE = [1536, 961] as const satisfies Point2;

export function normalizedPercentToSatellitePixel(percent: Point2, pixelSize: Point2): Point2 {
  return [pixelSize[0] * (percent[0] / 100), pixelSize[1] * (percent[1] / 100)];
}

function normalizedReferencePoint(
  id: RearNormalizedReferencePointId,
  name: string,
  role: RearNormalizedReferencePointRole,
  percent: Point2,
): RearNormalizedReferencePoint {
  return Object.freeze({
    id,
    name,
    role,
    percent,
    satellitePixel: normalizedPercentToSatellitePixel(percent, ANNEX_4_PIXEL_SIZE),
  });
}

/**
 * Pontos fornecidos no anexo 6, todos normalizados contra o anexo 4. Os pontos
 * 8 e 9 são testemunhos ambientais e, deliberadamente, não alimentam eixos.
 */
export const REAR_NORMALIZED_REFERENCE_POINTS = Object.freeze([
  normalizedReferencePoint(1, 'Rua Exporural — leste', 'exporural-axis', [68, 43]),
  normalizedReferencePoint(2, 'BR-472 — leste', 'br472-axis', [71, 71]),
  normalizedReferencePoint(3, 'Rua Brasília — Centro de Eventos', 'brasilia-axis', [21, 17]),
  normalizedReferencePoint(4, 'Rua Brasília — lateral da Arena', 'brasilia-axis', [24, 52]),
  normalizedReferencePoint(5, 'Entroncamento Rua Exporural / Rua Brasília', 'junction', [28, 65]),
  normalizedReferencePoint(6, 'Portão 5 oficial A5', 'gate', [31, 85]),
  normalizedReferencePoint(7, 'BR-472 — oeste', 'br472-axis', [21, 96]),
  normalizedReferencePoint(8, 'Faixa ambiental ao sul da BR-472', 'environment', [56, 90]),
  normalizedReferencePoint(9, 'Faixa ambiental entre Rua Exporural e BR-472', 'environment', [54, 68]),
  normalizedReferencePoint(10, 'Rua Exporural — oeste', 'exporural-axis', [41, 60]),
] as const satisfies readonly RearNormalizedReferencePoint[]);

export function rearNormalizedReferencePointById(id: RearNormalizedReferencePointId): RearNormalizedReferencePoint {
  const point = REAR_NORMALIZED_REFERENCE_POINTS.find((candidate) => candidate.id === id);
  if (!point) throw new Error(`Ponto normalizado posterior inexistente: ${id}.`);
  return point;
}

export function rearNormalizedReferencePointsByRole(role: RearNormalizedReferencePointRole) {
  return REAR_NORMALIZED_REFERENCE_POINTS.filter((point) => point.role === role);
}

export const REAR_OFFICIAL_ANCHORS = Object.freeze({
  gate5Entity: [5974, 3678] as Point2,
  gate5VehicleAccess: [5993.1, 3680.9] as Point2,
  br472Junction: [6122.5, 3700.9] as Point2,
});

const officialControls = Object.freeze({
  arenaNorthWest: [4900, 2690] as Point2,
  arenaNorthEast: [5385, 2690] as Point2,
  arenaSouthEast: [5385, 3130] as Point2,
  arenaSouthWest: [4900, 3130] as Point2,
  eventCenter: [4255, 3307.5] as Point2,
  footballField: [5655, 2960] as Point2,
  ethnicQuarter: [4920, 4720] as Point2,
  exporuralBoundary: [5200, 1500] as Point2,
  gate5: REAR_OFFICIAL_ANCHORS.gate5Entity,
  br472Junction: REAR_OFFICIAL_ANCHORS.br472Junction,
});

/**
 * Leituras cartográficas dos anexos. Não são coordenadas de tela relativas:
 * cada entrada identifica a mesma feição física nos dois enquadramentos.
 */
export const REAR_SATELLITE_REFERENCES: Readonly<Record<RearSatelliteReferenceId, RearSatelliteReference>> = Object.freeze({
  'annex-4': Object.freeze({
    id: 'annex-4' as const,
    filename: 'E9A49EC4-3EF4-4807-B145-ADBACF1476B9.jpeg',
    pixelSize: ANNEX_4_PIXEL_SIZE,
    controls: Object.freeze([
      { id: 'arena-nw', name: 'Arena Shows — canto noroeste', satellitePixel: [569.6, 273.3248407643], officialSource: officialControls.arenaNorthWest },
      { id: 'arena-ne', name: 'Arena Shows — canto nordeste', satellitePixel: [614.4, 432.9171974522], officialSource: officialControls.arenaNorthEast },
      { id: 'arena-se', name: 'Arena Shows — canto sudeste', satellitePixel: [512, 486.1146496815], officialSource: officialControls.arenaSouthEast },
      { id: 'arena-sw', name: 'Arena Shows — canto sudoeste', satellitePixel: [468.1142857143, 326.5222929936], officialSource: officialControls.arenaSouthWest },
      { id: 'event-center', name: 'Centro de Eventos Fenasoja', satellitePixel: [367.5428571429, 134.8280254777], officialSource: officialControls.eventCenter },
      { id: 'football-field', name: 'Centro do campo de futebol', satellitePixel: [576.9142857143, 553.9872611465], officialSource: officialControls.footballField },
      { id: 'ethnic-quarter', name: 'Centro do conjunto das Etnias', satellitePixel: [102.4, 522.8025477707], officialSource: officialControls.ethnicQuarter },
      { id: 'exporural-boundary', name: 'Limite externo da Exporural', satellitePixel: [872.2285714286, 230.2165605096], officialSource: officialControls.exporuralBoundary },
      { id: 'gate-5', name: 'Portão 5 oficial A5', satellitePixel: [440.6857142857, 744.7643312102], officialSource: officialControls.gate5 },
      { id: 'br472-junction', name: 'Entroncamento externo A5 / BR-472', satellitePixel: [446.1714285714, 765.8598726115], officialSource: officialControls.br472Junction },
    ]) as readonly RearCalibrationControl[],
  }),
  'annex-5': Object.freeze({
    id: 'annex-5' as const,
    filename: 'A278B223-C14D-4618-99FC-AD060FFF7DF5.jpeg',
    pixelSize: ANNEX_5_PIXEL_SIZE,
    controls: Object.freeze([
      { id: 'arena-nw', name: 'Arena Shows — canto noroeste', satellitePixel: [655.1015772871, 670.072265625], officialSource: officialControls.arenaNorthWest },
      { id: 'arena-ne', name: 'Arena Shows — canto nordeste', satellitePixel: [629.905362776, 514.28515625], officialSource: officialControls.arenaNorthEast },
      { id: 'arena-se', name: 'Arena Shows — canto sudeste', satellitePixel: [759.7627760252, 456.099609375], officialSource: officialControls.arenaSouthEast },
      { id: 'arena-sw', name: 'Arena Shows — canto sudoeste', satellitePixel: [784.9589905363, 611.88671875], officialSource: officialControls.arenaSouthWest },
      { id: 'event-center', name: 'Centro de Eventos Fenasoja', satellitePixel: [870.2384858044, 795.828125], officialSource: officialControls.eventCenter },
      { id: 'football-field', name: 'Centro do campo de futebol', satellitePixel: [695.8031545741, 391.3447265625], officialSource: officialControls.footballField },
      { id: 'ethnic-quarter', name: 'Centro do conjunto das Etnias', satellitePixel: [1250.119873817, 394.16015625], officialSource: officialControls.ethnicQuarter },
      { id: 'exporural-boundary', name: 'Limite externo da Exporural', satellitePixel: [290.7255520505, 732.01171875], officialSource: officialControls.exporuralBoundary },
      { id: 'gate-5', name: 'Portão 5 oficial A5', satellitePixel: [889.6201892744, 193.326171875], officialSource: officialControls.gate5 },
      { id: 'br472-junction', name: 'Entroncamento externo A5 / BR-472', satellitePixel: [885.7438485804, 172.6796875], officialSource: officialControls.br472Junction },
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

export function projectRearNormalizedReferencePointToOfficialSource(
  id: RearNormalizedReferencePointId,
): Point2 {
  // P6 identifica a entidade cartográfica A5, enquanto a superfície viária
  // termina na borda física exposta separadamente em gate5VehicleAccess.
  if (id === 6) return REAR_OFFICIAL_ANCHORS.gate5Entity;
  return projectSatellitePixelToOfficialSource(
    'annex-4',
    rearNormalizedReferencePointById(id).satellitePixel,
  );
}

export function projectRearNormalizedReferencePointToLocal(id: RearNormalizedReferencePointId): Point2 {
  return officialPdfPointToLocal(projectRearNormalizedReferencePointToOfficialSource(id));
}

const normalizedAxisSource = Object.freeze({
  point1: projectRearNormalizedReferencePointToOfficialSource(1),
  point2: projectRearNormalizedReferencePointToOfficialSource(2),
  point3: projectRearNormalizedReferencePointToOfficialSource(3),
  point4: projectRearNormalizedReferencePointToOfficialSource(4),
  point5: projectRearNormalizedReferencePointToOfficialSource(5),
  point7: projectRearNormalizedReferencePointToOfficialSource(7),
  point10: projectRearNormalizedReferencePointToOfficialSource(10),
});

/**
 * O centro projetado de P3 tangencia o envelope retangular conservador de C1.
 * O deslocamento de 26,4 pontos mantém o eixo dentro de meia largura da via e
 * posiciona a superfície pavimentada fora da edificação oficial.
 */
const brasiliaPoint3Clearance: Point2 = [normalizedAxisSource.point3[0], 3510];

/**
 * P4 e P5 são testemunhos direcionais normalizados, não coordenadas cadastrais.
 * A projeção bruta dos dois pontos cai dentro dos polígonos oficiais
 * EST-EXP-VIS/EST-VIS. O eixo definitivo preserva o X fornecido pelo satélite,
 * mas usa o perímetro sul livre dos estacionamentos como restrição física.
 */
const brasiliaPoint4ParkingClearance: Point2 = [normalizedAxisSource.point4[0], 4220];
const brasiliaExporuralJunctionClearance: Point2 = [normalizedAxisSource.point5[0], 4230];

/**
 * Eixos centrais reconciliados após as duas homografias. Estes são os únicos
 * pontos de calibração consumidos pelo grafo viário definitivo.
 */
export const REAR_CALIBRATED_AXES = Object.freeze({
  /**
   * Eixo central da superfície oficial RUA-UBIRETAMA. Os extremos ficam
   * exatamente sobre as bordas norte e sul do polígono cadastral; isso permite
   * completar os trechos ausentes sem cobrir a via oficial com outra malha.
   */
  exporuralOfficial: Object.freeze([
    [5987, 1265], [5987, 2075], [5940, 2315], [5861, 2560], [5816, 2629],
  ] as readonly Point2[]),
  /** P1 até a borda norte da superfície oficial. */
  exporuralNorthExtension: Object.freeze([
    normalizedAxisSource.point1, [6100, 940], [6100, 1140], [5987, 1265],
  ] as readonly Point2[]),
  /** Borda sul oficial -> P10 -> P5, sem criar uma nova entidade cadastral. */
  exporuralSouthExtension: Object.freeze([
    [5816, 2629], normalizedAxisSource.point10, [5750, 2725], [5925, 2750],
    [6020, 2900], [6050, 3200], [6060, 3500], [6040, 3900], [6010, 4200],
    [5900, 4295],
    brasiliaExporuralJunctionClearance,
  ] as readonly Point2[]),
  /**
   * Rua Brasília recomposta do extremo norte cadastral ao P3. O desvio suave
   * contorna o Centro de Eventos pelo sul e substitui somente a apresentação
   * esquemática que antes continuava visualmente até o Portão 3.
   */
  brasiliaOfficialToP3: Object.freeze([
    [3964, 2440], [3952, 2950], [3945, 3200], [3945, 3470], [3970, 3515],
    [4065, 3520], brasiliaPoint3Clearance,
  ] as readonly Point2[]),
  /**
   * Continuação P3 -> perímetro sul dos estacionamentos -> P5 calibrado -> A5.
   * A aproximação final contorna a extremidade leste do EST-VIS; nenhuma parte
   * da ribbon é autorizada a usar os dois estacionamentos como pavimento.
   */
  brasiliaContinuation: Object.freeze([
    brasiliaPoint3Clearance, [4380, 3540], [4450, 3620], [4450, 3920],
    [4450, 4140], [4540, 4210], brasiliaPoint4ParkingClearance, [5250, 4220],
    brasiliaExporuralJunctionClearance, [5750, 4270], [5930, 4300], [6005, 4220],
    [6005, 4000], [6002, 3800],
    REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
  ] as readonly Point2[]),
  /** Ligação externa após o Portão 5, terminando no entroncamento real da BR-472. */
  a5ExternalAccess: Object.freeze([
    REAR_OFFICIAL_ANCHORS.gate5VehicleAccess, [5995, 3580], [6030, 3540], [6080, 3560],
    [6120, 3620], REAR_OFFICIAL_ANCHORS.br472Junction,
  ] as readonly Point2[]),
  /** P2 é o extremo leste no anexo normalizado. */
  br472EastToJunction: Object.freeze([
    normalizedAxisSource.point2, [6421, 1760], [6336, 2395], [6264, 2825], [6179, 3335],
    REAR_OFFICIAL_ANCHORS.br472Junction,
  ] as readonly Point2[]),
  /** P7 é o extremo oeste no anexo normalizado. */
  br472JunctionToWest: Object.freeze([
    REAR_OFFICIAL_ANCHORS.br472Junction, normalizedAxisSource.point7,
  ] as readonly Point2[]),
});
