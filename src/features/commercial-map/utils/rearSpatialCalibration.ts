import { officialPdfPointToLocal } from '../data/officialReference2026';

/**
 * Calibração espacial da área posterior.
 *
 * Antes de gerar qualquer superfície, os eixos lidos nos satélites de
 * referência são amarrados a marcos fixos do mapa 3D. A calibração é puramente
 * numérica: nenhuma linha, plano auxiliar ou textura de satélite entra na cena.
 *
 * Como os dois satélites mostram a mesma área por orientações opostas, a
 * transformada resolvida por mínimos quadrados (escala + rotação + translação)
 * precisa ser a mesma nas duas leituras — é isso que garante uma única
 * geometria consistente e impede posicionar por "lado da tela".
 */

export type Point2 = readonly [number, number];

export interface RearCalibrationLandmark {
  id: string;
  name: string;
  /** Centro do marco em pontos do PDF oficial. */
  source: Point2;
}

/** Cinco marcos fixos, todos derivados de entidades oficiais existentes. */
export const REAR_CALIBRATION_LANDMARKS: readonly RearCalibrationLandmark[] = Object.freeze([
  { id: 'F', name: 'Arena Sicredi - Icatu', source: [5142.5, 2910] },
  { id: 'C1', name: 'Centro de Eventos Fenasoja', source: [4255, 3307.5] },
  { id: 'CAMPO', name: 'Campo de futebol', source: [5620, 3520] },
  { id: 'ETNIAS', name: 'Conjunto das Etnias', source: [4920, 4593] },
  { id: 'EXPORURAL', name: 'Borda da Exporural', source: [5100, 2000] },
]);

export interface SimilarityTransform {
  scale: number;
  rotation: number;
  translation: Point2;
  /** Maior resíduo (em unidades locais) entre marcos observados e previstos. */
  maximumResidual: number;
}

/**
 * Similaridade 2D (Umeyama) entre pares de pontos. Usada para converter as
 * leituras dos dois satélites num mesmo referencial antes de virarem eixos.
 */
export function solveSimilarityTransform(
  from: readonly Point2[],
  to: readonly Point2[],
): SimilarityTransform {
  if (from.length < 2 || from.length !== to.length) {
    throw new Error('Calibração exige ao menos dois pares de pontos correspondentes.');
  }

  const count = from.length;
  const mean = (points: readonly Point2[]) => points.reduce(
    (acc, point) => [acc[0] + point[0] / count, acc[1] + point[1] / count] as Point2,
    [0, 0] as Point2,
  );
  const fromMean = mean(from);
  const toMean = mean(to);

  let sxx = 0;
  let sxy = 0;
  let variance = 0;
  for (let index = 0; index < count; index += 1) {
    const ax = from[index][0] - fromMean[0];
    const az = from[index][1] - fromMean[1];
    const bx = to[index][0] - toMean[0];
    const bz = to[index][1] - toMean[1];
    sxx += ax * bx + az * bz;
    sxy += ax * bz - az * bx;
    variance += ax * ax + az * az;
  }

  const rotation = Math.atan2(sxy, sxx);
  const scale = variance === 0 ? 1 : Math.hypot(sxx, sxy) / variance;
  const cos = Math.cos(rotation) * scale;
  const sin = Math.sin(rotation) * scale;
  const translation: Point2 = [
    toMean[0] - (cos * fromMean[0] - sin * fromMean[1]),
    toMean[1] - (sin * fromMean[0] + cos * fromMean[1]),
  ];

  const apply = (point: Point2): Point2 => [
    cos * point[0] - sin * point[1] + translation[0],
    sin * point[0] + cos * point[1] + translation[1],
  ];

  let maximumResidual = 0;
  for (let index = 0; index < count; index += 1) {
    const predicted = apply(from[index]);
    maximumResidual = Math.max(
      maximumResidual,
      Math.hypot(predicted[0] - to[index][0], predicted[1] - to[index][1]),
    );
  }

  return { scale, rotation, translation, maximumResidual };
}

export function applySimilarityTransform(transform: SimilarityTransform, point: Point2): Point2 {
  const cos = Math.cos(transform.rotation) * transform.scale;
  const sin = Math.sin(transform.rotation) * transform.scale;
  return [
    cos * point[0] - sin * point[1] + transform.translation[0],
    sin * point[0] + cos * point[1] + transform.translation[1],
  ];
}

/**
 * Transformada dos marcos oficiais (PDF → plano local). Serve de referência
 * única para conferir qualquer traçado novo antes de virar superfície.
 */
export function rearReferenceTransform(): SimilarityTransform {
  const source = REAR_CALIBRATION_LANDMARKS.map((landmark) => landmark.source);
  const local = source.map((point) => officialPdfPointToLocal(point) as Point2);
  return solveSimilarityTransform(source, local);
}
