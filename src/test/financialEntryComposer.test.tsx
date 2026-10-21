import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinancialEntryComposer } from "@/features/financial-management/operational/FinancialEntryComposer";
import {
  FinancialInfo,
  FinancialReferenceField,
} from "@/features/financial-management/operational/FinancialEntryFields";
import {
  FinancialPaymentPlanEditor,
  makePlanDraft,
  validatePaymentPlan,
  type PlanDraft,
} from "@/features/financial-management/operational/FinancialPaymentPlanEditor";
import {
  civilDateInMonth,
  generateInstallments,
  saveFinancialBatch,
  listFinancialReferences,
  createFinancialReference,
  FinancialEntryError,
} from "@/features/financial-management/operational/financialEntryApi";
import { financialEntriesCsv } from "@/features/financial-management/operational/FinancialScheduleSummary";
vi.mock(
  "@/features/financial-management/operational/financialEntryApi",
  async (original) => ({
    ...(await original<
      typeof import("@/features/financial-management/operational/financialEntryApi")
    >()),
    fetchPaymentPlan: vi.fn().mockResolvedValue(null),
    saveFinancialBatch: vi.fn(),
    listFinancialReferences: vi.fn(),
    createFinancialReference: vi.fn(),
  }),
);
const edition = {
  id: "edition",
  org_id: "org",
  code: 2028,
  label: "2028",
  status: "operacional" as const,
  period_start: "2028-01-01",
  period_end: "2028-12-31",
};
const capabilities = {
  canAccess: true,
  canEdit: true,
  canConfirm: true,
  canAdmin: true,
  canSettle: true,
  isLoading: false,
  isError: false,
};
const mount = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      {ui}
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listFinancialReferences).mockResolvedValue([]);
  vi.mocked(saveFinancialBatch).mockResolvedValue({
    count: 1,
    items: [{ draft_id: "draft", record: { id: "saved" } }],
  });
});
afterEach(cleanup);

describe("centavos e datas civis do cronograma", () => {
  it("divide o total exato, com o resto na última parcela e âncora no dia 31", () => {
    const rows = generateInstallments(100000, 3, "2028-01-31", "pix");
    expect(rows.map((i) => i.amount_cents)).toEqual([33333, 33333, 33334]);
    expect(rows.map((i) => i.due_date)).toEqual([
      "2028-01-31",
      "2028-02-29",
      "2028-03-31",
    ]);
    expect(
      generateInstallments(100, 3, "2027-01-31", null).map((i) => i.due_date),
    ).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
    expect(
      generateInstallments(2, 2, "2028-12-31", null).map((i) => i.due_date),
    ).toEqual(["2028-12-31", "2029-01-31"]);
  });
  it("recusa parcelas zeradas, datas inexistentes e remoção de parcela liquidada", () => {
    expect(() => generateInstallments(2, 3, "2028-01-31", null)).toThrow(
      /pelo menos/,
    );
    expect(() => generateInstallments(100, 2, "2028-02-31", null)).toThrow(
      /vencimento/,
    );
    const old = generateInstallments(100, 2, "2028-01-31", "pix");
    old[1].settled_cents = 1;
    expect(() => generateInstallments(100, 1, "2028-01-31", null, old)).toThrow(
      /remover/,
    );
    const revised = generateInstallments(200, 2, "2028-06-01", null, old);
    expect(revised[1]).toMatchObject(old[1]);
    expect(revised[0].amount_cents).toBe(150);
  });
  it("aceita meses não consecutivos e bloqueia diferença de soma", () => {
    const p = makePlanDraft(null);
    p.condition = "parcelado";
    p.quantity = 3;
    p.customized = true;
    p.rows = generateInstallments(100000, 3, "2028-01-31", "boleto");
    p.rows[1].due_date = civilDateInMonth("2028-05", 31);
    p.rows[2].due_date = civilDateInMonth("2029-01", 31);
    expect(validatePaymentPlan(p, 100000)).toBeNull();
    p.rows[1].amount_cents++;
    expect(validatePaymentPlan(p, 100000)).toMatch(/soma/);
  });
  it("mantém valores personalizados até confirmar a redistribuição e não salva valor inválido antigo", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, set] = useState<PlanDraft>(() => ({
        ...makePlanDraft(null, "2028-01-31"),
        condition: "parcelado" as const,
        quantity: 3,
      }));
      return (
        <>
          <FinancialPaymentPlanEditor
            id="qa"
            value={value}
            total={100000}
            onChange={set}
          />
          <output>{validatePaymentPlan(value, 100000) || "válido"}</output>
        </>
      );
    }
    mount(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "Gerar parcelas mensais" }),
    );
    const amounts = screen.getAllByLabelText("Valor (R$)");
    await user.clear(amounts[0]);
    await user.type(amounts[0], "300,00");
    expect(amounts[0]).toHaveValue("300,00");
    await user.click(
      screen.getByRole("button", { name: "Redistribuir parcelas" }),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Manter parcelas" }));
    expect(amounts[0]).toHaveValue("300,00");
    await user.clear(amounts[0]);
    await user.type(amounts[0], "inválido");
    expect(
      screen.getByText("Cada parcela deve ter pelo menos R$ 0,01."),
    ).toBeInTheDocument();
  });
});

