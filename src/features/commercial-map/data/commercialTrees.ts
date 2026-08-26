import { officialPdfPointToLocal } from './officialReference2026';
import { NATIONS_DISTRICT_LAYOUT } from './nationsDistrict';

export type CommercialTreeQuadra = 'D' | 'I' | 'J' | 'E';

export type CommercialTreeArea = CommercialTreeQuadra
  | 'PARKING_EXHIBITORS_VISITORS'
  | 'PARKING_VISITORS'
  | 'PAVILIONS_1_14_GROVE'
  | 'RUA_BRASIL_GROVE'
  | 'TERCEIRA_IDADE_EDGE'
  | 'NATIONS_DISTRICT';

export type CommercialTreePlacement =
  | 'INSIDE_LOT'
  | 'LOT_EDGE'
  | 'SIDEWALK_EDGE'
  | 'STREET_EDGE'
  | 'QUADRA_BORDER'
  | 'PARKING_ISLAND'
  | 'PARKING_EDGE'
  | 'LANDSCAPE_MASS'
  | 'BUILDING_EDGE'
  | 'OUTSIDE_COMMERCIAL_LOT';

export type CommercialTreeSpeciesGroup =
  | 'MATURE_BROADLEAF'
  | 'OPEN_CANOPY'
  | 'ORNAMENTAL_COMPACT';

export type CommercialTreeVerificationStatus =
  | 'SATELLITE_CONFIRMED'
  | 'CLUSTER_INTERPRETED'
  | 'FIELD_REVIEW_RECOMMENDED';

export interface CommercialMapTree {
  id: string;
  classification: 'PARK_TREE';
  isSellable: false;
  contributesToCommercialMetrics: false;
  area: CommercialTreeArea;
  quadra: CommercialTreeQuadra | null;
  /** Stable cadastral lot identifier (Q-D-02, for example), never a runtime UUID. */
  relatedLotId: string | null;
  /** Stable non-commercial surface identifier used for elevation and scene selection. */
  surfaceEntityIdentifier: string | null;
  placement: CommercialTreePlacement;
  /** Local Fenasoja map coordinates in [x, z] order. */
  position: readonly [number, number];
  /** Reproducible point in the official 2026 PDF crop before local conversion. */
  sourcePosition: readonly [number, number];
  canopyRadius: number;
  trunkRadius: number;
  trunkHeight: number;
  crownHeight: number;
  speciesGroup: CommercialTreeSpeciesGroup;
  visualVariant: number;
  shadowSize: readonly [number, number];
  shadowRotation: number;
  shadowDirection: readonly [number, number];
  isVisible: boolean;
  sourceReference: string;
  notes: string;
  verificationStatus: CommercialTreeVerificationStatus;
}

export const COMMERCIAL_TREE_LAYER_REVISION = '2026.5-park-environment.2';

export const COMMERCIAL_TREE_SOURCE_REFERENCES = {
  D: 'Anexo 1 — satélite da Quadra D (088fa39a-75de-4768-b7fb-7017886f84ab.png)',
  I: 'Anexo 2 — satélite da Quadra I (895825ad-1254-45fe-bb9d-0c17ab7311e9.png)',
  J: 'Anexo 3 — satélite da Quadra J (b325a535-e734-4b8a-afbf-067195b949c6.png)',
  E: 'Anexo 4 — satélite da Quadra E (b3b360dc-bf11-4cf6-808b-7c45475ef446.png)',
  PARKING_EXHIBITORS_VISITORS: 'Anexos 2 e 6 — estacionamento de expositores/visitantes e leitura aérea entre Arena e Praça das Nações',
  PARKING_VISITORS: 'Anexos 2 e 6 — estacionamento de visitantes e bordas arborizadas da Rua Brasil',
  PAVILIONS_1_14_GROVE: 'Anexos 3 e 7 — maciço da Árvore Lunar atrás dos Pavilhões 1 e 14',
  RUA_BRASIL_GROVE: 'Anexos 3 e 7 — árvores limítrofes da Rua Brasil',
  TERCEIRA_IDADE_EDGE: 'Anexos 3 e 7 — árvores próximas ao Pavilhão Terceira Idade',
  NATIONS_DISTRICT: 'Anexos oficiais IMG_9670 (1).jpeg e IMG_9671.jpeg — massas periféricas da Praça das Nações',
} as const satisfies Record<CommercialTreeArea, string>;

