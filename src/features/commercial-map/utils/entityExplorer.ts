import { CLASSIFICATION_LABELS, STATUS_CONFIG, VERIFICATION_LABELS } from '../constants';
import type {
  CommercialLot,
  CommercialStatus,
  EntitySortOrder,
  MapClassification,
  MapEntity,
  VerificationStatus,
} from '../types';
import { normalizeMapEntityMetadata, type NormalizedMapMetadata } from './mapMetadata';

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

const STATUS_SORT_ORDER: Record<CommercialStatus | 'NOT_COMMERCIAL', number> = {
  AVAILABLE: 0,
  RESERVED: 1,
  IN_NEGOTIATION: 2,
  SOLD: 3,
  BLOCKED: 4,
  UNAVAILABLE: 5,
  NOT_COMMERCIAL: 6,
};

const LOCATION_GROUP_ORDER: Record<EntityLocationGroup, number> = {
  Quadras: 0,
  Vias: 1,
  'Pisos e níveis': 2,
};

export type EntityLocationGroup = 'Quadras' | 'Vias' | 'Pisos e níveis';

export interface EntityExplorerOption<T extends string> {
  value: T;
  label: string;
  count: number;
}

export interface EntityLocationOption extends EntityExplorerOption<string> {
  group: EntityLocationGroup;
}

export interface EntityExplorerFacets {
  classifications: Array<EntityExplorerOption<MapClassification>>;
  locations: EntityLocationOption[];
  verifications: Array<EntityExplorerOption<VerificationStatus>>;
  statusCounts: Record<CommercialStatus, number>;
}

interface EntityLocationFacet {
  value: string;
  label: string;
  group: EntityLocationGroup;
}

interface NormalizedEntitySearch {
  identifiers: string[];
  compactIdentifiers: string[];
  names: string[];
  locations: string[];
  companies: string[];
  contracts: string[];
  keywords: string[];
  haystack: string;
}

export interface EntityExplorerItem {
  entity: MapEntity;
  lot?: CommercialLot;
  metadata: NormalizedMapMetadata;
  locationLabel: string | null;
  locationDetail: string | null;
  locationFacets: EntityLocationFacet[];
  companyLabel: string | null;
  commercialStatus: CommercialStatus | 'NOT_COMMERCIAL';
  matchScore: number;
  matchReason: string | null;
  search: NormalizedEntitySearch;
}

export interface EntityExplorerCriteria {
  query: string;
  statusFilters: CommercialStatus[];
  classificationFilters: MapClassification[];
  locationFilter: string | null;
  verificationFilters: VerificationStatus[];
  sortOrder: EntitySortOrder;
}

export function normalizeExplorerText(value: string): string {
  return value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compact(value: string): string {
  return value.replace(/\s+/g, '');
}

function normalizedValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => normalizeExplorerText(value ?? '')).filter(Boolean))];
}

function buildLocation(
  entity: MapEntity,
  lot: CommercialLot | undefined,
  metadata: NormalizedMapMetadata,
): Pick<EntityExplorerItem, 'locationLabel' | 'locationDetail' | 'locationFacets'> {
  const facets: EntityLocationFacet[] = [];
  if (metadata.block) {
    facets.push({ value: `block:${metadata.block}`, label: `Quadra ${metadata.block}`, group: 'Quadras' });
  }
  if (metadata.street) {
    facets.push({ value: `street:${normalizeExplorerText(metadata.street)}`, label: metadata.street, group: 'Vias' });
  }
  if (lot?.levelLabel) {
    facets.push({ value: `level:${normalizeExplorerText(lot.levelLabel)}`, label: lot.levelLabel, group: 'Pisos e níveis' });
  }

  if (metadata.block && metadata.lotNumber) {
    return {
      locationLabel: `Quadra ${metadata.block} · Lote ${metadata.lotNumber}`,
      locationDetail: lot?.levelLabel ?? metadata.street,
      locationFacets: facets,
    };
  }
  if (metadata.street) {
    return { locationLabel: metadata.street, locationDetail: null, locationFacets: facets };
  }
  if (metadata.block) {
    return {
      locationLabel: `Quadra ${metadata.block}`,
      locationDetail: lot?.levelLabel ?? null,
      locationFacets: facets,
    };
  }
  if (lot?.levelLabel) {
    return { locationLabel: lot.levelLabel, locationDetail: null, locationFacets: facets };
  }
  if (entity.parentEntityId) {
    return { locationLabel: null, locationDetail: 'Vinculada a uma estrutura do parque', locationFacets: facets };
  }
  return { locationLabel: null, locationDetail: null, locationFacets: facets };
}

