import { PUBLIC_AVAILABILITY_LABEL, type PublicLot, type PublicLotAvailability } from './publicMapTypes';
import { PACKAGE_RECONCILIATION_LABEL } from '../utils/commercialPackage';

/** Presentation compatibility with old RPC deployments; internal sale state is untouched. */
export function publicAvailability(value: PublicLotAvailability): 'AVAILABLE' | 'SOLD' | 'UNAVAILABLE' {
  if (value === 'AVAILABLE') return 'AVAILABLE';
  if (value === 'SOLD' || value === 'SALE_OPEN') return 'SOLD';
  return 'UNAVAILABLE';
}

export function publicAvailabilityLabel(lot: PublicLot): string {
  if (lot.packageReconciliationPending) return PACKAGE_RECONCILIATION_LABEL;
  if (lot.packageRole && lot.availability === 'SALE_OPEN') return 'Venda em aberto';
  return PUBLIC_AVAILABILITY_LABEL[lot.availability];
}
