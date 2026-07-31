import { describe, expect, it } from "vitest";

import {
  VENUE_EVENT_TYPES,
  buildDraftSchedule,
  buildVenueReport,
  calculateCounterpartBalance,
  calculateUsageQuantity,
  combineSaoPauloDateTime,
  createEmptyVenueEventDraft,
  eventReadiness,
  eventToDraft,
  findLocalAvailabilityConflicts,
  mapVenueError,
  rangesOverlap,
  toEventRpcPayload,
  venueEventDraftSchema,
  type VenueChecklistItem,
  type VenueCounterpartUsage,
  type VenueEvent,
  type VenueEventAllocation,
  type VenueEventDraft,
  type VenueEventResource,
  type VenueSpace,
  type VenueSpaceBlock,
  type VenueStakeholder,
} from "@/lib/venue-operations";

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const RESTAURANT_ID = "00000000-0000-4000-8000-000000000002";
const ARENA_ID = "00000000-0000-4000-8000-000000000003";
const EVENT_ID = "00000000-0000-4000-8000-000000000004";
const SPONSOR_ID = "00000000-0000-4000-8000-000000000005";
const AGREEMENT_ID = "00000000-0000-4000-8000-000000000006";
const USER_ID = "00000000-0000-4000-8000-000000000007";

function makeDraft(overrides: Partial<VenueEventDraft> = {}): VenueEventDraft {
  return {
    ...createEmptyVenueEventDraft(),
    title: "Jantar institucional",
    venueIds: [RESTAURANT_ID],
    startDate: "2028-04-29",
    startTime: "19:00",
    endDate: "2028-04-29",
    endTime: "22:00",
    setupStartDate: "2028-04-29",
    setupStartTime: "18:00",
    teardownEndDate: "2028-04-29",
    teardownEndTime: "23:00",
    requesterName: "Comissão Central",
    estimatedAudience: "400",
    ...overrides,
  };
}

