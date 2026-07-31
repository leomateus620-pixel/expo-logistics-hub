import { describe, expect, it } from "vitest";
import {
  agendaBadges,
  eventYear,
  formatBrPhone,
  formatBrl,
  monthGroupLabel,
  normalizeSearchText,
} from "@/lib/venue-agenda";
import type { VenueEvent } from "@/lib/venue-operations";

function makeEvent(overrides: Partial<VenueEvent> = {}): VenueEvent {
  return {
    id: "evt",
    org_id: "org",
    title: "Almoço de Ideias",
    executive_description: null,
    event_type: "institucional",
    requested_area: null,
    pending_date: false,
    start_at: "2026-06-19T11:00:00-03:00",
    end_at: "2026-06-22T15:00:00-03:00",
    setup_start_at: null,
    teardown_end_at: null,
    requester_name: "Rotary Club",
    requester_user_id: null,
    responsible_organization_id: null,
    sponsor_id: null,
    responsible_user_id: null,
    estimated_audience: null,
    confirmed_audience: null,
    target_audience: null,
    status: "confirmado",
    approval_status: "aprovado",
    priority: "media",
    visibility: "institucional",
    counterpart_agreement_id: null,
    counterpart_requested_quantity: null,
    observations: null,
    event_result: null,
    cancellation_reason: null,
    conflict_status: "livre",
    conflict_override_reason: null,
    conflict_override_fingerprint: null,
    created_by: "user",
    updated_by: "user",
    completed_at: null,
    version: 1,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    confirmation_status: "nao_informado",
    contract_status: "nao_informado",
    payment_status: "nao_informado",
    shift: null,
    contact_name: null,
    contact_phone: null,
    fee_type: null,
    fee_amount: null,
    fee_quantity: null,
    cleaning_responsibility: null,
    cleaning_fee: null,
    electricity_fee: null,
    preparation_notes: null,
    preparation_start_date: null,
    preparation_end_date: null,
    teardown_deadline_note: null,
    reservation_start_date: null,
    reservation_end_date: null,
    operational_notes: null,
    internal_notes: null,
    requires_review: false,
    review_reasons: [],
    source_document: null,
    source_row: null,
    source_fingerprint: null,
    import_batch_id: null,
    ...overrides,
  };
}

describe("venue agenda presentation", () => {
  it("normalizes accents and casing for search", () => {
    expect(normalizeSearchText("Cotrirosa  ÁÇÃO")).toBe("cotrirosa acao");
  });

  it("does not render badges when nothing was informed", () => {
    expect(agendaBadges(makeEvent())).toEqual([]);
  });

  it("renders only the informed agenda badges", () => {
    const badges = agendaBadges(
      makeEvent({
        confirmation_status: "confirmado",
        payment_status: "pago",
        requires_review: true,
        review_reasons: ["Título não confiável"],
      }),
    );
    expect(badges.map((badge) => badge.key)).toEqual([
      "confirmation",
      "payment",
      "review",
    ]);
    expect(badges[2].title).toContain("Título não confiável");
  });

  it("formats BR phones and currency", () => {
    expect(formatBrPhone("5551997249968")).toBe("(51) 99724-9968");
    expect(formatBrPhone(null)).toBe("");
    expect(formatBrl(1500).replace(/\u00a0/g, " ")).toBe("R$ 1.500,00");
  });

  it("derives year and month group in São Paulo time", () => {
    expect(eventYear(makeEvent())).toBe("2026");
    expect(monthGroupLabel("2026-06-19T11:00:00-03:00")).toBe("Junho de 2026");
    expect(monthGroupLabel(null)).toBe("Sem data definida");
  });
});
