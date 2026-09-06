import { STATUS_CONFIG } from '../constants';
import {
  buildCommercialMapSegmentIndex,
  getCommercialMapSegment,
  type CommercialMapSegmentId,
} from '../data/commercialMapSegments';
import type { CommercialLot, CommercialStatus, MapEntity } from '../types';
import {
  resolveCommercialPavilionModulePlan,
  type CommercialPavilionModulePlan,
} from './commercialPavilionModules';
import {
  buildPavilionModuleCommercialIndex,
  commercialPavilionModuleKey,
  resolveCommercialPavilionModuleNumber,
} from './pavilionModuleCommercial';

export interface ContextualMapScopeInput {
  entities: readonly MapEntity[];
  lots: readonly CommercialLot[];
  interiorEntity?: MapEntity | null;
  activeSegmentId?: CommercialMapSegmentId | null;
  scopeTitle?: string;
}

export interface ContextualMapScope {
  kind: 'interior' | 'segment' | 'park';
  title: string;
  entityIds: ReadonlySet<string>;
  entities: readonly MapEntity[];
  lots: readonly CommercialLot[];
  plan: CommercialPavilionModulePlan | null;
  totalCount: number;
  unit: 'lotes' | 'módulos';
  nonCommercialCount: number;
  unregisteredModuleCount: number;
}

/** This follows existing ownership and commercial module identities, never geometry. */
export function resolveContextualMapScope({
  entities,
  lots,
  interiorEntity,
  activeSegmentId,
  scopeTitle,
}: ContextualMapScopeInput): ContextualMapScope {
  const activeEntities = entities.filter((entity) => !entity.isArchived);
  const activeEntityIds = new Set(activeEntities.map((entity) => entity.id));
  const activeLots = lots.filter((lot) => !lot.archivedAt && activeEntityIds.has(lot.entityId));
  const plan = interiorEntity ? resolveCommercialPavilionModulePlan(interiorEntity) : null;

  if (interiorEntity && plan) {
    const validKeys = new Set(plan.cells.map((cell) => cell.id));
    const commercialIndex = buildPavilionModuleCommercialIndex(interiorEntity, activeEntities, activeLots);
    const scopeLots = [...commercialIndex]
      .filter(([key]) => validKeys.has(key))
      .map(([, record]) => record.lot);
    const scopeEntities = activeEntities.filter((entity) => {
      const moduleNumber = resolveCommercialPavilionModuleNumber(interiorEntity, entity);
      return moduleNumber !== null
        && validKeys.has(commercialPavilionModuleKey(interiorEntity.publicIdentifier, moduleNumber));
    });
    return {
      kind: 'interior',
      title: interiorEntity.name,
      entityIds: new Set(scopeEntities.map((entity) => entity.id)),
      entities: scopeEntities,
      lots: scopeLots,
      plan,
      totalCount: plan.cells.length,
      unit: 'módulos',
      nonCommercialCount: plan.supportSpaces.length,
      unregisteredModuleCount: plan.cells.length - scopeLots.length,
    };
  }

  let scopeEntities = activeEntities;
  if (interiorEntity) {
    const ownerIds = new Set([interiorEntity.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const entity of activeEntities) {
        if (entity.parentEntityId && ownerIds.has(entity.parentEntityId) && !ownerIds.has(entity.id)) {
          ownerIds.add(entity.id);
          changed = true;
        }
      }
    }
    scopeEntities = activeEntities.filter((entity) => entity.id !== interiorEntity.id && ownerIds.has(entity.id));
  } else if (activeSegmentId) {
    const segmentIndex = buildCommercialMapSegmentIndex(activeEntities, activeLots);
    scopeEntities = activeEntities.filter((entity) => segmentIndex.get(entity.id)?.id === activeSegmentId);
  }
  const entityIds = new Set(scopeEntities.map((entity) => entity.id));
  const scopeLots = activeLots.filter((lot) => entityIds.has(lot.entityId));
  const lotEntityIds = new Set(scopeLots.map((lot) => lot.entityId));
  return {
    kind: interiorEntity ? 'interior' : activeSegmentId ? 'segment' : 'park',
    title: interiorEntity?.name ?? getCommercialMapSegment(activeSegmentId)?.name ?? scopeTitle ?? 'Parque Fenasoja',
    entityIds,
    entities: scopeEntities,
    lots: scopeLots,
    plan: null,
    totalCount: scopeLots.length,
    unit: 'lotes',
    nonCommercialCount: scopeEntities.filter((entity) => !lotEntityIds.has(entity.id) && !entity.isSellable).length,
    unregisteredModuleCount: 0,
  };
}

export interface ContextualAreaTotal {
  /** Null means no positive official measurement was registered. */
  squareMeters: number | null;
  informedCount: number;
  missingCount: number;
}

function officialAreaTotal(lots: readonly CommercialLot[]): ContextualAreaTotal {
  let total = 0;
  let informedCount = 0;
  lots.forEach((lot) => {
    if (lot.officialAreaSqm !== null && Number.isFinite(lot.officialAreaSqm) && lot.officialAreaSqm > 0) {
      total += lot.officialAreaSqm;
      informedCount += 1;
    }
  });
  return { squareMeters: informedCount > 0 ? total : null, informedCount, missingCount: lots.length - informedCount };
}

/** Status totals describe the whole scope; the filtered count describes its visible subset. */
export function deriveContextualMapSummary(
  scope: ContextualMapScope,
  {
    statusFilters = [],
    matchingEntityIds,
    filtersActive = false,
  }: {
    statusFilters?: readonly CommercialStatus[];
    matchingEntityIds?: ReadonlySet<string>;
    filtersActive?: boolean;
  } = {},
) {
  const byStatus = Object.fromEntries(Object.keys(STATUS_CONFIG).map((status) => [status, 0])) as Record<CommercialStatus, number>;
  scope.lots.forEach((lot) => { byStatus[lot.status] += 1; });
  const hasFilters = filtersActive || statusFilters.length > 0;
  const filteredLots = hasFilters ? scope.lots.filter((lot) => (
    (statusFilters.length === 0 || statusFilters.includes(lot.status))
    && (!matchingEntityIds || matchingEntityIds.has(lot.entityId))
  )) : scope.lots;
  return {
    byStatus,
    hasFilters,
    filteredCount: hasFilters ? filteredLots.length : scope.totalCount,
    officialArea: officialAreaTotal(scope.lots),
    availableOfficialArea: officialAreaTotal(scope.lots.filter((lot) => lot.status === 'AVAILABLE')),
  };
}
