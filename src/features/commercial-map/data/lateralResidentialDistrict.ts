import { officialPdfPointToLocal } from './officialReference2026';

/** Metres: s follows Benvenuto from the roundabout to Gate 3; t faces the field. */
export type DistrictPoint = readonly [number, number];
export type DistrictBounds = readonly [number, number, number, number];
export type DistrictHouseTypology = 'hip-villa' | 'courtyard' | 'gable' | 'flat-modern' | 'split-level' | 'long-shed';
export interface DistrictHouse {
  center: DistrictPoint;
  size: DistrictPoint;
  height: number;
  rotation: number;
  typology: DistrictHouseTypology;
  roofColor: string;
  wallColor: string;
  storeys: 1 | 2;
  solar: boolean;
}
export interface DistrictPool {
  center: DistrictPoint;
  size: DistrictPoint;
  shape: 'rectangular' | 'rounded' | 'kidney';
  rotation: number;
}
export interface DistrictParcel {
  id: string;
  blockId: string;
  bounds: DistrictBounds;
  use: 'residential' | 'commercial' | 'institutional' | 'vacant';
  house?: DistrictHouse;
  pool?: DistrictPool;
  palms: readonly DistrictPoint[];
  trees: readonly DistrictPoint[];
  frontage: 'south' | 'north' | 'avenue';
  confidence: 'visible' | 'inferred';
}
export interface DistrictBlock {
  id: string;
  name: string;
  polygon: readonly DistrictPoint[];
  parcels: readonly DistrictParcel[];
  referenceSummary: {
    occupiedEstimate: readonly [number, number];
    poolsVisible: number;
    notes: string;
  };
}
export interface DistrictRoad {
  id: string;
  name: string;
  centerline: readonly DistrictPoint[];
  width: number;
  kind: 'local' | 'collector';
}
export interface DistrictVegetation {
  id: string;
  center: DistrictPoint;
  height: number;
  crownRadius: number;
  kind: 'palm' | 'broadleaf';
}

export const LATERAL_DISTRICT_METERS_TO_WORLD = 0.15;
export const LATERAL_DISTRICT_GROUND_ELEVATION = 0.03;
const PDF_TO_WORLD = 120 / 5500;
const ROUNDABOUT_SOURCE = [1110, 4185] as const;
const AVENUE_SOURCE = [
  ROUNDABOUT_SOURCE, [1234, 4200], [1600, 4199], [2300, 4198],
  [3000, 4200], [3600, 4205], [3935, 4219],
] as const;

/** Follow the existing avenue's tiny bends, rather than rotating/moving its road. */
function avenueSourceY(sourceX: number) {
  const i = AVENUE_SOURCE.findIndex((point) => point[0] >= sourceX);
  const index = i <= 0 ? (i === -1 ? AVENUE_SOURCE.length - 1 : 1) : i;
  const a = AVENUE_SOURCE[index - 1];
  const b = AVENUE_SOURCE[index];
  const u = (sourceX - a[0]) / (b[0] - a[0]);
  return a[1] + (b[1] - a[1]) * u;
}

export function lateralDistrictPointToWorld([s, t]: DistrictPoint): DistrictPoint {
  const sourceX = ROUNDABOUT_SOURCE[0] + s * LATERAL_DISTRICT_METERS_TO_WORLD / PDF_TO_WORLD;
  const [x, z] = officialPdfPointToLocal([sourceX, avenueSourceY(sourceX)]);
  return [x, z + t * LATERAL_DISTRICT_METERS_TO_WORLD];
}

export function lateralDistrictWorldPointToLocal([x, z]: DistrictPoint): DistrictPoint {
  const origin = officialPdfPointToLocal(ROUNDABOUT_SOURCE);
  const s = (x - origin[0]) / LATERAL_DISTRICT_METERS_TO_WORLD;
  const avenue = lateralDistrictPointToWorld([s, 0]);
  return [s, (z - avenue[1]) / LATERAL_DISTRICT_METERS_TO_WORLD];
}

const TERRACOTTA = '#a45e42';
const SAND_TILE = '#c4aa85';
const GRAPHITE = '#555958';
const SILVER = '#a8aba6';
const WINE = '#794540';

