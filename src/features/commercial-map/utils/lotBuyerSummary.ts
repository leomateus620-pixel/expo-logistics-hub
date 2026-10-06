import type { CommercialLot } from '../types';

/** Linha mínima devolvida por `commercial_map_lot_buyers` (sem documento, contato ou pagamento). */
export interface LotBuyerSummaryRow {
  lot_id: string;
  sale_status: 'OPEN' | 'CONFIRMED' | 'CONFLICT' | string;
  buyer_display_name: string | null;
  is_conflict: boolean;
}

/**
 * Aplica a identificação do comprador da venda vigente (OPEN ou CONFIRMED).
 * Cancelada não chega aqui; conflito (mais de uma venda ativa) não exibe nome;
 * lote disponível nunca recebe comprador.
 */
export function applyLotBuyerSummary(lot: CommercialLot, row: LotBuyerSummaryRow | undefined): CommercialLot {
  const isSaleState = lot.status === 'SOLD' || lot.status === 'SALE_OPEN';
  if (!isSaleState) {
    return lot.currentSaleStatus ? { ...lot, currentSaleStatus: null } : lot;
  }
  if (!row) return lot;
  if (row.is_conflict || row.sale_status === 'CONFLICT') {
    return { ...lot, currentBuyer: null, currentSaleStatus: null, buyerConflict: true };
  }
  const name = row.buyer_display_name?.trim() || null;
  const status = row.sale_status === 'CONFIRMED' || row.sale_status === 'OPEN' ? row.sale_status : null;
  return { ...lot, currentBuyer: name ?? lot.currentBuyer, currentSaleStatus: status ?? lot.currentSaleStatus ?? null };
}
