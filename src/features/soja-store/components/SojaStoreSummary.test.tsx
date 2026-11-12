import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { SojaStoreSummary } from "./SojaStoreSummary";

const { storeRpc } = vi.hoisted(() => ({ storeRpc: vi.fn() }));
vi.mock("../api/store", () => ({ storeRpc, storeError: () => "Consulta indisponível." }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user" } }) }));
vi.mock("@/hooks/useCurrentOrg", () => ({ useCurrentOrg: () => ({ orgId: "org" }) }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderSummary(capabilities: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SojaStoreSummary commissionId="store" access={{ enabled: true, capabilities }} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("links authorized totals to the corresponding filters and hides null metrics", async () => {
  storeRpc.mockResolvedValue({
    active_products: 42, ordered_purchases: 1, partial_purchases: 2, stock_positions: null,
    generated_at: "2026-11-12T15:00:00Z",
  });
  renderSummary(["catalog.view", "purchases.view"]);

  expect(await screen.findByRole("link", { name: "42 Produtos ativos" }))
    .toHaveAttribute("href", "/comissoes/soja-store/produtos?situacao=active");
  expect(screen.getByRole("link", { name: "1 Pedidos a receber" }))
    .toHaveAttribute("href", "/comissoes/soja-store/compras?situacao=ordered");
  expect(screen.getByRole("link", { name: "2 Pedidos recebidos em parte" }))
    .toHaveAttribute("href", "/comissoes/soja-store/compras?situacao=partially_received");
  expect(screen.queryByText("Posições de estoque físico")).not.toBeInTheDocument();
  expect(storeRpc).toHaveBeenCalledWith("soja_store_dashboard", { _org_id: "org", _commission_id: "store" });
});

it("retries an error and renders a measured empty balance", async () => {
  storeRpc.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({
    active_products: null, ordered_purchases: null, partial_purchases: null, stock_positions: 0,
    generated_at: "2026-11-12T15:00:00Z",
  });
  renderSummary(["stock.view"]);

  expect(await screen.findByRole("alert")).toHaveTextContent("Consulta indisponível.");
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByRole("link", { name: "0 Posições de estoque físico" }))
    .toHaveAttribute("href", "/comissoes/soja-store/estoque");
  expect(screen.getByText("Nenhum registro nos recortes abaixo.")).toBeVisible();
});
