import { readFileSync } from "node:fs";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import {
  progress,
  scenarioBalances,
  forecast,
  money,
  validateReconciliation,
  referenceCapacity,
} from "../financialScenariosMath";
import { overviewSchema, type Observation } from "../financialScenariosTypes";
import { ScenarioComparison } from "../scenarios/ScenarioComparison";
import { ScenarioTargetComparison } from "../scenarios/ScenarioTargetComparison";
import { ScenarioRevenueMosaic } from "../scenarios/ScenarioRevenueMosaic";
import { ScenarioMetricRow } from "../scenarios/ScenarioMetricRow";
import { COMMERCIAL_PAVILION_DEFINITIONS } from "@/features/commercial-map/utils/commercialPavilions";

const fixture = () =>
  overviewSchema.parse(
    JSON.parse(
      readFileSync(
        "docs/financial-scenarios/evidence/synthetic-overview.json",
        "utf8",
      ),
    ),
  );
afterEach(cleanup);
describe("official persisted reference", () => {
  it("the frontend accepts and reconciles all three real isolated RPC contracts, including zero cash sponsorship", () => {
    for (const file of [
      "synthetic-overview",
      "synthetic-confirmed",
      "synthetic-cash",
    ]) {
      const v = overviewSchema.parse(
        JSON.parse(
          readFileSync(
            `docs/financial-scenarios/evidence/${file}.json`,
            "utf8",
          ),
        ),
      );
      expect(() => validateReconciliation(v)).not.toThrow();
    }
  });
  it("all exact rows reconcile in cents without silently fixing provenance", () => {
    const data = validateReconciliation(fixture());
    const targets = data.scenarios.map((s) => s.targets);
    expect(targets.map((t) => t.revenue_total)).toEqual([
      "765808803",
      "1082260964",
      "1215922964",
    ]);
    expect(targets.map((t) => t.automotive)).toEqual([
      "24096253",
      "30120320",
      "30120320",
    ]);
    expect(targets.map((t) => t.external_ics)).toEqual([
      "80383503",
      "100479335",
      "100479335",
    ]);
    expect(targets.map((t) => t.parking)).toEqual([
      "56000000",
      "70000000",
      "72000000",
    ]);
    expect(data.scenarios.map(referenceCapacity)).toEqual([
      0n,
      232260964n,
      315922964n,
    ]);
    expect(
      BigInt(targets[2].investment_capacity) -
        referenceCapacity(data.scenarios[2]),
    ).toBe(-2000000n);
    expect(
      data.scenarios[2].provenance.issues.some(
        (i) => i.code === "INVESTMENT_REFERENCE_MISMATCH",
      ),
    ).toBe(true);
  });
  it("server registry uses canonical physical identities, including B3 and B10", () => {
    const sql = readFileSync(
      "supabase/migrations/20261022090000_financial_live_scenarios.sql",
      "utf8",
    );
    for (const p of Object.values(COMMERCIAL_PAVILION_DEFINITIONS))
      expect(sql).toContain(`('${p.publicIdentifier}',${p.pavilionNumber})`);
    expect(sql).not.toContain("('B12',12)");
  });
  it("rejects unsafe bigint, cross-category and total drift before cache replacement", () => {
    const data = fixture();
    data.currentByCategory.automotive.amountCents = "999";
    expect(() => validateReconciliation(data)).toThrow();
    expect(() =>
      overviewSchema.parse({
        ...fixture(),
        totals: { ...fixture().totals, revenueCents: "9007199254740992" },
      }),
    ).toThrow();
  });
});
describe("financial semantics", () => {
  it("preserves negative balance, partial reserve, full target deduction and scenario-dependent capacity", () => {
    expect(scenarioBalances(100n, 200n, 50n)).toEqual({
      balance: -100n,
      reserveFormed: 0n,
      reserveMissing: 50n,
      afterReserve: -150n,
      capacity: 0n,
      deficit: 100n,
    });
    expect(scenarioBalances(300n, 200n, 150n)).toMatchObject({
      reserveFormed: 100n,
      reserveMissing: 50n,
      afterReserve: -50n,
      capacity: 0n,
    });
    expect(scenarioBalances(500n, 200n, 50n).capacity).toBe(250n);
  });
  it("uses integer attainment, shows excess, clamps only visual width and handles zero/negative targets", () => {
    expect(progress(9996n, 10000n)).toMatchObject({
      achieved: false,
      missing: 4n,
    });
    expect(progress(11240n, 10000n)).toMatchObject({
      percentage: 112.4,
      width: 100,
      excess: 1240n,
      achieved: true,
    });
    expect(progress(0n, 0n)).toMatchObject({
      percentage: null,
      achieved: false,
    });
    expect(() => progress(1n, -1n)).toThrow();
    expect(money(-123456789n)).toBe("−R$ 1.234.567,89");
  });
  it("expense overrun and attained revenue have distinct visible states", () => {
    render(
      <>
        <ScenarioMetricRow
          label="Receita"
          current={11240n}
          target={10000n}
          currentLabel="Carteira"
          info="Fonte"
        />
        <ScenarioMetricRow
          label="Despesa"
          current={11240n}
          target={10000n}
          currentLabel="Comprometido"
          budget
          info="Fonte"
        />
      </>,
    );
    expect(screen.getByText("Atingido")).toBeVisible();
    expect(screen.getByText("Acima do orçamento")).toBeVisible();
    expect(screen.getByText("+R$ 12,40 acima da meta")).toBeVisible();
    expect(screen.getByRole("meter", { name: "Receita" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });
  it("information button opens by keyboard and Escape returns focus", async () => {
    render(
      <ScenarioMetricRow
        label="Reserva"
        current={0n}
        target={100n}
        currentLabel="Analítica"
        info="Saldo menos reserva alvo"
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Como é calculado: Reserva",
    });
    trigger.focus();
    fireEvent.click(trigger);
    expect(await screen.findByText("Saldo menos reserva alvo")).toBeVisible();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(trigger).toHaveFocus();
  });
});
const points = (daily: bigint, days = 10): Observation[] =>
  Array.from({ length: days }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    revenueCents: String(BigInt(i) * daily),
    expenseCents: "0",
    coverageComplete: true,
    categories: {},
  }));
