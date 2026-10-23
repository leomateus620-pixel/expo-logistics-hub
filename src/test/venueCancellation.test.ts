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

import { DEFAULT_CANCEL_REASON as D } from "@/lib/venue-cancellation";
import { validateCancellationReason as v } from "@/lib/venue-cancellation";
import { it as it2, expect as ex2 } from "vitest";
it2("motivo padrão é CANCELADO PELO REQUERENTE e válido", () => {
  ex2(D).toBe("CANCELADO PELO REQUERENTE");
  ex2(v(D)).toBeNull();
});
