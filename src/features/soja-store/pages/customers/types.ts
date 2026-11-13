import type { StoreScope } from "../../api/store";

export const customersPath = "/comissoes/soja-store/clientes";
export const customerKinds = { individual: "Pessoa física", company: "Pessoa jurídica" } as const;
export const customerStatuses = { active: "Ativo", archived: "Arquivado" } as const;

export type Customer = {
  id: string;
  kind: keyof typeof customerKinds;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: keyof typeof customerStatuses;
  communication_consent: boolean;
  version: number;
};

export type Interest = {
  id: string;
  customer_id: string;
  variant_id: string;
  product_name: string;
  sku: string;
  variant_label: string | null;
  quantity: string | null;
  status: "open" | "closed";
  notes: string | null;
  version: number;
};

export type CustomerDetail = Customer & { interests: Interest[] };

export type CustomerPageContext = {
  scope: StoreScope;
  queryKey: readonly unknown[];
  canManage: boolean;
};
