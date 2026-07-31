/**
 * Parser semântico da AGENDA RESTAURANTE FENASOJA.
 *
 * Regras fundamentais:
 * - Nunca inventar informação. Campo desconhecido vira `null`.
 * - Datas sempre em ISO (YYYY-MM-DD) no fuso America/Sao_Paulo, sem conversão
 *   que desloque o dia.
 * - Preparação, reserva e desmontagem nunca entram no título público.
 * - Toda ambiguidade relevante gera `requiresReview` com o motivo explícito.
 */

import {
  RESTAURANT_SOURCE_ROWS,
  SOURCE_DOCUMENT,
  type RestaurantSourceRow,
} from "./sourceRows";

export type ConfirmationStatus =
  | "nao_informado"
  | "confirmado"
  | "nao_confirmado"
  | "a_acertar"
  | "cancelado";

export type ContractStatus =
  | "nao_informado"
  | "sem_contrato"
  | "nao_enviado"
  | "enviado"
  | "assinado"
  | "a_acertar";

export type PaymentStatus =
  | "nao_informado"
  | "pago"
  | "parcial"
  | "pendente"
  | "isento"
  | "a_acertar";

export type EventShift =
  | "manha"
  | "meio_dia"
  | "tarde"
  | "noite"
  | "dia"
  | "dia_noite"
  | "integral";

export type CleaningResponsibility =
  | "solicitante"
  | "fenasoja"
  | "taxa_limpeza"
  | "nao_informado";

export interface ParsedRestaurantEvent {
  sourceRows: number[];
  sourceYear: number;
  rawText: string;
  fingerprint: string;
  isEvent: boolean;
  notEventReason: string | null;

  eventTitle: string | null;
  organizerName: string | null;
  requesterName: string | null;
  contactName: string | null;
  contactPhone: string | null;

  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  shift: EventShift | null;
  /** `true` quando o turno não constava no documento e recebeu a faixa padrão. */
  shiftInferred: boolean;


  preparationStartDate: string | null;
  preparationEndDate: string | null;
  preparationNotes: string | null;
  reservationStartDate: string | null;
  reservationEndDate: string | null;
  teardownDeadlineNote: string | null;

  confirmationStatus: ConfirmationStatus;
  contractStatus: ContractStatus;
  paymentStatus: PaymentStatus;

  feeType: string | null;
  feeAmount: number | null;
  feeQuantity: number | null;
  cleaningResponsibility: CleaningResponsibility | null;
  cleaningFee: number | null;
  electricityFee: string | null;

  operationalNotes: string | null;
  internalNotes: string | null;

  requiresReview: boolean;
  reviewReasons: string[];
}

// ---------------------------------------------------------------- utilidades

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Hash FNV-1a de 32 bits em hexadecimal — determinístico entre execuções. */
export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function buildFingerprint(rows: number[]): string {
  const key = `${SOURCE_DOCUMENT}#${[...rows].sort((a, b) => a - b).join("+")}`;
  return `${stableHash(key)}-${rows[0]}`;
}

const MONTHS: Record<string, number> = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  marco: 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12,
};

const WEEKDAYS = [
  "segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo",
];

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

interface DayMonth {
  day: number;
  month: number;
}

