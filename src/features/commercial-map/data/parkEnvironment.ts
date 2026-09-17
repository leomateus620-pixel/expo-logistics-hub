import { ARENA_CANONICAL_LAYOUT, ARENA_VEGETATION } from './arenaCanonicalLayout';
import { officialPdfPointToLocal } from './officialReference2026';
import { MIRANTE_COMPLEX } from './miranteComplexReconstruction';
import type { MapEntity } from '../types';

export type ParkEnvironmentClassification =
  | 'NON_COMMERCIAL_STRUCTURE'
  | 'SPORTS_COURT'
  | 'CONCRETE_STAIRS'
  | 'PAVED_PUBLIC_AREA'
  | 'LANDSCAPE_FEATURE'
  | 'NATURAL_TERRAIN'
  | 'SPORTS_FIELD'
  | 'PEDESTRIAN_PATH';

export type ParkEnvironmentVerificationStatus =
  | 'REFERENCE_INTERPRETED'
  | 'FIELD_REVIEW_RECOMMENDED';

type SourcePoint = readonly [number, number];
type SourceBounds = readonly [number, number, number, number];
type LocalPoint = readonly [number, number];

export interface ParkEnvironmentFeature {
  id: string;
  name: string;
  classification: ParkEnvironmentClassification;
  isSellable: false;
  contributesToCommercialMetrics: false;
  sourceBounds: SourceBounds;
  sourceReferences: readonly string[];
  verificationStatus: ParkEnvironmentVerificationStatus;
  notes: string;
}

export interface LocalBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
}

export const PARK_ENVIRONMENT_REVISION = ARENA_CANONICAL_LAYOUT.revision;


/**
 * Anexo 1 — “Área de concreto liso” immediately east of Churrascaria Exporural
 * (C4), between Rua 15 de Novembro / Rua Emanuel Brachmann and the Arena
 * sector. Presentation only: it does not create a lot or move C4.
 */
export const EXPORURAL_SMOOTH_CONCRETE_CORRECTION = Object.freeze({
  id: 'exporural-smooth-concrete-c4',
  officialOwnerIdentifier: 'C4',
  sourcePolygon: Object.freeze([
    [5100, 2372],
    [5360, 2372],
    [5375, 2388],
    [5375, 2482],
    [5358, 2500],
    [5100, 2500],
  ] as const),
  elevation: 0.06,
  surface: 'concrete' as const,
  tileWorldSize: 1.7,
  baseColor: '#c6c7c2',
  roughness: 0.94,
});

export const PARK_ENVIRONMENT_CLASSIFICATION_LABELS: Readonly<Record<ParkEnvironmentClassification, string>> = {
  NON_COMMERCIAL_STRUCTURE: 'Estrutura não comercial',
  SPORTS_COURT: 'Quadra esportiva',
  CONCRETE_STAIRS: 'Escadaria de concreto',
  PAVED_PUBLIC_AREA: 'Área pública pavimentada',
  LANDSCAPE_FEATURE: 'Elemento paisagístico',
  NATURAL_TERRAIN: 'Terreno natural',
  SPORTS_FIELD: 'Campo esportivo',
  PEDESTRIAN_PATH: 'Caminho de pedestres',
};

export const ARENA_FRONT_SOURCE_REFERENCES = [
  'Anexo 1 — vazio atual entre Espaço Mirante, Arena Sicredi - Icatu e Centro de Eventos',
  'Anexo 4 — leitura conjunta das quadras, taludes, escadaria e praça cívica',
  '03-sat-detail.jpg — Rua Brasília a oeste da Arena, Rua Ubiretama ao sul e apron de concreto ao norte',
  '04-sat-br472.jpg — acesso do Portão 5 e entroncamento com a BR-472',
] as const;

/**
 * Bounds are traced in the same official 2026 PDF crop used by the map. The
 * annexes do not expose survey coordinates, so the fit is anchored to D3, F,
 * Quadra R, Exporural, Rua Brasília and Rua Brasil and remains explicitly
 * reviewable in the field.
 */