function house(center: DistrictPoint, size: DistrictPoint, typology: DistrictHouseTypology,
  roofColor: string, storeys: 1 | 2 = 1, solar = true, wallColor = '#e2d8c5', rotation = 0): DistrictHouse {
  return { center, size, typology, roofColor, wallColor, storeys, solar, rotation, height: storeys === 2 ? 6.1 : 3.25 };
}
function pool(center: DistrictPoint, size: DistrictPoint, shape: DistrictPool['shape'] = 'rectangular', rotation = 0): DistrictPool {
  return { center, size, shape, rotation };
}
function lot(blockId: string, id: string, bounds: DistrictBounds, building: DistrictHouse | undefined,
  options: Partial<Omit<DistrictParcel, 'id' | 'blockId' | 'bounds' | 'house'>> = {}): DistrictParcel {
  return { id: `${blockId}-${id}`, blockId, bounds, house: building, use: building ? 'residential' : 'vacant',
    palms: [], trees: [], frontage: 'south', confidence: 'visible', ...options };
}
function rectangle([a, b, c, d]: DistrictBounds): readonly DistrictPoint[] {
  return [[a, b], [c, b], [c, d], [a, d]];
}

// Each record below is an individually interpreted property. Screenshots overlap;
// a property seen twice is only listed once. Roof wings are not extra houses.
const Q1: readonly DistrictParcel[] = [
  lot('Q1', 'carsul', [36, 11, 53, 25], house([44, 18], [12, 9], 'hip-villa', WINE, 1, false),
    { use: 'commercial', frontage: 'avenue', trees: [[37, 13], [51, 14]] }),
  lot('Q1', 'galpao', [54, 11, 72, 34], house([63, 22], [14, 17], 'long-shed', TERRACOTTA, 1, false),
    { use: 'commercial', frontage: 'avenue', confidence: 'inferred' }),
  lot('Q1', 'clareira', [74, 11, 87, 46], undefined,
    { trees: [[77, 40], [83, 43]], frontage: 'avenue' }),
];

const Q2: readonly DistrictParcel[] = [
  lot('Q2', 'esquina-musicanto', [137, 11, 155, 31], house([146, 20], [12, 10], 'hip-villa', GRAPHITE),
    { pool: pool([145, 27.5], [5, 3], 'kidney'), palms: [[151, 27], [140, 14]], frontage: 'north' }),
  lot('Q2', 'telhado-claro', [118, 11, 136, 31], house([127, 19], [13, 12], 'courtyard', SAND_TILE),
    { pool: pool([124, 27.5], [6, 3.2], 'rounded'), palms: [[133, 28]], frontage: 'avenue' }),
  lot('Q2', 'valmax', [98, 11, 117, 31], house([106, 21], [12, 15], 'long-shed', SILVER, 1, false),
    { use: 'commercial', frontage: 'avenue', trees: [[114, 14]] }),
  lot('Q2', 'casa-linear', [98, 32, 155, 49], house([135, 38.5], [30, 9], 'flat-modern', SILVER, 2),
    { pool: pool([137, 45.5], [9, 3]), palms: [[119, 44], [151, 45]], trees: [[107, 40]], frontage: 'north' }),
  lot('Q2', 'chale-ocre', [130, 50, 155, 65], house([143, 57.5], [13, 10], 'gable', SAND_TILE, 1, false, '#d7b78b'),
    { palms: [[151, 53]], trees: [[133, 61]], frontage: 'north' }),
  lot('Q2', 'villa-cinza', [125, 66, 155, 83], house([142, 73.5], [17, 12], 'hip-villa', GRAPHITE),
    { pool: pool([129, 74], [4, 7]), palms: [[129, 80]], frontage: 'north' }),
  lot('Q2', 'villa-nordeste', [125, 84, 155, 101], house([143, 92], [15, 11], 'split-level', SAND_TILE, 2),
    { pool: pool([129, 93], [4, 7]), palms: [[151, 97]], frontage: 'north' }),
  lot('Q2', 'casa-fundos', [112, 84, 124, 101], house([118, 90], [8, 8], 'flat-modern', GRAPHITE, 1, false),
    { pool: pool([118, 97], [4, 3], 'rounded'), palms: [[121, 98]] }),
  lot('Q2', 'esquina-campeira', [98, 84, 111, 101], house([104.5, 91.5], [9, 11], 'hip-villa', WINE),
    { palms: [[108, 98]], frontage: 'south' }),
  lot('Q2', 'vazio-centro', [98, 50, 129, 65], undefined, { trees: [[102, 60]] }),
  lot('Q2', 'vazio-leste', [98, 66, 124, 83], undefined, { palms: [[101, 79]], trees: [[119, 80]] }),
];

