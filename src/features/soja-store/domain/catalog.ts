import { z } from "zod";

export const productStatus = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
} as const;

export type ProductStatus = keyof typeof productStatus;

export type ProductVariant = {
  id: string;
  sku: string;
  barcode: string | null;
  label: string | null;
  attributes: Record<string, string>;
  active: boolean;
  is_default: boolean;
};

export type Product = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  unit: string;
  status: ProductStatus;
  collection_year: number | null;
  source_reference: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  variants: ProductVariant[];
};

export const variantAttributes = [
  ["size", "Tamanho"],
  ["color", "Cor"],
  ["fit", "Modelagem"],
  ["finish", "Acabamento"],
  ["volume", "Volume"],
] as const;

export function normalizeSku(value: string) {
  return value.trim().toUpperCase();
}

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().trim().min(1, "Informe o SKU.").max(64, "Use até 64 caracteres."),
  barcode: z.string().trim().max(64, "Use até 64 caracteres."),
  label: z.string().trim().max(120, "Use até 120 caracteres."),
  attributes: z.record(z.string().trim().max(80, "Use até 80 caracteres.")),
  active: z.boolean(),
});

export const productSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome com pelo menos dois caracteres.").max(160, "Use até 160 caracteres."),
  category: z.string().trim().max(100, "Use até 100 caracteres."),
  description: z.string().trim().max(1600, "Use até 1.600 caracteres."),
  unit: z.string().trim().min(1, "Informe a unidade.").max(24, "Use até 24 caracteres."),
  collection_year: z.string().trim().refine(
    (value) => !value || /^(19\d{2}|20\d{2}|21\d{2}|2200)$/.test(value),
    "Informe um ano entre 1900 e 2200.",
  ),
  source_reference: z.string().trim().max(600, "Use até 600 caracteres."),
  status: z.enum(["draft", "active", "archived"]),
  variants: z.array(variantSchema).min(1, "Mantenha pelo menos um SKU.").max(100),
}).superRefine(({ variants, status }, ctx) => {
  const seen = new Set<string>();
  const activeCount = variants.filter((item) => item.active).length;
  variants.forEach((variant, index) => {
    const sku = normalizeSku(variant.sku);
    if (sku && seen.has(sku)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variants", index, "sku"],
        message: "Este SKU já aparece no produto.",
      });
    }
    seen.add(sku);
    if (activeCount > 1 && variant.active
      && !variant.label && !Object.values(variant.attributes).some(Boolean)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variants", index, "label"],
        message: "Informe o nome ou um atributo para distinguir esta variante.",
      });
    }
  });
  if (status === "active" && !variants.some((variant) => variant.active)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message: "Para ativar o produto, mantenha pelo menos um SKU ativo.",
    });
  }
});

export type ProductForm = z.infer<typeof productSchema>;

export function newVariant(): ProductForm["variants"][number] {
  return { sku: "", barcode: "", label: "", attributes: {}, active: true };
}

export function productForm(product?: Product): ProductForm {
  return {
    name: product?.name ?? "",
    category: product?.category ?? "",
    description: product?.description ?? "",
    unit: product?.unit ?? "un",
    collection_year: product?.collection_year?.toString() ?? "",
    source_reference: product?.source_reference ?? "",
    status: product?.status ?? "draft",
    variants: product?.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      barcode: variant.barcode ?? "",
      label: variant.label ?? "",
      attributes: variant.attributes,
      active: variant.active,
    })) ?? [newVariant()],
  };
}

export function productPayload(values: ProductForm, id?: string) {
  return {
    ...values,
    ...(id ? { id } : {}),
    category: values.category || null,
    description: values.description || null,
    collection_year: values.collection_year ? Number(values.collection_year) : null,
    source_reference: values.source_reference || null,
    variants: values.variants.map((variant) => ({
      ...variant,
      sku: normalizeSku(variant.sku),
      barcode: variant.barcode || null,
      label: variant.label || null,
      attributes: Object.fromEntries(Object.entries(variant.attributes).filter(([, value]) => value)),
    })),
  };
}