export const ARENA_FRONT_LAYOUT = {
  arenaStructureAnchors: ['F', 'D3', 'RUA-BRASIL'] as const,
  arenaStructureOwners: ['F'] as const,
  // The covered connection is visually paired with D1 and must be present
  // whenever D1 is present. D3 remains a placement reference, not a second
  // visibility dependency that can accidentally suppress the structure.
  arenaAccessAnchors: ['D1'] as const,
  arenaAccessOwners: ['D1'] as const,
  courtAnchors: ['QUADRA-R', 'EXPORURAL'] as const,
  courtOwners: ['QUADRA-R', 'EXPORURAL'] as const,
  plaza: ARENA_CANONICAL_LAYOUT.frontPlaza,
  stairs: ARENA_CANONICAL_LAYOUT.stairs,
  /**
   * Plataforma coberta fotografada entre Rua Brasília e a escadaria, ao sul
   * de D3 (anexos 7 e 10). O retângulo é registrado no satélite junto com o
   * Mirante e a calçada sul; fica fora dos degraus e das vias canônicas e não
   * cria entidade comercial nem altera F.
   */
  accessCanopy: {
    sourceBounds: MIRANTE_COMPLEX.lateralStructure.sourceBounds,
    verificationStatus: 'FIELD_REVIEW_RECOMMENDED' as const,
    sourceReferences: [
      'IMG_9692.jpeg — vista pelo vão em direção à Arena',
      'IMG_9693.jpeg — fachada viária, parede lateral e apoios em V',
      'Anexo 2 — satélite: extensão da estrutura entre o Mirante e a calçada sul',
    ] as const,
    longAxis: 'z' as const,
    arenaSide: 'east' as const,
    roadSide: 'west' as const,
    sideWallEnd: MIRANTE_COMPLEX.lateralStructure.sideWallEnd,
    bayCount: MIRANTE_COMPLEX.lateralStructure.bayCount,
  },
  /** Passeio de Rua Brasília, pátio sul e escada norte do Mirante. */
  miranteComplex: MIRANTE_COMPLEX,
  /**
   * Malha de terreno do setor: no nível do deck junto ao Mirante e ao patamar
   * superior da escadaria, descendo até o apron da Arena e seguindo pelas
   * laterais e pelo fundo (leste/sudeste) até as bordas dos estacionamentos
   * oficiais. Desce também para a Exporural (norte) e para a faixa de grama de
   * Rua Brasil (sul). É recortada contra as zonas de concreto, quadras, vias e
   * estacionamento (ver `arenaSectorZoning.ts`).
   */
  terrain: ARENA_CANONICAL_LAYOUT.terrain,
  /** Laje contínua a leste de C4; UVs em unidade de mundo, sem remendo azulejado. */
  exporuralSmoothConcrete: EXPORURAL_SMOOTH_CONCRETE_CORRECTION,
  walkways: ARENA_CANONICAL_LAYOUT.pedestrianAccess,
  treeClusters: ARENA_VEGETATION,
  northBerm: ARENA_CANONICAL_LAYOUT.sideTransitions.northBerm,
  southBerm: ARENA_CANONICAL_LAYOUT.sideTransitions.southBerm,
  multiSportCourt: ARENA_CANONICAL_LAYOUT.courts.multiSportCourt,
  sandVolleyballCourt: ARENA_CANONICAL_LAYOUT.courts.sandVolleyballCourt,
} as const;

