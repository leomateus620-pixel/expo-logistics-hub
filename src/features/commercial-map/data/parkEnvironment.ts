import { officialPdfPointToLocal } from './officialReference2026';
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

export const PARK_ENVIRONMENT_REVISION = '2028.1-arena-access-reference.2';

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
  'Anexo 5 — leitura frontal dos patamares, três setores de degraus e corrimãos',
  'Satélite 2026-08-21 — escadaria oeste-leste e duas quadras junto à borda sul da Exporural',
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
  plaza: {
    // ANALYST: east edge 4888 covers the new west field. Notch per
    // arena-roads/ANALYSIS.md §3.3 (not docs/arena-roads/analysis.md withdrawn clip).
    sourcePolygon: [
      [4116, 2682],
      [4560, 2682],
      [4560, 2948],
      [4888, 2948],
      [4888, 3096],
      [4498, 3100],
      [4116, 3098],
    ] as readonly SourcePoint[],
    elevation: 0.052,
  },
  stairs: {
    sourceBounds: [4120, 2720, 4480, 3070] as SourceBounds,
    runAxis: 'x' as const,
    highEdge: 'west' as const,
    lowEdge: 'east' as const,
    stepCount: 18,
    bankCount: 3,
    /**
     * Perfil recalculado em 2026.7: o desnível total (18 × 0,032 ≈ 0,58) passa a
     * acompanhar a descida natural do terreno lida nos anexos 3 e 4, no lugar do
     * bloco de 1,53 que flutuava sobre a antiga praça plana.
     */
    riserHeight: 0.032,
    lowerLandingDepth: 0.62,
    upperLandingDepth: 0.74,
    /** Laje fina de topo: o patamar superior deixa de ser um maciço de concreto. */
    upperLandingThickness: 0.07,
    retainingWallWidth: 0.11,
    handrailHeight: 0.34,
    bankGap: 0,
    intermediateLandingSteps: [6, 12] as const,
    intermediateLandingDepth: 0.42,
  },
  /**
   * Plataforma coberta fotografada entre Rua Brasília e a escadaria, ao sul
   * de D3. O retângulo fica integralmente fora do footprint dos degraus e das
   * vias canônicas. A posição é interpretação cartográfica conservadora a ser
   * conferida em campo; não cria entidade comercial nem altera D3/F.
   */
  accessCanopy: {
    sourceBounds: [4005, 2840, 4110, 3068] as SourceBounds,
    verificationStatus: 'FIELD_REVIEW_RECOMMENDED' as const,
    sourceReferences: [
      'IMG_9692.jpeg — vista pelo vão em direção à Arena',
      'IMG_9693.jpeg — fachada viária, parede lateral e apoios em V',
    ] as const,
    longAxis: 'z' as const,
    arenaSide: 'east' as const,
    roadSide: 'west' as const,
    sideWallEnd: 'south' as const,
    bayCount: 5,
  },
  /**
   * Malha de terreno do setor: alta a oeste (topo da escadaria), descendo até o
   * apron da Arena e seguindo pelas laterais e pelo fundo (leste/sudeste) até as
   * bordas dos estacionamentos oficiais. É recortada contra as zonas de concreto,
   * quadras, vias, estacionamento e campo (ver `arenaSectorZoning.ts`).
   */
  terrain: {
    sourceBounds: [4106, 2400, 5980, 3300] as SourceBounds,
    segmentsX: 108,
    segmentsZ: 58,
    /** Faixa de transição, em unidades locais, entre talude e piso pavimentado. */
    blendDistance: 1.15,
  },
  /**
   * Campo de grama natural não demarcado a oeste da Arena, entre o volume
   * construído e a faixa cívica da escadaria/praça.
   */
  footballField: {
    sourceBounds: [4560, 2708, 4884, 2948] as SourceBounds,
    turfInset: 0.18,
    markingInset: 0,
    turfColor: '#7f9a5c',
    wornColor: '#98a074',
    markings: false,
  },
  /** Caminhos de circulação entre escadaria, quadras, Arena, campo e estacionamento. */
  walkways: [
    { id: 'arena-walkway-stairs-apron', sourcePath: [[4480, 2895], [4680, 2895], [4880, 2860]] as readonly SourcePoint[], width: 0.34 },
    { id: 'arena-walkway-courts-plaza', sourcePath: [[4620, 2682], [4620, 2560], [4620, 2480]] as readonly SourcePoint[], width: 0.26 },
    { id: 'arena-walkway-arena-field', sourcePath: [[4520, 2880], [4560, 2830], [4700, 2828]] as readonly SourcePoint[], width: 0.26 },
    { id: 'arena-walkway-arena-parking', sourcePath: [[5140, 3140], [5150, 3200], [5160, 3250]] as readonly SourcePoint[], width: 0.24 },
  ] as const,
  /** Massas arbóreas do setor, lidas nos anexos 3 e 4 (conferência de campo recomendada). */
  treeClusters: [
    { sourcePosition: [4128, 2660] as SourcePoint, scale: 1.05 },
    { sourcePosition: [4180, 2620] as SourcePoint, scale: 0.92 },
    { sourcePosition: [4238, 2648] as SourcePoint, scale: 1.12 },
    { sourcePosition: [4112, 2790] as SourcePoint, scale: 0.98 },
    { sourcePosition: [4108, 2930] as SourcePoint, scale: 1.08 },
    { sourcePosition: [4132, 3090] as SourcePoint, scale: 0.94 },
    { sourcePosition: [4160, 2470] as SourcePoint, scale: 1.0 },
    { sourcePosition: [4520, 2420] as SourcePoint, scale: 1.07 },
    { sourcePosition: [4700, 2645] as SourcePoint, scale: 1.04 },
    { sourcePosition: [4840, 2650] as SourcePoint, scale: 0.98 },
    // Entorno leste/sudeste: fundo e lateral da Arena, moldura do campo.
    { sourcePosition: [5440, 2660] as SourcePoint, scale: 1.02 },
    { sourcePosition: [5580, 2645] as SourcePoint, scale: 0.94 },
    { sourcePosition: [5720, 2655] as SourcePoint, scale: 1.08 },
    { sourcePosition: [5860, 2690] as SourcePoint, scale: 0.96 },
    { sourcePosition: [5920, 2870] as SourcePoint, scale: 1.06 },
    { sourcePosition: [5930, 3050] as SourcePoint, scale: 0.92 },
    // Same four landscape trees, shifted north onto the grass shoulder of
    // corrected Rua Ubiretama. Keep canopies and trunks out of its carriageway.
    { sourcePosition: [5920, 3188] as SourcePoint, scale: 1.04 },
    { sourcePosition: [5700, 3184] as SourcePoint, scale: 0.98 },
    { sourcePosition: [5480, 3178] as SourcePoint, scale: 1.1 },
    { sourcePosition: [5230, 3172] as SourcePoint, scale: 0.9 },
  ] as const,
  northBerm: {
    sourceBounds: [4120, 2682, 4480, 2720] as SourceBounds,
    highEdge: 'west' as const,
  },
  southBerm: {
    sourceBounds: [4120, 3070, 4480, 3098] as SourceBounds,
    highEdge: 'west' as const,
  },

  multiSportCourt: {
    sourceBounds: [4675, 2480, 4765, 2640] as SourceBounds,
    longAxis: 'z' as const,
    surfaceInset: 0.24,
    surfaceColor: '#b86f5c',
    apronColor: '#64796d',
    supportsBasketball: true,
    supportsVolleyball: true,
  },
  sandVolleyballCourt: {
    sourceBounds: [4525, 2480, 4615, 2640] as SourceBounds,
    longAxis: 'z' as const,
    surfaceInset: 0.24,
    surfaceColor: '#d6bd84',
    apronColor: '#77836b',
    supportsBasketball: false,
    supportsVolleyball: true,
  },
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
    notes: 'Plataforma aberta entre Rua Brasília, D3 e a escadaria, com fascia clara, treliças e apoios pretos em V; apresentação associada, nunca entidade selecionável.',
  },
  {
    id: 'arena-front-public-plaza',
    name: 'Praça pavimentada da Arena',
    classification: 'PAVED_PUBLIC_AREA',
    isSellable: false,
    contributesToCommercialMetrics: false,
    sourceBounds: [4116, 2682, 4888, 3100],
    sourceReferences: ARENA_FRONT_SOURCE_REFERENCES,
    verificationStatus: 'REFERENCE_INTERPRETED',
    notes: 'Faixa cívica contínua entre D3, Arena e Rua Brasil, preservando o apron livre diante do palco; nunca representa lote.',
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
    notes: 'Dezoito níveis em três setores, altos a oeste e descendendo a leste em direção ao apron da Arena.',
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
    sourceBounds: [4120, 2682, 4480, 3098],
    sourceReferences: ARENA_FRONT_SOURCE_REFERENCES,
    verificationStatus: 'FIELD_REVIEW_RECOMMENDED',
    notes: 'Taludes estreitos ao norte e ao sul acompanham o desnível oeste-leste sem ocupar o apron pavimentado.',
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
    notes: 'Malha contínua com descida oeste-leste, estendida às laterais e ao fundo da Arena; recortada contra concreto, quadras, vias, estacionamento e campo, sem alterar lotes, ruas ou a Arena.',
  },
  {
    id: 'arena-front-football-field',
    name: 'Campo de futebol da Arena',
    classification: 'SPORTS_FIELD',
    isSellable: false,
    contributesToCommercialMetrics: false,
    sourceBounds: ARENA_FRONT_LAYOUT.footballField.sourceBounds,
    sourceReferences: ARENA_FRONT_SOURCE_REFERENCES,
    verificationStatus: 'FIELD_REVIEW_RECOMMENDED',
    notes: 'Campo de grama natural não demarcado a oeste da Arena, entre o volume construído e a faixa cívica da escadaria/praça; apresentação, nunca lote comercial.',
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
    notes: 'Ligações entre escadaria, quadras, apron da Arena, campo e estacionamento conforme os anexos.',
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
