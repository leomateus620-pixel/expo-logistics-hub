import { z } from "zod";

export const revenueKeys = [
  "pavilion_ics",
  "automotive",
  "exporural",
  "external_ics",
  "agroindustry",
  "food_points",
  "parking",
  "sponsorship_free",
  "sponsorship_rouanet",
] as const;
export type RevenueKey = (typeof revenueKeys)[number];
export type CategoryKey = RevenueKey | "other_revenue" | "operating_execution";
export type TargetKey =
  | RevenueKey
  | "operating_execution"
  | "cash_reserve"
  | "investment_capacity"
  | "operating_subtotal"
  | "revenue_total";
export type ScenarioKey = "pessimistic" | "realistic" | "optimistic";
export type ScenarioBasis = "portfolio" | "confirmed" | "cash";
export const basisLabels: Record<ScenarioBasis, string> = {
  portfolio: "Carteira: confirmadas + em andamento",
  confirmed: "Confirmado",
  cash: "Caixa financeiro registrado",
};
export const currentLabels: Record<ScenarioBasis, string> = {
  portfolio: "Atual em carteira",
  confirmed: "Confirmado",
  cash: "Recebido",
};
export const scenarioLabels: Record<ScenarioKey, string> = {
  pessimistic: "Pessimista",
  realistic: "Realista",
  optimistic: "Otimista",
};
export const categoryLabels: Record<CategoryKey | TargetKey, string> = {
  pavilion_ics: "Pavilhões ICS",
  automotive: "Espaço do Automóvel",
  exporural: "ExpoRural",
  external_ics: "Área Externa ICS",
  agroindustry: "Pavilhão Agroindústrias",
  food_points: "Pontos de Alimentação",
  parking: "Estacionamento",
  sponsorship_free: "Patrocínios · recursos livres",
  sponsorship_rouanet: "Patrocínios · Rouanet",
  other_revenue: "Outras receitas sem meta",
  operating_execution: "Execução Feira 2028",
  cash_reserve: "Reserva de caixa",
  investment_capacity: "Capacidade de investimentos",
  operating_subtotal: "Comercialização e operação",
  revenue_total: "Total de receitas",
};
// Strings remain JSON-safe in the shared query cache. Only pure calculations convert them to bigint.
export const centsSchema = z
  .string()
  .regex(/^-?\d+$/)
  .refine(
    (v) => BigInt(v) <= 9007199254740991n && BigInt(v) >= -9007199254740991n,
    "Valor fora do limite seguro",
  );
const nonnegativeCentsSchema = centsSchema.refine((v) => BigInt(v) >= 0n);
const targetShape = Object.fromEntries(
  [
    ...revenueKeys,
    "operating_execution",
    "cash_reserve",
    "investment_capacity",
    "operating_subtotal",
    "revenue_total",
  ].map((k) => [k, nonnegativeCentsSchema]),
) as Record<TargetKey, typeof nonnegativeCentsSchema>;
const compositionSchema = z.object({
  source: z.string(),
  stage: z.string(),
  principalCents: centsSchema,
  feesCents: centsSchema,
  issue: z.string().nullable(),
  count: z.number().optional(),
});
const categorySchema = z.object({
  principalCents: centsSchema,
  feesCents: centsSchema,
  amountCents: centsSchema,
  commercialPortfolioCents: centsSchema,
  commercialConfirmedCents: centsSchema,
  count: z.number().int().nonnegative(),
  coverageComplete: z.boolean(),
  status: z.enum(["ready", "empty", "future", "incomplete"]),
  composition: z.array(compositionSchema),
});
const categoryShape = Object.fromEntries(
  [...revenueKeys, "other_revenue", "operating_execution"].map((k) => [
    k,
    categorySchema,
  ]),
) as Record<CategoryKey, typeof categorySchema>;
export const scenarioSchema = z.object({
  key: z.enum(["pessimistic", "realistic", "optimistic"]),
  version: z.number().int().positive(),
  referenceKey: z.string(),
  targets: z.object(targetShape),
  provenance: z.object({
    source: z.string(),
    referenceDate: z.string(),
    originalReserveLabel: z.string(),
    negativeCents: centsSchema.nullable(),
    issues: z.array(
      z.object({
        code: z.string(),
        message: z.string(),
        differenceCents: centsSchema.nullable(),
      }),
    ),
  }),
});
export const observationSchema = z.object({
  date: z.string(),
  revenueCents: centsSchema,
  expenseCents: centsSchema,
  categories: z.record(categorySchema),
  coverageComplete: z.boolean(),
});
export const overviewSchema = z.object({
  schemaVersion: z.literal(2),
  orgId: z.string().uuid(),
  editionId: z.string().uuid(),
  projectId: z.string().uuid(),
  basis: z.enum(["portfolio", "confirmed", "cash"]),
  generatedAt: z.string(),
  generation: z.string(),
  calculationVersion: z.string(),
  currentByCategory: z.object(categoryShape),
  totals: z.object({
    revenueCents: centsSchema,
    expenseCents: centsSchema,
    balanceBeforeReserveCents: centsSchema,
    unclassifiedCents: centsSchema,
    otherRevenueCents: centsSchema,
    operatingRevenueCents: centsSchema,
    sponsorshipFreeCents: centsSchema,
    sponsorshipRouanetCents: centsSchema,
  }),
  sourceCoverage: z.array(
    z.object({
      source: z.string(),
      issue: z.string().nullable(),
      count: z.number(),
      amountCents: centsSchema,
      lastChangedAt: z.string().nullable(),
    }),
  ),
  coverage: z.object({
    complete: z.boolean(),
    issueCount: z.number(),
    unreconciledCommercialPayments: z.number(),
    cashScope: z.literal("FINANCIAL_ALLOCATIONS_ONLY"),
    openingBalanceCents: centsSchema.nullable(),
    otherRevenuePolicy: z.literal("INCLUDED_SEPARATELY"),
    futureSources: z.array(z.string()),
    historyCollection: z.string(),
    feePolicy: z.string(),
  }),
  scenarios: z
    .array(scenarioSchema)
    .length(3)
    .refine(
      (s) => new Set(s.map((x) => x.key)).size === 3,
      "Cenários duplicados",
    ),
  history: z.array(observationSchema),
});
export type ScenarioOverview = z.infer<typeof overviewSchema>;
export type ScenarioReference = z.infer<typeof scenarioSchema>;
export type ScenarioCategory = z.infer<typeof categorySchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Forecast =
  | {
      state: "achieved" | "insufficient_history" | "insufficient_rate";
      reason: string;
      windowDays: number;
      observedDays: number;
    }
  | {
      state: "estimated";
      days: number;
      estimatedOn: string;
      dailyCents: string;
      windowDays: number;
      observedDays: number;
      confidence: "Ritmo estável" | "Ritmo variável";
      partial: boolean;
    };
