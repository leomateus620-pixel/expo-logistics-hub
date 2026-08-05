import {
  EXPORURAL_AREA_CODE,
  EXPORURAL_PROTECTED_IDENTIFIERS,
  EXPORURAL_ROAD_IDENTIFIERS,
  EXPORURAL_SUPPORT_IDENTIFIERS,
} from './exporuralReference2026';
import type { CommercialLot, CommercialMapData, MapClassification, MapEntity } from '../types';

export const COMMERCIAL_MAP_SEGMENT_IDS = {
  exporural: 'exporural',
  industry: 'industria-comercio-servicos',
  automotive: 'espaco-automovel',
} as const;

export type CommercialMapSegmentId = typeof COMMERCIAL_MAP_SEGMENT_IDS[keyof typeof COMMERCIAL_MAP_SEGMENT_IDS];

export interface CommercialMapSegmentPalette {
  /** Dominant segment color after ACES tone mapping. */
  surface: string;
  /** High-contrast perimeter and roof-line color. */
  edge: string;
  /** Lighter accent used by swatches, focus halos and architectural details. */
  accent: string;
  /** Text color that remains legible on the accent surface. */
  foreground: string;
}

export interface CommercialMapSegmentDefinition {
  id: CommercialMapSegmentId;
  code: string;
  name: string;
  description: string;
  palette: CommercialMapSegmentPalette;
  boundary: {
    source: 'annex-2026' | 'official-cadastral-2026';
    reference: string;
    /** The visual footprint is the exact union of declared members, never a centroid approximation. */
    resolution: 'explicit-entity-union';
    blockIdentifiers: readonly string[];
    /** Human-auditable trace of the annex line; membership remains the canonical spatial contract. */
    perimeter: readonly string[];
    excludedIdentifiers: readonly string[];
  };
  membership: {
    blockCodes: readonly string[];
    entityIdentifiers: readonly string[];
    excludedIdentifiers: readonly string[];
  };
  camera: {
    direction: readonly [number, number, number];
    padding: number;
    minDistanceRatio: number;
    maxDistanceRatio: number;
  };
  behavior: {
    visibleByDefault: boolean;
    /** Segment selection intentionally couples explorer filtering and camera focus. */
    interaction: 'filter-and-focus' | 'informational';
  };
}

const AUTOMOTIVE_BLOCKS = ['U', 'P', 'T', 'O'] as const;
const INDUSTRY_BLOCKS = ['M', 'G', 'L', 'F', 'J', 'E', 'I', 'D'] as const;
const AUTOMOTIVE_EXCLUDED_ENTITIES = [
  'QUADRA-V', 'QUADRA-Q', 'QUADRA-M', 'QUADRA-L', 'QUADRA-X', 'QUADRA-N',
  'B39', 'G', 'J', 'TEST-DRIVE', 'C2', 'C3',
] as const;

/**
 * Related structures enclosed by the blue Annex 2 perimeter. Safety, emergency,
 * restroom and circulation entities remain semantically neutral in the renderer,
 * but stay related to the segment for search, filtering and future reporting.
 */
const INDUSTRY_RELATED_ENTITIES = [
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
  'B16', 'B17', 'B19', 'B23', 'B24',
  'B33', 'B34', 'B40', 'B41',
  'C2', 'C3', 'D1', 'D2', 'D3',
  'E-18', 'E-19', 'E-20', 'E-22', 'E-23', 'E-24',
  'RUA-URUGUAI', 'RUA-MONTEVIDEU', 'CALCADA-ARVOREDO',
] as const;

const INDUSTRY_EXCLUDED_ENTITIES = [
  'Q-G-03', 'Q-G-04',
  'QUADRA-N', 'B7', 'B28', 'D4',
  'QUADRA-C', 'QUADRA-B', 'QUADRA-A', 'C1',
  'B11', 'B12', 'B13', 'B14', 'B15', 'B18', 'B21',
  'B25', 'B26', 'B27', 'B30', 'B31', 'B32', 'B42-02',
  'G', 'B8', 'B9', 'B10', 'B39',
] as const;

