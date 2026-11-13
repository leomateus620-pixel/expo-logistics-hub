import type { StoreScope } from "../../api/store";

export const paymentMethodLabels = { cash: "Dinheiro", pix: "Pix", card: "Cartão" } as const;
export type PaymentMethod = keyof typeof paymentMethodLabels;
export type PosRule = {
  id: string;
  version: number;
  approved_by: string;
  approval_reference: string;
  active: boolean;
  methods: PaymentMethod[];
};
export type PosConfiguration = {
  rule: PosRule | null;
  points: { id: string; name: string }[];
};
export type CashSession = {
  id: string;
  location_id: string;
  location_name: string;
  operator_id: string;
  status: "open" | "closed";
  version: number;
  opened_at: string;
  closed_at: string | null;
  opening_cents: number;
  expected_cents: number;
  counted_cents: number | null;
  difference_cents: number | null;
};
export type CashMovement = {
  id: string;
  kind: "supply" | "withdrawal" | "receipt" | "refund";
  amount_cents: number;
  reason: string | null;
  recorded_at: string;
};
export type PosPageContext = {
  scope: StoreScope;
  queryKey: readonly unknown[];
  canManage: boolean;
};