export const COMMERCIAL_TREE_AREA_SCENE_ANCHORS: Readonly<Record<Exclude<CommercialTreeArea, CommercialTreeQuadra>, readonly string[]>> = {
  PARKING_EXHIBITORS_VISITORS: ['EST-EXP-VIS'],
  PARKING_VISITORS: ['EST-VIS'],
  PAVILIONS_1_14_GROVE: ['B1', 'B2', 'G'],
  RUA_BRASIL_GROVE: ['RUA-BRASIL', 'B1', 'B2', 'G'],
  TERCEIRA_IDADE_EDGE: ['B22'],
  NATIONS_DISTRICT: ['B20', 'B29', 'C5', 'C6', 'C7', 'C8', 'PORTICO-NACOES'],
};

// The D annex shows the long projected mass toward Quadra E (-z), with a mild
// eastward component. This vector is shared by the satellite set's sun angle.
const DEFAULT_SHADOW_ROTATION = -0.78;

const SPECIES_DIMENSIONS: Record<CommercialTreeSpeciesGroup, {
  canopyRadius: number;
  trunkRadius: number;
  trunkHeight: number;
  crownHeight: number;
}> = {
  MATURE_BROADLEAF: { canopyRadius: 1.02, trunkRadius: 0.16, trunkHeight: 1.55, crownHeight: 2.35 },
  OPEN_CANOPY: { canopyRadius: 0.88, trunkRadius: 0.14, trunkHeight: 1.72, crownHeight: 2.05 },
  ORNAMENTAL_COMPACT: { canopyRadius: 0.62, trunkRadius: 0.11, trunkHeight: 1.08, crownHeight: 1.42 },
};

interface TreeBlueprint {
  sourcePosition: readonly [number, number];
  placement: CommercialTreePlacement;
  relatedLotId?: string;
  surfaceEntityIdentifier?: string;
  speciesGroup?: CommercialTreeSpeciesGroup;
  scale?: number;
  shadowRotation?: number;
  verificationStatus?: CommercialTreeVerificationStatus;
  notes: string;
}

function sourceToLocal(point: readonly [number, number]): readonly [number, number] {
  const [x, z] = officialPdfPointToLocal(point);
  return [Number(x.toFixed(4)), Number(z.toFixed(4))];
}

function round(value: number) {
  return Number(value.toFixed(3));
}

function isCommercialTreeQuadra(area: CommercialTreeArea): area is CommercialTreeQuadra {
  return area === 'D' || area === 'I' || area === 'J' || area === 'E';
}

const TREE_AREA_ID_PREFIX: Readonly<Record<CommercialTreeArea, string>> = {
  D: 'd',
  I: 'i',
  J: 'j',
  E: 'e',
  PARKING_EXHIBITORS_VISITORS: 'parking-west',
  PARKING_VISITORS: 'parking-east',
  PAVILIONS_1_14_GROVE: 'pavilions-1-14',
  RUA_BRASIL_GROVE: 'rua-brasil',
  TERCEIRA_IDADE_EDGE: 'terceira-idade',
  NATIONS_DISTRICT: 'nations',
};