function makeSpace(
  id: string,
  name: string,
  capacity: number,
  overrides: Partial<VenueSpace> = {},
): VenueSpace {
  return {
    id,
    org_id: ORG_ID,
    parent_space_id: null,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    name,
    type: "venue",
    description: null,
    capacity,
    location: "Parque de Exposições",
    available_areas: [],
    restrictions: [],
    allowed_event_types: [...VENUE_EVENT_TYPES],
    standard_opening_hours: { daily_start: "08:00", daily_end: "23:59" },
    required_setup_minutes: 60,
    required_teardown_minutes: 60,
    default_responsible_team: "Operações",
    available_resources: [],
    internal_notes: null,
    active: true,
    version: 1,
    created_at: "2026-07-27T12:00:00Z",
    updated_at: "2026-07-27T12:00:00Z",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<VenueEvent> = {}): VenueEvent {
  return {
    id: EVENT_ID,
    org_id: ORG_ID,
    title: "Evento existente",
    executive_description: null,
    event_type: "institucional",
    requested_area: null,
    pending_date: false,
    start_at: "2028-04-29T16:00:00-03:00",
    end_at: "2028-04-29T17:00:00-03:00",
    setup_start_at: "2028-04-29T15:00:00-03:00",
    teardown_end_at: "2028-04-29T18:00:00-03:00",
    requester_name: "Secretaria Executiva",
    requester_user_id: USER_ID,
    responsible_organization_id: null,
    sponsor_id: null,
    responsible_user_id: USER_ID,
    estimated_audience: 200,
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
    created_by: USER_ID,
    updated_by: USER_ID,
    completed_at: null,
    version: 1,
    created_at: "2026-07-27T12:00:00Z",
    updated_at: "2026-07-27T12:00:00Z",
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

function makeAllocation(
  overrides: Partial<VenueEventAllocation> = {},
): VenueEventAllocation {
  return {
    id: "00000000-0000-4000-8000-000000000008",
    org_id: ORG_ID,
    event_id: EVENT_ID,
    space_id: RESTAURANT_ID,
    requested_area: null,
    start_at: "2028-04-29T16:00:00-03:00",
    end_at: "2028-04-29T17:00:00-03:00",
    setup_start_at: "2028-04-29T15:00:00-03:00",
    teardown_end_at: "2028-04-29T18:00:00-03:00",
    blocks_availability: true,
    conflict_override: false,
    created_at: "2026-07-27T12:00:00Z",
    ...overrides,
  };
}

function makeBlock(overrides: Partial<VenueSpaceBlock> = {}): VenueSpaceBlock {
  return {
    id: "00000000-0000-4000-8000-000000000009",
    org_id: ORG_ID,
    space_id: RESTAURANT_ID,
    block_type: "manutencao",
    title: "Manutenção preventiva",
    starts_at: "2028-04-29T18:00:00-03:00",
    ends_at: "2028-04-29T20:00:00-03:00",
    stakeholder_id: null,
    reason: "Revisão elétrica programada",
    active: true,
    version: 1,
    created_at: "2026-07-27T12:00:00Z",
    updated_at: "2026-07-27T12:00:00Z",
    ...overrides,
  };
}

function makeUsage(
  state: VenueCounterpartUsage["usage_state"],
  quantity: number,
  overrides: Partial<VenueCounterpartUsage> = {},
): VenueCounterpartUsage {
  return {
    id: crypto.randomUUID(),
    org_id: ORG_ID,
    agreement_id: AGREEMENT_ID,
    event_id: EVENT_ID,
    usage_state: state,
    requested_quantity: quantity,
    excess_quantity: 0,
    approved_excess_quantity: 0,
    excess_approval_status: "nao_necessario",
    approved_by: null,
    approved_at: null,
    observation: null,
    superseded_at: null,
    created_at: "2026-07-27T12:00:00Z",
    updated_at: "2026-07-27T12:00:00Z",
    ...overrides,
  };
}

function makeChecklist(
  id: string,
  overrides: Partial<VenueChecklistItem> = {},
): VenueChecklistItem {
  return {
    id,
    org_id: ORG_ID,
    event_id: EVENT_ID,
    title: `Item ${id}`,
    responsible_user_id: USER_ID,
    deadline: null,
    status: "pendente",
    note: null,
    phase: "pre_evento",
    required: true,
    sort_order: 0,
    completed_at: null,
    version: 1,
    ...overrides,
  };
}

function makeResource(
  id: string,
  overrides: Partial<VenueEventResource> = {},
): VenueEventResource {
  return {
    id,
    org_id: ORG_ID,
    event_id: EVENT_ID,
    resource_type: "seguranca",
    quantity: 1,
    responsible_team: "Operações",
    responsible_user_id: USER_ID,
    required_at: null,
    confirmation_status: "solicitado",
    completion_status: "pendente",
    notes: null,
    version: 1,
    ...overrides,
  };
}

describe("solicitações preliminares de espaço", () => {
  it("aceita data pendente sem criar ocupação ou datas artificiais", () => {
    const draft = makeDraft({
      pendingDate: true,
      startDate: "",
      startTime: "",
      endDate: "",
      endTime: "",
      setupStartDate: "",
      setupStartTime: "",
      teardownEndDate: "",
      teardownEndTime: "",
    });

    expect(venueEventDraftSchema.safeParse(draft).success).toBe(true);
    expect(buildDraftSchedule(draft)).toEqual({
      startAt: null,
      endAt: null,
      setupStartAt: null,
      teardownEndAt: null,
    });
    expect(
      findLocalAvailabilityConflicts(draft, {
        events: [makeEvent()],
        allocations: [makeAllocation()],
        spaces: [makeSpace(RESTAURANT_ID, "Restaurante", 600)],
        blocks: [makeBlock()],
      }),
    ).toEqual([]);
    expect(toEventRpcPayload(draft)).toMatchObject({
      pending_date: true,
      start_at: null,
      end_at: null,
      setup_start_at: null,
      teardown_end_at: null,
    });
  });

  it("exige período completo em uma solicitação já agendada", () => {
    const result = venueEventDraftSchema.safeParse(
      makeDraft({ startDate: "", startTime: "" }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(["startDate", "startTime"]),
    );
  });
});

describe("erros operacionais", () => {
  it("identifica migration ausente pelos campos estruturados do PostgREST", () => {
    expect(
      mapVenueError({
        code: "PGRST205",
        message:
          "Could not find the table 'public.venue_spaces' in the schema cache",
      }),
    ).toContain("migration precisa ser aplicada");
  });

  it("traduz invariants de compromisso, stakeholder e espaço", () => {
    expect(mapVenueError({ message: "VENUE_COMMITTED_EXCESS_UNAPPROVED" })).toContain(
      "uso já comprometido",
    );
    expect(mapVenueError({ message: "VENUE_STAKEHOLDER_ACTIVE_EVENTS" })).toContain(
      "eventos vinculados",
    );
    expect(mapVenueError({ message: "VENUE_SPACE_ACTIVE_RESERVATIONS" })).toContain(
      "reservas operacionais",
    );
  });
});

describe("conflitos e políticas de ocupação", () => {
  const restaurant = makeSpace(RESTAURANT_ID, "Restaurante", 600);

  it("considera montagem e desmontagem, mas permite intervalos adjacentes", () => {
    expect(
      rangesOverlap(
        "2028-04-29T17:00:00-03:00",
        "2028-04-29T18:00:00-03:00",
        "2028-04-29T18:00:00-03:00",
        "2028-04-29T19:00:00-03:00",
      ),
    ).toBe(false);

    const setupOverlap = findLocalAvailabilityConflicts(
      makeDraft({
        startTime: "18:30",
        endTime: "20:00",
        setupStartTime: "17:30",
        teardownEndTime: "21:00",
      }),
      {
        events: [makeEvent()],
        allocations: [makeAllocation()],
        spaces: [restaurant],
        blocks: [],
      },
    );
    expect(
      setupOverlap.filter((conflict) => conflict.kind === "event"),
    ).toEqual([
      expect.objectContaining({
        id: makeAllocation().id,
        title: "Evento existente",
      }),
    ]);

    const teardownOverlap = findLocalAvailabilityConflicts(
      makeDraft({
        startTime: "13:00",
        endTime: "14:30",
        setupStartTime: "12:00",
        teardownEndTime: "15:30",
      }),
      {
        events: [makeEvent()],
        allocations: [makeAllocation()],
        spaces: [restaurant],
        blocks: [],
      },
    );
    expect(teardownOverlap.some((conflict) => conflict.kind === "event")).toBe(
      true,
    );

    const adjacent = findLocalAvailabilityConflicts(
      makeDraft({
        startTime: "19:00",
        endTime: "20:00",
        setupStartTime: "18:00",
        teardownEndTime: "21:00",
      }),
      {
        events: [makeEvent()],
        allocations: [makeAllocation()],
        spaces: [restaurant],
        blocks: [],
      },
    );
    expect(adjacent.filter((conflict) => conflict.kind === "event")).toEqual(
      [],
    );
  });

  it("detecta bloqueios ativos e ignora eventos sem efeito de reserva", () => {
    const conflicts = findLocalAvailabilityConflicts(makeDraft(), {
      events: [
        makeEvent({ status: "rascunho" }),
        makeEvent({
          id: "00000000-0000-4000-8000-000000000010",
          status: "cancelado",
        }),
      ],
      allocations: [makeAllocation()],
      spaces: [restaurant],
      blocks: [makeBlock()],
    });

    expect(conflicts.filter((conflict) => conflict.kind === "event")).toEqual(
      [],
    );
    expect(conflicts.filter((conflict) => conflict.kind === "block")).toEqual([
      expect.objectContaining({ title: "Manutenção preventiva" }),
    ]);
  });

  it("soma a capacidade dos dois espaços e aplica as políticas de cada um", () => {
    const arena = makeSpace(ARENA_ID, "Arena", 5_000, {
      allowed_event_types: ["show", "cultural"],
      required_setup_minutes: 120,
    });
    const spaces = [restaurant, arena];
    const draft = makeDraft({
      venueIds: [RESTAURANT_ID, ARENA_ID],
      eventType: "jantar",
      estimatedAudience: "5601",
    });

    const conflicts = findLocalAvailabilityConflicts(draft, {
      events: [],
      allocations: [],
      spaces,
      blocks: [],
    });

    expect(conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "capacity",
          title: "Capacidade combinada dos espaços excedida",
        }),
        expect.objectContaining({ kind: "policy", spaceId: ARENA_ID }),
        expect.objectContaining({ id: `policy-setup-${ARENA_ID}` }),
      ]),
    );

    const atLimit = findLocalAvailabilityConflicts(
      { ...draft, eventType: "show", estimatedAudience: "5600" },
      { events: [], allocations: [], spaces, blocks: [] },
    );
    expect(atLimit.some((conflict) => conflict.kind === "capacity")).toBe(
      false,
    );
  });
});