export const PARK_ENVIRONMENT_FEATURES: readonly ParkEnvironmentFeature[] = [
  {
    id: 'arena-front-covered-access',
    name: 'Conexão coberta da escadaria da Arena',
    classification: 'NON_COMMERCIAL_STRUCTURE',
    isSellable: false,
    contributesToCommercialMetrics: false,
    sourceBounds: ARENA_FRONT_LAYOUT.accessCanopy.sourceBounds,
    sourceReferences: ARENA_FRONT_LAYOUT.accessCanopy.sourceReferences,
    verificationStatus: ARENA_FRONT_LAYOUT.accessCanopy.verificationStatus,
    notes: 'Plataforma aberta entre Rua Brasília, D3 e a escadaria, com fascia clara, treliças e apoios pretos em V e parede cega no topo norte; apresentação associada, nunca entidade selecionável.',
  },
  {
    id: 'mirante-complex-sidewalk',
    name: 'Passeio de Rua Brasília e pátio sul do Mirante',
    classification: 'PEDESTRIAN_PATH',
    isSellable: false,
    contributesToCommercialMetrics: false,
    sourceBounds: [3988, 2440, 4092, 3106],
    sourceReferences: [
      'Anexo 2 — satélite: faixa de calçada ao longo de Rua Brasília e "Calçada" até Rua Brasil',
      'Anexo 7 — passeio com meio-fio pintado e piso tátil diante da estrutura lateral',
      'Anexo 9 — deck do Mirante contínuo com o passeio e o meio-fio',
      'Anexo 10 — continuidade do passeio até a parede norte',
    ],
    verificationStatus: 'REFERENCE_INTERPRETED',
    notes: 'Calçada com meio-fio e piso tátil ao longo de Rua Brasília, do lote Q-R-04 até Rua Brasil, no mesmo terraço do deck do Mirante e da estrutura lateral, e pátio pavimentado ao sul até Rua Brasil; nunca lote nem via canônica.',
  },
  {
    id: 'arena-front-public-plaza',
    name: 'Praça pavimentada da Arena',
    classification: 'PAVED_PUBLIC_AREA',
    isSellable: false,
    contributesToCommercialMetrics: false,
    sourceBounds: ARENA_CANONICAL_LAYOUT.frontPlaza.sourceBounds,
    sourceReferences: ARENA_FRONT_SOURCE_REFERENCES,
    verificationStatus: 'REFERENCE_INTERPRETED',
    notes: 'Praça retangular registrada entre o patamar inferior e a boca da Arena; sem a extensão artificial em L e sem laje sobreposta sob os degraus.',
  },
  {
    id: 'arena-front-grass-strip',
    name: 'Faixa de grama entre a praça e Rua Brasil',
    classification: 'LANDSCAPE_FEATURE',
    isSellable: false,
    contributesToCommercialMetrics: false,
    sourceBounds: [...MIRANTE_COMPLEX.grassStrip.sourceBounds],
    sourceReferences: [
      'Anexo 2 — satélite: "Grama" entre a laje e Rua Brasil, até o Portão 5',
      'Anexo 8 — gramado visto do deck, entre a escadaria e a via',
      ...ARENA_FRONT_SOURCE_REFERENCES,
    ],
    verificationStatus: 'REFERENCE_INTERPRETED',
    notes: 'Gramado natural no nível da via entre a laje da praça, o pátio sul da estrutura lateral e Rua Brasil; substitui o concreto que antes chegava até a rua.',
  },
  {
    id: 'arena-front-concrete-stairs',
    name: 'Escadaria pública da Arena',
    classification: 'CONCRETE_STAIRS',
    isSellable: false,
    contributesToCommercialMetrics: false,
    sourceBounds: ARENA_FRONT_LAYOUT.stairs.sourceBounds,
    sourceReferences: ARENA_FRONT_SOURCE_REFERENCES,
    verificationStatus: 'FIELD_REVIEW_RECOMMENDED',
    notes: 'Dezoito níveis em três setores, partindo do patamar do conjunto Mirante/estrutura lateral a oeste e descendendo a leste em direção ao apron da Arena.',
  },
  {
    id: 'arena-front-multi-sport-court',
    name: 'Quadra poliesportiva da Arena',
    classification: 'SPORTS_COURT',
    isSellable: false,
    contributesToCommercialMetrics: false,
    sourceBounds: ARENA_FRONT_LAYOUT.multiSportCourt.sourceBounds,
    sourceReferences: ARENA_FRONT_SOURCE_REFERENCES,
    verificationStatus: 'FIELD_REVIEW_RECOMMENDED',
    notes: 'Quadra pigmentada a leste, com eixo longo norte-sul e apoiada na borda sul da Quadra R.',
  },
  {
    id: 'arena-front-sand-volleyball-court',
    name: 'Quadra de vôlei da Arena',
    classification: 'SPORTS_COURT',
    isSellable: false,
    contributesToCommercialMetrics: false,
    sourceBounds: ARENA_FRONT_LAYOUT.sandVolleyballCourt.sourceBounds,
    sourceReferences: ARENA_FRONT_SOURCE_REFERENCES,
    verificationStatus: 'FIELD_REVIEW_RECOMMENDED',
    notes: 'Quadra clara a oeste, com eixo longo norte-sul e corredor preservado para o sanitário E-10.',
  },
  {
    id: 'arena-front-landscape-support',
    name: 'Taludes laterais da escadaria',
    classification: 'LANDSCAPE_FEATURE',
    isSellable: false,
    contributesToCommercialMetrics: false,
    sourceBounds: [4092, 2600, 4660, 3096],
    sourceReferences: ARENA_FRONT_SOURCE_REFERENCES,
    verificationStatus: 'FIELD_REVIEW_RECOMMENDED',
    notes: 'Ombreiras gramadas ao norte da laje e faixa de grama ao sul acompanham o desnível oeste-leste sem ocupar o apron pavimentado.',
  },
  {
    id: 'arena-front-natural-terrain',
    name: 'Terreno natural do entorno da Arena',
    classification: 'NATURAL_TERRAIN',
    isSellable: false,
    contributesToCommercialMetrics: false,
    sourceBounds: ARENA_FRONT_LAYOUT.terrain.sourceBounds,
    sourceReferences: ARENA_FRONT_SOURCE_REFERENCES,
    verificationStatus: 'FIELD_REVIEW_RECOMMENDED',
    notes: 'Malha contínua com descida oeste-leste, estendida às laterais e ao fundo da Arena; recortada contra concreto, quadras, vias e estacionamento, compatível com a Arena canônica, sem alterar lotes ou ruas.',
  },
  {
    id: 'exporural-smooth-concrete-c4',
    name: 'Área de concreto liso da Exporural',
    classification: 'PAVED_PUBLIC_AREA',
    isSellable: false,
    contributesToCommercialMetrics: false,
    sourceBounds: [5100, 2372, 5375, 2500],
    sourceReferences: [
      'Anexo 1 — área de concreto liso a leste da Churrascaria Exporural C4',
      ...ARENA_FRONT_SOURCE_REFERENCES,
    ],
    verificationStatus: 'REFERENCE_INTERPRETED',
    notes: 'Laje de concreto liso a leste da Churrascaria Exporural (C4), no lugar do gramado residual; apresentação contínua sem remendo azulejado, nunca lote comercial.',
  },
  {
    id: 'arena-front-pedestrian-paths',
    name: 'Caminhos de pedestres da Arena',
    classification: 'PEDESTRIAN_PATH',
    isSellable: false,
    contributesToCommercialMetrics: false,
    sourceBounds: [4480, 2480, 5860, 3260],
    sourceReferences: ARENA_FRONT_SOURCE_REFERENCES,
    verificationStatus: 'FIELD_REVIEW_RECOMMENDED',
    notes: 'Ligações entre escadaria, quadras, apron da Arena e estacionamento, fora da praça e recortadas contra a circulação viária.',
  },
];

