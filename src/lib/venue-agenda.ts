import type { VenueEvent } from "@/lib/venue-operations";

export type VenueAgendaBadgeTone =
  | "neutral"
  | "positive"
  | "warning"
  | "danger"
  | "info";

export interface VenueAgendaBadge {
  key: string;
  label: string;
  tone: VenueAgendaBadgeTone;
  title: string;
}

export const CONFIRMATION_STATUS_LABELS: Record<string, string> = {
  nao_informado: "Confirmação pendente",
  confirmado: "Confirmado",
  a_confirmar: "A confirmar",
  cancelado: "Cancelado",
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  nao_informado: "Contrato não informado",
  assinado: "Contrato assinado",
  enviado: "Contrato enviado",
  nao_enviado: "Contrato não enviado",
  sem_contrato: "Sem contrato",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  nao_informado: "Pagamento não informado",
  pago: "Pago",
  parcial: "Pago parcial",
  a_acertar: "A acertar",
  isento: "Isento",
};

export const SHIFT_LABELS: Record<string, string> = {
  meio_dia: "Meio-dia",
  noite: "Noite",
  dia: "Dia",
  dia_noite: "Dia e noite",
  manha: "Manhã",
  tarde: "Tarde",
};

const CONFIRMATION_TONES: Record<string, VenueAgendaBadgeTone> = {
  confirmado: "positive",
  a_confirmar: "warning",
  cancelado: "danger",
};

const CONTRACT_TONES: Record<string, VenueAgendaBadgeTone> = {
  assinado: "positive",
  enviado: "info",
  nao_enviado: "warning",
  sem_contrato: "warning",
};

const PAYMENT_TONES: Record<string, VenueAgendaBadgeTone> = {
  pago: "positive",
  parcial: "info",
  a_acertar: "warning",
  isento: "neutral",
};

/** Lowercase and strip diacritics so search ignores accents. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatBrPhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return value;
}

export function formatBrl(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Badges that only appear when the agenda data carries real information. */
export function agendaBadges(event: VenueEvent): VenueAgendaBadge[] {
  const badges: VenueAgendaBadge[] = [];
  const push = (
    key: string,
    value: string | null | undefined,
    labels: Record<string, string>,
    tones: Record<string, VenueAgendaBadgeTone>,
  ) => {
    if (!value || value === "nao_informado") return;
    const label = labels[value];
    if (!label) return;
    badges.push({
      key,
      label,
      tone: tones[value] ?? "neutral",
      title: label,
    });
  };

  push(
    "confirmation",
    event.confirmation_status,
    CONFIRMATION_STATUS_LABELS,
    CONFIRMATION_TONES,
  );
  push(
    "contract",
    event.contract_status,
    CONTRACT_STATUS_LABELS,
    CONTRACT_TONES,
  );
  push("payment", event.payment_status, PAYMENT_STATUS_LABELS, PAYMENT_TONES);

  if (event.requires_review) {
    badges.push({
      key: "review",
      label: "Revisar",
      tone: "danger",
      title: event.review_reasons?.length
        ? `Revisão necessária: ${event.review_reasons.join("; ")}`
        : "Revisão necessária",
    });
  }

  return badges;
}

export function agendaSearchTokens(event: VenueEvent): string {
  return [
    event.contact_name,
    event.contact_phone,
    event.shift,
    event.event_type,
    event.requested_area,
    event.executive_description,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Mês (01…12) do evento no fuso de Brasília, ou null quando sem data. */
export function eventMonth(event: VenueEvent): string | null {
  const source = event.start_at ?? event.reservation_start_date;
  if (!source) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return source.slice(5, 7);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    month: "2-digit",
  }).format(new Date(source));
}

export function eventYear(event: VenueEvent): string | null {
  const source = event.start_at ?? event.reservation_start_date;
  if (!source) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return source.slice(0, 4);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).format(new Date(source));
}

export function monthGroupLabel(startAt: string | null): string {
  if (!startAt) return "Sem data definida";
  const label = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    month: "long",
    year: "numeric",
  }).format(new Date(startAt));
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

const VENUE_TZ = "America/Sao_Paulo";

const venueHourFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: VENUE_TZ,
});
const venueDayFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  timeZone: VENUE_TZ,
});
const venueMonthShortFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  timeZone: VENUE_TZ,
});
const venueYearFormatter = new Intl.DateTimeFormat("pt-BR", {
  year: "numeric",
  timeZone: VENUE_TZ,
});
const venueWeekdayFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  timeZone: VENUE_TZ,
});

/** "19:00" no fuso de Brasília, ou null quando não há instante. */
export function formatVenueHour(value: string | null | undefined): string | null {
  return value ? venueHourFormatter.format(new Date(value)) : null;
}

/** Duração compacta ("4h30", "2h", "45min"), ou null quando inválida. */
export function formatVenueDuration(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(diff) || diff <= 0) return null;
  const totalMinutes = Math.round(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h${String(minutes).padStart(2, "0")}`;
  if (hours) return `${hours}h`;
  return `${minutes}min`;
}

export interface VenueDateParts {
  day: string;
  /** Mês abreviado sem ponto ("jan", "set"). */
  month: string;
  year: string;
  weekday: string;
}

/** Partes da data no fuso de Brasília para o selo de data e cabeçalhos. */
export function venueDateParts(value: string | null | undefined): VenueDateParts | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: venueDayFormatter.format(date),
    month: venueMonthShortFormatter.format(date).replace(".", ""),
    year: venueYearFormatter.format(date),
    weekday: venueWeekdayFormatter.format(date),
  };
}
