import { supabase } from '@/integrations/supabase/client';

/**
 * Financeiro operacional por edição. Leituras diretas respeitam a RLS financeira;
 * toda gravação passa pelas RPCs transacionais (idempotentes, versionadas e auditadas).
 * As tabelas ainda não estão no tipo gerado enquanto a atualização do banco não for aplicada.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type EditionStatus = 'historico' | 'operacional';
export interface FinancialEdition { id: string; org_id: string; code: number; label: string; status: EditionStatus; period_start: string; period_end: string }

export type FundingTypeKey = 'recurso_livre' | 'lei_rouanet' | 'prefeitura_plano_trabalho' | 'misto' | 'nao_identificado';
export const FUNDING_TYPE_LABELS: Record<FundingTypeKey, string> = {
  recurso_livre: 'Recurso livre',
  lei_rouanet: 'Lei Rouanet',
  prefeitura_plano_trabalho: 'Prefeitura / Plano de Trabalho',
  misto: 'Misto',
  nao_identificado: 'Não identificado',
};
export type SponsorTierKey = 'grao_de_ouro' | 'ouro' | 'prata' | 'bronze' | 'soy_summit' | 'outros_apoios' | 'nao_classificado';
export const SPONSOR_TIER_LABELS: Record<SponsorTierKey, string> = {
  grao_de_ouro: 'Grão de Ouro', ouro: 'Ouro', prata: 'Prata', bronze: 'Bronze',
  soy_summit: 'Soy Summit', outros_apoios: 'Outros Apoios', nao_classificado: 'Não classificado',
};
export type NegotiationStatus = 'prospeccao' | 'negociacao' | 'confirmado' | 'cancelado';
export const NEGOTIATION_LABELS: Record<NegotiationStatus, string> = {
  prospeccao: 'Prospecção', negociacao: 'Em negociação', confirmado: 'Confirmado', cancelado: 'Cancelado',
};
export type RevenueStatus = 'projetada' | 'confirmada' | 'cancelada';
export const REVENUE_STATUS_LABELS: Record<RevenueStatus, string> = {
  projetada: 'Projetada', confirmada: 'Confirmada', cancelada: 'Cancelada',
};
/** Categorias de receita reaproveitadas de 2026 como classificação (sem valores). */
export const REVENUE_CATEGORY_SUGGESTIONS = [
  'Patrocínios', 'Lei Rouanet', 'Comercialização de pavilhões', 'Exporural', 'Área externa',
  'Gastronomia', 'Bilheteria e estacionamento', 'Rádio e mídia', 'Eventos', 'Outras receitas',
] as const;

export interface FinancialBudget {
  id: string; edition_id: string; commission_id: string; responsible_name: string | null;
  budget_cap_cents: number | null; period_start: string | null; period_end: string | null;
  notes: string | null; version: number; updated_at: string;
}
export interface FinancialBudgetLine {
  id: string; budget_id: string; kind: 'operacional' | 'obrigacao_anterior' | 'investimento';
  description: string; planned_cents: number; active: boolean; version: number; notes: string | null;
}
export interface FinancialRevenue {
  id: string; description: string; counterparty: string | null; responsible_name: string | null;
  funding_type: FundingTypeKey; status: RevenueStatus; projected_cents: number; confirmed_cents: number | null;
  competence_date: string | null; due_date: string | null; notes: string | null; version: number;
}
export interface FinancialSponsorship {
  id: string; name: string; tier: SponsorTierKey; negotiation_status: NegotiationStatus; responsible_name: string | null;
  declared_cents: number | null; projected_free_cents: number; projected_rouanet_cents: number;
  confirmed_free_cents: number; confirmed_rouanet_cents: number;
  in_kind_description: string | null; in_kind_value_cents: number | null; notes: string | null; version: number;
}
export interface FinancialEditionSummary {
  budget: { count: number; cap_cents: number; uncapped_count: number; planned_cents: number; line_count: number };
  revenue: { count: number; projected_cents: number; confirmed_cents: number };
  sponsorship: { count: number; declared_cents: number; projected_cents: number; confirmed_cents: number; in_kind_cents: number };
  obligations: { receivable_open_cents: number; received_cents: number; payable_open_cents: number; paid_cents: number; overdue_count: number };
  movements: { count: number; inflow_cents: number; outflow_cents: number };
}