/** Extrai pares dia/mês de um trecho, na ordem em que aparecem. */
function extractDayMonthPairs(fragment: string): {
  pairs: DayMonth[];
  explicitYear: number | null;
} {
  const tokens = normalizeText(fragment)
    .replace(/[;.]/g, " ")
    .replace(/,/g, " , ")
    .split(/\s+/)
    .filter(Boolean);

  const pending: number[] = [];
  const pairs: DayMonth[] = [];
  let explicitYear: number | null = null;
  let lastMonth: number | null = null;

  for (const token of tokens) {
    const clean = token.replace(/[^0-9a-z]/g, "");
    if (!clean) continue;

    if (/^\d+$/.test(clean)) {
      const numeric = Number(clean);
      if (numeric >= 1900) {
        explicitYear = numeric;
      } else if (numeric >= 1 && numeric <= 31) {
        pending.push(numeric);
      }
      continue;
    }

    const month = MONTHS[clean];
    if (month) {
      if (pending.length === 0 && lastMonth !== null) {
        // mês sem dias pendentes: ignora (ex.: "de maio de 2026")
      }
      while (pending.length > 0) {
        pairs.push({ day: pending.shift() as number, month });
      }
      lastMonth = month;
    }
  }

  // Dias que sobraram após o último mês citado.
  while (pending.length > 0 && lastMonth !== null) {
    pairs.push({ day: pending.shift() as number, month: lastMonth });
  }

  return { pairs, explicitYear };
}

export interface ParsedDateExpression {
  startDate: string | null;
  endDate: string | null;
  preparationStartDate: string | null;
  preparationEndDate: string | null;
  preparationNotes: string | null;
  reservationStartDate: string | null;
  reservationEndDate: string | null;
  reviewReasons: string[];
}

/**
 * Interpreta a coluna DATA, separando o período do evento das informações de
 * preparação e reserva.
 */
export function parseDateExpression(
  raw: string,
  baseYear: number,
): ParsedDateExpression {
  const reviewReasons: string[] = [];
  const empty: ParsedDateExpression = {
    startDate: null,
    endDate: null,
    preparationStartDate: null,
    preparationEndDate: null,
    preparationNotes: null,
    reservationStartDate: null,
    reservationEndDate: null,
    reviewReasons,
  };

  if (!raw.trim()) {
    reviewReasons.push("Data ausente no documento de origem.");
    return empty;
  }

  const qualifiers: string[] = [];
  let main = raw.replace(/\(([^)]*)\)/g, (_match, inner: string) => {
    qualifiers.push(inner);
    return " ";
  });

  // Qualificadores fora de parênteses: "Dia 03 decorar", "dia 04 p arrumar".
  main = main.replace(
    /\bdias?\s+\d{1,2}[^,;]*?(decorar|arrumar|organizar|montar|limpar)\b/gi,
    (match) => {
      qualifiers.push(match);
      return " ";
    },
  );

  const { pairs, explicitYear } = extractDayMonthPairs(main);
  const year = explicitYear ?? baseYear;

  if (pairs.length === 0) {
    reviewReasons.push(
      `Não foi possível interpretar a data "${raw.trim()}".`,
    );
    return empty;
  }

  const dates = pairs
    .map((pair) => isoDate(year, pair.month, pair.day))
    .sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  let preparationStartDate: string | null = null;
  let preparationEndDate: string | null = null;
  let reservationStartDate: string | null = null;
  let reservationEndDate: string | null = null;
  const preparationNotes: string[] = [];

  const startMonth = pairs.find((pair) => isoDate(year, pair.month, pair.day) === startDate)?.month
    ?? pairs[0].month;

  for (const qualifier of qualifiers) {
    const normalized = normalizeText(qualifier);
    if (!normalized) continue;
    if (WEEKDAYS.some((weekday) => normalized.includes(weekday))) continue;

    const days = (normalized.match(/\d{1,2}/g) ?? [])
      .map(Number)
      .filter((day) => day >= 1 && day <= 31);
    if (days.length === 0) continue;

    const qualifierDates = days
      .map((day) => isoDate(year, startMonth, day))
      .sort();

    if (normalized.includes("reserv")) {
      reservationStartDate = qualifierDates[0];
      reservationEndDate = qualifierDates[qualifierDates.length - 1];
    } else {
      preparationStartDate = qualifierDates[0];
      preparationEndDate = qualifierDates[qualifierDates.length - 1];
    }
    preparationNotes.push(qualifier.trim());
  }

  return {
    startDate,
    endDate,
    preparationStartDate,
    preparationEndDate,
    preparationNotes: preparationNotes.length
      ? preparationNotes.join(" · ")
      : null,
    reservationStartDate,
    reservationEndDate,
    reviewReasons,
  };
}

