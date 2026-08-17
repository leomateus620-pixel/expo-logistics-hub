import { officialPdfPointToLocal } from './officialReference2026';

export type CommercialTreeQuadra = 'D' | 'I' | 'J' | 'E';

export type CommercialTreePlacement =
  | 'INSIDE_LOT'
  | 'LOT_EDGE'
  | 'SIDEWALK_EDGE'
  | 'STREET_EDGE'
  | 'QUADRA_BORDER'
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
  quadra: CommercialTreeQuadra;
  /** Stable cadastral lot identifier (Q-D-02, for example), never a runtime UUID. */
  relatedLotId: string | null;
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

export const COMMERCIAL_TREE_LAYER_REVISION = '2026.1-dije-satellite.1';

export const COMMERCIAL_TREE_SOURCE_REFERENCES = {
  D: 'Anexo 1 — satélite da Quadra D (088fa39a-75de-4768-b7fb-7017886f84ab.png)',
  I: 'Anexo 2 — satélite da Quadra I (895825ad-1254-45fe-bb9d-0c17ab7311e9.png)',
  J: 'Anexo 3 — satélite da Quadra J (b325a535-e734-4b8a-afbf-067195b949c6.png)',
  E: 'Anexo 4 — satélite da Quadra E (b3b360dc-bf11-4cf6-808b-7c45475ef446.png)',
} as const satisfies Record<CommercialTreeQuadra, string>;

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

function buildTrees(quadra: CommercialTreeQuadra, blueprints: readonly TreeBlueprint[]): CommercialMapTree[] {
  return blueprints.map((blueprint, index) => {
    const speciesGroup = blueprint.speciesGroup ?? (index % 5 === 1 ? 'OPEN_CANOPY' : 'MATURE_BROADLEAF');
    const dimensions = SPECIES_DIMENSIONS[speciesGroup];
    const scale = blueprint.scale ?? 0.88 + (index % 4) * 0.08;
    const canopyRadius = round(dimensions.canopyRadius * scale);
    const shadowRotation = blueprint.shadowRotation ?? DEFAULT_SHADOW_ROTATION + ((index % 3) - 1) * 0.035;
    const id = `tree-${quadra.toLocaleLowerCase('pt-BR')}-${String(index + 1).padStart(2, '0')}`;

    return {
      id,
      quadra,
      relatedLotId: blueprint.relatedLotId ?? null,
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
      sourceReference: COMMERCIAL_TREE_SOURCE_REFERENCES[quadra],
      notes: blueprint.notes,
      verificationStatus: blueprint.verificationStatus ?? 'SATELLITE_CONFIRMED',
    };
  });
}

const QUADRA_D_TREES = buildTrees('D', [
  { sourcePosition: [3662, 3504], placement: 'LOT_EDGE', relatedLotId: 'Q-D-06', scale: 1.08, notes: 'Primeira copa real do corredor da Rua Uruguai; a mancha cinza para Quadra E foi excluída.' },
  { sourcePosition: [3685, 3520], placement: 'LOT_EDGE', relatedLotId: 'Q-D-06', speciesGroup: 'OPEN_CANOPY', scale: 1.02, notes: 'Centro claro do dossel, distinto da sombra alongada.' },
  { sourcePosition: [3712, 3536], placement: 'LOT_EDGE', relatedLotId: 'Q-D-08', scale: 1.17, notes: 'Copa madura na testada da Rua Uruguai.' },
  { sourcePosition: [3740, 3507], placement: 'LOT_EDGE', relatedLotId: 'Q-D-08', scale: 0.96, notes: 'Tronco estimado na borda cadastral, não no centro da sombra.' },
  { sourcePosition: [3763, 3525], placement: 'LOT_EDGE', relatedLotId: 'Q-D-08', scale: 1.2, notes: 'Centro de copa do maciço contínuo da Rua Uruguai.' },
  { sourcePosition: [3795, 3504], placement: 'LOT_EDGE', relatedLotId: 'Q-D-10', speciesGroup: 'OPEN_CANOPY', scale: 1.05, notes: 'Copa de borda entre árvores maduras.' },
  { sourcePosition: [3827, 3532], placement: 'LOT_EDGE', relatedLotId: 'Q-D-10', scale: 1.22, notes: 'Copa confirmada no limite norte, sem árvore criada na projeção escura.' },
  { sourcePosition: [3863, 3507], placement: 'LOT_EDGE', relatedLotId: 'Q-D-12', scale: 1.08, notes: 'Árvore de transição para a Rua Brasília.' },
  { sourcePosition: [3900, 3525], placement: 'LOT_EDGE', relatedLotId: 'Q-D-12', speciesGroup: 'OPEN_CANOPY', scale: 1.0, notes: 'Última copa do alinhamento norte da Quadra D.' },
].map((tree) => ({ ...tree, verificationStatus: 'FIELD_REVIEW_RECOMMENDED' as const })));

const QUADRA_I_TREES = buildTrees('I', [
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
].map((tree) => ({ ...tree, verificationStatus: 'FIELD_REVIEW_RECOMMENDED' as const })));

const QUADRA_J_TREES = buildTrees('J', [
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
].map((tree) => ({ ...tree, verificationStatus: 'FIELD_REVIEW_RECOMMENDED' as const })));

const QUADRA_E_TREES = buildTrees('E', [
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
].map((tree) => ({ ...tree, verificationStatus: 'FIELD_REVIEW_RECOMMENDED' as const })));

export const COMMERCIAL_MAP_TREES: readonly CommercialMapTree[] = [
  ...QUADRA_D_TREES,
  ...QUADRA_I_TREES,
  ...QUADRA_J_TREES,
  ...QUADRA_E_TREES,
];

export const COMMERCIAL_TREE_COUNTS_BY_QUADRA: Readonly<Record<CommercialTreeQuadra, number>> = {
  D: QUADRA_D_TREES.length,
  I: QUADRA_I_TREES.length,
  J: QUADRA_J_TREES.length,
  E: QUADRA_E_TREES.length,
};
