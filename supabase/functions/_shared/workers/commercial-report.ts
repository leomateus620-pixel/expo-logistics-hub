import { z } from 'zod';
import { maskWorkerText } from './privacy.ts';

/** Shared semantic contract. Money is BRL cents; areas are persisted m². */
const id = z.string().uuid();
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const cents = count.nullable();
const area = z.number().finite().min(0).nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const commercialReportSpecSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  projectId: id,
  editionYear: z.number().int().min(2000).max(2200).optional(),
  scopes: z.array(z.object({ kind: z.enum(['pavilion', 'segment', 'block', 'lot']), id }).strict()).max(100).default([]),
  scopeSearch: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  geography: z.enum(['all', 'internal', 'external']).default('all'),
  saleStates: z.array(z.enum(['pending', 'signed', 'partial', 'legacy', 'cancelled'])).max(5).default([]),
  inventoryStates: z.array(z.enum(['AVAILABLE', 'BLOCKED', 'RESERVED', 'IN_NEGOTIATION', 'SALE_OPEN', 'SOLD', 'UNAVAILABLE'])).max(7).default([]),
  contractFilter: z.enum(['any', 'with_document', 'without_document']).default('any'),
  exhibitorIds: z.array(id).max(100).default([]),
  companySearch: z.string().trim().min(1).max(180).optional(),
  orderIds: z.array(id).max(100).default([]), contractIds: z.array(id).max(100).default([]),
  orderSearch: z.string().trim().min(1).max(160).optional(), contractSearch: z.string().trim().min(1).max(160).optional(),
  issuesOnly: z.boolean().default(false),
  documentStates: z.enum(['all', 'active', 'inactive']).default('all'),
  period: z.object({ from: date, to: date, basis: z.enum(['created', 'signed']) }).strict().optional(),
  comparisonPeriod: z.object({ from: date, to: date, basis: z.enum(['created', 'signed']) }).strict().optional(),
  reportFocus: z.enum(['sales', 'exhibitors', 'contracts', 'inventory']).default('sales'),
  documentFilter: z.enum(['any', 'multi_lot', 'with_prior_versions']).default('any'),
  minArea: z.number().finite().min(0).max(1e9).optional(),
  maxArea: z.number().finite().min(0).max(1e9).optional(),
  minValueCents: count.optional(), maxValueCents: count.optional(),
  missingArea: z.boolean().default(false), missingCompany: z.boolean().default(false),
  monetaryBasis: z.enum(['principal', 'principal_and_fees']).default('principal'),
  groupBy: z.enum(['scope', 'exhibitor', 'status', 'none']).default('scope'),
  sortBy: z.enum(['scope', 'exhibitor', 'area', 'value', 'created', 'signed', 'lots']).default('scope'),
  sortDirection: z.enum(['asc', 'desc']).default('asc'),
  sections: z.array(z.enum(['summary', 'sales', 'exhibitors', 'contracts', 'charts', 'plan_2d'])).max(6).default(['summary', 'sales', 'charts']),
  presentation: z.enum(['executive', 'detailed']).default('executive'),
}).strict();
export type CommercialReportSpec = z.infer<typeof commercialReportSpecSchema>;

