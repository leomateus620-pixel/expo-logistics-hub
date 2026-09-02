/**
 * Blueprint de correção espacial dos anexos 1, 2 e 4 — revisão 2026.9.
 *
 * Coordenadas em pontos PDF do recorte oficial 2026 (mesmo frame de
 * `officialReference2026.ts`). Esta ficha não inventa cadastro: cada via
 * gerada reusa um `publicIdentifier` já persistido. Concreto da Expo Rural e
 * alinhamento do Centro de Eventos ficam exportados para o Agente #2; esta
 * camada de vias não os desenha.
 */

export type AnnexSourcePoint = readonly [number, number];
export type AnnexSourceBounds = readonly [number, number, number, number];
export type AnnexSourcePolygon = readonly AnnexSourcePoint[];

export const COMMERCIAL_MAP_ANNEX_CORRECTION_REVISION = '2026.9-anexo3-satellite.2';

/** Escala uniforme do recorte oficial 5.500 × 120, só para larguras físicas. */
export const ANNEX_SOURCE_POINTS_PER_LOCAL_UNIT = 5500 / 120;

export function annexSourceWidthToLocal(widthSource: number) {
  return widthSource / ANNEX_SOURCE_POINTS_PER_LOCAL_UNIT;
}

/**
 * Anexo 1 — L asfaltado à frente da Churrascaria C4.
 * Nasce no eixo da Rua Gustavo Bessel, desce a oeste do restaurante e vira
 * leste até a faixa oficial da Rua 15 de Novembro / Emanuel Brachmann.
 * O identificador oficial leste é `RUA-15-NOVEMBRO` (cadastro 2026).
 */
export const CHURRASCARIA_ACCESS_CORRECTION = Object.freeze({
  id: 'ACESSO-CHURRASCARIA',
  officialOwnerIdentifier: 'RUA-EMANUEL-BRACHMANN' as const,
  widthSource: 36,
  sourceAxis: Object.freeze([
    [4875, 2059.5],
    [4875, 2260],
    [4875, 2295],
    [4884, 2330],
    [4915, 2351.5],
    [5100, 2351.5],
    [5207.5, 2351.5],
  ] as const satisfies readonly AnnexSourcePoint[]),
  connections: Object.freeze({
    north: 'RUA-GUSTAVO-BESSEL' as const,
    east: 'RUA-15-NOVEMBRO' as const,
  }),
});

/**
 * Anexo 3 / satélite — Rua Ubiretama E–W a sul do campo oeste e da Arena, e o
 * Portão 5 contínuo a leste de F.
 *
 * A origem [4528, 3150] é a continuação da Rua Brasil (cruzamento de quatro
 * pontas com a Brasília oficial). Uma curva breve SE contorna o canto SW do
 * campo gramado e segue E–W em y=3248, imediatamente a sul do campo / face
 * sul de F. Não desce colinear em x=4528, não sobe para o norte, não entra em
 * rampa e não varre o estacionamento em y≈3660. Entra no Portão 5 em T
 * perpendicular na latitude sul da Arena, [5860, 3248].
 *
 * O arranque N–S do Portão 5 permanece o cadastro leste (~[5987, 2000]).
 * Depois da curva leve a leste do apron de concreto, a fita continua a sul
 * até o lock [5940, 3678]. O conector fantasma de meio de quadra
 * ([5860, 3140] → [5780, 3236] → [5680, 3248] → [5548, 3248] e o retorno
 * SE [5548, 3248] → [5648, 3348] → [5756, 3480] → [5860, 3608]) não existe
 * no satélite e não é restabelecido. O trevo da BR-472 começa no lock e não
 * é reconstruído aqui.
 */
export const PORTAO5_PARKING_ACCESS_CORRECTION = Object.freeze({
  widthSource: 36,
  streetToCurve: Object.freeze([
    [4528, 3150],
    [4560, 3170],
    [4596, 3208],
    [4632, 3236],
    [4668, 3248],
    [4776, 3248],
    [4856, 3248],
  ] as const satisfies readonly AnnexSourcePoint[]),
  curveToEtniasJunction: Object.freeze([
    [4856, 3248],
    [4988, 3248],
    [5120, 3248],
    [5260, 3248],
  ] as const satisfies readonly AnnexSourcePoint[]),
  etniasToUbiretamaJunction: Object.freeze([
    [5260, 3248],
    [5368, 3248],
    [5456, 3248],
    [5548, 3248],
    [5680, 3248],
    [5780, 3248],
    [5860, 3248],
  ] as const satisfies readonly AnnexSourcePoint[]),
  gate5Approach: Object.freeze([
    [5860, 3248],
    [5868, 3380],
    [5892, 3500],
    [5918, 3600],
    [5940, 3678],
  ] as const satisfies readonly AnnexSourcePoint[]),
});