const Q3: readonly DistrictParcel[] = [
  lot('Q3', 'villa-grande-musicanto', [166, 11, 199, 51], house([179, 25], [21, 23], 'courtyard', WINE, 2),
    { pool: pool([181, 43], [11, 6], 'kidney'), palms: [[192, 42], [173, 48], [195, 16]], trees: [[169, 15]], frontage: 'south' }),
  lot('Q3', 'casa-sudoeste', [200, 11, 219, 36], house([209, 21], [13, 16], 'gable', GRAPHITE),
    { pool: pool([204, 32.5], [5, 3]), trees: [[216, 14]], frontage: 'avenue' }),
  lot('Q3', 'casa-noroeste', [220, 11, 239, 42], house([226, 28], [9, 18], 'split-level', GRAPHITE, 2),
    { pool: pool([234, 16], [5, 6]), palms: [[235, 36]], frontage: 'north' }),
  lot('Q3', 'casa-branca-estreita', [200, 37, 219, 51], house([209, 41.5], [13, 6], 'flat-modern', SILVER),
    { pool: pool([209, 47.5], [8, 3.2]), frontage: 'avenue' }),
  lot('Q3', 'casa-ceramica-norte', [220, 43, 239, 57], house([230, 49.5], [13, 9], 'gable', SAND_TILE),
    { palms: [[223, 54]], frontage: 'north' }),
  lot('Q3', 'villa-ocre', [200, 58, 239, 73], house([223, 65], [24, 11], 'courtyard', TERRACOTTA, 2),
    { pool: pool([206, 65], [6, 6], 'rounded'), palms: [[203, 70]], frontage: 'north' }),
  lot('Q3', 'villa-madeira', [200, 74, 239, 87], house([226, 80], [17, 9], 'gable', '#926d51'),
    { pool: pool([207, 80], [9, 5], 'kidney'), palms: [[236, 82]], frontage: 'north' }),
  lot('Q3', 'villa-vinho', [200, 88, 239, 101], house([229, 94], [13, 9], 'hip-villa', WINE),
    { pool: pool([209, 94], [10, 5]), frontage: 'north' }),
  lot('Q3', 'casa-jardim-central', [166, 52, 199, 66], house([177, 59], [15, 10], 'gable', WINE),
    { pool: pool([191.5, 59], [7, 5], 'kidney'), palms: [[186, 63], [196, 54]] }),
  lot('Q3', 'villa-cinza-sul', [166, 67, 199, 83], house([177, 75], [16, 12], 'hip-villa', SILVER),
    { pool: pool([191, 75], [7, 5], 'rectangular', 0.22), palms: [[195, 80]] }),
  lot('Q3', 'villa-cinza-campo', [166, 84, 199, 101], house([178, 92], [19, 13], 'hip-villa', SILVER, 2),
    { pool: pool([194, 91], [5, 6], 'rounded'), palms: [[195, 98]], frontage: 'south' }),
];

const Q4: readonly DistrictParcel[] = [
  lot('Q4', 'esquina-fenasoja', [301, 11, 318, 36], house([310, 23], [11, 18], 'flat-modern', SILVER),
    { trees: [[315, 32]], frontage: 'avenue' }),
  lot('Q4', 'moderna-piscina-raia', [284, 11, 300, 36], house([292, 21], [10, 16], 'flat-modern', SILVER, 2),
    { pool: pool([291, 32], [11, 3]), palms: [[297, 33]], frontage: 'avenue' }),
  lot('Q4', 'villa-preta', [266, 11, 283, 36], house([274, 20.5], [11, 14], 'hip-villa', GRAPHITE),
    { pool: pool([274, 31], [7, 4], 'kidney'), frontage: 'avenue' }),
  lot('Q4', 'villa-sudoeste', [250, 11, 265, 41], house([256.5, 23], [9, 20], 'courtyard', GRAPHITE),
    { pool: pool([258, 37], [7, 4], 'rounded'), trees: [[253, 13]], frontage: 'south' }),
  lot('Q4', 'casa-clara-fenasoja', [287, 37, 318, 55], house([305, 45], [19, 12], 'split-level', SAND_TILE, 2),
    { pool: pool([291, 46], [5, 7]), palms: [[292, 52]], frontage: 'north' }),
  lot('Q4', 'metal-central', [269, 37, 286, 55], house([278, 44], [11, 11], 'gable', SILVER),
    { palms: [[272, 52]], confidence: 'inferred' }),
  lot('Q4', 'metal-sul', [250, 42, 268, 55], house([260, 48.5], [11, 9], 'gable', SILVER),
    { trees: [[253, 52]], frontage: 'south' }),
  lot('Q4', 'casa-vinho-central', [267, 56, 286, 70], house([277, 61], [13, 7], 'gable', WINE),
    { pool: pool([276, 66.5], [8, 3]), frontage: 'south' }),
  lot('Q4', 'casa-vinho-sul', [250, 56, 266, 70], house([257.5, 62.5], [11, 9], 'hip-villa', WINE),
    { palms: [[263, 67]], frontage: 'south' }),
  lot('Q4', 'cobertura-longa', [250, 71, 286, 85], house([268, 77.5], [30, 10], 'long-shed', TERRACOTTA, 1, false),
    { confidence: 'inferred', frontage: 'south' }),
  lot('Q4', 'villa-leste-piscina', [250, 86, 286, 101], house([259.5, 93], [14, 10], 'hip-villa', SAND_TILE),
    { pool: pool([275, 93], [9, 5], 'rectangular', 0.13), palms: [[283, 97]] }),
  lot('Q4', 'grande-jardim-norte', [287, 56, 318, 101], house([307, 89], [15, 17], 'courtyard', TERRACOTTA, 2, false),
    { palms: [[295, 66], [307, 61], [313, 74]], trees: [[291, 82], [299, 73]], frontage: 'north' }),
];

