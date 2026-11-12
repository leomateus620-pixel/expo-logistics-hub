import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatStockQuantity, StockPage } from "./StockPage";

const locationId = "5fa3926d-6119-40df-9a8f-4565ac20014e";
const variantId = "045934be-7cbd-4318-bd66-6cdf30604129";
const stockState = vi.hoisted(() => ({
  readStock: vi.fn(),
  readStockOptions: vi.fn(),
}));

vi.mock("../api/stock", () => stockState);

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
});
