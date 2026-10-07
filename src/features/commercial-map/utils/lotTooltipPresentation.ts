import type { CommercialLot } from '../types';

export interface LotTooltipPresentation {
  buyerName: string | null;
}

/** Centraliza os campos comerciais permitidos na legenda contextual do lote. */
export function resolveLotTooltipPresentation(
  lot: Pick<CommercialLot, 'status' | 'currentBuyer'> & { buyerIdentityUnavailable?: boolean },
): LotTooltipPresentation {
  if (lot.status !== 'SOLD' && lot.status !== 'SALE_OPEN') return { buyerName: null };
  const buyerName = lot.currentBuyer?.trim() ?? '';
  return { buyerName: buyerName || (lot.buyerIdentityUnavailable ? 'Identificação indisponível' : null) };
}