function buildTrees(area: CommercialTreeArea, blueprints: readonly TreeBlueprint[]): CommercialMapTree[] {
  return blueprints.map((blueprint, index) => {
    const speciesGroup = blueprint.speciesGroup ?? (index % 5 === 1 ? 'OPEN_CANOPY' : 'MATURE_BROADLEAF');
    const dimensions = SPECIES_DIMENSIONS[speciesGroup];
    const scale = blueprint.scale ?? 0.88 + (index % 4) * 0.08;
    const canopyRadius = round(dimensions.canopyRadius * scale);
    const shadowRotation = blueprint.shadowRotation ?? DEFAULT_SHADOW_ROTATION + ((index % 3) - 1) * 0.035;
    const id = `tree-${TREE_AREA_ID_PREFIX[area]}-${String(index + 1).padStart(2, '0')}`;

    return {
      id,
      classification: 'PARK_TREE',
      isSellable: false,
      contributesToCommercialMetrics: false,
      area,
      quadra: isCommercialTreeQuadra(area) ? area : null,
      relatedLotId: blueprint.relatedLotId ?? null,
      surfaceEntityIdentifier: blueprint.surfaceEntityIdentifier ?? null,
      placement: blueprint.placement,
      position: sourceToLocal(blueprint.sourcePosition),
      sourcePosition: blueprint.sourcePosition,
      canopyRadius,
      trunkRadius: round(dimensions.trunkRadius * scale),
      trunkHeight: round(dimensions.trunkHeight * scale),
      crownHeight: round(dimensions.crownHeight * scale),
      speciesGroup,
      visualVariant: index % 6,
      shadowSize: [round(canopyRadius * 1.68), round(canopyRadius * 1.02)],
      shadowRotation,
      shadowDirection: [round(Math.cos(shadowRotation)), round(Math.sin(shadowRotation))],
      isVisible: true,
      sourceReference: COMMERCIAL_TREE_SOURCE_REFERENCES[area],
      notes: blueprint.notes,
      verificationStatus: blueprint.verificationStatus ?? 'SATELLITE_CONFIRMED',
    };
  });
}

function tracedTreeBand(
  points: readonly (readonly [number, number])[],
  placement: CommercialTreePlacement,
  notes: string,
  options: Pick<TreeBlueprint, 'surfaceEntityIdentifier' | 'speciesGroup' | 'scale' | 'verificationStatus'> = {},
): TreeBlueprint[] {
  return points.map((sourcePosition, index) => ({
    sourcePosition,
    placement,
    ...options,
    scale: (options.scale ?? 1) * (0.92 + (index % 5) * 0.045),
    notes: `${notes} Posição ${index + 1} do alinhamento interpretado; corredor de circulação mantido livre.`,
  }));
}

function recommendFieldReview(blueprints: readonly TreeBlueprint[]): readonly TreeBlueprint[] {
  return blueprints.map((tree) => ({
    ...tree,
    verificationStatus: 'FIELD_REVIEW_RECOMMENDED',
  }));
}

const QUADRA_D_TREES = buildTrees('D', recommendFieldReview([
  { sourcePosition: [3662, 3504], placement: 'LOT_EDGE', relatedLotId: 'Q-D-06', scale: 1.08, notes: 'Primeira copa real do corredor da Rua Uruguai; a mancha cinza para Quadra E foi excluída.' },
  { sourcePosition: [3685, 3520], placement: 'LOT_EDGE', relatedLotId: 'Q-D-06', speciesGroup: 'OPEN_CANOPY', scale: 1.02, notes: 'Centro claro do dossel, distinto da sombra alongada.' },
  { sourcePosition: [3712, 3536], placement: 'LOT_EDGE', relatedLotId: 'Q-D-08', scale: 1.17, notes: 'Copa madura na testada da Rua Uruguai.' },
  { sourcePosition: [3740, 3507], placement: 'LOT_EDGE', relatedLotId: 'Q-D-08', scale: 0.96, notes: 'Tronco estimado na borda cadastral, não no centro da sombra.' },
  { sourcePosition: [3763, 3525], placement: 'LOT_EDGE', relatedLotId: 'Q-D-08', scale: 1.2, notes: 'Centro de copa do maciço contínuo da Rua Uruguai.' },
  { sourcePosition: [3795, 3504], placement: 'LOT_EDGE', relatedLotId: 'Q-D-10', speciesGroup: 'OPEN_CANOPY', scale: 1.05, notes: 'Copa de borda entre árvores maduras.' },
  { sourcePosition: [3827, 3532], placement: 'LOT_EDGE', relatedLotId: 'Q-D-10', scale: 1.22, notes: 'Copa confirmada no limite norte, sem árvore criada na projeção escura.' },
  { sourcePosition: [3863, 3507], placement: 'LOT_EDGE', relatedLotId: 'Q-D-12', scale: 1.08, notes: 'Árvore de transição para a Rua Brasília.' },
  { sourcePosition: [3900, 3525], placement: 'LOT_EDGE', relatedLotId: 'Q-D-12', speciesGroup: 'OPEN_CANOPY', scale: 1.0, notes: 'Última copa do alinhamento norte da Quadra D.' },
]));

