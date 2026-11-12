export const purchaseStates = {
  ordered: "Encomendado",
  partially_received: "Recebido em parte",
  received: "Recebido",
} as const;

export type PurchaseStatus = keyof typeof purchaseStates;
export type PurchaseSummary = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  location_id: string;
  location_name: string;
  ordered_on: string;
  expected_on: string | null;
  reference: string | null;
  status: PurchaseStatus;
  freight_cents: number | null;
  charges_cents: number | null;
  total_cents: number | null;
  version: number;
};

export type PurchaseLine = {
  id: string;
  variant_id: string;
  product_name: string;
  variant_label: string | null;
  sku: string;
  unit: string;
  quantity: string;
  unit_cost: string | null;
  line_total_cents: number | null;
  received_quantity: string;
  pending_quantity: string;
};

export type PurchaseReceipt = {
  id: string;
  received_on: string;
  reference: string | null;
  recorded_at: string;
  lines: { purchase_line_id: string; quantity: string }[];
};

export type Purchase = PurchaseSummary & { lines: PurchaseLine[]; receipts: PurchaseReceipt[] };
export type NamedOption = { id: string; name: string };
export type PurchaseOptions = {
  suppliers: NamedOption[];
  locations: (NamedOption & { kind: string })[];
  variants: { id: string; product_id: string; product_name: string; sku: string; label: string | null; unit: string }[];
};

const brl = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });
export function moneyLabel(cents: number) {
  return brl.format(cents / 100);
}

export function decimalLabel(value: string) {
  const [whole, fraction] = value.split(".");
  const digits = fraction?.replace(/0+$/, "");
  return digits ? `${whole},${digits}` : whole;
}

export function dateLabel(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}

export function readDecimal(input: string, precision = 6): string | null {
  const value = input.trim().replace(",", ".");
  if (!new RegExp(`^\\d{1,12}(?:\\.\\d{1,${precision}})?$`).test(value)) return null;
  return value;
}

export function scaledDecimal(value: string, precision = 6) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(precision, "0"));
}

export function readCents(input: string) {
  if (!input.trim()) return 0;
  const value = readDecimal(input, 2);
  return value === null ? null : Number(scaledDecimal(value, 2));
}
