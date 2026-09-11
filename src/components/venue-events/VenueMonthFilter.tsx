const MONTH_LABELS = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
] as const;

export const VENUE_MONTH_LABELS = MONTH_LABELS;

interface VenueMonthFilterProps {
  /** "all" ou o mês com dois dígitos ("01" … "12"). */
  value: string;
  counts: Record<string, number>;
  totalCount: number;
  onChange: (month: string) => void;
}

export function VenueMonthFilter({
  value,
  counts,
  totalCount,
  onChange,
}: VenueMonthFilterProps) {
  return (
    <div
      className="venue-month-filter"
      role="group"
      aria-label="Filtrar eventos por mês"
    >
      <button
        type="button"
        className="venue-month-filter__option"
        data-active={value === "all"}
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
      >
        TODOS
        <sup>{totalCount}</sup>
      </button>
      {MONTH_LABELS.map((label, index) => {
        const month = String(index + 1).padStart(2, "0");
        const count = counts[month] ?? 0;
        return (
          <button
            key={month}
            type="button"
            className="venue-month-filter__option"
            data-active={value === month}
            data-empty={count === 0}
            aria-pressed={value === month}
            aria-label={`${label} · ${count} ${count === 1 ? "evento" : "eventos"}`}
            onClick={() => onChange(month)}
          >
            {label}
            <sup>{count}</sup>
          </button>
        );
      })}
    </div>
  );
}
