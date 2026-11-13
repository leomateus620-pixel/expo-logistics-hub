import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storeRpc } from "../api/store";
import { PurchaseQuotes } from "./PurchaseQuotes";

vi.mock("../api/store", async (original) => ({
  ...await original<typeof import("../api/store")>(),
  storeRpc: vi.fn(),
}));

const proposal = {
  quoted_on: "2026-01-01", valid_until: null, items_cents: 1000, freight_cents: 100,
  total_cents: 1100, lead_days: 5, terms: "À vista", reference: "Proposta PDF",
};
const need = {
  id: "need", description: "Necessidade de cuias", quantity: "20.000000", unit: "un", version: 3,
  quotes: [
    { ...proposal, id: "one", supplier_name: "Fornecedor A", minimum_quantity: "21.000000" },
    { ...proposal, id: "two", supplier_name: "Fornecedor B", minimum_quantity: "10.000000", total_cents: 1400 },
  ],
};
function open(canManage: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter>
    <PurchaseQuotes scope={{ _org_id: "org", _commission_id: "unit" }} queryKey={["soja-store", "org", "unit"]} canManage={canManage} />
  </MemoryRouter></QueryClientProvider>);
}

describe("purchase quotations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storeRpc).mockImplementation(async (name) => {
      if (name === "soja_store_purchase_needs") return { total: 1, items: [need] };
      if (name === "soja_store_write_purchase_need") return { id: need.id, version: 4, status: "selected" };
      throw new Error(`Unexpected ${name}`);
    });
  });

  it("shows a supplier's total and marks options below the minimum", async () => {
    open(false);
    await userEvent.click(await screen.findByRole("button", { name: "Comparar cotações" }));
    expect(screen.getByText("A quantidade solicitada está abaixo do lote mínimo.")).toBeVisible();
    expect(screen.getByText(/14,00/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Selecionar cotação" })).not.toBeInTheDocument();
  });

  it("records the eligible quote and decision at the expected version", async () => {
    open(true);
    await userEvent.click(await screen.findByRole("button", { name: "Comparar cotações" }));
    const selected = (await screen.findByRole("heading", { name: "Fornecedor B" })).closest("li")!;
    await userEvent.click(within(selected).getByRole("button", { name: "Selecionar cotação" }));
    await userEvent.type(within(selected).getByLabelText("Motivo e referência da seleção"), "Opção elegível");
    await userEvent.click(within(selected).getByRole("button", { name: "Confirmar seleção" }));
    await waitFor(() => expect(storeRpc).toHaveBeenCalledWith("soja_store_write_purchase_need", {
      _org_id: "org", _commission_id: "unit", _expected_version: 3, _request_id: expect.any(String),
      _payload: { action: "select", need_id: "need", quote_id: "two", reference: "Opção elegível" },
    }));
  });
});
