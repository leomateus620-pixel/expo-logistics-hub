import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatStockQuantity, StockPage } from "./StockPage";

const locationId = "5fa3926d-6119-40df-9a8f-4565ac20014e";
const variantId = "045934be-7cbd-4318-bd66-6cdf30604129";
const stockState = vi.hoisted(() => ({
  readStock: vi.fn(),
  readStockOptions: vi.fn(),
  readInventoryPosition: vi.fn(),
  storeRpc: vi.fn(),
}));

vi.mock("../api/stock", () => stockState);
vi.mock("../api/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/store")>()),
  storeRpc: stockState.storeRpc,
}));

const scope = { _org_id: "org", _commission_id: "commission" };
const item = {
  variant_id: variantId,
  product_id: "product",
  product_name: "Chapéu",
  sku: "SKU-1",
  variant_label: "Aba curta",
  unit: "un",
  location_id: locationId,
  location_name: "Estoque central",
  ownership: "own",
  owner_supplier_id: null,
  destination: "store",
  quantity: "8.000000",
  last_movement_at: "2026-11-12T13:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderStock(search = "", capabilities = ["stock.view"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  stockState.readStockOptions.mockResolvedValue({ locations: [], variants: [] });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/comissoes/soja-store/estoque${search}`]}>
        <StockPage scope={scope} queryKey={["store", "user", "org", "commission"]} access={{ enabled: true, capabilities }} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("consulta de estoque", () => {
  it("formata decimais sem conversão para ponto flutuante", () => {
    expect(formatStockQuantity("100000000000.987654")).toBe("100.000.000.000,987654");
    expect(formatStockQuantity("8.000000")).toBe("8");
  });

  it("abre movimentos com a localização e variante da linha de saldo", async () => {
    stockState.readStock
      .mockResolvedValueOnce({ view: "saldos", total: 1, items: [item] })
      .mockResolvedValueOnce({ view: "movimentos", total: 0, items: [] });
    renderStock();
    expect(await screen.findByText("8 un")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Chapéu" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Ver movimentos" }));
    expect(await screen.findByText("Nenhum movimento registrado")).toBeVisible();
    expect(stockState.readStock).toHaveBeenLastCalledWith(scope, {
      locationId, variantId, limit: 30, offset: 0,
    }, "movimentos");
  });

  it("mantém a referência à compra disponível apenas com a permissão correspondente", async () => {
    stockState.readStock.mockResolvedValue({
      view: "movimentos",
      total: 1,
      items: [{
        ...item,
        id: "movement",
        movement_type: "purchase_receipt",
        occurred_on: "2026-11-12",
        recorded_at: "2026-11-12T13:00:00Z",
        purchase_id: "purchase",
        receipt_id: "receipt",
      }],
    });
    renderStock("?visao=movimentos", ["stock.view", "purchases.view"]);
    expect(await screen.findByRole("link", { name: "Abrir compra" })).toHaveAttribute("href", "/comissoes/soja-store/compras/purchase");
  });

  it("confirma contagem inicial com a versão consultada e mostra sua trilha", async () => {
    stockState.readInventoryPosition.mockResolvedValue({ quantity: "0", available_quantity: "0", version: 0, has_movement: false });
    stockState.readStock.mockImplementation((_scope, _filters, view) => Promise.resolve(view === "movimentos" ? {
      view, total: 1, items: [{
        ...item, id: "opening", movement_type: "opening_count", previous_quantity: "0", counted_quantity: "8",
        reason: "Conferência da prateleira", purchase_id: null, occurred_on: "2026-11-12", recorded_at: "2026-11-12T13:00:00Z",
      }],
    } : { view, total: 0, items: [] }));
    stockState.storeRpc.mockImplementation((name) => Promise.resolve(name === "soja_store_inventory_options" ? {
      locations: [{ id: locationId, name: "Estoque central" }],
      variants: [{ id: variantId, product_name: "Chapéu", sku: "SKU-1", label: "Aba curta", unit: "un" }],
    } : { id: "count", status: "recorded", version: 1 }));
    renderStock("", ["stock.view", "stock.manage"]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Registrar contagem" }));
    await user.click(screen.getByRole("button", { name: "Local da contagem Selecionar" }));
    await user.click(await screen.findByRole("button", { name: "Estoque central" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Produto ou SKU Selecionar" }));
    await user.click(await within(await screen.findByRole("dialog")).findByRole("button", { name: /Chapéu · Aba curta/ }));
    expect(await screen.findByText("Contagem inicial · Sem movimento registrado")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Quantidade física conferida"), { target: { value: "8,0" } });
    fireEvent.change(screen.getByLabelText("Motivo da contagem"), { target: { value: "Conferência da prateleira" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Conferi a quantidade física desta posição." }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar contagem" }));
    expect(await screen.findByText("Contagem registrada no histórico de estoque.")).toBeVisible();
    expect(await screen.findByText("Conferência da prateleira")).toBeVisible();
    expect(stockState.storeRpc).toHaveBeenCalledWith("soja_store_record_inventory", {
      ...scope, _request_id: expect.any(String), _expected_version: 0, _payload: {
        variant_id: variantId, location_id: locationId, kind: "opening_count", quantity: "8.0",
        reason: "Conferência da prateleira", reference: null,
      },
    });
  });

  it("confere somente parte da transferência e mantém o saldo em trânsito visível", async () => {
    const transferId = "c5dcfa43-53b1-4f20-9cb0-1cf459c042ae";
    const transfer = {
      id: transferId, origin_name: "Estoque central", destination_name: "Ponto da loja", product_name: "Chapéu",
      sku: "SKU-1", unit: "un", quantity: "2.250000", reason: "Reposição",
    };
    let received = false;
    stockState.storeRpc.mockImplementation((name) => {
      if (name === "soja_store_receive_transfer") {
        received = true;
        return Promise.resolve({ id: transferId, version: 3, status: "partially_received" });
      }
      return Promise.resolve({
        ...transfer, status: received ? "partially_received" : "in_transit", version: received ? 3 : 2,
        received_quantity: received ? "1" : "0", in_transit_quantity: received ? "1.250000" : "2.250000", events: [],
      });
    });
    renderStock(`?visao=transferencias&transferencia=${transferId}`, ["stock.view", "stock.manage", "stock.transfers"]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Registrar recebimento" }));
    await user.type(screen.getByLabelText("Quantidade conferida"), "3");
    await user.click(screen.getByRole("button", { name: "Confirmar recebimento" }));
    expect(screen.getByText("Informe uma quantidade maior que zero e dentro do saldo em trânsito.")).toBeVisible();
    await user.clear(screen.getByLabelText("Quantidade conferida"));
    await user.type(screen.getByLabelText("Quantidade conferida"), "1");
    await user.click(screen.getByRole("button", { name: "Confirmar recebimento" }));
    expect(await screen.findByText("Transferência atualizada. Recebida em parte.")).toBeVisible();
    expect(await screen.findByText("1,25 un")).toBeVisible();
    expect(stockState.storeRpc).toHaveBeenCalledWith("soja_store_receive_transfer", {
      ...scope, _request_id: expect.any(String), _expected_version: 2,
      _payload: { transfer_id: transferId, quantity: "1", reference: null },
    });
  });

  it("registra entrega institucional com destino e responsável conferidos", async () => {
    const destination = "579a1d4b-440e-4de7-8393-5312f2632dbf";
    stockState.readInventoryPosition.mockResolvedValue({ quantity: "8", available_quantity: "8", version: 3, has_movement: true });
    stockState.readStock.mockImplementation((_scope, _filters, view) => Promise.resolve(view === "movimentos" ? {
      view, total: 1, items: [{
        ...item, id: "issue", movement_type: "institutional_issue", quantity: "-2", reason: "Brinde para encontro institucional",
        destination_commission_name: "Outra comissão", recipient: "Equipe responsável",
        occurred_on: "2026-11-12", recorded_at: "2026-11-12T13:00:00Z",
      }],
    } : { view, total: 0, items: [] }));
    stockState.storeRpc.mockImplementation((name) => {
      if (name === "soja_store_issue_destinations") return Promise.resolve([{ id: destination, name: "Outra comissão" }]);
      if (name === "soja_store_inventory_options") return Promise.resolve({
        locations: [{ id: locationId, name: "Estoque central" }],
        variants: [{ id: variantId, product_name: "Chapéu", sku: "SKU-1", label: null, unit: "un" }],
      });
      return Promise.resolve({ id: "issue", status: "recorded", version: 4 });
    });
    renderStock("", ["stock.view", "stock.manage", "stock.institutional"]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Saída institucional" }));
    await user.click(screen.getByRole("button", { name: "Local de saída Selecionar" }));
    await user.click(await screen.findByRole("button", { name: "Estoque central" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Produto ou SKU Selecionar" }));
    await user.click(await within(await screen.findByRole("dialog")).findByRole("button", { name: /Chapéu · SKU-1/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Comissão de destino Selecionar" }));
    await user.click(await screen.findByRole("button", { name: "Outra comissão" }));
    await user.type(screen.getByLabelText("Quantidade entregue"), "2");
    await user.type(screen.getByLabelText("Nome de quem recebeu"), "Equipe responsável");
    await user.type(screen.getByLabelText("Motivo da saída"), "Brinde para encontro institucional");
    await user.click(screen.getByRole("button", { name: "Confirmar saída" }));
    expect(await screen.findByText("Saída institucional registrada no estoque.")).toBeVisible();
    expect(await screen.findByText("Recebido por Equipe responsável")).toBeVisible();
    expect(stockState.storeRpc).toHaveBeenCalledWith("soja_store_register_institutional_issue", {
      ...scope, _request_id: expect.any(String), _expected_version: 3,
      _payload: {
        variant_id: variantId, location_id: locationId, destination_commission_id: destination, quantity: "2",
        recipient: "Equipe responsável", reason: "Brinde para encontro institucional", reference: null,
      },
    });
  });
});
