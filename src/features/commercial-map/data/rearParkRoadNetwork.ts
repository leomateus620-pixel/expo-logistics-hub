import { officialPdfPointToLocal } from './officialReference2026';
import { EXPORURAL_ROAD_IDENTIFIERS } from './exporuralReference2026';

/**
 * Rede viária da área posterior do parque — revisão corretiva 2026.9.2.
 *
 * A implantação anterior criou vias inventadas atrás das Etnias
 * (`RUA-POSTERIOR-ETNIAS`, `RUA-ETNIAS-TRANSVERSAL`), alças de conversão,
 * retaguarda da Arena e circulação de lotes que não existem nos satélites de
 * referência. Todas foram REMOVIDAS: nada daquela geometria é reaproveitado.
 *
 * A rede correta é mínima e comprovada pelas referências:
 *   Portão 5 → lateral do Centro de Eventos (C1) → Rua Brasília (via oficial,
 *   intocada) → continuação única → acesso → BR-472.
 *
 * Calibração espacial por marcos fixos (ver `utils/rearSpatialCalibration.ts`):
 * Arena Sicredi - Icatu `F [4900,2690,5385,3130]`, Centro de Eventos Fenasoja
 * `C1 [4020,3180,4490,3435]`, Rua Brasília oficial `[3940,2440,3988,4210]`,
 * conjunto das Etnias `C5/C6/C7/C8` (y ≥ 4422) e borda da Exporural.
 * Nenhuma referência é feita por lado da tela.
 */

export type RearRoadCategory = 'HIGHWAY' | 'PARK_ACCESS' | 'INTERNAL';
export type RearRoadSurface = 'HIGHWAY_ASPHALT' | 'PARK_ASPHALT';
export type RearRoadShoulder = 'PAVED' | 'GRAVEL' | 'NONE';
export type RearRoadMarking = 'HIGHWAY' | 'CENTER_DASH' | 'NONE';

export type SourcePoint = readonly [number, number];
export type LocalPoint = readonly [number, number];

export interface RearRoadDefinition {
  id: string;
  name: string;
  category: RearRoadCategory;
  /** Eixo central em pontos do PDF oficial; interpolado por spline Catmull-Rom. */
  sourcePath: readonly SourcePoint[];
  /** Largura total da pista, em pontos do PDF (≈ 45,83 pontos por unidade local). */
  sourceWidth: number;
  surface: RearRoadSurface;
  shoulder: RearRoadShoulder;
  /** Largura de cada acostamento, em pontos do PDF. */
  sourceShoulderWidth: number;
  marking: RearRoadMarking;
  /** Altura visível do pavimento, em unidades locais. */
  elevation: number;
  /** Vias (deste arquivo ou oficiais) às quais o traçado se conecta. */
  connections: readonly string[];
  /** Área protegida cuja borda o traçado apenas tangencia, quando houver. */
  protectedArea?: string;
  notes: string;
}

export const REAR_PARK_ROAD_REVISION = '2026.9-area-posterior.2';

/** Escala do recorte oficial: pontos de PDF por unidade local. */
export const SOURCE_POINTS_PER_LOCAL_UNIT = 5500 / 120;

export function rearRoadSourceToLocalLength(sourceLength: number) {
  return sourceLength / SOURCE_POINTS_PER_LOCAL_UNIT;
}

/**
 * Geometria congelada: nenhuma via da Exporural — nem a Rua Brasília oficial —
 * pode ser removida, deslocada ou redimensionada por esta camada.
 */
export const PROTECTED_ROAD_IDENTIFIERS: readonly string[] = Object.freeze([
  ...EXPORURAL_ROAD_IDENTIFIERS,
  'RUA-BRASILIA',
  'AV-IMIGRANTES',
  'AV-BENVENUTO-CONTI',
  'RODOVIA-RS-472',
]);

/**
 * Traçados retirados na correção. Mantidos apenas como registro para impedir a
 * reintrodução acidental de vias atrás das Etnias.
 */
export const REMOVED_REAR_ROAD_IDENTIFIERS: readonly string[] = Object.freeze([
  'RUA-POSTERIOR-ETNIAS',
  'RUA-ETNIAS-TRANSVERSAL',
  'RUA-RETAGUARDA-ARENA',
  'RUA-CIRCULACAO-LOTES',
  'ACESSO-ALCA-LESTE',
  'RS-472-CONTINUACAO',
]);

