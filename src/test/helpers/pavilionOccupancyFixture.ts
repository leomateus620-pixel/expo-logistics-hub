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

/** Reproduction of the reported numbers/contract splits, not production evidence.
 * Persistent synthetic IDs prove membership; the name never establishes a link. */
export function createPavilionGroupingRegressionFixture(pavilionNumber = 12) {
  const base = createPavilionOccupancyFixture(pavilionNumber);
  const definitions = pavilionNumber === 12 ? [
    { id: 'diniz', name: 'ÓTICA DINIZ', numbers: [58, 59, 60, 61, 62, 63], contracted: [58] },
    { id: 'american', name: 'AMERICAN FISIO', numbers: [248, 249, 250, 251], contracted: [248] },
    { id: 'sequence', name: 'VIA MUNDI', numbers: [50, 51, 52, 53, 54], contracted: [52] },
  ] : [
    { id: 'adri', name: 'ADRI MODAS', numbers: [85, 86, 87, 88, 89], contracted: [86] },
    { id: 'exito', name: 'EXITO CONFECCAO', numbers: [68, 69, 70, 71, 72], contracted: [72] },
  ];
  const rows = base.payload.lots.map(row => {
    const definition = definitions.find(d => d.numbers.includes(Number(row.lotNumber)));
    const association: OccupancyAssociation | null = definition ? {
      saleId: `sale-${row.lotId}`, orderId: `order-${definition.id}`, itemId: `item-${row.lotId}`,
      exhibitorId: definition.id, displayName: definition.name, saleStatus: 'CONFIRMED', contractState: 'SIGNED',
      inconsistent: false, updatedAt: row.updatedAt!, contracts: definition.contracted.includes(Number(row.lotNumber)) ? [
        { id: `contract-${definition.id}`, number: `FS28-${definition.id.toUpperCase()}`, scope: 'LOT', verified: true, updatedAt: row.updatedAt! },
      ] : [],
    } : null;
    return { ...row, status: definition ? 'SOLD' : 'AVAILABLE', associations: association ? [association] : [] };
  });
  const byId = new Map(rows.map(row => [row.lotId, row]));
  const data = { ...base.data, lots: base.data.lots.map(lot => {
    const row = byId.get(lot.id);
    return row ? { ...lot, status: row.status as CommercialLot['status'] } : lot;
  }) };
  const snapshot = buildCommercialDashboardSnapshot(data).pavilions.find(p => p.definition.pavilionNumber === pavilionNumber)!;
  return { data, snapshot, payload: { ...base.payload, lots: rows } };
}