/** Distingue "ainda não ativado no backend" de falhas reais. */
export class FinancialNotActivatedError extends Error {
  constructor() { super('O Financeiro 2028 ainda não foi ativado no backend.'); }
}

function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202'
    || /does not exist|could not find/i.test(error.message ?? '')));
}

const ERROR_MESSAGES: Array<[RegExp, string]> = [
  [/FINANCIAL_FORBIDDEN: financial_confirm/, 'Confirmar valores exige a permissão de confirmação financeira.'],
  [/FINANCIAL_FORBIDDEN: financial_settle/, 'Registrar recebimentos e pagamentos exige a permissão de tesouraria.'],
  [/FINANCIAL_FORBIDDEN/, 'Você não tem permissão para esta ação no Financeiro.'],
  [/FINANCIAL_EDITION_READ_ONLY/, 'Esta edição é histórica e somente leitura.'],
  [/FINANCIAL_CONFLICT/, 'O registro foi alterado por outra pessoa. Recarregue e tente novamente.'],
  [/FINANCIAL_REASON_REQUIRED/, 'Informe o motivo desta alteração.'],
  [/FINANCIAL_COMMISSION_INVALID/, 'Comissão inválida para esta organização.'],
  [/financial_budgets_edition_id_commission_id_key|duplicate key/, 'Já existe um registro igual nesta edição.'],
  [/FINANCIAL_OVER_SETTLEMENT/, 'O valor ultrapassa o saldo da obrigação.'],
  [/FINANCIAL_ALLOCATION_MISMATCH/, 'A soma das alocações precisa ser igual ao valor do movimento.'],
  [/check constraint|violates/, 'Algum valor informado é inválido.'],
];

export function describeFinancialError(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  return ERROR_MESSAGES.find(([pattern]) => pattern.test(message))?.[1] ?? 'Não foi possível concluir a operação. Tente novamente.';
}

async function read<T>(query: Promise<{ data: T | null; error: { code?: string; message?: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (isMissingSchema(error)) throw new FinancialNotActivatedError();
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

export const fetchEditions = (orgId: string) =>
  read<FinancialEdition[]>(db.from('financial_editions').select('*').eq('org_id', orgId).order('code'));

export const fetchBudgets = (editionId: string) =>
  read<FinancialBudget[]>(db.from('financial_budgets').select('*').eq('edition_id', editionId).order('created_at'));

export const fetchBudgetLines = (editionId: string) =>
  read<FinancialBudgetLine[]>(db.from('financial_budget_lines').select('*').eq('edition_id', editionId).order('created_at'));

export const fetchRevenues = (editionId: string) =>
  read<FinancialRevenue[]>(db.from('financial_revenues').select('*').eq('edition_id', editionId).order('created_at', { ascending: false }).limit(500));

export const fetchSponsorships = (editionId: string) =>
  read<FinancialSponsorship[]>(db.from('financial_sponsorships').select('*').eq('edition_id', editionId).order('name').limit(500));

/** Totais sempre vêm da agregação no servidor, nunca das listas paginadas. */
export async function fetchEditionSummary(orgId: string, editionId: string): Promise<FinancialEditionSummary> {
  const { data, error } = await db.rpc('financial_edition_summary', { _org_id: orgId, _edition_id: editionId });
  if (isMissingSchema(error)) throw new FinancialNotActivatedError();
  if (error) throw new Error(error.message);
  return data as FinancialEditionSummary;
}

export type FinancialEntity = 'budget' | 'budget_line' | 'revenue' | 'sponsorship';

export async function saveFinancialRecord(params: {
  orgId: string; entity: FinancialEntity; payload: Record<string, unknown>;
  expectedVersion: number | null; requestId: string; reason?: string | null;
}): Promise<Record<string, unknown>> {
  const { data, error } = await db.rpc('financial_save', {
    _org_id: params.orgId, _entity: params.entity, _payload: params.payload,
    _expected_version: params.expectedVersion, _request_id: params.requestId, _reason: params.reason ?? null,
  });
  if (isMissingSchema(error)) throw new FinancialNotActivatedError();
  if (error) throw new Error(describeFinancialError(error));
  return data as Record<string, unknown>;
}
