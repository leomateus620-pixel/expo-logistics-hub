import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { VenueAgreementDialog } from "@/components/venue-events/VenueManagementDialogs";
import type {
  VenueAgreement,
  VenueMember,
  VenueSpace,
  VenueStakeholder,
} from "@/lib/venue-operations";

afterEach(cleanup);

const AGREEMENT: VenueAgreement = {
  id: "agreement-1",
  org_id: "org-1",
  stakeholder_id: "stakeholder-1",
  space_id: "space-1",
  contract_reference: "CONTRATO 20/12/2019",
  valid_from: "2022-01-01",
  valid_until: "2031-12-31",
  benefit_type: "USO_ESPACO",
  unit_type: "evento",
  granted_quantity: 2,
  value_per_excess_unit: null,
  requires_approval: true,
  no_show_consumes_allowance: false,
  allowed_event_types: [
    "institucional",
    "patrocinador",
    "comissao",
    "corporativo",
    "cultural",
    "comercial",
    "cerimonial",
    "reuniao",
    "jantar",
    "lancamento",
    "show",
    "externo",
  ],
  restrictions: ["Agendamento prévio"],
  responsible_approver_id: "user-1",
  document_path: null,
  notes: "Contrato histórico",
  status: "ativo",
  version: 1,
  created_at: "2026-08-12T12:00:00Z",
  updated_at: "2026-08-12T12:00:00Z",
};

const STAKEHOLDERS: VenueStakeholder[] = [
  {
    id: "stakeholder-1",
    org_id: "org-1",
    legal_name: "ALIBEM ALIMENTOS S.A.",
    trade_name: "ALIBEM",
    normalized_name: "alibem",
    document_identifier: null,
    contact_name: null,
    email: null,
    phone: null,
    relationship_type: "patrocinador",
    contract_reference: null,
    sponsor_category: null,
    active_from: null,
    active_until: null,
    notes: null,
    active: true,
    version: 1,
    created_at: "2026-08-12T12:00:00Z",
    updated_at: "2026-08-12T12:00:00Z",
  },
];

const SPACES: VenueSpace[] = [
  {
    id: "space-1",
    org_id: "org-1",
    parent_space_id: null,
    slug: "arena-fenasoja",
    name: "Arena Fenasoja",
    type: "arena",
    description: null,
    capacity: 4000,
    location: "Parque de Exposições",
    available_areas: [],
    restrictions: [],
    allowed_event_types: [],
    standard_opening_hours: {},
    required_setup_minutes: 0,
    required_teardown_minutes: 0,
    default_responsible_team: null,
    available_resources: [],
    internal_notes: null,
    active: true,
    version: 1,
    created_at: "2026-08-12T12:00:00Z",
    updated_at: "2026-08-12T12:00:00Z",
  },
];

const MEMBERS: VenueMember[] = [
  {
    user_id: "user-1",
    nome_exibicao: "Ana Gestora",
    cargo: "Gestora de contratos",
    role: "admin",
    is_active: true,
  },
];

function renderDialog({
  onSave = vi.fn().mockResolvedValue(undefined),
  isSaving = false,
}: {
  onSave?: ReturnType<typeof vi.fn>;
  isSaving?: boolean;
} = {}) {
  const onOpenChange = vi.fn();
  const result = render(
    <VenueAgreementDialog
      open
      onOpenChange={onOpenChange}
      agreement={AGREEMENT}
      stakeholders={STAKEHOLDERS}
      spaces={SPACES}
      members={MEMBERS}
      isSaving={isSaving}
      onSave={onSave}
    />,
  );
  return { ...result, onOpenChange, onSave };
}

describe("edição de contrapartida", () => {
  it("apresenta uma única rolagem com grupos completos e rótulos humanos", () => {
    renderDialog();

    expect(screen.getByRole("heading", { name: "Editar contrapartida" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Identificação" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Condições" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Vigência" })).toBeVisible();
    expect(screen.getByText("Tipos de evento permitidos")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Regras e governança" })).toBeVisible();

    const benefit = screen.getByLabelText("Benefício");
    expect(benefit).toHaveValue("Uso do Espaço");
    expect(screen.queryByDisplayValue("USO_ESPACO")).not.toBeInTheDocument();
    expect(screen.getByText("12 selecionados")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Institucional" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Interno" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Outro" })).not.toBeChecked();

    const scroll = document.querySelector(".venue-agreement-form");
    const save = screen.getByRole("button", { name: "Salvar contrato" });
    expect(scroll).toBeInTheDocument();
    expect(scroll).not.toContainElement(save);
  });

  it("mantém o enum persistido quando o benefício apenas foi visualizado", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onSave });

    fireEvent.click(screen.getByRole("button", { name: "Salvar contrato" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      benefitType: "USO_ESPACO",
      stakeholderId: "stakeholder-1",
      spaceId: "space-1",
      allowedEventTypes: AGREEMENT.allowed_event_types,
    });
  });

  it("oferece seleção clara, dirty guard e ações estáveis", async () => {
    renderDialog();

    fireEvent.click(screen.getByRole("checkbox", { name: "Interno" }));
    expect(screen.getByRole("checkbox", { name: "Interno" })).toBeChecked();
    expect(screen.getByText("13 selecionados")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      await screen.findByRole("heading", { name: "Descartar alterações?" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Continuar editando" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Descartar alterações" })).toBeVisible();
  });

  it("bloqueia ações de gravação enquanto o RPC está em andamento", () => {
    renderDialog({ isSaving: true });
    expect(screen.getByRole("button", { name: "Salvando…" })).toBeDisabled();
  });
});
