import { describe, expect, it } from 'vitest';
import type { CommercialLot, MapEntity } from '@/features/commercial-map/types';
import {
  buildCommercialPavilionModuleVisualStateIndex,
  buildPavilionModuleCommercialIndex,
  commercialPavilionModuleKey,
  isCommercialPavilionInternalStand,
  resolveCommercialPavilionModuleNavigationTarget,
} from '@/features/commercial-map/utils/pavilionModuleCommercial';

const geometry = {
  id: null,
  type: 'Polygon' as const,
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] as [number, number][][],
  elevation: 0,
  extrusionHeight: 0.1,
  rotation: 0,
  geometryVersion: 1,
  calibrationVersion: null,
};

function entity(overrides: Partial<MapEntity> = {}): MapEntity {
  return {
    id: 'module-48', projectId: 'project', layerId: 'commercial', parentEntityId: 'pavilion-b6',
    publicIdentifier: 'B6-M048', name: 'Módulo 048', description: null,
    classification: 'INTERNAL_STAND', verificationStatus: 'NEEDS_REVIEW', isSellable: true,
    isArchived: false, geometry, metadata: { pavilionPublicIdentifier: 'B6', moduleNumber: 48 },
    ...overrides,
  };
}

function lot(overrides: Partial<CommercialLot> = {}): CommercialLot {
  return {
    id: 'lot-48', entityId: 'module-48', publicIdentifier: 'B6-M048', block: 'P3', lotNumber: '048', levelLabel: 'Térreo',
    displayName: 'Módulo 048', description: null, status: 'BLOCKED', officialAreaSqm: null, calculatedAreaSqm: null,
    areaValidationStatus: 'UNVALIDATED', frontageMeters: null, depthMeters: null, pricingMode: 'NOT_FOR_SALE',
    basePrice: null, pricePerSqm: null, askingPrice: null, minimumPrice: null, infrastructure: [], hasElectricity: false,
    hasWater: false, hasInternet: false, isCorner: false, isCovered: true, accessibilityNotes: null, commercialNotes: null,
    internalNotes: null, currentBuyer: null, reservationExpiresAt: null, saleDate: null, salespersonName: null,
    activeContractNumber: null, archivedAt: null, createdBy: null, updatedBy: null, createdAt: null, updatedAt: null,
    ...overrides,
  };
}

describe('pavilion module commercial identity', () => {
  const pavilion = { id: 'pavilion-b6', publicIdentifier: 'B6' };

  it.each([
    { pavilionIdentifier: 'B2', moduleNumber: 73 },
    { pavilionIdentifier: 'B3', moduleNumber: 41 },
    { pavilionIdentifier: 'B6', moduleNumber: 48 },
  ])('mantém identidade, situação e navegação estáveis em $pavilionIdentifier', ({
    pavilionIdentifier,
    moduleNumber,
  }) => {
    const parentEntityId = `pavilion-${pavilionIdentifier.toLowerCase()}`;
    const moduleId = `module-${pavilionIdentifier.toLowerCase()}-${moduleNumber}`;
    const publicIdentifier = `${pavilionIdentifier}-M${String(moduleNumber).padStart(3, '0')}`;
    const moduleKey = `${pavilionIdentifier}:module:${String(moduleNumber).padStart(3, '0')}`;
    const moduleEntity = entity({
      id: moduleId,
      parentEntityId,
      publicIdentifier,
      metadata: {
        pavilionPublicIdentifier: pavilionIdentifier,
        pavilionModuleKey: moduleKey,
        moduleNumber,
      },
    });
    const moduleLot = lot({
      id: `lot-${pavilionIdentifier.toLowerCase()}-${moduleNumber}`,
      entityId: moduleId,
      publicIdentifier,
      lotNumber: String(moduleNumber),
      status: 'IN_NEGOTIATION',
    });
    const candidatePavilion = { id: parentEntityId, publicIdentifier: pavilionIdentifier };

    expect(buildPavilionModuleCommercialIndex(
      candidatePavilion,
      [moduleEntity],
      [moduleLot],
    ).get(moduleKey)?.lot.status).toBe('IN_NEGOTIATION');
    expect(resolveCommercialPavilionModuleNavigationTarget(moduleEntity)).toEqual({
      pavilionEntityId: parentEntityId,
      moduleId: moduleKey,
    });
  });

  it('maps a persisted lot to the same stable key used by the official plan', () => {
    const index = buildPavilionModuleCommercialIndex(pavilion, [entity()], [lot()]);
    expect(commercialPavilionModuleKey('B6', 48)).toBe('B6:module:048');
    expect(index.get('B6:module:048')?.lot.status).toBe('BLOCKED');
  });

  it('accepts the public identifier fallback but never cross-links another pavilion', () => {
    const fallback = entity({ parentEntityId: null, metadata: {}, publicIdentifier: 'B6-M108' });
    const foreign = entity({ id: 'foreign', publicIdentifier: 'B5-M108', parentEntityId: null, metadata: { pavilionPublicIdentifier: 'B5', moduleNumber: 108 } });
    const index = buildPavilionModuleCommercialIndex(pavilion, [fallback, foreign], [lot({ entityId: fallback.id, lotNumber: '108' }), lot({ id: 'foreign-lot', entityId: foreign.id, lotNumber: '108' })]);
    expect(index.has('B6:module:108')).toBe(true);
    expect(index.size).toBe(1);
  });

  it('rejects ambiguous duplicate module identities', () => {
    const duplicate = entity({ id: 'module-48-duplicate', publicIdentifier: 'B6-M048-B', metadata: { pavilionModuleKey: 'B6:module:048' } });
    const index = buildPavilionModuleCommercialIndex(pavilion, [entity(), duplicate], [lot(), lot({ id: 'duplicate-lot', entityId: duplicate.id })]);
    expect(index.has('B6:module:048')).toBe(false);
  });

  it('recognizes only neutral internal stand records', () => {
    expect(isCommercialPavilionInternalStand(entity())).toBe(true);
    expect(isCommercialPavilionInternalStand(entity({ classification: 'SELLABLE_LOT' }))).toBe(false);
  });

  it('routes a searched module into its pavilion interior instead of an invisible exterior target', () => {
    expect(resolveCommercialPavilionModuleNavigationTarget(entity({
      metadata: {
        pavilionPublicIdentifier: 'B6',
        pavilionModuleKey: 'B6:module:048',
      },
    }))).toEqual({
      pavilionEntityId: 'pavilion-b6',
      moduleId: 'B6:module:048',
    });
    expect(resolveCommercialPavilionModuleNavigationTarget(entity({ parentEntityId: null }))).toBeNull();
  });

  it('derives the same persisted status index for the exterior cutaway and the interior', () => {
    const visualStates = buildCommercialPavilionModuleVisualStateIndex(
      pavilion,
      [entity()],
      [lot({ status: 'IN_NEGOTIATION' })],
    );
    expect(visualStates.get('B6:module:048')).toEqual({
      entityId: 'module-48',
      lotId: 'lot-48',
      status: 'IN_NEGOTIATION',
    });
  });
});
