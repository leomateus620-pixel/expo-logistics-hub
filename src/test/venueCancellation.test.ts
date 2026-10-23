import { describe, expect, it } from "vitest";
import { canOfferCancellation, validateCancellationReason } from "@/lib/venue-cancellation";

describe("cancelamento de evento do Restaurante e Arena", () => {
  it("exige motivo com pelo menos 8 caracteres", () => {
    expect(validateCancellationReason("")).not.toBeNull();
    expect(validateCancellationReason("  CURTO ")).not.toBeNull();
    expect(validateCancellationReason("CHUVA FORTE")).toBeNull();
  });
  it("não oferece cancelamento para concluído, cancelado ou sem permissão", () => {
    expect(canOfferCancellation("concluido", true)).toBe(false);
    expect(canOfferCancellation("cancelado", true)).toBe(false);
    expect(canOfferCancellation("solicitado", false)).toBe(false);
    expect(canOfferCancellation("solicitado", true)).toBe(true);
  });
});