export const COMMERCIAL_METRICS = {
  orders: { label: 'Pedidos distintos', unit: 'pedidos', definition: 'Identidades de pedidos/registro; um pedido parcial é contado uma vez no total.' },
  signedLots: { label: 'Com assinatura confirmada', unit: 'lotes', definition: 'Item SIGNED, assinatura datada e venda CONFIRMED não revertida.' },
  pendingLots: { label: 'Aguardando assinatura', unit: 'lotes', definition: 'Item PENDING_SIGNATURE e venda OPEN não revertida. Não representa recebimento.' },
  legacyLots: { label: 'Legado sem comprovação', unit: 'lotes', definition: 'LEGACY_UNVERIFIED ou venda anterior sem item. Mantém situação do mapa.' },
  soldMapLots: { label: 'Vendidos no mapa', unit: 'lotes', definition: 'Cadastro vigente SOLD; inclui legado, que não comprova assinatura.' },
  partialOrders: { label: 'Pedidos parcialmente assinados', unit: 'pedidos', definition: 'Pedido com itens SIGNED e PENDING_SIGNATURE em todo o pedido, antes do recorte.' },
  exhibitors: { label: 'Expositores distintos', unit: 'expositores', definition: 'exhibitor_id persistido. Identidade ausente não é fundida por nome; contagens por área não são aditivas.' },
  documents: { label: 'Documentos ativos', unit: 'documentos', definition: 'Identidade lógica ativa com versão ativa e ligação explícita ao lote; versões não são novos documentos. Documento não comprova assinatura.' },
  principalCents: { label: 'Principal negociado', unit: 'BRL_cents', definition: 'Soma em centavos dos snapshots de itens elegíveis. Não inclui taxas nem recebimentos; legado/inconsistências são discriminados.' },
  feesCents: { label: 'Taxas rateadas', unit: 'BRL_cents', definition: 'Rateio proporcional ao principal ativo do pedido, arredondado por piso e resíduo por item UUID. Somente pedidos conciliados.' },
  historicalArea: { label: 'Área negociada', unit: 'm²', definition: 'official_area_snapshot dos itens. Não substituída pela metragem atual do lote.' },
  currentArea: { label: 'Área atual', unit: 'm²', definition: 'official_area_sqm do cadastro vigente.' },
} as const;

export const commercialReportRowSchema = z.object({
  id, orderId: id.nullable(), saleId: id.nullable(), lotId: id, exhibitorId: id.nullable(),
  reference: z.string().max(160), displayName: z.string().max(300).nullable(), historicalDisplayName: z.string().max(300).nullable().default(null),
  lotLabel: z.string().max(300), historicalLotLabel: z.string().max(300).nullable(),
  lotNumber: z.string().max(120).nullable(), block: z.string().max(120).nullable(),
  pavilionId: id.nullable(), pavilionName: z.string().max(300).nullable(),
  segmentId: id.nullable(), segmentName: z.string().max(300).nullable(),
  category: z.enum(['internal', 'external', 'unclassified']),
  mapStatus: z.string().max(40), state: z.enum(['pending', 'signed', 'legacy', 'cancelled', 'inconsistent']),
  partialOrder: z.boolean(), historicalArea: area, currentArea: area,
  principalCents: cents, feesCents: cents, totalCents: cents,
  createdAt: z.string().datetime({ offset: true }), signedAt: z.string().datetime({ offset: true }).nullable(),
  documentCount: count.nullable(), contractIds: z.array(id).max(200).nullable(), issues: z.array(z.string().max(80)).max(20),
}).strict();
export const commercialReportInventorySchema = z.object({
  lotId: id, entityId: id, lotLabel: z.string().max(300), lotNumber: z.string().max(120).nullable(), block: z.string().max(120).nullable(),
  pavilionId: id.nullable(), pavilionName: z.string().max(300).nullable(), segmentId: id.nullable(), segmentName: z.string().max(300).nullable(),
  category: z.enum(['internal', 'external', 'unclassified']), status: z.string().max(40), currentArea: area,
  labelAnchor: z.array(z.number().finite()).length(2).nullable(),
  geometry: z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.array(z.number().finite()).min(2).max(3)).min(4).max(20000)).min(1).max(100) }).strict().nullable(),
  associations: z.array(z.object({ rowId: id, exhibitorId: id.nullable(), displayName: z.string().max(300).nullable(), state: z.string().max(40) }).strict()).max(100),
  issues: z.array(z.string().max(80)).max(20),
}).strict();
export const commercialReportContractSchema = z.object({
  id, reference: z.string().max(160).nullable(), scope: z.enum(['LOT', 'ORDER_ITEMS']), orderId: id.nullable(),
  lotIds: z.array(id).max(20000), active: z.boolean(), activeVersion: count, versionCount: count,
  orderCoverage: z.object({ totalLots: count, coveredLots: count, missingLotIds: z.array(id).max(100000), complete: z.boolean() }).strict().nullable().default(null),
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }),
}).strict();
export const commercialReportTotalsSchema = z.object({ orders: count, signedLots: count, pendingLots: count, legacyLots: count, cancelledItems: count, partialOrders: count,
    exhibitors: count, documents: count.nullable(), soldMapLots: count, availableLots: count, inventoryLots: count,
    principalCents: cents, signedPrincipalCents: cents, pendingPrincipalCents: cents, legacyPrincipalCents: cents, feesCents: cents, totalCents: cents,
    historicalArea: area, currentArea: area,
  }).strict();
