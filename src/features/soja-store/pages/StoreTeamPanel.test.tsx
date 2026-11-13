import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StoreTeamPanel } from "./StoreTeamPanel";

const { storeRpc } = vi.hoisted(() => ({ storeRpc: vi.fn() }));
vi.mock("../api/store", async (importOriginal) => ({
  ...await importOriginal<typeof import("../api/store")>(), storeRpc,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "actor" } }) }));
vi.mock("@/hooks/useCurrentOrg", () => ({ useCurrentOrg: () => ({ orgId: "org" }) }));

const options = { people: [{ id: "person", name: "Pessoa da equipe" }], locations: [{ id: "point", name: "Ponto de teste" }] };

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderTeam(capabilities: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StoreTeamPanel commissionId="store" access={{ enabled: true, capabilities }} />
    </QueryClientProvider>,
  );
}

it("mantém a equipe operacional sem consultas quando o perfil é somente institucional", () => {
  const view = renderTeam([]);
  expect(view.container).toBeEmptyDOMElement();
  expect(storeRpc).not.toHaveBeenCalled();
});

it("salva turno com pessoa existente e mantém o horário civil na solicitação", async () => {
  let saved = false;
  storeRpc.mockImplementation(async (name) => {
    if (name === "soja_store_save_team_record") {
      saved = true;
      return { id: "record", version: 1, status: "active" };
    }
    const item = { id: "record", person_name: options.people[0].name, title: "Atendimento", starts_at: "2026-11-12T12:00:00Z",
      ends_at: "2026-11-12T14:00:00Z", location_name: options.locations[0].name };
    return { ...options, items: saved ? [item] : [], total: saved ? 1 : 0 };
  });
  renderTeam(["team.view", "team.manage"]);
  fireEvent.click(await screen.findByRole("button", { name: "Agendar turno" }));
  const form = within(screen.getByRole("form", { name: "Agendar turno" }));
  fireEvent.change(form.getByLabelText("Pessoa da equipe"), { target: { value: "person" } });
  fireEvent.change(form.getByLabelText("Função no turno"), { target: { value: "Atendimento" } });
  fireEvent.change(form.getByLabelText("Início (horário de Brasília)"), { target: { value: "2026-11-12T09:00" } });
  fireEvent.change(form.getByLabelText("Término (horário de Brasília)"), { target: { value: "2026-11-12T11:00" } });
  fireEvent.change(form.getByLabelText("Ponto de atendimento (opcional)"), { target: { value: "point" } });
  fireEvent.click(form.getByRole("button", { name: "Salvar registro" }));
  expect(await screen.findByText("Pessoa da equipe · Atendimento")).toBeVisible();
  expect(storeRpc).toHaveBeenCalledWith("soja_store_save_team_record", expect.objectContaining({
    _commission_id: "store", _org_id: "org", _request_id: expect.any(String), _expected_version: null,
    _payload: expect.objectContaining({ kind: "shift", person_id: "person", location_id: "point", starts_local: "2026-11-12T09:00", ends_local: "2026-11-12T11:00" }),
  }));
});