const QUADRA_I_TREES = buildTrees('I', recommendFieldReview([
  { sourcePosition: [2780, 3470], placement: 'SIDEWALK_EDGE', scale: 1.18, notes: 'Copa externa ao lote no início da Calçada do Arvoredo.' },
  { sourcePosition: [2792, 3500], placement: 'SIDEWALK_EDGE', scale: 1.24, notes: 'Árvore do corredor arborizado, fora da malha comercial.' },
  { sourcePosition: [2804, 3530], placement: 'SIDEWALK_EDGE', speciesGroup: 'OPEN_CANOPY', scale: 1.08, notes: 'Copa aberta no alinhamento da calçada.' },
  { sourcePosition: [2812, 3560], placement: 'SIDEWALK_EDGE', scale: 1.2, notes: 'Centro interpretado do maciço oeste.' },
  { sourcePosition: [2820, 3590], placement: 'QUADRA_BORDER', scale: 1.28, notes: 'Tronco no limite oeste da quadra, sem atribuição a lote.' },
  { sourcePosition: [2828, 3625], placement: 'LOT_EDGE', relatedLotId: 'Q-I-01', speciesGroup: 'OPEN_CANOPY', scale: 1.12, notes: 'Copa na borda oeste do lote 01.' },
  { sourcePosition: [2836, 3660], placement: 'LOT_EDGE', relatedLotId: 'Q-I-01', scale: 1.16, notes: 'Segunda copa limítrofe do lote 01.' },
  { sourcePosition: [2818, 3692], placement: 'QUADRA_BORDER', scale: 1.0, notes: 'Árvore na aproximação da Rua Argentina, fora do miolo do lote.' },
  { sourcePosition: [2868, 3504], placement: 'LOT_EDGE', relatedLotId: 'Q-I-02', scale: 1.05, notes: 'Copa na testada da Rua Uruguai.' },
  { sourcePosition: [2915, 3500], placement: 'LOT_EDGE', relatedLotId: 'Q-I-04', speciesGroup: 'ORNAMENTAL_COMPACT', scale: 1.08, notes: 'Árvore menor na borda norte.' },
  { sourcePosition: [2960, 3502], placement: 'LOT_EDGE', relatedLotId: 'Q-I-04', speciesGroup: 'OPEN_CANOPY', scale: 0.98, notes: 'Copa de borda próxima ao lote 04.' },
  { sourcePosition: [3110, 3550], placement: 'INSIDE_LOT', relatedLotId: 'Q-I-08', speciesGroup: 'OPEN_CANOPY', scale: 0.92, notes: 'Copa radial isolada apoiada pelos anexos I/J; o tronco interno ainda requer vistoria.' },
  { sourcePosition: [3060, 3728], placement: 'STREET_EDGE', scale: 1.12, notes: 'Árvore da Rua Argentina mantida fora dos lotes.' },
  { sourcePosition: [3120, 3738], placement: 'STREET_EDGE', scale: 1.2, notes: 'Centro de copa externo na faixa sul.' },
  { sourcePosition: [3175, 3727], placement: 'STREET_EDGE', speciesGroup: 'OPEN_CANOPY', scale: 1.08, notes: 'Árvore externa da Rua Argentina; sombra não foi usada como tronco.' },
]));

