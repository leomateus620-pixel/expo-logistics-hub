import {
  revenueKeys,
  type Forecast,
  type Observation,
  type ScenarioOverview,
  type ScenarioReference,
} from "./financialScenariosTypes";

const max = (a: bigint, b = 0n) => (a > b ? a : b);
const min = (a: bigint, b: bigint) => (a < b ? a : b);
export function money(cents: bigint | string): string {
  const value = BigInt(cents),
    abs = value < 0n ? -value : value;
  return `${value < 0n ? "−" : ""}R$ ${(abs / 100n).toLocaleString("pt-BR")},${(abs % 100n).toString().padStart(2, "0")}`;
}
export function percentageText(value: number | null) {
  return value == null
    ? "—"
    : `${value.toLocaleString("pt-BR", { maximumFractionDigits: value > 99.9 && value < 100.1 ? 2 : 1 })}%`;
}
export function progress(current: bigint, target: bigint) {
  if (target < 0n) throw Error("Meta inválida");
  const percentage =
    target === 0n ? null : Number((current * 10000n) / target) / 100;
  return {
    current,
    target,
    percentage,
    width: percentage == null ? 0 : Math.min(100, Math.max(0, percentage)),
    missing: max(target - current),
    excess: max(current - target),
    achieved: target > 0n && current >= target,
  };
}
export function scenarioBalances(
  revenue: bigint,
  expense: bigint,
  reserve: bigint,
) {
  const balance = revenue - expense;
  return {
    balance,
    reserveFormed: min(max(balance), reserve),
    reserveMissing: max(reserve - max(balance)),
    afterReserve: balance - reserve,
    capacity: max(balance - reserve),
    deficit: max(-balance),
  };
}
export function referenceCapacity(s: ScenarioReference) {
  return (
    BigInt(s.targets.revenue_total) -
    BigInt(s.targets.operating_execution) -
    BigInt(s.targets.cash_reserve)
  );
}
export function budgetState(expense: bigint, budget: bigint) {
  return expense > budget
    ? "Acima do orçamento"
    : expense * 10n >= budget * 9n
      ? "Próximo do limite"
      : "Dentro do orçamento";
}
const day = (date: string) =>
  Date.parse(`${date.slice(0, 10)}T12:00:00Z`) / 86400000;
export function civilToday(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
export function forecast(
  history: readonly Observation[],
  current: bigint,
  target: bigint,
  today: string,
  metric: "revenueCents" | "balance" | "expenseCents" = "revenueCents",
  windowDays = 30,
  partial = false,
): Forecast {
  const selected = history
    .filter(
      (h) =>
        day(h.date) >= day(today) - windowDays && day(h.date) <= day(today),
    )
    .sort((a, b) => day(a.date) - day(b.date));
  // Multiple polls in a civil day never create extra observable days.
  const points = [...new Map(selected.map((h) => [h.date, h])).values()];
  const base = { windowDays, observedDays: points.length };
  if (current >= target && target > 0n)
    return { state: "achieved", reason: "Atingido", ...base };
  if (
    points.length < 7 ||
    points.some((p) => !p.coverageComplete) ||
    points.some(
      (p, i) => i > 0 && day(p.date) - day(points[i - 1].date) !== 1,
    ) ||
    day(today) - day(points.at(-1)?.date ?? "1970-01-01") > 1
  )
    return {
      state: "insufficient_history",
      reason:
        "Histórico insuficiente: ao menos sete dias consecutivos com cobertura válida.",
      ...base,
    };
  const amount = (h: Observation) =>
    metric === "balance"
      ? BigInt(h.revenueCents) - BigInt(h.expenseCents)
      : BigInt(h[metric]);
  const elapsed = BigInt(
    Math.round(day(points.at(-1)!.date) - day(points[0].date)),
  );
  const delta = amount(points.at(-1)!) - amount(points[0]);
  if (elapsed <= 0n || delta <= 0n)
    return {
      state: "insufficient_rate",
      reason:
        "Sem ritmo suficiente: a variação líquida da janela não é positiva.",
      ...base,
    };
  const missing = max(target - current),
    days = Number((missing * elapsed + delta - 1n) / delta);
  if (!Number.isSafeInteger(days) || days > 36500)
    return {
      state: "insufficient_rate",
      reason: "Prazo fora do horizonte indicativo de 100 anos.",
      ...base,
    };
  const daily = delta / elapsed;
  const recent = points.slice(-7),
    recentDelta = amount(recent.at(-1)!) - amount(recent[0]);
  const stable =
    recentDelta > 0n &&
    recentDelta * elapsed * 2n >= delta * 6n &&
    recentDelta * elapsed <= delta * 6n * 2n;
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return {
    state: "estimated",
    days,
    estimatedOn: date.toISOString().slice(0, 10),
    dailyCents: daily.toString(),
    confidence: stable ? "Ritmo estável" : "Ritmo variável",
    partial,
    ...base,
  };
}
export function scenarioModel(data: ScenarioOverview, s: ScenarioReference) {
  const revenue = BigInt(data.totals.revenueCents),
    expense = BigInt(data.totals.expenseCents),
    reserve = BigInt(s.targets.cash_reserve);
  const balances = scenarioBalances(revenue, expense, reserve);
  const total = progress(revenue, BigInt(s.targets.revenue_total));
  const complete =
    total.achieved &&
    revenueKeys.every(
      (k) =>
        BigInt(data.currentByCategory[k].amountCents) >= BigInt(s.targets[k]) &&
        data.currentByCategory[k].status === "ready",
    ) &&
    expense <= BigInt(s.targets.operating_execution) &&
    balances.reserveMissing === 0n &&
    data.coverage.complete;
  return {
    s,
    ...balances,
    total,
    complete,
    forecast: forecast(
      data.history,
      revenue,
      total.target,
      civilToday(data.generatedAt),
      "revenueCents",
      30,
      data.coverage.futureSources.length > 0 ||
        revenueKeys.some((k) => data.currentByCategory[k].status === "empty"),
    ),
  };
}
export function validateReconciliation(
  data: ScenarioOverview,
): ScenarioOverview {
  const sum = revenueKeys.reduce(
    (a, k) => a + BigInt(data.currentByCategory[k].amountCents),
    BigInt(data.currentByCategory.other_revenue.amountCents),
  );
  if (
    sum !== BigInt(data.totals.revenueCents) ||
    BigInt(data.totals.revenueCents) - BigInt(data.totals.expenseCents) !==
      BigInt(data.totals.balanceBeforeReserveCents)
  )
    throw Error("Fotografia financeira não conciliada");
  for (const row of Object.values(data.currentByCategory))
    if (
      BigInt(row.principalCents) + BigInt(row.feesCents) !==
      BigInt(row.amountCents)
    )
      throw Error("Composição não conciliada");
  for (const s of data.scenarios) {
    const subtotal = revenueKeys
      .slice(0, 7)
      .reduce((a, k) => a + BigInt(s.targets[k]), 0n);
    if (
      subtotal !== BigInt(s.targets.operating_subtotal) ||
      subtotal +
        BigInt(s.targets.sponsorship_free) +
        BigInt(s.targets.sponsorship_rouanet) !==
        BigInt(s.targets.revenue_total)
    )
      throw Error("Referência de receitas não conciliada");
  }
  return data;
}
