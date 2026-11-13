import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CashPage } from "./CashPage";
import { PosRulePanel } from "./PosRulePanel";
import type { CashSession } from "./types";

const { storeRpc } = vi.hoisted(() => ({ storeRpc: vi.fn() }));
vi.mock("../../api/store", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../api/store")>(),
  storeRpc,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "operator" } }) }));

const scope = { _org_id: "org", _commission_id: "store" };
const queryKey = ["store", "operator", "org"] as const;
const session: CashSession = {
  id: "session", location_id: "point", location_name: "Ponto de teste", operator_id: "operator", status: "open",
  version: 4, opened_at: "2026-11-12T18:00:00Z", closed_at: null, opening_cents: 1000, expected_cents: 1250,
  counted_cents: null, difference_cents: null,
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderPos(page: "cash" | "rule") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      {page === "cash" ? <CashPage scope={scope} queryKey={queryKey} canManage />
        : <PosRulePanel scope={scope} queryKey={queryKey} canManage />}
    </QueryClientProvider>,
  );
}

it("abre caixa com fundo de abertura zero e confirma o ponto na leitura seguinte", async () => {
  let opened = false;
  storeRpc.mockImplementation(async (name) => {
    if (name === "soja_store_pos_config") return { rule: null, points: [{ id: "point", name: session.location_name }] };
    if (name === "soja_store_open_cash") {
      opened = true;
      return { id: session.id, status: "open", version: 1 };
    }
    return { items: opened ? [{ ...session, opening_cents: 0, expected_cents: 0 }] : [] };
  });
  renderPos("cash");
  fireEvent.click(await screen.findByRole("button", { name: "Abrir caixa" }));
  await screen.findByRole("option", { name: session.location_name });
  fireEvent.change(screen.getByRole("combobox", { name: "Ponto de atendimento" }), { target: { value: "point" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Fundo inicial (R$)" }), { target: { value: "0" } });
  fireEvent.click(within(screen.getByRole("dialog", { name: "Abrir caixa" })).getByRole("button", { name: "Abrir caixa" }));
  expect(within(await screen.findByRole("region", { name: "Sessões de caixa" })).getByText(session.location_name)).toBeVisible();
  expect(storeRpc).toHaveBeenCalledWith("soja_store_open_cash", {
    ...scope, _request_id: expect.any(String), _payload: { location_id: "point", opening_cents: 0 },
  });
});

it("exige justificativa da diferença antes de fechar a versão conferida", async () => {
  let closed = false;
  storeRpc.mockImplementation(async (name) => {
    if (name === "soja_store_close_cash") {
      closed = true;
      return { id: session.id, version: 5, status: "closed" };
    }
    return { items: [closed ? { ...session, status: "closed", counted_cents: 1200, difference_cents: -50 } : session] };
  });
  renderPos("cash");
  fireEvent.click(await screen.findByRole("button", { name: "Fechar caixa" }));
  const form = within(screen.getByRole("dialog", { name: "Fechar caixa" }));
  fireEvent.change(form.getByRole("textbox", { name: "Dinheiro contado (R$)" }), { target: { value: "12,00" } });
  fireEvent.click(form.getByRole("button", { name: "Fechar caixa" }));
  expect(form.getByText("Informe o motivo.")).toBeVisible();
  expect(storeRpc).not.toHaveBeenCalledWith("soja_store_close_cash", expect.anything());
  fireEvent.change(form.getByRole("textbox", { name: "Justificativa da diferença, quando houver" }), { target: { value: "Conferência de cédulas" } });
  fireEvent.click(form.getByRole("button", { name: "Fechar caixa" }));
  expect(await screen.findByText("Fechada")).toBeVisible();
  expect(storeRpc).toHaveBeenCalledWith("soja_store_close_cash", {
    ...scope, _request_id: expect.any(String), _expected_version: 4,
    _payload: { session_id: session.id, counted_cents: 1200, reason: "Conferência de cédulas" },
  });
});

it("registra documento e meios autorizados com vendas inicialmente desabilitadas", async () => {
  let saved = false;
  storeRpc.mockImplementation(async (name) => {
    if (name === "soja_store_save_pos_rule") {
      saved = true;
      return { id: "rule", version: 1, status: "draft" };
    }
    return { points: [], rule: saved ? { id: "rule", version: 1, active: false, methods: ["pix"], approval_reference: "Decisão de teste" } : null };
  });
  renderPos("rule");
  fireEvent.click(await screen.findByRole("button", { name: "Registrar aprovação" }));
  expect(screen.getByRole("checkbox", { name: "Habilitar vendas próprias sob esta regra" })).not.toBeChecked();
  fireEvent.change(screen.getByRole("textbox", { name: "Referência do documento de aprovação" }), { target: { value: "Decisão de teste" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Pix" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar regra" }));
  expect(await screen.findByText("Desabilitada")).toBeVisible();
  expect(storeRpc).toHaveBeenCalledWith("soja_store_save_pos_rule", {
    ...scope, _request_id: expect.any(String), _expected_version: null,
    _payload: { approval_reference: "Decisão de teste", methods: ["pix"], active: false },
  });
});
