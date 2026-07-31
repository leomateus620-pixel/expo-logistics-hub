/**
 * Deduplicação e reconciliação dos eventos extraídos da agenda do restaurante.
 *
 * Dois níveis de proteção:
 * 1. Deduplicação intra-documento — linhas que descrevem o mesmo evento são
 *    fundidas, preservando o registro mais completo e unindo as origens.
 * 2. Detecção de conflitos — registros muito parecidos, mas com datas
 *    diferentes, não são fundidos: são marcados para revisão humana.
 */

import {
  buildFingerprint,
  normalizeText,
  parseAllSourceRows,
  type ParsedRestaurantEvent,
} from "./parser";

export type ImportDisposition =
  | "importar"
  | "importar_com_revisao"
  | "mesclado"
  | "ignorado";

export interface ReconciliationEntry {
  sourceRows: number[];
  fingerprint: string;
  disposition: ImportDisposition;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  reasons: string[];
}

export interface DeduplicationResult {
  events: ParsedRestaurantEvent[];
  reconciliation: ReconciliationEntry[];
  summary: {
    sourceRows: number;
    candidates: number;
    unique: number;
    merged: number;
    ignored: number;
    requiresReview: number;
  };
}

/** Chave de identidade: organização + título + data inicial. */
export function identityKey(event: ParsedRestaurantEvent): string {
  const organizer = normalizeText(event.organizerName ?? "");
  const title = normalizeText(event.eventTitle ?? "");
  return `${organizer}|${title}|${event.startDate ?? "sem-data"}`;
}

/** Chave de similaridade sem a data — usada só para apontar conflitos. */
export function similarityKey(event: ParsedRestaurantEvent): string {
  const organizer = normalizeText(event.organizerName ?? "");
  const title = normalizeText(event.eventTitle ?? "");
  return `${event.sourceYear}|${organizer}|${title}`;
}

function completeness(event: ParsedRestaurantEvent): number {
  const fields = [
    event.eventTitle,
    event.organizerName,
    event.contactName,
    event.contactPhone,
    event.startDate,
    event.shift,
    event.feeType,
    event.operationalNotes,
  ];
  let score = fields.filter(Boolean).length;
  if (event.confirmationStatus !== "nao_informado") score += 1;
  if (event.contractStatus !== "nao_informado") score += 1;
  if (event.paymentStatus !== "nao_informado") score += 1;
  return score;
}

function mergePair(
  primary: ParsedRestaurantEvent,
  secondary: ParsedRestaurantEvent,
): ParsedRestaurantEvent {
  const pick = <K extends keyof ParsedRestaurantEvent>(key: K) =>
    (primary[key] ?? secondary[key]) as ParsedRestaurantEvent[K];

  const sourceRows = [...new Set([...primary.sourceRows, ...secondary.sourceRows])]
    .sort((a, b) => a - b);

  const reviewReasons = [
    ...new Set([
      ...primary.reviewReasons,
      ...secondary.reviewReasons,
      `Linhas ${sourceRows.join(" e ")} do documento descrevem o mesmo evento e foram unificadas.`,
    ]),
  ];

  return {
    ...primary,
    sourceRows,
    fingerprint: buildFingerprint(sourceRows),
    rawText: [primary.rawText, secondary.rawText].join("  ⟂  "),
    eventTitle: pick("eventTitle"),
    organizerName: pick("organizerName"),
    requesterName: pick("requesterName"),
    contactName: pick("contactName"),
    contactPhone: pick("contactPhone"),
    endDate: primary.endDate ?? secondary.endDate,
    shift: pick("shift"),
    startTime: pick("startTime"),
    endTime: pick("endTime"),
    confirmationStatus:
      primary.confirmationStatus !== "nao_informado"
        ? primary.confirmationStatus
        : secondary.confirmationStatus,
    contractStatus:
      primary.contractStatus !== "nao_informado"
        ? primary.contractStatus
        : secondary.contractStatus,
    paymentStatus:
      primary.paymentStatus !== "nao_informado"
        ? primary.paymentStatus
        : secondary.paymentStatus,
    feeType: pick("feeType"),
    feeAmount: pick("feeAmount"),
    feeQuantity: pick("feeQuantity"),
    cleaningResponsibility: pick("cleaningResponsibility"),
    electricityFee: pick("electricityFee"),
    operationalNotes: pick("operationalNotes"),
    internalNotes: pick("internalNotes"),
    preparationNotes: pick("preparationNotes"),
    reservationStartDate: pick("reservationStartDate"),
    reservationEndDate: pick("reservationEndDate"),
    requiresReview: true,
    reviewReasons,
  };
}

