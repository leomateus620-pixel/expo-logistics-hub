import { CLASSIFICATION_LABELS, STATUS_CONFIG, VERIFICATION_LABELS } from '../constants';
import type { CommercialLot, Coordinate, MapClassification, MapEntity } from '../types';
import { geometryCentroid } from './geometry';
import { strategicLandmarkSearchAliases } from './landmarks';

export type MapLabelVisibility = 'far' | 'medium' | 'near';

export interface NormalizedMapMetadata {
  stableId: string;
  officialDisplayName: string;
  entityType: MapClassification;
  block: string | null;
  lotNumber: string | null;
  structureCode: string | null;
  street: string | null;
  commercialStatus: CommercialLot['status'] | 'NOT_COMMERCIAL';
  geometryReference: string;
  labelAnchor: Coordinate;
  preferredLabelVisibility: MapLabelVisibility;
  labelPriority: number;
  searchKeywords: string[];
  aliases: string[];
}

const FAR_CLASSIFICATIONS = new Set<MapClassification>([
  'EVENT_VENUE',
  'LANDMARK',
  'PAVILION',
  'ATTRACTION',
]);

const MEDIUM_CLASSIFICATIONS = new Set<MapClassification>([
  'QUADRA',
  'ROAD',
  'PEDESTRIAN_PATH',
  'RESTAURANT',
  'FOOD_AREA',
  'ADMINISTRATION',
  'BUILDING',
  'LIVESTOCK_AREA',
  'RURAL_EXHIBITION',
  'PARKING',
  'GATE',
  'EMERGENCY',
  'SECURITY',
  'SERVICE',
]);

const OFFICIAL_DISPLAY_NAME_CORRECTIONS: Readonly<Record<string, string>> = {
  A10: 'Portão 10 — entrada e saída de visitantes',
  A11: 'Portão 11 — entrada e saída de visitantes e expositores',
};

function stringMetadata(entity: MapEntity, key: string): string | null {
  const value = entity.metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArrayMetadata(entity: MapEntity, key: string): string[] {
  const value = entity.metadata[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : [];
}

function structureCode(entity: MapEntity): string | null {
  const legendCode = stringMetadata(entity, 'legendCode');
  if (legendCode) return legendCode;
  return /^(?:A\d{1,2}|B\d{1,2}|C\d|D\d|E(?:-\d+)?|F|G|J)$/.test(entity.publicIdentifier)
    ? entity.publicIdentifier.replace(/-\d+$/, '')
    : null;
}

function preferredVisibility(entity: MapEntity): MapLabelVisibility {
  const declared = stringMetadata(entity, 'preferredLabelVisibility');
  if (declared === 'far' || declared === 'medium' || declared === 'near') return declared;
  if (entity.classification === 'SELLABLE_LOT' || entity.classification === 'INTERNAL_STAND') return 'near';
  if (stringMetadata(entity, 'labelPriority') === 'landmark' || FAR_CLASSIFICATIONS.has(entity.classification)) return 'far';
  if (MEDIUM_CLASSIFICATIONS.has(entity.classification)) return 'medium';
  return 'near';
}

function priorityFor(entity: MapEntity, level: MapLabelVisibility): number {
  if (stringMetadata(entity, 'labelPriority') === 'landmark') return 100;
  if (entity.classification === 'EVENT_VENUE') return 94;
  if (entity.classification === 'PAVILION') return 88;
  if (entity.classification === 'LANDMARK') return 86;
  if (entity.classification === 'QUADRA') return 78;
  if (entity.classification === 'ROAD' || entity.classification === 'PEDESTRIAN_PATH') return 72;
  if (entity.classification === 'RESTAURANT' || entity.classification === 'FOOD_AREA') return 68;
  if (entity.classification === 'GATE') return 64;
  if (level === 'medium') return 58;
  return 42;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

export function normalizeMapEntityMetadata(entity: MapEntity, lot?: CommercialLot): NormalizedMapMetadata {
  const officialDisplayName = OFFICIAL_DISPLAY_NAME_CORRECTIONS[entity.publicIdentifier]
    ?? stringMetadata(entity, 'officialDisplayName')
    ?? entity.name;
  const parentBlock = stringMetadata(entity, 'parentPublicIdentifier')?.replace(/^QUADRA-/, '') ?? null;
  const block = lot?.block ?? stringMetadata(entity, 'block') ?? parentBlock;
  const lotNumber = lot?.lotNumber ?? stringMetadata(entity, 'lotNumber');
  const code = structureCode(entity);
  const street = entity.classification === 'ROAD' || entity.classification === 'PEDESTRIAN_PATH'
    ? officialDisplayName
    : stringMetadata(entity, 'street');
  const aliases = unique([
    ...strategicLandmarkSearchAliases(entity),
    ...stringArrayMetadata(entity, 'aliases'),
    ...stringArrayMetadata(entity, 'searchKeywords'),
    ...stringArrayMetadata(entity, 'keywords'),
  ]);
  const labelAnchor = geometryCentroid(entity.geometry);
  const preferredLabelVisibility = preferredVisibility(entity);
  const searchKeywords = unique([
    officialDisplayName,
    entity.name,
    entity.id,
    entity.publicIdentifier,
    lot?.publicIdentifier,
    code,
    block ? `Quadra ${block}` : null,
    lotNumber ? `Lote ${lotNumber}` : null,
    street,
    lot?.levelLabel,
    CLASSIFICATION_LABELS[entity.classification],
    VERIFICATION_LABELS[entity.verificationStatus],
    lot ? STATUS_CONFIG[lot.status].label : 'Não comercial',
    lot?.displayName,
    entity.description,
    lot?.description,
    lot?.currentBuyer,
    lot?.activeContractNumber,
    ...aliases,
  ]);

  return {
    stableId: entity.id,
    officialDisplayName,
    entityType: entity.classification,
    block,
    lotNumber,
    structureCode: code,
    street,
    commercialStatus: lot?.status ?? 'NOT_COMMERCIAL',
    geometryReference: entity.geometry.id ?? entity.publicIdentifier,
    labelAnchor,
    preferredLabelVisibility,
    labelPriority: priorityFor(entity, preferredLabelVisibility),
    searchKeywords,
    aliases,
  };
}

export function mapSearchText(entity: MapEntity, lot?: CommercialLot): string {
  return normalizeMapEntityMetadata(entity, lot).searchKeywords
    .join(' ')
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
