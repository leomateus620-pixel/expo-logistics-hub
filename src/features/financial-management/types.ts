export type FinancialViewPath =
  | 'dashboard'
  | 'receitas-projetadas'
  | 'receitas-confirmadas'
  | 'despesas-previstas'
  | 'despesas-realizadas'
  | 'orcamento-comissoes'
  | 'patrocinios'
  | 'simulacoes'
  | 'relatorios';

export type FinancialSemanticStatus =
  | 'projected'
  | 'consolidated'
  | 'receivable'
  | 'realized'
  | 'partial'
  | 'unreported';

export type BudgetAttentionStatus =
  | 'normal'
  | 'attention'
  | 'near-limit'
  | 'over-budget'
  | 'no-budget-cap';

export type ExpenseCategory =
  | 'Pessoal e Equipes'
  | 'Infraestrutura e Obras'
  | 'Serviços Operacionais'
  | 'Marketing e Comunicação'
  | 'Eventos e Produção'
  | 'Alimentação e Hospitalidade'
  | 'Logística e Transporte'
  | 'Segurança'
  | 'Taxas, Seguros e Licenças'
  | 'Equipamentos e Materiais'
  | 'Investimentos'
  | 'Reservas'
  | 'Obrigações de Edições Anteriores'
  | 'Não classificado';

export type RevenueCategory =
  | 'Patrocínios'
  | 'Lei Rouanet'
  | 'Comercialização de pavilhões'
  | 'Exporural'
  | 'Área externa'
  | 'Gastronomia'
  | 'Bilheteria e estacionamento'
  | 'Rádio e mídia'
  | 'Eventos'
  | 'Outras receitas';

export type FundingType =
  | 'Recurso Livre'
  | 'Lei Rouanet'
  | 'Prefeitura / Plano de Trabalho'
  | 'Misto'
  | 'Não identificado';

export interface FinancialExpenseSourceRow {
  id: string;
  sourceRow: number;
  description: string;
  category: ExpenseCategory;
  value2025: number;
  value2026: number;
  realizedAmount: number;
  paidWithFreeResource: number;
  municipalityPlanAmount: number;
  rouanetAmount: number;
  paidMarkerAmount: number;
  observation?: string;
}

export interface CommissionBudgetSource {
  id: string;
  sourceStartRow: number;
  sourceLabel: string;
  commission: string;
  responsible?: string;
  budgetCap: number;
  budgetedAmount: number;
  expenses: FinancialExpenseSourceRow[];
}

export type GeneralBudgetItemKind = 'historical-obligation' | 'investment';

export interface GeneralBudgetItem {
  id: string;
  sourceRow: number;
  description: string;
  kind: GeneralBudgetItemKind;
  budgetCap: number;
  budgetedAmount: number;
  observation?: string;
}

export interface FinancialExpense extends FinancialExpenseSourceRow {
  commissionId: string;
  commission: string;
  commissionBudgetCap: number;
  commissionBudgetedAmount: number;
}

export interface CommissionBudget {
  id: string;
  sourceLabel: string;
  commission: string;
  responsible?: string;
  budgetCap: number;
  budgetedAmount: number;
  realizedAmount: number;
  remainingAmount: number;
  utilizationPercentage: number;
  status: BudgetAttentionStatus;
  expenseCount: number;
  expenses: FinancialExpense[];
}

export interface FinancialRevenue {
  id: string;
  sourceRow: number;
  source: string;
  ecosystem: 'sponsorship' | 'commercial';
  category: RevenueCategory;
  fundingType: FundingType;
  projectedAmount: number;
  consolidatedAmount: number;
  /** Campo A Receber informado na planilha; não é inferido da diferença de consolidação. */
  receivableAmount: number;
  projectedFreeResource: number;
  consolidatedFreeResource: number;
  projectedRouanet: number;
  consolidatedRouanet: number;
  receivedOn?: string | number;
  notes?: string;
}

export type SponsorTier =
  | 'Grão de Ouro'
  | 'Ouro'
  | 'Prata'
  | 'Bronze'
  | 'Soy Summit'
  | 'Outros Apoios'
  | 'Não classificado';

export interface Sponsor {
  id: string;
  sourceRow: number;
  name: string;
  tier: SponsorTier;
  vehicleCredentials: number;
  soySummitCredentials: number;
  declaredValue: number;
  projectedFreeResource: number;
  consolidatedFreeResource: number;
  receivableAmount: number;
  /** Texto preservado quando a célula A Receber não contém um valor numérico. */
  receivableNote?: string;
  projectedRouanet: number;
  consolidatedRouanet: number;
  receivedOn?: string | number;
  inKindContribution?: string | number;
  sourceQualityFlag?: {
    code: 'DATE_LIKE_VALUE_IN_CONTRIBUTION_COLUMN';
    cell: string;
    rawValue: number;
  };
}

export type ScenarioId = 'realistic' | 'pessimistic' | 'optimistic';

export interface FinancialScenario {
  id: ScenarioId;
  label: string;
  commercialization: number;
  exporural: number;
  externalArea: number;
  agroindustryPavilion: number;
  foodPoints: number;
  parking: number;
  commercialRevenue: number;
  freeSponsorship: number;
  rouanetSponsorship: number;
  totalRevenue: number;
  operatingExecution: number;
  historicalObligations: number;
  reserve: number;
  investmentCapacity: number;
  negativeResult: number;
}

export interface FinancialWorkbookTotals {
  coreCommissionBudgetCap: number;
  coreCommissionBudgeted: number;
  generalBudgetCap: number;
  generalBudgeted: number;
  projectedRevenue: number;
  consolidatedRevenue: number;
  sponsorshipProjected: number;
  sponsorshipConsolidated: number;
  sponsorshipReceivableReported: number;
  commercialReceivableReported: number;
  paidWithFreeResource: number;
  municipalityPlanAmount: number;
  rouanetAmount: number;
}

export interface FinancialReportDefinition {
  id: string;
  title: string;
  description: string;
  route: FinancialViewPath;
  insight: string;
}