/**
 * Extremidade da Rua Brasília oficial (`rectPdf([3940, 2440, 3988, 4210])`) no
 * limite do parque. O trecho novo parte exatamente deste ponto — é continuação
 * do mesmo eixo, e nunca uma segunda pista paralela.
 */
export const RUA_BRASILIA_JOIN_POINT: SourcePoint = [3964, 4205];

/** Polígono das Etnias: nenhum eixo novo pode entrar nesta faixa. */
export const ETHNIC_QUARTER_SOURCE_BOUNDS = Object.freeze([4500, 4340, 5340, 5100] as const);

export const REAR_PARK_ROAD_NETWORK: readonly RearRoadDefinition[] = Object.freeze([
  {
    id: 'BR-472',
    name: 'BR-472',
    category: 'HIGHWAY',
    sourcePath: [
      [2500, 5980],
      [3200, 5850],
      [3900, 5700],
      [4600, 5545],
      [5300, 5390],
      [6000, 5230],
      [6700, 5070],
      [7300, 4940],
    ],
    sourceWidth: 172,
    surface: 'HIGHWAY_ASPHALT',
    shoulder: 'PAVED',
    sourceShoulderWidth: 48,
    marking: 'HIGHWAY',
    elevation: 0.03,
    connections: ['ACESSO-BR-472'],
    notes: 'Rodovia contínua bem ao sul do parque, com curvatura longitudinal única. Passa longe do quarteirão das Etnias e não entra no parque; segue além do recorte para não terminar no vazio.',
  },
  {
    id: 'ACESSO-BR-472',
    name: 'Acesso à BR-472',
    category: 'PARK_ACCESS',
    sourcePath: [
      [3968, 5250],
      [3975, 5400],
      [3984, 5545],
      [3990, 5666],
    ],
    sourceWidth: 88,
    surface: 'PARK_ASPHALT',
    shoulder: 'GRAVEL',
    sourceShoulderWidth: 30,
    marking: 'CENTER_DASH',
    elevation: 0.026,
    connections: ['RUA-BRASILIA-CONTINUACAO', 'BR-472'],
    notes: 'Boca de entroncamento entre a continuação da Rua Brasília e a rodovia; largura intermediária entre a via interna e a BR-472, sem virar avenida.',
  },
  {
    id: 'RUA-BRASILIA-CONTINUACAO',
    name: 'Rua Brasília (continuação até a BR-472)',
    category: 'INTERNAL',
    sourcePath: [
      RUA_BRASILIA_JOIN_POINT,
      [3970, 4400],
      [3986, 4680],
      [3996, 4960],
      [3968, 5250],
    ],
    sourceWidth: 52,
    surface: 'PARK_ASPHALT',
    shoulder: 'GRAVEL',
    sourceShoulderWidth: 14,
    marking: 'NONE',
    elevation: 0.024,
    connections: ['RUA-BRASILIA', 'PORTAO-5', 'ACESSO-BR-472'],
    protectedArea: 'AV-IMIGRANTES',
    notes: 'Eixo único: sai do Portão 5, na lateral do Centro de Eventos, e segue sem ramificações até o acesso à rodovia. Não desvia para trás das Etnias e mantém a mesma largura/material da via oficial.',
  },
]);

export function rearRoadLocalPath(definition: RearRoadDefinition): LocalPoint[] {
  return definition.sourcePath.map((point) => officialPdfPointToLocal(point));
}

export function rearRoadLocalWidth(definition: RearRoadDefinition) {
  return rearRoadSourceToLocalLength(definition.sourceWidth);
}

export function rearRoadLocalShoulderWidth(definition: RearRoadDefinition) {
  return definition.shoulder === 'NONE'
    ? 0
    : rearRoadSourceToLocalLength(definition.sourceShoulderWidth);
}

/** Corredores usados para excluir vegetação, postes e contexto externo do asfalto. */
export function rearRoadCorridors() {
  return REAR_PARK_ROAD_NETWORK.map((definition) => ({
    id: definition.id,
    path: rearRoadLocalPath(definition),
    halfWidth: rearRoadLocalWidth(definition) / 2 + rearRoadLocalShoulderWidth(definition),
  }));
}
