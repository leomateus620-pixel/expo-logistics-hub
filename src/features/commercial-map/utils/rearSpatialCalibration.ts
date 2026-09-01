import { officialPdfPointToLocal } from '../data/officialReference2026';

/**
 * Calibração corretiva da área posterior.
 *
 * A transformação afim do anexo permanece apenas como registro dos marcos
 * rastreáveis P1 e P5. O satélite norte-para-cima governa P2, P3, P4 e P6:
 * cruzamento de quatro pontas Brasília × Uruguai ao sul do campo, curva suave
 * da Brasília a leste na altura do pátio, encontro da Ubiretama com A5 e
 * trevo do Portão 5 na BR-472. Sem S no meio das árvores e sem Y inventado.
 *
 * A rotação é necessária porque o enquadramento do anexo 5 está girado em
 * relação ao recorte oficial do parque. Os três marcos foram escolhidos depois
 * da auditoria contra edifícios, lotes, Arena, quadras e estacionamentos.
 * É um registro cartográfico de apresentação, não um levantamento geodésico:
 * os anexos não fornecem CRS, escala métrica certificada ou pontos de campo.
 */
export const REAR_SPATIAL_CALIBRATION_REVISION = '2026.10-longitudinal-ubiretama-gate5.1';

export type Point2 = readonly [number, number];
export type RearAttachment5PointId = 1 | 2 | 3 | 4 | 5 | 6;
export type RearAttachment5PointRole =
  | 'etnias-terminus'
  | 'brasilia-axis'
  | 'brasilia-ubiretama-junction'
  | 'ubiretama-axis'
  | 'ubiretama-a5-handoff'
  | 'gate-5';

export interface RearAttachment5ReferencePoint {
  id: RearAttachment5PointId;
  name: string;
  role: RearAttachment5PointRole;
  percent: Point2;
  attachmentPixel: Point2;
  officialSource: Point2;
  calibration: 'canonical-source' | 'interior-affine' | 'satellite-override';
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
  options: { canonicalSource?: Point2; satelliteSource?: Point2 } = {},
): RearAttachment5ReferencePoint {
  const officialSource = options.canonicalSource
    ?? options.satelliteSource
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
    calibration: options.canonicalSource
      ? 'canonical-source'
      : options.satelliteSource
        ? 'satellite-override'
        : 'interior-affine',
  });
}

export const REAR_ATTACHMENT_5_REFERENCE_POINTS = Object.freeze([
  attachment5Point(1, 'Término da Rua das Etnias', 'etnias-terminus', [80, 30], {
    canonicalSource: [5510, 4200],
  }),
  attachment5Point(2, 'Cruzamento Rua Brasília / Rua Ubiretama', 'brasilia-ubiretama-junction', [53, 73], {
    satelliteSource: [4056, 3466],
  }),
  attachment5Point(3, 'Rua Brasília — aproximação suave a leste, ao lado do campo', 'brasilia-axis', [53, 46], {
    satelliteSource: [4054, 2910],
  }),
  attachment5Point(4, 'Rua Ubiretama — encontro com o cadastro A5', 'ubiretama-a5-handoff', [55, 15], {
    satelliteSource: [5974, 3678],
  }),
  attachment5Point(5, 'Rua Ubiretama — trajetória oeste', 'ubiretama-axis', [38, 20]),
  attachment5Point(6, 'Portão 5 — passagem física em direção à BR-472', 'gate-5', [62, 13], {
    satelliteSource: [6108, 3678],
  }),
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
  /** Borda do parque onde a Ubiretama entrega o fluxo ao acesso A5. */
  gate5ParkEdge: rearAttachment5ReferencePointById(4).officialSource,
  /** Passagem veicular visual; a entidade cadastral A5 permanece imutável. */
  gate5VehicleAccess: gate5PresentationSource,
  /** Trevo do Portão 5: eixo central + rampas norte/sul independentes, como no satélite. */
  br472NorthRampJunction: [6264, 3488] as Point2,
  br472Junction: [6264, 3678] as Point2,
  br472SouthRampJunction: [6268, 3872] as Point2,
});

/**
 * A numeração do IMG_9936 é independente da numeração P1–P6 do quadro:
 * P2 = entroncamento Ubiretama/A5, P1 = portão, P3 = entroncamento da BR.
 */
