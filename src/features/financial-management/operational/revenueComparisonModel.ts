import {
  FUNDING_TYPE_LABELS, RECEIVABLE_SETTLEMENTS_LIMIT,
  type FinancialEditionSummary, type FinancialReceivableSettlement, type FinancialRevenue, type FinancialSponsorship, type FundingTypeKey,
} from './financialOperationalApi';

/** Centavos inteiros. Projetado e realizado usam as mesmas chaves para manter a identidade das categorias. */
export type RevenueCategoryKey = 'patrocinios' | `receita:${FundingTypeKey}` | 'receita:fora_do_recorte' | 'comercializacao' | 'avulsos';
export interface RevenueCategoryItem { key: RevenueCategoryKey; label: string; value: number }
export interface RevenueScale { negative: number; positive: number }

const FUNDING_KEYS = Object.keys(FUNDING_TYPE_LABELS) as FundingTypeKey[];
export const REVENUE_CATEGORY_ORDER: readonly RevenueCategoryKey[] = [
  'patrocinios', ...FUNDING_KEYS.map((key) => `receita:${key}` as const), 'receita:fora_do_recorte', 'comercializacao', 'avulsos',
];
const LABELS: Record<RevenueCategoryKey, string> = {
  patrocinios: 'Patrocínios',
  ...Object.fromEntries(FUNDING_KEYS.map((key) => [`receita:${key}`, `Receitas · ${FUNDING_TYPE_LABELS[key]}`])) as Record<`receita:${FundingTypeKey}`, string>,
  'receita:fora_do_recorte': 'Receitas · origem fora do recorte',
  comercializacao: 'Comercialização · parcelas vinculadas',
  avulsos: 'Recebimentos avulsos',
};

const sortItems = (values: Map<RevenueCategoryKey, number>): RevenueCategoryItem[] =>
  [...values].map(([key, value]) => ({ key, label: LABELS[key], value }))
    .sort((a, b) => b.value - a.value || REVENUE_CATEGORY_ORDER.indexOf(a.key) - REVENUE_CATEGORY_ORDER.indexOf(b.key));
const sum = (items: readonly RevenueCategoryItem[]) => items.reduce((total, item) => total + item.value, 0);

/** Lists are complete only when they hold every record counted by the server summary. */
export function listCompleteness(loaded: number, serverCount: number | undefined, limit: number): boolean {
  return serverCount == null ? loaded < limit : loaded >= serverCount;
}

export interface ProjectedRevenueSide {
  items: RevenueCategoryItem[]; total: number;
  rouanet: number; complete: boolean;
}

/** Cancelled records stay out, matching `financial_edition_summary`. Sponsorship Rouanet is an explicit field, never a share. */
export function buildProjectedSide(revenues: readonly FinancialRevenue[], sponsorships: readonly FinancialSponsorship[], summary: FinancialEditionSummary | null): ProjectedRevenueSide {
  const values = new Map<RevenueCategoryKey, number>([['patrocinios', 0], ...FUNDING_KEYS.map((key) => [`receita:${key}`, 0] as [RevenueCategoryKey, number])]);
  let rouanet = 0;
  for (const row of revenues) {
    if (row.status === 'cancelada') continue;
    const key = `receita:${row.funding_type}` as const;
    values.set(key, (values.get(key) ?? 0) + row.projected_cents);
    if (row.funding_type === 'lei_rouanet') rouanet += row.projected_cents;
  }
  for (const row of sponsorships) {
    if (row.negotiation_status === 'cancelado') continue;
    values.set('patrocinios', values.get('patrocinios')! + row.projected_free_cents + row.projected_rouanet_cents);
    rouanet += row.projected_rouanet_cents;
  }
  const items = sortItems(values);
  return {
    items, total: sum(items), rouanet,
    complete: listCompleteness(revenues.length, summary?.revenue.count, 500) && listCompleteness(sponsorships.length, summary?.sponsorship.count, 500),
  };
}

export interface RealizedRevenueSide {
  items: RevenueCategoryItem[]; total: number;
  rouanet: number; rouanetUnattributed: number; commercial: number;
  /** Net settled per manual revenue; absent ids have no receivable obligation in the loaded set. */
  receivedByRevenue: ReadonlyMap<string, number>;
  complete: boolean;
}

/**
 * Every settled cent lands in exactly one category, so the ranking sums to the received total.
 * Mixed sponsorship receipts are not split between free and Rouanet resources.
 */
export function buildRealizedSide(
  receivables: readonly FinancialReceivableSettlement[], revenues: readonly FinancialRevenue[],
  sponsorships: readonly FinancialSponsorship[], summary: FinancialEditionSummary | null,
): RealizedRevenueSide {
  const revenueById = new Map(revenues.map((row) => [row.id, row]));
  const sponsorById = new Map(sponsorships.map((row) => [row.id, row]));
  const values = new Map<RevenueCategoryKey, number>([
    ['patrocinios', 0], ...FUNDING_KEYS.map((key) => [`receita:${key}`, 0] as [RevenueCategoryKey, number]), ['comercializacao', 0], ['avulsos', 0],
  ]);
  const receivedByRevenue = new Map<string, number>();
  let rouanet = 0;
  let rouanetUnattributed = 0;
  const add = (key: RevenueCategoryKey, value: number) => values.set(key, (values.get(key) ?? 0) + value);
  for (const row of receivables) {
    const settled = row.settled_cents;
    if (row.source_type === 'receita') {
      const revenue = row.source_id ? revenueById.get(row.source_id) : undefined;
      if (row.source_id) receivedByRevenue.set(row.source_id, (receivedByRevenue.get(row.source_id) ?? 0) + settled);
      if (!revenue) { add('receita:fora_do_recorte', settled); rouanetUnattributed += settled; continue; }
      add(`receita:${revenue.funding_type}`, settled);
      if (revenue.funding_type === 'lei_rouanet') rouanet += settled;
    } else if (row.source_type === 'patrocinio') {
      add('patrocinios', settled);
      const sponsor = row.source_id ? sponsorById.get(row.source_id) : undefined;
      if (sponsor && sponsor.confirmed_rouanet_cents > 0 && sponsor.confirmed_free_cents === 0) rouanet += settled;
      else if (!sponsor || sponsor.confirmed_free_cents === 0 || sponsor.confirmed_rouanet_cents > 0) rouanetUnattributed += settled;
    } else if (row.source_type === 'parcela_comercial') add('comercializacao', settled);
    else add('avulsos', settled);
  }
  if (!values.get('receita:fora_do_recorte')) values.delete('receita:fora_do_recorte');
  const items = sortItems(values);
  const total = sum(items);
  const serverReceived = summary ? summary.revenues?.received_cents ?? summary.obligations.received_cents : null;
  return {
    items, total, rouanet, rouanetUnattributed, commercial: values.get('comercializacao')!, receivedByRevenue,
    complete: serverReceived == null ? receivables.length < RECEIVABLE_SETTLEMENTS_LIMIT : total === serverReceived,
  };
}

/** One signed axis for both rankings: equal amounts draw equal bars on either side. */
export function sharedScale(...sides: ReadonlyArray<readonly RevenueCategoryItem[] | null>): RevenueScale {
  const values = sides.flatMap((items) => items?.map((item) => item.value) ?? []);
  return { negative: Math.min(0, ...values), positive: Math.max(0, ...values) };
}
