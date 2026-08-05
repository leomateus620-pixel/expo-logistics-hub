interface CommissionInventoryInput {
  expectedEntityCount: number;
  expectedLotCount: number;
  entityIds: readonly string[];
  lotEntityIds: readonly string[];
}

export function isCommissionInventoryConsistent({
  expectedEntityCount,
  expectedLotCount,
  entityIds,
  lotEntityIds,
}: CommissionInventoryInput): boolean {
  if (
    !Number.isInteger(expectedEntityCount)
    || !Number.isInteger(expectedLotCount)
    || expectedLotCount <= 0
    || expectedEntityCount < expectedLotCount
    || lotEntityIds.length === 0
  ) {
    return false;
  }

  const entityIdSet = new Set(entityIds);
  const lotEntityIdSet = new Set(lotEntityIds);
  const expectedNonLotEntityCount = expectedEntityCount - expectedLotCount;

  return entityIdSet.size === entityIds.length
    && lotEntityIdSet.size === lotEntityIds.length
    && lotEntityIds.every((entityId) => entityIdSet.has(entityId))
    && entityIds.length === expectedEntityCount
    && lotEntityIds.length === expectedLotCount
    && entityIds.length - lotEntityIds.length === expectedNonLotEntityCount;
}