// ------------------------------------------------------------------ telefone

/** Normaliza telefones brasileiros para o formato (DD) 9NNNN-NNNN. */
export function parsePhone(raw: string): string | null {
  const candidates = raw.match(/(?:\d[\s-]?){8,13}/g);
  if (!candidates) return null;

  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 9) {
      // Sem DDD no documento: assume-se o DDD 55 da região de Santa Rosa/RS
      // apenas na formatação de exibição do número local.
      return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    }
    if (digits.length === 8) {
      return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    }
  }
  return null;
}

// --------------------------------------------------------------------- turno

const SHIFT_WINDOWS: Record<EventShift, { start: string; end: string }> = {
  manha: { start: "08:00", end: "12:00" },
  meio_dia: { start: "11:00", end: "15:00" },
  tarde: { start: "13:00", end: "18:00" },
  noite: { start: "19:00", end: "23:30" },
  dia: { start: "08:00", end: "18:00" },
  dia_noite: { start: "08:00", end: "23:30" },
  integral: { start: "08:00", end: "23:30" },
};

export function shiftWindow(shift: EventShift) {
  return SHIFT_WINDOWS[shift];
}

export function parseShiftToken(raw: string): EventShift | null {
  const value = normalizeText(raw);
  if (!value) return null;
  if (/^(dia\s*\/\s*noite|d\s*\/\s*n)$/.test(value)) return "dia_noite";
  if (value.includes("meio") && value.includes("dia")) return "meio_dia";
  if (value === "noite" || value === "n oite") return "noite";
  if (value === "manha") return "manha";
  if (value === "tarde") return "tarde";
  if (value === "dia" || value === "d") return "dia";
  if (value === "integral") return "integral";
  return null;
}

