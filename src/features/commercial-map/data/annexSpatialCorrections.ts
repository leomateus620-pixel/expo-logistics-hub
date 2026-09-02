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

export const COMMERCIAL_MAP_ANNEX_CORRECTION_REVISION = '2026.9-portao5-delayed-curve.1';

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
 * Anexo 2 / satélite — acesso interno ao Portão 5 / A5.
 *
 * O rascunho 3D herdado virava ~90° a ~13 m da Arena (y≈3460). O satélite
 * pede ~48 m de sul em x=4528 e só então uma curva leve ESE até o lock
 * [5940, 3678]. A Ubiretama T-cruza esse sul em y≈3248; o trevo da BR-472
 * começa no lock e não é reconstruído aqui.
 */
export const PORTAO5_PARKING_ACCESS_CORRECTION = Object.freeze({
  widthSource: 36,
  streetToUbiretamaJunction: Object.freeze([
    [4528, 3150],
    [4528, 3248],
  ] as const satisfies readonly AnnexSourcePoint[]),
  ubiretamaToCurve: Object.freeze([
    [4528, 3248],
    [4528, 3360],
    [4528, 3438],
    [4528, 3480],
  ] as const satisfies readonly AnnexSourcePoint[]),
  curveToEtniasJunction: Object.freeze([
    [4528, 3480],
    [4528, 3505],
    [4533, 3531],
    [4552, 3556],
    [4597, 3581],
    [4677, 3605],
    [4796, 3625],
    [4949, 3643],
    [5129, 3656],
    [5260, 3661],
  ] as const satisfies readonly AnnexSourcePoint[]),
  etniasToGate: Object.freeze([
    [5260, 3661],
    [5325, 3664],
    [5528, 3670],
    [5733, 3674],
    [5940, 3678],
  ] as const satisfies readonly AnnexSourcePoint[]),
});

export const PORTAO5_PARKING_ACCESS_JUNCTIONS = Object.freeze({
  street: PORTAO5_PARKING_ACCESS_CORRECTION.streetToUbiretamaJunction[0],
  ubiretama: PORTAO5_PARKING_ACCESS_CORRECTION.streetToUbiretamaJunction[
    PORTAO5_PARKING_ACCESS_CORRECTION.streetToUbiretamaJunction.length - 1
  ],
  curve: PORTAO5_PARKING_ACCESS_CORRECTION.ubiretamaToCurve[
    PORTAO5_PARKING_ACCESS_CORRECTION.ubiretamaToCurve.length - 1
  ],
  etnias: PORTAO5_PARKING_ACCESS_CORRECTION.curveToEtniasJunction[
    PORTAO5_PARKING_ACCESS_CORRECTION.curveToEtniasJunction.length - 1
  ],
  gate5: PORTAO5_PARKING_ACCESS_CORRECTION.etniasToGate[
    PORTAO5_PARKING_ACCESS_CORRECTION.etniasToGate.length - 1
  ],
});

/** Concatena os quatro trechos do acesso ao Portão 5 sem repetir junções. */
export function portao5ParkingAccessSourceAxis(): AnnexSourcePoint[] {
  const correction = PORTAO5_PARKING_ACCESS_CORRECTION;
  return [
    ...correction.streetToUbiretamaJunction,
    ...correction.ubiretamaToCurve.slice(1),
    ...correction.curveToEtniasJunction.slice(1),
    ...correction.etniasToGate.slice(1),
  ];
}

/**
 * Anexo 2 — “Criar essa estrada”: ligação N–S da Av. dos Imigrantes / Rua das
 * Etnias até a via do estacionamento, no T [5260, 3661] da curva ESE.
 */
export const ETNIAS_PARKING_CONNECTION_CORRECTION = Object.freeze({
  officialOwnerIdentifier: 'AV-IMIGRANTES' as const,
  widthSource: 36,
  avenueEntry: [5260, 4200] as const satisfies AnnexSourcePoint,
  parkingJunction: [5260, 3661] as const satisfies AnnexSourcePoint,
  /**
   * Extremidades travadas no satélite. A Catmull-Rom executável em
   * `REAR_CALIBRATED_AXES.etniasParkingConnection` mantém o desvio do poste
   * CAD 361 e termina no T da curva; o rabo antigo até [5290, 3500] saiu.
   */
  sourceAxis: Object.freeze([
    [5260, 4200],
    [5260, 4140],
    [5260, 3950],
    [5262, 3750],
    [5260, 3661],
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