export const REAR_SATELLITE_TOPOLOGY = Object.freeze({
  references: Object.freeze([
    Object.freeze({ filename: '02-sat-arena-west-field.jpeg', pixelSize: [943, 1119] as Point2 }),
    Object.freeze({ filename: '03-sat-portao5-br472.jpeg', pixelSize: [780, 737] as Point2 }),
  ]),
  points: Object.freeze([
    Object.freeze({
      id: 2 as const,
      role: 'ubiretama-a5-handoff' as const,
      satellitePixel: [462, 454] as Point2,
      officialSource: rearAttachment5ReferencePointById(4).officialSource,
    }),
    Object.freeze({
      id: 1 as const,
      role: 'gate-5' as const,
      satellitePixel: [249, 604] as Point2,
      officialSource: REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
    }),
    Object.freeze({
      id: 3 as const,
      role: 'br472-exit-junction' as const,
      satellitePixel: [249, 681] as Point2,
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
  /**
   * Eixo longitudinal correto (anexo 1): a faixa antiga em x ≈ 3950–3964 cortava
   * o bosque e não existe em campo. O corredor real corre imediatamente a leste
   * dela, livre das árvores, com curvatura suave até o cruzamento com a Ubiretama.
   */
  brasiliaNorthToJunction: Object.freeze([
    [4036, 2445],
    [4042, 2580],
    [4048, 2720],
    rearAttachment5ReferencePointById(3).officialSource,
    [4056, 3180],
    [4056, 3330],
    rearAttachment5ReferencePointById(2).officialSource,
  ] as readonly Point2[]),
  brasiliaJunctionToSouth: Object.freeze([
    rearAttachment5ReferencePointById(2).officialSource,
    [4058, 3700],
    [4060, 3860],
    [4062, 3980],
  ] as readonly Point2[]),
  /**
   * Trecho inferior: contorna o limite sul dos estacionamentos oficiais e sobe
   * de volta pela borda leste até entregar o fluxo na aproximação do Portão 5,
   * sem cruzar vaga, edificação ou mata densa.
   */
  longitudinalSouthToGate5: Object.freeze([
    [4062, 3980],
    [4240, 4150],
    [4620, 4225],
    [5100, 4272],
    [5520, 4300],
    [5860, 4288],
    [6008, 4118],
    [6014, 3880],
    rearAttachment5ReferencePointById(4).officialSource,
  ] as readonly Point2[]),
  /** Braço oeste contínuo da Ubiretama, do acesso da Exporural até o cruzamento. */
  ubiretamaWestToJunction: Object.freeze([
    [3560, 3466],
    [3760, 3466],
    [3940, 3466],
    rearAttachment5ReferencePointById(2).officialSource,
  ] as readonly Point2[]),
  ubiretamaJunctionToA5: Object.freeze([
    rearAttachment5ReferencePointById(2).officialSource,
    [4260, 3470],
    [4560, 3486],
    [5000, 3538],
    [5400, 3605],
    [5700, 3648],
    rearAttachment5ReferencePointById(4).officialSource,
  ] as readonly Point2[]),
  gate5InternalApproach: Object.freeze([
    rearAttachment5ReferencePointById(4).officialSource,
    [6040, 3678],
    REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
  ] as readonly Point2[]),
  a5CenterAccess: Object.freeze([
    REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
    [6180, 3678],
    REAR_OFFICIAL_ANCHORS.br472Junction,
  ] as readonly Point2[]),
  a5NorthRamp: Object.freeze([
    REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
    [6165, 3664],
    [6210, 3585],
    [6248, 3518],
    REAR_OFFICIAL_ANCHORS.br472NorthRampJunction,
  ] as readonly Point2[]),
  a5SouthRamp: Object.freeze([
    REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
    [6165, 3692],
    [6210, 3772],
    [6252, 3840],
    REAR_OFFICIAL_ANCHORS.br472SouthRampJunction,
  ] as readonly Point2[]),
  br472NorthToNorthRamp: Object.freeze([
    [6255, 1100],
    [6258, 1900],
    [6260, 2700],
    [6262, 3300],
    REAR_OFFICIAL_ANCHORS.br472NorthRampJunction,
  ] as readonly Point2[]),
  br472NorthRampToJunction: Object.freeze([
    REAR_OFFICIAL_ANCHORS.br472NorthRampJunction,
    [6264, 3580],
    REAR_OFFICIAL_ANCHORS.br472Junction,
  ] as readonly Point2[]),
  br472JunctionToSouthRamp: Object.freeze([
    REAR_OFFICIAL_ANCHORS.br472Junction,
    [6266, 3780],
    REAR_OFFICIAL_ANCHORS.br472SouthRampJunction,
  ] as readonly Point2[]),
  br472SouthRampToSouth: Object.freeze([
    REAR_OFFICIAL_ANCHORS.br472SouthRampJunction,
    [6288, 4000],
    [6305, 4400],
  ] as readonly Point2[]),
});
