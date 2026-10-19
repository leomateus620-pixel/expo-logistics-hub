import type { CommercialLot } from '@/features/commercial-map/types';
import { buildCommercialDashboardSnapshot } from '@/features/commercial-map/dashboard/commercialDashboardAnalytics';
import type { OccupancyAssociation, PavilionOccupancy } from '@/features/commercial-map/dashboard/pavilionOccupancy';
import { createDashboardPersistedPavilionFixture } from './dashboardPersistedPavilionFixture';

/** Synthetic sales on official persisted fixture polygons. Never used by App/router. */
export function createPavilionOccupancyFixture(pavilionNumber = 12, dense = false) {
  const source = createDashboardPersistedPavilionFixture();
  const original = buildCommercialDashboardSnapshot(source).pavilions.find(p => p.definition.pavilionNumber === pavilionNumber)!;
  const definitions = [
    { name: 'ALFA MÁQUINAS AGRÍCOLAS', numbers: ['41', '42', '43', '44'], exhibitor: 'alfa', order: 'alfa-1' },
    { name: 'COOPERATIVA HORIZONTE', numbers: ['58', '59', '60', '113', '114'], exhibitor: 'horizonte', order: 'horizonte-1' },
    { name: 'BETA TECNOLOGIA', numbers: ['181', '182', '183', '184'], exhibitor: 'beta', order: 'beta-1' },
    { name: 'ALFA MÁQUINAS AGRÍCOLAS', numbers: ['235', '236'], exhibitor: 'alfa', order: 'alfa-2' },
    { name: 'EXPOSITOR SEM CADASTRO', numbers: ['200', '201'], exhibitor: null, order: 'unverified' },
    { name: 'VÍNCULO CONTRADITÓRIO', numbers: ['215'], exhibitor: 'review', order: 'review' },
  ];
  const rows = original.records.map((record, index) => {
    const number = String(Number(record.lot.lotNumber));
    const definition = definitions.find(d => d.numbers.includes(number));
    const occupied = dense ? index % 5 !== 0 : Boolean(definition);
    const signed = index % 3 !== 0;
    const status = occupied ? signed ? 'SOLD' : 'SALE_OPEN' : 'AVAILABLE';
    const lot = { ...record.lot, status, updatedAt: '2026-10-19T18:00:00.000Z' } as CommercialLot;
    const group = definition ?? { name: `EXPOSITOR DE TESTE ${Math.floor(index / 4) + 1}`, exhibitor: `dense-${Math.floor(index / 4)}`, order: `dense-${Math.floor(index / 4)}` };
    const association: OccupancyAssociation = {
      saleId: `sale-${lot.id}`, itemId: `item-${lot.id}`, orderId: group.order, exhibitorId: group.exhibitor,
      displayName: group.name, saleStatus: signed ? 'CONFIRMED' : 'OPEN', contractState: signed ? 'SIGNED' : 'PENDING_SIGNATURE',
      inconsistent: group.order === 'review', updatedAt: lot.updatedAt,
      contracts: [{ id: `contract-${group.order}`, number: `FS28-${group.order.toUpperCase()}`, scope: 'ORDER_ITEMS', updatedAt: lot.updatedAt, verified: true }],
    };
    return { lot, row: { lotId: lot.id, entityId: lot.entityId, lotNumber: lot.lotNumber, status, updatedAt: lot.updatedAt, associations: occupied ? [association] : [] } };
  });
  const lots = new Map(rows.map(r => [r.lot.id, r.lot]));
  const data = { ...source, lots: source.lots.map(lot => lots.get(lot.id) ?? lot) };
  const snapshot = buildCommercialDashboardSnapshot(data).pavilions.find(p => p.definition.pavilionNumber === pavilionNumber)!;
  const payload: PavilionOccupancy = { projectId: snapshot.entity!.projectId, pavilionId: snapshot.entity!.id,
    observedAt: '2026-10-19T18:00:05.000Z', contractsAccessible: true, lots: rows.map(r => r.row) };
  return { data, snapshot, payload };
}