export function buildEntityExplorerIndex(entities: MapEntity[], lots: CommercialLot[]): EntityExplorerItem[] {
  const lotByEntity = new Map(lots.map((lot) => [lot.entityId, lot]));

  return entities.map((entity) => {
    const lot = lotByEntity.get(entity.id);
    const metadata = normalizeMapEntityMetadata(entity, lot);
    const location = buildLocation(entity, lot, metadata);
    const commercialStatus = lot?.status ?? 'NOT_COMMERCIAL';
    const statusLabel = lot ? STATUS_CONFIG[lot.status].label : 'Não comercial';
    const identifiers = normalizedValues([
      entity.id,
      entity.publicIdentifier,
      lot?.publicIdentifier,
      metadata.structureCode,
    ]);
    const names = normalizedValues([
      metadata.officialDisplayName,
      entity.name,
      lot?.displayName,
    ]);
    const locations = normalizedValues([
      location.locationLabel,
      location.locationDetail,
      metadata.block ? `Quadra ${metadata.block}` : null,
      metadata.lotNumber ? `Lote ${metadata.lotNumber}` : null,
      metadata.street,
      lot?.levelLabel,
    ]);
    const companies = normalizedValues([lot?.currentBuyer]);
    const contracts = normalizedValues([lot?.activeContractNumber]);
    const keywords = normalizedValues([
      ...metadata.searchKeywords,
      CLASSIFICATION_LABELS[entity.classification],
      VERIFICATION_LABELS[entity.verificationStatus],
      statusLabel,
      entity.description,
      lot?.description,
    ]);
    const haystack = [...new Set([
      ...identifiers,
      ...names,
      ...locations,
      ...companies,
      ...contracts,
      ...keywords,
    ])].join(' ');

    return {
      entity,
      lot,
      metadata,
      ...location,
      companyLabel: lot?.currentBuyer ?? null,
      commercialStatus,
      matchScore: 0,
      matchReason: null,
      search: {
        identifiers,
        compactIdentifiers: identifiers.map(compact),
        names,
        locations,
        companies,
        contracts,
        keywords,
        haystack,
      },
    };
  });
}

export function buildEntityExplorerFacets(items: EntityExplorerItem[]): EntityExplorerFacets {
  const classifications = new Map<MapClassification, number>();
  const verifications = new Map<VerificationStatus, number>();
  const locations = new Map<string, EntityLocationOption>();
  const statusCounts = Object.fromEntries(
    (Object.keys(STATUS_CONFIG) as CommercialStatus[]).map((status) => [status, 0]),
  ) as Record<CommercialStatus, number>;

  items.forEach((item) => {
    classifications.set(item.entity.classification, (classifications.get(item.entity.classification) ?? 0) + 1);
    verifications.set(item.entity.verificationStatus, (verifications.get(item.entity.verificationStatus) ?? 0) + 1);
    if (item.lot) statusCounts[item.lot.status] += 1;
    item.locationFacets.forEach((facet) => {
      const current = locations.get(facet.value);
      locations.set(facet.value, { ...facet, count: (current?.count ?? 0) + 1 });
    });
  });

  return {
    classifications: [...classifications].map(([value, count]) => ({
      value,
      label: CLASSIFICATION_LABELS[value],
      count,
    })).sort((a, b) => collator.compare(a.label, b.label)),
    locations: [...locations.values()].sort((a, b) => (
      LOCATION_GROUP_ORDER[a.group] - LOCATION_GROUP_ORDER[b.group]
      || collator.compare(a.label, b.label)
    )),
    verifications: [...verifications].map(([value, count]) => ({
      value,
      label: VERIFICATION_LABELS[value],
      count,
    })).sort((a, b) => collator.compare(a.label, b.label)),
    statusCounts,
  };
}

