import { DEFAULT_REFERENCE_LAYERS, MAP_REFERENCE_HEIGHT, MAP_REFERENCE_WIDTH, OFFICIAL_REFERENCE_IMAGE } from '../constants';
import type { CommercialMapData, Coordinate, MapClassification, MapEntity, PolygonGeometry } from '../types';

type PixelPoint = [number, number];

interface ReferenceEntityInput {
  code: string;
  name: string;
  classification: MapClassification;
  layer: string;
  polygon: PixelPoint[];
  height?: number;
  description?: string;
  metadata?: Record<string, unknown>;
}

const IMAGE_WIDTH = 1920;
const IMAGE_HEIGHT = 1080;

function pixelToLocal([x, y]: PixelPoint): Coordinate {
  return [
    (x / IMAGE_WIDTH) * MAP_REFERENCE_WIDTH - MAP_REFERENCE_WIDTH / 2,
    (y / IMAGE_HEIGHT) * MAP_REFERENCE_HEIGHT - MAP_REFERENCE_HEIGHT / 2,
  ];
}

function rect(x1: number, y1: number, x2: number, y2: number): PixelPoint[] {
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
}

function geometry(input: ReferenceEntityInput): PolygonGeometry {
  const ring = input.polygon.map(pixelToLocal);
  ring.push([...ring[0]] as Coordinate);
  return {
    id: null,
    type: 'Polygon',
    coordinates: [ring],
    elevation: 0,
    extrusionHeight: input.height ?? 0.16,
    rotation: 0,
    geometryVersion: 1,
    calibrationVersion: null,
  };
}

