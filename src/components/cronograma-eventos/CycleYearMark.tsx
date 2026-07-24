import { cn } from '@/lib/utils';

export function CycleYearMark({
  year,
  className,
}: {
  year: number;
  className?: string;
}) {
  if (year !== 2028) return <>{year}</>;

  return (
    <span className={cn('cronograma-cycle-year-mark', className)}>
      <span className="cronograma-cycle-year-glyphs" aria-hidden="true">
        <span className="cronograma-cycle-year-digit">2</span>
        <span className="cronograma-cycle-soy-glyph">
          <span className="cronograma-cycle-soy-kernel" />
        </span>
        <span className="cronograma-cycle-year-digit">2</span>
        <span className="cronograma-cycle-year-digit">8</span>
      </span>
      <span className="sr-only">2028</span>
    </span>
  );
}