describe("consumo de contrapartidas", () => {
  it("calcula unidades por evento, hora, turno, dia, capacidade e valor explícito", () => {
    const schedule = {
      startAt: "2028-04-29T19:00:00-03:00",
      endAt: "2028-04-29T22:30:00-03:00",
    };

    expect(calculateUsageQuantity("evento", schedule)).toBe(1);
    expect(calculateUsageQuantity("data_exclusiva", schedule)).toBe(1);
    expect(calculateUsageQuantity("hora", schedule)).toBe(3.5);
    expect(calculateUsageQuantity("turno", schedule)).toBe(1);
    expect(calculateUsageQuantity("capacidade", schedule, 750)).toBe(750);
    expect(calculateUsageQuantity("monetario", schedule, 0, 12_500)).toBe(
      12_500,
    );
    expect(
      calculateUsageQuantity("dia", {
        startAt: "2028-04-29T23:30:00-03:00",
        endAt: "2028-04-30T01:00:00-03:00",
      }),
    ).toBe(2);
  });

  it("ignora no-show sem consumo de franquia e nunca debita cancelamentos", () => {
    const balance = calculateCounterpartBalance(
      { granted_quantity: 4, no_show_consumes_allowance: false },
      [
        makeUsage("consumido", 2),
        makeUsage("reservado", 1),
        makeUsage("pendente", 3),
        makeUsage("cancelado", 100),
        makeUsage("no_show", 2),
      ],
    );

    expect(balance).toEqual({
      granted: 4,
      consumed: 2,
      reserved: 1,
      pending: 3,
      remaining: 1,
      projectedExcess: 2,
      confirmedExcess: 0,
      percentCommitted: 75,
    });
  });

  it("consome a franquia do no-show quando a política do acordo determina", () => {
    const balance = calculateCounterpartBalance(
      { granted_quantity: 4, no_show_consumes_allowance: true },
      [
        makeUsage("consumido", 2),
        makeUsage("reservado", 1),
        makeUsage("pendente", 3),
        makeUsage("cancelado", 100),
        makeUsage("no_show", 2),
      ],
    );

    expect(balance).toEqual({
      granted: 4,
      consumed: 4,
      reserved: 1,
      pending: 3,
      remaining: 0,
      projectedExcess: 4,
      confirmedExcess: 1,
      percentCommitted: 100,
    });
  });
});