const QUADRA_J_TREES = buildTrees('J', recommendFieldReview([
  { sourcePosition: [2740, 3210], placement: 'SIDEWALK_EDGE', speciesGroup: 'OPEN_CANOPY', scale: 1.04, notes: 'Primeira copa do corredor da Calçada do Arvoredo.' },
  { sourcePosition: [2750, 3240], placement: 'SIDEWALK_EDGE', scale: 1.2, notes: 'Centro de copa do maciço superior direito do anexo.' },
  { sourcePosition: [2762, 3272], placement: 'SIDEWALK_EDGE', scale: 1.26, notes: 'Árvore externa à quadra no alinhamento arborizado.' },
  { sourcePosition: [2775, 3305], placement: 'SIDEWALK_EDGE', speciesGroup: 'OPEN_CANOPY', scale: 1.14, notes: 'Tronco atribuído à calçada, não ao lote.' },
  { sourcePosition: [2785, 3337], placement: 'SIDEWALK_EDGE', scale: 1.25, notes: 'Copa madura sobreposta no maciço oeste.' },
  { sourcePosition: [2795, 3370], placement: 'SIDEWALK_EDGE', scale: 1.12, notes: 'Árvore do corredor de pedestres.' },
  { sourcePosition: [2810, 3402], placement: 'QUADRA_BORDER', speciesGroup: 'OPEN_CANOPY', scale: 1.08, notes: 'Copa de transição para a Rua Uruguai.' },
  { sourcePosition: [2825, 3428], placement: 'QUADRA_BORDER', scale: 1.08, notes: 'Árvore na esquina da Calçada do Arvoredo com a Rua Uruguai.' },
  { sourcePosition: [2860, 3432], placement: 'LOT_EDGE', relatedLotId: 'Q-J-01', scale: 1.15, notes: 'Copa na testada sul do lote 01.' },
  { sourcePosition: [2910, 3430], placement: 'LOT_EDGE', relatedLotId: 'Q-J-03', speciesGroup: 'OPEN_CANOPY', scale: 1.0, notes: 'Árvore na borda da Rua Uruguai junto ao lote 03.' },
  { sourcePosition: [2960, 3172], placement: 'STREET_EDGE', speciesGroup: 'ORNAMENTAL_COMPACT', scale: 0.96, notes: 'Árvore pequena no bordo da Rua Brasil.' },
  { sourcePosition: [3140, 3170], placement: 'STREET_EDGE', speciesGroup: 'ORNAMENTAL_COMPACT', scale: 0.9, notes: 'Árvore isolada na faixa da Rua Brasil.' },
  { sourcePosition: [3295, 3172], placement: 'STREET_EDGE', scale: 1.02, notes: 'Copa na divisão com a Rua Brasil, fora da malha comercial.' },
  { sourcePosition: [3395, 3176], placement: 'STREET_EDGE', speciesGroup: 'OPEN_CANOPY', scale: 1.06, notes: 'Árvore próxima à Rua Montevidéu, ainda no bordo viário.' },
]));