function toEntity(input: ReferenceEntityInput): MapEntity {
  return {
    id: `reference:${input.code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    projectId: 'reference:fenasoja-2024',
    layerId: `reference:${input.layer}`,
    parentEntityId: null,
    publicIdentifier: input.code,
    name: input.name,
    description: input.description ?? null,
    classification: input.classification,
    verificationStatus: 'NEEDS_REVIEW',
    isSellable: false,
    isArchived: false,
    geometry: geometry(input),
    metadata: {
      source: 'Mapa oficial Fenasoja, atualizado em 08/11/2024',
      cartographicConfidence: 'reference_only',
      officialMeasurements: false,
      referencePixelPolygon: input.polygon,
      ...input.metadata,
    },
  };
}

/**
 * Digitalização preliminar e explicitamente não calibrada das estruturas de
 * alto nível legíveis no mapa oficial. Não contém lotes comerciais inventados.
 */
const REFERENCE_INPUTS: ReferenceEntityInput[] = [
  { code: 'EST-VIS-01', name: 'Estacionamento de visitantes — Portão 6', classification: 'PARKING', layer: 'parking', polygon: rect(310, 90, 1105, 355), height: 0.08 },
  { code: 'EST-VIS-02', name: 'Estacionamento de visitantes — leste', classification: 'PARKING', layer: 'parking', polygon: [[1535, 832], [1805, 850], [1740, 1052], [1535, 1010]], height: 0.08 },
  { code: 'EST-EXP-01', name: 'Estacionamento de expositores', classification: 'PARKING', layer: 'parking', polygon: [[1318, 746], [1540, 746], [1515, 985], [1320, 970]], height: 0.08 },
  { code: 'PISTA-CAMPEIRA', name: 'Pista campeira', classification: 'LIVESTOCK_AREA', layer: 'structures', polygon: rect(610, 350, 1112, 468), height: 0.1 },
  { code: 'PISTA-REMATES', name: 'Pista de remates', classification: 'LIVESTOCK_AREA', layer: 'structures', polygon: rect(575, 350, 626, 532), height: 0.32 },
  { code: 'LAGO', name: 'Lago central', classification: 'WATER', layer: 'water', polygon: rect(1392, 590, 1580, 710), height: 0.05 },
  { code: 'PRCT', name: 'Área PRCT', classification: 'GREEN_AREA', layer: 'green', polygon: [[1658, 242], [1815, 244], [1810, 831], [1617, 787], [1615, 510]], height: 0.07 },
  { code: 'PARQUE-DIVERSOES', name: 'Parque de diversões', classification: 'ATTRACTION', layer: 'structures', polygon: rect(339, 535, 527, 725), height: 0.14 },
  { code: 'BOSQUE-OESTE', name: 'Bosque e área de visitantes', classification: 'GREEN_AREA', layer: 'green', polygon: [[203, 711], [711, 711], [704, 998], [314, 1005], [220, 916]], height: 0.06 },
  { code: 'AREA-MOTORHOME', name: 'Área para motorhome e trailer', classification: 'PARKING', layer: 'parking', polygon: rect(338, 365, 573, 530), height: 0.08 },

  { code: 'BLOCO-S', name: 'Bloco S — Exporural Máquinas', classification: 'RURAL_EXHIBITION', layer: 'exporural', polygon: [[1200, 215], [1683, 215], [1683, 337], [1200, 337]], height: 0.22 },
  { code: 'BLOCO-R', name: 'Bloco R — Exporural Cultivares', classification: 'RURAL_EXHIBITION', layer: 'exporural', polygon: [[1194, 343], [1680, 343], [1680, 425], [1194, 425]], height: 0.22 },
  { code: 'EXPORURAL-SUL', name: 'Exporural — área técnica sul', classification: 'RURAL_EXHIBITION', layer: 'exporural', polygon: [[1080, 428], [1683, 428], [1665, 548], [1220, 550], [1110, 508]], height: 0.2 },
  { code: 'BLOCO-Q', name: 'Bloco Q', classification: 'OTHER', layer: 'structures', polygon: rect(574, 538, 845, 588), height: 0.18 },
  { code: 'BLOCO-N', name: 'Bloco N', classification: 'OTHER', layer: 'structures', polygon: rect(850, 538, 1040, 588), height: 0.18 },
  { code: 'BLOCO-G', name: 'Bloco G', classification: 'OTHER', layer: 'structures', polygon: rect(1045, 538, 1190, 645), height: 0.18 },
  { code: 'BLOCO-P', name: 'Bloco P', classification: 'OTHER', layer: 'structures', polygon: rect(574, 590, 846, 648), height: 0.18 },
  { code: 'BLOCO-M', name: 'Bloco M', classification: 'OTHER', layer: 'structures', polygon: rect(851, 590, 1037, 648), height: 0.18 },
  { code: 'BLOCO-O', name: 'Bloco O', classification: 'OTHER', layer: 'structures', polygon: rect(574, 652, 846, 713), height: 0.18 },
  { code: 'BLOCO-L', name: 'Bloco L', classification: 'OTHER', layer: 'structures', polygon: rect(851, 652, 1038, 713), height: 0.18 },
  { code: 'BLOCO-F', name: 'Bloco F', classification: 'OTHER', layer: 'structures', polygon: rect(1042, 651, 1190, 708), height: 0.18 },
  { code: 'BLOCO-J', name: 'Bloco J', classification: 'OTHER', layer: 'structures', polygon: rect(850, 716, 1038, 776), height: 0.18 },
  { code: 'BLOCO-E', name: 'Bloco E', classification: 'OTHER', layer: 'structures', polygon: rect(1042, 713, 1188, 778), height: 0.18 },
  { code: 'BLOCO-I', name: 'Bloco I', classification: 'OTHER', layer: 'structures', polygon: rect(850, 780, 1038, 835), height: 0.18 },
  { code: 'BLOCO-D', name: 'Bloco D', classification: 'OTHER', layer: 'structures', polygon: rect(1042, 780, 1187, 840), height: 0.18 },
  { code: 'BLOCO-B', name: 'Bloco B', classification: 'OTHER', layer: 'structures', polygon: rect(1198, 777, 1315, 900), height: 0.18 },
  { code: 'BLOCO-A', name: 'Bloco A', classification: 'OTHER', layer: 'structures', polygon: rect(1198, 900, 1315, 1007), height: 0.18 },
  { code: 'BLOCO-C', name: 'Bloco C', classification: 'OTHER', layer: 'structures', polygon: [[1193, 720], [1330, 720], [1323, 774], [1193, 774]], height: 0.18 },

  { code: 'B1', name: 'Pavilhão 1 — Indústria, comércio e serviços', classification: 'PAVILION', layer: 'pavilions', polygon: rect(698, 842, 837, 920), height: 2.1 },
  { code: 'B2', name: 'Pavilhão 14 — Artesanato, indústria e comércio', classification: 'PAVILION', layer: 'pavilions', polygon: rect(700, 921, 838, 1014), height: 2.25 },
  { code: 'B3', name: 'Pavilhão 12 — Indústria e comércio', classification: 'PAVILION', layer: 'pavilions', polygon: rect(840, 915, 963, 1016), height: 2.4 },
  { code: 'B4', name: 'Pavilhão 8 — Indústria e comércio', classification: 'PAVILION', layer: 'pavilions', polygon: rect(965, 907, 1048, 1016), height: 2.15 },
  { code: 'B5', name: 'Pavilhão 13 — Agricultura familiar', classification: 'PAVILION', layer: 'pavilions', polygon: rect(1048, 850, 1090, 1015), height: 1.8 },
  { code: 'B6', name: 'Pavilhão 3 — Comércio', classification: 'PAVILION', layer: 'pavilions', polygon: rect(1092, 902, 1160, 1018), height: 2.15 },
  { code: 'B7', name: 'Centro de administração e auditório', classification: 'ADMINISTRATION', layer: 'structures', polygon: rect(1160, 883, 1200, 1015), height: 2.05 },
  { code: 'B9', name: 'Pavilhão 5 — Laboratórios e pequenos animais', classification: 'PAVILION', layer: 'pavilions', polygon: rect(940, 470, 1008, 527), height: 1.55 },
  { code: 'B10', name: 'Pavilhão 10 — Pecuária, gado de corte e leite', classification: 'PAVILION', layer: 'pavilions', polygon: rect(870, 469, 945, 527), height: 1.45 },
  { code: 'B11', name: 'Pavilhão 6 — Pecuária, gado de leite', classification: 'PAVILION', layer: 'pavilions', polygon: rect(772, 469, 872, 527), height: 1.45 },
  { code: 'B12', name: 'Pavilhão 11 — Pecuária, gado de leite', classification: 'PAVILION', layer: 'pavilions', polygon: rect(690, 469, 773, 527), height: 1.45 },
  { code: 'B13', name: 'Pavilhão 7 — Pecuária, equinos', classification: 'PAVILION', layer: 'pavilions', polygon: rect(620, 469, 691, 527), height: 1.45 },

  { code: 'A1', name: 'Portão 1 — entrada de veículos de visitantes', classification: 'GATE', layer: 'gates', polygon: rect(275, 714, 304, 747), height: 0.65 },
  { code: 'A2', name: 'Portão 2 — bilheteria de visitantes', classification: 'GATE', layer: 'gates', polygon: rect(386, 952, 421, 981), height: 0.65 },
  { code: 'A3', name: 'Portão 3 — visitantes e veículos de expositores', classification: 'GATE', layer: 'gates', polygon: rect(1140, 1011, 1177, 1045), height: 0.65 },
  { code: 'A4', name: 'Portão 4 — bilheteria de visitantes', classification: 'GATE', layer: 'gates', polygon: rect(551, 456, 577, 488), height: 0.65 },
  { code: 'A5', name: 'Portão 5 — saída de veículos de expositores', classification: 'GATE', layer: 'gates', polygon: rect(1711, 839, 1742, 868), height: 0.65 },
  { code: 'A6', name: 'Portão 6 — saída de visitantes e expositores', classification: 'GATE', layer: 'gates', polygon: rect(914, 85, 948, 120), height: 0.65 },

  { code: 'C-CENTRAL', name: 'Restaurante central', classification: 'RESTAURANT', layer: 'food', polygon: rect(760, 730, 808, 809), height: 1.15 },
  { code: 'C-LAGO', name: 'Restaurante do lago', classification: 'RESTAURANT', layer: 'food', polygon: rect(1260, 600, 1302, 657), height: 1.15 },
  { code: 'D-PRACA', name: 'Praça de alimentação e alameda gastronômica', classification: 'FOOD_AREA', layer: 'food', polygon: rect(1117, 548, 1188, 646), height: 0.5 },
  { code: 'C1', name: 'Casa da etnia polonesa', classification: 'RESTAURANT', layer: 'food', polygon: rect(1350, 1030, 1410, 1072), height: 1.25 },
  { code: 'C2', name: 'Casa da etnia italiana', classification: 'RESTAURANT', layer: 'food', polygon: rect(1490, 1030, 1548, 1072), height: 1.25 },
  { code: 'BQ-LAGO', name: 'Banheiros químicos — lago', classification: 'CHEMICAL_RESTROOM', layer: 'restrooms', polygon: rect(1350, 551, 1398, 568), height: 0.45 },
  { code: 'T-BRIGADA', name: 'Brigada Militar', classification: 'SECURITY', layer: 'safety', polygon: rect(1110, 886, 1132, 918), height: 0.75 },
  { code: 'Y-SOCORROS', name: 'Primeiros socorros', classification: 'EMERGENCY', layer: 'safety', polygon: rect(821, 850, 842, 875), height: 0.75 },
  { code: 'V-BOMBEIROS', name: 'Corpo de Bombeiros', classification: 'EMERGENCY', layer: 'safety', polygon: rect(820, 805, 841, 832), height: 0.75 },

  { code: 'RUA-BRASIL', name: 'Rua Brasil', classification: 'ROAD', layer: 'circulation', polygon: rect(300, 708, 1210, 724), height: 0.025 },
  { code: 'RUA-PARAGUAI', name: 'Rua Paraguai', classification: 'ROAD', layer: 'circulation', polygon: rect(580, 527, 1210, 542), height: 0.025 },
  { code: 'RUA-BOLIVIA', name: 'Rua Bolívia', classification: 'ROAD', layer: 'circulation', polygon: rect(835, 584, 1210, 597), height: 0.025 },
  { code: 'RUA-CHILE', name: 'Rua Chile', classification: 'ROAD', layer: 'circulation', polygon: rect(835, 645, 1210, 658), height: 0.025 },
  { code: 'RUA-URUGUAI', name: 'Rua Uruguai', classification: 'ROAD', layer: 'circulation', polygon: rect(835, 773, 1210, 787), height: 0.025 },
  { code: 'RUA-ARGENTINA', name: 'Rua Argentina', classification: 'ROAD', layer: 'circulation', polygon: rect(835, 837, 1210, 852), height: 0.025 },
  { code: 'AV-BENVENUTO', name: 'Avenida Benvenuto de Conti', classification: 'ROAD', layer: 'circulation', polygon: rect(385, 1018, 1332, 1058), height: 0.025 },
];

export const OFFICIAL_REFERENCE_ENTITIES = REFERENCE_INPUTS.map(toEntity);

export const OFFICIAL_REFERENCE_DATA: CommercialMapData = {
  source: 'official-reference',
  sourceMessage: 'Base cartográfica oficial em digitalização. Geometrias de alto nível precisam de validação técnica antes da publicação comercial.',
  project: {
    id: 'reference:fenasoja-2024',
    orgId: null,
    name: 'Parque Fenasoja — referência oficial 2024',
    description: 'Digitalização preliminar do mapa atualizado em 08/11/2024.',
    coordinateSystem: 'LOCAL_NORMALIZED',
    referenceWidth: MAP_REFERENCE_WIDTH,
    referenceHeight: MAP_REFERENCE_HEIGHT,
    activeVersion: 1,
    isPublished: false,
  },
  calibration: {
    id: 'reference:calibration',
    projectId: 'reference:fenasoja-2024',
    referenceImagePath: OFFICIAL_REFERENCE_IMAGE,
    referenceImageUrl: OFFICIAL_REFERENCE_IMAGE,
    opacity: 0.28,
    isLocked: true,
    imageOffsetX: 0,
    imageOffsetY: 0,
    imageScaleX: 1,
    imageScaleY: 1,
    imageRotationDegrees: 0,
    pointA: null,
    pointB: null,
    knownDistanceMeters: null,
    mapUnitsPerMeter: null,
    status: 'UNVALIDATED',
    version: 1,
  },
  layers: DEFAULT_REFERENCE_LAYERS,
  entities: OFFICIAL_REFERENCE_ENTITIES,
  lots: [],
};
