import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { VenueAgreementCard } from "@/components/venue-events/VenueAgreementCard";
import {
  buildCounterpartProgress,
  counterpartBalanceValues,
  countCommittedCounterpartEvents,
  getCounterpartBalanceState,
  presentAgreementStatus,
  presentContractReference,
  presentCounterpartBenefit,
  presentCounterpartUnit,
  presentSponsorName,
} from "@/lib/venue-counterparts";
import type {
  VenueAgreement,
  VenueCounterpartBalanceRow,
  VenueCounterpartUsage,
} from "@/lib/venue-operations";

afterEach(cleanup);

const AGREEMENT: VenueAgreement = {
  id: "agreement-1",
  org_id: "org-1",
  stakeholder_id: "sponsor-1",
  space_id: "arena-1",
  contract_reference: "CONTRATO 02/12/2019",
  valid_from: "2022-01-01",
  valid_until: "2031-12-31",
  benefit_type: "USO_ESPACO",
  unit_type: "evento",
  granted_quantity: 10,
  value_per_excess_unit: null,
  requires_approval: true,
  no_show_consumes_allowance: false,
  allowed_event_types: ["institucional", "patrocinador"],
  restrictions: [],
  responsible_approver_id: null,
  document_path: null,
  notes: null,
  status: "ativo",
  version: 1,
  created_at: "2026-08-12T12:00:00Z",
  updated_at: "2026-08-12T12:00:00Z",
};

function makeBalance(
  overrides: Partial<VenueCounterpartBalanceRow> = {},
): VenueCounterpartBalanceRow {
  return {
    id: AGREEMENT.id,
    org_id: AGREEMENT.org_id,
    stakeholder_id: AGREEMENT.stakeholder_id,
    space_id: AGREEMENT.space_id,
    contract_reference: AGREEMENT.contract_reference,
    unit_type: AGREEMENT.unit_type,
    granted_quantity: 10,
    consumed_quantity: 4,
    reserved_quantity: 2,
    pending_quantity: 0,
    remaining_quantity: 4,
    projected_excess_quantity: 0,
    confirmed_excess_quantity: 0,
    ...overrides,
  };
}

function makeUsage(
  eventId: string,
  state: VenueCounterpartUsage["usage_state"],
  overrides: Partial<VenueCounterpartUsage> = {},
): VenueCounterpartUsage {
  return {
    id: `${eventId}-${state}`,
    org_id: AGREEMENT.org_id,
    agreement_id: AGREEMENT.id,
    event_id: eventId,
    usage_state: state,
    requested_quantity: 1,
    excess_quantity: 0,
    approved_excess_quantity: 0,
    excess_approval_status: "nao_necessario",
    approved_by: null,
    approved_at: null,
    observation: null,
    superseded_at: null,
    created_at: "2026-08-12T12:00:00Z",
    updated_at: "2026-08-12T12:00:00Z",
    ...overrides,
  };
}