const Q5: readonly DistrictParcel[] = [
  lot('Q5', 'casa-faixa-oeste', [329, 11, 357, 26], house([342, 16.5], [17, 8], 'flat-modern', SILVER, 2),
    { pool: pool([338, 23], [9, 3.5], 'rounded'), palms: [[351, 22]], frontage: 'south' }),
  lot('Q5', 'casa-faixa-moderna', [329, 27, 357, 40], house([340, 33.5], [16, 9], 'flat-modern', SILVER, 2),
    { pool: pool([352, 33.5], [5, 6]), palms: [[332, 29]], frontage: 'south' }),
  lot('Q5', 'villa-ceramica-composta', [329, 41, 357, 64], house([344, 52], [21, 18], 'courtyard', SAND_TILE, 2),
    { palms: [[332, 60], [353, 61]], frontage: 'south' }),
  lot('Q5', 'casa-anexa-escura', [329, 65, 357, 75], house([339, 69.5], [14, 6], 'hip-villa', GRAPHITE),
    { pool: pool([351, 70], [6, 3]), confidence: 'inferred', frontage: 'south' }),
  lot('Q5', 'villa-faixa-cinza', [329, 76, 357, 89], house([340, 82], [16, 9], 'hip-villa', GRAPHITE),
    { pool: pool([352, 82], [5, 7], 'rounded'), palms: [[332, 86]], frontage: 'south' }),
  lot('Q5', 'villa-faixa-campo', [329, 90, 357, 101], house([339, 95], [15, 7], 'flat-modern', SILVER, 2),
    { pool: pool([352, 95], [6, 7]), frontage: 'south' }),
  lot('Q5', 'rbs-estudio', [358, 11, 386, 101], house([372, 47], [19, 31], 'long-shed', SILVER, 1, false),
    { use: 'institutional', trees: [[362, 17], [378, 86], [370, 94]], palms: [[379, 70]], frontage: 'avenue' }),
  lot('Q5', 'rbs-administracao', [387, 11, 409, 101], house([398, 47], [14, 20], 'hip-villa', GRAPHITE, 1, false),
    { use: 'institutional', palms: [[403, 67], [391, 80]], trees: [[395, 17], [401, 93]], frontage: 'avenue' }),
];

