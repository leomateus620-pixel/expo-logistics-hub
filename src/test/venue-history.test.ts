import { describe, expect, it } from "vitest";
import {
  buildVenueEventHistory,
  filterVenueHistory,
  humanizeVenueAction,
} from "@/lib/venue-history";

const audit = [
  {
    id: "a1",
    org_id: "o1",
    entity: "venue_event",
    entity_id: "e1",
    action: "update",
    actor_user_id: "u1",
    created_at: "2026-03-01T10:00:00Z",
    before_data: null,
    after_data: { venue_action: "evento_atualizado" },
  },
  {
    id: "a2",
    org_id: "o1",
    entity: "venue_event_document",
    entity_id: "d1",
    action: "create",
    actor_user_id: "u2",
    created_at: "2026-03-02T10:00:00Z",
    before_data: null,
    after_data: { file_name: "CONTRATO.PDF" },
  },
  {
    id: "a3",
    org_id: "o1",
    entity: "venue_event_note",
    entity_id: "n1",
    action: "create",
    actor_user_id: "u1",
    created_at: "2026-03-03T10:00:00Z",
    before_data: null,
    after_data: {},
  },
] as never[];

const notes = [
  {
    id: "n1",
    org_id: "o1",
    event_id: "e1",
    body: "CLIENTE CONFIRMOU 120 PESSOAS",
    author_user_id: "u1",
    created_at: "2026-03-03T10:00:00Z",
    updated_at: "2026-03-03T10:00:00Z",
    deleted_at: null,
  },
  {
    id: "n2",
    org_id: "o1",
    event_id: "e1",
    body: "REMOVIDO",
    author_user_id: "u1",
    created_at: "2026-03-04T10:00:00Z",
    updated_at: "2026-03-04T10:00:00Z",
    deleted_at: "2026-03-05T10:00:00Z",
  },
];

describe("venue-history", () => {
  it("ordena do mais recente para o mais antigo e ignora notas removidas", () => {
    const items = buildVenueEventHistory({ audit, notes });
    expect(items.map((item) => item.id)).toEqual([
      "note:n1",
      "audit:a2",
      "audit:a1",
    ]);
  });

  it("não duplica apontamentos vindos da auditoria", () => {
    const items = buildVenueEventHistory({ audit, notes });
    expect(items.filter((item) => item.kind === "apontamento")).toHaveLength(1);
  });

  it("filtra por grupo", () => {
    const items = buildVenueEventHistory({ audit, notes });
    expect(filterVenueHistory(items, "documentos")).toHaveLength(1);
    expect(filterVenueHistory(items, "apontamentos")).toHaveLength(1);
    expect(filterVenueHistory(items, "sistema")).toHaveLength(1);
    expect(filterVenueHistory(items, "todos")).toHaveLength(3);
  });

  it("traduz ações do sistema para português", () => {
    expect(humanizeVenueAction(audit[1] as never)).toBe("Documento registrado");
  });
});
