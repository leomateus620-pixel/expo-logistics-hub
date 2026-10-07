// Test-only synthetic records. No Supabase client, requests, or production writes.
export type { FinancialEdition, FinancialBudget, FinancialBudgetLine, FinancialRevenue, FinancialSponsorship, FinancialEditionSummary, FinancialEntity, FundingTypeKey, NegotiationStatus, RevenueStatus, SponsorTierKey } from '../../src/features/financial-management/operational/financialOperationalApi';
import type { FinancialEditionSummary } from '../../src/features/financial-management/operational/financialOperationalApi';
export const FUNDING_TYPE_LABELS = { recurso_livre: 'Recurso livre', lei_rouanet: 'Lei Rouanet', prefeitura_plano_trabalho: 'Prefeitura / Plano de Trabalho', misto: 'Misto', nao_identificado: 'Não identificado' };
export const SPONSOR_TIER_LABELS = { grao_de_ouro: 'Grão de Ouro', ouro: 'Ouro', prata: 'Prata', bronze: 'Bronze', soy_summit: 'Soy Summit', outros_apoios: 'Outros Apoios', nao_classificado: 'Não classificado' };
export const NEGOTIATION_LABELS = { prospeccao: 'Prospecção', negociacao: 'Em negociação', confirmado: 'Confirmado', cancelado: 'Cancelado' };
export const REVENUE_STATUS_LABELS = { projetada: 'Projetada', confirmada: 'Confirmada', cancelada: 'Cancelada' };
export class FinancialNotActivatedError extends Error { constructor() { super('O Financeiro 2028 ainda não foi ativado no backend.'); } }
const edition = { id: 'qa-edition-2028', org_id: 'qa-local-org', code: 2028, label: 'Fenasoja 2028', status: 'operacional' as const, period_start: '2027-01-01', period_end: '2028-12-31' };
const mode = () => new URLSearchParams(location.search).get('state') ?? 'rich';
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function read<T>(value: T): Promise<T> {
  await delay(mode() === 'loading' ? 15000 : 50);
  if (mode() === 'error') throw new Error('Falha de leitura sintética recuperável.');
  return value;
}
export const fetchEditions = async () => {
  if (mode() === 'inactive') throw new FinancialNotActivatedError();
  return read(mode() === 'denied' ? [] : [edition]);
};
export const QA_BUDGETS = [
  { id: 'qa-b1', commission_id: 'qa-c1', responsible_name: 'Responsável sintético A', budget_cap_cents: 25000000, notes: 'Observação sintética: detalhamento por linhas.', version: 4 },
  { id: 'qa-b2', commission_id: 'qa-c2', responsible_name: null, budget_cap_cents: null, notes: null, version: 2 },
  { id: 'qa-b3', commission_id: 'qa-c3', responsible_name: 'Responsável sintético C', budget_cap_cents: 0, notes: null, version: 1 },
].map((budget) => ({ ...budget, edition_id: edition.id, period_start: null, period_end: null, updated_at: '2026-10-06T12:00:00Z' }));
export const QA_LINES = [
  { id: 'qa-l1', budget_id: 'qa-b1', kind: 'operacional' as const, description: 'Linha sintética — montagem e acompanhamento', planned_cents: 18000001 },
  { id: 'qa-l2', budget_id: 'qa-b1', kind: 'investimento' as const, description: 'Linha sintética — investimento', planned_cents: 2000000 },
  { id: 'qa-l3', budget_id: 'qa-b2', kind: 'operacional' as const, description: 'Linha sintética sem teto definido', planned_cents: 5000000 },
  { id: 'qa-l4', budget_id: 'qa-b3', kind: 'obrigacao_anterior' as const, description: 'Linha sintética com teto zero', planned_cents: 200 },
].map((line) => ({ ...line, active: true, version: 1, notes: null }));
export const QA_REVENUES = [
  { id: 'qa-r1', description: 'Receita sintética Alpha — expectativa institucional', counterparty: 'Contraparte de teste A', funding_type: 'recurso_livre' as const, status: 'projetada' as const, projected_cents: 123456789, confirmed_cents: null, due_date: '2028-05-01' },
  { id: 'qa-r2', description: 'Receita sintética Beta — confirmação com centavos', counterparty: 'Contraparte de teste B', funding_type: 'lei_rouanet' as const, status: 'confirmada' as const, projected_cents: 5000001, confirmed_cents: 4500001, due_date: '2028-06-02' },
  { id: 'qa-r3', description: 'Receita sintética Zero — valor explícito', counterparty: null, funding_type: 'nao_identificado' as const, status: 'confirmada' as const, projected_cents: 0, confirmed_cents: 0, due_date: null },
  { id: 'qa-r4', description: 'Receita sintética cancelada', counterparty: null, funding_type: 'misto' as const, status: 'cancelada' as const, projected_cents: 250000, confirmed_cents: null, due_date: null },
].map((revenue) => ({ ...revenue, responsible_name: null, competence_date: null, notes: 'Registro exclusivamente sintético.', version: 3 }));
export const QA_SPONSORS = [
  { id: 'qa-s1', name: 'Patrocinador sintético Alpha', tier: 'ouro' as const, negotiation_status: 'confirmado' as const, declared_cents: 30000000, projected_free_cents: 10000000, projected_rouanet_cents: 20000000, confirmed_free_cents: 8000001, confirmed_rouanet_cents: 10000000, in_kind_description: 'Equipamentos e serviços de teste', in_kind_value_cents: 2000000 },
  { id: 'qa-s2', name: 'Patrocinador sintético Beta — nome institucional extenso', tier: 'prata' as const, negotiation_status: 'negociacao' as const, declared_cents: null, projected_free_cents: 7500010, projected_rouanet_cents: 0, confirmed_free_cents: 0, confirmed_rouanet_cents: 0, in_kind_description: null, in_kind_value_cents: null },
  { id: 'qa-s3', name: 'Patrocinador sintético Zero', tier: 'nao_classificado' as const, negotiation_status: 'prospeccao' as const, declared_cents: 0, projected_free_cents: 0, projected_rouanet_cents: 0, confirmed_free_cents: 0, confirmed_rouanet_cents: 0, in_kind_description: null, in_kind_value_cents: null },
].map((sponsor) => ({ ...sponsor, responsible_name: null, notes: null, version: 5 }));
export const fetchBudgets = () => read(mode() === 'empty' ? [] : QA_BUDGETS);
export const fetchBudgetLines = () => read(mode() === 'empty' ? [] : QA_LINES);
export const fetchRevenues = () => read(mode() === 'empty' ? [] : mode() === 'partial' ? Array.from({ length: 500 }, (_, i) => ({ ...QA_REVENUES[0], id: `qa-r-${i}`, description: `Receita sintética ${i + 1}` })) : QA_REVENUES);
export const fetchSponsorships = () => read(mode() === 'empty' ? [] : mode() === 'partial' ? Array.from({ length: 500 }, (_, i) => ({ ...QA_SPONSORS[0], id: `qa-s-${i}`, name: `Patrocinador sintético ${i + 1}` })) : QA_SPONSORS);
export const QA_SUMMARY: FinancialEditionSummary = {
  budget: { count: 3, cap_cents: 25000000, uncapped_count: 1, planned_cents: 25000201, line_count: 4, committed_cents: 20000000 },
  expenses: { count: 7, planned_cents: 25000201, committed_cents: 20000000, paid_cents: 15000000, payable_open_cents: 5000000, overdue_count: 1 },
  revenues: { projected_cents: 500000000, confirmed_cents: 400000000, received_cents: 300000000, receivable_open_cents: 100000000, overdue_count: 2 },
  revenue: { count: 604, projected_cents: 450000000, confirmed_cents: 350000000 },
  sponsorship: { count: 602, declared_cents: 60000000, projected_cents: 50000000, confirmed_cents: 50000000, in_kind_cents: 2000000 },
  obligations: { receivable_open_cents: 100000000, received_cents: 300000000, payable_open_cents: 5000000, paid_cents: 15000000, overdue_count: 3, inconsistent_count: 1 },
  movements: { count: 10, inflow_cents: 300000000, outflow_cents: 15000000 },
};
export const fetchEditionSummary = () => {
  const summary = structuredClone(QA_SUMMARY);
  if (mode() === 'empty') for (const values of Object.values(summary)) for (const key in values) values[key] = 0;
  if (mode() === 'negative') summary.budget.planned_cents = 100;
  if (mode() === 'unavailable') { delete summary.expenses; delete summary.revenues; }
  return read(summary);
};
type Save = { orgId: string; entity: string; payload: Record<string, unknown>; expectedVersion: number | null; requestId: string; reason?: string | null };
declare global { interface Window { __financialQaSaves: Save[]; __financialQaFailNext?: string; } }
window.__financialQaSaves = [];
export async function saveFinancialRecord(input: Save) {
  window.__financialQaSaves.push(structuredClone(input));
  await delay(350);
  const failure = window.__financialQaFailNext;
  delete window.__financialQaFailNext;
  if (failure) throw new Error(failure);
  return { id: input.payload.id ?? 'qa-local-created', version: (input.expectedVersion ?? 0) + 1 };
}
