import { describe, expect, it } from 'vitest';
import { applyLotBuyerSummary } from '@/features/commercial-map/utils/lotBuyerSummary';
import { getCommissionMapPortal } from '@/modules/commissions/commissionMapPortalRegistry';
import type { CommercialLot } from '@/features/commercial-map/types';

const lot = (status: CommercialLot['status']) => ({ id: 'l1', status, currentBuyer: null } as unknown as CommercialLot);
const row = (o: Partial<{ sale_status: string; buyer_display_name: string | null; is_conflict: boolean }>) => ({
  lot_id: 'l1', sale_status: 'CONFIRMED', buyer_display_name: 'Loja Sol', is_conflict: false, ...o,
});

describe('applyLotBuyerSummary', () => {
  it('vendido mostra nome fantasia/razão', () => {
    expect(applyLotBuyerSummary(lot('SOLD'), row({})).currentBuyer).toBe('Loja Sol');
  });
  it('venda em andamento mostra nome sem virar confirmada', () => {
    const r = applyLotBuyerSummary(lot('SALE_OPEN'), row({ sale_status: 'OPEN' }));
    expect(r.currentBuyer).toBe('Loja Sol');
    expect(r.currentSaleStatus).toBe('OPEN');
  });
  it('disponível nunca recebe comprador', () => {
    expect(applyLotBuyerSummary(lot('AVAILABLE'), row({})).currentBuyer).toBeNull();
  });
  it('conflito não escolhe comprador', () => {
    const r = applyLotBuyerSummary(lot('SOLD'), row({ is_conflict: true, sale_status: 'CONFLICT', buyer_display_name: null }));
    expect(r.currentBuyer).toBeNull();
    expect(r.buyerConflict).toBe(true);
  });
  it('sem venda ativa (cancelada) mantém sem nome', () => {
    expect(applyLotBuyerSummary(lot('SOLD'), undefined).currentBuyer).toBeNull();
  });
});

describe('alias do portal', () => {
  it('resolve os dois identificadores da comissão', () => {
    expect(getCommissionMapPortal('industria-comercio-e-servicos')?.id).toBe('industria-comercio-servicos');
    expect(getCommissionMapPortal('industria-comercio-servicos')?.id).toBe('industria-comercio-servicos');
  });
});