export function deduplicate(
  parsed: ParsedRestaurantEvent[] = parseAllSourceRows(),
): DeduplicationResult {
  const reconciliation: ReconciliationEntry[] = [];
  const byIdentity = new Map<string, ParsedRestaurantEvent>();
  let merged = 0;
  let ignored = 0;

  for (const event of parsed) {
    if (!event.isEvent) {
      ignored += 1;
      reconciliation.push({
        sourceRows: event.sourceRows,
        fingerprint: event.fingerprint,
        disposition: "ignorado",
        title: null,
        startDate: null,
        endDate: null,
        reasons: [event.notEventReason ?? "Linha sem conteúdo de evento."],
      });
      continue;
    }

    const key = identityKey(event);
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, event);
      continue;
    }

    merged += 1;
    const [primary, secondary] =
      completeness(event) > completeness(existing)
        ? [event, existing]
        : [existing, event];
    byIdentity.set(key, mergePair(primary, secondary));
    reconciliation.push({
      sourceRows: secondary.sourceRows,
      fingerprint: secondary.fingerprint,
      disposition: "mesclado",
      title: secondary.eventTitle,
      startDate: secondary.startDate,
      endDate: secondary.endDate,
      reasons: ["Duplicata da mesma organização, título e data dentro do documento."],
    });
  }

  // Segunda passada: mesma organização e mesma data inicial, com títulos
  // diferentes (o documento repete a reserva descrevendo-a de outra forma).
  const byOrganizerDate = new Map<string, ParsedRestaurantEvent>();
  for (const event of [...byIdentity.values()]) {
    const organizer = normalizeText(event.organizerName ?? "");
    const key = `${organizer}|${event.startDate ?? "sem-data"}`;
    if (!organizer || !event.startDate) {
      byOrganizerDate.set(`unico:${event.fingerprint}`, event);
      continue;
    }
    const existing = byOrganizerDate.get(key);
    if (!existing) {
      byOrganizerDate.set(key, event);
      continue;
    }
    merged += 1;
    const [primary, secondary] =
      completeness(event) > completeness(existing)
        ? [event, existing]
        : [existing, event];
    byOrganizerDate.set(key, mergePair(primary, secondary));
    reconciliation.push({
      sourceRows: secondary.sourceRows,
      fingerprint: secondary.fingerprint,
      disposition: "mesclado",
      title: secondary.eventTitle,
      startDate: secondary.startDate,
      endDate: secondary.endDate,
      reasons: [
        "Mesma organização e mesma data de outra linha — reserva duplicada no documento.",
      ],
    });
  }

  const events = [...byOrganizerDate.values()];


  // Conflitos: mesma organização e título em datas próximas (até 21 dias).
  // Eventos recorrentes ao longo do ano — como o Almoço de Ideias da Acisap —
  // são legítimos e não devem ser sinalizados.
  const CONFLICT_WINDOW_DAYS = 21;
  const bySimilarity = new Map<string, ParsedRestaurantEvent[]>();
  for (const event of events) {
    const key = similarityKey(event);
    bySimilarity.set(key, [...(bySimilarity.get(key) ?? []), event]);
  }
  for (const group of bySimilarity.values()) {
    if (group.length < 2) continue;
    const dated = group
      .filter((event) => event.startDate)
      .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1));

    for (let index = 1; index < dated.length; index += 1) {
      const previous = dated[index - 1];
      const current = dated[index];
      const gapDays =
        (Date.parse(`${current.startDate}T00:00:00Z`) -
          Date.parse(`${previous.startDate}T00:00:00Z`)) /
        86_400_000;
      if (gapDays > CONFLICT_WINDOW_DAYS) continue;

      const reason = `Possível conflito de agenda: o mesmo evento aparece em ${previous.startDate} e ${current.startDate}.`;
      for (const event of [previous, current]) {
        event.requiresReview = true;
        event.reviewReasons = [...new Set([...event.reviewReasons, reason])];
      }
    }
  }


  for (const event of events) {
    reconciliation.push({
      sourceRows: event.sourceRows,
      fingerprint: event.fingerprint,
      disposition: event.requiresReview ? "importar_com_revisao" : "importar",
      title: event.eventTitle,
      startDate: event.startDate,
      endDate: event.endDate,
      reasons: event.reviewReasons,
    });
  }

  reconciliation.sort((a, b) => a.sourceRows[0] - b.sourceRows[0]);

  return {
    events,
    reconciliation,
    summary: {
      sourceRows: parsed.length,
      candidates: parsed.filter((event) => event.isEvent).length,
      unique: events.length,
      merged,
      ignored,
      requiresReview: events.filter((event) => event.requiresReview).length,
    },
  };
}
