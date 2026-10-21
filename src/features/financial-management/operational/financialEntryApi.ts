import { supabase } from "@/integrations/supabase/client";
import type { FundingTypeKey } from "./financialOperationalApi";

export type ReferenceKind =
  | "counterparty"
  | "funding_source"
  | "payee"
  | "expense_category";
export interface FinancialReference {
  id: string;
  name: string;
  active: boolean;
  version: number;
  funding_type?: FundingTypeKey;
}
export type PaymentMethod =
  | "pix"
  | "boleto"
  | "transferencia"
  | "dinheiro"
  | "cartao"
  | "outro";
export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  pix: "Pix",
  boleto: "Boleto",
  transferencia: "Transferência",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  outro: "Outro",
};
export interface PaymentInstallment {
  id: string;
  sequence?: number;
  due_date: string;
  amount_cents: number;
  method: PaymentMethod | null;
  settled_cents?: number;
}
export interface PaymentPlanInput {
  condition: "avista" | "parcelado";
  default_method: PaymentMethod | null;
  expected_version: number | null;
  installments: PaymentInstallment[];
}
export interface PaymentPlan
  extends Omit<PaymentPlanInput, "expected_version"> {
  id: string;
  version: number;
  total_cents: number;
  active: boolean;
  obligation_id: string | null;
  settled_cents: number;
  unassigned_settled_cents: number;
  movements: Array<{
    id: string;
    allocation_id: string;
    kind: string;
    occurred_on: string;
    method: string | null;
    amount_cents: number;
    assigned?: boolean;
    reversed: boolean;
  }>;
}
export interface FinancialBatchItem {
  draft_id: string;
  expected_version: number | null;
  payload: Record<string, unknown>;
  reason?: string;
  create_references?: Partial<Record<ReferenceKind, string>>;
}
export class FinancialEntryError extends Error {
  constructor(
    message: string,
    public draftId?: string,
    public uncertain = false,
    public code?: string,
  ) {
    super(message);
  }
}
const messages: Array<[RegExp, string]> = [
  [
    /FINANCIAL_FORBIDDEN|permission denied/,
    "Seu acesso não permite esta operação financeira.",
  ],
  [/FINANCIAL_EDITION_READ_ONLY/, "Esta edição é histórica e somente leitura."],
  [
    /FINANCIAL_IDEMPOTENCY_CONFLICT/,
    "Esta tentativa já foi confirmada com outro conteúdo. Consulte o resultado antes de prosseguir.",
  ],
  [
    /FINANCIAL_.*CONFLICT/,
    "O registro ou cronograma mudou. Consulte a versão atual; seu preenchimento foi preservado.",
  ],
  [
    /FINANCIAL_INSTALLMENT_SUM_MISMATCH/,
    "A soma das parcelas deve ser igual ao valor total aplicável.",
  ],
  [
    /FINANCIAL_INSTALLMENT_SETTLED/,
    "Uma parcela com liquidação não pode ter valor, data ou posição alterados.",
  ],
  [
    /FINANCIAL_.*BELOW_SETTLED/,
    "O total não pode ser menor que o valor já liquidado.",
  ],
  [
    /FINANCIAL_.*OVER_SETTLEMENT|FINANCIAL_.*EXCEEDS_NET/,
    "O valor ultrapassa o saldo permitido. Confira as liquidações e os estornos.",
  ],
  [
    /FINANCIAL_INSTALLMENT_DETAILS_REQUIRED/,
    "Distribua o movimento nas parcelas correspondentes antes de prosseguir.",
  ],
  [
    /FINANCIAL_PLAN_REQUIRES_REVISION/,
    "Atualize o cronograma junto com o valor aplicável.",
  ],
  [
    /FINANCIAL_REFERENCE|financial_references_active_name|financial_categories_active_normalized_name/,
    "Confira a opção selecionada. Ela pode ter sido arquivada ou criada por outra pessoa.",
  ],
  [
    /FINANCIAL_HAS_SETTLEMENT/,
    "Há liquidação registrada. Reconcile os movimentos antes de cancelar.",
  ],
  [/FINANCIAL_DATE_INVALID/, "Confira as datas informadas."],
  [
    /FINANCIAL_.*INVALID|FINANCIAL_.*REQUIRED|FINANCIAL_.*MISMATCH/,
    "Confira os campos e o cronograma deste lançamento.",
  ],
];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
export async function financialEntryRpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  let response;
  try {
    response = await db.rpc(name, args);
  } catch {
    throw new FinancialEntryError(
      "Resposta não confirmada. Verifique ou repita a mesma tentativa antes de editar o lote.",
      undefined,
      true,
    );
  }
  const { data, error } = response;
  if (error) {
    let detail: { draft_id?: string } = {};
    try {
      detail = JSON.parse(error.details || "{}");
    } catch {
      /* Non-JSON PostgREST detail. */
    }
    const uncertain =
      /network|fetch|timeout|gateway/i.test(error.message || "") || !error.code;
    throw new FinancialEntryError(
      uncertain
        ? "Resposta não confirmada. Repita a mesma tentativa para recuperar o resultado."
        : messages.find(([p]) => p.test(error.message || ""))?.[1] ||
          "Não foi possível concluir a operação financeira.",
      detail.draft_id,
      uncertain,
      error.code,
    );
  }
  return data as T;
}
export const listFinancialReferences = (
  org: string,
  kind: ReferenceKind,
  q = "",
  archived = false,
) =>
  kind === "expense_category"
    ? financialEntryRpc<FinancialReference[]>("financial_list_categories", {
        _org_id: org,
        _domain: "despesa",
        _include_archived: archived,
      })
    : financialEntryRpc<FinancialReference[]>("financial_list_references", {
        _org_id: org,
        _kind: kind,
        _query: q,
        _include_archived: archived,
      });
