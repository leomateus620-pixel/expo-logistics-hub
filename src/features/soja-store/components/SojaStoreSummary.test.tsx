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
  expect(storeRpc).toHaveBeenCalledWith("soja_store_current_dashboard", {
    _org_id: "org", _commission_id: "store", _start: null, _end: null, _location_id: null,
  });
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

it("atualiza o horário de consulta e o valor quando solicitado", async () => {
  storeRpc.mockResolvedValueOnce({
    active_products: 1, ordered_purchases: null, partial_purchases: null, stock_positions: null,
    generated_at: "2026-11-12T15:00:00Z",
  }).mockResolvedValueOnce({
    active_products: 2, ordered_purchases: null, partial_purchases: null, stock_positions: 10,
    generated_at: "2026-11-12T16:00:00Z",
  });
  renderSummary(["catalog.view"]);
  expect(await screen.findByRole("link", { name: "1 Produtos ativos" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Atualizar indicadores" }));
  expect(await screen.findByRole("link", { name: "2 Produtos ativos" })).toBeVisible();
  expect(screen.getByText(/Consultado em/).querySelector("time")).toHaveAttribute("datetime", "2026-11-12T16:00:00Z");
  expect(screen.queryByText("Posições de estoque físico")).not.toBeInTheDocument();
});

it("explica a indisponibilidade do RPC sem criar totais vazios", async () => {
  storeRpc.mockRejectedValue({ code: "PGRST202" });
  renderSummary(["stock.view"]);
  expect(await screen.findByRole("alert")).toHaveTextContent("Os indicadores da loja estão indisponíveis neste ambiente.");
  expect(screen.queryByText("Posições de estoque físico")).not.toBeInTheDocument();
});

it("preserva período e ponto nos links para vendas e compras", async () => {
  const location = "123e4567-e89b-42d3-a456-426614174000";
  storeRpc.mockResolvedValue({
    active_products: null, ordered_purchases: 2, partial_purchases: 0, stock_positions: 1,
    confirmed_sales: 5, confirmed_cents: "6543", received_cents: "6000",
    locations: [{ id: location, name: "Ponto principal" }], generated_at: "2026-11-12T15:00:00Z",
  });
  renderSummary(["sales.view", "purchases.view", "stock.view"]);
  await screen.findByRole("option", { name: "Ponto principal" });
  fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-11-01" } });
  fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-11-12" } });
  fireEvent.change(screen.getByLabelText("Local ou ponto"), { target: { value: location } });
  fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  expect(await screen.findByRole("link", { name: "R$ 65,43 Valor confirmado após devoluções" })).toHaveAttribute(
    "href", `/comissoes/soja-store/vendas?situacao=confirmadas&local=${location}&inicio=2026-11-01&fim=2026-11-12`,
  );
  expect(screen.getByRole("link", { name: "2 Pedidos a receber" })).toHaveAttribute(
    "href", `/comissoes/soja-store/compras?situacao=ordered&local=${location}&inicio=2026-11-01&fim=2026-11-12`,
  );
  expect(screen.getByRole("link", { name: "1 Posições de estoque físico" })).toHaveAttribute("href", `/comissoes/soja-store/estoque?local=${location}`);
});