export const LATERAL_DISTRICT_BLOCKS: readonly DistrictBlock[] = [
  { id: 'Q1', name: 'Cunha sul — Campeira / acesso diagonal', polygon: [[25, 11], [87, 11], [87, 91]], parcels: Q1,
    referenceSummary: { occupiedEstimate: [2, 3], poolsVisible: 0, notes: 'Carsul e cobertura longitudinal: dois conjuntos visíveis, uso comercial inferido; clareira e bosque predominam na cunha.' } },
  { id: 'Q2', name: 'Rua Campeira — Rua Musicanto', polygon: rectangle([98, 11, 155, 101]), parcels: Q2,
    referenceSummary: { occupiedEstimate: [9, 11], poolsVisible: 6, notes: 'Nove conjuntos ocupados adotados, incluindo a cobertura Valmax; dois vazios centrais; ala longa pode conter anexos. Seis piscinas identificáveis.' } },
  { id: 'Q3', name: 'Rua Musicanto — Rua 10 de Agosto', polygon: rectangle([166, 11, 239, 101]), parcels: Q3,
    referenceSummary: { occupiedEstimate: [11, 13], poolsVisible: 10, notes: 'Onze propriedades adotadas, grande villa com piscina orgânica no sudoeste e três villas orientais; uma cobertura cerâmica sem piscina identificável.' } },
  { id: 'Q4', name: 'Rua 10 de Agosto — Rua Fenasoja', polygon: rectangle([250, 11, 318, 101]), parcels: Q4,
    referenceSummary: { occupiedEstimate: [11, 13], poolsVisible: 6, notes: 'Doze conjuntos volumétricos adotados; grande jardim norte/leste preservado; a cobertura longa pode ser anexo da propriedade vizinha. Seis piscinas visíveis.' } },
  { id: 'Q5', name: 'Faixa Fenasoja — transição institucional junto ao Portão 3', polygon: rectangle([329, 11, 409, 101]), parcels: Q5,
    referenceSummary: { occupiedEstimate: [7, 8], poolsVisible: 5, notes: 'Cinco a seis residências na faixa estreita e dois edifícios do mesmo campus RBS. O campus conserva amplos gramados; não equivale a uma quadra residencial convencional.' } },
];

/** Avenue already belongs to ParkAccessInfrastructure; only new branch streets live here. */
export const LATERAL_DISTRICT_ROADS: readonly DistrictRoad[] = [
  { id: 'district-access-diagonal', name: 'Acesso diagonal sul', centerline: [[12, 11], [31, 31], [68, 75], [103, 116]], width: 8.2, kind: 'collector' },
  { id: 'district-campeira', name: 'Rua Campeira', centerline: [[92.5, 5.8], [92.5, 103]], width: 7.4, kind: 'local' },
  { id: 'district-musicanto', name: 'Rua Musicanto', centerline: [[160.5, 5.8], [160.5, 103]], width: 7.4, kind: 'local' },
  { id: 'district-10-agosto', name: 'Rua 10 de Agosto', centerline: [[244.5, 5.8], [244.5, 103]], width: 7.4, kind: 'local' },
  { id: 'district-fenasoja', name: 'Rua Fenasoja', centerline: [[323.5, 5.8], [323.5, 103]], width: 7.4, kind: 'local' },
];

