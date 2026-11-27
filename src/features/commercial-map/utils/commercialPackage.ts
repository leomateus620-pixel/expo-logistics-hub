import type { CommercialLot } from '../types';

export const STALLONNE_INCLUDED_LABEL = 'Incluído na locação do Parque Stallonne';
export const PACKAGE_RECONCILIATION_LABEL = 'Pendente de conciliação';

export function packagePrincipalsByAnchor(lots: readonly CommercialLot[]) {
  return new Map(lots.filter((lot) => lot.commercialPackageRole === 'PRINCIPAL' && !lot.archivedAt)
    .map((lot) => [lot.commercialPackageAnchorEntityId ?? lot.entityId, lot]));
}

export function packageComponents(principal: Pick<CommercialLot, 'id'>, lots: readonly CommercialLot[]) {
  return lots.filter((lot) => lot.commercialPackageRole === 'COMPONENT'
    && lot.commercialPackagePrincipalLotId === principal.id && !lot.archivedAt);
}

export function packageIncludedPoints(principal: Pick<CommercialLot, 'id'>, lots: readonly CommercialLot[]) {
  return packageComponents(principal, lots)
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.publicIdentifier.localeCompare(b.publicIdentifier))
    .map(({ id, commercialPackageComponentName, displayName, publicIdentifier }) => ({
      id,
      label: commercialPackageComponentName || displayName || publicIdentifier,
    }));
}

export function applyPackageComponentStatus(lots: CommercialLot[]): CommercialLot[] {
  if (!lots.some((lot) => lot.commercialPackageRole === 'COMPONENT')) return lots;
  const principals = new Map(lots.filter((lot) => lot.commercialPackageRole === 'PRINCIPAL' && !lot.archivedAt)
    .map((lot) => [lot.id, lot]));
  return lots.map((lot) => {
    if (lot.commercialPackageRole !== 'COMPONENT') return lot;
    const principal = principals.get(lot.commercialPackagePrincipalLotId ?? '');
    return {
      ...lot,
      commercialPackageRecordedStatus: lot.commercialPackageRecordedStatus ?? lot.status,
      status: principal?.status ?? 'BLOCKED',
      commercialPackageReconciliationPending: Boolean(principal?.commercialPackageReconciliationPending),
    };
  });
}