describe("apresentação de contrapartidas", () => {
  it("humaniza benefícios, status, nomes e referências sem expor enums", () => {
    expect(presentCounterpartBenefit("USO_ESPACO")).toBe("Uso do Espaço");
    expect(presentCounterpartBenefit("RESERVA_AREA_EXCLUSIVA")).toBe(
      "Reserva Area Exclusiva",
    );
    expect(presentCounterpartBenefit("direito de uso da Arena")).toBe(
      "Direito de uso da Arena",
    );
    expect(presentAgreementStatus("ativo")).toBe("Ativo");
    expect(presentCounterpartUnit("evento", 1)).toBe("evento");
    expect(presentCounterpartUnit("evento", 2)).toBe("eventos");
    expect(presentCounterpartUnit("monetario", 1)).toBe("real");
    expect(presentSponsorName("Sicredi/Icatu")).toBe("Sicredi / Icatu");
    expect(presentSponsorName("ALIBEM")).toBe("Alibem");
    expect(presentSponsorName("VIA CERTA")).toBe("Via Certa");
    expect(presentSponsorName("PATROCINADOR COM NOME EXTENSO LTDA")).toBe(
      "Patrocinador com Nome Extenso Ltda",
    );
    expect(presentContractReference("CONTRATO_20/12/2019")).toBe(
      "CONTRATO 20/12/2019",
    );
  });

  it.each([
    {
      name: "totalmente disponível",
      input: { granted: 10, consumed: 0, reserved: 0, remaining: 10 },
      expected: [0, 0, 100, 0],
    },
    {
      name: "parcialmente consumido e reservado",
      input: { granted: 10, consumed: 4, reserved: 2, remaining: 4 },
      expected: [40, 20, 40, 60],
    },
    {
      name: "somente reservado",
      input: { granted: 10, consumed: 0, reserved: 3, remaining: 7 },
      expected: [0, 30, 70, 30],
    },
    {
      name: "sem saldo",
      input: { granted: 10, consumed: 8, reserved: 2, remaining: 0 },
      expected: [80, 20, 0, 100],
    },
    {
      name: "acima da concessão",
      input: { granted: 10, consumed: 12, reserved: 2, remaining: 0 },
      expected: [100, 0, 0, 100],
    },
  ])("compõe a barra completa no estado $name", ({ input, expected }) => {
    const progress = buildCounterpartProgress(input);
    expect([
      progress.consumedPercent,
      progress.reservedPercent,
      progress.availablePercent,
      progress.committedPercent,
    ]).toEqual(expected);
  });

  it("diferencia saldo saudável, reduzido, esgotado e excessos", () => {
    expect(
      getCounterpartBalanceState({
        granted: 10,
        remaining: 8,
        projectedExcess: 0,
        confirmedExcess: 0,
      }),
    ).toBe("healthy");
    expect(
      getCounterpartBalanceState({
        granted: 10,
        remaining: 2,
        projectedExcess: 0,
        confirmedExcess: 0,
      }),
    ).toBe("attention");
    expect(
      getCounterpartBalanceState({
        granted: 10,
        remaining: 0,
        projectedExcess: 0,
        confirmedExcess: 0,
      }),
    ).toBe("exhausted");
    expect(
      getCounterpartBalanceState({
        granted: 10,
        remaining: 0,
        projectedExcess: 1,
        confirmedExcess: 0,
      }),
    ).toBe("projected");
    expect(
      getCounterpartBalanceState({
        granted: 10,
        remaining: 0,
        projectedExcess: 1,
        confirmedExcess: 1,
      }),
    ).toBe("exceeded");
  });

  it("prioriza os valores da visão canônica de saldos", () => {
    expect(
      counterpartBalanceValues(
        { ...AGREEMENT, granted_quantity: 8 },
        makeBalance({ granted_quantity: 10, remaining_quantity: 4 }),
      ),
    ).toMatchObject({ granted: 10, remaining: 4 });
  });

  it("conta eventos únicos realmente comprometidos e ignora lançamentos substituídos", () => {
    const usages = [
      makeUsage("event-1", "reservado"),
      makeUsage("event-1", "consumido"),
      makeUsage("event-2", "pendente"),
      makeUsage("event-3", "cancelado"),
      makeUsage("event-4", "consumido", {
        superseded_at: "2026-08-12T13:00:00Z",
      }),
      makeUsage("event-5", "no_show"),
    ];

    expect(countCommittedCounterpartEvents(AGREEMENT, usages)).toBe(1);
    expect(
      countCommittedCounterpartEvents(
        { ...AGREEMENT, no_show_consumes_allowance: true },
        usages,
      ),
    ).toBe(2);
  });

  it("renderiza hierarquia, segmentos e ação de edição acessível", () => {
    const onEdit = vi.fn();
    const { container } = render(
      <VenueAgreementCard
        agreement={AGREEMENT}
        balance={makeBalance()}
        sponsorName="Sicredi/Icatu"
        spaceName="Arena Fenasoja"
        committedEvents={2}
        canEdit
        selected={false}
        onEdit={onEdit}
      />,
    );

    const card = screen.getByRole("article", {
      name: "Sicredi / Icatu",
    });
    const editAction = screen.getByRole("button", {
      name: "Editar contrapartida de Sicredi / Icatu",
    });
    expect(within(card).getByText("Sicredi / Icatu")).toBeVisible();
    expect(within(card).getByText("Uso do Espaço")).toBeVisible();
    expect(within(card).queryByText("USO_ESPACO")).not.toBeInTheDocument();
    expect(within(card).getByText("CONTRATO 02/12/2019")).toBeVisible();
    expect(within(card).getByText("2 eventos comprometidos")).toBeVisible();
    expect(editAction).toHaveAttribute("aria-haspopup", "dialog");
    expect(editAction).toHaveAttribute("aria-expanded", "false");
    expect(editAction).not.toHaveAttribute("aria-pressed");

    const progress = within(card).getByRole("progressbar", {
      name: "Uso do benefício contratual",
    });
    expect(progress).toHaveAttribute("aria-valuenow", "60");
    expect(progress).toHaveAttribute(
      "aria-valuetext",
      "6 de 10 eventos comprometidos: 4 consumidos, 2 reservados e 4 disponíveis.",
    );
    const segments = container.querySelectorAll(
      ".venue-agreement-progress__segments > span",
    );
    expect(segments[0]).toHaveStyle("--segment-size: 40%");
    expect(segments[1]).toHaveStyle("--segment-size: 20%");
    expect(segments[2]).toHaveStyle("--segment-size: 40%");

    fireEvent.click(editAction);
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("mantém a superfície somente de leitura sem um botão inoperante", () => {
    render(
      <VenueAgreementCard
        agreement={{
          ...AGREEMENT,
          contract_reference:
            "CONTRATO DE PATROCÍNIO COM REFERÊNCIA OPERACIONAL MUITO LONGA 20/12/2019",
        }}
        balance={makeBalance({
          consumed_quantity: 10,
          reserved_quantity: 0,
          remaining_quantity: 0,
        })}
        sponsorName="PATROCINADOR INSTITUCIONAL COM NOME EXTENSO LTDA"
        spaceName="Arena Fenasoja"
        committedEvents={1}
        canEdit={false}
        selected={false}
        onEdit={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("article", {
        name: /Patrocinador Institucional/,
      }),
    ).toHaveAttribute("data-readonly", "true");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Saldo esgotado")).toBeVisible();
  });
});
