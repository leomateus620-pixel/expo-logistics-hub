import { officialPdfPointToLocal } from './officialReference2026';
import type { MapEntity } from '../types';

export type ParkEnvironmentClassification =
  | 'NON_COMMERCIAL_STRUCTURE'
  | 'SPORTS_COURT'
  | 'CONCRETE_STAIRS'
  | 'PAVED_PUBLIC_AREA'
  | 'LANDSCAPE_FEATURE';

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

export const PARK_ENVIRONMENT_REVISION = '2026.5-park-realism.1';

export const PARK_ENVIRONMENT_CLASSIFICATION_LABELS: Readonly<Record<ParkEnvironmentClassification, string>> = {
  NON_COMMERCIAL_STRUCTURE: 'Estrutura não comercial',
  SPORTS_COURT: 'Quadra esportiva',
  CONCRETE_STAIRS: 'Escadaria de concreto',
  PAVED_PUBLIC_AREA: 'Área pública pavimentada',
  LANDSCAPE_FEATURE: 'Elemento paisagístico',
};

export const ARENA_FRONT_SOURCE_REFERENCES = [
  'Anexo 1 — vazio atual entre Espaço Mirante, Arena Sicredi - Icatu e Centro de Eventos',
  'Anexo 4 — leitura conjunta das quadras, taludes, escadaria e praça cívica',
  'Anexo 5 — leitura frontal dos patamares, três setores de degraus e corrimãos',
] as const;

/**
 * Bounds are traced in the same official 2026 PDF crop used by the map. The
 * annexes do not expose survey coordinates, so the fit is anchored to D3, F,
 * C1 and Rua Brasil and remains explicitly reviewable in the field.
 */
export const ARENA_FRONT_LAYOUT = {
  sceneAnchors: ['F', 'C1', 'D3', 'RUA-BRASIL'] as const,
  plaza: {
    sourcePolygon: [
      [4116, 2682],
      [4888, 2682],
      [4888, 3096],
      [4498, 3100],
      [4116, 3098],
    ] as readonly SourcePoint[],
    elevation: 0.052,
  },
  stairs: {
    sourceBounds: [4170, 2688, 4520, 2910] as SourceBounds,
    stepCount: 18,
    bankCount: 3,
    riserHeight: 0.085,
    lowerLandingDepth: 0.62,
    upperLandingDepth: 0.74,
    bankGap: 0,
    intermediateLandingSteps: [6, 12] as const,
    intermediateLandingDepth: 0.28,
  },
  westBerm: {
    sourceBounds: [4116, 2688, 4163, 2920] as SourceBounds,
  },
  eastBerm: {
    sourceBounds: [4528, 2688, 4888, 2835] as SourceBounds,
  },
  multiSportCourt: {
    sourceBounds: [4142, 2930, 4480, 3088] as SourceBounds,
    surfaceInset: 0.24,
    surfaceColor: '#b86f5c',
    apronColor: '#64796d',
    supportsBasketball: true,
    supportsVolleyball: true,
  },
  sandVolleyballCourt: {
    sourceBounds: [4540, 2850, 4860, 2990] as SourceBounds,
    surfaceInset: 0.24,
    surfaceColor: '#d6bd84',
    apronColor: '#77836b',
    supportsBasketball: false,
    supportsVolleyball: true,
  },
} as const;

export const PARK_ENVIRONMENT_FEATURES: readonly ParkEnvironmentFeature[] = [
  {
    id: 'arena-front-public-plaza',
    name: 'Praça pavimentada da Arena',
    classification: 'PAVED_PUBLIC_AREA',
    isSellable: false,
    contributesToCommercialMetrics: false,
    sourceBounds: [4116, 2682, 4888, 3100],
    sourceReferences: ARENA_FRONT_SOURCE_REFERENCES,
    verificationStatus: 'REFERENCE_INTERPRETED',
    notes: 'Faixa cívica contínua entre D3, Arena, Centro de Eventos e Rua Brasil; nunca representa lote.',
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
    notes: 'Dezoito níveis em três setores, com patamares e corrimãos, interpretados da leitura frontal e aérea.',
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
    notes: 'Quadra de piso pigmentado com marcação de vôlei e estruturas leves de basquete.',
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
    notes: 'Quadra adjacente de superfície clara, separada da circulação e alinhada à quadra poliesportiva.',
  },
  {
    id: 'arena-front-landscape-support',
    name: 'Taludes laterais da escadaria',
    classification: 'LANDSCAPE_FEATURE',
    isSellable: false,
    contributesToCommercialMetrics: false,
    sourceBounds: [4116, 2688, 4888, 2920],
    sourceReferences: ARENA_FRONT_SOURCE_REFERENCES,
    verificationStatus: 'FIELD_REVIEW_RECOMMENDED',
    notes: 'Taludes gramados laterais preservam a leitura do desnível real sem ocupar a praça ou as quadras.',
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

export function shouldRenderArenaFrontInfrastructure(entities: readonly MapEntity[]) {
  const identifiers = new Set(entities.map((entity) => entity.publicIdentifier));
  return identifiers.has('F')
    && identifiers.has('RUA-BRASIL')
    && (identifiers.has('C1') || identifiers.has('D3'));
}

export const ARENA_FRONT_PRIMARY_DRAW_CALL_BUDGET = 12;
