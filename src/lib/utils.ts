import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Get current date/time in São Paulo timezone as ISO string */
export function nowSP(): string {
  const raw = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return raw.replace(' ', 'T') + '-03:00';
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