// Deliberately hand-positioned bands preserve the eastern field edge and southern
// woodland. Parcel crowns are additional, separately specified landscape anchors.
const EDGE_TREES: readonly DistrictPoint[] = [
  [110.3, 107.6], [116.8, 110.9], [126.7, 108.8], [140.8, 113.2], [150.4, 107.2],
  [171.9, 108.2], [184.1, 111.7], [198.8, 113.5], [208.6, 107.8], [222.2, 110.4], [232.9, 113.4],
  [254.7, 110.4], [266.9, 113.5], [277.1, 108], [290.2, 112.8], [301.6, 108.6], [313.4, 112.2],
  [333.8, 109.8], [345.2, 112.6], [360.8, 114], [371, 109.2], [384.6, 108], [395.3, 112.3], [406.6, 109.6],
  [57, 41], [65, 49], [70, 40], [76, 58], [82, 70], [80, 48], [83, 33],
];
// Satellite images 2/5/6 show a planted strip, not isolated street trees. Its
// lower, staggered crowns fill the gaps behind Q2–Q5 while the cross-street
// mouths, diagonal access and Q1's clearing retain their existing footprints.
const FIELD_EDGE_UNDERSTORY: readonly DistrictPoint[] = [
  [112, 115.3], [122.8, 115.6], [134.5, 116.6], [143, 114.5], [150.7, 116.7],
  [171, 115.1], [182.2, 116.6], [191.2, 114.8], [204.4, 117], [214, 115], [227.4, 116.7], [234.5, 115.2],
  [255.1, 117], [265.4, 114.8], [281.8, 116.2], [292, 115.4], [305.1, 117], [313.1, 114.6],
  [334.5, 116.1], [343, 115], [356.7, 117], [367, 114.6], [378.4, 115.3], [387.1, 117], [398.4, 114.5], [404.9, 116.6],
];
// [s, t, height, crown radius]: the wooded part of Q1 visible in images 2/6.
// Whole crowns stay inside the triangular unit, outside its three parcels and
// clear of the diagonal carriageway/sidewalk. The grass clearing stays open.
const SOUTH_WOODLAND: readonly (readonly [number, number, number, number])[] = [
  [53, 38, 6.4, 2.6], [58.8, 38, 8.8, 3], [65.5, 38.5, 5.2, 3.2], [70.5, 40, 6.8, 2.7],
  [55.5, 43.2, 7.8, 3], [62, 44.3, 9.7, 3.7], [68.2, 47, 8.1, 3.4], [72.5, 51.5, 9.4, 3.7],
  [59.5, 49, 5.8, 3.1], [65, 52.5, 9.1, 3.6], [70, 56.5, 7.6, 3.3], [76, 56, 10, 3.9],
  [82, 51.5, 6.2, 3.5], [80.5, 60.5, 8.5, 3.7], [67.8, 59.2, 4.8, 3.2], [73.5, 63, 9.6, 4],
  [82.7, 67.3, 7.1, 3.1], [77, 69.5, 8.9, 3.5], [83, 74.5, 5.6, 3], [82.4, 77.3, 4.5, 2.7],
];
export const LATERAL_DISTRICT_VEGETATION: readonly DistrictVegetation[] = [
  ...EDGE_TREES.map((center, index): DistrictVegetation => ({ id: `district-edge-${index + 1}`, center,
    height: [8.5, 10.5, 7.4, 9.2][index % 4],
    crownRadius: center[1] > 101 ? [4.9, 5.4, 4.6, 5.2, 4.5, 5.1, 4.8][index % 7] : [3.5, 4.2, 3.1][index % 3], kind: 'broadleaf' })),
  ...FIELD_EDGE_UNDERSTORY.map((center, index): DistrictVegetation => ({ id: `district-field-understory-${index + 1}`, center,
    height: [5.3, 6.4, 4.9, 5.9][index % 4], crownRadius: [3.8, 4, 4.3, 3.7][index % 4], kind: 'broadleaf' })),
  ...SOUTH_WOODLAND.map(([s, t, height, crownRadius], index): DistrictVegetation => ({
    id: `district-q1-woodland-${index + 1}`, center: [s, t], height, crownRadius, kind: 'broadleaf' })),
  ...LATERAL_DISTRICT_BLOCKS.flatMap((block) => block.parcels.flatMap((parcel) => [
    ...parcel.palms.map((center, index): DistrictVegetation => ({ id: `${parcel.id}-palm-${index + 1}`, center,
      height: [9.8, 11.2, 8.4][index % 3], crownRadius: 3.8, kind: 'palm' })),
    ...parcel.trees.map((center, index): DistrictVegetation => ({ id: `${parcel.id}-tree-${index + 1}`, center,
      height: [6.4, 7.8][index % 2], crownRadius: 2.8, kind: 'broadleaf' })),
  ])),
];

export const LATERAL_DISTRICT_LOCAL_BOUNDS = [12, 5.8, 414, 121] as const;
const BOUNDS_CORNERS = rectangle(LATERAL_DISTRICT_LOCAL_BOUNDS).map(lateralDistrictPointToWorld);
export const LATERAL_DISTRICT_WORLD_BOUNDS = {
  minX: Math.min(...BOUNDS_CORNERS.map((point) => point[0])),
  minZ: Math.min(...BOUNDS_CORNERS.map((point) => point[1])),
  maxX: Math.max(...BOUNDS_CORNERS.map((point) => point[0])),
  maxZ: Math.max(...BOUNDS_CORNERS.map((point) => point[1])),
} as const;

/** Remove procedural context trees from the district, keeping their crowns clear. */
export function lateralDistrictContainsWorldPoint(point: DistrictPoint, marginMeters = 0): boolean {
  const [s, t] = lateralDistrictWorldPointToLocal(point);
  return s >= LATERAL_DISTRICT_LOCAL_BOUNDS[0] - marginMeters
    && s <= LATERAL_DISTRICT_LOCAL_BOUNDS[2] + marginMeters
    && t >= LATERAL_DISTRICT_LOCAL_BOUNDS[1] - marginMeters
    && t <= LATERAL_DISTRICT_LOCAL_BOUNDS[3] + marginMeters;
}

export const LATERAL_DISTRICT_REFERENCE_COUNTS = LATERAL_DISTRICT_BLOCKS.map((block) => ({
  blockId: block.id,
  occupiedParcels: block.parcels.filter((parcel) => parcel.house).length,
  residentialParcels: block.parcels.filter((parcel) => parcel.use === 'residential').length,
  vacantParcels: block.parcels.filter((parcel) => parcel.use === 'vacant').length,
  pools: block.parcels.filter((parcel) => parcel.pool).length,
}));
