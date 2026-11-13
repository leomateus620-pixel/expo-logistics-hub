import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { DirectoryPage } from "./DirectoryPage";

const { storeRpc } = vi.hoisted(() => ({ storeRpc: vi.fn() }));
vi.mock("../api/store", async (importOriginal) => ({
  ...await importOriginal<typeof import("../api/store")>(), storeRpc,
}));

const scope = { _org_id: "org", _commission_id: "loja" };

function CurrentURL() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderDirectory(kind: "locations" | "suppliers", url: string, canManage = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <DirectoryPage scope={scope} queryKey={["loja", "usuário"]} kind={kind} canManage={canManage} />
        <CurrentURL />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("filtra fornecedores fora da página inicial e reinicia a paginação", async () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({
    id: String(index), kind: "company", status: "active", version: 1,
    name: index === 100 ? "Armazém Horizonte" : `Fornecedor ${index + 1}`,
  }));
  storeRpc.mockImplementation(async (_name, args) => ({
    total: rows.length, items: rows.slice(args._offset, args._offset + args._limit),
  }));
  renderDirectory("suppliers", "/fornecedores?pagina=2", false);
  expect(await screen.findByText("Fornecedor 31")).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar fornecedor" }), { target: { value: "armazem" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
  expect(await screen.findByText("Armazém Horizonte")).toBeVisible();
  expect(screen.getByTestId("location")).toHaveTextContent("/fornecedores?busca=armazem");
  expect(screen.queryByRole("button", { name: "Novo fornecedor" })).not.toBeInTheDocument();
  expect(storeRpc).toHaveBeenCalledWith("soja_store_suppliers", { ...scope, _limit: 100, _offset: 100 });
});

it("mantém o recorte e os valores de um novo local quando o servidor rejeita o nome", async () => {
  const point = { id: "point", name: "Ponto principal", kind: "point", status: "active", version: 1 };
  let created = false;
  storeRpc.mockImplementation(async (name, args) => {
    if (name === "soja_store_save_location") {
      if (args._payload.name === point.name) throw { code: "PT409", message: "SOJA_STORE_DUPLICATE_LOCATION" };
      created = true;
      return { id: "new", status: "active", version: 1 };
    }
    return {
      total: created ? 2 : 1,
      items: created ? [point, { ...point, id: "new", name: "Ponto auxiliar" }] : [point],
    };
  });

  renderDirectory("locations", "/configuracoes?tipo=point");
  expect(await screen.findByText("Ponto principal")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Novo local" }));
  expect(screen.getByText("Ponto principal")).toBeInTheDocument();
  const dialog = within(screen.getByRole("dialog", { name: "Novo local" }));
  const name = dialog.getByRole("textbox", { name: "Nome" });
  const notes = dialog.getByRole("textbox", { name: "Observações" });
  fireEvent.change(name, { target: { value: point.name } });
  fireEvent.change(dialog.getByRole("combobox", { name: "Tipo" }), { target: { value: "point" } });
  fireEvent.change(notes, { target: { value: "Próximo à entrada" } });
  fireEvent.click(dialog.getByRole("button", { name: "Salvar" }));
  expect(await dialog.findByText("Já existe um local com este nome.")).toBeVisible();
  expect(notes).toHaveValue("Próximo à entrada");
  fireEvent.change(name, { target: { value: "Ponto auxiliar" } });
  fireEvent.click(dialog.getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByText("Ponto auxiliar")).toBeVisible();
  expect(screen.getByTestId("location")).toHaveTextContent("/configuracoes?tipo=point");
  expect(storeRpc).toHaveBeenCalledWith("soja_store_save_location", {
    ...scope, _request_id: expect.any(String), _expected_version: null,
    _payload: { name: "Ponto auxiliar", kind: "point", status: "active", notes: "Próximo à entrada" },
  });
});