describe("prontidão operacional", () => {
  it("conta somente checklist pré-evento e recursos efetivamente finalizados", () => {
    const checklist = [
      makeChecklist("check-1", { status: "concluido" }),
      makeChecklist("check-2", { status: "dispensado" }),
      makeChecklist("check-3"),
      makeChecklist("check-pos", { phase: "pos_evento" }),
    ];
    const resources = [
      makeResource("resource-1", {
        confirmation_status: "confirmado",
        completion_status: "concluido",
      }),
      makeResource("resource-2", {
        confirmation_status: "confirmado",
        completion_status: "pendente",
      }),
      makeResource("resource-3", {
        confirmation_status: "dispensado",
        completion_status: "nao_aplicavel",
      }),
      makeResource("resource-4", {
        confirmation_status: "indisponivel",
        completion_status: "pendente",
      }),
    ];

    expect(eventReadiness(EVENT_ID, checklist, resources)).toEqual({
      completed: 4,
      total: 7,
      percentage: 57,
      ready: false,
    });

    expect(
      eventReadiness(
        EVENT_ID,
        checklist.map((item) => ({
          ...item,
          status: item.phase === "pre_evento" ? "concluido" : item.status,
        })),
        resources.map((resource) => ({
          ...resource,
          confirmation_status: "confirmado",
          completion_status: "concluido",
        })),
      ),
    ).toMatchObject({ percentage: 100, ready: true });
  });
});

