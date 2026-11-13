import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { storeRpc } from "../../api/store";
import { SalesPage } from "./SalesPage";

vi.mock("../../api/store", async (original) => ({
  ...await original<typeof import("../../api/store")>(),
  storeRpc: vi.fn(),
}));

it("registra o saldo da reserva e confirma a entrega em ações separadas", async () => {
  const id = "c995b4e4-6a2f-43bb-bd2b-d87225ba38ba";
  let sale = {
    id, status: "pending", total_cents: 1000, paid_cents: 400, version: 2, occurred_on: "2026-11-12",
    location_id: "point", fiscal_reference: null, reservation_expires_at: "2099-11-13T12:00:00Z",
    payment_methods: ["pix"], delivered_at: null as string | null, lines: [], payments: [], receipts: [],
  };
  const scope = { _org_id: "org", _commission_id: "store" };
  vi.mocked(storeRpc).mockImplementation(async (name, args) => {
    if (name === "soja_store_pos_config") return { rule: { active: true, methods: ["pix"] } };
    if (name === "soja_store_cash_sessions") return { items: [{ id: "cash", location_id: "point", location_name: "Balcão", status: "open" }] };
    if (name === "soja_store_sales_filtered") return { total: 1, items: [sale] };
    if (name === "soja_store_sale") return sale;
    if (name === "soja_store_sale_options") return [];
    if (name === "soja_store_finish_sale") {
      const payload = args._payload as { action: string };
      sale = payload.action === "payment"
        ? { ...sale, paid_cents: 1000, version: 3 }
        : { ...sale, status: "completed", delivered_at: "2026-11-12T17:00:00Z", version: 4 };
      return sale;
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[`/comissoes/soja-store/vendas?venda=${id}`]}>
      <SalesPage scope={scope} queryKey={["store", "user", "org", "store"]} canManage reservationFlow />
    </MemoryRouter>
  </QueryClientProvider>);
  const user = userEvent.setup();
  const section = within(await screen.findByRole("region", { name: "Venda selecionada" }));
  expect(await section.findByText("Recebido R$ 4,00 · A receber R$ 6,00")).toBeVisible();
  expect(section.queryByRole("button", { name: "Confirmar entrega" })).not.toBeInTheDocument();
  expect(section.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
  await user.type(section.getByLabelText("Valor alocado (R$)"), "6");
  await user.type(section.getByLabelText("Referência da confirmação manual"), "PIX conferido");
  await user.click(section.getByRole("button", { name: "Registrar pagamento" }));
  const deliver = await section.findByRole("button", { name: "Confirmar entrega" });
  expect(storeRpc).toHaveBeenCalledWith("soja_store_finish_sale", {
    ...scope, _request_id: expect.any(String), _expected_version: 2,
    _payload: { sale_id: id, action: "payment", session_id: "cash", payments: [
      { method: "pix", amount_cents: 600, tendered_cents: null, fee_cents: 0, reference: "PIX conferido" },
    ] },
  });
  await user.click(deliver);
  await waitFor(() => expect(storeRpc).toHaveBeenCalledWith("soja_store_finish_sale", {
    ...scope, _request_id: expect.any(String), _expected_version: 3, _payload: { sale_id: id, action: "deliver" },
  }));
  expect(await section.findByText(/Entrega confirmada em/)).toBeVisible();
});
