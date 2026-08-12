import {
  COUNTERPART_UNIT_LABELS,
  type CounterpartUnit,
  type VenueAgreement,
  type VenueCounterpartBalanceRow,
  type VenueCounterpartUsage,
} from "@/lib/venue-operations";

const TECHNICAL_WORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "com",
  "para",
  "por",
]);

const COUNTERPART_BENEFIT_LABELS: Record<string, string> = {
  USO_ESPACO: "Uso do Espaço",
  USO_DO_ESPACO: "Uso do Espaço",
};

const AGREEMENT_STATUS_LABELS: Record<VenueAgreement["status"], string> = {
  rascunho: "Rascunho",
  ativo: "Ativo",
  suspenso: "Suspenso",
  encerrado: "Encerrado",
};

const COUNTERPART_UNIT_SINGULAR_LABELS: Record<CounterpartUnit, string> = {
  evento: "evento",
  dia: "dia",
  hora: "hora",
  turno: "turno",
  data_exclusiva: "data exclusiva",
  capacidade: "pessoa",
  monetario: "real",
  outro: "unidade",
};

const SPONSOR_NAME_LABELS: Record<string, string> = {
  "sicredi/icatu": "Sicredi / Icatu",
  "icatu/sicredi": "Icatu / Sicredi",
  alibem: "Alibem",
  cavaline: "Cavaline",
  steffen: "Steffen",
  "via certa": "Via Certa",
  cotrirosa: "Cotrirosa",
};

const LEGAL_NAME_TOKENS: Record<string, string> = {
  LTDA: "Ltda",
  SA: "S.A.",
  ME: "ME",
  EPP: "EPP",
};

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function technicalKey(value: string) {
  return stripDiacritics(value)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLocaleUpperCase("pt-BR");
}

function titleCaseWords(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .filter(Boolean)
    .map((word, index) => {
      if (index > 0 && TECHNICAL_WORDS.has(word)) return word;
      return word.replace(/^./u, (character) =>
        character.toLocaleUpperCase("pt-BR"),
      );
    })
    .join(" ");
}

/**
 * Humaniza valores técnicos somente na camada de apresentação. O valor
 * persistido continua sendo enviado sem qualquer conversão pelo formulário.
 */