describe("relatórios e fuso horário", () => {
  const restaurant = makeSpace(RESTAURANT_ID, "Restaurante", 600);
  const arena = makeSpace(ARENA_ID, "Arena", 5_000);
  const sponsor: VenueStakeholder = {
    id: SPONSOR_ID,
    org_id: ORG_ID,
    legal_name: "Cooperativa Exemplo",
    trade_name: "Coop Exemplo",
    normalized_name: "cooperativa exemplo",
    document_identifier: null,
    contact_name: null,
    email: null,
    phone: null,
    relationship_type: "patrocinador",
    contract_reference: null,
    sponsor_category: "Ouro",
    active_from: null,
    active_until: null,
    notes: null,
    active: true,
    version: 1,
    created_at: "2026-07-27T12:00:00Z",
    updated_at: "2026-07-27T12:00:00Z",
  };

  it("agrega apenas o período solicitado, por espaço, status e patrocinador", () => {
    const completed = makeEvent({
      id: "00000000-0000-4000-8000-000000000011",
      title: "Evento concluído",
      start_at: "2028-04-29T19:00:00-03:00",
      end_at: "2028-04-29T21:00:00-03:00",
      setup_start_at: "2028-04-29T18:00:00-03:00",
      teardown_end_at: "2028-04-29T23:00:00-03:00",
      status: "concluido",
      confirmed_audience: 100,
      sponsor_id: SPONSOR_ID,
    });
    const cancelled = makeEvent({
      id: "00000000-0000-4000-8000-000000000012",
      title: "Evento cancelado",
      start_at: "2028-04-30T10:00:00-03:00",
      end_at: "2028-04-30T11:00:00-03:00",
      setup_start_at: "2028-04-30T09:30:00-03:00",
      teardown_end_at: "2028-04-30T11:30:00-03:00",
      status: "cancelado",
      confirmed_audience: null,
      estimated_audience: 300,
      sponsor_id: SPONSOR_ID,
    });
    const outside = makeEvent({
      id: "00000000-0000-4000-8000-000000000013",
      title: "Fora do período",
      start_at: "2028-05-02T00:00:00-03:00",
      end_at: "2028-05-02T01:00:00-03:00",
    });
    const allocations = [
      makeAllocation({
        id: "alloc-1",
        event_id: completed.id,
        setup_start_at: completed.setup_start_at,
        teardown_end_at: completed.teardown_end_at,
      }),
      makeAllocation({
        id: "alloc-2",
        event_id: completed.id,
        space_id: ARENA_ID,
        setup_start_at: completed.setup_start_at,
        teardown_end_at: completed.teardown_end_at,
      }),
      makeAllocation({
        id: "alloc-3",
        event_id: cancelled.id,
        setup_start_at: cancelled.setup_start_at,
        teardown_end_at: cancelled.teardown_end_at,
      }),
      makeAllocation({ id: "alloc-outside", event_id: outside.id }),
    ];

    const report = buildVenueReport(
      {
        events: [completed, cancelled, outside],
        allocations,
        spaces: [restaurant, arena],
        stakeholders: [sponsor],
      },
      {
        from: combineSaoPauloDateTime("2028-04-29", "00:00"),
        to: combineSaoPauloDateTime("2028-05-02", "00:00"),
      },
    );

    expect(report).toMatchObject({
      totalEvents: 2,
      completedEvents: 1,
      cancelledEvents: 1,
      totalAudience: 400,
      averageAudience: 200,
      totalOperationalHours: 12,
    });
    expect(report.bySpace).toEqual([
      expect.objectContaining({
        spaceId: RESTAURANT_ID,
        events: 2,
        hours: 7,
        occupancyRate: 16.67,
      }),
      expect.objectContaining({
        spaceId: ARENA_ID,
        events: 1,
        hours: 5,
        occupancyRate: 11.9,
      }),
    ]);
    expect(report.byStatus).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "concluido", count: 1 }),
        expect.objectContaining({ status: "cancelado", count: 1 }),
      ]),
    );
    expect(report.bySponsor).toEqual([
      { stakeholderId: SPONSOR_ID, name: "Coop Exemplo", count: 2 },
    ]);
  });

  it("mantém o horário civil de São Paulo no payload e ao reeditar", () => {
    const draft = makeDraft({
      startDate: "2028-04-30",
      startTime: "22:30",
      endDate: "2028-05-01",
      endTime: "00:30",
      setupStartDate: "2028-04-30",
      setupStartTime: "21:30",
      teardownEndDate: "2028-05-01",
      teardownEndTime: "01:30",
    });
    const payload = toEventRpcPayload(draft);

    expect(payload.start_at).toBe("2028-04-30T22:30:00-03:00");
    expect(new Date(payload.start_at!).toISOString()).toBe(
      "2028-05-01T01:30:00.000Z",
    );

    const persisted = makeEvent({
      start_at: payload.start_at,
      end_at: payload.end_at,
      setup_start_at: payload.setup_start_at,
      teardown_end_at: payload.teardown_end_at,
    });
    const allocation = makeAllocation({
      start_at: payload.start_at,
      end_at: payload.end_at,
      setup_start_at: payload.setup_start_at,
      teardown_end_at: payload.teardown_end_at,
    });
    const reconstructed = eventToDraft(persisted, [allocation], [], []);

    expect(reconstructed).toMatchObject({
      startDate: "2028-04-30",
      startTime: "22:30",
      endDate: "2028-05-01",
      endTime: "00:30",
    });
  });
});
