interface VenueEventsYearSelectorProps {
  years: string[];
  value: string;
  counts: Record<string, number>;
  onChange: (year: string) => void;
}

export function VenueEventsYearSelector({
  years,
  value,
  counts,
  onChange,
}: VenueEventsYearSelectorProps) {
  const index = Math.max(0, years.indexOf(value));

  return (
    <div
      className="venue-year-selector"
      role="group"
      aria-label="Recorte temporal dos eventos"
      style={
        {
          "--venue-year-count": years.length,
          "--venue-year-index": index,
        } as React.CSSProperties
      }
    >
      <span className="venue-year-selector__thumb" aria-hidden="true" />
      {years.map((year) => (
        <button
          key={year}
          type="button"
          data-active={year === value}
          aria-pressed={year === value}
          onClick={() => onChange(year)}
          className="venue-year-selector__option"
        >
          {year}
          <sup>{counts[year] ?? 0}</sup>
        </button>
      ))}
    </div>
  );
}
