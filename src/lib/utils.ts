import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Get the current UTC offset for São Paulo (handles DST automatically) */
function getSPOffset(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(now);
  const tzPart = parts.find(p => p.type === 'timeZoneName');
  // tzPart.value is like "GMT-3" or "GMT-2"
  const match = tzPart?.value?.match(/GMT([+-]?\d+)/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const sign = hours <= 0 ? '-' : '+';
    return `${sign}${String(Math.abs(hours)).padStart(2, '0')}:00`;
  }
  return '-03:00'; // fallback
}

/** Convert an ISO/UTC timestamp to datetime-local format (YYYY-MM-DDTHH:MM) in São Paulo timezone */
export function utcToSPLocal(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const raw = d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const [date, time] = raw.split(' ');
  return `${date}T${time?.slice(0, 5) || '00:00'}`;
}

/** Get current date/time in São Paulo timezone as ISO string */
export function nowSP(): string {
  const raw = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return raw.replace(' ', 'T') + getSPOffset();
}

/** Get current date/time in São Paulo timezone formatted for datetime-local inputs (YYYY-MM-DDTHH:MM) */
export function nowSPLocal(): string {
  const parts = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).split(' ');
  return `${parts[0]}T${parts[1]?.slice(0, 5) || '00:00'}`;
}

/** Get today's date in São Paulo timezone (YYYY-MM-DD) */
export function todaySP(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

/** Ensure a datetime-local value has SP timezone offset */
export function ensureSPOffset(datetimeLocal: string): string {
  if (!datetimeLocal) return datetimeLocal;
  // Already has offset
  if (/[+-]\d{2}:\d{2}$/.test(datetimeLocal)) return datetimeLocal;
  return datetimeLocal + getSPOffset();
}

/** Extract time HH:MM from ISO string, converted to São Paulo timezone */
export function rawTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

/** Extract date DD/MM from ISO string, converted to São Paulo timezone */
export function rawDateShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
}

/** Extract weekday from ISO date, converted to São Paulo timezone */
export function rawWeekday(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' });
}

/** Extract day from ISO date, converted to São Paulo timezone */
export function rawDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' });
}

/** Extract month short from ISO date, converted to São Paulo timezone */
export function rawMonthShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' });
}

/** Convert ISO timestamp to YYYY-MM-DD in São Paulo timezone */
export function getDateSP(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Combine the date (in SP) of a base ISO timestamp with a "HH:MM" string,
 *  returning an ISO with the SP offset preserved. */
export function mergeDateAndTimeSP(baseIso: string, hhmm: string): string {
  if (!baseIso || !hhmm) return baseIso;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return baseIso;
  const hh = m[1].padStart(2, '0');
  const mm = m[2];
  const dateKey = getDateSP(baseIso); // YYYY-MM-DD in SP
  return `${dateKey}T${hh}:${mm}:00${getSPOffset()}`;
}

/** Parse a YYYY-MM-DD date key into a Date without UTC midnight shift.
 *  Uses noon local time to avoid DST edge cases. */
export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** Known round-trip distances in km from Santa Rosa to common destinations */
const KNOWN_ROUNDTRIP_KM: Record<string, number> = {
  'Aeroporto_Chapecó': 630,
  'Aeroporto_Santo Ângelo': 143,
  'Aeroporto_Passo Fundo': 560,
  'Aeroporto_Porto Alegre': 1024,
  'Parque': 6,
  'Hotel': 4,
  'Centro': 4,
  'Escolta Policial': 4,
};

/** Known round-trip distances by destination city name */
const KNOWN_DESTINATION_KM: Record<string, number> = {
  'Passo Fundo': 560,
  'Chapecó': 630,
  'Santo Ângelo': 143,
  'Porto Alegre': 1024,
};

/** Get estimated round-trip km for a transport based on title/city/destino */
export function getRoundTripKm(titulo: string | null | undefined, vooCidade?: string | null, destino?: string | null): number | null {
  if (!titulo) return null;
  const key = titulo === 'Aeroporto' && vooCidade ? `Aeroporto_${vooCidade}` : titulo;
  const km = KNOWN_ROUNDTRIP_KM[key];
  if (km !== undefined && km > 10) return km;
  // Fallback: check destino against known cities
  if (destino) {
    for (const [city, cityKm] of Object.entries(KNOWN_DESTINATION_KM)) {
      if (destino.includes(city)) return cityKm;
    }
  }
  // Return the title-based value if it exists (even small ones like 4-6 km)
  if (km !== undefined && km > 0) return km;
  return null;
}

/** Prefer known route values when a saved/API km is clearly a generic local placeholder */
export function getEffectiveEstimatedKm(
  savedKm: number | null | undefined,
  titulo: string | null | undefined,
  vooCidade?: string | null,
  destino?: string | null
): number | null {
  const normalizedSavedKm = typeof savedKm === 'number' && savedKm > 0 ? savedKm : null;
  const knownKm = getRoundTripKm(titulo, vooCidade, destino);

  if (knownKm != null && (normalizedSavedKm == null || normalizedSavedKm <= 10)) {
    return knownKm;
  }

  return normalizedSavedKm ?? knownKm;
}