export const PORTAO5_PARKING_ACCESS_JUNCTIONS = Object.freeze({
  street: PORTAO5_PARKING_ACCESS_CORRECTION.streetToCurve[0],
  curve: PORTAO5_PARKING_ACCESS_CORRECTION.streetToCurve[
    PORTAO5_PARKING_ACCESS_CORRECTION.streetToCurve.length - 1
  ],
  etnias: PORTAO5_PARKING_ACCESS_CORRECTION.curveToEtniasJunction[
    PORTAO5_PARKING_ACCESS_CORRECTION.curveToEtniasJunction.length - 1
  ],
  ubiretama: PORTAO5_PARKING_ACCESS_CORRECTION.etniasToUbiretamaJunction[
    PORTAO5_PARKING_ACCESS_CORRECTION.etniasToUbiretamaJunction.length - 1
  ],
  gate5: PORTAO5_PARKING_ACCESS_CORRECTION.gate5Approach[
    PORTAO5_PARKING_ACCESS_CORRECTION.gate5Approach.length - 1
  ],
});

/** Concatena os quatro trechos do acesso ao Portão 5 sem repetir junções. */
export function portao5ParkingAccessSourceAxis(): AnnexSourcePoint[] {
  const correction = PORTAO5_PARKING_ACCESS_CORRECTION;
  return [
    ...correction.streetToCurve,
    ...correction.curveToEtniasJunction.slice(1),
    ...correction.etniasToUbiretamaJunction.slice(1),
    ...correction.gate5Approach.slice(1),
  ];
}

/**
 * Anexo 2 — “Criar essa estrada”: ligação N–S da Av. dos Imigrantes / Rua das
 * Etnias até o T na Ubiretama, ao sul da Arena em [5260, 3248].
 */
export const ETNIAS_PARKING_CONNECTION_CORRECTION = Object.freeze({
  officialOwnerIdentifier: 'AV-IMIGRANTES' as const,
  widthSource: 36,
  avenueEntry: [5260, 4200] as const satisfies AnnexSourcePoint,
  parkingJunction: [5260, 3248] as const satisfies AnnexSourcePoint,
  /**
   * Extremidades no T satélite da Ubiretama ao sul da Arena. A Catmull-Rom
   * executável em `REAR_CALIBRATED_AXES.etniasParkingConnection` mantém o
   * desvio dos postes CAD 361 e 331; o T rejeitado [5260, 3661] não volta.
   */
  sourceAxis: Object.freeze([
    [5260, 4200],
    [5260, 4140],
    [5260, 3950],
    [5262, 3750],
    [5262, 3480],
    [5260, 3248],
  ] as const satisfies readonly AnnexSourcePoint[]),
});

/**
 * Anexo 4 — restauro da fita cadastral da Rua Brasília.
 * Apresentação `official-surface`: a malha visível é o polígono oficial
 * `rectPdf([3940, 2440, 3988, 4210])`, nunca uma fita paralela gerada.
 */
export const RUA_BRASILIA_OFFICIAL_RESTORATION = Object.freeze({
  publicIdentifier: 'RUA-BRASILIA' as const,
  sourceBounds: [3940, 2440, 3988, 4210] as const satisfies AnnexSourceBounds,
  sourceAxis: Object.freeze([
    [3964, 2440],
    [3964, 3300],
    [3964, 4210],
  ] as const satisfies readonly AnnexSourcePoint[]),
  connectsGateIdentifier: 'A3' as const,
  presentation: 'official-surface' as const,
});

/**
 * Agente #2 — laje de concreto liso ao sul da Churrascaria. Não desenhar aqui.
 */
export const EXPORURAL_SMOOTH_CONCRETE_CORRECTION = Object.freeze({
  id: 'exporural-smooth-concrete-annex',
  officialOwnerIdentifier: 'C4' as const,
  sourcePolygon: Object.freeze([
    [5100, 2372],
    [5360, 2372],
    [5375, 2388],
    [5375, 2482],
    [5358, 2500],
    [5100, 2500],
  ] as const satisfies AnnexSourcePolygon),
  elevation: 0.06,
  concrete: '#c6c7c2',
  roughness: 0.94,
  tileWorldSize: 1.7,
});

/**
 * Agente #2 — alinhamento do Centro de Eventos C1 ao lote Q-E-12. Não aplicar
 * rotação nem mover o volume nesta recuperação de vias.
 */
export const EVENT_CENTER_QE12_ALIGNMENT = Object.freeze({
  eventCenterIdentifier: 'C1' as const,
  targetLotIdentifier: 'Q-E-12' as const,
  eventCenterSourceCenter: [4255, 3307.5] as const satisfies AnnexSourcePoint,
  targetSourceCenter: [3885, 3309.5] as const satisfies AnnexSourcePoint,
  facingRadians: -1.565390974146972,
});