export const createFinancialReference = (
  org: string,
  kind: ReferenceKind,
  name: string,
  funding: FundingTypeKey | null,
  request: string,
) =>
  financialEntryRpc<FinancialReference>("financial_create_reference", {
    _org_id: org,
    _kind: kind,
    _name: name,
    _funding_type: funding,
    _request_id: request,
  });
export const updateFinancialReference = (
  org: string,
  value: FinancialReference,
  name: string,
  active: boolean,
  request: string,
) =>
  financialEntryRpc<FinancialReference>("financial_update_reference", {
    _org_id: org,
    _id: value.id,
    _name: name,
    _active: active,
    _expected_version: value.version,
    _request_id: request,
  });
export const fetchPaymentPlan = (
  org: string,
  edition: string,
  type: "receita" | "despesa",
  id: string,
) =>
  financialEntryRpc<PaymentPlan | null>("financial_payment_plan", {
    _org_id: org,
    _edition_id: edition,
    _source_type: type,
    _source_id: id,
  });
export const saveFinancialBatch = (
  org: string,
  edition: string,
  kind: "revenue" | "expense",
  items: FinancialBatchItem[],
  request: string,
) =>
  financialEntryRpc<{
    count: number;
    items: Array<{ draft_id: string; record: { id: string } }>;
  }>("financial_save_batch", {
    _org_id: org,
    _edition_id: edition,
    _kind: kind,
    _items: items,
    _request_id: request,
  });
export interface ScheduleMonth {
  month: string | null;
  source_type: "receita" | "despesa";
  scheduled_cents: number;
  executed_cents: number;
  cash_cents: number;
}
export const fetchFinancialSchedule = (org: string, edition: string) =>
  financialEntryRpc<{ months: ScheduleMonth[]; unscheduled_sources: number }>(
    "financial_schedule_summary",
    { _org_id: org, _edition_id: edition },
  );

export function civilToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)?.value)
    .join("-");
}
export function civilDateInMonth(month: string, day: number) {
  if (
    !/^\d{4}-\d{2}$/.test(month) ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 31
  )
    throw new Error("Informe um mês e um dia válidos.");
  const [y, m] = month.split("-").map(Number);
  if (m < 1 || m > 12 || y < 1900 || y > 2200)
    throw new Error("Informe um mês válido.");
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
/** Remainder is kept on the final installment. Original day is retained after short months. */
export function generateInstallments(
  total: number,
  count: number,
  first: string,
  method: PaymentMethod | null,
  previous: PaymentInstallment[] = [],
): PaymentInstallment[] {
  if (
    !Number.isSafeInteger(total) ||
    total < 1 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 360 ||
    count > total
  )
    throw new Error(
      "A quantidade precisa gerar parcelas de pelo menos R$ 0,01.",
    );
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(first) ||
    civilDateInMonth(first.slice(0, 7), Number(first.slice(8))) !== first
  )
    throw new Error("Informe o primeiro vencimento válido.");
  if (previous.slice(count).some((i) => (i.settled_cents || 0) > 0))
    throw new Error("Não é possível remover uma parcela liquidada.");
  const locked = previous
    .slice(0, count)
    .filter((i) => (i.settled_cents || 0) > 0);
  const remaining = total - locked.reduce((s, i) => s + i.amount_cents, 0),
    free = count - locked.length;
  if ((free === 0 && remaining !== 0) || (free > 0 && remaining < free))
    throw new Error("O total precisa preservar as parcelas liquidadas.");
  const [year, month, day] = first.split("-").map(Number);
  let emitted = 0;
  return Array.from({ length: count }, (_, n) => {
    if ((previous[n]?.settled_cents || 0) > 0)
      return { ...previous[n], sequence: n + 1 };
    const offset = month - 1 + n,
      ym = `${year + Math.floor(offset / 12)}-${String((offset % 12) + 1).padStart(2, "0")}`;
    emitted++;
    return {
      id: previous[n]?.id || crypto.randomUUID(),
      sequence: n + 1,
      due_date: civilDateInMonth(ym, day),
      amount_cents:
        emitted === free
          ? remaining - Math.floor(remaining / free) * (free - 1)
          : Math.floor(remaining / free),
      method,
      settled_cents: 0,
    };
  });
}