describe("compositor e referências reutilizáveis", () => {
  it("não cria opção ao digitar/apagar; Criar seleciona o retorno do servidor e preserva o restante", async () => {
    const user = userEvent.setup();
    vi.mocked(createFinancialReference).mockResolvedValue({
      id: "ref",
      name: "Fornecedor salvo",
      version: 1,
      active: true,
    });
    function Harness() {
      const [value, set] = useState({ id: null as string | null, name: "" });
      return (
        <>
          <input aria-label="Descrição preservada" defaultValue="Locação" />
          <FinancialReferenceField
            org="org"
            id="supplier"
            kind="payee"
            label="Fornecedor"
            value={value}
            onChange={set}
            canCreate
            canAdmin={false}
          />
        </>
      );
    }
    mount(<Harness />);
    const input = screen.getByRole("combobox", { name: "Fornecedor" });
    await user.type(input, "Rascunho");
    await user.clear(input);
    expect(createFinancialReference).not.toHaveBeenCalled();
    await user.type(input, "Fornecedor salvo");
    await user.click(
      screen.getByRole("button", { name: "Criar “Fornecedor salvo”" }),
    );
    await waitFor(() => expect(input).toHaveValue("Fornecedor salvo"));
    expect(createFinancialReference).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Descrição preservada")).toHaveValue(
      "Locação",
    );
  });
  it("duplica somente rascunhos e envia todos os itens pela única RPC de lote", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mount(
      <FinancialEntryComposer
        org="org"
        kind="expense"
        edition={edition}
        capabilities={capabilities}
        onClose={close}
      />,
    );
    await user.type(
      screen.getByLabelText(/Descrição da despesa/),
      "Despesa de teste",
    );
    await user.type(screen.getByLabelText(/Valor projetado/), "100,00");
    fireEvent.change(screen.getByLabelText(/^Vencimento \*/i), {
      target: { value: "2028-05-10" },
    });
    await user.click(
      screen.getByRole("button", { name: "Duplicar despesa 1" }),
    );
    expect(screen.getByLabelText(/Descrição da despesa/)).toHaveValue(
      "Despesa de teste",
    );
    await user.click(screen.getByRole("button", { name: "Salvar 2 despesas" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    const call = vi.mocked(saveFinancialBatch).mock.calls[0];
    expect(saveFinancialBatch).toHaveBeenCalledOnce();
    expect(call[3]).toHaveLength(2);
    expect(call[3][0].draft_id).not.toBe(call[3][1].draft_id);
    expect(call[3][0].payload).not.toHaveProperty("id");
    expect(call[3][1].payload).not.toHaveProperty("id");
    const ids = call[3].map(
      (i) =>
        (i.payload.payment_plan as { installments: { id: string }[] })
          .installments[0].id,
    );
    expect(new Set(ids).size).toBe(2);
  });
  it("erro do segundo item abre o card correspondente sem perder nenhum rascunho", async () => {
    const user = userEvent.setup();
    vi.mocked(saveFinancialBatch).mockImplementation(
      async (_o, _e, _k, items) => {
        throw new FinancialEntryError(
          "Corrija o segundo item",
          items[1].draft_id,
          false,
          "22023",
        );
      },
    );
    mount(
      <FinancialEntryComposer
        org="org"
        kind="expense"
        edition={edition}
        capabilities={capabilities}
        onClose={vi.fn()}
      />,
    );
    await user.type(
      screen.getByLabelText(/Descrição da despesa/),
      "Primeira despesa",
    );
    await user.type(screen.getByLabelText(/Valor projetado/), "100,00");
    fireEvent.change(screen.getByLabelText(/^Vencimento \*/i), {
      target: { value: "2028-05-10" },
    });
    await user.click(
      screen.getByRole("button", { name: "Duplicar despesa 1" }),
    );
    await user.clear(screen.getByLabelText(/Descrição da despesa/));
    await user.type(
      screen.getByLabelText(/Descrição da despesa/),
      "Segunda despesa",
    );
    await user.click(screen.getByRole("button", { name: "Salvar 2 despesas" }));
    await screen.findByText("Corrija o segundo item");
    expect(screen.getByLabelText(/Descrição da despesa/)).toHaveValue(
      "Segunda despesa",
    );
    expect(
      screen.getByRole("button", { name: /01 Primeira despesa/ }),
    ).toBeInTheDocument();
  });
  it("ajuda abre por foco e toque, fecha com Escape e nunca submete", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(
      <form onSubmit={submit}>
        <FinancialInfo label="Valor">Explicação financeira</FinancialInfo>
      </form>,
    );
    const info = screen.getByRole("button", {
      name: "Informações sobre Valor",
    });
    await user.hover(info);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    await user.unhover(info);
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
    await user.tab();
    expect(info).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Explicação financeira",
    );
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
    fireEvent.pointerDown(info, { pointerType: "touch" });
    fireEvent.click(info);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });
});

