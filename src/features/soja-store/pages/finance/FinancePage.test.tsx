import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storeRpc } from "../../api/store";
import { FinancePage } from "./FinancePage";

vi.mock("../../api/store", async (original) => ({
  ...await original<typeof import("../../api/store")>(),
  storeRpc: vi.fn(),
}));

const financialSummary = {
  approved_cents: "10000", realized_cents: "2000", committed_cents: "1500", available_cents: "6500",
  recognized_receivable_cents: "1000", payable_remaining_cents: "3000", receivable_remaining_cents: "1000",
  paid_cents: "2000", received_cents: "0", overdue_count: 1, budgets: [],
};
const obligation = {
  id: "test-title", description: "Compra de materiais", kind: "payable", category: "Compras",
  occurred_on: "2026-01-01", due_on: "2026-03-01", amount_cents: "5000", original_cents: "5000",
  settled_cents: "2000", remaining_cents: "3000", reference: "Nota fiscal", purchase_id: "source-purchase",
  operation_id: null, version: 2, status: "overdue",
};

function open(canManage: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/comissoes/soja-store/financeiro?ano=2026"]}>
        <FinancePage scope={{ _org_id: "org", _commission_id: "unit" }} queryKey={["soja-store", "user", "org", "unit"]} canManage={canManage} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Soja Store finance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storeRpc).mockImplementation(async (name) => {
      if (name === "soja_store_finance_summary") return financialSummary;
      if (name === "soja_store_finance_entries") return { total: 1, items: [obligation] };
      if (name === "soja_store_finance_settlements") return { total: 0, items: [] };
      if (name === "soja_store_settle_obligation") return { id: obligation.id, version: 3, status: "overdue" };
      throw new Error(`Unexpected RPC ${name}`);
    });
  });

  it("renders scope figures and drill-down for overdue obligations", async () => {
    open(false);
    expect(await screen.findByText("R$ 65,00")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Ver 1 título vencido" }));
    await waitFor(() => expect(storeRpc).toHaveBeenCalledWith("soja_store_finance_entries", expect.objectContaining({ _status: "overdue" })));
    await userEvent.click(await screen.findByRole("button", { name: "Ver título" }));
    expect(screen.getByRole("link", { name: "Abrir pedido de compra" })).toHaveAttribute("href", "/comissoes/soja-store/compras/source-purchase");
    expect(screen.queryByRole("button", { name: "Registrar baixa" })).not.toBeInTheDocument();
  });

  it("submits a manual partial settlement as exact integer cents and expected version", async () => {
    open(true);
    await userEvent.click(await screen.findByRole("button", { name: "Ver título" }));
    await userEvent.click(screen.getByRole("button", { name: "Registrar baixa" }));
    await userEvent.type(screen.getByLabelText("Valor da baixa (R$)"), "12,50");
    await userEvent.selectOptions(screen.getByLabelText("Forma de liquidação"), "pix");
    await userEvent.type(screen.getByLabelText("Referência da liquidação"), "Transferência conferida");
    const submit = screen.getAllByRole("button", { name: "Registrar baixa" }).find((button) => button.getAttribute("type") === "submit")!;
    await userEvent.click(submit);
    await waitFor(() => expect(storeRpc).toHaveBeenCalledWith("soja_store_settle_obligation", {
      _org_id: "org", _commission_id: "unit", _request_id: expect.any(String), _expected_version: 2,
      _payload: {
        obligation_id: "test-title", occurred_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        reference: "Transferência conferida", amount_cents: 1250, method: "pix",
      },
    }));
  });
});
