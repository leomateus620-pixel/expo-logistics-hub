import { describe, expect, it } from 'vitest';
import { resolveSaleInspection } from '@/features/commercial-map/utils/saleInspectionGroups';
import { signatureSummary } from '@/features/commercial-map/dashboard/salesOrders/CommercialSalesOrdersSection';
import { mapSummaryRow, uniqueContracts } from '@/features/commercial-map/dashboard/salesOrders/salesOrdersService';
import type { CommercialLot, MapEntity } from '@/features/commercial-map/types';

const entity = (id: string, extra: Partial<MapEntity> = {}) => ({
  id, parentEntityId: null, publicIdentifier: id, name: id, classification: 'LOT', metadata: {}, ...extra,
}) as unknown as MapEntity;
const lot = (id: string, entityId: string, displayName = '10') => ({ id, entityId, publicIdentifier: id, displayName }) as unknown as CommercialLot;

const pav13 = entity('pav13', { name: 'Pavilhão 13', classification: 'COMMERCIAL_PAVILION' as never });
const pav7 = entity('pav7', { name: 'Pavilhão 7' });
const mod = (id: string, pav: string, n: string) => entity(id, {
  classification: 'INTERNAL_STAND' as never, parentEntityId: pav, publicIdentifier: `${pav.toUpperCase()}-M${n}`,
  metadata: { pavilionPublicIdentifier: pav.toUpperCase() } as never,
});
const entities = [entity('e1'), entity('e2'), pav13, pav7, mod('m1', 'pav13', '010'), mod('m2', 'pav13', '011'), mod('m3', 'pav7', '010')];
const lots = [lot('l1', 'e1'), lot('l2', 'e2'), lot('lm1', 'm1'), lot('lm2', 'm2'), lot('lm3', 'm3')];

describe('resolveSaleInspection', () => {
  it('enquadra lotes externos separados como venda externa', () => {
    const r = resolveSaleInspection(['l1', 'l2'], lots, entities);
    expect(r.mode).toBe('external');
    expect(r.overviewEntityIds).toEqual(['e1', 'e2']);
  });
  it('agrupa módulos de um pavilhão', () => {
    const r = resolveSaleInspection(['lm1', 'lm2'], lots, entities);
    expect(r.mode).toBe('single-pavilion');
    expect(r.groups[0].pavilionEntityId).toBe('pav13');
    expect(r.groups[0].spaces).toHaveLength(2);
  });
  it('separa números repetidos em pavilhões distintos e trata venda mista', () => {
    const r = resolveSaleInspection(['l1', 'lm1', 'lm3'], lots, entities);
    expect(r.mode).toBe('mixed');
    expect(r.groups.map((g) => g.key)).toEqual(['external', 'pavilion:pav13', 'pavilion:pav7']);
    expect(r.overviewEntityIds).toEqual(['e1', 'pav13', 'pav7']);
  });
  it('informa espaços não localizados sem descartar a venda', () => {
    const r = resolveSaleInspection(['l1', 'ghost'], lots, entities);
    expect(r.allLotIds).toEqual(['l1']);
    expect(r.missing).toEqual(['ghost']);
  });
});

describe('resumos de vendas', () => {
  it('distingue assinatura parcial, cancelamento e legado', () => {
    expect(signatureSummary({ kind: 'ORDER', itemCount: 5, signedCount: 3, pendingCount: 2, cancelledCount: 0, legacyCount: 0 })).toBe('3 de 5 assinados');
    expect(signatureSummary({ kind: 'ORDER', itemCount: 3, signedCount: 0, pendingCount: 2, cancelledCount: 1, legacyCount: 0 })).toBe('Aguardando assinatura · 1 cancelado(s)');
    expect(signatureSummary({ kind: 'LEGACY', itemCount: 1, signedCount: 0, pendingCount: 0, cancelledCount: 0, legacyCount: 1 })).toBe('Registro legado');
  });
  it('mantém pedidos do mesmo expositor separados e oculta documentos sem permissão', () => {
    const a = mapSummaryRow({ record_id: 'o1', kind: 'ORDER', order_id: 'o1', display_name: 'ACME', document_count: 2, lot_ids: ['l1'] }, false);
    const b = mapSummaryRow({ record_id: 'o2', kind: 'ORDER', order_id: 'o2', display_name: 'ACME', document_count: 0, lot_ids: ['l2'] }, true);
    expect(a.recordId).not.toBe(b.recordId);
    expect(a.documentCount).toBeNull();
    expect(b.documentCount).toBe(0);
  });
  it('mostra um documento compartilhado uma única vez', () => {
    const c = { contractId: 'c1', scope: 'ORDER_ITEMS' as const, contractNumber: null, activeVersion: 1, createdAt: '', lotIds: ['l1', 'l2'], versions: [] };
    expect(uniqueContracts([c, c])).toHaveLength(1);
  });
});
