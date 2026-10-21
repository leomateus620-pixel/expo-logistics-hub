import { supabase } from "@/integrations/supabase/client";

export type CashflowBasis = "principal" | "charge";
export interface CashflowValues {
  scheduledCents: number;
  paidCents: number;
  outstandingCents: number;
  overdueCents: number;
}
export interface CashflowMonth {
  month: string;
  installments: number;
  analyticInstallments: number;
  principal: CashflowValues;
  charge: CashflowValues;
}
export interface SalesAnalytics {
  projectId: string;
  generation: string;
  generatedAt: string;
  referenceDate: string;
  months: CashflowMonth[];
  signature: {
    count: number;
    averageSeconds: number | null;
    exclusions: Record<string, number>;
  };
  reconciliation: {
    confirmedCents: number;
    coveredCents: number;
    undistributedCents: number;
    includedFeesCents: number;
    excludedFeesCents: number;
    undistributedOrders: number;
    unknownSaleValues: number;
    paidWithoutDate: number;
  };
  issues: {
    orderId: string;
    reason: string | null;
    partial: boolean;
    confirmedCents: number;
  }[];
  receiptsByOccurrence: {
    month: string;
    principalCents: number;
    chargeCents: number;
  }[];
  settlementModel: string;
}
export interface CashflowDetail {
  id: string;
  orderId: string;
  reference: string;
  number: number;
  dueDate: string;
  method: string;
  status: "PAID" | "PENDING";
  paidAt: string | null;
  principalCents: number;
  chargeCents: number;
  feesCents: number;
  analytic: boolean;
}
export interface SignatureDetail {
  order_id: string;
  reference: string;
  registered_at: string;
  completed_at: string;
  seconds: number;
}
export interface AnalyticsPage<T> {
  generation: string;
  total: number;
  rows: T[];
}

export function exactCents(raw: unknown): number {
  if (
    !((typeof raw === "string" && /^\d+$/.test(raw)) || typeof raw === "number")
  )
    throw Error("Valor monetário inválido.");
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0)
    throw Error("Valor monetário fora do limite seguro.");
  return n;
}
export const sumCents = (values: number[]) =>
  exactCents(values.reduce((a, b) => a + b, 0));
export const moneyCents = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    exactCents(value) / 100,
  );