export const commercialReportSnapshotSchema = z.object({
  schemaVersion: z.literal(1), snapshotId: id, generatedAt: z.string().datetime({ offset: true }), generation: z.string().regex(/^[a-f0-9]{32,64}$/),
  spec: commercialReportSpecSchema,
  scope: z.object({ projectId: id, projectName: z.string().max(300), editionYear: z.number().int().nullable(), timezone: z.literal('America/Sao_Paulo') }).strict(),
  totals: commercialReportTotalsSchema,
  comparison: z.object({ period: z.object({ from: date, to: date, basis: z.enum(['created', 'signed']) }).strict(), totals: commercialReportTotalsSchema }).strict().optional(),
  coverage: z.object({ complete: z.boolean(), excludedRows: count, issues: z.array(z.object({ code: z.string().max(80), count }).strict()).max(100) }).strict(),
  capabilities: z.object({ companyNames: z.boolean(), monetaryValues: z.boolean(), contractReferences: z.boolean() }).strict(),
  rows: z.array(commercialReportRowSchema).max(100000), inventory: z.array(commercialReportInventorySchema).max(100000),
  contracts: z.array(commercialReportContractSchema).max(100000),
  groups: z.array(z.object({ key: z.string().max(180), label: z.string().max(300), lots: count, orders: count, exhibitors: count, principalCents: cents, feesCents: cents, historicalArea: area }).strict()).max(100000),
  planOutlines: z.array(z.object({ id, label: z.string().max(300), kind: z.enum(['segment', 'block', 'pavilion', 'support']), lotIds: z.array(id).max(100000).default([]), geometry: z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.array(z.number().finite()).min(2).max(3)).min(4).max(20000)).min(1).max(100) }).strict() }).strict()).max(100000),
  calibration: z.object({ mapUnitsPerMeter: z.number().finite().positive(), status: z.literal('VALIDATED') }).strict().nullable(),
  notes: z.array(z.string().max(2000)).max(30),
}).strict();
export type CommercialReportSnapshot = z.infer<typeof commercialReportSnapshotSchema>;
export type CommercialReportRow = z.infer<typeof commercialReportRowSchema>;

export function parseCommercialReportSpec(value: unknown): CommercialReportSpec {
  const spec = commercialReportSpecSchema.parse(value);
  for (const period of [spec.period, spec.comparisonPeriod]) {
    if (!period) continue;
    const valid = (value: string) => new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
    if (!valid(period.from) || !valid(period.to) || period.from > period.to) throw new Error('Período inválido.');
  }
  if (spec.comparisonPeriod && (!spec.period || spec.period.basis !== spec.comparisonPeriod.basis)) throw new Error('Comparação exige períodos com a mesma base temporal.');
  if (spec.minArea !== undefined && spec.maxArea !== undefined && spec.minArea > spec.maxArea
    || spec.minValueCents !== undefined && spec.maxValueCents !== undefined && spec.minValueCents > spec.maxValueCents) throw new Error('Faixa inválida.');
  return spec;
}

