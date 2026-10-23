/** Regras de cancelamento de evento do Restaurante e Arena (espelham `venue_transition_event`). */
export const VENUE_CANCEL_REASON_MIN = 8;

const NON_CANCELLABLE = new Set(["concluido", "cancelado"]);

export function canOfferCancellation(status: string | null | undefined, canCancel: boolean): boolean {
  if (!canCancel || !status) return false;
  return !NON_CANCELLABLE.has(status);
}

export function validateCancellationReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return "Informe o motivo do cancelamento.";
  if (trimmed.length < VENUE_CANCEL_REASON_MIN)
    return `O motivo precisa ter pelo menos ${VENUE_CANCEL_REASON_MIN} caracteres.`;
  return null;
}