const QUADRA_E_TREES = buildTrees('E', recommendFieldReview([
  { sourcePosition: [3932, 3210], placement: 'LOT_EDGE', relatedLotId: 'Q-E-13', scale: 1.22, notes: 'Copa no limite leste do lote 13, diante do Centro de Eventos.' },
  { sourcePosition: [3925, 3240], placement: 'LOT_EDGE', relatedLotId: 'Q-E-13', speciesGroup: 'OPEN_CANOPY', scale: 1.16, notes: 'Tronco no gramado do lote 13; apenas a copa avança sobre a Rua Brasília.' },
  { sourcePosition: [3930, 3272], placement: 'LOT_EDGE', relatedLotId: 'Q-E-12', scale: 1.24, notes: 'Copa de borda associada somente ao lote 12.' },
  { sourcePosition: [3933, 3305], placement: 'LOT_EDGE', relatedLotId: 'Q-E-12', scale: 1.28, notes: 'Centro de copa do maciço frontal, com tronco na borda do lote 12.' },
  { sourcePosition: [3930, 3337], placement: 'LOT_EDGE', relatedLotId: 'Q-E-12', speciesGroup: 'OPEN_CANOPY', scale: 1.12, notes: 'Árvore no limite Rua Brasília/lote 12.' },
  { sourcePosition: [3928, 3370], placement: 'LOT_EDGE', relatedLotId: 'Q-E-11', scale: 1.18, notes: 'Copa frontal cujo tronco permanece no bordo gramado do lote 11.' },
  { sourcePosition: [3932, 3400], placement: 'LOT_EDGE', relatedLotId: 'Q-E-11', scale: 1.08, notes: 'Árvore de borda do lote 11.' },
  { sourcePosition: [3934, 3425], placement: 'LOT_EDGE', relatedLotId: 'Q-E-11', speciesGroup: 'OPEN_CANOPY', scale: 1.02, notes: 'Última copa frontal do lote 11, no encontro da Rua Brasília com a Rua Uruguai.' },
  { sourcePosition: [3525, 3173], placement: 'STREET_EDGE', speciesGroup: 'ORNAMENTAL_COMPACT', scale: 1.02, notes: 'Árvore jovem no bordo da Rua Brasil.' },
  { sourcePosition: [3600, 3170], placement: 'STREET_EDGE', speciesGroup: 'ORNAMENTAL_COMPACT', scale: 0.94, notes: 'Tronco externo aos lotes na faixa norte.' },
  { sourcePosition: [3680, 3175], placement: 'STREET_EDGE', scale: 1.05, notes: 'Copa alinhada à divisão com a Rua Brasil.' },
  { sourcePosition: [3760, 3172], placement: 'STREET_EDGE', speciesGroup: 'OPEN_CANOPY', scale: 1.08, notes: 'Árvore no bordo viário, sem atribuição ao lote.' },
  { sourcePosition: [3830, 3175], placement: 'STREET_EDGE', speciesGroup: 'ORNAMENTAL_COMPACT', scale: 0.98, notes: 'Árvore pequena junto à Rua Brasil.' },
  { sourcePosition: [3898, 3178], placement: 'QUADRA_BORDER', speciesGroup: 'OPEN_CANOPY', scale: 1.1, notes: 'Copa da esquina Rua Brasil/Rua Brasília, mantida no limite da quadra.' },
]));

const PARKING_EXHIBITORS_VISITORS_TREES = buildTrees('PARKING_EXHIBITORS_VISITORS', [
  ...tracedTreeBand([
    [4580, 3310], [4710, 3318], [4840, 3324], [4970, 3330], [5100, 3336], [5225, 3340],
    [4570, 3440], [4565, 3580], [4560, 3720], [4555, 3860], [4550, 4000],
    [4690, 4050], [4830, 4055], [4970, 4060], [5110, 4065], [5215, 4050],
    [5250, 3470], [5240, 3610], [5235, 3750], [5225, 3890],
  ], 'PARKING_EDGE', 'Perímetro arborizado do estacionamento de expositores e visitantes visto nos Anexos 2 e 6.', {
    surfaceEntityIdentifier: 'EST-EXP-VIS',
    verificationStatus: 'CLUSTER_INTERPRETED',
    scale: 1.08,
  }),
  ...tracedTreeBand([
    [4590, 3235], [4740, 3240], [4890, 3247], [5040, 3252], [5185, 3257],
  ], 'PARKING_EDGE', 'Faixa de transição entre Rua Brasil e o primeiro bloco de estacionamento, sem avançar sobre a via.', {
    surfaceEntityIdentifier: 'EST-EXP-VIS',
    speciesGroup: 'OPEN_CANOPY',
    verificationStatus: 'CLUSTER_INTERPRETED',
    scale: 0.96,
  }),
  ...tracedTreeBand([
    [4660, 3480], [4800, 3488], [4940, 3494], [5080, 3500],
    [4680, 3650], [4820, 3658], [4960, 3664], [5100, 3670],
    [4660, 3820], [4800, 3828], [4940, 3834], [5080, 3840],
    [4720, 3980], [4890, 3988], [5060, 3995],
  ], 'PARKING_ISLAND', 'Ilhas internas do estacionamento interpretadas pela alternância entre copas e corredores livres no Anexo 6.', {
    surfaceEntityIdentifier: 'EST-EXP-VIS',
    verificationStatus: 'CLUSTER_INTERPRETED',
    scale: 1.12,
  }),
]);