describe("conditional forecasts use economic elapsed days", () => {
  it("uses actual observed net rate, ceiling, civil date and keeps partial conclusion explicit", () => {
    expect(
      forecast(
        points(100n),
        900n,
        1001n,
        "2026-10-10",
        "revenueCents",
        30,
        true,
      ),
    ).toMatchObject({
      state: "estimated",
      days: 2,
      estimatedOn: "2026-10-12",
      dailyCents: "100",
      partial: true,
    });
  });
  it.each([0n, -100n])("no positive net rhythm (%s) produces no ETA", (rate) =>
    expect(forecast(points(rate), 0n, 1000n, "2026-10-10").state).toBe(
      "insufficient_rate",
    ),
  );
  it("requires seven actual consecutive days, rejects missing coverage and never turns polling into activity", () => {
    expect(forecast(points(100n, 6), 500n, 1000n, "2026-10-06").state).toBe(
      "insufficient_history",
    );
    const repeated = Array.from({ length: 144 }, () => points(100n)[0]);
    expect(forecast(repeated, 0n, 100n, "2026-10-01").state).toBe(
      "insufficient_history",
    );
    const gap = points(100n).filter((_, i) => i !== 3);
    expect(forecast(gap, 900n, 1000n, "2026-10-10").state).toBe(
      "insufficient_history",
    );
    const invalid = points(100n);
    invalid[3].coverageComplete = false;
    expect(forecast(invalid, 900n, 1000n, "2026-10-10").state).toBe(
      "insufficient_history",
    );
  });
  it("cancel/revision reopens a target; balance rate includes expense changes", () => {
    expect(forecast(points(100n), 1000n, 1000n, "2026-10-10").state).toBe(
      "achieved",
    );
    expect(forecast(points(100n), 900n, 1000n, "2026-10-10").state).toBe(
      "estimated",
    );
    const h = points(100n).map((p, i) => ({
      ...p,
      expenseCents: String(i * 150),
    }));
    expect(forecast(h, -450n, 100n, "2026-10-10", "balance").state).toBe(
      "insufficient_rate",
    );
  });
});

describe("focused scenario experience", () => {
  it("renders only the selected scenario while retaining the same current money across references", () => {
    const data = fixture(),
      props = { data, onSelect: vi.fn(), onCategory: vi.fn() };
    const { rerender } = render(
      <ScenarioComparison {...props} selected="pessimistic" />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(
      screen.getByRole("article", { name: "Cenário Pessimista" }),
    ).toBeVisible();
    const actual = money(data.currentByCategory.pavilion_ics.amountCents);
    expect(screen.getByText(actual)).toBeVisible();
    rerender(<ScenarioComparison {...props} selected="optimistic" />);
    expect(
      screen.getByRole("article", { name: "Cenário Otimista" }),
    ).toBeVisible();
    expect(screen.getByText(actual)).toBeVisible();
    expect(screen.getByText("Divergência na referência")).toBeVisible();
  });
  it("compares the chosen category without a table, preserving category when scenario changes", () => {
    const data = fixture(),
      onCategory = vi.fn();
    const { rerender } = render(
      <ScenarioTargetComparison
        data={data}
        selected="pessimistic"
        onCategory={onCategory}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Categoria" }), {
      target: { value: "automotive" },
    });
    expect(
      screen.getByText(money(data.scenarios[0].targets.automotive)),
    ).toBeVisible();
    rerender(
      <ScenarioTargetComparison
        data={data}
        selected="optimistic"
        onCategory={onCategory}
      />,
    );
    expect(
      screen.getByText(money(data.scenarios[2].targets.automotive)),
    ).toBeVisible();
    expect(
      screen.getByText(money(data.currentByCategory.automotive.amountCents)),
    ).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Espaço do Automóvel" }),
    );
    expect(onCategory).toHaveBeenCalledWith("automotive");
  });
  it("offers all revenue sources as accessible composition buttons, including zero and without dividing by zero", () => {
    const data = fixture(),
      onCategory = vi.fn();
    const { rerender } = render(
      <ScenarioRevenueMosaic data={data} onCategory={onCategory} />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: /^Pavilhões ICS:/ }));
    expect(onCategory).toHaveBeenCalledWith("pavilion_ics");
    data.totals.revenueCents = "0";
    for (const row of Object.values(data.currentByCategory))
      row.amountCents = "0";
    rerender(<ScenarioRevenueMosaic data={data} onCategory={onCategory} />);
    expect(screen.getByText(/Sem total positivo/)).toBeVisible();
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
  });
});