/** Extrai um horário explícito como "18;30", "18h", "14h", "às 19:30". */
export function parseExplicitTime(raw: string): string | null {
  const match = raw.match(/(\d{1,2})\s*(?:[:;h]\s*(\d{2}))?\s*h?\b/i);
  if (!match) return null;
  const hasSeparator = /\d{1,2}\s*[:;h]/.test(raw);
  if (!hasSeparator) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addHours(time: string, hours: number): string {
  const [hour, minute] = time.split(":").map(Number);
  const total = (hour * 60 + minute + hours * 60 + 24 * 60 * 7) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export { addHours };

// -------------------------------------------------------------------- status

interface StatusResult {
  confirmation: ConfirmationStatus;
  contract: ContractStatus;
  payment: PaymentStatus;
  feeQuantity: number | null;
  feeTypeFromStatus: string | null;
  unreliableTokens: string[];
}

/**
 * Classifica um token de status pelo seu conteúdo, e não pela coluna em que
 * apareceu — o documento tem colunas trocadas em várias linhas.
 */
export function classifyStatusToken(raw: string): Partial<StatusResult> | null {
  const value = normalizeText(raw).replace(/\.$/, "");
  if (!value || /^-+$/.test(value)) return null;

  if (/^(contrato|contr?|cont)\.?\s*(ok|ass(inado)?)$/.test(value)) {
    return { contract: "assinado" };
  }
  if (/^contrato assinado$/.test(value)) return { contract: "assinado" };
  if (/^(sem contrato|s\s*\/\s*c)$/.test(value)) return { contract: "sem_contrato" };
  if (/^n\.?\s*enviado$/.test(value)) return { contract: "nao_enviado" };
  if (/^acerto$/.test(value)) return { contract: "a_acertar" };

  const paidWithQuantity = value.match(/^pg\s*(\d+(?:[.,]\d+)?)\s*(sal(?:ario|ários|arios|\.)?|salarios?)$/);
  if (paidWithQuantity) {
    return {
      payment: "pago",
      feeQuantity: Number(paidWithQuantity[1].replace(",", ".")),
      feeTypeFromStatus: "salario",
    };
  }
  if (/^(pg|pago)$/.test(value)) return { payment: "pago" };

  if (/^(ok|0k)$/.test(value)) return { confirmation: "confirmado" };
  if (/^n$/.test(value)) return { confirmation: "nao_confirmado" };

  return { unreliableTokens: [raw.trim()] };
}

function mergeStatuses(tokens: string[]): StatusResult {
  const result: StatusResult = {
    confirmation: "nao_informado",
    contract: "nao_informado",
    payment: "nao_informado",
    feeQuantity: null,
    feeTypeFromStatus: null,
    unreliableTokens: [],
  };

  for (const token of tokens) {
    const classified = classifyStatusToken(token);
    if (!classified) continue;
    if (classified.confirmation) result.confirmation = classified.confirmation;
    if (classified.contract) result.contract = classified.contract;
    if (classified.payment) result.payment = classified.payment;
    if (classified.feeQuantity != null) result.feeQuantity = classified.feeQuantity;
    if (classified.feeTypeFromStatus) result.feeTypeFromStatus = classified.feeTypeFromStatus;
    if (classified.unreliableTokens) {
      result.unreliableTokens.push(...classified.unreliableTokens);
    }
  }

  return result;
}

export { mergeStatuses };

// --------------------------------------------------------------------- taxas

export interface ParsedFees {
  feeType: string | null;
  feeAmount: number | null;
  feeQuantity: number | null;
  cleaningResponsibility: CleaningResponsibility | null;
  cleaningFee: number | null;
  electricityFee: string | null;
}

const WRITTEN_NUMBERS: Record<string, number> = {
  uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
};

export function parseFees(raw: string): ParsedFees {
  const value = normalizeText(raw);
  const result: ParsedFees = {
    feeType: null,
    feeAmount: null,
    feeQuantity: null,
    cleaningResponsibility: null,
    cleaningFee: null,
    electricityFee: null,
  };
  if (!value) return result;

  if (/sem taxas?/.test(value)) {
    result.feeType = "isento";
  }

  const salaries = value.match(/(\d+(?:[.,]\d+)?)\s*sal[aá]rios?/);
  if (salaries) {
    result.feeType = "salario";
    result.feeQuantity = Number(salaries[1].replace(",", "."));
  }

  const amount = value.match(/taxas?\s*(?:de\s*)?(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+)/);
  if (amount && !result.feeQuantity) {
    const numeric = Number(amount[1].replace(/\./g, "").replace(",", "."));
    if (numeric >= 100) {
      result.feeType = "taxa";
      result.feeAmount = numeric;
    }
  }

  const feeCount = value.match(/(\d+|uma|um|duas|dois|tres)\s+taxas?/);
  if (feeCount) {
    const quantity = /^\d+$/.test(feeCount[1])
      ? Number(feeCount[1])
      : WRITTEN_NUMBERS[feeCount[1]] ?? null;
    if (quantity) {
      result.feeType = result.feeType ?? "taxa";
      result.feeQuantity = result.feeQuantity ?? quantity;
    }
  }

  if (!result.feeType && /\btaxas?\b/.test(value)) {
    result.feeType = "taxa";
  }

  if (/entregam limpo|irao limpar|ir[aã]o limpar/.test(value)) {
    result.cleaningResponsibility = "solicitante";
  } else if (/taxa\s+limpeza/.test(value)) {
    result.cleaningResponsibility = "taxa_limpeza";
  }

  if (/cobrar\s+luz/.test(value)) {
    result.electricityFee = "Cobrar energia elétrica";
  }

  return result;
}

// ---------------------------------------------------------- título / entidade

const EVENT_KEYWORDS = [
  "baile", "formatura", "almoco", "cafe", "jantar", "aniversario", "casamento",
  "truco", "seminario", "encontro", "encontrao", "evento", "congresso", "posse",
  "lancamento", "reuniao", "feijoada", "parrilha", "sorteio", "palestra",
  "conferencia", "campeonato", "noite do agro", "festival", "carreteiro",
  "rota choop", "conferência",
];

export function looksLikeEventName(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return EVENT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

/** Extrai o nome da organização a partir da célula de solicitante. */
export function extractOrganizer(raw: string): string | null {
  if (!raw.trim()) return null;
  const withoutParenthesis = raw.replace(/\([^)]*\)/g, " ");
  const head = withoutParenthesis.split(/[–—\-\/]/)[0];
  const cleaned = head
    .replace(/\d[\d\s-]{5,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,;.]$/, "");
  return cleaned.length >= 2 ? cleaned : null;
}

/** Extrai um nome de contato pessoal da célula de solicitante. */
export function extractContactName(raw: string): string | null {
  if (!raw.trim()) return null;

  const parenthesis = raw.match(/\(([^)0-9]{2,40})\)/);
  if (parenthesis) {
    const candidate = parenthesis[1].trim();
    if (!/taxa|salario|salário|limpo|limpar|patrocinador/i.test(candidate)) {
      return candidate;
    }
  }

  const dashSegments = raw.split(/[–—]|(?<=\s)-(?=\s)/).slice(1);
  for (const segment of dashSegments) {
    const candidate = segment
      .replace(/\([^)]*\)/g, " ")
      .replace(/\d[\d\s-]{4,}/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[,;.]$/, "");
    if (candidate.length >= 2 && !/taxa|salário|salario|limpo|limpar/i.test(candidate)) {
      return candidate.split(/\s+/).slice(0, 3).join(" ");
    }
  }

  // Fallback: nome escrito imediatamente antes de um telefone, sem separador.
  const beforePhone = raw.match(/^([A-Za-zÀ-ÿ.'\s]{2,40}?)\s*\d[\d\s-]{7,}/);
  if (beforePhone) {
    const candidate = beforePhone[1].replace(/\s+/g, " ").trim();
    if (candidate.length >= 2 && !/taxa|salário|salario|limpo|limpar/i.test(candidate)) {
      return candidate.split(/\s+/).slice(0, 3).join(" ");
    }
  }
  return null;
}


// ------------------------------------------------------------- notas soltas

function extractOperationalNotes(row: RestaurantSourceRow): string | null {
  const notes: string[] = [];
  const combined = `${row.requester} ${row.event}`;

  const teardown = combined.match(/(?:tudo\s+)?retirad[oa][^)]*|retirar tudo[^)]*/i);
  if (teardown) notes.push(teardown[0].trim());

  const cleaningTime = combined.match(/entrar com limpeza[^)]*/i);
  if (cleaningTime) notes.push(cleaningTime[0].trim());

  const endsAt = combined.match(/festa termina[^.)]*/i);
  if (endsAt) notes.push(endsAt[0].trim());

  const agreement = combined.match(/acerto c[^)]*/i);
  if (agreement) notes.push(agreement[0].trim());

  return notes.length ? notes.join(" · ") : null;
}

