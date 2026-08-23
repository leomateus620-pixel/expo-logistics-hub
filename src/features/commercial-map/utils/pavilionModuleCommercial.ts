import type { CommercialLot, CommercialStatus, MapEntity } from '../types';

export interface PavilionModuleCommercialRecord {
  entity: MapEntity;
  lot: CommercialLot;
  moduleNumber: number;
}

export interface CommercialPavilionModuleVisualState {
  entityId: string;
  lotId: string | null;
  status: CommercialStatus | null;
}

export interface CommercialPavilionModuleNavigationTarget {
  pavilionEntityId: string;
  moduleId: string;
}

function normalizedIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLocaleUpperCase('pt-BR');
  return normalized || null;
}

function positiveModuleNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function commercialPavilionModuleKey(publicIdentifier: string, moduleNumber: number): string {
  return `${publicIdentifier.trim().toLocaleUpperCase('pt-BR')}:module:${String(moduleNumber).padStart(3, '0')}`;
}

export function isCommercialPavilionInternalStand(entity: MapEntity): boolean {
  if (entity.classification !== 'INTERNAL_STAND') return false;
  return typeof entity.metadata.pavilionModuleKey === 'string'
    || typeof entity.metadata.pavilionPublicIdentifier === 'string';
}

/** Routes an explorer result to the owning pavilion and its stable internal cell. */
export function resolveCommercialPavilionModuleNavigationTarget(
  entity: MapEntity,
): CommercialPavilionModuleNavigationTarget | null {
  if (entity.classification !== 'INTERNAL_STAND' || !entity.parentEntityId) return null;

  const metadataPavilion = normalizedIdentifier(entity.metadata.pavilionPublicIdentifier);
  const metadataKey = normalizedIdentifier(entity.metadata.pavilionModuleKey);
  const keyMatch = metadataKey?.match(/^([A-Z0-9-]+):MODULE:(\d{3})$/);
  const identifierMatch = normalizedIdentifier(entity.publicIdentifier)?.match(/^([A-Z0-9-]+)-M(\d{3})$/);
  const pavilionIdentifier = metadataPavilion ?? keyMatch?.[1] ?? identifierMatch?.[1] ?? null;
  const moduleNumber = positiveModuleNumber(keyMatch?.[2] ?? identifierMatch?.[2]);

  if (!pavilionIdentifier || !moduleNumber) return null;
  if (keyMatch && keyMatch[1] !== pavilionIdentifier) return null;
  if (identifierMatch && identifierMatch[1] !== pavilionIdentifier) return null;

  return {
    pavilionEntityId: entity.parentEntityId,
    moduleId: commercialPavilionModuleKey(pavilionIdentifier, moduleNumber),
  };
}

export function resolveCommercialPavilionModuleNumber(
  pavilion: Pick<MapEntity, 'id' | 'publicIdentifier'>,
  entity: MapEntity,
  lot?: CommercialLot | null,
): number | null {
  if (entity.classification !== 'INTERNAL_STAND') return null;
  const pavilionIdentifier = normalizedIdentifier(pavilion.publicIdentifier);
  const metadataPavilion = normalizedIdentifier(entity.metadata.pavilionPublicIdentifier);
  if (metadataPavilion && metadataPavilion !== pavilionIdentifier) return null;

  const key = normalizedIdentifier(entity.metadata.pavilionModuleKey);
  const escaped = pavilionIdentifier?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyMatch = escaped
    ? key?.match(new RegExp(`^${escaped}:MODULE:(\\d{3})$`))
    : null;
  if (keyMatch) return positiveModuleNumber(keyMatch[1]);

  const entityIdentifier = normalizedIdentifier(entity.publicIdentifier);
  const identifierMatch = escaped
    ? entityIdentifier?.match(new RegExp(`^${escaped}-M(\\d{3})$`))
    : null;
  if (identifierMatch) return positiveModuleNumber(identifierMatch[1]);

  if (!metadataPavilion && entity.parentEntityId !== pavilion.id) return null;

  return positiveModuleNumber(entity.metadata.moduleNumber)
    ?? positiveModuleNumber(entity.metadata.lotNumber)
    ?? positiveModuleNumber(lot?.lotNumber);
}

/**
 * Resolves the persisted commercial record for every neutral pavilion module.
 * Invalid and duplicate module identities are ignored instead of guessing which
 * record should receive an operational action.
 */
export function buildPavilionModuleCommercialIndex(
  pavilion: Pick<MapEntity, 'id' | 'publicIdentifier'>,
  entities: MapEntity[],
  lots: CommercialLot[],
): ReadonlyMap<string, PavilionModuleCommercialRecord> {
  const lotByEntity = new Map(lots.map((lot) => [lot.entityId, lot]));
  const index = new Map<string, PavilionModuleCommercialRecord>();
  const duplicates = new Set<string>();

  entities.forEach((entity) => {
    const lot = lotByEntity.get(entity.id);
    if (!lot) return;
    const moduleNumber = resolveCommercialPavilionModuleNumber(pavilion, entity, lot);
    if (!moduleNumber) return;
    const key = commercialPavilionModuleKey(pavilion.publicIdentifier, moduleNumber);
    if (index.has(key)) {
      index.delete(key);
      duplicates.add(key);
      return;
    }
    if (!duplicates.has(key)) index.set(key, { entity, lot, moduleNumber });
  });

  return index;
}

export function buildCommercialPavilionModuleVisualStateIndex(
  pavilion: Pick<MapEntity, 'id' | 'publicIdentifier'>,
  entities: MapEntity[],
  lots: CommercialLot[],
  validModuleKeys?: ReadonlySet<string>,
): ReadonlyMap<string, CommercialPavilionModuleVisualState> {
  const commercialIndex = buildPavilionModuleCommercialIndex(pavilion, entities, lots);
  return new Map(
    [...commercialIndex]
      .filter(([moduleKey]) => !validModuleKeys || validModuleKeys.has(moduleKey))
      .map(([moduleKey, record]) => [moduleKey, {
        entityId: record.entity.id,
        lotId: record.lot.id,
        status: record.lot.status,
      }]),
  );
}
