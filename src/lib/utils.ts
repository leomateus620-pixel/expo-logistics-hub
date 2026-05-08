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

/** Canonical one-way driving time in minutes from Santa Rosa to common destinations.
 *  Based on real Google Maps Routes data. Used as fallback when a transport's
 *  saved duracao_estimada_min is missing or clearly invalid. */
export const KNOWN_ONE_WAY_MIN: Record<string, number> = {
  'Aeroporto_Passo Fundo': 240,
  'Aeroporto_Chapecó': 240,
  'Aeroporto_Santo Ângelo': 80,
  'Aeroporto_Porto Alegre': 390,
  'Parque': 15,
  'Hotel': 10,
  'Centro': 10,
  'Escolta Policial': 30,
  'Outros': 30,
};

/** Canonical one-way times by destination CITY name (custom "Outros" trips). */
const KNOWN_CITY_ONE_WAY_MIN: Record<string, number> = {
  'Passo Fundo': 240,
  'Chapecó': 240,
  'Santo Ângelo': 80,
  'Porto Alegre': 390,
};

/** Default round-trip duration (in minutes) per transport type, used as a last resort. */
const DEFAULT_TOTAL_MIN: Record<string, number> = {
  'Aeroporto': 120, 'Hotel': 45, 'Parque': 30, 'Centro': 40, 'Escolta Policial': 90, 'Outros': 60,
};

/** Average safe driving speed (km/h) used to derive duration from a saved distance. */
const SAFE_AVG_SPEED_KMH = 80;
/** Maximum plausible average speed used to flag impossible return times. */
const MAX_PLAUSIBLE_SPEED_KMH = 90;

function cityOneWayFromDestino(destino?: string | null): number | null {
  if (!destino) return null;
  const lower = destino.toLowerCase();
  for (const [city, mins] of Object.entries(KNOWN_CITY_ONE_WAY_MIN)) {
    if (lower.includes(city.toLowerCase())) return mins;
  }
  return null;
}

/** Get the effective ONE-WAY driving time in minutes.
 *  Priority: airport canonical → city canonical → derived from saved distance →
 *  saved/2 → type default. Always returns a plausible value for the trip length. */
export function getEffectiveOneWayMin(
  savedTotalMin: number | null | undefined,
  titulo: string | null | undefined,
  vooCidade?: string | null,
  destino?: string | null,
  distanciaKmRoundTrip?: number | null,
): number {
  const key = titulo === 'Aeroporto' && vooCidade ? `Aeroporto_${vooCidade}` : (titulo || 'Outros');
  const known = KNOWN_ONE_WAY_MIN[key];
  const saved = typeof savedTotalMin === 'number' && savedTotalMin > 0 ? savedTotalMin : null;

  if (titulo === 'Aeroporto') {
    if (known) return known;
    if (saved && saved >= 60) return Math.round(saved / 2);
    return 120;
  }

  // Custom destination — try city table first
  const cityMin = cityOneWayFromDestino(destino);
  if (cityMin) return cityMin;

  // Derive from saved round-trip distance (>30 km means it's not local)
  if (typeof distanciaKmRoundTrip === 'number' && distanciaKmRoundTrip > 30) {
    return Math.max(20, Math.round((distanciaKmRoundTrip / 2) / SAFE_AVG_SPEED_KMH * 60));
  }

  if (saved && saved > 10) return Math.max(10, Math.round(saved / 2));
  return known ?? 30;
}

/** Get the effective ROUND-TRIP duration in minutes.
 *  Rejects a saved value that is implausibly small for the saved distance. */
export function getEffectiveTotalMin(
  savedTotalMin: number | null | undefined,
  titulo: string | null | undefined,
  vooCidade?: string | null,
  destino?: string | null,
  distanciaKmRoundTrip?: number | null,
): number {
  const saved = typeof savedTotalMin === 'number' && savedTotalMin > 0 ? savedTotalMin : null;
  const oneWay = getEffectiveOneWayMin(savedTotalMin, titulo, vooCidade, destino, distanciaKmRoundTrip);

  // Saved must be plausible for the distance: >= distance / MAX_SPEED * 60
  if (saved && saved > 10) {
    if (typeof distanciaKmRoundTrip === 'number' && distanciaKmRoundTrip > 30) {
      const minPlausible = (distanciaKmRoundTrip / MAX_PLAUSIBLE_SPEED_KMH) * 60;
      if (saved >= minPlausible) return saved;
      // Saved too short for distance → ignore, use derived
      return oneWay * 2;
    }
    return saved;
  }

  const key = titulo === 'Aeroporto' && vooCidade ? `Aeroporto_${vooCidade}` : (titulo || 'Outros');
  if (KNOWN_ONE_WAY_MIN[key] || cityOneWayFromDestino(destino) || (typeof distanciaKmRoundTrip === 'number' && distanciaKmRoundTrip > 30)) {
    return oneWay * 2;
  }
  return DEFAULT_TOTAL_MIN[titulo || 'Outros'] || 60;
}

/** Returns false if the return time is impossible given the round-trip distance. */
export function isReturnTimePlausible(
  departureIso: string | null | undefined,
  returnIso: string | Date | null | undefined,
  distanciaKmRoundTrip?: number | null,
): boolean {
  if (!departureIso || !returnIso) return true;
  const dep = new Date(departureIso).getTime();
  const ret = returnIso instanceof Date ? returnIso.getTime() : new Date(returnIso).getTime();
  if (isNaN(dep) || isNaN(ret)) return true;
  if (ret <= dep) return false;
  if (typeof distanciaKmRoundTrip !== 'number' || distanciaKmRoundTrip <= 30) return true;
  const elapsedMin = (ret - dep) / 60000;
  const minPlausible = (distanciaKmRoundTrip / MAX_PLAUSIBLE_SPEED_KMH) * 60;
  return elapsedMin >= minPlausible;
}

