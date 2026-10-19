import { z } from 'zod';
import type { CommercialLot, CommercialStatus } from '../types';
import type { SaleItemContractState } from './salesOrders/salesOrdersService';

const contractSchema = z.object({ id: z.string(), number: z.string().nullable(), scope: z.enum(['LOT', 'ORDER_ITEMS']), updatedAt: z.string(), verified: z.boolean() });
const associationSchema = z.object({
  saleId: z.string(), orderId: z.string().nullable(), itemId: z.string().nullable(), exhibitorId: z.string().nullable(),
  displayName: z.string().nullable(), saleStatus: z.enum(['OPEN', 'CONFIRMED']),
  contractState: z.enum(['PENDING_SIGNATURE', 'SIGNED', 'CANCELLED', 'LEGACY_UNVERIFIED']),
  inconsistent: z.boolean().nullable(), updatedAt: z.string(), contracts: z.array(contractSchema).nullable(),
});
export const pavilionOccupancySchema = z.object({
  projectId: z.string(), pavilionId: z.string(), observedAt: z.string().datetime({ offset: true }), contractsAccessible: z.boolean(),
  lots: z.array(z.object({ lotId: z.string(), entityId: z.string(), lotNumber: z.string().nullable(), status: z.string(), updatedAt: z.string().nullable(), associations: z.array(associationSchema) })),
});
export type PavilionOccupancy = z.infer<typeof pavilionOccupancySchema>;
export type OccupancyAssociation = z.infer<typeof associationSchema>;
export type OccupancyContract = z.infer<typeof contractSchema>;
export type OccupancyState = SaleItemContractState | 'PARTIAL' | 'MIXED' | 'REVIEW';
export interface OccupancyItem {
  lotId: string; entityId: string; number: string | null; status: CommercialStatus;
  association: OccupancyAssociation | null; state: OccupancyState;
}
export interface OccupancyOrder {
  id: string; saleId: string; orderId: string | null; items: OccupancyItem[];
  contracts: Array<OccupancyContract & { items: OccupancyItem[]; state: OccupancyState }>;
  state: OccupancyState;
}
export interface OccupancyGroup {
  id: string; marker: number; name: string; verified: boolean; state: OccupancyState;
  items: OccupancyItem[]; orders: OccupancyOrder[]; updatedAt: string | null;
  contractsAccessible: boolean;
}
export const OCCUPANCY_STATE_LABEL: Record<OccupancyState, string> = {
  SIGNED: 'Assinatura confirmada', PENDING_SIGNATURE: 'Aguardando assinatura', PARTIAL: 'Assinatura parcial',
  CANCELLED: 'Item cancelado', LEGACY_UNVERIFIED: 'Legado não verificado', REVIEW: 'Vínculo em conferência',
  MIXED: 'Situações distintas · conferir legado',
};
export function summarizeOccupancyState(items: readonly OccupancyItem[]): OccupancyState {
  const states = new Set(items.map(item => item.state));
  if (states.has('REVIEW')) return 'REVIEW';
  if (states.size === 1) return items[0].state;
  if (states.has('LEGACY_UNVERIFIED')) return 'MIXED';
  return 'PARTIAL';
}
const timestamp = (value: string | null) => value ? Date.parse(value) : null;
/** No annotation can be joined onto a different inventory revision. */
export function occupancyMatchesInventory(payload: PavilionOccupancy, lots: readonly CommercialLot[]) {
  if (payload.lots.length !== lots.length || new Set(payload.lots.map(l => l.lotId)).size !== lots.length) return false;
  const index = new Map(lots.map(lot => [lot.id, lot]));
  return payload.lots.every(row => {
    const lot = index.get(row.lotId);
    return lot && row.entityId === lot.entityId && row.status === lot.status && row.lotNumber === lot.lotNumber
      && timestamp(row.updatedAt) === timestamp(lot.updatedAt);
  });
}
/** Identity comes from persisted exhibitor/order IDs. Display names are never keys. */
export function buildPavilionOccupancyGroups(payload: Pick<PavilionOccupancy, 'lots' | 'contractsAccessible'>): OccupancyGroup[] {
  const groups = new Map<string, OccupancyGroup>();
  for (const row of payload.lots) {
    const salePhase = row.status === 'SOLD' || row.status === 'SALE_OPEN';
    if (!salePhase && row.associations.length === 0) continue;
    const a = row.associations.length === 1 ? row.associations[0] : null;
    const review = !salePhase || !a || a.inconsistent || !a.displayName?.trim() || a.contractState === 'CANCELLED'
      || (a.contractState === 'SIGNED' && (row.status !== 'SOLD' || a.saleStatus !== 'CONFIRMED'))
      || (a.contractState === 'PENDING_SIGNATURE' && (row.status !== 'SALE_OPEN' || a.saleStatus !== 'OPEN'))
      || (a.contractState === 'LEGACY_UNVERIFIED' && (row.status !== 'SOLD' || a.saleStatus !== 'CONFIRMED'))
      || (payload.contractsAccessible && ((a.contracts?.length ?? 0) > 1 || a.contracts?.some(c => !c.verified)));
    const id = review ? `review:${row.lotId}` : a.exhibitorId ? `exhibitor:${a.exhibitorId}` : a.orderId ? `order:${a.orderId}` : `sale:${a.saleId}`;
    const item: OccupancyItem = { lotId: row.lotId, entityId: row.entityId, number: row.lotNumber,
      status: row.status as CommercialStatus, association: review ? null : a, state: review ? 'REVIEW' : a.contractState };
    let group = groups.get(id);
    if (!group) {
      group = { id, marker: 0, name: review ? OCCUPANCY_STATE_LABEL.REVIEW : a.displayName!.trim(),
        verified: !review && Boolean(a.exhibitorId), state: item.state, items: [], orders: [], updatedAt: a?.updatedAt ?? row.updatedAt,
        contractsAccessible: payload.contractsAccessible };
      groups.set(id, group);
    }
    group.items.push(item);
    if (a?.updatedAt && (!group.updatedAt || timestamp(a.updatedAt)! > timestamp(group.updatedAt)!)) group.updatedAt = a.updatedAt;
    for (const contract of payload.contractsAccessible ? a?.contracts ?? [] : []) {
      if (!group.updatedAt || timestamp(contract.updatedAt)! > timestamp(group.updatedAt)!) group.updatedAt = contract.updatedAt;
    }
    if (!review && a) {
      let order = group.orders.find(order => order.id === (a.orderId ?? a.saleId));
      if (!order) { order = { id: a.orderId ?? a.saleId, saleId: a.saleId, orderId: a.orderId, items: [], contracts: [], state: item.state }; group.orders.push(order); }
      order.items.push(item);
      for (const contract of payload.contractsAccessible ? a.contracts ?? [] : []) {
        let linked = order.contracts.find(c => c.id === contract.id);
        if (!linked) { linked = { ...contract, items: [], state: item.state }; order.contracts.push(linked); }
        linked.items.push(item);
      }
    }
  }
  const result = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
  result.forEach((group, index) => {
    group.marker = index + 1;
    group.items.sort((a, b) => (a.number ?? '').localeCompare(b.number ?? '', 'pt-BR', { numeric: true }) || a.lotId.localeCompare(b.lotId));
    const names = new Set(group.items.map(item => item.association?.displayName?.trim()).filter(Boolean));
    if (names.size > 1) { group.name = OCCUPANCY_STATE_LABEL.REVIEW; group.items.forEach(item => { item.state = 'REVIEW'; }); }
    group.state = summarizeOccupancyState(group.items);
    group.orders.forEach(order => { order.state = summarizeOccupancyState(order.items); order.contracts.forEach(c => { c.state = summarizeOccupancyState(c.items); }); });
  });
  return result;
}
export function occupancyLotList(items: readonly OccupancyItem[], limit = Infinity) {
  const numbers = items.map(item => item.number ?? 'Sem número');
  return `Lotes ${numbers.slice(0, limit).join(', ')}${numbers.length > limit ? ` +${numbers.length - limit}` : ''}`;
}

