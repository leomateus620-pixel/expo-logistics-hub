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
  contractsAccessible: boolean; issues: string[];
}
export const OCCUPANCY_STATE_LABEL: Record<OccupancyState, string> = {
  SIGNED: 'Assinatura confirmada', PENDING_SIGNATURE: 'Aguardando assinatura', PARTIAL: 'Assinatura parcial',
  CANCELLED: 'Item cancelado', LEGACY_UNVERIFIED: 'Legado não verificado', REVIEW: 'Vínculo em conferência',
  MIXED: 'Situações distintas · conferir legado',
};
export function summarizeOccupancyState(items: readonly OccupancyItem[]): OccupancyState {
  const states = new Set(items.map(item => item.state));
  if (states.has('REVIEW')) return 'REVIEW';
  if (!items.length) return 'REVIEW';
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
const compareItems = (a: OccupancyItem, b: OccupancyItem) =>
  (a.number ?? '').localeCompare(b.number ?? '', 'pt-BR', { numeric: true }) || a.lotId.localeCompare(b.lotId);
const uniqueItems = (items: readonly OccupancyItem[]) => [...new Map(items.map(item => [item.lotId, item])).values()].sort(compareItems);
function uniqueContracts(contracts: readonly OccupancyContract[]) {
  const byId = new Map<string, OccupancyContract>();
  for (const contract of [...contracts].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))) {
    const previous = byId.get(contract.id);
    byId.set(contract.id, { ...contract, verified: contract.verified && (!previous || previous.verified
      && previous.scope === contract.scope && previous.number === contract.number) });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Pure pavilion-scoped commercial composition. Geometry and documents never
 * establish identity. Repeated rows are deduplicated; contradictory rows fail
 * closed. Multiple explicit documents are relationships, not duplicate buyers. */
export function buildPavilionOccupancyGroups(payload: Pick<PavilionOccupancy, 'lots' | 'contractsAccessible'>): OccupancyGroup[] {
  const groups = new Map<string, OccupancyGroup>();
  const rows = new Map<string, PavilionOccupancy['lots'][number]>();
  const duplicateConflicts = new Set<string>();
  for (const row of payload.lots) {
    const normalized = { ...row, associations: row.associations.map(a => ({ ...a,
      contracts: payload.contractsAccessible && a.contracts ? uniqueContracts(a.contracts) : null,
    })).sort((a, b) => a.saleId.localeCompare(b.saleId) || (a.itemId ?? '').localeCompare(b.itemId ?? '')) };
    const previous = rows.get(row.lotId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(normalized)) {
      duplicateConflicts.add(row.lotId);
      if (JSON.stringify(normalized) < JSON.stringify(previous)) rows.set(row.lotId, normalized);
    } else rows.set(row.lotId, normalized);
  }
  for (const row of [...rows.values()].sort((a, b) => a.lotId.localeCompare(b.lotId))) {
    const salePhase = row.status === 'SOLD' || row.status === 'SALE_OPEN';
    if (!salePhase && row.associations.length === 0) continue;
    const a = row.associations.length === 1 ? row.associations[0] : null;
    const review = duplicateConflicts.has(row.lotId) || !salePhase || !a || a.inconsistent || !a.displayName?.trim() || a.contractState === 'CANCELLED'
      || (a.contractState === 'SIGNED' && (row.status !== 'SOLD' || a.saleStatus !== 'CONFIRMED'))
      || (a.contractState === 'PENDING_SIGNATURE' && (row.status !== 'SALE_OPEN' || a.saleStatus !== 'OPEN'))
      || (a.contractState === 'LEGACY_UNVERIFIED' && (row.status !== 'SOLD' || a.saleStatus !== 'CONFIRMED'));
    const id = review ? `review:${row.lotId}` : a.exhibitorId ? `exhibitor:${a.exhibitorId}` : a.orderId ? `order:${a.orderId}` : `sale:${a.saleId}`;
    const item: OccupancyItem = { lotId: row.lotId, entityId: row.entityId, number: row.lotNumber,
      status: row.status as CommercialStatus, association: review ? null : a, state: review ? 'REVIEW' : a.contractState };
    let group = groups.get(id);
    if (!group) {
      group = { id, marker: 0, name: review ? OCCUPANCY_STATE_LABEL.REVIEW : a.displayName!.trim(),
        verified: !review && Boolean(a.exhibitorId), state: item.state, items: [], orders: [], updatedAt: a?.updatedAt ?? row.updatedAt,
        contractsAccessible: payload.contractsAccessible, issues: review ? ['Associação comercial inconsistente; conferir o registro de origem.'] : [] };
      groups.set(id, group);
    }
    group.items.push(item);
    if (a?.updatedAt && (!group.updatedAt || timestamp(a.updatedAt)! > timestamp(group.updatedAt)!)) group.updatedAt = a.updatedAt;
    if (!review && a) {
      let order = group.orders.find(order => order.id === (a.orderId ?? a.saleId));
      if (!order) { order = { id: a.orderId ?? a.saleId, saleId: a.saleId, orderId: a.orderId, items: [], contracts: [], state: item.state }; group.orders.push(order); }
      order.items.push(item);
      for (const contract of a.contracts ?? []) {
        if (!group.updatedAt || timestamp(contract.updatedAt)! > timestamp(group.updatedAt)!) group.updatedAt = contract.updatedAt;
        let linked = order.contracts.find(c => c.id === contract.id);
        if (!linked) { linked = { ...contract, items: [], state: item.state }; order.contracts.push(linked); }
        if (linked.scope !== contract.scope || linked.number !== contract.number) linked.verified = false;
        linked.verified = linked.verified && contract.verified;
        linked.items.push(item);
        if (!linked.verified) group.issues.push('Documento com abrangência não verificada; conferir o vínculo contratual.');
      }
    }
  }
  for (const group of groups.values()) {
    group.items = uniqueItems(group.items);
    const names = [...new Set(group.items.map(item => item.association?.displayName?.trim()).filter((name): name is string => Boolean(name)))];
    // A persisted exhibitor can change its name between orders. Keep its identity
    // and signature states; show the latest persisted display name and the discrepancy.
    if (names.length > 1) {
      const latest = [...group.items].sort((a, b) => (timestamp(b.association?.updatedAt ?? null) ?? 0) - (timestamp(a.association?.updatedAt ?? null) ?? 0)
        || a.lotId.localeCompare(b.lotId))[0];
      group.name = group.verified ? latest.association!.displayName!.trim() : OCCUPANCY_STATE_LABEL.REVIEW;
      group.issues.push('Nomes comerciais distintos nos registros de origem: ' + names.sort().join(' / '));
      if (!group.verified) group.items.forEach(item => { item.state = 'REVIEW'; });
    }
    const documentOrders = new Map<string, OccupancyOrder['contracts'][number]>();
    for (const order of group.orders) for (const contract of order.contracts) {
      const previous = documentOrders.get(contract.id);
      if (previous) {
        previous.verified = false; contract.verified = false;
        group.issues.push('Mesmo documento associado a pedidos distintos; conferir a abrangência contratual.');
      } else documentOrders.set(contract.id, contract);
    }
    group.issues = [...new Set(group.issues)].sort();
    group.state = summarizeOccupancyState(group.items);
    group.orders.sort((a, b) => a.id.localeCompare(b.id)).forEach(order => {
      order.items = uniqueItems(order.items); order.state = summarizeOccupancyState(order.items);
      order.contracts.sort((a, b) => a.id.localeCompare(b.id)).forEach(contract => {
        contract.items = uniqueItems(contract.items);
        contract.state = contract.verified ? summarizeOccupancyState(contract.items) : 'REVIEW';
      });
    });
  }
  const result = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
  result.forEach((group, index) => { group.marker = index + 1; });
  return result;
}
export function occupancyLotList(items: readonly OccupancyItem[], limit = Infinity) {
  const numbers = items.map(item => item.number ?? 'Sem número');
  return `Lotes ${numbers.slice(0, limit).join(', ')}${numbers.length > limit ? ` +${numbers.length - limit}` : ''}`;
}

export interface OccupancyContractScope {
  id: string; group: OccupancyGroup; label: string | null; verified: boolean;
  kind: 'CONTRACT' | 'ORDER' | 'REVIEW'; items: OccupancyItem[];
}
/** Secondary inspection scopes only. Never used to split company labels or
 * contours. Membership comes exclusively from authorized persisted links. */
export function buildOccupancyContractScopes(groups: readonly OccupancyGroup[]): OccupancyContractScope[] {
  return groups.flatMap(group => {
    const scopes = new Map<string, OccupancyContractScope>();
    const memberIds = new Set(group.items.map(item => item.lotId));
    for (const order of group.orders) {
      const assigned = new Set<string>();
      for (const contract of order.contracts) {
        const items = contract.items.filter(item => memberIds.has(item.lotId));
        if (!items.length) continue;
        items.forEach(item => assigned.add(item.lotId));
        const id = `contract:${contract.id}`, previous = scopes.get(id);
        scopes.set(id, { id, group, kind: 'CONTRACT', label: `Contrato ${contract.number || 'sem número'}`,
          verified: contract.verified && (previous?.verified ?? true), items: uniqueItems([...(previous?.items ?? []), ...items]) });
      }
      const remaining = order.items.filter(item => !assigned.has(item.lotId) && memberIds.has(item.lotId));
      if (remaining.length) scopes.set(`order:${order.id}`, { id: `order:${order.id}`, group, kind: 'ORDER', verified: false, items: remaining,
        label: group.contractsAccessible ? 'Sem contrato vinculado' : 'Referências contratuais restritas' });
    }
    if (!scopes.size) scopes.set(group.id, { id: group.id, group, kind: 'REVIEW', verified: false, items: group.items, label: null });
    return [...scopes.values()].sort((a, b) => a.id.localeCompare(b.id));
  });
}

/** Contract inspection cannot narrow or replace the primary company selection. */
export function resolvePavilionOccupancySelection(groups: readonly OccupancyGroup[], companyId: string | null,
  entityId: string | null, contractScopeId: string | null) {
  const company = (entityId ? groups.find(group => group.items.some(item => item.entityId === entityId)) : groups.find(group => group.id === companyId)) ?? null;
  const scopes = company ? buildOccupancyContractScopes([company]) : [];
  const contract = scopes.find(scope => scope.kind === 'CONTRACT' && scope.id === contractScopeId) ?? null;
  return { company, contract };
}

/** Compact consecutive official numbers without inventing missing membership. */
export function occupancyLotSummary(items: readonly OccupancyItem[]) {
  const numbers = items.map(item => item.number);
  const consecutive = numbers.length > 1 && numbers.every((number, i) => number !== null && /^\d+$/u.test(number)
    && (!i || Number(number) === Number(numbers[i - 1]) + 1));
  return `${items.length} ${items.length === 1 ? 'lote' : 'lotes'} · ${consecutive ? `${numbers[0]} a ${numbers[numbers.length - 1]}` : numbers.map(n => n ?? 'Sem número').join(', ')}`;
}
