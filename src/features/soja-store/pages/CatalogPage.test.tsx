import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readCatalog, saveProduct } from "../api/store";
import { CatalogPage, catalogPath } from "./CatalogPage";

vi.mock("../api/store", async (original) => ({
  ...await original<typeof import("../api/store")>(),
  readCatalog: vi.fn(),
  saveProduct: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const scope = { _org_id: "org", _commission_id: "commission" };
const queryKey = ["soja-store", "user", "org", "commission", "catalog"] as const;
const existingId = "60eab732-a9b2-4ce0-a9d8-471577a1174e";
const createdId = "da7c4d5c-7d40-4aac-a924-b49a876ad56c";
const filter = "?busca=Caneca&situacao=active&pagina=2";

function renderCatalog(url: string, canManage: boolean) {
  window.history.replaceState({}, "", url);
  vi.mocked(readCatalog).mockResolvedValue({
    total: 31,
    items: [{
      id: existingId,
      name: "Caneca de cerâmica",
      category: "Casa",
      description: null,
      unit: "un",
      status: "active",
      collection_year: null,
      source_reference: null,
      version: 1,
      created_at: "2026-11-12",
      updated_at: "2026-11-12",
      variants: [{
        id: "8680fa0f-28b4-484f-a53d-b82fd63103ef",
        sku: "CANECA-01",
        barcode: null,
        label: null,
        attributes: {},
        active: true,
        is_default: true,
      }],
    }],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route path={catalogPath} element={<CatalogPage scope={scope} queryKey={queryKey} canManage={canManage} />} />
          <Route path={`${catalogPath}/novo`} element={<CatalogPage scope={scope} queryKey={queryKey} canManage={canManage} initialCreate />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("diálogo de produto", () => {
  it("mantém página e filtros, corrige um conflito de SKU e atualiza o catálogo após confirmação", async () => {
    vi.mocked(saveProduct)
      .mockRejectedValueOnce({ code: "PT409", message: "SOJA_STORE_DUPLICATE_SKU" })
      .mockResolvedValueOnce({ id: createdId, status: "draft", version: 1 });
    renderCatalog(`${catalogPath}${filter}`, true);
    const user = userEvent.setup();
    expect(await screen.findByRole("link", { name: /Caneca de cerâmica/ })).toBeVisible();
    const trigger = screen.getByRole("button", { name: "Novo produto" });
    await user.click(trigger);
    const dialog = within(screen.getByRole("dialog", { name: "Novo produto" }));

    await user.click(dialog.getByRole("button", { name: "Salvar produto" }));
    const name = dialog.getByLabelText(/Nome \(obrigatório\)/);
    await waitFor(() => expect(name).toHaveFocus());
    await user.type(name, "Copo térmico");
    const sku = dialog.getByLabelText(/SKU \(obrigatório\)/);
    await user.type(sku, "CANECA-01");
    await user.click(dialog.getByRole("button", { name: "Salvar produto" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent("Já existe um cadastro com este código");
    expect(name).toHaveValue("Copo térmico");

    await user.clear(sku);
    await user.type(sku, "copo-01");
    await user.click(dialog.getByRole("button", { name: "Salvar produto" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saveProduct).toHaveBeenLastCalledWith(scope, {
      _request_id: expect.any(String), _expected_version: null, _payload: expect.objectContaining({
        name: "Copo térmico",
        variants: [expect.objectContaining({ sku: "COPO-01" })],
      }),
    });
    expect(window.location.search).toBe(filter);
    expect(readCatalog).toHaveBeenCalledTimes(2);
    expect(readCatalog).toHaveBeenLastCalledWith(scope, "Caneca", "active", 30);
    expect(toast.success).toHaveBeenCalledWith("Produto cadastrado.", { action: {
      label: "Ver produto", onClick: expect.any(Function),
    } });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("impede cadastro pela rota legada quando o perfil só consulta produtos", async () => {
    renderCatalog(`${catalogPath}/novo${filter}`, false);
    expect(await screen.findByRole("link", { name: /Caneca de cerâmica/ })).toBeVisible();
    expect(screen.getByText("Cadastro restrito")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saveProduct).not.toHaveBeenCalled();
  });

  it("pede confirmação no Escape e devolve o foco mantendo o recorte", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderCatalog(`${catalogPath}${filter}`, true);
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Novo produto" });
    await user.click(trigger);
    const dialog = within(screen.getByRole("dialog", { name: "Novo produto" }));
    await user.type(dialog.getByLabelText(/Nome \(obrigatório\)/), "Copo térmico");
    await user.keyboard("{Escape}");
    expect(dialog.getByLabelText(/Nome \(obrigatório\)/)).toHaveValue("Copo térmico");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(window.location.search).toBe(filter);
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