const PARKING_VISITORS_TREES = buildTrees('PARKING_VISITORS', [
  ...tracedTreeBand([
    [5425, 3472], [5540, 3485], [5660, 3498], [5780, 3510], [5890, 3525],
    [5390, 3590], [5390, 3740], [5385, 3890], [5380, 4050],
    [5925, 3610], [5910, 3780], [5895, 3960], [5875, 4140],
    [5480, 4150], [5610, 4168], [5740, 4188],
  ], 'PARKING_EDGE', 'Borda arborizada do estacionamento de visitantes, acompanhando o quadrilátero real sem invadir o acesso externo.', {
    surfaceEntityIdentifier: 'EST-VIS',
    verificationStatus: 'CLUSTER_INTERPRETED',
    scale: 1.05,
  }),
  ...tracedTreeBand([
    [5415, 3405], [5550, 3420], [5685, 3438], [5820, 3455],
  ], 'PARKING_EDGE', 'Transição norte do estacionamento de visitantes apoiada pela continuidade de copas do Anexo 6.', {
    surfaceEntityIdentifier: 'EST-VIS',
    speciesGroup: 'OPEN_CANOPY',
    verificationStatus: 'CLUSTER_INTERPRETED',
    scale: 0.98,
  }),
  ...tracedTreeBand([
    [5490, 3630], [5620, 3646], [5750, 3662],
    [5490, 3820], [5620, 3838], [5750, 3855],
    [5490, 4010], [5620, 4028], [5750, 4045],
  ], 'PARKING_ISLAND', 'Três ilhas internas escalonadas preservam faixas de manobra legíveis entre as árvores do estacionamento.', {
    surfaceEntityIdentifier: 'EST-VIS',
    verificationStatus: 'CLUSTER_INTERPRETED',
    scale: 1.1,
  }),
]);

const PAVILIONS_1_14_GROVE_TREES = buildTrees('PAVILIONS_1_14_GROVE', [
  ...tracedTreeBand([
    [1080, 3295], [1255, 3310], [1425, 3290], [1605, 3320], [1790, 3300], [1970, 3328], [1510, 3250], [2280, 3330],
    [1015, 3425], [1165, 3445], [1335, 3418], [1500, 3452], [1670, 3432], [1845, 3460], [2010, 3428], [2175, 3450], [2310, 3430],
    [1040, 3548], [1185, 3572], [1335, 3538], [1480, 3580], [1625, 3550], [1775, 3586], [1920, 3542], [2070, 3570], [2210, 3552],
    [1030, 3680], [1160, 3648], [1290, 3692], [1425, 3660], [1550, 3700], [1685, 3655], [1810, 3690], [1940, 3668], [2075, 3705], [2210, 3675],
    [1070, 3795], [1225, 3830], [1375, 3788], [1535, 3825], [1690, 3800], [1840, 3840], [1995, 3792], [2140, 3828], [2200, 3805],
    [1010, 3920], [1160, 3960], [1320, 3928], [1485, 3970], [1650, 3938], [1815, 3980], [1970, 3942], [2130, 3972], [2260, 3940],
    [980, 3980], [1080, 4050], [1240, 4025], [1405, 4070], [1570, 4040], [1740, 4080], [1900, 4048], [2060, 4082], [2215, 4055],
  ], 'LANDSCAPE_MASS', 'Maciço maduro da Árvore Lunar atrás dos Pavilhões 1 e 14, interpretado por faixas de dossel e clareiras dos Anexos 3 e 7.', {
    verificationStatus: 'CLUSTER_INTERPRETED',
    scale: 1.18,
  }),
]);