export const COMMERCIAL_MAP_SEGMENTS: readonly CommercialMapSegmentDefinition[] = [
  {
    id: COMMERCIAL_MAP_SEGMENT_IDS.exporural,
    code: 'EXPORURAL',
    name: 'Exporural',
    description: 'Quadras R e S, suas vias internas e estruturas de apoio cadastral da área rural.',
    palette: {
      surface: '#657F3F',
      edge: '#405527',
      accent: '#A8BE72',
      foreground: '#1F2C16',
    },
    boundary: {
      source: 'official-cadastral-2026',
      reference: 'Perímetro cadastral Exporural 2026.3',
      resolution: 'explicit-entity-union',
      blockIdentifiers: ['QUADRA-R', 'QUADRA-S'],
      perimeter: ['Rua Ubiretama', 'Rua Bruno Schwartz', 'Rua Gustavo Bessel', 'Rua Emanuel Brachmann'],
      excludedIdentifiers: EXPORURAL_PROTECTED_IDENTIFIERS,
    },
    membership: {
      blockCodes: ['R', 'S'],
      entityIdentifiers: [
        EXPORURAL_AREA_CODE,
        ...EXPORURAL_ROAD_IDENTIFIERS,
        ...EXPORURAL_SUPPORT_IDENTIFIERS,
      ],
      excludedIdentifiers: EXPORURAL_PROTECTED_IDENTIFIERS,
    },
    camera: {
      direction: [0.62, 0.72, 0.46],
      padding: 1.08,
      minDistanceRatio: 0.12,
      maxDistanceRatio: 2.2,
    },
    behavior: { visibleByDefault: true, interaction: 'filter-and-focus' },
  },
  {
    id: COMMERCIAL_MAP_SEGMENT_IDS.industry,
    code: 'INDUSTRIA_COMERCIO_SERVICOS',
    name: 'Indústria, Comércio e Serviços',
    description: 'Núcleo comercial central, pavilhões e estruturas de apoio delimitados no Anexo 2.',
    palette: {
      surface: '#347786',
      edge: '#173F4A',
      accent: '#70A9B4',
      foreground: '#10292F',
    },
    boundary: {
      source: 'annex-2026',
      reference: 'Anexo 2 — contorno azul do núcleo comercial',
      resolution: 'explicit-entity-union',
      blockIdentifiers: INDUSTRY_BLOCKS.map((block) => `QUADRA-${block}`),
      perimeter: [
        'Norte — Rua Bolívia, da Alameda Mercosul ao acesso de D3',
        'Leste — contorno externo de D3, B17 e B16 até a Rua Argentina',
        'Sudeste — recuo entre B19 e B11, excluindo Centro Administrativo, B15 e B42-02',
        'Sul — fachadas externas de B1 a B6 junto à Avenida Benvenuto de Conti',
        'Oeste — limite externo de B1, B2 e Calçada do Arvoredo',
        'Noroeste — Rua Brasil e Alameda Mercosul envolvendo C2, C3 e as quadras centrais',
      ],
      excludedIdentifiers: INDUSTRY_EXCLUDED_ENTITIES,
    },
    membership: {
      blockCodes: INDUSTRY_BLOCKS,
      entityIdentifiers: INDUSTRY_RELATED_ENTITIES,
      excludedIdentifiers: INDUSTRY_EXCLUDED_ENTITIES,
    },
    camera: {
      direction: [0.58, 0.7, 0.64],
      padding: 1.12,
      minDistanceRatio: 0.1,
      maxDistanceRatio: 2.05,
    },
    behavior: { visibleByDefault: true, interaction: 'filter-and-focus' },
  },
  {
    id: COMMERCIAL_MAP_SEGMENT_IDS.automotive,
    code: 'ESPACO_AUTOMOVEL',
    name: 'Espaço do Automóvel',
    description: 'Quadras U, P, T e O, integralmente contidas no perímetro do Anexo 1.',
    palette: {
      surface: '#9C563B',
      edge: '#6C3524',
      accent: '#D79A77',
      foreground: '#321B12',
    },
    boundary: {
      source: 'annex-2026',
      reference: 'Anexo 1 — contorno preto do Espaço do Automóvel',
      resolution: 'explicit-entity-union',
      blockIdentifiers: AUTOMOTIVE_BLOCKS.map((block) => `QUADRA-${block}`),
      perimeter: ['Rua Bolívia', 'Alameda Mercosul', 'Rua Brasil', 'Rua Buenos Aires'],
      excludedIdentifiers: AUTOMOTIVE_EXCLUDED_ENTITIES,
    },
    membership: {
      blockCodes: AUTOMOTIVE_BLOCKS,
      entityIdentifiers: [],
      excludedIdentifiers: AUTOMOTIVE_EXCLUDED_ENTITIES,
    },
    camera: {
      direction: [-0.56, 0.74, 0.62],
      padding: 1.14,
      minDistanceRatio: 0.1,
      maxDistanceRatio: 1.9,
    },
    behavior: { visibleByDefault: true, interaction: 'filter-and-focus' },
  },
] as const;