export function monthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(year, m - 1, 15, 12));
}
export function signatureDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const minutes = Math.floor(seconds / 60),
    hours = Math.floor(minutes / 60),
    days = Math.floor(hours / 24);
  if (days)
    return `${days} ${days === 1 ? "dia" : "dias"}${hours % 24 ? ` e ${hours % 24} h` : ""}`;
  return hours
    ? `${hours} h${minutes % 60 ? ` e ${minutes % 60} min` : ""}`
    : `${minutes} min`;
}
export function totalsFor(
  months: CashflowMonth[],
  basis: CashflowBasis,
): CashflowValues {
  return Object.fromEntries(
    ["scheduledCents", "paidCents", "outstandingCents", "overdueCents"].map(
      (k) => [
        k,
        sumCents(months.map((m) => m[basis][k as keyof CashflowValues])),
      ],
    ),
  ) as unknown as CashflowValues;
}
export function parseSalesAnalytics(raw: SalesAnalytics): SalesAnalytics {
  if (!raw?.generation || !raw.projectId || !Array.isArray(raw.months))
    throw Error("Resumo comercial incompleto.");
  const months = raw.months.map((m) => {
    if (!/^\d{4}-\d{2}-01$/.test(m.month)) throw Error("Competência inválida.");
    const values = (v: CashflowValues) => {
      const x = Object.fromEntries(
        Object.entries(v).map(([k, n]) => [k, exactCents(n)]),
      ) as unknown as CashflowValues;
      if (
        x.scheduledCents !== sumCents([x.paidCents, x.outstandingCents]) ||
        x.overdueCents > x.outstandingCents
      )
        throw Error("Cronograma não conciliado.");
      return x;
    };
    return { ...m, principal: values(m.principal), charge: values(m.charge) };
  });
  if (new Set(months.map((m) => m.month)).size !== months.length)
    throw Error("Competência duplicada.");
  const reconciliation = Object.fromEntries(
    Object.entries(raw.reconciliation).map(([k, n]) => [k, exactCents(n)]),
  ) as unknown as SalesAnalytics["reconciliation"];
  if (
    reconciliation.confirmedCents !==
      sumCents([
        reconciliation.coveredCents,
        reconciliation.undistributedCents,
      ]) ||
    reconciliation.coveredCents !==
      totalsFor(months, "principal").scheduledCents
  )
    throw Error("Cobertura não conciliada.");
  const signature = {
    ...raw.signature,
    count: exactCents(raw.signature.count),
    averageSeconds:
      raw.signature.averageSeconds === null
        ? null
        : Number(raw.signature.averageSeconds),
  };
  if (
    (signature.count === 0) !== (signature.averageSeconds === null) ||
    (signature.averageSeconds !== null &&
      (!Number.isFinite(signature.averageSeconds) ||
        signature.averageSeconds < 0))
  )
    throw Error("Amostra de assinatura inválida.");
  return {
    ...raw,
    months,
    reconciliation,
    signature,
    issues: raw.issues.map((i) => ({
      ...i,
      confirmedCents: exactCents(i.confirmedCents),
    })),
    receiptsByOccurrence: raw.receiptsByOccurrence.map((r) => ({
      ...r,
      principalCents: exactCents(r.principalCents),
      chargeCents: exactCents(r.chargeCents),
    })),
  };
}
// RPC names are additive to generated Supabase types, updated after migration deployment.
const db = supabase as unknown as {
  rpc: (
    name: string,
    args: object,
  ) => {
    abortSignal: (
      signal: AbortSignal,
    ) => Promise<{
      data: unknown;
      error: { message: string; code?: string } | null;
    }>;
  };
};
async function rpc<T>(
  name: string,
  args: object,
  signal: AbortSignal,
): Promise<T> {
  const { data, error } = await db.rpc(name, args).abortSignal(signal);
  if (error) throw error;
  return data as T;
}
export const analyticsPermissionError = (e: unknown) =>
  /MAP_PERMISSION_DENIED|AUTH_REQUIRED|permission denied|JWT/i.test(
    (e as Error)?.message ?? "",
  ) || (e as { code?: string })?.code === "42501";
export const fetchSalesAnalytics = async (
  projectId: string,
  signal: AbortSignal,
) =>
  parseSalesAnalytics(
    await rpc<SalesAnalytics>(
      "commercial_sales_analytics_summary",
      { p_project_id: projectId },
      signal,
    ),
  );
export async function fetchCashflowMonth(
  projectId: string,
  month: string,
  generation: string,
  page: number,
  signal: AbortSignal,
): Promise<AnalyticsPage<CashflowDetail>> {
  const raw = await rpc<AnalyticsPage<CashflowDetail>>(
    "commercial_sales_cashflow_month",
    {
      p_project_id: projectId,
      p_month: month,
      p_generation: generation,
      p_limit: 20,
      p_offset: page * 20,
    },
    signal,
  );
  if (raw.generation !== generation) throw Error("ANALYTICS_CHANGED");
  return {
    ...raw,
    total: exactCents(raw.total),
    rows: raw.rows.map((r) => ({
      ...r,
      principalCents: exactCents(r.principalCents),
      chargeCents: exactCents(r.chargeCents),
      feesCents: exactCents(r.feesCents),
    })),
  };
}
export async function fetchSignatureDetails(
  projectId: string,
  generation: string,
  page: number,
  signal: AbortSignal,
): Promise<AnalyticsPage<SignatureDetail>> {
  const raw = await rpc<AnalyticsPage<SignatureDetail>>(
    "commercial_sales_signature_details",
    {
      p_project_id: projectId,
      p_generation: generation,
      p_limit: 20,
      p_offset: page * 20,
    },
    signal,
  );
  if (raw.generation !== generation) throw Error("ANALYTICS_CHANGED");
  return {
    ...raw,
    total: exactCents(raw.total),
    rows: raw.rows.map((r) => ({ ...r, seconds: Number(r.seconds) })),
  };
}
