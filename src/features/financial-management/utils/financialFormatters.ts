const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COMPACT_BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  compactDisplay: 'short',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const PERCENTAGE_FORMATTERS = Array.from({ length: 5 }, (_, maximumFractionDigits) => (
  new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })
));

const DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const EXCEL_1900_EPOCH_UTC = Date.UTC(1899, 11, 31);

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Normalizes monetary calculations to integer cents before returning a number.
 * Using the absolute value keeps midpoint rounding symmetrical for negatives.
 */
export function roundCurrency(value: number): number {
  const finiteValue = finiteOrZero(value);
  const sign = finiteValue < 0 ? -1 : 1;
  return sign * (Math.round((Math.abs(finiteValue) + Number.EPSILON) * 100) / 100);
}

export function formatBRL(value: number): string {
  return BRL_FORMATTER.format(roundCurrency(value));
}

export function formatCompactBRL(value: number): string {
  return COMPACT_BRL_FORMATTER.format(roundCurrency(value));
}

/**
 * Formats percentage points, not a 0..1 ratio. For example, 95.25 becomes 95,3%.
 */
export function formatPercentage(value: number, maximumFractionDigits = 1): string {
  const requestedDigits = Number.isFinite(maximumFractionDigits)
    ? Math.trunc(maximumFractionDigits)
    : 1;
  const safeDigits = Math.min(4, Math.max(0, requestedDigits));
  return PERCENTAGE_FORMATTERS[safeDigits].format(finiteOrZero(value) / 100);
}

/**
 * Converts a serial from Excel's 1900 date system without reproducing the
 * fictitious 29/02/1900. Modern workbook dates retain their exact calendar day.
 */
export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;

  const wholeDays = Math.floor(serial);
  const dayFraction = serial - wholeDays;
  const correctedWholeDays = wholeDays >= 60 ? wholeDays - 1 : wholeDays;
  const timestamp = EXCEL_1900_EPOCH_UTC
    + correctedWholeDays * MILLISECONDS_PER_DAY
    + Math.round(dayFraction * MILLISECONDS_PER_DAY);
  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateValue(value: string | number): Date | null {
  if (typeof value === 'number') return excelSerialToDate(value);

  const normalized = value.trim();
  if (!normalized) return null;

  const numericValue = Number(normalized.replace(',', '.'));
  if (Number.isFinite(numericValue)) return excelSerialToDate(numericValue);

  const isoDate = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!isoDate) return null;

  const [, year, month, day] = isoDate;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return date;
}

/**
 * Formats Excel serials and ISO dates. Non-date worksheet text is preserved,
 * while blanks and invalid numeric serials become an em dash.
 */
export function formatExcelSerialDate(value?: string | number | null): string {
  if (value === null || value === undefined) return '—';

  const parsed = parseDateValue(value);
  if (parsed) return DATE_FORMATTER.format(parsed);

  if (typeof value === 'string' && value.trim()) {
    const normalized = value.trim();
    const numericValue = Number(normalized.replace(',', '.'));
    return Number.isFinite(numericValue) ? '—' : normalized;
  }
  return '—';
}