const SEGMENT_BY_ID = new Map(COMMERCIAL_MAP_SEGMENTS.map((segment) => [segment.id, segment]));
const SEGMENT_BY_CODE = new Map(COMMERCIAL_MAP_SEGMENTS.map((segment) => [segment.code, segment]));
const BLOCKS_BY_SEGMENT = new Map(COMMERCIAL_MAP_SEGMENTS.map((segment) => [segment.id, new Set(segment.membership.blockCodes)]));
const ENTITIES_BY_SEGMENT = new Map(COMMERCIAL_MAP_SEGMENTS.map((segment) => [segment.id, new Set(segment.membership.entityIdentifiers)]));
const EXCLUSIONS_BY_SEGMENT = new Map(COMMERCIAL_MAP_SEGMENTS.map((segment) => [segment.id, new Set(segment.membership.excludedIdentifiers)]));

function metadataString(entity: MapEntity, key: string) {
  const value = entity.metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function entityBlockCode(entity: MapEntity, lot?: CommercialLot | null) {
  const candidates = [
    lot?.block,
    metadataString(entity, 'block'),
    metadataString(entity, 'parentPublicIdentifier')?.replace(/^QUADRA-/i, ''),
    entity.publicIdentifier.match(/^QUADRA-([A-Z0-9]+)$/i)?.[1],
    entity.publicIdentifier.match(/^Q-([A-Z0-9]+)-[A-Z0-9]+$/i)?.[1],
  ];
  const block = candidates.find((candidate): candidate is string => Boolean(candidate?.trim()));
  return block?.toLocaleUpperCase('pt-BR') ?? null;
}

function segmentsFromMetadata(entity: MapEntity) {
  const matches = new Map<CommercialMapSegmentId, CommercialMapSegmentDefinition>();
  const persistedId = entity.segmentId as CommercialMapSegmentId | null | undefined;
  if (persistedId && SEGMENT_BY_ID.has(persistedId)) {
    matches.set(persistedId, SEGMENT_BY_ID.get(persistedId)!);
  }
  const id = metadataString(entity, 'segmentId') as CommercialMapSegmentId | null;
  if (id && SEGMENT_BY_ID.has(id)) matches.set(id, SEGMENT_BY_ID.get(id)!);
  const code = metadataString(entity, 'segmentCode')?.toLocaleUpperCase('pt-BR');
  if (code && SEGMENT_BY_CODE.has(code)) {
    const segment = SEGMENT_BY_CODE.get(code)!;
    matches.set(segment.id, segment);
  }
  if (metadataString(entity, 'areaCode') === EXPORURAL_AREA_CODE) {
    const segment = SEGMENT_BY_ID.get(COMMERCIAL_MAP_SEGMENT_IDS.exporural)!;
    matches.set(segment.id, segment);
  }
  return [...matches.values()];
}

export function findCommercialMapSegmentsForEntity(
  entity: MapEntity,
  lot?: CommercialLot | null,
): CommercialMapSegmentDefinition[] {
  const canonicalSegmentId = entity.segmentId as CommercialMapSegmentId | null | undefined;
  if (
    entity.segmentSource === 'database'
    && canonicalSegmentId
    && SEGMENT_BY_ID.has(canonicalSegmentId)
  ) {
    return [SEGMENT_BY_ID.get(canonicalSegmentId)!];
  }
  const block = entityBlockCode(entity, lot);
  const metadataSegments = new Set(segmentsFromMetadata(entity).map((segment) => segment.id));
  return COMMERCIAL_MAP_SEGMENTS.filter((segment) => {
    const exclusions = EXCLUSIONS_BY_SEGMENT.get(segment.id);
    if (exclusions?.has(entity.publicIdentifier)) return false;
    if (metadataSegments.has(segment.id)) return true;
    if (ENTITIES_BY_SEGMENT.get(segment.id)?.has(entity.publicIdentifier)) return true;
    return Boolean(block && BLOCKS_BY_SEGMENT.get(segment.id)?.has(block));
  });
}

export function resolveCommercialMapSegment(
  entity: MapEntity,
  lot?: CommercialLot | null,
): CommercialMapSegmentDefinition | null {
  const matches = findCommercialMapSegmentsForEntity(entity, lot);
  return matches.length === 1 ? matches[0] : null;
}

export function buildCommercialMapSegmentIndex(
  entities: readonly MapEntity[],
  lots: readonly CommercialLot[],
) {
  const lotByEntity = new Map(lots.map((lot) => [lot.entityId, lot]));
  const index = new Map<string, CommercialMapSegmentDefinition>();
  const directCandidates = new Set<string>();

  entities.forEach((entity) => {
    const matches = findCommercialMapSegmentsForEntity(entity, lotByEntity.get(entity.id));
    if (matches.length > 0) directCandidates.add(entity.id);
    if (matches.length === 1) index.set(entity.id, matches[0]);
  });

  // Persisted custom entities can carry only a parent UUID. Inherit from that
  // canonical parent without inferring membership from a geometric centroid.
  let changed = true;
  while (changed) {
    changed = false;
    entities.forEach((entity) => {
      if (index.has(entity.id) || directCandidates.has(entity.id) || !entity.parentEntityId) return;
      const parentSegment = index.get(entity.parentEntityId);
      if (!parentSegment || EXCLUSIONS_BY_SEGMENT.get(parentSegment.id)?.has(entity.publicIdentifier)) return;
      index.set(entity.id, parentSegment);
      changed = true;
    });
  }

  return index;
}

export function withCommercialMapSegmentMetadata(entity: MapEntity): MapEntity {
  const segment = resolveCommercialMapSegment(entity);
  if (!segment) return entity;
  return {
    ...entity,
    segmentId: segment.id,
    segmentSource: entity.segmentSource ?? 'derived',
    metadata: {
      ...entity.metadata,
      segmentId: segment.id,
      segmentCode: segment.code,
      segmentName: segment.name,
    },
  };
}

/**
 * Normalizes the official fallback and persisted database rows into the same
 * structured client domain. UUIDs and commercial records stay untouched;
 * membership is resolved from stable cadastral identifiers.
 */
export function withCommercialMapSegments<T extends CommercialMapData>(data: T): T {
  const index = buildCommercialMapSegmentIndex(data.entities, data.lots);
  return {
    ...data,
    entities: data.entities.map((entity) => {
      const segment = index.get(entity.id);
      if (!segment) return entity;
      return {
        ...entity,
        segmentId: segment.id,
        segmentSource: entity.segmentSource ?? 'derived',
        metadata: {
          ...entity.metadata,
          segmentId: segment.id,
          segmentCode: segment.code,
          segmentName: segment.name,
        },
      };
    }),
  };
}

const SEGMENT_TINT_CLASSIFICATIONS = new Set<MapClassification>([
  'SELLABLE_LOT',
  'INTERNAL_STAND',
  'QUADRA',
  'PAVILION',
  'BUILDING',
  'RESTAURANT',
  'FOOD_AREA',
  'ADMINISTRATION',
  'SERVICE',
  'ATTRACTION',
  'EVENT_VENUE',
  'LIVESTOCK_AREA',
  'RURAL_EXHIBITION',
  'LANDMARK',
]);

export function isSegmentTintClassification(classification: MapClassification) {
  return SEGMENT_TINT_CLASSIFICATIONS.has(classification);
}

export function getCommercialMapSegment(id: CommercialMapSegmentId | null | undefined) {
  return id ? SEGMENT_BY_ID.get(id) ?? null : null;
}

export function commercialMapSegmentInventory(
  entities: readonly MapEntity[],
  lots: readonly CommercialLot[],
) {
  const index = buildCommercialMapSegmentIndex(entities, lots);
  const lotEntityIds = new Set(lots.map((lot) => lot.entityId));
  return COMMERCIAL_MAP_SEGMENTS.map((segment) => {
    const entityIds = [...index.entries()]
      .filter(([, candidate]) => candidate.id === segment.id)
      .map(([entityId]) => entityId);
    return {
      segment,
      entityIds,
      entityCount: entityIds.length,
      lotCount: entityIds.filter((entityId) => lotEntityIds.has(entityId)).length,
    };
  });
}
