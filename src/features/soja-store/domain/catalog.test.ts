import { describe, expect, it } from "vitest";
import { newVariant, productForm, productPayload, productSchema } from "./catalog";
import { dateLabel, decimalLabel, readCents, readDecimal, scaledDecimal } from "./purchases";

describe("cadastro de produtos Soja Store", () => {
  it("envia um SKU padrão e preserva ausência de valores opcionais", () => {
    const form = productForm();
    form.name = "Copo térmico";
    form.variants[0].sku = "  copo-01  ";
    const payload = productPayload(productSchema.parse(form));
    expect(payload).toMatchObject({
      name: "Copo térmico",
      status: "draft",
      collection_year: null,
      source_reference: null,
      variants: [{ sku: "COPO-01", attributes: {}, active: true }],
    });
  });

  it("aponta SKU duplicado e exige distinção entre variantes ativas", () => {
    const form = productForm();
    form.name = "Camiseta";
    form.variants = [{ ...newVariant(), sku: "cam-01" }, { ...newVariant(), sku: " CAM-01 ", label: "G" }];
    const result = productSchema.safeParse(form);
    expect(result.success).toBe(false);
    if (result.success === false) expect(result.error.issues.map((issue) => issue.path)).toEqual([
      ["variants", 0, "label"], ["variants", 1, "sku"],
    ]);
  });
});

describe("valores e quantidades da compra", () => {
  it("normaliza a vírgula e mantém seis casas de quantidade", () => {
    const quantity = readDecimal(" 123456789012,123456 ");
    expect(quantity).toBe("123456789012.123456");
    expect(scaledDecimal(quantity!)).toBe(123456789012123456n);
    expect(decimalLabel("0.100000")).toBe("0,1");
  });

  it("mantém datas civis e evita interpretar fórmulas ou números ambíguos", () => {
    expect(dateLabel("2026-11-12")).toBe("12/11/2026");
    expect(readCents("25,45")).toBe(2545);
    expect(readCents("  ")).toBe(0);
    expect(readDecimal("25+15")).toBeNull();
    expect(readCents("1.234,56")).toBeNull();
    expect(readCents("10,000")).toBeNull();
  });
});
