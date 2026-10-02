import type { CommercialLot, MapEntity } from '../types';
import { resolveCommercialPavilionModuleNavigationTarget } from './pavilionModuleCommercial';

export interface SaleInspectionSpace {
  lotId: string;
  entityId: string;
  label: string;
  moduleId: string | null;
}

export interface SaleInspectionGroup {
  key: string;
  kind: 'external' | 'pavilion';
  /** Pavilhão proprietário (para grupos internos). */
  pavilionEntityId: string | null;
  title: string;
  spaces: SaleInspectionSpace[];
}

export interface SaleInspectionResolution {
  groups: SaleInspectionGroup[];
  /** Lotes externos + pavilhões envolvidos: usados no enquadramento da visão geral. */
  overviewEntityIds: string[];
  externalLotIds: string[];
  allLotIds: string[];
  missing: string[];
  mode: 'external' | 'single-pavilion' | 'mixed' | 'empty';
}

/**
 * Resolve UUIDs persistidos (lot.id → entity.id → pavilhão). Nunca usa o número exibido,
 * que pode se repetir entre setores e pavilhões.
 */
export function resolveSaleInspection(
  lotIds: readonly string[],
  lots: readonly CommercialLot[],
  entities: readonly MapEntity[],
  labelFor: (lot: CommercialLot, entity: MapEntity) => string = (lot) => lot.displayName || lot.publicIdentifier,
): SaleInspectionResolution {
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const external: SaleInspectionSpace[] = [];
  const pavilions = new Map<string, SaleInspectionGroup>();
  const missing: string[] = [];
  const unique = Array.from(new Set(lotIds));
  unique.forEach((lotId) => {
    const lot = lotById.get(lotId);
    const entity = lot ? entityById.get(lot.entityId) : undefined;
    if (!lot || !entity) { missing.push(lot?.publicIdentifier ?? lotId); return; }
    const target = resolveCommercialPavilionModuleNavigationTarget(entity);
    const space: SaleInspectionSpace = { lotId, entityId: entity.id, label: labelFor(lot, entity), moduleId: target?.moduleId ?? null };
    if (!target) { external.push(space); return; }
    const pavilion = entityById.get(target.pavilionEntityId);
    if (!pavilion) { missing.push(lot.publicIdentifier); return; }
    const group = pavilions.get(pavilion.id) ?? {
      key: `pavilion:${pavilion.id}`, kind: 'pavilion' as const, pavilionEntityId: pavilion.id,
      title: pavilion.name || pavilion.publicIdentifier, spaces: [],
    };
    group.spaces.push(space);
    pavilions.set(pavilion.id, group);
  });
  const groups: SaleInspectionGroup[] = [];
  if (external.length) groups.push({ key: 'external', kind: 'external', pavilionEntityId: null, title: 'Área externa', spaces: external });
  groups.push(...Array.from(pavilions.values()));
  const mode = groups.length === 0 ? 'empty'
    : external.length && pavilions.size === 0 ? 'external'
      : !external.length && pavilions.size === 1 ? 'single-pavilion' : 'mixed';
  return {
    groups,
    overviewEntityIds: [...external.map((space) => space.entityId), ...pavilions.keys()],
    externalLotIds: external.map((space) => space.lotId),
    allLotIds: groups.flatMap((group) => group.spaces.map((space) => space.lotId)),
    missing,
    mode,
  };
}
