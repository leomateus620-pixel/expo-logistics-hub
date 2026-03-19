/**
 * WhatsApp helpers for transport communication
 */

/** Remove non-numeric chars, ensure DDI 55 for Brazil */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Already has country code (13+ digits or starts with non-55 prefix)
  if (digits.length >= 12) return digits;
  // Add Brazil DDI
  return `55${digits}`;
}

/** Check if phone is valid (10-15 digits after normalization) */
export function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const normalized = normalizePhone(phone);
  return normalized.length >= 12 && normalized.length <= 15;
}

/** Build WhatsApp deep link URL */
export function buildWhatsAppUrl(phone: string, message: string): string {
  const normalized = normalizePhone(phone);
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${normalized}?text=${encoded}`;
}

/** Build dynamic message based on transport context */
export function buildTripMessage(opts: {
  guestName: string;
  driverName: string;
  destino: string;
  titulo?: string;
}): string {
  const { guestName, driverName, destino, titulo } = opts;

  let destinoLabel = destino;
  if (titulo === 'Aeroporto') {
    destinoLabel = `Aeroporto${destino ? ` de ${destino}` : ''}`;
  } else if (titulo === 'Hotel') {
    destinoLabel = destino || 'Hotel';
  }

  return `Olá, ${guestName}. Aqui é ${driverName}, motorista responsável pelo seu transporte da Fenasoja Logística. Estou iniciando agora o deslocamento para o ${destinoLabel}. Qualquer necessidade, fico à disposição por aqui.`;
}
