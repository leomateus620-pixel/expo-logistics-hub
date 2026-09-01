import { officialPdfPointToLocal } from '../data/officialReference2026';

/**
 * Calibração corretiva da área posterior.
 *
 * Os seis percentuais pertencem ao mesmo plano do anexo e são projetados por
 * uma única transformação afim rotacionada. A matriz é fixada por três marcos
 * rastreáveis: o término oficial da Rua das Etnias (P1), a aproximação livre da
 * Rua Brasília (P2) e o corredor oficial da Rua Ubiretama (P5). O satélite
 * substitui os antigos despejos afins P3/P4, que criavam o desvio vermelho ao
 * sul/leste da Arena; P6 continua sendo a passagem física já calibrada.
 *
 * A rotação é necessária porque o enquadramento do anexo 5 está girado em
 * relação ao recorte oficial do parque. Os três marcos foram escolhidos depois
 * da auditoria contra edifícios, lotes, Arena, quadras e estacionamentos.
 * É um registro cartográfico de apresentação, não um levantamento geodésico:
 * os anexos não fornecem CRS, escala métrica certificada ou pontos de campo.
 */
export const REAR_SPATIAL_CALIBRATION_REVISION = '2026.9-arena-br472-satellite.1';

export type Point2 = readonly [number, number];
export type RearAttachment5PointId = 1 | 2 | 3 | 4 | 5 | 6;
export type RearAttachment5PointRole =
  | 'etnias-terminus'
  | 'brasilia-axis'
  | 'ubiretama-gate-junction'
  | 'ubiretama-axis'
  | 'gate-5';

export interface RearAttachment5ReferencePoint {
  id: RearAttachment5PointId;
  name: string;
  role: RearAttachment5PointRole;
  percent: Point2;
  attachmentPixel: Point2;
  officialSource: Point2;
  calibration: 'canonical-source' | 'interior-affine';
}

/** Dimensões reais do IMG_9933, incluindo sua borda inferior. Percentuais não
 * são transferidos para o enquadramento diferente do anexo 4. */
export const REAR_ATTACHMENT_5_REFERENCE = Object.freeze({
  filenames: Object.freeze([
    'IMG_9933.jpeg',
  ] as const),
  pixelSize: [1179, 1250] as Point2,
  origin: 'TOP_LEFT' as const,
});

export const REAR_ATTACHMENT_5_INTERIOR_TRANSFORM = Object.freeze({
  originPercent: [0, 0] as Point2,
  originSource: [6829.079961464356, -193.06358381502892] as Point2,
  /** sourceX = 6829.07996 - 2.43304·x% - 37.48121·y% */
  sourceXFromPercentX: -2.433044315992305,
  sourceXFromPercentY: -37.48121387283236,
  /** sourceY = -193.06358 + 47.97688·x% + 18.49711·y% */
  sourceYFromPercentX: 47.97687861271676,
  sourceYFromPercentY: 18.497109826589593,
  controlAnchors: Object.freeze([
    Object.freeze({ pointId: 1 as const, percent: [80, 30] as Point2, officialSource: [5510, 4200] as Point2 }),
    Object.freeze({ pointId: 2 as const, percent: [53, 73] as Point2, officialSource: [3964, 3700] as Point2 }),
    Object.freeze({ pointId: 5 as const, percent: [38, 20] as Point2, officialSource: [5987, 2000] as Point2 }),
  ]),
});

export function projectRearAttachment5InteriorPercentToOfficialSource(percent: Point2): Point2 {
  const transform = REAR_ATTACHMENT_5_INTERIOR_TRANSFORM;
  const deltaX = percent[0] - transform.originPercent[0];
  const deltaY = percent[1] - transform.originPercent[1];
  return [
    transform.originSource[0]
      + transform.sourceXFromPercentX * deltaX
      + transform.sourceXFromPercentY * deltaY,
    transform.originSource[1]
      + transform.sourceYFromPercentX * deltaX
      + transform.sourceYFromPercentY * deltaY,
  ];
}

function attachment5Point(
  id: RearAttachment5PointId,
  name: string,
  role: RearAttachment5PointRole,
  percent: Point2,
  options: { canonicalSource?: Point2 } = {},
): RearAttachment5ReferencePoint {
  const officialSource = options.canonicalSource
    ?? projectRearAttachment5InteriorPercentToOfficialSource(percent);
  return Object.freeze({
    id,
    name,
    role,
    percent,
    attachmentPixel: [
      REAR_ATTACHMENT_5_REFERENCE.pixelSize[0] * (percent[0] / 100),
      REAR_ATTACHMENT_5_REFERENCE.pixelSize[1] * (percent[1] / 100),
    ] as Point2,
    officialSource,
    calibration: options.canonicalSource ? 'canonical-source' : 'interior-affine',
  });
}

export const REAR_ATTACHMENT_5_REFERENCE_POINTS = Object.freeze([
  attachment5Point(1, 'Término da Rua das Etnias', 'etnias-terminus', [80, 30], {
    canonicalSource: [5510, 4200],
  }),
  attachment5Point(2, 'Rua Brasília — aproximação sul', 'brasilia-axis', [53, 73]),
  attachment5Point(3, 'Rua Brasília — entroncamento oeste com Rua Ubiretama', 'brasilia-axis', [53, 46], {
    canonicalSource: [3964, 3466],
  }),
  attachment5Point(4, 'Bifurcação Rua Ubiretama / acesso ao Portão 5', 'ubiretama-gate-junction', [55, 15], {
    canonicalSource: [5920, 2780],
  }),
  attachment5Point(5, 'Rua Ubiretama — trajetória oeste', 'ubiretama-axis', [38, 20]),
  attachment5Point(6, 'Portão 5 — apresentação da entidade oficial A5', 'gate-5', [62, 13]),
] as const satisfies readonly RearAttachment5ReferencePoint[]);

