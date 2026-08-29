import { officialPdfPointToLocal } from './officialReference2026';
import { EXPORURAL_ROAD_IDENTIFIERS } from './exporuralReference2026';

/**
 * Rede viária da área posterior do parque (transição Parque de Exposições →
 * BR-472). Camada de apresentação: nenhuma entidade comercial, lote, métrica ou
 * geometria oficial é derivada daqui.
 *
 * Todos os eixos são descritos em pontos do PDF oficial 2026 e convertidos pela
 * mesma função usada pelo restante do mapa (`officialPdfPointToLocal`), de modo
 * que escala e origem sejam idênticas às das estruturas já posicionadas.
 *
 * Âncoras usadas na leitura conjunta dos anexos 1 e 2 (satélite, ângulos
 * opostos): Arena Sicredi - Icatu (`F`), Avenida dos Imigrantes, Rua Brasília,
 * Casa da Etnia Polonesa (`C5`), Casa da Etnia Italiana (`C6`) e a Rodovia
 * RS-472 já existente na borda leste do recorte.
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
  notes: string;
}

export const REAR_PARK_ROAD_REVISION = '2026.9-area-posterior.1';

/** Escala do recorte oficial: pontos de PDF por unidade local. */
export const SOURCE_POINTS_PER_LOCAL_UNIT = 5500 / 120;

export function rearRoadSourceToLocalLength(sourceLength: number) {
  return sourceLength / SOURCE_POINTS_PER_LOCAL_UNIT;
}

/**
 * Geometria congelada: nenhuma via da Exporural pode ser removida, deslocada ou
 * redimensionada por esta camada. A ligação nova encosta na extremidade sul da
 * Rua Brasília e é geometria independente.
 */
export const PROTECTED_ROAD_IDENTIFIERS: readonly string[] = Object.freeze([
  ...EXPORURAL_ROAD_IDENTIFIERS,
  'RUA-BRASILIA',
  'AV-IMIGRANTES',
  'AV-BENVENUTO-CONTI',
  'RODOVIA-RS-472',
]);

/**
 * Extremidade sul da Rua Brasília oficial (`rectPdf([3940, 2440, 3988, 4210])`).
 * O trecho novo parte exatamente deste ponto — é continuação do mesmo eixo, e
 * não uma segunda Rua Brasília.
 */
export const RUA_BRASILIA_JOIN_POINT: SourcePoint = [3964, 4205];

