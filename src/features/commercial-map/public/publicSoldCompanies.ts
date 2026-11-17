import type { PublicLot } from './publicMapTypes';

export interface PublicSoldCompanyGroup {
  key: string;
  tradeName: string | null;
  entityIds: string[];
  lots: PublicLot[];
}

const LOT_ORDER = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** Membership comes from the authorized inventory, never from context or the canvas status. */
export function getPublicSoldCompanies(lots: readonly PublicLot[]) {
  const byEntityId = new Map<string, PublicSoldCompanyGroup>();
  const byKey = new Map<string, PublicSoldCompanyGroup>();
  const conflictingNames = new Set<string>();

  for (const lot of lots) {
    const key = lot.buyerGroupKey;
    if (lot.availability !== 'SOLD' || lot.buyerIdentityEligible !== true
      || typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key) || byEntityId.has(lot.entityId)) continue;

    const name = typeof lot.buyerTradeName === 'string' ? lot.buyerTradeName.trim() || null : null;
    let group = byKey.get(key);
    if (!group) {
      group = { key, tradeName: name, entityIds: [], lots: [] };
      byKey.set(key, group);
    } else if (group.tradeName !== name) {
      conflictingNames.add(key);
    }

    group.entityIds.push(lot.entityId);
    group.lots.push(lot);
    byEntityId.set(lot.entityId, group);
  }

  const groups = [...byKey.values()];
  for (const group of groups) {
    if (conflictingNames.has(group.key)) group.tradeName = null;
    group.lots.sort((a, b) => LOT_ORDER.compare(a.block ?? '', b.block ?? '')
      || LOT_ORDER.compare(a.lotNumber ?? '', b.lotNumber ?? '')
      || LOT_ORDER.compare(a.publicIdentifier, b.publicIdentifier));
  }
  return { groups, byEntityId };
}