it("exporta o fato uma vez, separa parcelas e neutraliza fórmulas na planilha", () => {
  const csv = financialEntriesCsv([
    {
      id: "source",
      source_type: "receita",
      description: "=1+1",
      status: "confirmada",
      projected_cents: 100000,
      executed_cents: 100000,
      settled_cents: 10000,
      competence_date: "2028-01-01",
      due_date: null,
      related_name: "Associação",
      funding_source: "Projeto",
      funding_type: "lei_rouanet",
      category_name: null,
      related_reference_id: "reference",
      funding_source_reference_id: "origin",
      plan: {
        id: "plan",
        version: 2,
        condition: "parcelado",
        default_method: "pix",
        total_cents: 100000,
        active: true,
        obligation_id: "obligation",
        settled_cents: 10000,
        unassigned_settled_cents: 0,
        movements: [],
        installments: generateInstallments(100000, 3, "2028-01-31", "pix"),
      },
    },
  ]);
  const lines = csv.split("\n");
  expect(lines).toHaveLength(5);
  expect(lines[1]).toContain("'=1+1");
  expect(lines.filter((l) => l.startsWith('"CADASTRO"'))).toHaveLength(1);
  expect(lines.filter((l) => l.startsWith('"PARCELA"'))).toHaveLength(3);
  expect(lines[4]).toContain("333,34");
  expect(lines[4].split(";").slice(10, 13)).toEqual(['""', '""', '""']);
});
