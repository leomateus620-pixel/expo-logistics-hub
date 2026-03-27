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

/** Extract time HH:MM from ISO string without timezone conversion */
export function rawTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const t = iso.replace('T', ' ').slice(11, 16);
  return t || '-';
}

/** Extract date DD/MM from ISO string without timezone conversion */
export function rawDateShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

/** Extract weekday from ISO date without timezone conversion */
export function rawWeekday(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString('pt-BR', { weekday: 'short' });
}

/** Extract day from ISO date without timezone conversion */
export function rawDay(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(8, 10);
}

/** Extract month short from ISO date without timezone conversion */
export function rawMonthShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m] = iso.slice(0, 10).split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'short' });
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

/** Get estimated round-trip km for a transport based on title/city */
export function getRoundTripKm(titulo: string | null | undefined, vooCidade?: string | null): number | null {
  if (!titulo) return null;
  const key = titulo === 'Aeroporto' && vooCidade ? `Aeroporto_${vooCidade}` : titulo;
  const km = KNOWN_ROUNDTRIP_KM[key];
  if (km === undefined || km === 0) return null;
  return km;
}