const RUA_BRASIL_GROVE_TREES = buildTrees('RUA_BRASIL_GROVE', [
  ...tracedTreeBand([
    [1655, 3192], [1715, 3215], [1785, 3188], [1840, 3208], [1915, 3189], [1970, 3219],
    [2045, 3190], [2110, 3214], [2170, 3189], [2245, 3218], [2300, 3194], [2370, 3220],
  ], 'STREET_EDGE', 'Alinhamento de copas no bordo sul da Rua Brasil, entre o maciço da Árvore Lunar e os pavilhões.', {
    surfaceEntityIdentifier: 'RUA-BRASIL',
    speciesGroup: 'OPEN_CANOPY',
    verificationStatus: 'CLUSTER_INTERPRETED',
    scale: 1.04,
  }),
]);

const TERCEIRA_IDADE_EDGE_TREES = buildTrees('TERCEIRA_IDADE_EDGE', [
  ...tracedTreeBand([
    [780, 3495], [880, 3495],
    [965, 3580], [970, 3680], [970, 3780],
    [710, 3580], [705, 3710],
    [790, 3870], [880, 3870],
  ], 'BUILDING_EDGE', 'Árvores de borda próximas ao Pavilhão Terceira Idade, mantidas fora do footprint oficial B22.', {
    verificationStatus: 'CLUSTER_INTERPRETED',
    scale: 1.08,
  }),
]);

const NATIONS_DISTRICT_TREES = buildTrees('NATIONS_DISTRICT', recommendFieldReview(
  NATIONS_DISTRICT_LAYOUT.trees.map((tree, index) => ({
    sourcePosition: tree.sourcePosition,
    placement: 'LANDSCAPE_MASS' as const,
    speciesGroup: index % 5 === 2 ? 'OPEN_CANOPY' as const : 'MATURE_BROADLEAF' as const,
    scale: tree.scale,
    shadowRotation: -0.78 + Math.sin(tree.rotation) * 0.04,
    notes: 'Copa interpretada na massa periférica real da Praça das Nações; eixo cívico, acessos e footprints construídos permanecem livres.',
  })),
));

export const COMMERCIAL_MAP_TREES: readonly CommercialMapTree[] = [
  ...QUADRA_D_TREES,
  ...QUADRA_I_TREES,
  ...QUADRA_J_TREES,
  ...QUADRA_E_TREES,
  ...PARKING_EXHIBITORS_VISITORS_TREES,
  ...PARKING_VISITORS_TREES,
  ...PAVILIONS_1_14_GROVE_TREES,
  ...RUA_BRASIL_GROVE_TREES,
  ...TERCEIRA_IDADE_EDGE_TREES,
  ...NATIONS_DISTRICT_TREES,
];

export const COMMERCIAL_TREE_COUNTS_BY_QUADRA: Readonly<Record<CommercialTreeQuadra, number>> = {
  D: QUADRA_D_TREES.length,
  I: QUADRA_I_TREES.length,
  J: QUADRA_J_TREES.length,
  E: QUADRA_E_TREES.length,
};

export const COMMERCIAL_TREE_COUNTS_BY_AREA: Readonly<Record<CommercialTreeArea, number>> = {
  ...COMMERCIAL_TREE_COUNTS_BY_QUADRA,
  PARKING_EXHIBITORS_VISITORS: PARKING_EXHIBITORS_VISITORS_TREES.length,
  PARKING_VISITORS: PARKING_VISITORS_TREES.length,
  PAVILIONS_1_14_GROVE: PAVILIONS_1_14_GROVE_TREES.length,
  RUA_BRASIL_GROVE: RUA_BRASIL_GROVE_TREES.length,
  TERCEIRA_IDADE_EDGE: TERCEIRA_IDADE_EDGE_TREES.length,
  NATIONS_DISTRICT: NATIONS_DISTRICT_TREES.length,
};