/** Explicit report DTO allowlist follows the server's authorization decision. Global buyer privacy remains intact. */
export function parseCommercialReportSnapshot(value: unknown): CommercialReportSnapshot {
  const snapshot = commercialReportSnapshotSchema.parse(value);
  parseCommercialReportSpec(snapshot.spec);
  if (snapshot.spec.projectId !== snapshot.scope.projectId) throw new Error('Projeto divergente.');
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (!unique(snapshot.rows.map(row => row.id)) || !unique(snapshot.inventory.map(lot => lot.lotId)) || !unique(snapshot.contracts.map(contract => contract.id))) throw new Error('Identidades duplicadas.');
  const rowById = new Map(snapshot.rows.map(row => [row.id,row]));
  for (const lot of snapshot.inventory) for (const association of lot.associations) {
    const row = rowById.get(association.rowId);
    if (!row || row.lotId !== lot.lotId || row.exhibitorId !== association.exhibitorId) throw new Error('Associação de planta divergente.');
  }
  const sanitize = (name: string | null) => name === null ? null : maskWorkerText(name).slice(0, 300);
  for (const row of snapshot.rows) {
    row.displayName = snapshot.capabilities.companyNames ? sanitize(row.displayName) : null;
    row.historicalDisplayName = snapshot.capabilities.companyNames ? sanitize(row.historicalDisplayName) : null;
    if (!snapshot.capabilities.monetaryValues && [row.principalCents, row.feesCents, row.totalCents].some(n => n !== null)) throw new Error('Projeção monetária não autorizada.');
    if (!snapshot.capabilities.contractReferences && (row.documentCount !== null || row.contractIds !== null)) throw new Error('Projeção contratual não autorizada.');
  }
  for (const lot of snapshot.inventory) for (const association of lot.associations) association.displayName = snapshot.capabilities.companyNames ? sanitize(association.displayName) : null;
  if (!snapshot.capabilities.monetaryValues && ([snapshot.totals.principalCents, snapshot.totals.signedPrincipalCents, snapshot.totals.pendingPrincipalCents, snapshot.totals.legacyPrincipalCents, snapshot.totals.feesCents, snapshot.totals.totalCents].some(n => n !== null) || snapshot.groups.some(group => group.principalCents !== null || group.feesCents !== null))) throw new Error('Totais monetários não autorizados.');
  if (!snapshot.capabilities.monetaryValues && snapshot.comparison && [snapshot.comparison.totals.principalCents, snapshot.comparison.totals.signedPrincipalCents, snapshot.comparison.totals.pendingPrincipalCents, snapshot.comparison.totals.legacyPrincipalCents, snapshot.comparison.totals.feesCents, snapshot.comparison.totals.totalCents].some(n => n !== null)) throw new Error('Comparação monetária não autorizada.');
  if (!snapshot.capabilities.contractReferences && snapshot.comparison?.totals.documents != null) throw new Error('Comparação contratual não autorizada.');
  if (!snapshot.capabilities.contractReferences && snapshot.totals.documents !== null) throw new Error('Total de documentos não autorizado.');
  if (!snapshot.capabilities.contractReferences && snapshot.contracts.length) throw new Error('Contratos não autorizados.');
  return snapshot;
}

/** Exact cent allocation also documents the SQL policy. Invalid/missing margins stay unknown. */
export function allocateCommercialFees(items: readonly { id: string; principalCents: number }[], feesCents: number): Map<string, number> {
  if (!Number.isSafeInteger(feesCents) || feesCents < 0 || new Set(items.map(item => item.id)).size !== items.length
    || items.some(item => !Number.isSafeInteger(item.principalCents) || item.principalCents < 0)) throw new Error('Rateio inválido.');
  const ordered = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const total = ordered.reduce((sum, item) => sum + BigInt(item.principalCents), 0n);
  if (total <= 0n) throw new Error('Principal ausente para rateio.');
  const shares = ordered.map(item => BigInt(feesCents) * BigInt(item.principalCents) / total);
  let remainder = BigInt(feesCents) - shares.reduce((sum, n) => sum + n, 0n);
  return new Map(ordered.map((item, index) => [item.id, Number(shares[index] + (remainder-- > 0n ? 1n : 0n))]));
}
