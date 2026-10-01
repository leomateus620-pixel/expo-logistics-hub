import type { CommercialLot } from '@/features/commercial-map/types';

/** Test inputs for the two authoritative sources; no production fallback. */
export function withDashboardValue(lot: CommercialLot, value: number | null, segundaTotal = value): CommercialLot {
  return {
    ...lot,
    sales: lot.status === 'SALE_OPEN' || lot.status === 'SOLD' ? [{
      id: `sale-${lot.id}`, lotId: lot.id,
      status: lot.status === 'SALE_OPEN' ? 'OPEN' : 'CONFIRMED', negotiatedValue: value,
    }] : [],
    officialPricing2028: {
      lotId: lot.id, entityId: lot.entityId, renovacaoTotal: value, segundaTotal,
      renovacaoIsManual: false, segundaIsManual: false, resolutionStatus: 'OK',
    },
  };
}
