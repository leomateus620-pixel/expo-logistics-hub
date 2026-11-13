import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { CustomersPage } from "./CustomersPage";
import { customersPath, type CustomerDetail } from "./types";

const { storeRpc, readCatalog } = vi.hoisted(() => ({ storeRpc: vi.fn(), readCatalog: vi.fn() }));
vi.mock("../../api/store", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../api/store")>(),
  storeRpc, readCatalog,
}));

const scope = { _org_id: "org", _commission_id: "store" };
const customerId = "b2ae4390-de94-4ba4-badf-e0f7b8cc3698";
const variantId = "adffca09-dbf6-4524-9b55-ef2c11ff91bd";
const customer: CustomerDetail = {
  id: customerId, name: "Cadastro de teste", kind: "individual", city: null, email: null, phone: null,
  status: "active", communication_consent: false, version: 1, interests: [],
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderPage(id?: string, canManage = true, canReadCatalog = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[id ? `${customersPath}/${id}` : customersPath]}>
        <Routes>
          <Route path={customersPath} element={<CustomersPage scope={scope} queryKey={["store", "customers"]} canManage={canManage} canReadCatalog={canReadCatalog} />} />
          <Route path={`${customersPath}/novo`} element={<CustomersPage scope={scope} queryKey={["store", "customers"]} canManage={canManage} canReadCatalog={canReadCatalog} detailId="novo" />} />
          <Route path={`${customersPath}/${customerId}`} element={<CustomersPage scope={scope} queryKey={["store", "customers"]} canManage={canManage} canReadCatalog={canReadCatalog} detailId={customerId} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("mantém a lista vazia e a busca no servidor para o perfil de consulta", async () => {
  storeRpc.mockResolvedValue({ items: [], total: 0 });
  renderPage(undefined, false);
  expect(await screen.findByText("Nenhum cadastro registrado")).toBeVisible();
  expect(screen.queryByRole("link", { name: "Novo cadastro" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Santa Rosa" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
  await waitFor(() => expect(storeRpc).toHaveBeenLastCalledWith("soja_store_customers", {
    ...scope, _search: "Santa Rosa", _limit: 30, _offset: 0,
  }));
});

it("cria o cadastro mínimo sem presumir consentimento e carrega o detalhe persistido", async () => {
  storeRpc.mockImplementation(async (name) => name === "soja_store_save_customer"
    ? { id: customerId, status: "active", version: 1 } : customer);
  renderPage("novo");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.change(screen.getByRole("textbox", { name: "Nome ou razão social" }), { target: { value: customer.name } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
  expect(await screen.findByRole("heading", { name: customer.name })).toBeVisible();
  expect(storeRpc).toHaveBeenCalledWith("soja_store_save_customer", expect.objectContaining({
    _request_id: expect.any(String), _expected_version: null,
    _payload: { id: undefined, name: customer.name, kind: "individual", status: "active", city: null, phone: null, email: null, communication_consent: false },
  }));
});

it("registra interesse com quantidade decimal e exibe o resultado relido do banco", async () => {
  const saved = {
    id: "interest", customer_id: customerId, variant_id: variantId, product_name: "Cuia de teste", sku: "CUIA-01",
    variant_label: null, quantity: "2.500000", status: "open", notes: null, version: 1,
  };
  let created = false;
  storeRpc.mockImplementation(async (name) => {
    if (name === "soja_store_save_interest") {
      created = true;
      return { id: saved.id, status: saved.status, version: saved.version };
    }
    return { ...customer, interests: created ? [saved] : [] };
  });
  readCatalog.mockResolvedValue({ total: 1, items: [{ name: saved.product_name, variants: [{ id: variantId, sku: saved.sku, active: true }] }] });
  renderPage(customerId);
  fireEvent.click(await screen.findByRole("button", { name: "Registrar interesse" }));
  await screen.findByRole("option", { name: "Cuia de teste · CUIA-01" });
  fireEvent.change(screen.getByRole("combobox", { name: "Variante" }), { target: { value: variantId } });
  fireEvent.change(screen.getByRole("textbox", { name: "Quantidade (opcional)" }), { target: { value: "2,5" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar interesse" }));
  expect(await screen.findByText("CUIA-01 · Quantidade 2,5")).toBeVisible();
  expect(storeRpc).toHaveBeenCalledWith("soja_store_save_interest", expect.objectContaining({
    _request_id: expect.any(String), _expected_version: null,
    _payload: { id: undefined, customer_id: customerId, variant_id: variantId, quantity: "2.5", status: "open", notes: null },
  }));
});
