import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storeRpc } from "../api/store";
import { PurchasesPage, purchasesPath } from "./PurchasesPage";

vi.mock("../api/store", async (original) => ({
  ...await original<typeof import("../api/store")>(),
  storeRpc: vi.fn(),
}));

const scope = { _org_id: "org", _commission_id: "commission" };
const options = {
  suppliers: [{ id: "supplier", name: "Ateliê" }],
  locations: [{ id: "location", name: "Depósito" }],
  variants: [{ id: "variant", product_id: "product", product_name: "Cuia", sku: "CU-1", label: null, unit: "un" }],
};

function open(canManage: boolean, legacy = false) {
  window.history.replaceState(null, "", `${purchasesPath}${legacy ? "/novo" : ""}?situacao=received&pagina=2`);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><BrowserRouter>
    <PurchasesPage scope={scope} queryKey={["soja-store", "user", "org", "commission"]} canManage={canManage}
      initialCreate={legacy} canViewQuotes={false} />
  </BrowserRouter></QueryClientProvider>);
}

describe("novo pedido sobre a lista de Compras", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storeRpc).mockImplementation(async (name) => {
      if (name === "soja_store_purchases_filtered") return { total: 0, items: [] };
      if (name === "soja_store_purchase_options") return options;
      throw new Error(`Unexpected ${name}`);
    });
  });

  it("keeps the list recorte and verifies a confirmed order without recording a receipt", async () => {
    let attempts = 0;
    vi.mocked(storeRpc).mockImplementation(async (name) => {
      if (name === "soja_store_purchases_filtered") return { total: 0, items: [] };
      if (name === "soja_store_purchase_options") return options;
      if (name === "soja_store_create_purchase") {
        if (++attempts === 1) throw { code: "22023", message: "SOJA_STORE_PURCHASE_VARIANT_UNAVAILABLE" };
        return { id: "order", status: "ordered", version: 1 };
      }
      throw new Error(`Unexpected ${name}`);
    });
    const user = userEvent.setup();
    open(true);
    const trigger = screen.getByRole("button", { name: "Novo pedido" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Novo pedido" });
    const fields = within(dialog);
    const submit = fields.getByRole("button", { name: "Registrar pedido" });
    await user.click(submit);
    expect(fields.getByText("Selecione um fornecedor ativo.")).toBeVisible();
    await waitFor(() => expect(fields.getByRole("button", { name: "Fornecedor Selecionar" })).toHaveFocus());

    for (const [label, option] of [
      ["Fornecedor Selecionar", "Ateliê"],
      ["Local de recebimento Selecionar", "Depósito"],
      ["Produto ou SKU Selecionar", "Cuia · CU-1 · un"],
    ]) {
      await user.click(fields.getByRole("button", { name: label }));
      await user.click(await fields.findByRole("button", { name: option }));
    }
    await user.type(fields.getByLabelText("Quantidade"), "3");
    await user.type(fields.getByLabelText("Custo unitário (R$)"), "1,105");
    await user.type(fields.getByLabelText("Frete (R$)"), "0,20");
    await user.click(submit);

    expect(await fields.findByText("Um dos SKUs não está mais disponível para novos pedidos.")).toBeVisible();
    expect(fields.getByLabelText("Custo unitário (R$)")).toHaveValue("1,105");
    expect(fields.getByLabelText("Quantidade")).toHaveValue("3");
    expect(fields.getByRole("status").textContent).toMatch(/3,52/);
    await user.click(submit);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo pedido" })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());

    expect(window.location.search).toBe("?situacao=received&pagina=2");
    expect(storeRpc).toHaveBeenCalledWith("soja_store_create_purchase", {
      ...scope, _request_id: expect.any(String),
      _payload: expect.objectContaining({
        supplier_id: "supplier", location_id: "location", freight_cents: 20,
        lines: [{ variant_id: "variant", quantity: "3", unit_cost: "1.105" }],
      }),
    });
    expect(vi.mocked(storeRpc).mock.calls.map(([name]) => name)).not.toContain("soja_store_receive_purchase");
  });

  it("asks before discarding a draft on Back and returns focus after cancellation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      open(true);
      const trigger = screen.getByRole("button", { name: "Novo pedido" });
      await user.click(trigger);
      const dialog = await screen.findByRole("dialog", { name: "Novo pedido" });
      const reference = within(dialog).getByLabelText("Referência do pedido ou documento");
      await user.type(reference, "Proposta de compra");

      act(() => window.history.back());
      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
      expect(reference).toHaveValue("Proposta de compra");
      expect(dialog).toBeVisible();
      expect(window.location.search).toBe("?situacao=received&pagina=2");

      confirm.mockReturnValue(true);
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo pedido" })).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(window.location.search).toBe("?situacao=received&pagina=2");
    } finally {
      confirm.mockRestore();
    }
  });

  it("does not offer a purchase form on the legacy URL for a consultation profile", async () => {
    open(false, true);
    expect(await screen.findByRole("heading", { name: "Compras" })).toBeVisible();
    expect(screen.getByText("Seu perfil precisa de permissão para registrar um pedido.")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Novo pedido" })).not.toBeInTheDocument();
    expect(storeRpc).toHaveBeenCalledWith("soja_store_purchases_filtered", expect.objectContaining({ _status: "received", _offset: 30 }));
  });
});
