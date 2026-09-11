import type { VenueApproval, VenueAuditEntry } from "@/lib/venue-operations";

/**
 * Linha do tempo operacional do evento (Agenda Restaurante e Arena).
 *
 * Funde três fontes já existentes/persistidas — auditoria do sistema,
 * decisões (aprovações) e apontamentos manuais — em uma única lista
 * cronológica tipada, com rótulos em português.
 */

export interface VenueEventNote {
  id: string;
  org_id: string;
  event_id: string;
  body: string;
  author_user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type VenueHistoryKind = "sistema" | "documento" | "apontamento";

export interface VenueHistoryItem {
  id: string;
  kind: VenueHistoryKind;
  /** Grupo usado pelos filtros da aba Histórico. */
  filter: "apontamentos" | "sistema" | "documentos";
  at: string;
  actorUserId: string | null;
  title: string;
  body?: string | null;
  reason?: string | null;
  noteId?: string;
  edited?: boolean;
  source: "audit" | "approval" | "note";
  raw?: VenueAuditEntry;
}

const VENUE_ACTION_LABELS: Record<string, string> = {
  create: "Evento criado",
  update: "Evento atualizado",
  status_change: "Status alterado",
  delete: "Registro removido",
  import: "Registro importado",
  evento_criado: "Evento criado",
  evento_atualizado: "Evento atualizado",
  evento_aprovado: "Evento aprovado",
  evento_confirmado: "Evento confirmado",
  evento_cancelado: "Evento cancelado",
  evento_concluido: "Evento concluído",
  documento_registrado: "Documento registrado",
  documento_removido: "Documento removido",
  operacao_atualizada: "Operação atualizada",
  contrapartida_atualizada: "Contrapartida atualizada",
  checklist_atualizado: "Checklist atualizado",
  recurso_atualizado: "Recurso atualizado",
  apontamento_registrado: "Apontamento registrado",
  apontamento_editado: "Apontamento editado",
  apontamento_removido: "Apontamento removido",
};

const ENTITY_FALLBACK_LABELS: Record<string, string> = {
  venue_event: "Evento atualizado",
  venue_event_document: "Documento atualizado",
  venue_event_approval: "Decisão registrada",
  venue_event_resource: "Recurso atualizado",
  venue_checklist_item: "Checklist atualizado",
  venue_counterpart_usage: "Contrapartida atualizada",
  venue_event_responsible: "Responsáveis atualizados",
  venue_event_space: "Áreas atualizadas",
};

export function humanizeVenueAction(entry: VenueAuditEntry): string {
  const venueAction =
    (entry.after_data?.venue_action as string | undefined) ??
    (entry.before_data?.venue_action as string | undefined);
  if (venueAction && VENUE_ACTION_LABELS[venueAction]) {
    return VENUE_ACTION_LABELS[venueAction];
  }
  if (entry.entity === "venue_event_document") {
    if (entry.action === "create") return "Documento registrado";
    if (entry.action === "delete") return "Documento removido";
  }
  if (entry.entity === "venue_event" && VENUE_ACTION_LABELS[entry.action]) {
    return VENUE_ACTION_LABELS[entry.action];
  }
  return (
    ENTITY_FALLBACK_LABELS[entry.entity] ??
    VENUE_ACTION_LABELS[entry.action] ??
    String(venueAction ?? entry.action).replaceAll("_", " ")
  );
}

const APPROVAL_LABELS: Record<string, string> = {
  aprovado: "Evento aprovado",
  reprovado: "Evento reprovado",
  aprovado_com_ressalva: "Aprovado com ressalva",
};

function auditFilterGroup(entry: VenueAuditEntry): "sistema" | "documentos" {
  return entry.entity === "venue_event_document" ? "documentos" : "sistema";
}

function documentName(entry: VenueAuditEntry): string | null {
  const data = entry.after_data ?? entry.before_data ?? {};
  const name = (data.file_name ?? data.title ?? data.document_type) as
    | string
    | undefined;
  return name ? String(name) : null;
}

export function buildVenueEventHistory({
  audit = [],
  approvals = [],
  notes = [],
}: {
  audit?: VenueAuditEntry[];
  approvals?: VenueApproval[];
  notes?: VenueEventNote[];
}): VenueHistoryItem[] {
  const items: VenueHistoryItem[] = [];

  for (const entry of audit) {
    // Apontamentos aparecem a partir do próprio registro (fonte "note"),
    // então a auditoria correspondente não é duplicada nesta linha do tempo.
    if (entry.entity === "venue_event_note") continue;
    items.push({
      id: `audit:${entry.id}`,
      kind: entry.entity === "venue_event_document" ? "documento" : "sistema",
      filter: auditFilterGroup(entry),
      at: entry.created_at,
      actorUserId: entry.actor_user_id ?? null,
      title: humanizeVenueAction(entry),
      body: documentName(entry),
      reason: (entry.after_data?.reason as string | undefined) ?? null,
      source: "audit",
      raw: entry,
    });
  }

  for (const approval of approvals) {
    items.push({
      id: `approval:${approval.id}`,
      kind: "sistema",
      filter: "sistema",
      at: approval.created_at,
      actorUserId: approval.approver_id ?? null,
      title:
        APPROVAL_LABELS[approval.decision] ??
        String(approval.decision).replaceAll("_", " "),
      reason: approval.reason ?? null,
      source: "approval",
    });
  }

  for (const note of notes) {
    if (note.deleted_at) continue;
    items.push({
      id: `note:${note.id}`,
      kind: "apontamento",
      filter: "apontamentos",
      at: note.created_at,
      actorUserId: note.author_user_id,
      title: "Apontamento",
      body: note.body,
      noteId: note.id,
      edited: note.updated_at !== note.created_at,
      source: "note",
    });
  }

  return items.sort((a, b) => {
    const diff = new Date(b.at).getTime() - new Date(a.at).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

export const VENUE_HISTORY_FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "apontamentos", label: "Apontamentos" },
  { value: "sistema", label: "Sistema" },
  { value: "documentos", label: "Documentos" },
] as const;

export type VenueHistoryFilter =
  (typeof VENUE_HISTORY_FILTERS)[number]["value"];

export function filterVenueHistory(
  items: VenueHistoryItem[],
  filter: VenueHistoryFilter,
): VenueHistoryItem[] {
  if (filter === "todos") return items;
  return items.filter((item) => item.filter === filter);
}