export const REAR_PARK_ROAD_NETWORK: readonly RearRoadDefinition[] = Object.freeze([
  {
    id: 'BR-472',
    name: 'BR-472',
    category: 'HIGHWAY',
    sourcePath: [
      [2960, 5560],
      [3620, 5460],
      [4260, 5312],
      [4880, 5160],
      [5460, 4972],
      [5920, 4720],
      [6220, 4470],
      [6520, 4270],
      [6980, 4110],
    ],
    sourceWidth: 168,
    surface: 'HIGHWAY_ASPHALT',
    shoulder: 'PAVED',
    sourceShoulderWidth: 46,
    marking: 'HIGHWAY',
    elevation: 0.038,
    connections: ['ACESSO-BR-472', 'RODOVIA-RS-472'],
    notes: 'Rodovia contínua ao sul do parque, lida nos dois anexos; segue além do recorte oficial para não terminar no vazio.',
  },
  {
    id: 'RS-472-CONTINUACAO',
    name: 'Continuação da RS-472',
    category: 'HIGHWAY',
    sourcePath: [
      [6068, 4180],
      [6120, 4290],
      [6210, 4420],
      [6330, 4500],
    ],
    sourceWidth: 150,
    surface: 'HIGHWAY_ASPHALT',
    shoulder: 'PAVED',
    sourceShoulderWidth: 40,
    marking: 'HIGHWAY',
    elevation: 0.038,
    connections: ['RODOVIA-RS-472', 'BR-472'],
    notes: 'Emenda entre a faixa oficial da RS-472 (que morre na borda leste do recorte) e o tronco da BR-472.',
  },
  {
    id: 'ACESSO-BR-472',
    name: 'Acesso ao Parque de Exposições',
    category: 'PARK_ACCESS',
    sourcePath: [
      [4306, 5300],
      [4288, 5090],
      [4238, 4880],
      [4160, 4700],
      [4092, 4520],
      [4040, 4360],
    ],
    sourceWidth: 92,
    surface: 'PARK_ASPHALT',
    shoulder: 'GRAVEL',
    sourceShoulderWidth: 30,
    marking: 'CENTER_DASH',
    elevation: 0.034,
    connections: ['BR-472', 'RUA-BRASILIA-CONTINUACAO'],
    notes: 'Ligação real entre a rodovia e o parque, com geometria de entrada compatível com os anexos.',
  },
  {
    id: 'ACESSO-ALCA-LESTE',
    name: 'Alça de conversão leste',
    category: 'PARK_ACCESS',
    sourcePath: [
      [4520, 5238],
      [4420, 5290],
      [4344, 5312],
      [4306, 5300],
    ],
    sourceWidth: 58,
    surface: 'HIGHWAY_ASPHALT',
    shoulder: 'GRAVEL',
    sourceShoulderWidth: 22,
    marking: 'NONE',
    elevation: 0.036,
    connections: ['BR-472', 'ACESSO-BR-472'],
    notes: 'Abertura de conversão visível no anexo 2; modelada como elemento viário próprio, nunca como segunda Rua Brasília.',
  },
  {
    id: 'RUA-BRASILIA-CONTINUACAO',
    name: 'Rua Brasília (continuação sul)',
    category: 'INTERNAL',
    sourcePath: [
      RUA_BRASILIA_JOIN_POINT,
      [3972, 4300],
      [4000, 4400],
      [4040, 4360],
    ],
    sourceWidth: 48,
    surface: 'PARK_ASPHALT',
    shoulder: 'NONE',
    sourceShoulderWidth: 0,
    marking: 'NONE',
    elevation: 0.032,
    connections: ['RUA-BRASILIA', 'ACESSO-BR-472', 'AV-IMIGRANTES'],
    notes: 'Continuação do eixo único da Rua Brasília até o entroncamento do acesso — mesma largura e material da via oficial.',
  },
  {
    id: 'RUA-POSTERIOR-ETNIAS',
    name: 'Rua posterior das Etnias',
    category: 'INTERNAL',
    sourcePath: [
      [4058, 4470],
      [4420, 4640],
      [4900, 4820],
      [5340, 4980],
      [5720, 5120],
      [6010, 5230],
    ],
    sourceWidth: 46,
    surface: 'PARK_ASPHALT',
    shoulder: 'GRAVEL',
    sourceShoulderWidth: 18,
    marking: 'NONE',
    elevation: 0.032,
    connections: ['ACESSO-BR-472', 'RUA-ETNIAS-TRANSVERSAL', 'BR-472'],
    notes: 'Via transversal atrás dos espaços das Etnias, ao sul das casas C5/C6 e dos espaços Russo/Árabe/Português.',
  },
  {
    id: 'RUA-ETNIAS-TRANSVERSAL',
    name: 'Acesso das Etnias',
    category: 'INTERNAL',
    sourcePath: [
      [4920, 4260],
      [4922, 4520],
      [4918, 4760],
      [4900, 4820],
    ],
    sourceWidth: 42,
    surface: 'PARK_ASPHALT',
    shoulder: 'NONE',
    sourceShoulderWidth: 0,
    marking: 'NONE',
    elevation: 0.032,
    connections: ['AV-IMIGRANTES', 'RUA-POSTERIOR-ETNIAS'],
    notes: 'Corredor entre a Casa da Etnia Polonesa e a Casa da Etnia Italiana, sem tocar nas edificações.',
  },
  {
    id: 'RUA-RETAGUARDA-ARENA',
    name: 'Rua de retaguarda da Arena',
    category: 'INTERNAL',
    sourcePath: [
      [5430, 3170],
      [5620, 3420],
      [5760, 3700],
      [5850, 3980],
      [5940, 4230],
      [6060, 4420],
    ],
    sourceWidth: 50,
    surface: 'PARK_ASPHALT',
    shoulder: 'GRAVEL',
    sourceShoulderWidth: 18,
    marking: 'NONE',
    elevation: 0.032,
    connections: ['RS-472-CONTINUACAO', 'RUA-CIRCULACAO-LOTES'],
    notes: 'Rua lateral/posterior à Arena, contornando a estrutura sem atravessá-la, até a rodovia.',
  },
  {
    id: 'RUA-CIRCULACAO-LOTES',
    name: 'Circulação dos estacionamentos posteriores',
    category: 'INTERNAL',
    sourcePath: [
      [5760, 3700],
      [5560, 3860],
      [5320, 4020],
      [5100, 4150],
    ],
    sourceWidth: 42,
    surface: 'PARK_ASPHALT',
    shoulder: 'GRAVEL',
    sourceShoulderWidth: 16,
    marking: 'NONE',
    elevation: 0.032,
    connections: ['RUA-RETAGUARDA-ARENA', 'AV-IMIGRANTES'],
    notes: 'Anel de circulação dos lotes e estacionamentos posteriores, encostando na Avenida dos Imigrantes.',
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