export function rearAttachment5ReferencePointById(id: RearAttachment5PointId) {
  const point = REAR_ATTACHMENT_5_REFERENCE_POINTS.find((candidate) => candidate.id === id);
  if (!point) throw new Error(`Ponto ${id} do quadro de referência não encontrado.`);
  return point;
}

export function projectRearAttachment5PointToOfficialSource(id: RearAttachment5PointId): Point2 {
  return rearAttachment5ReferencePointById(id).officialSource;
}

export function projectRearAttachment5PointToLocal(id: RearAttachment5PointId): Point2 {
  return officialPdfPointToLocal(projectRearAttachment5PointToOfficialSource(id));
}

const gate5PresentationSource = rearAttachment5ReferencePointById(6).officialSource;

export const REAR_OFFICIAL_ANCHORS = Object.freeze({
  /** Cadastro preservado; busca, seleção e persistência continuam na entidade A5. */
  gate5Entity: [5974, 3678] as Point2,
  /** ANALYST: P6 stays `[6190.98, 3021.97]`. Do not move to A5 Y.
   * Flare trevo only. arena-roads/ANALYSIS.md §3.2 / §7. */
  gate5VehicleAccess: gate5PresentationSource,
  /** ANALYST: keep J `[6266.93, 3234.23]`; add flare samples, do not digitise
   * the green BR-472 highlighter. */
  br472Junction: [6266.926335827044, 3234.233541884527] as Point2,
});

/**
 * A numeração do IMG_9936 é independente da numeração P1–P6 do quadro:
 * P2 = aproximação interna, P1 = portão, P3 = entroncamento da BR.
 */
export const REAR_SATELLITE_TOPOLOGY = Object.freeze({
  references: Object.freeze([
    Object.freeze({ filename: 'IMG_9934.jpeg', pixelSize: [1179, 1146] as Point2 }),
    Object.freeze({ filename: 'IMG_9936.jpeg', pixelSize: [1179, 1161] as Point2 }),
  ]),
  points: Object.freeze([
    Object.freeze({
      id: 2 as const,
      role: 'rua-brasilia-approach' as const,
      satellitePixel: [590, 1000] as Point2,
      officialSource: rearAttachment5ReferencePointById(4).officialSource,
    }),
    Object.freeze({
      id: 1 as const,
      role: 'gate-5' as const,
      satellitePixel: [591, 548] as Point2,
      officialSource: REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
    }),
    Object.freeze({
      id: 3 as const,
      role: 'br472-exit-junction' as const,
      satellitePixel: [541, 217] as Point2,
      officialSource: REAR_OFFICIAL_ANCHORS.br472Junction,
    }),
  ]),
});

/**
 * Eixos editáveis da revisão. Cada curva contém somente pontos derivados da
 * calibração ou desvios de tangência auditados pelas exclusões espaciais.
 */
export const REAR_CALIBRATED_AXES = Object.freeze({
  ruaDasEtniasOfficial: Object.freeze([
    [3940, 4200], [4500, 4200], [5000, 4200], rearAttachment5ReferencePointById(1).officialSource,
  ] as readonly Point2[]),
  brasiliaSouthToPoint2: Object.freeze([
    [3964, 3950], [3964, 3800], rearAttachment5ReferencePointById(2).officialSource,
  ] as readonly Point2[]),
  brasiliaPoint2ToPoint3: Object.freeze([
    rearAttachment5ReferencePointById(2).officialSource,
    [3964, 3600],
    rearAttachment5ReferencePointById(3).officialSource,
  ] as readonly Point2[]),
  ubiretamaPoint5ToGateJunction: Object.freeze([
    rearAttachment5ReferencePointById(5).officialSource,
    [5987, 2300],
    [5968, 2550],
    rearAttachment5ReferencePointById(4).officialSource,
  ] as readonly Point2[]),
  ubiretamaGateJunctionToOfficialHandoff: Object.freeze([
    rearAttachment5ReferencePointById(4).officialSource,
    [5885, 3000],
    [5750, 3235],
    [5350, 3252],
    [5000, 3240],
    [4700, 3228],
    [4522, 3218],
    [4488, 3280],
    [4488, 3455],
    [4492, 3466],
  ] as readonly Point2[]),
  // A faixa oficial RUA-URUGUAI-LESTE completa o T sem asfalto duplicado.
  ubiretamaOfficialHandoffToBrasilia: Object.freeze([
    [4492, 3466],
    rearAttachment5ReferencePointById(3).officialSource,
  ] as readonly Point2[]),
  gate5InternalApproach: Object.freeze([
    rearAttachment5ReferencePointById(4).officialSource,
    [6040, 2860],
    [6120, 2940],
    REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
  ] as readonly Point2[]),
  a5ExternalAccess: Object.freeze([
    REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
    [6218, 3105],
    [6244, 3188],
    [6260, 3226],
    REAR_OFFICIAL_ANCHORS.br472Junction,
  ] as readonly Point2[]),
  br472NorthToJunction: Object.freeze([
    [6255, 1100],
    [6258, 1900],
    [6262, 2600],
    [6258, 3100],
    [6262, 3195],
    REAR_OFFICIAL_ANCHORS.br472Junction,
  ] as readonly Point2[]),
  br472JunctionToSouth: Object.freeze([
    REAR_OFFICIAL_ANCHORS.br472Junction,
    [6274, 3380],
    [6285, 3900],
    [6305, 4400],
  ] as readonly Point2[]),
});