function scoreMatch(item: EntityExplorerItem, query: string): Pick<EntityExplorerItem, 'matchScore' | 'matchReason'> | null {
  const compactQuery = compact(query);
  const exactIdentifier = item.search.identifiers.includes(query)
    || item.search.compactIdentifiers.includes(compactQuery);
  if (exactIdentifier) return { matchScore: 1400, matchReason: 'Identificador exato' };

  if (item.search.compactIdentifiers.some((identifier) => identifier.startsWith(compactQuery))) {
    return { matchScore: 1180, matchReason: 'Início do identificador' };
  }
  if (item.search.compactIdentifiers.some((identifier) => identifier.includes(compactQuery))) {
    return { matchScore: 1040, matchReason: 'Identificador' };
  }
  if (item.search.names.includes(query)) return { matchScore: 900, matchReason: 'Nome exato' };
  if (item.search.names.some((name) => name.startsWith(query))) return { matchScore: 820, matchReason: 'Nome' };
  if (item.search.locations.includes(query)) return { matchScore: 780, matchReason: 'Localização exata' };
  if (item.search.companies.includes(query)) return { matchScore: 760, matchReason: 'Empresa / expositor' };
  if (item.search.contracts.includes(query)) return { matchScore: 740, matchReason: 'Contrato exato' };
  if (item.search.names.some((name) => name.includes(query))) return { matchScore: 690, matchReason: 'Nome' };
  if (item.search.locations.some((location) => location.includes(query))) return { matchScore: 650, matchReason: 'Localização' };
  if (item.search.companies.some((company) => company.includes(query))) return { matchScore: 630, matchReason: 'Empresa / expositor' };
  if (item.search.contracts.some((contract) => contract.includes(query))) return { matchScore: 610, matchReason: 'Contrato' };
  if (item.search.keywords.includes(query)) return { matchScore: 580, matchReason: 'Termo cadastrado' };
  if (item.search.keywords.some((keyword) => keyword.includes(query))) return { matchScore: 520, matchReason: 'Termo relacionado' };
  if (item.search.haystack.includes(query)) return { matchScore: 460, matchReason: 'Correspondência textual' };

  const tokens = query.split(' ').filter(Boolean);
  const haystackTokens = new Set(item.search.haystack.split(' '));
  if (tokens.length > 1 && tokens.every((token) => (
    token.length === 1 ? haystackTokens.has(token) : item.search.haystack.includes(token)
  ))) {
    return { matchScore: 380 + tokens.length * 5, matchReason: 'Múltiplos termos' };
  }
  return null;
}

function compareByName(a: EntityExplorerItem, b: EntityExplorerItem): number {
  return collator.compare(a.metadata.officialDisplayName, b.metadata.officialDisplayName)
    || collator.compare(a.entity.publicIdentifier, b.entity.publicIdentifier);
}

function compareByLocation(a: EntityExplorerItem, b: EntityExplorerItem): number {
  if (a.locationLabel && !b.locationLabel) return -1;
  if (!a.locationLabel && b.locationLabel) return 1;
  return collator.compare(a.locationLabel ?? '', b.locationLabel ?? '') || compareByName(a, b);
}

export function filterAndSortEntityExplorerItems(
  items: EntityExplorerItem[],
  criteria: EntityExplorerCriteria,
): EntityExplorerItem[] {
  const query = normalizeExplorerText(criteria.query);
  const candidates = items.filter((item) => {
    if (criteria.statusFilters.length > 0 && (!item.lot || !criteria.statusFilters.includes(item.lot.status))) return false;
    if (criteria.classificationFilters.length > 0 && !criteria.classificationFilters.includes(item.entity.classification)) return false;
    if (criteria.locationFilter && !item.locationFacets.some((facet) => facet.value === criteria.locationFilter)) return false;
    if (criteria.verificationFilters.length > 0 && !criteria.verificationFilters.includes(item.entity.verificationStatus)) return false;
    return true;
  });

  const matched = query
    ? candidates.flatMap((item) => {
      const match = scoreMatch(item, query);
      return match ? [{ ...item, ...match }] : [];
    })
    : candidates;

  const rawQuery = criteria.query.trim();
  const hasIdentifierSyntax = /^[a-z0-9:_-]+$/i.test(rawQuery) && /[\d:_-]/.test(rawQuery);
  const exactIdentifierMatches = hasIdentifierSyntax
    ? matched.filter((item) => item.matchScore === 1400)
    : [];
  const sortableItems = exactIdentifierMatches.length > 0 ? exactIdentifierMatches : matched;

  return [...sortableItems].sort((a, b) => {
    if (criteria.sortOrder === 'relevance' && query) {
      return b.matchScore - a.matchScore || compareByName(a, b);
    }
    if (criteria.sortOrder === 'location') return compareByLocation(a, b);
    if (criteria.sortOrder === 'status') {
      return STATUS_SORT_ORDER[a.commercialStatus] - STATUS_SORT_ORDER[b.commercialStatus] || compareByName(a, b);
    }
    return compareByName(a, b);
  });
}
