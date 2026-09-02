import {
  ETNIAS_PARKING_CONNECTION_CORRECTION,
  PORTAO5_PARKING_ACCESS_CORRECTION,
  PORTAO5_PARKING_ACCESS_JUNCTIONS,
  RUA_BRASILIA_OFFICIAL_RESTORATION,
} from '../data/annexSpatialCorrections';
import { officialPdfPointToLocal } from '../data/officialReference2026';

/**
 * Calibração corretiva da área posterior.
 *
 * A transformação afim do anexo permanece apenas como registro dos marcos
 * rastreáveis P1 e P5. Os eixos executáveis do Portão 5, da ligação das Etnias
 * e da Rua Brasília oficial vêm de `annexSpatialCorrections.ts`. Ubiretama e o
 * trevo da BR-472 herdados permanecem; a fita cadastral da Brasília não é
 * substituída por uma curva gerada no estacionamento.
 *
 * A rotação é necessária porque o enquadramento do anexo 5 está girado em
 * relação ao recorte oficial do parque. Os três marcos foram escolhidos depois
 * da auditoria contra edifícios, lotes, Arena, quadras e estacionamentos.
 * É um registro cartográfico de apresentação, não um levantamento geodésico:
 * os anexos não fornecem CRS, escala métrica certificada ou pontos de campo.
 */
