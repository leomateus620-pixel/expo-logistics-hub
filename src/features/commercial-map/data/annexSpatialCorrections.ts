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

export const COMMERCIAL_MAP_ANNEX_CORRECTION_REVISION = '2026.9-portao5-satellite-east.1';

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
 * Anexo 2 / satélite — acesso ao Portão 5 / A5.
 *
 * Origem travada em [4528, 3150] (continuação da Rua Brasil, à direita do C1).
 * Uma curva leve e curta vira leste ao sul da Arena — não desce colinear em
 * x=4528 nem varre o lote em y≈3660. Depois da face leste da Arena (x>5385)
 * o acesso segue ao lock [5940, 3678]. O trevo da BR-472 começa no lock e
 * não é reconstruído aqui.
 */
export const PORTAO5_PARKING_ACCESS_CORRECTION = Object.freeze({
  widthSource: 36,
  streetToCurve: Object.freeze([
    [4528, 3150],
    [4560, 3158],
    [4604, 3170],
    [4660, 3184],
    [4730, 3198],
    [4808, 3210],
    [4856, 3216],
  ] as const satisfies readonly AnnexSourcePoint[]),
  curveToEtniasJunction: Object.freeze([
    [4856, 3216],
    [4980, 3226],
    [5108, 3232],
    [5260, 3236],
  ] as const satisfies readonly AnnexSourcePoint[]),
  etniasToUbiretamaJunction: Object.freeze([
    [5260, 3236],
    [5348, 3246],
    [5436, 3266],
    [5524, 3292],
  ] as const satisfies readonly AnnexSourcePoint[]),
  gate5Approach: Object.freeze([
    [5524, 3292],
    [5616, 3384],
    [5712, 3480],
    [5808, 3572],
    [5880, 3636],
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
 * Etnias até o T no acesso ao Portão 5, ao sul da Arena em [5260, 3236].
 */
export const ETNIAS_PARKING_CONNECTION_CORRECTION = Object.freeze({
  officialOwnerIdentifier: 'AV-IMIGRANTES' as const,
  widthSource: 36,
  avenueEntry: [5260, 4200] as const satisfies AnnexSourcePoint,
  parkingJunction: [5260, 3236] as const satisfies AnnexSourcePoint,
  /**
   * Extremidades no T satélite ao sul da Arena. A Catmull-Rom executável em
   * `REAR_CALIBRATED_AXES.etniasParkingConnection` mantém o desvio dos postes
   * CAD 361 e 331; o T rejeitado [5260, 3661] não volta.
   */
  sourceAxis: Object.freeze([
    [5260, 4200],
    [5260, 4140],
    [5260, 3950],
    [5262, 3750],
    [5262, 3480],
    [5260, 3236],
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