export interface OccupancyVisualScope {
  id: string; group: OccupancyGroup; marker: string; label: string | null;
  kind: 'CONTRACT' | 'ORDER' | 'REVIEW'; items: OccupancyItem[];
}
/** Contract contours use only explicit authorized links. An unlinked order or
 * restricted reference is never presented as a proven contractual footprint. */
export function buildOccupancyVisualScopes(groups: readonly OccupancyGroup[]): OccupancyVisualScope[] {
  return groups.flatMap(group => {
    const scopes: Omit<OccupancyVisualScope, 'marker'>[] = [];
    for (const order of group.orders) {
      const assigned = new Set<string>();
      for (const contract of order.contracts) {
        const items = contract.items.filter(item => group.items.some(current => current.lotId === item.lotId));
        if (!items.length) continue;
        items.forEach(item => assigned.add(item.lotId));
        scopes.push({ id: `contract:${contract.id}`, group, kind: 'CONTRACT', label: `Contrato ${contract.number || 'sem número'}`, items });
      }
      const remaining = order.items.filter(item => !assigned.has(item.lotId) && group.items.some(current => current.lotId === item.lotId));
      if (remaining.length) scopes.push({ id: `order:${order.id}`, group, kind: 'ORDER', items: remaining,
        label: group.contractsAccessible ? 'Sem contrato vinculado' : 'Referências contratuais restritas' });
    }
    if (!scopes.length) scopes.push({ id: group.id, group, kind: 'REVIEW', items: group.items, label: null });
    scopes.sort((a, b) => a.id.localeCompare(b.id));
    return scopes.map((scope, index) => ({ ...scope,
      marker: scopes.length > 1 ? `${group.marker}${index < 26 ? String.fromCharCode(65 + index) : `.${index + 1}`}` : String(group.marker),
    }));
  });
}