export const REAR_SPATIAL_CALIBRATION_REVISION = '2026.9-portao5-delayed-curve.1';

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
  attachment5Point(2, 'Acesso Portão 5 — origem da curva leve ESE, ainda em x=4528', 'brasilia-axis', [53, 73], {
    canonicalSource: PORTAO5_PARKING_ACCESS_JUNCTIONS.curve,
  }),
  attachment5Point(3, 'Acesso Portão 5 — origem na Rua Brasil, à direita do Centro de Eventos', 'brasilia-axis', [53, 46], {
    canonicalSource: PORTAO5_PARKING_ACCESS_JUNCTIONS.street,
  }),

  attachment5Point(4, 'Rua Ubiretama × acesso Portão 5 — T em y≈3248, 17 m ao sul da Arena', 'brasilia-ubiretama-junction', [55, 15], {
    canonicalSource: PORTAO5_PARKING_ACCESS_JUNCTIONS.ubiretama,
  }),
  attachment5Point(5, 'Rua Ubiretama — trajetória norte', 'ubiretama-axis', [38, 20]),
  attachment5Point(6, 'Portão 5 — passagem física em direção à BR-472', 'gate-5', [62, 13], {
    canonicalSource: [5940, 3678],
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
  /** T da Ubiretama com o acesso sul em [4528, 3248]; não é um Y no portão. */
  gate5ParkEdge: rearAttachment5ReferencePointById(4).officialSource,
  /** Passagem veicular visual; a entidade cadastral A5 permanece imutável. */
  gate5VehicleAccess: gate5PresentationSource,
  /** Trevo em Y do anexo 3: tronco único, bifurcação e duas rampas na BR-472. */
  trevoFork: [6058, 3678] as Point2,
  br472NorthRampJunction: [6112, 3520] as Point2,
  br472Junction: [6120, 3678] as Point2,
  br472SouthRampJunction: [6126, 3840] as Point2,
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
    [3940, 4200],
    [4500, 4200],
    [5000, 4200],
    ETNIAS_PARKING_CONNECTION_CORRECTION.avenueEntry,
    rearAttachment5ReferencePointById(1).officialSource,
  ] as readonly Point2[]),
  ruaDasEtniasOfficialWestToParking: Object.freeze([
    [3940, 4200],
    [4500, 4200],
    [5000, 4200],
    ETNIAS_PARKING_CONNECTION_CORRECTION.avenueEntry,
  ] as readonly Point2[]),
  ruaDasEtniasOfficialParkingToTerminus: Object.freeze([
    ETNIAS_PARKING_CONNECTION_CORRECTION.avenueEntry,
    rearAttachment5ReferencePointById(1).officialSource,
  ] as readonly Point2[]),
  /**
   * Asfalto executável da ligação das Etnias. Extremidades = blueprint
   * ([5260,4200] e [5260,3661]). Controles internos afastam a Catmull-Rom
   * do poste CAD 361 (≈[5258,3739]); o rabo antigo até [5290,3500] (poste
   * 331) foi cortado porque o T agora está na curva ESE.
   */
  etniasParkingConnection: Object.freeze([
    ETNIAS_PARKING_CONNECTION_CORRECTION.avenueEntry,
    [5260, 4140],
    [5260, 3950],
    [5294, 3820],
    [5296, 3739],
    [5284, 3698],
    ETNIAS_PARKING_CONNECTION_CORRECTION.parkingJunction,
  ] as readonly Point2[]),
  brasiliaOfficialAxis: RUA_BRASILIA_OFFICIAL_RESTORATION.sourceAxis,
  brasiliaOfficialToImigrantes: Object.freeze([
    RUA_BRASILIA_OFFICIAL_RESTORATION.sourceAxis[2],
    [3940, 4200],
  ] as readonly Point2[]),
  /**
   * Acesso interno ao Portão 5: sul colinear em x=4528 (origem → T Ubiretama
   * → origem da curva), depois curva leve ESE até o lock [5940, 3678].
   * Não substitui a Rua Brasília nem entra no trevo.
   */
  portao5StreetToUbiretama: PORTAO5_PARKING_ACCESS_CORRECTION.streetToUbiretamaJunction,
  portao5UbiretamaToCurve: PORTAO5_PARKING_ACCESS_CORRECTION.ubiretamaToCurve,
  portao5CurveToEtniasJunction: PORTAO5_PARKING_ACCESS_CORRECTION.curveToEtniasJunction,
  portao5EtniasToGate: PORTAO5_PARKING_ACCESS_CORRECTION.etniasToGate,
  ubiretamaNorthToJunction: Object.freeze([
    rearAttachment5ReferencePointById(5).officialSource,
    [5972, 2080],
    [5946, 2250],
    [5920, 2450],
    [5892, 2690],
    [5880, 2910],
    [5868, 3130],
    [5800, 3208],
    [5600, 3240],
    [5300, 3248],
    [5000, 3248],
    [4700, 3248],
    rearAttachment5ReferencePointById(4).officialSource,
  ] as readonly Point2[]),
  /** Tronco único do trevo, entre o portão e a bifurcação em Y. */
  a5TrevoTrunk: Object.freeze([
    REAR_OFFICIAL_ANCHORS.gate5VehicleAccess,
    [5998, 3678],
    REAR_OFFICIAL_ANCHORS.trevoFork,
  ] as readonly Point2[]),
  a5NorthRamp: Object.freeze([
    REAR_OFFICIAL_ANCHORS.trevoFork,
    [6084, 3628],
    [6104, 3570],
    REAR_OFFICIAL_ANCHORS.br472NorthRampJunction,
  ] as readonly Point2[]),
  a5SouthRamp: Object.freeze([
    REAR_OFFICIAL_ANCHORS.trevoFork,
    [6088, 3730],
    [6112, 3790],
    REAR_OFFICIAL_ANCHORS.br472SouthRampJunction,
  ] as readonly Point2[]),
  br472NorthToNorthRamp: Object.freeze([
    [6046, 1300],
    [6072, 2100],
    [6096, 2900],
    REAR_OFFICIAL_ANCHORS.br472NorthRampJunction,
  ] as readonly Point2[]),
  br472NorthRampToSouthRamp: Object.freeze([
    REAR_OFFICIAL_ANCHORS.br472NorthRampJunction,
    REAR_OFFICIAL_ANCHORS.br472Junction,
    REAR_OFFICIAL_ANCHORS.br472SouthRampJunction,
  ] as readonly Point2[]),
  br472SouthRampToSouth: Object.freeze([
    REAR_OFFICIAL_ANCHORS.br472SouthRampJunction,
    [6136, 4100],
    [6146, 4400],
  ] as readonly Point2[]),
});