function extractTeardownDeadline(row: RestaurantSourceRow): string | null {
  const combined = `${row.requester} ${row.event}`;
  const match = combined.match(/(retirad[oa]|retirar)[^)]*at[ée]\s*\d{1,2}\s*h[^)]*/i);
  return match ? match[0].trim() : null;
}

// ----------------------------------------------------------------- parse row

const UNRELIABLE_TITLES = new Set(["ju", "d", "n", "pg", "ok"]);

export function parseSourceRow(row: RestaurantSourceRow): ParsedRestaurantEvent {
  const rawText = [row.date, row.requester, row.event, row.shift, row.confirmation, row.contract]
    .filter(Boolean)
    .join(" | ");
  const reviewReasons: string[] = [];

  // Observações que não descrevem um evento.
  if (/^obs\b/i.test(row.date.trim())) {
    return {
      sourceRows: [row.row],
      sourceYear: row.year,
      rawText,
      fingerprint: buildFingerprint([row.row]),
      isEvent: false,
      notEventReason:
        "Observação geral do documento, sem data, solicitante ou evento identificável.",
      eventTitle: null,
      organizerName: null,
      requesterName: null,
      contactName: null,
      contactPhone: null,
      startDate: null,
      endDate: null,
      startTime: null,
      endTime: null,
      shift: null,
      shiftInferred: false,

      preparationStartDate: null,
      preparationEndDate: null,
      preparationNotes: null,
      reservationStartDate: null,
      reservationEndDate: null,
      teardownDeadlineNote: null,
      confirmationStatus: "nao_informado",
      contractStatus: "nao_informado",
      paymentStatus: "nao_informado",
      feeType: null,
      feeAmount: null,
      feeQuantity: null,
      cleaningResponsibility: null,
      cleaningFee: null,
      electricityFee: null,
      operationalNotes: row.date.trim(),
      internalNotes: null,
      requiresReview: false,
      reviewReasons: [],
    };
  }

  let requesterCell = row.requester.trim();
  let eventCell = row.event.trim();
  const statusTokens = [row.shift, row.confirmation, row.contract].filter(Boolean);
  let shift: EventShift | null = null;
  let columnShiftDetected = false;

  // Correção 1: a coluna EVENTO contém apenas um turno (linha 15/04/2025).
  const eventAsShift = parseShiftToken(eventCell);
  if (eventCell && eventAsShift) {
    shift = eventAsShift;
    eventCell = "";
    columnShiftDetected = true;
  }

  // Correção 2: título e organização invertidos (padrão recorrente em 2027).
  if (
    eventCell &&
    requesterCell &&
    looksLikeEventName(requesterCell) &&
    !looksLikeEventName(eventCell)
  ) {
    const previousRequester = requesterCell;
    requesterCell = eventCell;
    eventCell = previousRequester;
    columnShiftDetected = true;
  }

  if (columnShiftDetected) {
    reviewReasons.push(
      "Colunas deslocadas no documento original — mapeamento corrigido automaticamente.",
    );
  }

  // Turno declarado na coluna própria, quando não é um status.
  if (!shift) {
    shift = parseShiftToken(row.shift);
  }

  const dateParsed = parseDateExpression(row.date, row.year);
  reviewReasons.push(...dateParsed.reviewReasons);

  const statuses = mergeStatuses(statusTokens);

  // Horário explícito (ex.: "18;30", "14h", "18h de sábado início").
  const explicitTime =
    parseExplicitTime(row.shift) ??
    parseExplicitTime(eventCell) ??
    null;

  for (const token of statuses.unreliableTokens) {
    // Turnos e horários já foram consumidos como agenda, não como status.
    if (parseShiftToken(token)) continue;
    if (explicitTime && parseExplicitTime(token) === explicitTime) continue;
    reviewReasons.push(
      `Valor "${token}" não pôde ser classificado com segurança — confirmar manualmente.`,
    );
  }

  let startTime: string | null = null;
  let endTime: string | null = null;
  let shiftInferred = false;
  if (explicitTime) {
    startTime = explicitTime;
    const [hour] = explicitTime.split(":").map(Number);
    endTime = hour >= 17 ? "23:30" : addHours(explicitTime, 4);
    if (!shift) shift = hour >= 17 ? "noite" : hour >= 11 ? "meio_dia" : "manha";
  } else if (shift) {
    const window = shiftWindow(shift);
    startTime = window.start;
    endTime = window.end;
  } else {
    // Decisão operacional aprovada: turno ausente recebe a faixa padrão da
    // noite e é registrado como inferido — isso, por si só, não exige revisão.
    const window = shiftWindow("noite");
    shift = "noite";
    shiftInferred = true;
    startTime = window.start;
    endTime = window.end;
  }


  const fees = parseFees(`${row.requester} ${row.event}`);
  if (statuses.feeQuantity != null && fees.feeQuantity == null) {
    fees.feeQuantity = statuses.feeQuantity;
  }
  if (statuses.feeTypeFromStatus && !fees.feeType) {
    fees.feeType = statuses.feeTypeFromStatus;
  }

  const organizerName = extractOrganizer(requesterCell);
  const contactName = extractContactName(requesterCell);
  const contactPhone =
    parsePhone(requesterCell) ?? parsePhone(eventCell) ?? null;

  // Título: célula EVENTO quando confiável; senão, deriva do solicitante.
  let eventTitle: string | null = null;
  const normalizedEvent = normalizeText(eventCell);
  if (eventCell && !UNRELIABLE_TITLES.has(normalizedEvent)) {
    eventTitle = eventCell
      .replace(/\s*OBS[.:].*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  } else if (eventCell && UNRELIABLE_TITLES.has(normalizedEvent)) {
    reviewReasons.push(
      `Título "${eventCell}" é uma abreviação não interpretável — confirmar o nome real do evento.`,
    );
  }

  if (!eventTitle) {
    if (looksLikeEventName(requesterCell)) {
      // A célula de solicitante já traz o nome do evento (colunas deslocadas).
      eventTitle = requesterCell.replace(/\s+/g, " ").trim();
    } else if (organizerName) {
      eventTitle = `Evento ${organizerName}`;
      reviewReasons.push(
        "Nome do evento ausente no documento — título derivado da organização solicitante.",
      );
    } else if (requesterCell) {
      eventTitle = requesterCell.replace(/\s+/g, " ").trim();
    }
  }

  // O título nunca carrega telefone nem sobras de pontuação.
  if (eventTitle) {
    eventTitle = eventTitle
      .replace(/\(?\s*\d[\d\s.-]{6,}\)?/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[\s,;.–—-]+$/, "")
      .trim();
  }


  if (!eventTitle) {
    reviewReasons.push("Não há título nem organização identificáveis nesta linha.");
  }

  if (!organizerName) {
    reviewReasons.push("Organização solicitante não identificada no documento.");
  }

  const operationalNotes = extractOperationalNotes(row);
  const teardownDeadlineNote = extractTeardownDeadline(row);

  const internalNoteParts: string[] = [];
  if (/patrocinador/i.test(row.requester)) internalNoteParts.push("Patrocinador");
  if (/beneficente/i.test(row.requester)) internalNoteParts.push("Evento beneficente");
  if (/parceria fenasoja/i.test(row.requester)) internalNoteParts.push("Parceria Fenasoja");

  return {
    sourceRows: [row.row],
    sourceYear: row.year,
    rawText,
    fingerprint: buildFingerprint([row.row]),
    isEvent: true,
    notEventReason: null,
    eventTitle,
    organizerName,
    requesterName: organizerName ?? contactName ?? eventTitle,
    contactName,
    contactPhone,
    startDate: dateParsed.startDate,
    endDate: dateParsed.endDate,
    startTime,
    endTime,
    shift,
    shiftInferred,

    preparationStartDate: dateParsed.preparationStartDate,
    preparationEndDate: dateParsed.preparationEndDate,
    preparationNotes: dateParsed.preparationNotes,
    reservationStartDate: dateParsed.reservationStartDate,
    reservationEndDate: dateParsed.reservationEndDate,
    teardownDeadlineNote,
    confirmationStatus: statuses.confirmation,
    contractStatus: statuses.contract,
    paymentStatus: statuses.payment,
    feeType: fees.feeType,
    feeAmount: fees.feeAmount,
    feeQuantity: fees.feeQuantity,
    cleaningResponsibility: fees.cleaningResponsibility,
    cleaningFee: fees.cleaningFee,
    electricityFee: fees.electricityFee,
    operationalNotes,
    internalNotes: internalNoteParts.length ? internalNoteParts.join(" · ") : null,
    requiresReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

export function parseAllSourceRows(): ParsedRestaurantEvent[] {
  return RESTAURANT_SOURCE_ROWS.map(parseSourceRow);
}