export function sourceBoundsToLocal(bounds: SourceBounds): LocalBounds {
  const [firstX, firstZ] = officialPdfPointToLocal([bounds[0], bounds[1]]);
  const [secondX, secondZ] = officialPdfPointToLocal([bounds[2], bounds[3]]);
  const minX = Math.min(firstX, secondX);
  const maxX = Math.max(firstX, secondX);
  const minZ = Math.min(firstZ, secondZ);
  const maxZ = Math.max(firstZ, secondZ);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

export function sourcePolygonToLocal(points: readonly SourcePoint[]): readonly LocalPoint[] {
  return points.map((point) => officialPdfPointToLocal(point));
}

function hasEnvironmentAnchors(entities: readonly MapEntity[], anchors: readonly string[]) {
  const identifiers = new Set(entities.map((entity) => entity.publicIdentifier));
  return anchors.every((identifier) => identifiers.has(identifier));
}

export function shouldRenderArenaStructures(entities: readonly MapEntity[]) {
  return hasEnvironmentAnchors(entities, ARENA_FRONT_LAYOUT.arenaStructureAnchors);
}

export function shouldRenderArenaAccess(entities: readonly MapEntity[]) {
  return hasEnvironmentAnchors(entities, ARENA_FRONT_LAYOUT.arenaAccessAnchors);
}

export function shouldRenderArenaCourts(entities: readonly MapEntity[]) {
  return hasEnvironmentAnchors(entities, ARENA_FRONT_LAYOUT.courtAnchors);
}

export const ARENA_FRONT_PRIMARY_DRAW_CALL_BUDGET = 18;
