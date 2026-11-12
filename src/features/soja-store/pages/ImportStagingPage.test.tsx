import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storeRpc } from "../api/store";
import { ImportStagingPage } from "./ImportStagingPage";

vi.mock("../api/store", async (original) => ({
  ...await original<typeof import("../api/store")>(),
  storeRpc: vi.fn(),
}));

const batchId = "123e4567-e89b-42d3-a456-426614174000";
const batch = {
  id: batchId, file_name: "Conferência.csv", file_id: "fonte-1", source_version: "v1", classification: "historical",
  sheet: "", as_of: null, sha256: "0".repeat(64), row_count: 1, flagged_count: 1, pending_count: 1, version: 1,
  status: "staged", review_reason: null, created_at: "2026-11-12T17:00:00Z",
};
const row = {
  source_row: 2, original: { Quantidade: "25+15" }, normalized: { quantity: null },
  warnings: ["quantity:ambiguous_number"], review: null,
};

function open(canManage: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/comissoes/soja-store/importacoes?lote=${batchId}`]}>
        <ImportStagingPage scope={{ _org_id: "org", _commission_id: "comissão" }} queryKey={["soja-store", "user", "org", "comissão"]} canManage={canManage} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Soja Store import staging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storeRpc).mockImplementation(async (name) => {
      if (name === "soja_store_import_batches") return { items: [batch], total: 1 };
      if (name === "soja_store_import_preview") return { batch, items: [row], total: 1 };
      if (name === "soja_store_review_import_line") return { id: batchId, version: 1, status: "checked" };
      throw new Error(`Unexpected RPC: ${name}`);
    });
  });

  it("shows the original expression and pending reason with read-only access", async () => {
    open(false);

    expect(await screen.findByRole("heading", { name: "Linha 2" })).toBeInTheDocument();
    expect(screen.getByText("Quantidade · valor requer conferência")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Valores na fonte"));
    expect(screen.getByText("25+15")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Salvar lote para conferência" })).not.toBeInTheDocument();
    expect(screen.queryByText("Registrar conferência")).not.toBeInTheDocument();
  });

  it("sends the human correction with its original row and expected revision", async () => {
    open(true);
    const row = (await screen.findByRole("heading", { name: "Linha 2" })).closest("li")!;
    const controls = within(row);
    await userEvent.click(controls.getByText("Registrar conferência"));
    await userEvent.type(controls.getByLabelText("Quantidade", { exact: true }), "40");
    await userEvent.type(controls.getByLabelText("Motivo da conferência"), "Contagem verificada");
    await userEvent.click(controls.getByRole("button", { name: "Salvar conferência" }));

    await waitFor(() => expect(storeRpc).toHaveBeenCalledWith("soja_store_review_import_line", {
      _org_id: "org", _commission_id: "comissão", _request_id: expect.any(String), _expected_version: 0,
      _payload: { batch_id: batchId, source_row: 2, status: "checked", reason: "Contagem verificada", values: { quantity: "40" } },
    }));
  });
});