export function presentCounterpartBenefit(value: string | null | undefined) {
  const source = String(value || "").trim();
  if (!source) return "Benefício não informado";

  const mapped = COUNTERPART_BENEFIT_LABELS[technicalKey(source)];
  if (mapped) return mapped;

  const normalized = source
    .replaceAll("_", " ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
  const looksTechnical = source.includes("_") || source === source.toUpperCase();

  if (looksTechnical) return titleCaseWords(normalized);
  return normalized.replace(/^./u, (character) =>
    character.toLocaleUpperCase("pt-BR"),
  );
}

export function presentAgreementStatus(status: VenueAgreement["status"]) {
  return AGREEMENT_STATUS_LABELS[status];
}

export function presentCounterpartUnit(
  unit: CounterpartUnit,
  quantity: number,
) {
  return quantity === 1
    ? COUNTERPART_UNIT_SINGULAR_LABELS[unit]
    : COUNTERPART_UNIT_LABELS[unit];
}

export function presentSponsorName(value: string | null | undefined) {
  const source = String(value || "").trim();
  if (!source) return "Patrocinador não informado";

  const normalized = source
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
  const mapped = SPONSOR_NAME_LABELS[stripDiacritics(normalized).toLocaleLowerCase("pt-BR")];
  if (mapped) return mapped;

  const withReadableSeparators = normalized.replaceAll("/", " / ");
  const letters = withReadableSeparators.replace(/[^\p{L}]/gu, "");
  if (letters && letters === letters.toLocaleUpperCase("pt-BR")) {
    return withReadableSeparators
      .split(" ")
      .map((word) => {
        if (!word || word === "/") return word;
        const key = stripDiacritics(word).replace(/[^a-zA-Z]/g, "").toUpperCase();
        const lowerWord = word.toLocaleLowerCase("pt-BR");
        if (LEGAL_NAME_TOKENS[key]) return LEGAL_NAME_TOKENS[key];
        if (TECHNICAL_WORDS.has(lowerWord)) return lowerWord;
        if (key.length <= 3) return word.toLocaleUpperCase("pt-BR");
        return titleCaseWords(word);
      })
      .join(" ");
  }

  return withReadableSeparators;
}

export function presentContractReference(value: string | null | undefined) {
  const source = String(value || "").trim();
  if (!source) return "Sem referência contratual";
  return source.replaceAll("_", " ").replace(/\s+/g, " ").trim();
}

export type CounterpartBalanceState =
  | "healthy"
  | "attention"
  | "exhausted"
  | "projected"
  | "exceeded";

export interface CounterpartProgress {
  granted: number;
  consumed: number;
  reserved: number;
  remaining: number;
  committed: number;
  committedPercent: number;
  consumedPercent: number;
  reservedPercent: number;
  availablePercent: number;
}

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function buildCounterpartProgress({
  granted,
  consumed,
  reserved,
  remaining,
}: {
  granted: number;
  consumed: number;
  reserved: number;
  remaining: number;
}): CounterpartProgress {
  const safeGranted = finiteNonNegative(granted);
  const safeConsumed = finiteNonNegative(consumed);
  const safeReserved = finiteNonNegative(reserved);
  const safeRemaining = finiteNonNegative(remaining);
  const committed = safeConsumed + safeReserved;

  if (safeGranted === 0) {
    return {
      granted: safeGranted,
      consumed: safeConsumed,
      reserved: safeReserved,
      remaining: safeRemaining,
      committed,
      committedPercent: committed > 0 ? 100 : 0,
      consumedPercent: committed > 0 ? 100 : 0,
      reservedPercent: 0,
      availablePercent: committed > 0 ? 0 : 100,
    };
  }

  const consumedPercent = Math.min(100, (safeConsumed / safeGranted) * 100);
  const reservedPercent = Math.min(
    100 - consumedPercent,
    (safeReserved / safeGranted) * 100,
  );

  return {
    granted: safeGranted,
    consumed: safeConsumed,
    reserved: safeReserved,
    remaining: safeRemaining,
    committed,
    committedPercent: Math.min(100, (committed / safeGranted) * 100),
    consumedPercent,
    reservedPercent,
    availablePercent: Math.max(0, 100 - consumedPercent - reservedPercent),
  };
}

export function getCounterpartBalanceState({
  granted,
  remaining,
  projectedExcess,
  confirmedExcess,
}: {
  granted: number;
  remaining: number;
  projectedExcess: number;
  confirmedExcess: number;
}): CounterpartBalanceState {
  if (confirmedExcess > 0) return "exceeded";
  if (projectedExcess > 0) return "projected";
  if (granted > 0 && remaining <= 0) return "exhausted";
  if (granted > 0 && remaining / granted <= 0.2) return "attention";
  return "healthy";
}

export const COUNTERPART_BALANCE_STATE_LABELS: Record<
  CounterpartBalanceState,
  string
> = {
  healthy: "Saldo disponível",
  attention: "Saldo reduzido",
  exhausted: "Saldo esgotado",
  projected: "Excesso projetado",
  exceeded: "Excesso confirmado",
};

export function countCommittedCounterpartEvents(
  agreement: Pick<VenueAgreement, "id" | "no_show_consumes_allowance">,
  usages: VenueCounterpartUsage[],
) {
  return new Set(
    usages
      .filter(
        (usage) =>
          usage.agreement_id === agreement.id &&
          !usage.superseded_at &&
          (usage.usage_state === "consumido" ||
            usage.usage_state === "reservado" ||
            (agreement.no_show_consumes_allowance &&
              usage.usage_state === "no_show")),
      )
      .map((usage) => usage.event_id),
  ).size;
}

export function counterpartBalanceValues(
  agreement: VenueAgreement,
  balance?: VenueCounterpartBalanceRow,
) {
  return {
    granted: finiteNonNegative(
      Number(balance?.granted_quantity ?? agreement.granted_quantity),
    ),
    consumed: finiteNonNegative(Number(balance?.consumed_quantity || 0)),
    reserved: finiteNonNegative(Number(balance?.reserved_quantity || 0)),
    remaining: finiteNonNegative(
      Number(balance?.remaining_quantity ?? agreement.granted_quantity),
    ),
    projectedExcess: finiteNonNegative(
      Number(balance?.projected_excess_quantity || 0),
    ),
    confirmedExcess: finiteNonNegative(
      Number(balance?.confirmed_excess_quantity || 0),
    ),
  };
}
